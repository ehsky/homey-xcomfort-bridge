export default {
  App: class {},
  Driver: class {
    homey = {};
    log(..._args) {}
    error(..._args) {}
  },
  Device: class {
    homey = {};
    _data = {};
    _capabilities = new Set();
    _capabilityValues = new Map();
    _settings = {};

    log(..._args) {}
    error(..._args) {}

    getData() {
      return this._data;
    }

    setData(data) {
      this._data = data;
    }

    hasCapability(capability) {
      return this._capabilities.has(capability);
    }

    async addCapability(capability) {
      this._capabilities.add(capability);
    }

    async removeCapability(capability) {
      this._capabilities.delete(capability);
    }

    registerCapabilityListener(_capability, _callback) {}

    async setCapabilityValue(capability, value) {
      this._capabilityValues.set(capability, value);
    }

    getCapabilityValue(capability) {
      return this._capabilityValues.get(capability);
    }

    async setSettings(settings) {
      this._settings = { ...this._settings, ...settings };
    }

    getSettings() {
      return this._settings;
    }
  },
};
