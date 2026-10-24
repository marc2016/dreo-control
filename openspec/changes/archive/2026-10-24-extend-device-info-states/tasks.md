# Tasks

## 1. State Definitions

- [x] 1.1 Add a local raw device type with `seriesName` and `productName` in `src/lib/state-definitions.ts` and verify `npm run check` passes
- [x] 1.2 ~~Add `info.room`~~ – dropped after smoke test: the cloud reports no room data (see design.md, Decision 4); code, tests and README entry removed
- [x] 1.3 Add `info.product` (role `text`, read-only, `brand + seriesName`, fallback `productName`, then `model`) and verify with unit tests for all three cases
- [x] 1.4 Change the `info.online` getter to use `state.connected` with fallback to `device.online` and verify with unit tests for connected `true`, `false` and missing

## 2. Documentation

- [x] 2.1 Add `info.product` to the README state table, describe `info.online`, and add a changelog line under `### **WORK IN PROGRESS**`

## 3. Verification

- [x] 3.1 Run `npm run check`, `npm run lint`, `npm run build` and `npm test`; all pass
- [x] 3.2 Smoke test via `npm run dev-server watch`: `info.product` shows `Dreo 316S`, `info.online` turns `false` when the device is unplugged (after the next poll)
