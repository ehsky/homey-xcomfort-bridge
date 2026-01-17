# Copilot Instructions for homey-xcomfort-bridge

## Project Overview

This is a **Homey Smart Home app** that integrates with the **xComfort Bridge** hardware device. It allows Homey to control xComfort dimming actuators, rooms, and scenes.

## ⚠️ Reverse Engineering Project - Logging Policy

**This is a reverse-engineered hardware integration.** The xComfort protocol was decoded through observation, not official documentation. This means:

1. **Unknown devices may appear** - Users may have xComfort devices not yet supported
2. **Protocol variations exist** - Different firmware versions may behave differently
3. **Logging is essential for discovery** - Logs help developers and users identify unsupported features

### Logging Guidelines

```typescript
// ✅ DO: Log unknown message types or device types
this.log(`Unknown message type received: ${messageType}`, data);
this.log(`Unrecognized device type: ${deviceType} for device ${deviceId}`);

// ✅ DO: Log connection state changes
this.log('Bridge connected successfully');
this.log('Connection lost, attempting reconnect...');

// ✅ DO: Log protocol-level data for debugging (at appropriate level)
this.log(`Received device update: ${deviceId} → ${JSON.stringify(state)}`);

// ⚠️ AVOID: Excessive logging in tight loops
// ❌ for (const msg of messages) { this.log(msg); }

// ⚠️ AVOID: Logging sensitive data
// ❌ this.log(`Password: ${password}`);
```

### When to Add Logging

- **Unknown values**: Message types, device types, status codes not in our constants
- **State transitions**: Connection, authentication, device discovery
- **Error conditions**: Failed commands, protocol errors, timeouts
- **User-actionable events**: Device added, scene triggered, room updated

### Log Levels

Homey SDK provides two logging methods (inherited from `Homey.SimpleClass`):

| Method | Use For |
|--------|---------|
| `this.log()` | Info-level: state changes, unknown items, operational events |
| `this.error()` | Errors that need attention, failed operations |

> **Note:** There is no `this.debug()` in Homey SDK. Use `this.log()` for all non-error messages. Homey automatically prefixes logs with the class name.

This logging helps the community discover and add support for new xComfort devices.

## Critical Architecture Constraint

**All devices are virtual representations that communicate through a SINGLE bridge connection.**

```
┌─────────────────────────────────────────────────────────────────┐
│  Virtual Devices (DimmingDevice, RoomDevice, etc.)              │
│         │              │              │                         │
│         └──────────────┼──────────────┘                         │
│                        ▼                                        │
│              ┌───────────────────┐                              │
│              │  XComfortBridge   │  ◄── SINGLETON               │
│              │  (Single Gateway) │                              │
│              └─────────┬─────────┘                              │
└────────────────────────┼────────────────────────────────────────┘
                         ▼ WebSocket
              ┌─────────────────────┐
              │  Physical xComfort  │
              │      Bridge         │
              └─────────────────────┘
```

- **Never** create multiple bridge instances
- **Always** access the bridge through `this.homey.app.bridge`
- **All** device commands flow through the single WebSocket connection

## Documentation

Before making changes, read:
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Code structure, module design, migration plan
- **[docs/HOMEY_STANDARDS.md](docs/HOMEY_STANDARDS.md)** - Homey SDK guidelines, TypeScript setup, App Store requirements

## Technology Stack

| Technology | Version | Notes |
|------------|---------|-------|
| Homey SDK | v3 | `this.homey` pattern, async-only APIs |
| Node.js | 22 | Native fetch, ESM support |
| TypeScript | 5.3+ | Strict mode, ESM output |
| Homey Compatibility | ≥12.0.1 | ESM support required |

## Code Style

### TypeScript Patterns

```typescript
// ✅ Correct: Type everything, use async/await
import Homey from 'homey';
import { XComfortBridge } from './lib/index.js';

class App extends Homey.App {
  public bridge: XComfortBridge | null = null;

  async onInit(): Promise<void> {
    // Initialize bridge singleton
  }

  async onUninit(): Promise<void> {
    // Clean up resources
  }
}

export default App;
```

```typescript
// ✅ Correct: Access bridge from devices
class DimmingDevice extends Homey.Device {
  private get bridge(): XComfortBridge {
    const bridge = this.homey.app.bridge;
    if (!bridge) throw new Error('Bridge not initialized');
    return bridge;
  }

  async onCapabilityDim(value: number): Promise<void> {
    await this.bridge.setDimmerValue(this.deviceId, value);
  }
}
```

### Don'ts

```typescript
// ❌ Wrong: CommonJS
const Homey = require('homey');
module.exports = App;

// ❌ Wrong: Creating new bridge instances
const bridge = new XComfortBridge(config);

// ❌ Wrong: Using console.log
console.log('Debug message');

// ❌ Wrong: Not cleaning up listeners
this.bridge.devices.subscribe(id, callback); // No unsubscribe stored!
```

### Do's

```typescript
// ✅ Correct: ESM imports
import Homey from 'homey';
export default App;

// ✅ Correct: Use singleton
const bridge = this.homey.app.bridge;

// ✅ Correct: Use Homey logging
this.log('Info message');
this.error('Error message');

// ✅ Correct: Store unsubscribe function
private unsubscribe?: () => void;

async onInit() {
  this.unsubscribe = this.bridge.devices.subscribe(id, callback);
}

async onUninit() {
  this.unsubscribe?.();
}
```

## Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `lib/connection/XComfortBridge.ts` | Singleton facade, public API |
| `lib/connection/ConnectionManager.ts` | WebSocket lifecycle |
| `lib/connection/Authenticator.ts` | Handshake, token management |
| `lib/crypto/Encryption.ts` | AES-256-CBC encrypt/decrypt |
| `lib/messaging/CommandBuilder.ts` | Build protocol messages |
| `lib/state/DeviceStateManager.ts` | Device state & listeners |
| `lib/utils/ValueConverters.ts` | Homey ↔ xComfort value conversion |

## Value Conversion

xComfort uses 1-99 for dim values, Homey uses 0-1:

```typescript
// lib/utils/ValueConverters.ts
export function homeyToXComfort(value: number): number {
  if (value === 0) return 0; // Off
  return Math.max(1, Math.min(99, Math.round(value * 99)));
}

export function xComfortToHomey(value: number): number {
  return Math.max(0, Math.min(1, value / 99));
}
```

## File Size Limit

**No file should exceed 200 lines.** If a file grows larger, split it into focused modules.

## Testing

Use Node.js built-in test runner:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { homeyToXComfort } from '../lib/utils/ValueConverters.js';

describe('ValueConverters', () => {
  it('converts Homey 0 to xComfort 0', () => {
    assert.strictEqual(homeyToXComfort(0), 0);
  });
});
```

## Homey SDK v3 Key Points

1. **Access managers through `this.homey`**, not `require('homey')`
2. **`App.onInit()` runs before Driver and Device `onInit()`**
3. **Promise-only APIs** - no callbacks
4. **Use `this.homey.setTimeout/setInterval`** for auto-cleanup
5. **Implement `onUninit()`** for cleanup

## App Store Checklist

Before publishing, ensure:
- [ ] App name ≤ 4 words, uses brand name
- [ ] Description is a catchy one-liner
- [ ] README.txt is 1-2 paragraphs, no markdown/URLs
- [ ] All images meet size requirements
- [ ] Icons have transparent backgrounds
- [ ] Flow card titles are clear and short
- [ ] `homey app validate` passes
- [ ] TypeScript compiles without errors
