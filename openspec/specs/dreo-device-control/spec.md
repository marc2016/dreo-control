# dreo-device-control Specification

## Purpose

Provides cloud authentication, device discovery, state mapping, and bidirectional real-time control for Dreo smart home appliances within the ioBroker ecosystem.

## Requirements

### Requirement: Cloud Authentication and Connection Management
The adapter SHALL authenticate against the Dreo Cloud API using configured user credentials and the selected server region (`eu` or `us`), reflect the cloud session in the adapter-level state `info.connection`, and handle token refreshing and errors gracefully without crashing or entering restart loops.

#### Scenario: Successful authentication
- **WHEN** valid credentials and region are provided in the adapter configuration and the adapter starts
- **THEN** the adapter connects to the Dreo cloud service, sets `info.connection` to `true` with `ack: true`, and logs a successful login message

#### Scenario: Missing configuration
- **WHEN** the adapter starts with an empty `email` or `password`
- **THEN** the adapter logs a warning asking the user to configure the instance, keeps `info.connection` at `false`, does not contact the cloud, and keeps running without errors

#### Scenario: Invalid credentials
- **WHEN** authentication fails due to incorrect credentials
- **THEN** the adapter sets `info.connection` to `false`, logs an error message instructing the user to verify settings, does not terminate the process, and retries authentication with increasing backoff

#### Scenario: Connection lost
- **WHEN** the cloud session expires or the network connection is lost
- **THEN** the adapter sets `info.connection` to `false`, logs a warning, and re-authenticates with backoff, setting `info.connection` back to `true` once reconnected

### Requirement: Secure Credential Storage
The adapter SHALL store the configured password encrypted and protected from reading by other adapters.

#### Scenario: Password stored in instance configuration
- **WHEN** the user saves the instance configuration
- **THEN** the `password` attribute is listed in `encryptedNative` and `protectedNative` in `io-package.json` and is rendered as a password field in the admin UI

### Requirement: Device Discovery and State Creation
The adapter SHALL query the user's registered Dreo devices upon startup and create corresponding ioBroker device objects identified by the sanitized serial number, with the device name in `common.name`, and typed state objects with roles from the ioBroker state role catalogue according to the device type (`DreoHeater`, `DreoFan`, or generic `DreoDevice`).

#### Scenario: Discovering a Dreo Heater
- **WHEN** the account contains a supported heater device (e.g. Dreo Atom 316)
- **THEN** the adapter creates a device node `<sn>` with states for power, online status, ambient temperature, target temperature, operating mode, heat level, oscillation, child lock, timer, and tip-over alarm, using the temperature unit reported for the device

#### Scenario: Discovering a Dreo Fan
- **WHEN** the account contains a supported fan device (e.g. DR-HTF or DR-HCF series)
- **THEN** the adapter creates a device node `<sn>` with states for power, online status, speed level, horizontal oscillation, vertical oscillation, and wind mode

#### Scenario: Discovering an unknown device type
- **WHEN** the account contains a device model not mapped to `DreoHeater` or `DreoFan`
- **THEN** the adapter creates the device node with the common states only and logs the model at info level

#### Scenario: Device renamed in Dreo app
- **WHEN** a device is renamed in the Dreo mobile app
- **THEN** the object ID stays unchanged and only `common.name` and `info.name` are updated

### Requirement: Real-Time State Synchronization
The adapter SHALL synchronize device telemetry and state changes from the Dreo Cloud to ioBroker states in real time using WebSocket push streaming when enabled, and fallback periodic polling at the configured interval (minimum 60 seconds), writing only changed values.

#### Scenario: Incoming telemetry update via WebSocket
- **WHEN** an attribute changes on a physical device or via the mobile app
- **THEN** the adapter receives the `deviceUpdate` event and updates the corresponding ioBroker states with `ack: true`

#### Scenario: Periodic polling fallback
- **WHEN** WebSocket monitoring is disabled or the fallback refresh interval elapses
- **THEN** the adapter queries the current state of all devices and updates changed state values with `ack: true`

#### Scenario: Refresh interval below minimum
- **WHEN** `refreshInterval` is configured below 60 seconds
- **THEN** the adapter uses 60 seconds and logs a warning

### Requirement: Device Control from ioBroker
The adapter SHALL process unacknowledged state changes (`ack: false`) of its own writable states issued by users or automations, send the corresponding commands to the Dreo device via the client library, and acknowledge the state only once the command succeeded.

#### Scenario: Changing target temperature on a heater
- **WHEN** an ioBroker state change for `targetTemperature` with `ack: false` is received
- **THEN** the adapter invokes the target temperature setter on the device and updates the state with `ack: true` upon successful command dispatch

#### Scenario: Toggling power on a fan
- **WHEN** an ioBroker state change for `power` with value `true` and `ack: false` is received
- **THEN** the adapter calls `setPower(true)` on the fan and updates `power` to `true` with `ack: true`

#### Scenario: Command fails
- **WHEN** a command sent to the Dreo cloud fails or times out
- **THEN** the adapter logs a warning, does not acknowledge the requested value, and refreshes the device so the state reflects the actual device value

### Requirement: Manual Refresh Command
The adapter SHALL expose a button state `commands.manualRefresh` (role `button`, `read: false`, `write: true`) allowing users or scripts to immediately re-poll all registered Dreo devices and refresh their states.

#### Scenario: Triggering manual refresh
- **WHEN** `commands.manualRefresh` is written with `ack: false`
- **THEN** the adapter queries device states from the cloud, updates all changed device values, and acknowledges `commands.manualRefresh` with `ack: true`

### Requirement: Graceful Shutdown
The adapter SHALL release all resources when the instance is stopped.

#### Scenario: Adapter stopped
- **WHEN** the adapter instance is stopped or restarted
- **THEN** the adapter stops WebSocket monitoring, all adapter-managed timers are cleared, `info.connection` is set to `false`, and the unload callback is always invoked
