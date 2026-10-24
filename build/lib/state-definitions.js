"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var state_definitions_exports = {};
__export(state_definitions_exports, {
  getStateDefinitions: () => getStateDefinitions,
  temperatureUnitSymbol: () => temperatureUnitSymbol
});
module.exports = __toCommonJS(state_definitions_exports);
var import_dreo_client = require("dreo-client");
const TARGET_TEMPERATURE_RANGE = {
  celsius: { min: 5, max: 35 },
  fahrenheit: { min: 41, max: 95 }
};
function temperatureUnitSymbol(unit) {
  return unit === "fahrenheit" ? "\xB0F" : "\xB0C";
}
function commonDeviceStates(device) {
  return [
    {
      id: "power",
      common: { name: "Power", type: "boolean", role: "switch.power", read: true, write: true },
      get: () => device.isPowerOn(),
      set: (value) => device.setPower(Boolean(value))
    },
    {
      id: "info.online",
      common: { name: "Online", type: "boolean", role: "indicator.reachable", read: true, write: false },
      get: () => device.online
    },
    {
      id: "info.model",
      common: { name: "Model", type: "string", role: "text", read: true, write: false },
      get: () => device.model
    },
    {
      id: "info.name",
      common: { name: "Name", type: "string", role: "text", read: true, write: false },
      get: () => device.name
    }
  ];
}
function heaterStates(heater, unit) {
  const symbol = temperatureUnitSymbol(unit);
  return [
    {
      id: "temperature",
      common: {
        name: "Current temperature",
        type: "number",
        role: "value.temperature",
        unit: symbol,
        read: true,
        write: false
      },
      get: () => heater.getCurrentTemperature(unit)
    },
    {
      id: "targetTemperature",
      common: {
        name: "Target temperature",
        type: "number",
        role: "level.temperature",
        unit: symbol,
        ...TARGET_TEMPERATURE_RANGE[unit],
        read: true,
        write: true
      },
      get: () => heater.getTargetTemperature(unit),
      set: (value) => heater.setTargetTemperature(Number(value), unit)
    },
    {
      id: "mode",
      common: {
        name: "Operating mode",
        type: "string",
        role: "level.mode.airconditioner",
        states: { [import_dreo_client.HeaterMode.Heat]: "Heat", [import_dreo_client.HeaterMode.Eco]: "Eco", [import_dreo_client.HeaterMode.Fan]: "Fan" },
        read: true,
        write: true
      },
      get: () => heater.getMode(),
      set: (value) => heater.setMode(String(value), heater.getHeatLevel())
    },
    {
      id: "heatLevel",
      common: { name: "Heat level", type: "number", role: "level", min: 1, max: 3, read: true, write: true },
      get: () => heater.getHeatLevel(),
      set: (value) => heater.setHeatLevel(Math.round(Number(value)))
    },
    {
      id: "oscillation",
      common: { name: "Oscillation", type: "boolean", role: "switch", read: true, write: true },
      get: () => heater.isOscillating(),
      set: (value) => heater.setOscillation(Boolean(value))
    },
    {
      id: "childLock",
      common: { name: "Child lock", type: "boolean", role: "switch", read: true, write: true },
      get: () => heater.isChildLocked(),
      set: (value) => heater.setChildLock(Boolean(value))
    },
    {
      id: "timer",
      common: {
        name: "Shutdown timer",
        type: "number",
        role: "level.timer",
        unit: "h",
        min: 0,
        max: 12,
        read: true,
        write: true
      },
      get: () => heater.getTimer(),
      set: (value) => heater.setTimer(Number(value))
    },
    {
      id: "tippedOver",
      common: { name: "Tipped over", type: "boolean", role: "indicator.alarm", read: true, write: false },
      get: () => heater.isTippedOver()
    }
  ];
}
function fanStates(fan) {
  return [
    {
      id: "speed",
      common: { name: "Speed level", type: "number", role: "level", min: 1, max: 12, read: true, write: true },
      get: () => fan.getSpeed(),
      set: (value) => fan.setSpeed(Math.round(Number(value)))
    },
    {
      id: "oscillation",
      common: { name: "Horizontal oscillation", type: "boolean", role: "switch", read: true, write: true },
      get: () => fan.isOscillating(),
      set: (value) => fan.setOscillation(Boolean(value))
    },
    {
      id: "verticalOscillation",
      common: { name: "Vertical oscillation", type: "boolean", role: "switch", read: true, write: true },
      get: () => fan.isVerticalOscillating(),
      set: (value) => fan.setVerticalOscillation(Boolean(value))
    },
    {
      id: "windType",
      common: {
        name: "Wind mode",
        type: "string",
        role: "level.mode.fan",
        states: {
          [import_dreo_client.FanWindType.Normal]: "Normal",
          [import_dreo_client.FanWindType.Natural]: "Natural",
          [import_dreo_client.FanWindType.Sleep]: "Sleep",
          [import_dreo_client.FanWindType.Auto]: "Auto"
        },
        read: true,
        write: true
      },
      get: () => fan.getWindType(),
      set: (value) => fan.setWindType(String(value))
    }
  ];
}
function getStateDefinitions(device, unit) {
  const definitions = commonDeviceStates(device);
  if (device instanceof import_dreo_client.DreoHeater) {
    definitions.push(...heaterStates(device, unit));
  } else if (device instanceof import_dreo_client.DreoFan) {
    definitions.push(...fanStates(device));
  }
  return definitions;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getStateDefinitions,
  temperatureUnitSymbol
});
//# sourceMappingURL=state-definitions.js.map
