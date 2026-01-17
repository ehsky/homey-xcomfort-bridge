# Homey xComfort Bridge App

[![Homey App](https://img.shields.io/badge/Homey-App-blue)](https://homey.app)
[![Eaton xComfort](https://img.shields.io/badge/Eaton-xComfort-green)](https://www.eaton.com)
[![Bridge Firmware](https://img.shields.io/badge/Bridge%20FW-4.01-brightgreen)](https://www.eaton.com)
[![SDK Version](https://img.shields.io/badge/Homey%20SDK-v3-orange)](https://apps.developer.homey.app)

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

```
├── app.mjs                          # Main app entry point (JavaScript ESM)
├── app.json                         # Homey app manifest
├── package.json                     # Node.js dependencies
├── tsconfig.json                    # TypeScript configuration
├── drivers/
│   ├── xcomfort-dimming-actuator/   # Dimming actuator driver
│   │   ├── device.mts               # TypeScript source (builds to .mjs)
│   │   └── driver.mts               # TypeScript source (builds to .mjs)
│   └── xcomfort-room/               # Room controller driver
│       ├── device.mts               # TypeScript source (builds to .mjs)
│       └── driver.mts               # TypeScript source (builds to .mjs)
├── lib/                             # Core library (TypeScript)
│   ├── XComfortConnection.mts       # WebSocket connection handler
│   ├── XComfortProtocol.mts         # Protocol constants & types
│   ├── XComfortSceneManager.mts     # Scene management
│   ├── types.mts                    # Shared TypeScript interfaces
│   ├── index.mts                    # Barrel exports
│   ├── crypto/                      # Encryption modules
│   │   ├── Encryption.mts           # AES-256-CBC
│   │   ├── Hash.mts                 # SHA-256 hashing
│   │   └── KeyExchange.mts          # RSA key exchange
│   └── utils/                       # Utility functions
│       └── ValueConverters.mts      # Dim value conversion
├── tests/                           # Unit tests
│   ├── Crypto.test.mts              # Crypto module tests
│   └── ValueConverters.test.mts     # Converter tests
├── .homeybuild/                     # Build output (git-ignored)
└── docs/                            # Documentation
    ├── ARCHITECTURE.md              # System architecture
    └── MIGRATION_PLAN.md            # TypeScript migration plan
```

## Development Setup

### Prerequisites

- **Node.js 22+** (required for ESM support)
- **Homey CLI**: `npm install -g homey`
- **TypeScript 5.7+** (installed as dev dependency)

### Installation

```bash
# Clone the repository
git clone https://github.com/ehsky/homey-xcomfort-bridge.git
cd homey-xcomfort-bridge

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Development Commands

```bash
# Build TypeScript to .homeybuild/
npm run build

# Watch mode (auto-rebuild on changes)
npm run build:watch

# Run unit tests (48 tests)
npm test

# Type-check without emitting
npm run lint

# Clean build output
npm run clean

# Run locally on Homey
homey app run

# Validate for App Store
homey app validate
```

### Running the App

1. Configure bridge settings in Homey app UI (bridge IP and auth key)
2. Run the app: `homey app run`
3. Pair devices via Homey app UI

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

## Technology Stack

- **Language**: TypeScript 5.7+ (library + drivers), JavaScript ESM (app entrypoint)
- **Runtime**: Node.js 22, Homey SDK v3
- **ESM Approach**: `.mts`/`.mjs` file extensions (Homey's official method)
- **Build Output**: `.homeybuild/` directory
- **Testing**: Node.js built-in test runner
- **Encryption**: AES-256-CBC with RSA key exchange (node-forge)

## Acknowledgments

This project was greatly inspired by and built upon the work from [jankrib/xcomfort-python](https://github.com/jankrib/xcomfort-python), which provided insights into the xComfort Bridge WebSocket protocol implementation.

Special thanks to [@jankrib](https://github.com/jankrib) for the  Python implementation that served as a reference for understanding the xComfort Bridge communication protocol.

## References

- [Homey Apps SDK Documentation](https://apps.developer.homey.app/)
- [xComfort Python Library](https://github.com/jankrib/xcomfort-python) - Protocol reference implementation
- [Roborock Homey App Example](https://gitlab.com/functor-solutions/homey/roborock)
