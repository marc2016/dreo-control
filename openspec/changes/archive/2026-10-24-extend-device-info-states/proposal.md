# Proposal

## Why

The Dreo cloud reports the product series (e.g. "Dreo 316S"), which is more meaningful to users than the model code `DR-HSH006S` exposed today. In addition, `info.online` is currently always `true`: the device list returned by the cloud contains no online flag, so `dreo-client` falls back to `true`, while the actual reachability is only reported as `connected` in the device state.

## What Changes

- Add a read-only state `<sn>.info.product` with the product name built from brand and series (e.g. "Dreo 316S").
- Derive `<sn>.info.online` from the `connected` attribute of the device state, so it reflects the real reachability and is refreshed by polling and WebSocket updates.
- Update README state table.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dreo-device-control`: adds requirements for the product name information state and for an accurate online status.

## Impact

- **Codebase**: `src/lib/state-definitions.ts` (new info state, online getter) and its unit tests; no changes to `src/main.ts` expected.
- **Dependencies**: none; the additional fields are read from `DreoDevice.rawDevice` / `DreoDevice.state` of the existing `dreo-client`.
- **ioBroker State Hierarchy**: one new state per device (`info.product`); existing installations get them on the next adapter start. `info.online` may change from `true` to `false` for offline devices.
- **Docs**: README state table.

## Out of Scope

- A room state (`info.room`) was evaluated and dropped: the device list reports `roomId`, `roomName`, `familyId` and `familyRooms` as `null` even for a device assigned to a room in the Dreo app, and no other known endpoint (incl. the hass-dreo client) provides rooms.
