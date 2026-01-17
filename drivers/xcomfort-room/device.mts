import Homey from 'homey';
import type { XComfortBridge } from '../../lib/connection/XComfortBridge.mjs';
import type { RoomStateUpdate, XComfortRoom } from '../../lib/types.mjs';

type XComfortApp = Homey.App & {
  isConnected(): boolean;
  getConnection(): XComfortBridge;
  requestDeviceRefresh(): void;
};

class RoomDevice extends Homey.Device {
  roomId = '';

  async onInit() {
    this.log('Room device initialized');
    
    // Get room data
    const roomData = this.getData();
    this.roomId = roomData.roomId;
    
    this.log(`Room ID: ${this.roomId}`);
    
    // Add missing capabilities for existing devices
    await this.addMissingCapabilities();
    
    // Register capability listeners
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));
    
    // Get room info and set up state listener
    this.updateRoomInfo();
    this.setupRoomStateListener();
  }

  async addMissingCapabilities() {
    const requiredCapabilities = [
      'onoff', 
      'dim',
      'meter_power',
      'alarm_contact.windows',
      'alarm_contact.doors',
      'alarm_motion'
    ];
    
    for (const capability of requiredCapabilities) {
      if (!this.hasCapability(capability)) {
        try {
          await this.addCapability(capability);
          this.log(`Added missing capability: ${capability}`);
        } catch (err) {
          this.error(`Failed to add capability ${capability}:`, err);
        }
      }
    }
  }

  updateRoomInfo() {
    const app = this.homey.app as XComfortApp;
    if (app.isConnected()) {
      const connection = app.getConnection();
      const room = connection.getRoom(this.roomId) as XComfortRoom | undefined;
      
      if (room) {
        this.log(`Room: ${room.name}, Devices: ${room.devices ? room.devices.length : 0}`);
        
        // Update device settings with room info
        this.setSettings({
          deviceCount: room.devices ? room.devices.length : 0
        }).catch((err: unknown) => {
          this.error('Failed to update room settings:', err);
        });
      }
    }
  }

  setupRoomStateListener() {
    const app = this.homey.app as XComfortApp;
    if (app.isConnected()) {
      const connection = app.getConnection();

      connection.addRoomStateListener(
        this.roomId,
        async (_roomId: string, stateData: RoomStateUpdate) => {
          this.log(`Room state change:`, stateData);

          // Update basic lighting capabilities
          if (typeof stateData.switch === 'boolean') {
            try {
              await this.setCapabilityValue('onoff', stateData.switch);
              this.log(`Successfully updated room onoff to: ${stateData.switch}`);
            } catch (err) {
              this.error('Failed to update room onoff capability:', err);
            }
          }

          if (typeof stateData.dimmvalue === 'number') {
            try {
              // Convert 0-99 range to 0-1 range for Homey
              const homeyDimValue = Math.max(0, Math.min(1, stateData.dimmvalue / 99));
              await this.setCapabilityValue('dim', homeyDimValue);
              this.log(`Successfully updated room dim to: ${homeyDimValue} (xComfort: ${stateData.dimmvalue}%)`);
            } catch (err) {
              this.error('Failed to update room dim capability:', err);
            }
          }

          // Update power meter
          if (typeof stateData.power === 'number') {
            try {
              await this.setCapabilityValue('meter_power', stateData.power);
              this.log(`Successfully updated room power to: ${stateData.power}W`);
            } catch (err) {
              this.error('Failed to update room power capability:', err);
            }
          }

          // Update contact sensors (true = open/alarm, false = closed/no alarm)
          if (typeof stateData.windowsOpen === 'number') {
            try {
              const windowsOpen = stateData.windowsOpen > 0;
              await this.setCapabilityValue('alarm_contact.windows', windowsOpen);
              this.log(`Successfully updated room windows status to: ${windowsOpen ? 'open' : 'closed'} (count: ${stateData.windowsOpen})`);
            } catch (err) {
              this.error('Failed to update room windows capability:', err);
            }
          }

          if (typeof stateData.doorsOpen === 'number') {
            try {
              const doorsOpen = stateData.doorsOpen > 0;
              await this.setCapabilityValue('alarm_contact.doors', doorsOpen);
              this.log(`Successfully updated room doors status to: ${doorsOpen ? 'open' : 'closed'} (count: ${stateData.doorsOpen})`);
            } catch (err) {
              this.error('Failed to update room doors capability:', err);
            }
          }

          // Update motion/presence sensor
          if (typeof stateData.presence === 'number') {
            try {
              const presenceDetected = stateData.presence > 0;
              await this.setCapabilityValue('alarm_motion', presenceDetected);
              this.log(`Successfully updated room presence to: ${presenceDetected ? 'detected' : 'none'} (count: ${stateData.presence})`);
            } catch (err) {
              this.error('Failed to update room presence capability:', err);
            }
          }
        }
      );
      
      // Request initial room state to populate capabilities
      this.requestInitialRoomState();
    } else {
      // Connection not ready - will be set up when connection is established
      // The app's periodic refresh and device refresh will handle getting initial state
      this.log('xComfort connection not ready - state listener will be set up when connection is available');
    }
  }

  async requestInitialRoomState() {
    // Wait a bit for the connection to be fully established
    setTimeout(async () => {
      const app = this.homey.app as XComfortApp;
      if (app.isConnected()) {
        try {
          this.log(`Requesting initial state for room ${this.roomId}`);
          
          // Use the app's coordinated refresh method to avoid overwhelming the bridge
          app.requestDeviceRefresh();
          this.log(`Successfully requested coordinated refresh for room ${this.roomId}`);
        } catch (error) {
          this.error('Failed to request initial room state:', error);
        }
      } else {
        this.log(`Connection not ready, will get state on next periodic refresh`);
      }
    }, 2000);
  }

  async onCapabilityOnoff(value: boolean) {
    this.log(`Setting room lights to: ${value ? 'ON' : 'OFF'}`);
    
    const app = this.homey.app as XComfortApp;
    if (!app.isConnected()) {
      throw new Error('xComfort Bridge not connected');
    }
    
    try {
      const connection = app.getConnection();
      await connection.controlRoom(this.roomId, 'switch', value);
      this.log(`Successfully set room lights to: ${value ? 'ON' : 'OFF'}`);
    } catch (error) {
      this.error('Failed to control room lights:', error);
      throw error;
    }
  }

  async onCapabilityDim(value: number) {
    this.log(`Setting room dimmer to: ${value}`);
    
    const app = this.homey.app as XComfortApp;
    if (!app.isConnected()) {
      throw new Error('xComfort Bridge not connected');
    }
    
    try {
      const connection = app.getConnection();
      
      if (value === 0) {
        // When dimmer is set to 0, turn the room OFF
        await connection.controlRoom(this.roomId, 'switch', false);
        this.log(`Successfully set room dimmer to: 0% (Homey: ${value}) - turned OFF`);
      } else {
        // Convert 0-1 range to 1-99 range for xComfort (never send 0 for dimming)
        const xcomfortDimValue = Math.max(1, Math.round(value * 99));
        
        await connection.controlRoom(this.roomId, 'dimm', xcomfortDimValue);
        this.log(`Successfully set room dimmer to: ${xcomfortDimValue}% (Homey: ${value})`);
      }
    } catch (error) {
      this.error('Failed to set room dimmer:', error);
      throw error;
    }
  }

  async onDeleted() {
    this.log('Room device deleted');
  }
}

export default RoomDevice;
