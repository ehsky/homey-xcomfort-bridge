const Homey = require('homey');

class DimmingActuatorDevice extends Homey.Device {
  async onInit() {
    this.log('Dimming Actuator device initialized');
    
    // Get device data
    const deviceData = this.getData();
    this.deviceId = deviceData.deviceId;
    
    this.log(`Device ID: ${this.deviceId}`);
    
    // Ensure all capabilities are available (for devices that were paired before metadata support)
    await this.ensureCapabilities();
    
    // Register capability listeners
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));
    
    // Set up state listener for external changes
    this.setupStateListener();
  }

  async ensureCapabilities() {
    const requiredCapabilities = ['onoff', 'dim', 'measure_temperature'];
    
    for (const capability of requiredCapabilities) {
      if (!this.hasCapability(capability)) {
        try {
          await this.addCapability(capability);
          this.log(`Added capability: ${capability}`);
        } catch (error) {
          this.error(`Failed to add capability ${capability}:`, error);
        }
      }
    }
    
    // Remove deprecated capabilities (cleanup from previous versions)
    const deprecatedCapabilities = ['meter_power', 'measure_humidity'];
    for (const capability of deprecatedCapabilities) {
      if (this.hasCapability(capability)) {
        try {
          await this.removeCapability(capability);
          this.log(`Removed deprecated capability: ${capability}`);
        } catch (error) {
          this.error(`Failed to remove deprecated capability ${capability}:`, error);
        }
      }
    }
  }

  setupStateListener() {
    const app = this.homey.app;
    if (app.isConnected()) {
      const connection = app.getConnection();
      
      connection.addDeviceStateListener(this.deviceId, async (deviceId, stateData) => {
        this.log(`External state change:`, stateData);
        
        // Handle regular device state updates (switch/dim)
        if (stateData.switch !== undefined || stateData.dimmvalue !== undefined) {
          // Update Homey capabilities to reflect external changes
          if (typeof stateData.switch === 'boolean') {
            try {
              await this.setCapabilityValue('onoff', stateData.switch);
              this.log(`Successfully updated onoff to: ${stateData.switch}`);
            } catch (err) {
              this.error('Failed to update onoff capability:', err);
            }
          }
          
          if (typeof stateData.dimmvalue === 'number') {
            try {
              // Convert 1-99 range to 0-1 range for Homey
              // xComfort sends values 1-99, we need to map this to Homey's 0-1 range
              const homeyDimValue = Math.max(0, Math.min(1, stateData.dimmvalue / 99));
              await this.setCapabilityValue('dim', homeyDimValue);
              this.log(`Successfully updated dim to: ${homeyDimValue} (xComfort: ${stateData.dimmvalue}%)`);
            } catch (err) {
              this.error('Failed to update dim capability:', err);
            }
          }
        }
        
        // Handle metadata updates (temperature only for connection stability)
        if (stateData.metadata) {
          this.log(`Device metadata update:`, stateData.metadata);
          
          // Temperature sensor data
          if (stateData.metadata.temperature !== undefined) {
            try {
              this.log(`Temperature updated to: ${stateData.metadata.temperature}°C`);
              await this.setCapabilityValue('measure_temperature', stateData.metadata.temperature);
              this.log(`Successfully updated temperature to: ${stateData.metadata.temperature}°C`);
            } catch (err) {
              this.error('Failed to update temperature capability:', err);
            }
          }
        }
      });
    }
    
    // Start temperature polling - check every 2 minutes for fresh temperature data
    this.startTemperaturePolling();
  }

  startTemperaturePolling() {
    // Stagger the initial check based on device ID to avoid multiple devices polling simultaneously
    const deviceIdNum = parseInt(this.deviceId) || 0;
    const staggerDelay = 5000 + (deviceIdNum % 10) * 2000; // 5-25 seconds spread
    
    // Initial check after staggered delay
    setTimeout(() => {
      this.checkForTemperatureData();
    }, staggerDelay);
    
    // Then check every 2 minutes, also staggered
    const intervalDelay = 120000 + (deviceIdNum % 10) * 10000; // 2-4 minute spread
    this.temperaturePollingInterval = setInterval(() => {
      this.checkForTemperatureData();
    }, intervalDelay);
  }

  async checkForTemperatureData() {
    const app = this.homey.app;
    if (!app.isConnected()) {
      return;
    }

    try {
      const connection = app.getConnection();
      // Get current device data to see if temperature is available
      const deviceData = connection.getDevice(this.deviceId);
      
      if (deviceData && deviceData.info) {
        // Parse temperature from existing device data
        const metadata = connection.parseInfoMetadata(deviceData.info);
        if (metadata.temperature !== undefined) {
          this.log(`Polling found temperature: ${metadata.temperature}°C`);
          this.setCapabilityValue('measure_temperature', metadata.temperature).catch(err => {
            this.error('Failed to update temperature capability:', err);
          });
        } else {
          this.log(`Device data exists but no temperature metadata found`);
        }
      } else {
        this.log(`No device data available for temperature polling`);
      }
    } catch (error) {
      this.error('Temperature polling error:', error);
    }
  }

  async onCapabilityOnoff(value) {
    this.log(`Setting onoff to: ${value}`);
    
    const app = this.homey.app;
    if (!app.isConnected()) {
      throw new Error('xComfort Bridge not connected');
    }
    
    try {
      const connection = app.getConnection();
      await connection.switchDevice(this.deviceId, value);
      this.log(`Successfully set switch to: ${value}`);
    } catch (error) {
      this.error('Failed to set switch:', error);
      throw error;
    }
  }

  async onCapabilityDim(value) {
    this.log(`Setting dim to: ${value}`);
    
    const app = this.homey.app;
    if (!app.isConnected()) {
      throw new Error('xComfort Bridge not connected');
    }

    try {
      const connection = app.getConnection();
      
      if (value === 0) {
        // When dimmer is set to 0, turn the device OFF
        await connection.switchDevice(this.deviceId, false);
        this.log(`Successfully set dim to: 0% (Homey: ${value}) - turned OFF`);
      } else {
        // Convert 0-1 range to 1-99 range for xComfort (never send 0 for dimming)
        // xComfort dimmer values must be between 1-99, where 1 is minimum and 99 is maximum
        const xcomfortDimValue = Math.max(1, Math.min(99, Math.round(value * 99)));
        
        await connection.setDimmerValue(this.deviceId, xcomfortDimValue);
        this.log(`Successfully set dimmer to: ${xcomfortDimValue}% (Homey: ${value})`);
      }
    } catch (error) {
      this.error('Failed to set dimmer:', error);
      throw error;
    }
  }

  async onDeleted() {
    this.log('Dimming Actuator device deleted');
    
    // Clean up temperature polling
    if (this.temperaturePollingInterval) {
      clearInterval(this.temperaturePollingInterval);
      this.temperaturePollingInterval = null;
    }
    
    // Clean up state listener
    const app = this.homey.app;
    if (app.isConnected()) {
      const connection = app.getConnection();
      // Note: We'd need to keep track of the callback to remove it properly
      // For now, the connection class will handle cleanup when device is removed
    }
  }
}

module.exports = DimmingActuatorDevice;
