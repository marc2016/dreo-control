# Design

## Context

See `proposal.md` for background and motivation. The architecture directly adopts the proven modular pattern from `ioBroker.panasonic-comfort-cloud`, utilizing the newly created `dreo-client` library (`DreoClient`, `DreoHeater`, `DreoFan`). All decisions follow the ioBroker adapter development guidelines and the checks performed by the adapter checker / repository review.

## Goals / Non-Goals

**Goals:**
- Provide clean separation between ioBroker adapter lifecycle, state schema definitions, and cloud client operations.
- Declaratively manage state definitions (roles, types, readable/writable, min/max, units, states lookup tables) in a dedicated module (`state-definitions.ts`).
- Support both immediate command execution and real-time state synchronization via WebSocket with polling fallback.
- Gracefully handle authentication failures, network disconnections, failed commands, and unexpected device models without crashing or restart loops.

**Non-Goals:**
- Local Bluetooth / BLE direct connection (cloud API is currently used).
- Full historical telemetry logging database (can be handled by ioBroker history/influxdb adapters on the generated states).

## Decisions

### 1. State Definitions Architecture (`src/lib/state-definitions.ts`)
- **Decision:** Extract all state schemas into a declarative `StateDefinition` structure (pattern from `ioBroker.panasonic-comfort-cloud`), categorized into:
  - `commonDeviceStates`: `power`, `info.online`, `info.model`, `info.name`.
  - `heaterStates`: `temperature`, `targetTemperature`, `mode`, `heatLevel`, `oscillation`, `childLock`, `timer`, `tippedOver`.
  - `fanStates`: `speed`, `oscillation`, `verticalOscillation`, `windType`.
- **Roles** (per the [ioBroker state roles](https://www.iobroker.net/#en/documentation/dev/stateroles.md)):

  | State | Type | Role | Write |
  |---|---|---|---|
  | `power` | boolean | `switch.power` | yes |
  | `info.online` | boolean | `indicator.reachable` | no |
  | `info.model`, `info.name` | string | `text` | no |
  | `temperature` | number | `value.temperature` | no |
  | `targetTemperature` | number | `level.temperature` | yes |
  | `mode` (heater: heat/eco/fan) | string with `states` | `level.mode.airconditioner` | yes |
  | `windType` (fan) | string with `states` | `level.mode.fan` | yes |
  | `heatLevel`, `speed` | number with `min`/`max` | `level` | yes |
  | `oscillation`, `verticalOscillation`, `childLock` | boolean | `switch` | yes |
  | `timer` | number (unit `h`, 0–12) | `level.timer` | yes |
  | `tippedOver` | boolean | `indicator.alarm` | no |

- **Units:** Temperature unit is derived from the configured region (`eu` → `°C`, `us` → `°F`); `dreo-client` converts the raw values accordingly.
- **Limitation:** `dreo-client` reads `online` and the device name only when a device is first discovered, so `info.online` and renames are refreshed on adapter restart.
- **Rationale:** Keeps `src/main.ts` concise and makes adding new states or device categories trivial without touching adapter lifecycle methods.
- **Alternatives Considered:** Inlining state creation into `src/main.ts` (rejected: leads to repetitive boilerplate and difficult maintenance).

### 2. Configuration (`io-package.json`, `admin/jsonConfig.json`, `src/lib/adapter-config.d.ts`)
- **Decision:** Replace the template settings with:

  | Key | Type | Default | Notes |
  |---|---|---|---|
  | `email` | string | `""` | |
  | `password` | string | `""` | `type: "password"` in jsonConfig; listed in `encryptedNative` and `protectedNative` |
  | `region` | `"eu" \| "us"` | `"eu"` | select |
  | `refreshInterval` | number (seconds) | `300` | `min: 60` in jsonConfig, additionally clamped in code |
  | `useWebSocket` | boolean | `true` | |

- Augment the existing `ioBroker.AdapterConfig` declaration in `src/lib/adapter-config.d.ts` accordingly.
- **Rationale:** Compile-time safety for `this.config`; credentials never stored or shown in plaintext; protects the Dreo cloud from aggressive polling.

### 3. Adapter-Level Objects (`instanceObjects`)
- **Decision:** Declare in `io-package.json` `instanceObjects`:
  - channel `info`, state `info.connection` (boolean, role `indicator.connected`, read-only) – reflects the cloud session, shown by Admin as instance connection status.
  - channel `commands`, state `commands.manualRefresh` (boolean, role `button`, `read: false`, `write: true`).
- Set `common.dataSource` to `push` (WebSocket primary) and keep `connectionType: cloud`.
- **Rationale:** `info.connection` must exist exactly once per instance; per-device reachability lives in `<sn>.info.online`.

### 4. Dual Sync Strategy (WebSocket + Polling)
- **Decision:** Use `client.startMonitoring()` for instantaneous event streaming (`deviceUpdate`) from the Dreo Cloud. Additionally maintain the configurable `refreshInterval` timer as fallback and health check.
- All timers use the adapter-managed `this.setInterval` / `this.setTimeout` so they are cleared automatically on unload.
- Values from WebSocket and polling are written with `setStateChangedAsync(..., true)` to avoid redundant writes.
- Every event handler and timer callback wraps its work in `try/catch`; no unhandled promise rejections may escape.
- **Rationale:** Dreo devices send state updates (physical button presses, app changes) over WebSocket. Relying solely on polling causes noticeable delays and higher cloud API traffic.

### 5. Device Identification & Object Tree
- **Decision:** Object IDs are derived from the device serial number (`sn`), sanitized with `this.FORBIDDEN_CHARS`. The user-visible device name is stored in `common.name` and `info.name`. Structure: `<sn>` (type `device`) → `info` (channel) → states; control states directly below the device.
- Objects are created/updated with `extendObjectAsync` so changes to state definitions in later adapter versions are applied to existing installations.
- **Rationale:** IDs stay stable when a device is renamed in the Dreo app; the ID itself is the lookup key in `onStateChange`, so no extra lookup state is needed.

### 6. Command Handling
- **Decision:** `onStateChange` only handles states of the own namespace with `state.ack === false`. On successful command dispatch the state is confirmed with `ack: true`. On failure, the adapter logs a warning, does **not** acknowledge the value, and triggers a refresh of that device to restore the real value.

### 7. Error Handling & Lifecycle
- **Missing configuration:** If `email` or `password` is empty, log a single warning, keep `info.connection = false`, and stay idle (adapter must start cleanly; integration tests run with empty config).
- **Authentication failure:** Log an error, set `info.connection = false`, never call `terminate()` (avoids restart loops and account lockout). Retry with increasing backoff (e.g. 5 min → max 60 min).
- **onUnload:** stop monitoring, set `info.connection = false`, and call `callback()` inside `try/finally`.

## Risks / Trade-offs

- **[Risk] Cloud API rate limits or session expirations**
  → *Mitigation:* `dreo-client` manages session tokens and heartbeats; the adapter catches `Unauthorized` errors, flags `info.connection` as `false`, and re-authenticates with backoff. Minimum polling interval 60 s.
- **[Risk] Plaintext password in config**
  → *Mitigation:* `encryptedNative` + `protectedNative` for `password`, `type: "password"` in jsonConfig.
- **[Risk] Unknown or future Dreo device types**
  → *Mitigation:* Fall back to the generic `DreoDevice` base class, creating common states (`power`, `info.*`) so unknown devices still show up and remain partially controllable; log the model at info level so users can report it.
