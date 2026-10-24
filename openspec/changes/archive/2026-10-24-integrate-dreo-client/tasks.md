# Tasks

## 1. Dependencies, Cleanup and Configuration

- [x] 1.1 Add `dreo-client` to `package.json` dependencies and verify package resolution
- [x] 1.2 Remove template leftovers: `option1`/`option2` in `io-package.json`, `admin/jsonConfig.json`, `admin/i18n/*`; `testVariable` and `checkPasswordAsync` examples in `src/main.ts`; `template` keyword in `package.json` and `io-package.json`
- [x] 1.3 Update `io-package.json`: meaningful `desc` (all languages), `native` defaults (`email: ""`, `password: ""`, `region: "eu"`, `refreshInterval: 300`, `useWebSocket: true`), `encryptedNative` and `protectedNative` for `password`, `dataSource: "push"`
- [x] 1.4 Add `instanceObjects` to `io-package.json`: channel `info` with `info.connection` (`indicator.connected`), channel `commands` with `commands.manualRefresh` (`button`, `read: false`, `write: true`)
- [x] 1.5 Rewrite `admin/jsonConfig.json` (email, password with `type: "password"`, region select, refresh interval in seconds with `min: 60`, WebSocket checkbox) and add translation keys in `admin/i18n/en.json`; run `npm run translate`

## 2. Typing and State Definitions

- [x] 2.1 Update `src/lib/adapter-config.d.ts` replacing `option1`/`option2` with typed instance settings
- [x] 2.2 Create `src/lib/state-definitions.ts` defining the `StateDefinition` interface and state mappings for common device states, `DreoHeater`, and `DreoFan`, using roles from the ioBroker state role catalogue (see design.md)
- [x] 2.3 Add unit tests for the state definitions (valid roles, writable states have setters, unit handling for °C/°F)

## 3. Adapter Core Implementation

- [x] 3.1 Implement config validation in `onReady()`: warn and stay idle when credentials are missing; clamp `refreshInterval` to at least 60 s
- [x] 3.2 Implement Dreo client initialization, authentication, `info.connection` handling and re-authentication with backoff (no `terminate()`)
- [x] 3.3 Implement device object creation (`<sn>` device, `info` channel, states) via `extendObjectAsync`, IDs sanitized with `this.FORBIDDEN_CHARS`, name in `common.name`
- [x] 3.4 Implement WebSocket `deviceUpdate` listener writing values via `setStateChangedAsync(..., true)` with error handling in every callback
- [x] 3.5 Implement fallback polling with `this.setInterval` and the `commands.manualRefresh` button
- [x] 3.6 Implement `onStateChange()` dispatching commands to `DreoHeater` / `DreoFan` for unacknowledged states; ack on success, warn + device refresh on failure
- [x] 3.7 Implement `onUnload()`: stop monitoring, set `info.connection` to `false`, call `callback()` in `try/finally`

## 4. Documentation

- [x] 4.1 Update `README.md`: description, configuration, state overview, `### **WORK IN PROGRESS**` changelog entry
- [ ] 4.2 Update `common.news` in `io-package.json` when releasing (handled by release-script)

## 5. Build and Verification

- [x] 5.1 Run `npm run check`, `npm run lint` and `npm run build`
- [x] 5.2 Run `npm run test:ts` and `npm run test:package`
- [x] 5.3 Run `npm run test:integration` to verify the adapter starts cleanly with empty configuration
- [x] 5.4 Smoke test with real account via `npm run dev-server` (heater and fan, WebSocket on/off)
