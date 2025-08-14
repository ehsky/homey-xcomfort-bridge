# Homey xComfort Bridge App

This Homey app integrates Eaton xComfort Bridge devices with Homey Pro, providing full control over dimming actuators and room-level lighting management.

## Features

### Device Support

- **xComfort Bridge**: Central hub device with connection status monitoring
- **Dimming Actuators**: Individual light control with dimming, switching, and temperature monitoring
- **Room Controllers**: Multi-device room management with presence detection and environmental monitoring

### Capabilities

- **Lighting Control**: Full dimming (1-99%) and on/off switching
- **Temperature Monitoring**: Real-time temperature readings from compatible actuators
- **Room Management**: Aggregated control of multiple devices per room
- **Environmental Sensors**: Windows/doors status, motion detection, and presence monitoring
- **Power Monitoring**: Real-time power consumption tracking
- **Smart Dimming**: Setting dim level to 0% properly turns devices OFF (not minimum brightness)

### Advanced Features

- **Real-time Synchronization**: Instant state updates when devices are operated externally
- **Device Persistence**: Devices remain available in Flows even when bridge is offline
- **Coordinated Refresh**: Intelligent data polling to avoid overwhelming the bridge
- **Temperature Polling**: Automatic temperature data updates every 2-4 minutes

## Project Structure
- `/drivers/xcomfort-dimming-actuator/` - Driver for dimming actuators
- `/drivers/xcomfort-room/` - Driver for room-level control
- `/lib/XComfortConnection.js` - Shared connection logic to xComfort Bridge
- `app.js` - Main app coordinator
- `package.json` - Node.js dependencies and app metadata

## Setup Instructions

1. Install Homey CLI: `npm install -g homey`
2. Install dependencies: `npm install`
3. Run the app locally: `homey app run`
4. Pair devices via Homey app UI

## Technical Implementation

### Protocol Support

- **WebSocket Communication**: Full implementation of xComfort Bridge WebSocket protocol
- **AES-256-CBC Encryption**: Secure communication with RSA key exchange
- **Message Types**: Support for all essential message types (240, 242, 280, 281, 283, 284, 300, 310)
- **ACK Handling**: Proper acknowledgment of bridge messages for protocol compliance

### Device State Management

- **Real-time Updates**: Type 310 messages provide instant state synchronization
- **Combined Updates**: Efficient handling of device state and metadata in single updates
- **Temperature Data**: Smart parsing of info metadata for temperature readings (text codes 1109, 1222)

### Flow Integration

- **Device Control**: Turn devices on/off, set dim levels, control rooms
- **State Monitoring**: Monitor device states, temperature changes, room conditions
- **Trigger Cards**: React to device state changes, temperature thresholds, room events
- **Condition Cards**: Check device states, temperature values, room status

## Troubleshooting

### Common Issues

- **Initial Device States**: Devices show "unknown" state until first operated - this is normal xComfort Bridge behavior
- **Temperature Updates**: Temperature data refreshes every 2-4 minutes via automatic polling

### Debug Information

- All protocol communication is logged for troubleshooting
- Device discovery and state updates are clearly logged
- Connection status and reconnection attempts are tracked

## Acknowledgments

This project was greatly inspired by and built upon the work from [jankrib/xcomfort-python](https://github.com/jankrib/xcomfort-python), which provided insights into the xComfort Bridge WebSocket protocol implementation.

Special thanks to [@jankrib](https://github.com/jankrib) for the  Python implementation that served as a reference for understanding the xComfort Bridge communication protocol.

## References

- [Homey Apps SDK Documentation](https://apps.developer.homey.app/)
- [xComfort Python Library](https://github.com/jankrib/xcomfort-python) - Protocol reference implementation
- [Roborock Homey App Example](https://gitlab.com/functor-solutions/homey/roborock)
