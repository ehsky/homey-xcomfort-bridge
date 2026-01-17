# Migration Plan: TypeScript & ESM Refactoring

> **Branch:** `refactor/typescript-esm-migration`  
> **Started:** January 2026  
> **Status:** Phase 0 ✅ Complete | Phase 1 - Ready

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

| Phase | Goal | Breaking? | Testable? | Est. Effort | Status |
|-------|------|-----------|-----------|-------------|--------|
| **0** | TypeScript infrastructure | No | Yes | 1-2 hours | ✅ Done |
| **1** | ESM conversion + crypto extraction | Yes | Yes | 3-4 hours | ✅ Done |
| **2** | Convert existing JS → TS (one file at a time) | No | Yes | 4-6 hours | ✅ Done |
| **3** | Extract modules from XComfortConnection | No | Yes | 4-6 hours | |
| **4** | Full TypeScript (except app.mjs entrypoint) | Yes | Yes | 2-3 hours | |
| **5** | Polish & P1/P2 features | No | Yes | Ongoing | |

---

## ESM Lessons Learned

> **Key Discovery:** Homey's official ESM approach uses `.mjs` file extensions, NOT `"type": "module"` in package.json.

**What we tried that failed:**
1. ❌ `"type": "module"` + `.js` files → `require is not defined`
2. ❌ Dual exports (`export default` + `module.exports`) → `module is not defined`

**What works:**
- ✅ Use `.mjs` extension for JavaScript ESM files
- ✅ Use `.mts` extension for TypeScript ESM files (compiles to `.mjs`)
- ✅ No `"type": "module"` in package.json
- ✅ `"main": "app.mjs"` in package.json
- ✅ `"compatibility": ">=12.0.1"` in app.json (ESM requires Homey v12+)

---

## Phase 0: Infrastructure Setup ✅ COMPLETE

**Goal:** Set up TypeScript tooling without breaking anything.

### Tasks

- [x] Create `tsconfig.json`
- [x] Update `package.json` with TypeScript scripts
- [x] Create `lib/types.mts` with shared interfaces
- [x] Create `lib/utils/ValueConverters.mts`
- [x] Create barrel exports (`lib/index.mts`)
- [x] Update `.gitignore` for TypeScript outputs
- [x] Add basic unit test (`tests/ValueConverters.test.mts`)
- [x] Verify `npm run build` compiles successfully
- [x] Verify `npm test` runs successfully (23 tests passing)
- [x] Create this migration plan document

### Commit

```
5deed68 - Phase 0: TypeScript infrastructure setup
```

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

## Phase 1: ESM Conversion + Crypto Extraction ✅ COMPLETE

**Goal:** Convert to ESM using Homey's official `.mjs` approach and extract crypto modules.

### ESM Conversion

- [x] Rename `app.js` → `app.mjs`
- [x] Rename `lib/XComfortConnection.js` → `lib/XComfortConnection.mjs`
- [x] Rename `lib/XComfortProtocol.js` → `lib/XComfortProtocol.mjs`
- [x] Rename `lib/XComfortSceneManager.js` → `lib/XComfortSceneManager.mjs`
- [x] Rename all driver files to `.mjs`
- [x] Convert `require()` to `import` syntax in all files
- [x] Convert `module.exports` to `export default`
- [x] Update `package.json`: `"main": "app.mjs"` (no `"type": "module"`)
- [x] Update `app.json`: `"compatibility": ">=12.0.1"`
- [x] Verify `homey app run` connects successfully

### Crypto Module Extraction

- [x] Create `lib/crypto/Encryption.mts` (AES-256-CBC)
- [x] Create `lib/crypto/Hash.mts` (authHash, generateSalt)
- [x] Create `lib/crypto/KeyExchange.mts` (RSA public key handling)
- [x] Create `lib/crypto/index.mts` (barrel export)
- [x] Write tests for crypto modules (`tests/Crypto.test.mts`)
- [x] Verify 48 tests pass

### TypeScript File Extensions

- [x] Rename all `.ts` files to `.mts` for ESM output
- [x] Update all imports to use `.mjs` extension
- [x] Verify TypeScript compiles to `.mjs` files

### Test Criteria

```bash
npm run build      # ✅ Compiles all .mts files to .mjs
npm test           # ✅ 48 tests pass
npm run lint       # ✅ No TypeScript errors
homey app validate # ✅ Validates (except missing images)
homey app run      # ✅ Connects to bridge, authenticates
```

### Commit Point

```bash
git add -A && git commit -m "Phase 1: ESM conversion + crypto extraction"
```

---

## Phase 2: Convert Library Files to TypeScript ✅ COMPLETE

**Goal:** Convert library files to TypeScript one at a time.

> **Discovery:** The Homey CLI does NOT compile `app.mts` or `app.ts` files - it only copies existing `.mjs` files. The app entry point must remain as JavaScript ESM for now.

### Order of Conversion (library files)

1. [x] `lib/XComfortProtocol.mjs` → `lib/XComfortProtocol.mts` ✅
2. [x] `lib/XComfortSceneManager.mjs` → `lib/XComfortSceneManager.mts` ✅
3. [x] `lib/XComfortConnection.mjs` → `lib/XComfortConnection.mts` ✅ (1035 lines - fully typed)

### Kept as JavaScript ESM (Homey CLI limitation)

- `app.mjs` - Entry point (Homey CLI doesn't compile .mts app files)
- Driver files - Require Homey runtime (will convert in Phase 4)

### Per-File Process

1. Create new `.mts` file with TypeScript code
2. Add type annotations and interfaces
3. Run `npm run build` - verify no errors
4. Delete old `.mjs` file
5. Run `npm test` - verify tests pass
6. Run `homey app run` - verify app works
7. Commit

### Test Criteria

After each file conversion:
```bash
npm run build      # No errors
npm test           # All tests pass
homey app run      # App works
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

- [x] Convert driver files to `.mts` (compiled output is `.mjs`)
- [x] Keep `app.mjs` as the JS ESM entrypoint (Homey CLI limitation)
- [x] Verify all other `.js`/`.mjs` sources are converted or deleted
- [x] Update `app.json` if needed for entry point
- [x] Confirm `package.json` main entry remains `app.mjs`
- [x] Run full validation: `homey app validate` (publish warns about missing driver images)
- [x] Test full user journey

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

## Phase 5: Test Coverage & Reliability

**Goal:** Add targeted tests for the current implementation and lock in behavior.

> **Final Phase:** Once Phase 5 is complete, the migration plan is considered done.

### Tasks

- [ ] Add MessageHandler state update tests (type 310 payloads)
- [ ] Add device discovery tests (type 300 payloads)
- [ ] Add room discovery tests (type 300 payloads)
- [ ] Add scene discovery tests (type 300 payloads)
- [ ] Add driver pairing tests for room and dimming drivers
- [ ] Add device capability update tests (onoff/dim/temperature)
- [ ] Add room capability update tests (onoff/dim/power/contacts/presence)

### Test Criteria

```bash
npm test           # All tests pass
npm run validate   # Clean validation (images aside)
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

| Checkpoint | Status | Date | Commit |
|------------|--------|------|--------|
| Phase 0 started | ✅ | Jan 2026 | - |
| Phase 0 complete | ✅ | Jan 2026 | 5deed68 |
| Phase 1 started | ✅ | Jan 2026 | - |
| Phase 1 complete | ✅ | Jan 2026 | 8b904e6 |
| Phase 2 started | ✅ | Jan 2026 | 6de1025 |
| Phase 2 complete | ✅ | Jan 2026 | 64c9560 |
| Phase 3 started | ✅ | Jan 2026 | - |
| Phase 3 complete | ✅ | Jan 2026 | abbcaad |
| Phase 4 started | ✅ | Jan 2026 | - |
| Phase 4 complete | ✅ | Jan 2026 | 3a73801 |
| Phase 5 started | ⏳ | - | - |
| Phase 5 complete | ⏳ | - | - |
| Ready for release | ⏳ | - | - |

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
