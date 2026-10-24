import { DreoFan, DreoHeater, FanWindType, HeaterMode } from 'dreo-client';
import type { DreoDevice, DreoRawDevice, TemperatureUnit } from 'dreo-client';

/** Device list fields reported by the Dreo cloud but not declared by `dreo-client` */
interface RawDeviceInfo extends DreoRawDevice {
    seriesName?: string | null;
    productName?: string | null;
}

/**
 * Declarative description of one ioBroker state of a Dreo device.
 * Getters and setters are bound to a concrete device instance.
 */
export interface StateDefinition {
    /** State ID relative to the device object, e.g. `power` or `info.model` */
    id: string;
    /** ioBroker state common definition */
    common: ioBroker.StateCommon;
    /** Reads the current value from the device, `undefined` if not reported */
    get: () => ioBroker.StateValue | undefined;
    /** Sends a command to the device; only present for writable states */
    set?: (value: ioBroker.StateValue) => Promise<unknown>;
}

const TARGET_TEMPERATURE_RANGE: Record<TemperatureUnit, { min: number; max: number }> = {
    celsius: { min: 5, max: 35 },
    fahrenheit: { min: 41, max: 95 },
};

/**
 * Returns the ioBroker unit for a Dreo temperature unit.
 *
 * @param unit - Dreo temperature unit
 */
export function temperatureUnitSymbol(unit: TemperatureUnit): string {
    return unit === 'fahrenheit' ? '°F' : '°C';
}

function productName(raw: RawDeviceInfo): string {
    if (raw.seriesName) {
        return [raw.brand, raw.seriesName].filter(Boolean).join(' ');
    }
    return raw.productName || raw.model;
}

function commonDeviceStates(device: DreoDevice): StateDefinition[] {
    const raw: RawDeviceInfo = device.rawDevice;
    return [
        {
            id: 'power',
            common: { name: 'Power', type: 'boolean', role: 'switch.power', read: true, write: true },
            get: () => device.isPowerOn(),
            set: value => device.setPower(Boolean(value)),
        },
        {
            id: 'info.online',
            common: { name: 'Online', type: 'boolean', role: 'indicator.reachable', read: true, write: false },
            get: () => {
                const connected: unknown = device.state.connected;
                return typeof connected === 'boolean' ? connected : device.online;
            },
        },
        {
            id: 'info.model',
            common: { name: 'Model', type: 'string', role: 'text', read: true, write: false },
            get: () => device.model,
        },
        {
            id: 'info.name',
            common: { name: 'Name', type: 'string', role: 'text', read: true, write: false },
            get: () => device.name,
        },
        {
            id: 'info.product',
            common: { name: 'Product', type: 'string', role: 'text', read: true, write: false },
            get: () => productName(raw),
        },
    ];
}

function heaterStates(heater: DreoHeater, unit: TemperatureUnit): StateDefinition[] {
    const symbol = temperatureUnitSymbol(unit);
    return [
        {
            id: 'temperature',
            common: {
                name: 'Current temperature',
                type: 'number',
                role: 'value.temperature',
                unit: symbol,
                read: true,
                write: false,
            },
            get: () => heater.getCurrentTemperature(unit),
        },
        {
            id: 'targetTemperature',
            common: {
                name: 'Target temperature',
                type: 'number',
                role: 'level.temperature',
                unit: symbol,
                ...TARGET_TEMPERATURE_RANGE[unit],
                read: true,
                write: true,
            },
            get: () => heater.getTargetTemperature(unit),
            set: value => heater.setTargetTemperature(Number(value), unit),
        },
        {
            id: 'mode',
            common: {
                name: 'Operating mode',
                type: 'string',
                role: 'level.mode.airconditioner',
                states: { [HeaterMode.Heat]: 'Heat', [HeaterMode.Eco]: 'Eco', [HeaterMode.Fan]: 'Fan' },
                read: true,
                write: true,
            },
            get: () => heater.getMode(),
            set: value => heater.setMode(String(value) as HeaterMode, heater.getHeatLevel()),
        },
        {
            id: 'heatLevel',
            common: { name: 'Heat level', type: 'number', role: 'level', min: 1, max: 3, read: true, write: true },
            get: () => heater.getHeatLevel(),
            set: value => heater.setHeatLevel(Math.round(Number(value)) as 1 | 2 | 3),
        },
        {
            id: 'oscillation',
            common: { name: 'Oscillation', type: 'boolean', role: 'switch', read: true, write: true },
            get: () => heater.isOscillating(),
            set: value => heater.setOscillation(Boolean(value)),
        },
        {
            id: 'childLock',
            common: { name: 'Child lock', type: 'boolean', role: 'switch', read: true, write: true },
            get: () => heater.isChildLocked(),
            set: value => heater.setChildLock(Boolean(value)),
        },
        {
            id: 'timer',
            common: {
                name: 'Shutdown timer',
                type: 'number',
                role: 'level.timer',
                unit: 'h',
                min: 0,
                max: 12,
                read: true,
                write: true,
            },
            get: () => heater.getTimer(),
            set: value => heater.setTimer(Number(value)),
        },
        {
            id: 'tippedOver',
            common: { name: 'Tipped over', type: 'boolean', role: 'indicator.alarm', read: true, write: false },
            get: () => heater.isTippedOver(),
        },
    ];
}

function fanStates(fan: DreoFan): StateDefinition[] {
    return [
        {
            id: 'speed',
            common: { name: 'Speed level', type: 'number', role: 'level', min: 1, max: 12, read: true, write: true },
            get: () => fan.getSpeed(),
            set: value => fan.setSpeed(Math.round(Number(value))),
        },
        {
            id: 'oscillation',
            common: { name: 'Horizontal oscillation', type: 'boolean', role: 'switch', read: true, write: true },
            get: () => fan.isOscillating(),
            set: value => fan.setOscillation(Boolean(value)),
        },
        {
            id: 'verticalOscillation',
            common: { name: 'Vertical oscillation', type: 'boolean', role: 'switch', read: true, write: true },
            get: () => fan.isVerticalOscillating(),
            set: value => fan.setVerticalOscillation(Boolean(value)),
        },
        {
            id: 'windType',
            common: {
                name: 'Wind mode',
                type: 'string',
                role: 'level.mode.fan',
                states: {
                    [FanWindType.Normal]: 'Normal',
                    [FanWindType.Natural]: 'Natural',
                    [FanWindType.Sleep]: 'Sleep',
                    [FanWindType.Auto]: 'Auto',
                },
                read: true,
                write: true,
            },
            get: () => fan.getWindType(),
            set: value => fan.setWindType(String(value) as FanWindType),
        },
    ];
}

/**
 * Builds all state definitions for a device according to its type.
 * Unknown device types only get the common states.
 *
 * @param device - Dreo device instance
 * @param unit - Temperature unit used for temperature states
 */
export function getStateDefinitions(device: DreoDevice, unit: TemperatureUnit): StateDefinition[] {
    const definitions = commonDeviceStates(device);
    if (device instanceof DreoHeater) {
        definitions.push(...heaterStates(device, unit));
    } else if (device instanceof DreoFan) {
        definitions.push(...fanStates(device));
    }
    return definitions;
}
