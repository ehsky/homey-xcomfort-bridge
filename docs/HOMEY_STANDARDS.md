# Homey App Development Standards

> **Document Purpose**: This document defines the coding standards, conventions, and Homey App Store requirements that must be followed for the homey-xcomfort-bridge app to be published successfully.

---

## 1. SDK & Runtime Requirements

### 1.1 SDK Version

**Target: SDK v3**

```json
// .homeycompose/app.json
{
  "sdk": 3,
  "compatibility": ">=12.0.1"
}
```

**Key SDK v3 Changes:**
- `this.homey` instead of `require('homey')` for managers
- Promise-only APIs (no callbacks)
- `App#onInit()` runs before Driver and Device `onInit()`
- `onSettings({ oldSettings, newSettings, changedKeys })` signature

### 1.2 Node.js Version

**Target: Node.js 22** (Homey v12.9.0+)

**Known Issues to Address:**
- Use native `fetch()` instead of `node-fetch`
- Use custom HTTP Agent with `keepAlive: true` if using legacy HTTP modules
- No `__dirname` or `__filename` in ESM - use workaround:

```javascript
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### 1.3 ESM (ECMAScript Modules)

**Required: TypeScript with ESM output**

Homey supports both `.mjs` and compiled TypeScript. We use TypeScript for type safety.

```typescript
// ✅ Correct TypeScript/ESM syntax
import Homey from 'homey';

class MyApp extends Homey.App {
  async onInit(): Promise<void> {
    this.log('App initialized');
  }
}

export default MyApp;
```

```javascript
// ❌ Deprecated CommonJS syntax
const Homey = require('homey');
module.exports = MyApp;
```

**ESM Gotchas:**
- Cannot use `require()` - use `import` or dynamic `import()`
- Top-level `await` is supported
- All ESM modules run in strict mode by default
- Import from compiled `.js` files, not `.ts` files

---

## 1.4 TypeScript Configuration

**Required: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "noEmitOnError": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Project Structure with TypeScript:**
```
├── src/
│   ├── app.ts              # Source files
│   ├── lib/
│   └── drivers/
├── dist/                    # Compiled output (gitignored except for publish)
├── tsconfig.json
└── package.json
```

**package.json additions:**
```json
{
  "type": "module",
  "main": "dist/app.js",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "prestart": "npm run build",
    "start": "homey app run",
    "validate": "npm run build && homey app validate"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^22.0.0",
    "@types/homey": "npm:homey-apps-sdk-v3-types@^1.0.0"
  }
}
```

**Type Definitions:**
- Use `@types/homey` for Homey SDK types (via `homey-apps-sdk-v3-types`)
- Create `src/lib/types.ts` for app-specific interfaces

---

## 2. App Store Requirements

### 2.1 App Naming

| Rule | Status |
|------|--------|
| Use brand name, not company name | ✅ "xComfort Bridge" |
| No "Homey" or "Athom" in name | ✅ |
| No protocol names (Zigbee, Z-Wave, etc.) | ✅ |
| Maximum 4 words | ✅ |

### 2.2 Description

The description should be a catchy one-liner, not a feature list.

```json
// .homeycompose/app.json
{
  "description": {
    "en": "Smart lighting and automation for your home"
  }
}
```

**Avoid:**
- ❌ "Adds support for xComfort Bridge"
- ❌ "Integrates xComfort with Homey"
- ❌ "Control your xComfort devices"

### 2.3 README.txt

**Requirements:**
- One to two paragraphs maximum
- No Markdown formatting (renders as plain text)
- No URLs
- No feature lists
- No changelog (use `.homeychangelog.json`)
- No headers or titles

**Example:**
```
Transform your home lighting with xComfort. This app connects your Homey 
to the xComfort Bridge, enabling seamless control of dimming actuators 
and room lighting groups. Create automated scenes that respond to your 
daily routines and enjoy the perfect ambiance in every room.
```

### 2.4 Images

#### App Images (required)
| Size | Dimensions | Location |
|------|------------|----------|
| Small | 250 x 175 | `/assets/images/small.jpg` |
| Large | 500 x 350 | `/assets/images/large.jpg` |
| XLarge | 1000 x 700 | `/assets/images/xlarge.jpg` |

**Guidelines:**
- Use lively, brand-representative images
- Avoid logos on monochrome backgrounds
- Avoid clipart-style images
- No Android/iOS app screenshots

#### Driver Images (required per driver)
| Size | Dimensions | Location |
|------|------------|----------|
| Small | 75 x 75 | `/drivers/<id>/assets/images/small.png` |
| Large | 500 x 500 | `/drivers/<id>/assets/images/large.png` |
| XLarge | 1000 x 1000 | `/drivers/<id>/assets/images/xlarge.png` |

**Guidelines:**
- White background
- Recognizable picture of the device
- Don't reuse app image as driver image

### 2.5 Icons

#### App Icon
- File: `/assets/icon.svg`
- Transparent background
- Full canvas utilization
- Brand-representative
- Avoid text if possible

#### Driver Icons
- File: `/drivers/<id>/assets/icon.svg`
- Canvas: 960 x 960px
- Transparent background
- Right-side angle preferred over front-facing
- Device must be recognizable from a distance
- Don't reuse app icon for drivers

**Request custom icons:** [Homey Vectors Repository](https://github.com/athombv/homey-vectors-public)

### 2.6 Brand Color

```json
// .homeycompose/app.json
{
  "brandColor": "#1E3A5F"
}
```

- Required property
- Icons must be visible against this color
- Use brand colors for recognition

### 2.7 Changelog

Use `.homeychangelog.json` instead of README:

```json
{
  "1.0.1": {
    "en": "Fixed connection stability issues"
  },
  "1.0.0": {
    "en": "Initial release"
  }
}
```

---

## 3. Code Standards

### 3.1 File Structure

```
com.example.app/
├── .homeycompose/
│   ├── app.json              # App manifest (composed)
│   ├── flow/
│   │   └── actions/          # Flow action cards
│   └── drivers/              # Driver manifests
├── assets/
│   ├── icon.svg
│   └── images/
├── drivers/
│   └── <driver_id>/
│       ├── assets/
│       ├── device.mjs
│       └── driver.mjs
├── lib/                      # Shared library code
├── locales/
│   └── en.json
├── settings/
│   └── index.html
├── app.mjs
├── api.mjs                   # Web API handlers
├── env.json                  # Secrets (gitignored)
├── README.txt
└── .homeyignore
```

### 3.2 Class Structure

#### App Class
```javascript
import Homey from 'homey';

class App extends Homey.App {
  async onInit() {
    // Initialize shared resources
    // Register Flow cards
    // Set up settings listeners
  }

  async onUninit() {
    // Clean up resources
    // Clear intervals/timeouts
    // Close connections
  }
}

export default App;
```

#### Driver Class
```javascript
import Homey from 'homey';

class Driver extends Homey.Driver {
  async onInit() {
    // Initialize driver-level resources
  }

  async onPairListDevices() {
    // Return array of discoverable devices
    return [];
  }
}

export default Driver;
```

#### Device Class
```javascript
import Homey from 'homey';

class Device extends Homey.Device {
  async onInit() {
    // Register capability listeners
    // Set up state listeners
  }

  async onUninit() {
    // Clean up device-specific resources
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    // Handle settings changes
  }
}

export default Device;
```

### 3.3 Accessing Homey API

```javascript
// ✅ SDK v3: Use this.homey
class Device extends Homey.Device {
  async onInit() {
    // Settings
    const value = this.homey.settings.get('key');
    
    // Flow cards
    const card = this.homey.flow.getActionCard('action_id');
    
    // Logging
    this.log('Message');
    this.error('Error message');
    
    // App instance
    const connection = this.homey.app.connection;
    
    // Timers (auto-cleanup on unload)
    this.homey.setTimeout(() => {}, 1000);
    this.homey.setInterval(() => {}, 5000);
  }
}
```

### 3.4 Flow Cards

#### Registration (in driver.mjs or app.mjs)
```javascript
async onInit() {
  // Action card
  this.homey.flow
    .getActionCard('activate_scene')
    .registerRunListener(async (args) => {
      return this.activateScene(args.scene_name);
    });
  
  // With autocomplete
  const card = this.homey.flow.getActionCard('select_device');
  card.registerRunListener(async (args) => { ... });
  card.registerArgumentAutocompleteListener('device', async (query) => {
    return this.filterDevices(query);
  });
}
```

#### Manifest (/.homeycompose/flow/actions/activate_scene.json)
```json
{
  "title": {
    "en": "Activate a scene"
  },
  "titleFormatted": {
    "en": "Activate [[scene_name]]"
  },
  "hint": {
    "en": "Activates a predefined scene on the xComfort Bridge"
  },
  "args": [
    {
      "name": "scene_name",
      "type": "autocomplete",
      "placeholder": {
        "en": "Select scene..."
      }
    }
  ]
}
```

### 3.5 Settings Page

Use Homey's built-in classes for consistent styling:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="/homey.js" data-origin="settings"></script>
</head>
<body>
  <fieldset class="homey-form-fieldset">
    <legend class="homey-form-legend">Connection</legend>
    
    <div class="homey-form-group">
      <label class="homey-form-label" for="ip">Bridge IP</label>
      <input class="homey-form-input" id="ip" type="text" />
      <p class="homey-form-hint">The IP address of your bridge</p>
    </div>
  </fieldset>
  
  <button class="homey-button-primary-full">Save</button>
  
  <script>
    function onHomeyReady(Homey) {
      Homey.ready();
      
      // Load settings
      Homey.get('bridge_ip').then(value => { ... });
      
      // Save settings
      Homey.set('bridge_ip', value).then(() => { ... });
    }
  </script>
</body>
</html>
```

### 3.6 Error Handling

```javascript
// Throw user-friendly errors
async onCapabilityOnoff(value) {
  if (!this.homey.app.isConnected()) {
    throw new Error('xComfort Bridge not connected');
  }
  
  try {
    await this.homey.app.connection.switchDevice(this.deviceId, value);
  } catch (error) {
    this.error('Switch failed:', error);
    throw new Error('Failed to control device. Please try again.');
  }
}
```

### 3.7 Timezone Handling

Apps run in UTC timezone. Convert for user display:

```javascript
const timezone = await this.homey.clock.getTimezone();
const formatter = new Intl.DateTimeFormat([], {
  timeZone: timezone,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeString = formatter.format(new Date());
```

---

## 4. Internationalization

### 4.1 Locale Files

```
locales/
├── en.json  (required)
├── nl.json
├── de.json
└── ...
```

### 4.2 Structure

```json
{
  "settings": {
    "bridge_ip": {
      "label": "Bridge IP Address",
      "hint": "Enter the IP address of your xComfort Bridge"
    }
  },
  "errors": {
    "not_connected": "xComfort Bridge not connected"
  }
}
```

### 4.3 Usage

```javascript
const message = this.homey.__('errors.not_connected');
```

### 4.4 Consistency

If you translate one element, translate ALL elements to that language:
- App description
- README
- Flow cards
- Device settings
- Error messages

---

## 5. Environment Variables

### 5.1 env.json (gitignored)

```json
{
  "CLIENT_ID": "your-client-id",
  "CLIENT_SECRET": "your-secret"
}
```

### 5.2 Access

```javascript
import Homey from 'homey';

const CLIENT_ID = Homey.env.CLIENT_ID;
```

### 5.3 Security Notes

- Never log secrets
- Values are stored on Homey (not cloud-accessible)
- Don't include in version control

---

## 6. Publishing Checklist

### Before Submission

- [ ] Run `homey app validate` - no errors
- [ ] Run `homey app run` - test all functionality
- [ ] Check for typos and spelling errors
- [ ] Verify all images meet size requirements
- [ ] Verify icons have transparent backgrounds
- [ ] Test on actual Homey device
- [ ] Test all Flow cards
- [ ] Test pairing process
- [ ] Verify settings page works

### App Manifest Requirements

```json
{
  "id": "com.xcomfort.bridge",
  "version": "1.0.0",
  "compatibility": ">=12.0.1",
  "sdk": 3,
  "brandColor": "#1E3A5F",
  "name": {
    "en": "xComfort Bridge"
  },
  "description": {
    "en": "Smart lighting and automation for your home"
  },
  "author": {
    "name": "Your Name",
    "email": "your@email.com"
  },
  "support": "mailto:support@email.com",
  "source": "https://github.com/ehsky/homey-xcomfort-bridge",
  "bugs": {
    "url": "https://github.com/ehsky/homey-xcomfort-bridge/issues"
  },
  "contributing": {
    "donate": {
      "paypal": {
        "username": "your-paypal"
      }
    }
  }
}
```

---

## 7. Best Practices Summary

| Category | Practice |
|----------|----------|
| **Logging** | Use `this.log()` and `this.error()`, not `console.log()` |
| **Timers** | Use `this.homey.setTimeout/setInterval` for auto-cleanup |
| **State** | Store on instance (`this.property`), not global scope |
| **Promises** | Always use async/await, never callbacks |
| **Cleanup** | Implement `onUninit()` for all classes |
| **Errors** | Throw user-friendly messages |
| **Testing** | Test on real Homey before publishing |
| **Version** | Follow semver (MAJOR.MINOR.PATCH) |

---

## 8. Resources

- [Homey Apps SDK Documentation](https://apps.developer.homey.app/)
- [SDK v3 API Reference](https://apps-sdk-v3.developer.homey.app/)
- [App Store Guidelines](https://apps.developer.homey.app/app-store/guidelines)
- [ESM Guide](https://apps.developer.homey.app/guides/using-esm-in-homey-apps)
- [Node.js 22 Upgrade Guide](https://apps.developer.homey.app/upgrade-guides/node-22)
- [SDK v3 Upgrade Guide](https://apps.developer.homey.app/upgrade-guides/upgrading-to-sdk-v3)
- [Homey Vectors (Icon Requests)](https://github.com/athombv/homey-vectors-public)

---

*Document Version: 1.0*  
*Last Updated: 2026-01-17*  
*Based on: Homey SDK v3, Node.js 22, Homey v12.0.1+*
