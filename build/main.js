"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_dreo_client = require("dreo-client");
var import_state_definitions = require("./lib/state-definitions");
const MIN_REFRESH_INTERVAL_S = 60;
const DEFAULT_REFRESH_INTERVAL_S = 300;
const INITIAL_RECONNECT_DELAY_MS = 5 * 60 * 1e3;
const MAX_RECONNECT_DELAY_MS = 60 * 60 * 1e3;
const MANUAL_REFRESH_ID = "commands.manualRefresh";
class DreoControl extends utils.Adapter {
  client;
  temperatureUnit = "celsius";
  cloudConnected = false;
  refreshTimer;
  reconnectTimer;
  reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  /** Device contexts by device object ID */
  devices = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "dreo-control"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await this.setConnected(false, true);
    if (!this.config.email || !this.config.password) {
      this.log.warn("Please configure e-mail and password of your Dreo account in the instance settings");
      return;
    }
    const region = this.config.region === "us" ? "us" : "eu";
    this.temperatureUnit = region === "us" ? "fahrenheit" : "celsius";
    let refreshInterval = Number(this.config.refreshInterval) || DEFAULT_REFRESH_INTERVAL_S;
    if (refreshInterval < MIN_REFRESH_INTERVAL_S) {
      this.log.warn(
        `Refresh interval of ${refreshInterval}s is too short, using ${MIN_REFRESH_INTERVAL_S}s instead`
      );
      refreshInterval = MIN_REFRESH_INTERVAL_S;
    }
    this.client = new import_dreo_client.DreoClient({ region, autoReconnect: this.config.useWebSocket });
    this.client.on("deviceUpdate", (device) => {
      this.log.debug(`Received update for ${device.name} (${device.sn})`);
      void this.updateDeviceStates(device);
    });
    this.client.on("error", (error) => {
      this.log.warn(`Dreo cloud connection error: ${error.message}`);
    });
    this.subscribeStates("*");
    await this.connect();
    this.refreshTimer = this.setInterval(() => void this.refreshAll(), refreshInterval * 1e3);
  }
  /**
   * Logs in, discovers all devices and starts real-time monitoring.
   * Schedules a new attempt with increasing delay on failure.
   */
  async connect() {
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
  async handleConnectionError(error) {
    var _a;
    await this.setConnected(false);
    (_a = this.client) == null ? void 0 : _a.stopMonitoring();
    const delayMinutes = Math.round(this.reconnectDelayMs / 6e4);
    if (error instanceof import_dreo_client.DreoAuthenticationError) {
      this.log.error(
        `Login to Dreo cloud failed: ${error.message}. Please verify e-mail, password and region. Retrying in ${delayMinutes} min`
      );
    } else {
      this.log.warn(
        `Connection to Dreo cloud failed: ${error.message}. Retrying in ${delayMinutes} min`
      );
    }
    this.scheduleReconnect();
  }
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = this.setTimeout(() => {
      this.reconnectTimer = void 0;
      void this.connect();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }
  /**
   * Polls the current state of all devices from the cloud.
   */
  async refreshAll() {
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
  deviceObjectId(device) {
    return device.sn.replace(this.FORBIDDEN_CHARS, "_");
  }
  /**
   * Creates or updates the device object, its channels and states.
   *
   * @param device - Dreo device
   */
  async createDeviceObjects(device) {
    if (!device.sn) {
      this.log.warn(`Ignoring device ${device.name} (${device.model}) without serial number`);
      return;
    }
    if (!(device instanceof import_dreo_client.DreoHeater) && !(device instanceof import_dreo_client.DreoFan)) {
      this.log.info(
        `Device ${device.name} has unsupported model ${device.model}, only common states are created. Please report this model.`
      );
    }
    const objectId = this.deviceObjectId(device);
    await this.extendObjectAsync(objectId, {
      type: "device",
      common: { name: device.name },
      native: { sn: device.sn, model: device.model }
    });
    await this.extendObjectAsync(`${objectId}.info`, {
      type: "channel",
      common: { name: "Information" },
      native: {}
    });
    const states = /* @__PURE__ */ new Map();
    for (const definition of (0, import_state_definitions.getStateDefinitions)(device, this.temperatureUnit)) {
      await this.extendObjectAsync(`${objectId}.${definition.id}`, {
        type: "state",
        common: definition.common,
        native: {}
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
  async updateDeviceStates(device) {
    const context = this.devices.get(this.deviceObjectId(device));
    if (!context) {
      return;
    }
    try {
      for (const definition of context.states.values()) {
        const value = definition.get();
        if (value !== void 0) {
          await this.setStateChangedAsync(`${context.objectId}.${definition.id}`, value, true);
        }
      }
    } catch (error) {
      this.log.warn(`Updating states of ${device.name} failed: ${error.message}`);
    }
  }
  async setConnected(connected, force = false) {
    if (this.cloudConnected !== connected || force) {
      this.cloudConnected = connected;
      await this.setState("info.connection", connected, true);
    }
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback - Callback function
   */
  onUnload(callback) {
    var _a, _b;
    try {
      this.clearInterval(this.refreshTimer);
      this.clearTimeout(this.reconnectTimer);
      (_a = this.client) == null ? void 0 : _a.stopMonitoring();
      (_b = this.client) == null ? void 0 : _b.removeAllListeners();
      void this.setState("info.connection", false, true);
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
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
  onStateChange(id, state) {
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
  async handleCommand(id, value) {
    var _a;
    try {
      if (id === MANUAL_REFRESH_ID) {
        await this.refreshAll();
        await this.setState(MANUAL_REFRESH_ID, value, true);
        return;
      }
      const separator = id.indexOf(".");
      const context = this.devices.get(id.substring(0, separator));
      const definition = context == null ? void 0 : context.states.get(id.substring(separator + 1));
      if (!context || !(definition == null ? void 0 : definition.set)) {
        this.log.warn(`State ${id} is not writable`);
        return;
      }
      if (!this.cloudConnected) {
        this.log.warn(`Not connected to Dreo cloud, command ${id}=${value} ignored`);
        return;
      }
      try {
        await definition.set(value);
        await this.setState(id, (_a = definition.get()) != null ? _a : value, true);
      } catch (error) {
        this.log.warn(`Command ${id}=${value} failed: ${error.message}`);
        await this.restoreState(context, definition);
      }
    } catch (error) {
      this.log.error(`Error handling command ${id}: ${error.message}`);
    }
  }
  /**
   * Re-reads the device state from the cloud after a failed command so the
   * ioBroker state reflects the actual device value again.
   *
   * @param context - Device context
   * @param definition - Definition of the state the command was sent for
   */
  async restoreState(context, definition) {
    var _a;
    try {
      const reported = await ((_a = this.client) == null ? void 0 : _a.httpService.getDeviceState(context.device.sn));
      if (reported) {
        context.device.updateState(reported);
      }
    } catch (error) {
      this.log.debug(`Refreshing ${context.device.name} failed: ${error.message}`);
    }
    const value = definition.get();
    if (value !== void 0) {
      await this.setState(`${context.objectId}.${definition.id}`, value, true);
    }
    await this.updateDeviceStates(context.device);
  }
}
if (require.main !== module) {
  module.exports = (options) => new DreoControl(options);
} else {
  (() => new DreoControl())();
}
//# sourceMappingURL=main.js.map
