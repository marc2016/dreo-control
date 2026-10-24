/*
 * Created with @iobroker/create-adapter v3.1.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { DreoAuthenticationError, DreoClient, DreoFan, DreoHeater } from 'dreo-client';
import type { DreoDevice, DreoRegion, TemperatureUnit } from 'dreo-client';
import { getStateDefinitions, type StateDefinition } from './lib/state-definitions';

const MIN_REFRESH_INTERVAL_S = 60;
const DEFAULT_REFRESH_INTERVAL_S = 300;
const INITIAL_RECONNECT_DELAY_MS = 5 * 60 * 1000;
const MAX_RECONNECT_DELAY_MS = 60 * 60 * 1000;
const MANUAL_REFRESH_ID = 'commands.manualRefresh';

/** Objects and state definitions created for one Dreo device */
interface DeviceContext {
    device: DreoDevice;
    objectId: string;
    states: Map<string, StateDefinition>;
}

class DreoControl extends utils.Adapter {
    private client: DreoClient | undefined;
    private temperatureUnit: TemperatureUnit = 'celsius';
    private cloudConnected = false;
    private refreshTimer: ioBroker.Interval | undefined;
    private reconnectTimer: ioBroker.Timeout | undefined;
    private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    /** Device contexts by device object ID */
    private readonly devices = new Map<string, DeviceContext>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'dreo-control',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        await this.setConnected(false, true);

        if (!this.config.email || !this.config.password) {
            this.log.warn('Please configure e-mail and password of your Dreo account in the instance settings');
            return;
        }

        const region: DreoRegion = this.config.region === 'us' ? 'us' : 'eu';
        this.temperatureUnit = region === 'us' ? 'fahrenheit' : 'celsius';

        let refreshInterval = Number(this.config.refreshInterval) || DEFAULT_REFRESH_INTERVAL_S;
        if (refreshInterval < MIN_REFRESH_INTERVAL_S) {
            this.log.warn(
                `Refresh interval of ${refreshInterval}s is too short, using ${MIN_REFRESH_INTERVAL_S}s instead`,
            );
            refreshInterval = MIN_REFRESH_INTERVAL_S;
        }

        // Without WebSocket the client must not open a socket for commands either
        this.client = new DreoClient({ region, autoReconnect: this.config.useWebSocket });
        this.client.on('deviceUpdate', (device: DreoDevice) => {
            this.log.debug(`Received update for ${device.name} (${device.sn})`);
            void this.updateDeviceStates(device);
        });
        this.client.on('error', (error: Error) => {
            this.log.warn(`Dreo cloud connection error: ${error.message}`);
        });

        this.subscribeStates('*');

        await this.connect();

        this.refreshTimer = this.setInterval(() => void this.refreshAll(), refreshInterval * 1000);
    }

    /**
     * Logs in, discovers all devices and starts real-time monitoring.
     * Schedules a new attempt with increasing delay on failure.
     */
    private async connect(): Promise<void> {
        if (!this.client) {
            return;
        }
        try {
            await this.client.login(this.config.email, this.config.password);
            this.log.info(`Logged in to Dreo cloud (region ${this.client.getRegion()})`);

            const devices = await this.client.getDevices(true);
            this.log.info(`Found ${devices.length} Dreo device(s)`);
            for (const device of devices) {
                await this.createDeviceObjects(device);
                await this.updateDeviceStates(device);
            }

            if (this.config.useWebSocket) {
                await this.client.startMonitoring();
            }

            this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
            await this.setConnected(true);
        } catch (error) {
            await this.handleConnectionError(error);
        }
    }

    /**
     * Marks the connection as lost and schedules a reconnect with backoff.
     *
     * @param error - Error thrown by the Dreo client
     */
    private async handleConnectionError(error: unknown): Promise<void> {
        await this.setConnected(false);
        this.client?.stopMonitoring();

        const delayMinutes = Math.round(this.reconnectDelayMs / 60000);
        if (error instanceof DreoAuthenticationError) {
            this.log.error(
                `Login to Dreo cloud failed: ${error.message}. Please verify e-mail, password and region. Retrying in ${delayMinutes} min`,
            );
        } else {
            this.log.warn(
                `Connection to Dreo cloud failed: ${(error as Error).message}. Retrying in ${delayMinutes} min`,
            );
        }
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = this.setTimeout(() => {
            this.reconnectTimer = undefined;
            void this.connect();
        }, this.reconnectDelayMs);
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    }

    /**
     * Polls the current state of all devices from the cloud.
     */
    private async refreshAll(): Promise<void> {
        if (!this.client || !this.cloudConnected) {
            return;
        }
        try {
            const devices = await this.client.getDevices(true);
            for (const device of devices) {
                if (!this.devices.has(this.deviceObjectId(device))) {
                    await this.createDeviceObjects(device);
                }
                await this.updateDeviceStates(device);
            }
        } catch (error) {
            await this.handleConnectionError(error);
        }
    }

    private deviceObjectId(device: DreoDevice): string {
        return device.sn.replace(this.FORBIDDEN_CHARS, '_');
    }

    /**
     * Creates or updates the device object, its channels and states.
     *
     * @param device - Dreo device
     */
    private async createDeviceObjects(device: DreoDevice): Promise<void> {
        if (!device.sn) {
            this.log.warn(`Ignoring device ${device.name} (${device.model}) without serial number`);
            return;
        }
        if (!(device instanceof DreoHeater) && !(device instanceof DreoFan)) {
            this.log.info(
                `Device ${device.name} has unsupported model ${device.model}, only common states are created. Please report this model.`,
            );
        }

        const objectId = this.deviceObjectId(device);
        await this.extendObjectAsync(objectId, {
            type: 'device',
            common: { name: device.name },
            native: { sn: device.sn, model: device.model },
        });
        await this.extendObjectAsync(`${objectId}.info`, {
            type: 'channel',
            common: { name: 'Information' },
            native: {},
        });

        const states = new Map<string, StateDefinition>();
        for (const definition of getStateDefinitions(device, this.temperatureUnit)) {
            await this.extendObjectAsync(`${objectId}.${definition.id}`, {
                type: 'state',
                common: definition.common,
                native: {},
            });
            states.set(definition.id, definition);
        }
        this.devices.set(objectId, { device, objectId, states });
    }

    /**
     * Writes all changed device values to ioBroker.
     *
     * @param device - Dreo device
     */
    private async updateDeviceStates(device: DreoDevice): Promise<void> {
        const context = this.devices.get(this.deviceObjectId(device));
        if (!context) {
            return;
        }
        try {
            for (const definition of context.states.values()) {
                const value = definition.get();
                if (value !== undefined) {
                    await this.setStateChangedAsync(`${context.objectId}.${definition.id}`, value, true);
                }
            }
        } catch (error) {
            this.log.warn(`Updating states of ${device.name} failed: ${(error as Error).message}`);
        }
    }

    private async setConnected(connected: boolean, force = false): Promise<void> {
        if (this.cloudConnected !== connected || force) {
            this.cloudConnected = connected;
            await this.setState('info.connection', connected, true);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            this.clearInterval(this.refreshTimer);
            this.clearTimeout(this.reconnectTimer);
            this.client?.stopMonitoring();
            this.client?.removeAllListeners();
            void this.setState('info.connection', false, true);
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
        } finally {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id - State ID
     * @param state - State object
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack) {
            return;
        }
        void this.handleCommand(id.substring(this.namespace.length + 1), state.val);
    }

    /**
     * Processes a user command (state change with ack=false).
     *
     * @param id - State ID relative to the adapter namespace
     * @param value - Requested value
     */
    private async handleCommand(id: string, value: ioBroker.StateValue): Promise<void> {
        try {
            if (id === MANUAL_REFRESH_ID) {
                await this.refreshAll();
                await this.setState(MANUAL_REFRESH_ID, value, true);
                return;
            }

            const separator = id.indexOf('.');
            const context = this.devices.get(id.substring(0, separator));
            const definition = context?.states.get(id.substring(separator + 1));
            if (!context || !definition?.set) {
                this.log.warn(`State ${id} is not writable`);
                return;
            }
            if (!this.cloudConnected) {
                this.log.warn(`Not connected to Dreo cloud, command ${id}=${value} ignored`);
                return;
            }

            try {
                await definition.set(value);
                await this.setState(id, definition.get() ?? value, true);
            } catch (error) {
                this.log.warn(`Command ${id}=${value} failed: ${(error as Error).message}`);
                await this.restoreState(context, definition);
            }
        } catch (error) {
            this.log.error(`Error handling command ${id}: ${(error as Error).message}`);
        }
    }

    /**
     * Re-reads the device state from the cloud after a failed command so the
     * ioBroker state reflects the actual device value again.
     *
     * @param context - Device context
     * @param definition - Definition of the state the command was sent for
     */
    private async restoreState(context: DeviceContext, definition: StateDefinition): Promise<void> {
        try {
            const reported = await this.client?.httpService.getDeviceState(context.device.sn);
            if (reported) {
                context.device.updateState(reported);
            }
        } catch (error) {
            this.log.debug(`Refreshing ${context.device.name} failed: ${(error as Error).message}`);
        }
        const value = definition.get();
        if (value !== undefined) {
            await this.setState(`${context.objectId}.${definition.id}`, value, true);
        }
        await this.updateDeviceStates(context.device);
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new DreoControl(options);
} else {
    // otherwise start the instance directly
    (() => new DreoControl())();
}
