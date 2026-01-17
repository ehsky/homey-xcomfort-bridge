# xComfort Bridge - Architecture & Code Structure

> **Document Purpose**: This document outlines the target architecture for the homey-xcomfort-bridge app. It serves as a reference for refactoring the codebase to improve maintainability, testability, and developer experience.

---

## 1. Current State Analysis

### 1.1 Problems Identified

| Issue | Impact | Priority |
|-------|--------|----------|
| `XComfortConnection.js` is 1,035 lines with 8+ responsibilities | Hard to maintain, test, and extend | 🔴 Critical |
| No listener cleanup on device deletion | Memory leaks over time | 🔴 High |
| Duplicate dim value conversion logic | Code duplication, inconsistent behavior | 🟡 Medium |
| Console.log scattered throughout | No log levels, hard to debug | 🟡 Medium |
| CommonJS syntax (require/module.exports) | Not aligned with modern Homey SDK | 🟡 Medium |
| No unit tests | Regression risk | 🟡 Medium |
| No JSDoc for public APIs | Poor developer experience | 🟢 Low |

### 1.2 Current File Structure

```
lib/
├── XComfortConnection.js  (1,035 lines - handles everything)
├── XComfortProtocol.js    (202 lines - constants only)
└── XComfortSceneManager.js (100 lines - scene management)
```

---

## 2. Target Architecture

### 2.1 Design Principles

1. **Single Bridge Gateway**: All device/room communication flows through ONE bridge connection
2. **Single Responsibility Principle (SRP)**: Each module handles one concern
3. **Dependency Injection**: Pass dependencies explicitly for testability
4. **Event-Driven Architecture**: Use EventEmitter pattern for loose coupling
5. **Fail-Fast with Recovery**: Validate early, handle errors gracefully
6. **TypeScript-First**: Strong typing for better developer experience and fewer runtime errors

### 2.2 Critical Constraint: Single Bridge Communication

```
┌─────────────────────────────────────────────────────────────────┐
│                         Homey App                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ DimmingDevice│  │ DimmingDevice│  │  RoomDevice  │  ...     │
│  │    (D1)      │  │    (D2)      │  │    (R1)      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────────┬┴─────────────────┘                   │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │    XComfortBridge     │  ◄── SINGLE INSTANCE     │
│              │  (Facade/Gateway)     │                          │
│              └───────────┬───────────┘                          │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼ WebSocket
                ┌─────────────────────┐
                │   xComfort Bridge   │
                │   (Physical Device) │
                └─────────────────────┘
```

**Why this matters:**
- All virtual devices (dimmers, rooms, scenes) are representations of entities on the physical bridge
- There is exactly ONE WebSocket connection to the bridge
- All commands must be serialized through this single connection
- State updates from the bridge must be routed to the appropriate virtual devices
- The bridge facade must be a **singleton** managed by the App class

### 2.3 Target File Structure

```
lib/
├── index.ts                         # Public API exports                    🔴 P0
├── types.ts                         # Shared TypeScript interfaces          🔴 P0
│
├── connection/                      # 🔴 P0 - Core connection layer
│   ├── index.ts
│   ├── XComfortBridge.ts            # Facade: SINGLETON gateway (~150 lines)
│   ├── ConnectionManager.ts         # WebSocket lifecycle (~200 lines)
│   └── Authenticator.ts             # Handshake & token (~150 lines)
│
├── crypto/                          # 🔴 P0 - Required for communication
│   ├── index.ts
│   ├── Encryption.ts                # AES-256-CBC (~100 lines)
│   └── KeyExchange.ts               # RSA key exchange (~50 lines)
│
├── state/                           # 🟡 P1 - Important for cleanup
│   ├── index.ts
│   ├── DeviceStateManager.ts        # Device state & listeners (~150 lines)
│   ├── RoomStateManager.ts          # Room state & listeners (~100 lines)
│   └── SceneManager.ts              # Scene management (~100 lines)
│
├── protocol/                        # 🟡 P1 - Cleaner message handling
│   ├── index.ts
│   ├── constants.ts                 # MESSAGE_TYPES, ERROR_CODES (~100 lines)
│   └── validators.ts                # Input validation (~50 lines)
│
├── messaging/                       # 🟢 P2 - Nice to have separation
│   ├── index.ts
│   ├── MessageRouter.ts             # Route by type (~100 lines)
│   ├── MessageParser.ts             # Decrypt & parse (~80 lines)
│   ├── CommandBuilder.ts            # Build commands (~100 lines)
│   └── AckManager.ts                # Track ACKs (~50 lines)
│
└── utils/                           # Mixed priority
    ├── index.ts
    ├── ValueConverters.ts           # Dim conversions (~40 lines)       🔴 P0
    ├── Logger.ts                    # Structured logging (~80 lines)    🟢 P2
    ├── RetryManager.ts              # Backoff retry (~60 lines)         🟢 P2
    └── EventEmitterPlus.ts          # Enhanced emitter (~50 lines)      🟢 P2

drivers/
├── base/
│   └── XComfortDevice.ts            # Shared functionality (~150 lines) 🟡 P1
├── xcomfort-dimming-actuator/
│   ├── device.ts                    # Extends XComfortDevice (~100 lines)
│   └── driver.ts                    # Device discovery (~60 lines)
└── xcomfort-room/
    ├── device.ts                    # Extends XComfortDevice (~100 lines)
    └── driver.ts                    # Room discovery (~60 lines)
```

### 2.4 Core TypeScript Interfaces

```typescript
// lib/types.ts - Shared interfaces

// Configuration
export interface BridgeConfig {
  ip: string;
  authKey: string;
  logger?: LoggerFunction;
  reconnectDelay?: number;
  heartbeatInterval?: number;
}

export type LoggerFunction = (...args: unknown[]) => void;

// Connection State
export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'authenticating' 
  | 'connected' 
  | 'error';

// Device Types
export interface XComfortDevice {
  deviceId: string;
  name: string;
  devType: number;
  dimmable: boolean;
  info?: DeviceInfo[];
}

export interface DeviceInfo {
  text: string;
  value: string | number;
}

export interface DeviceState {
  switch?: boolean;
  dimmvalue?: number;
  power?: number;
  metadata?: DeviceMetadata;
}

export interface DeviceMetadata {
  temperature?: number;
  humidity?: number;
}

// Room Types
export interface XComfortRoom {
  roomId: string;
  name: string;
  devices: string[];
}

export interface RoomState {
  switch?: boolean;
  dimmvalue?: number;
  lightsOn?: number;
  loadsOn?: number;
  windowsOpen?: number;
  doorsOpen?: number;
  presence?: number;
  power?: number;
}

// Scene Types
export interface XComfortScene {
  sceneId: number;
  name: string;
  devices?: SceneDevice[];
}

export interface SceneDevice {
  deviceId: string;
  value: number;
}

// Protocol Messages
export interface ProtocolMessage {
  type_int: number;
  mc?: number;
  ref?: number;
  payload?: Record<string, unknown>;
}

// Event Types
export type BridgeEventMap = {
  connected: [];
  disconnected: [code: number, reason: string];
  reconnecting: [attempt: number];
  error: [error: Error];
  deviceStateChange: [deviceId: string, state: DeviceState];
  roomStateChange: [roomId: string, state: RoomState];
};

// Listener Management
export type UnsubscribeFunction = () => void;
export type StateListener<T> = (id: string, state: T) => void;
```

---

## 3. Module Specifications

### 3.1 Connection Layer

#### `XComfortBridge.ts` (Singleton Facade)
The **single gateway** for all bridge communication. Must be instantiated once by the App class.

```typescript
// Usage from app.ts - SINGLETON pattern
import { XComfortBridge, type BridgeConfig } from './lib/index.js';

class App extends Homey.App {
  public bridge: XComfortBridge | null = null;

  async onInit() {
    const config: BridgeConfig = {
      ip: this.homey.settings.get('bridge_ip'),
      authKey: this.homey.settings.get('auth_key'),
      logger: this.log.bind(this)
    };
    
    this.bridge = new XComfortBridge(config);
    await this.bridge.connect();
    
    // Route state updates to virtual devices
    this.bridge.on('deviceStateChange', (deviceId, state) => {
      // Devices subscribe via this.homey.app.bridge
    });
  }
}
```

```typescript
// Usage from device.ts - access singleton
class DimmingDevice extends XComfortDevice {
  async onCapabilityDim(value: number) {
    const bridge = this.homey.app.bridge;
    if (!bridge?.isConnected) {
      throw new Error('Bridge not connected');
    }
    await bridge.setDimmerValue(this.deviceId, homeyToXComfort(value));
  }
}
```

**Responsibilities:**
- Be the SINGLE point of communication with physical bridge
- Instantiate and wire up all sub-modules
- Provide a simple public API for devices
- Route incoming state updates to registered listeners
- Manage connection lifecycle

#### `ConnectionManager.ts`
Manages WebSocket lifecycle.

**Responsibilities:**
- Open/close WebSocket connections
- Handle reconnection with exponential backoff
- Emit connection state events

**Events:**
- `connected`
- `disconnected`
- `reconnecting`
- `error`

#### `Authenticator.ts`
Handles the multi-step authentication flow.

**Responsibilities:**
- Process handshake messages (types 10-17)
- Manage token lifecycle (types 30-38)
- Store authentication state

### 3.2 Crypto Layer

#### `Encryption.ts`
Pure encryption/decryption utilities.

```typescript
// API
export function encrypt(plaintext: string, key: Buffer, iv: Buffer): string;
export function decrypt(ciphertext: string, key: Buffer, iv: Buffer): string;
export function padToBlockSize(buffer: Buffer): Buffer;
export function encrypt(plaintext, key, iv) { ... }
export function decrypt(ciphertext, key, iv) { ... }
export function padToBlockSize(buffer) { ... }
```

#### `KeyExchange.mjs`
RSA key exchange for initial secret setup.

```javascript
// API
export function generateAesKeys() { ... }
export function encryptWithPublicKey(data, publicKeyPem) { ... }
```

### 3.3 Messaging Layer

#### `MessageRouter.mjs`
Routes incoming messages to appropriate handlers.

```javascript
class MessageRouter {
  constructor() {
    this.handlers = new Map();
  }
  
  register(messageType, handler) { ... }
  route(message) { ... }
}
```

#### `CommandBuilder.mjs`
Builds protocol-compliant command messages.

```javascript
// API
export function buildSwitchCommand(deviceId, state, mc) { ... }
export function buildDimCommand(deviceId, value, mc) { ... }
export function buildRoomCommand(roomId, action, value, mc) { ... }
export function buildSceneCommand(sceneId, mc) { ... }
```

#### `AckManager.mjs`
Tracks pending acknowledgments.

```javascript
class AckManager {
  expect(mc, timeout = 5000) { ... }  // Returns Promise
  receive(ref) { ... }                 // Resolves pending Promise
  cleanup() { ... }                    // Clear all pending
}
```

### 3.4 State Layer

#### `DeviceStateManager.mjs`
Manages device state and listeners with proper cleanup.

```javascript
class DeviceStateManager extends EventEmitter {
  // State storage
  getDevice(deviceId) { ... }
  updateDevice(deviceId, state) { ... }
  
  // Listener management with cleanup
  addListener(deviceId, callback) { return removeFunction; }
  removeListener(deviceId, callback) { ... }
  removeAllListeners(deviceId) { ... }
  
  // Parse metadata
  parseInfoMetadata(infoArray) { ... }
}
```

### 3.5 Utils Layer

#### `Logger.mjs`
Structured logging with levels.

```javascript
class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || '[XComfort]';
    this.output = options.output || console.log;
  }
  
  debug(message, ...args) { ... }
  info(message, ...args) { ... }
  warn(message, ...args) { ... }
  error(message, ...args) { ... }
}
```

#### `ValueConverters.mjs`
Centralized value conversion logic.

```javascript
// Homey uses 0-1 range, xComfort uses 1-99
export function homeyToXComfort(value) {
  if (value === 0) return 0; // Special case: off
  return Math.max(1, Math.min(99, Math.round(value * 99)));
}

export function xComfortToHomey(value) {
  return Math.max(0, Math.min(1, value / 99));
}
```

#### `RetryManager.mjs`
Configurable retry logic with exponential backoff.

```javascript
class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 60000;
  }
  
  async execute(fn, context = 'operation') { ... }
  calculateDelay(attempt) { ... }
  reset() { ... }
}
```

### 3.6 Base Device Class

#### `XComfortDevice.mjs`
Shared functionality for all device types.

```javascript
import Homey from 'homey';
import { homeyToXComfort, xComfortToHomey } from '../lib/utils/ValueConverters.mjs';

export default class XComfortDevice extends Homey.Device {
  async onInit() {
    await this.ensureCapabilities();
    this.setupStateListener();
  }
  
  async onUninit() {
    this.cleanupListeners();
  }
  
  // Shared methods
  getConnection() { ... }
  isConnected() { ... }
  setupStateListener() { ... }
  cleanupListeners() { ... }
  
  // To be implemented by subclasses
  getRequiredCapabilities() { throw new Error('Must implement'); }
  getDeprecatedCapabilities() { return []; }
  handleStateUpdate(stateData) { throw new Error('Must implement'); }
}
```

---

## 4. Migration Strategy

### Priority Legend

| Priority | Meaning |
|----------|---------|
| 🔴 **P0** | Must have - Core functionality, blocking publish |
| 🟡 **P1** | Should have - Important for maintainability |
| 🟢 **P2** | Nice to have - Polish, can defer |

### Phase 1: Foundation & TypeScript Setup (Week 1) 🔴 P0
1. ✅ Create documentation (this file)
2. Set up TypeScript configuration (`tsconfig.json`)
3. Install TypeScript and type definitions
4. Create `lib/types.ts` with shared interfaces
5. Extract `ValueConverters.ts` (removes duplicate code)
6. Update app.js → app.ts

### Phase 2: Core Refactoring (Week 2-3) 🔴 P0
1. Extract `Encryption.ts` and `KeyExchange.ts`
2. Extract `ConnectionManager.ts` (WebSocket lifecycle)
3. Extract `Authenticator.ts` (handshake flow)
4. Create `XComfortBridge.ts` singleton facade
5. Fix listener cleanup (memory leak fix)

### Phase 3: State Management (Week 4) 🟡 P1
1. Extract `DeviceStateManager.ts` with proper cleanup
2. Extract `RoomStateManager.ts`
3. Move `XComfortSceneManager` → `SceneManager.ts`
4. Define state interfaces (DeviceState, RoomState, etc.)

### Phase 4: Drivers & Base Class (Week 5) 🟡 P1
1. Create `XComfortDevice.ts` base class
2. Refactor `DimmingActuatorDevice` to extend base
3. Refactor `RoomDevice` to extend base
4. Convert driver files to TypeScript

### Phase 5: Messaging Layer (Week 6) 🟢 P2
1. Extract `MessageParser.ts` and `CommandBuilder.ts`
2. Extract `AckManager.ts`
3. Create `MessageRouter.ts` with handler registration
4. Define message types and payload interfaces

### Phase 6: Polish (Week 7+) 🟢 P2
1. Add `Logger.ts` utility (optional - can use `this.log`)
2. Add `RetryManager.ts` (optional - can use simple setTimeout)
3. Add `EventEmitterPlus.ts` (optional - can use native)
4. Complete unit test coverage
5. Update README.md
6. Configure CI/CD pipeline

---

## 5. API Compatibility

### 5.1 Breaking Changes

The following changes will break existing code:

1. **Import paths change**: 
   ```typescript
   // Old (CommonJS)
   const XComfortConnection = require('./lib/XComfortConnection');
   
   // New (TypeScript/ESM)
   import { XComfortBridge } from './lib/index.js';
   ```

2. **Constructor options**:
   ```typescript
   // Old
   new XComfortConnection(bridgeIp, authKey);
   
   // New (typed config object)
   const config: BridgeConfig = {
     ip: bridgeIp,
     authKey: authKey,
     logger: this.log
   };
   new XComfortBridge(config);
   ```

3. **Singleton access pattern**:
   ```typescript
   // Old - devices create their own reference
   const connection = app.getConnection();
   
   // New - access singleton through app
   const bridge = this.homey.app.bridge;
   if (!bridge) throw new Error('Bridge not initialized');
   ```

4. **Listener management**:
   ```typescript
   // Old
   connection.addDeviceStateListener(deviceId, callback);
   // No way to remove!
   
   // New (returns unsubscribe function)
   const unsubscribe = bridge.devices.subscribe(deviceId, callback);
   // In onUninit:
   unsubscribe();
   ```

5. **Type safety**:
   ```typescript
   // Old - runtime errors
   await connection.setDimmerValue(deviceId, 'not a number');
   
   // New - compile-time errors
   await bridge.setDimmerValue(deviceId, value); // value must be number
   ```

### 5.2 Backward Compatibility Layer (Optional)

If needed, we can create a compatibility wrapper:

```javascript
// lib/compat/XComfortConnection.mjs
import { XComfortBridge } from '../index.mjs';

/** @deprecated Use XComfortBridge instead */
export default class XComfortConnection {
  constructor(bridgeIp, authKey) {
    console.warn('XComfortConnection is deprecated. Use XComfortBridge instead.');
    this._bridge = new XComfortBridge({ ip: bridgeIp, authKey });
  }
  // ... delegate all methods to _bridge
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

Each extracted module should have corresponding tests:

```
tests/
├── unit/
│   ├── crypto/
│   │   ├── Encryption.test.mjs
│   │   └── KeyExchange.test.mjs
│   ├── messaging/
│   │   ├── CommandBuilder.test.mjs
│   │   └── AckManager.test.mjs
│   ├── state/
│   │   └── DeviceStateManager.test.mjs
│   └── utils/
│       ├── ValueConverters.test.mjs
│       └── RetryManager.test.mjs
└── integration/
    └── XComfortBridge.test.mjs
```

### 6.2 Test Framework

Use Node.js built-in test runner (available in Node 22):

```javascript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { homeyToXComfort } from '../lib/utils/ValueConverters.mjs';

describe('ValueConverters', () => {
  it('converts 0 to 0 (off)', () => {
    assert.strictEqual(homeyToXComfort(0), 0);
  });
  
  it('converts 1 to 99 (max)', () => {
    assert.strictEqual(homeyToXComfort(1), 99);
  });
});
```

---

## 7. Success Criteria

- [ ] No file exceeds 200 lines
- [ ] All public APIs have TypeScript types
- [ ] Test coverage > 80% for utility modules
- [ ] Memory leaks fixed (listeners properly removed)
- [ ] TypeScript compiles with strict mode
- [ ] App passes `homey app validate`
- [ ] App passes `homey app run` without errors
- [ ] Single bridge instance pattern enforced

---

## 8. Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|  
| SDK Version | v3 only | Modern async APIs, required for Homey v5.0.0+ |
| Minimum Homey | v12.0.1+ | ESM support, Node.js 22 |
| Language | TypeScript | Type safety, better DX, fewer runtime errors |
| Module System | ESM | Required by Homey, modern standard |
| Bridge Pattern | Singleton | All devices must share one connection |

---

*Document Version: 1.0*  
*Last Updated: 2026-01-17*  
*Author: Code Review Session*
