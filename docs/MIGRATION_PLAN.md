# Migration Plan: TypeScript & ESM Refactoring

> **Branch:** `refactor/typescript-esm-migration`  
> **Started:** January 2026  
> **Status:** Phase 0 - In Progress

## Overview

This document outlines the phased migration from CommonJS JavaScript to TypeScript ESM.
Each phase produces a **fully working app** that can be tested by users.

---

## 🔄 Commit Reminder

**Commit after completing each task!** Use meaningful commit messages:

```bash
git add -A && git commit -m "Phase X: <description>"
```

Suggested commit points:
- ✅ After each phase completion
- ✅ After adding new files that compile
- ✅ Before and after risky changes
- ✅ End of each work session

---

## Phase Summary

| Phase | Goal | Breaking? | Testable? | Est. Effort |
|-------|------|-----------|-----------|-------------|
| **0** | TypeScript infrastructure | No | Yes | 1-2 hours |
| **1** | Parallel TypeScript (new files only) | No | Yes | 2-3 hours |
| **2** | Convert existing JS → TS (one file at a time) | No | Yes | 4-6 hours |
| **3** | Extract modules from XComfortConnection | No | Yes | 4-6 hours |
| **4** | Full TypeScript (remove all .js) | Yes | Yes | 2-3 hours |
| **5** | Polish & P1/P2 features | No | Yes | Ongoing |

---

## Phase 0: Infrastructure Setup ✅ (Current)

**Goal:** Set up TypeScript tooling without breaking anything.

### Tasks

- [x] Create `tsconfig.json`
- [x] Update `package.json` with TypeScript scripts
- [x] Add `"type": "module"` for ESM
- [x] Create `lib/types.ts` with shared interfaces
- [x] Create `lib/utils/ValueConverters.ts`
- [x] Create barrel exports (`lib/index.ts`)
- [x] Update `.gitignore` for TypeScript outputs
- [x] Add basic unit test (`tests/ValueConverters.test.ts`)
- [ ] Verify `npm run build` compiles successfully
- [ ] Verify `npm test` runs successfully
- [ ] Create this migration plan document

### Test Criteria

```bash
npm install        # Should complete without errors
npm run build      # Should compile TypeScript to dist/
npm test           # Should run and pass tests
homey app validate # Should still validate (original JS intact)
```

### Commit Point

```bash
git add -A && git commit -m "Phase 0: TypeScript infrastructure setup"
```

---

## Phase 1: Parallel TypeScript

**Goal:** Write new code in TypeScript while keeping existing JS working.

### Strategy

The existing `.js` files continue to work unchanged.
New TypeScript files are added alongside them.
We import utilities from the new `dist/` output.

### Tasks

- [ ] Update `app.js` to import from `./dist/lib/index.js` for utilities
- [ ] Verify app still runs: `homey app run`
- [ ] Add TypeScript wrapper types for existing modules (`.d.ts` files)
- [ ] Create `lib/crypto/Encryption.ts` (extract from XComfortConnection)
- [ ] Create `lib/crypto/KeyExchange.ts` (extract from XComfortConnection)
- [ ] Write tests for crypto modules

### Test Criteria

```bash
npm run build      # Compiles all .ts files
npm test           # All tests pass
homey app run      # App starts, connects to bridge
# Manual test: Control a dimmer via Homey app
```

### Commit Point

```bash
git add -A && git commit -m "Phase 1: Parallel TypeScript with crypto extraction"
```

---

## Phase 2: Convert Existing Files

**Goal:** Convert existing JS files to TypeScript one at a time.

### Order of Conversion (lowest risk first)

1. [ ] `lib/XComfortProtocol.js` → `lib/protocol/constants.ts`
2. [ ] `lib/XComfortSceneManager.js` → `lib/scenes/SceneManager.ts`
3. [ ] `drivers/xcomfort-dimming-actuator/device.js` → `device.ts`
4. [ ] `drivers/xcomfort-dimming-actuator/driver.js` → `driver.ts`
5. [ ] `drivers/xcomfort-room/device.js` → `device.ts`
6. [ ] `drivers/xcomfort-room/driver.js` → `driver.ts`
7. [ ] `app.js` → `app.ts`

### Per-File Process

1. Rename `.js` → `.ts`
2. Add type annotations
3. Fix any TypeScript errors
4. Run `npm run build`
5. Test the app: `homey app run`
6. Commit

### Test Criteria

After each file conversion:
```bash
npm run build      # No errors
homey app run      # App works
# Manual test: Specific feature related to converted file
```

### Commit Points

Commit after each file conversion:
```bash
git add -A && git commit -m "Phase 2: Convert <filename> to TypeScript"
```

---

## Phase 3: Extract XComfortConnection

**Goal:** Break down the 1035-line monolith into focused modules.

### New Module Structure

```
lib/
├── connection/
│   ├── ConnectionManager.ts    # WebSocket lifecycle
│   ├── Authenticator.ts        # Login/auth flow
│   ├── MessageRouter.ts        # Message dispatch
│   └── XComfortBridge.ts       # Singleton facade
├── state/
│   ├── DeviceStateManager.ts   # Device state tracking
│   └── RoomStateManager.ts     # Room state tracking
```

### Extraction Order

1. [ ] Extract `ConnectionManager.ts` (WebSocket open/close/reconnect)
2. [ ] Extract `Authenticator.ts` (login, session management)
3. [ ] Extract `MessageRouter.ts` (message parsing, event dispatch)
4. [ ] Extract `DeviceStateManager.ts` (device state tracking)
5. [ ] Extract `RoomStateManager.ts` (room state tracking)
6. [ ] Create `XComfortBridge.ts` facade (singleton API)
7. [ ] Update `app.ts` to use new facade
8. [ ] Delete old `XComfortConnection.js`

### Test Criteria

After each extraction:
```bash
npm run build      # No errors
npm test           # All tests pass
homey app run      # App works
# Manual test: Full connection flow, device control
```

### Commit Points

Commit after each module extraction:
```bash
git add -A && git commit -m "Phase 3: Extract <ModuleName> from XComfortConnection"
```

---

## Phase 4: Full TypeScript

**Goal:** Remove all JavaScript files, TypeScript only.

### Tasks

- [ ] Verify all `.js` files are converted or deleted
- [ ] Update `app.json` if needed for entry point
- [ ] Update `package.json` main entry to `dist/app.js`
- [ ] Run full validation: `homey app validate`
- [ ] Test full user journey

### Test Criteria

```bash
npm run clean      # Remove any stray .js files
npm run build      # Full rebuild
npm run validate   # Homey validation passes
homey app run      # Full test
```

### Commit Point

```bash
git add -A && git commit -m "Phase 4: Complete TypeScript migration"
```

---

## Phase 5: Polish & P1/P2 Features

**Goal:** Add improvements and nice-to-have features.

### P1 Features (Should Have)

- [ ] Add connection health monitoring
- [ ] Implement proper reconnection backoff
- [ ] Add settings validation
- [ ] Improve error messages
- [ ] Add more unit tests

### P2 Features (Nice to Have)

- [ ] Add integration tests with mock bridge
- [ ] Add performance logging
- [ ] Generate API documentation
- [ ] Add GitHub Actions CI

### Test Criteria

```bash
npm test           # >80% code coverage
npm run validate   # Clean validation
```

---

## Quick Reference

### Common Commands

```bash
# Build TypeScript
npm run build

# Watch mode (auto-rebuild)
npm run build:watch

# Run tests
npm test

# Run app locally
homey app run

# Run with clean state
npm run dev

# Validate for App Store
npm run validate

# Clean build artifacts
npm run clean
```

### Current Phase Status

> **Update this section as you progress!**

| Checkpoint | Status | Date |
|------------|--------|------|
| Phase 0 started | ✅ | Jan 2026 |
| Phase 0 complete | ⏳ | - |
| Phase 1 started | ⏳ | - |
| Phase 1 complete | ⏳ | - |
| Phase 2 started | ⏳ | - |
| Phase 2 complete | ⏳ | - |
| Phase 3 started | ⏳ | - |
| Phase 3 complete | ⏳ | - |
| Phase 4 started | ⏳ | - |
| Phase 4 complete | ⏳ | - |
| Ready for release | ⏳ | - |

---

## Rollback Plan

If a phase breaks something:

1. **Don't panic** - we have commits for each working state
2. Identify which commit was last working: `git log --oneline`
3. Create a fix branch: `git checkout -b fix/<issue>`
4. Or revert to last working: `git revert HEAD`

The original code on `main` branch is always available as fallback.

---

## Notes for Testers

When testing a phase:

1. Pull the latest: `git pull origin refactor/typescript-esm-migration`
2. Install deps: `npm install`
3. Build: `npm run build`
4. Run: `homey app run`

**Report issues with:**
- Which phase you're testing
- Steps to reproduce
- Error messages (if any)
- Expected vs actual behavior
