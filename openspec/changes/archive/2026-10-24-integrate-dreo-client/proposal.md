# Proposal

## Why

The `iobroker.dreo-control` adapter is currently an initial template without any functional integration with Dreo smart devices. Integrating the newly published `dreo-client` library enables ioBroker users to discover, monitor, and control their Dreo heaters and fans directly through ioBroker objects, states, and automations.

## What Changes

- Add `dreo-client` as a runtime dependency.
- Remove the create-adapter template leftovers (`option1`/`option2`, `testVariable`, `checkPasswordAsync` examples, `template` keyword, placeholder `desc`).
- Define adapter instance configuration fields (`email`, `password`, `region`, `refreshInterval`, `useWebSocket`) in `io-package.json` and `admin/jsonConfig.json`, with the password stored via `encryptedNative` / `protectedNative`.
- Declare the adapter-level `info` channel and `info.connection` state (role `indicator.connected`) as `instanceObjects` in `io-package.json`.
- Set `common.dataSource` to `push` (WebSocket is the primary update path; polling is fallback).
- Update `src/lib/adapter-config.d.ts` to provide strong TypeScript typing for the adapter configuration.
- Implement `src/lib/state-definitions.ts` defining state metadata (roles according to the ioBroker state role catalogue, types, min/max, states, units) for common device attributes, heaters (`DreoHeater`), and fans (`DreoFan`), modeled after the architecture in `ioBroker.panasonic-comfort-cloud`.
- Implement adapter lifecycle logic in `src/main.ts`:
  - Authenticate against the Dreo Cloud API with region support (`eu` / `us`); start cleanly without crashing when the configuration is empty or invalid.
  - Discover connected devices and create corresponding ioBroker device, channel and state objects, keyed by serial number.
  - Handle real-time push updates via WebSocket (`startMonitoring`) and fallback polling using adapter-managed timers.
  - Listen for unacknowledged state changes (`onStateChange`) and translate them into typed device commands, including error handling for failed commands.
  - Provide a `commands.manualRefresh` button for on-demand synchronization.
  - Cleanly disconnect, reset `info.connection` and stop monitoring on adapter shutdown (`onUnload`).
- Update README (configuration, state overview, changelog) and translations.

## Capabilities

### New Capabilities
- `dreo-device-control`: Covers authentication against Dreo Cloud, device discovery, state mapping, real-time push updates, and control for Dreo appliances (heaters and fans).

### Modified Capabilities
None.

## Impact

- **Dependencies**: Adds `dreo-client` (`^0.1.0`) to `package.json`.
- **Configuration**: Replaces template `native` settings in `io-package.json`, adds `encryptedNative`, `protectedNative`, `instanceObjects`, changes `dataSource`, and rewrites `admin/jsonConfig.json` and `admin/i18n/*`.
- **Codebase**: Rewrites `src/main.ts`, updates `src/lib/adapter-config.d.ts`, adds `src/lib/state-definitions.ts`.
- **ioBroker State Hierarchy**:
  - `dreo-control.<instance>.info.connection` (adapter-level cloud connection)
  - `dreo-control.<instance>.commands.manualRefresh`
  - `dreo-control.<instance>.<sn>.*` (one device object per Dreo appliance, display name in `common.name`)
