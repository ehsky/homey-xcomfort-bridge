import Homey from 'homey';
import type { XComfortBridge } from '../../lib/connection/XComfortBridge.mjs';
import type { XComfortDevice } from '../../lib/types.mjs';

type XComfortApp = Homey.App & {
  isConnected(): boolean;
  getConnection(): XComfortBridge;
};

class DimmingActuatorDriver extends Homey.Driver {
  async onInit() {
    this.log('Dimming Actuator driver initialized');
  }

  async onPairListDevices() {
    this.log('onPairListDevices called');
    
    try {
      // Get connection from app
      const app = this.homey.app as XComfortApp;
      if (!app.isConnected()) {
        this.error('xComfort Bridge not connected. Please configure bridge settings first.');
        throw new Error('xComfort Bridge not connected. Please configure bridge settings first.');
      }
      
      const connection = app.getConnection();
      const devices = connection.getDevices();
      
      this.log(`Found ${devices.length} total devices from xComfort bridge`);
      
      // Filter for dimmable devices only
      const dimmableDevices = devices.filter(
        (device: XComfortDevice) => device.dimmable === true
      );
      
      this.log(`Found ${dimmableDevices.length} dimmable devices:`);
      dimmableDevices.forEach((device: XComfortDevice) => {
        this.log(`  - ${device.name} (ID: ${device.deviceId})`);
      });
      
      // Convert to Homey device format
      const homeyDevices = dimmableDevices.map((device: XComfortDevice) => ({
        name: device.name,
        data: {
          id: `dimmer_${device.deviceId}`,
          deviceId: device.deviceId
        },
        settings: {
          deviceType: device.devType || 'unknown',
          dimmable: device.dimmable
        }
      }));
      
      this.log(`Returning ${homeyDevices.length} dimmable devices for pairing`);
      return homeyDevices;
      
    } catch (error) {
      this.error('Error in onPairListDevices:', error);
      throw error;
    }
  }
}

export default DimmingActuatorDriver;
