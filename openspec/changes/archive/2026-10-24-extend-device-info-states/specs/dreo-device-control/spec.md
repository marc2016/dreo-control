# Spec Delta

## ADDED Requirements

### Requirement: Device Information States
The adapter SHALL expose a read-only information state `info.product` with the product name for every device, in addition to the existing `info.model` and `info.name`.

#### Scenario: Product name from brand and series
- **WHEN** the cloud reports brand `Dreo` and series `316S` for a device
- **THEN** the adapter sets `info.product` to `Dreo 316S`

#### Scenario: Product series not reported
- **WHEN** the cloud reports no series for a device
- **THEN** the adapter sets `info.product` to the reported product name, or to the model if no product name is reported

### Requirement: Accurate Device Online Status
The adapter SHALL derive `info.online` from the connection status reported in the device state and keep it updated with every polling cycle and real-time update.

#### Scenario: Device reachable
- **WHEN** the device state reports the device as connected
- **THEN** the adapter sets `info.online` to `true` with `ack: true`

#### Scenario: Device goes offline
- **WHEN** the device loses its connection to the Dreo cloud and the next device state reports it as not connected
- **THEN** the adapter sets `info.online` to `false` with `ack: true`

#### Scenario: Connection status not reported
- **WHEN** the device state contains no connection status
- **THEN** the adapter falls back to the online flag of the device list, assuming online if none is reported
