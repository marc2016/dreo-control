# Design

## Context

See proposal.md – Why. All device states are declared in `src/lib/state-definitions.ts` (`commonDeviceStates`) with a `get()` bound to the `DreoDevice` instance; `src/main.ts` creates and updates them generically, so new info states need no lifecycle changes.

Observed cloud data (Dreo 316S, region eu):

- Device list (`DreoDevice.rawDevice`): `brand: "Dreo"`, `seriesName: "316S"`, `productName: "Heater"`, `model: "DR-HSH006S"`. No `online`/`connected` field, therefore `DreoDevice.online` is always `true`.
- Device state (`DreoDevice.state`, from `getDeviceState`): `connected: true`. Because the device list carries no `reported`/`state`, `dreo-client` fetches the device state on every `getDevices(true)`, i.e. on every polling cycle.

## Goals / Non-Goals

**Goals:**
- Read the additional fields without changing `dreo-client`.

**Non-Goals:**
- Room information (`info.room`, `enum.rooms`), see Decision 4.
- Further state attributes (`wifi_rssi`, firmware versions, window detection) – separate change.

## Decisions

### 1. Read metadata from `rawDevice`
- **Decision:** `info.product` = `` `${brand} ${seriesName}` `` when `seriesName` is set, else `productName`, else `model`. Fields not declared in `DreoRawDevice` (`seriesName`, `productName`) are read through a local type extending `DreoRawDevice` in `state-definitions.ts`.
- **Alternatives:** Extending `DreoRawDevice` in `dreo-client` (cleaner, but requires a library release for optional fields; can follow later and the local type then becomes redundant).

### 2. Online status from device state
- **Decision:** `info.online` getter = `device.state.connected` if it is a boolean, otherwise `device.online`.
- **Rationale:** `connected` is refreshed with every poll and with WebSocket updates that include it; `device.online` is a static fallback.
- **Alternatives:** Treating failed `getDeviceState` calls as offline – rejected, `dreo-client` swallows these errors and they rather indicate cloud problems (covered by `info.connection`).

### 3. Object creation
- The new state uses role `text`, `read: true`, `write: false`, created in the existing `info` channel via `extendObjectAsync`, so existing installations receive them on the next start without migration.

### 4. No room state
- **Decision:** Drop the planned `info.room`.
- **Rationale:** With the device assigned to "Badezimmer" in the Dreo app, `/api/v2/user-device/device/list` still returns `roomId`, `roomName`, `familyId`, `familyName` and the top-level `familyRooms` as `null`. The hass-dreo client uses the same endpoint and has no room/family handling; no other endpoint is known. A state that stays empty for most users adds no value.
- **Follow-up:** Revisit if a room endpoint is found (e.g. by capturing Dreo app traffic).

### 5. Online status via WebSocket (follow-up)
- hass-dreo handles WebSocket messages `device-online` / `device-offline`; `dreo-client` currently ignores messages without `reported` data. Supporting them would update `info.online` immediately instead of on the next poll – requires a `dreo-client` change, out of scope here.

## Risks / Trade-offs

- **[Risk] Product data comes from the device list, which `dreo-client` reads only on first discovery** → changes appear after an adapter restart; same documented limitation as for the device name (product data is static in practice).
- **[Risk] `connected` may not be part of WebSocket updates** → online status is then updated with the next poll (≤ refresh interval).
