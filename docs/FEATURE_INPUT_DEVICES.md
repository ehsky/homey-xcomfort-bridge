# Feature Plan: Input-Only Devices (e.g., devType=220)

## Goal
Safely identify and expose input-only devices (e.g., button/rocker controllers) without assuming any actuator capabilities. Prioritize correctness, clarity, and observability over feature richness.

## Status
- Step 1: Complete (input-only classification, devType=220 pairing filter).
- Step 2: Complete (discovery logging with full descriptors + room association).
- Step 3: Complete (raw event logging + metadata for devType=220).
- Step 4: Pending (awaiting user interaction payloads).

---

## Step 1: Classify the device conservatively

When a new device type appears:
- Treat the device as stateless input by default.
- Do NOT assume:
  - on/off state
  - dimming
  - load control
- Do NOT map it to switches or lights unless explicitly proven.

Indicators that confirm input-only:
- Missing `dimmable`, `switch`, or other state properties.
- Device names indicating “control”, “button”, “rocker”, “bediening”.
- No outgoing control commands in the API.

---

## Step 2: Enable safe discovery logging

When adding exploratory support, log everything relevant but do not act on assumptions.

Log at discovery time:
- Full device descriptor as received from the bridge.
- Device ID, name, devType.
- Any available subtypes, roles, or features.
- Room association (resolved name and ID).

Never silently discard unknown fields.

---

## Step 3: Capture raw interaction events

Instrument inbound messages so that all events from this device are observable.

For each inbound message:
- Log the raw payload exactly as received.
- Log a parsed summary:
  - deviceId
  - inferred button index (if any)
  - inferred action (press, hold, release)
  - timestamps

Do not normalize or compress events until patterns are confirmed.

---

## Step 4: Derive behavior empirically

Use real user interaction to infer behavior:
- Ask the tester to perform a defined interaction sequence.
- Compare raw payloads between:
  - single press
  - long press
  - release
  - different buttons (if applicable)

Only promote behavior to “supported” once:
- A pattern repeats consistently.
- It can be named clearly (pressed, held, released).

---

## Step 5: Expose minimal Homey capabilities

Expose the device as:
- A button device or scene controller.
- Trigger-only flow cards.

Do NOT expose:
- Toggle actions
- On/off state
- Dim level
- Device actions unless explicitly supported

Flow examples:
- “When button X is pressed”
- “When button X is held”

Homey SDK clarifications:
- Device should extend `Homey.Device`.
- Do not add capabilities by default; only add if behavior is proven.
- Flow cards should be trigger-only and registered in App or Driver:
  - `button_pressed`
  - `button_held`
  - `button_released`
  - Suggested args: `button_index`, `device_id`

---

## Step 6: Make behavior explicit to the user

Document clearly (even in logs or README):
- This device is input-only.
- It does not reflect actuator state.
- It triggers flows; it does not control devices directly.

Prefer clarity over convenience.

---

## Step 7: Keep the branch reversible

All exploratory support must be:
- Feature-flagged.
- Isolated per device type.
- Easy to remove or promote later.

Never let exploratory support affect existing, stable devices.

Feature flag guidance:
- Default flag OFF.
- Store in settings or env (document the key).
- Provide a rollback path by disabling the flag and removing the driver.

Logging guidance:
- Log in the App layer where possible to reduce duplication.
- Keep full payload logging during discovery, then reduce verbosity once patterns are confirmed.

---

## Output Expectations

When supporting a new device, the result should be:
- Clear classification (input-only)
- Reliable event triggers
- Zero assumptions about state
- Logs that allow future extension
