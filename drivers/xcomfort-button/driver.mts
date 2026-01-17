import Homey from 'homey';
import type { XComfortBridge } from '../../lib/connection/XComfortBridge.mjs';
import type { XComfortDevice } from '../../lib/types.mjs';

type XComfortApp = Homey.App & {
  isConnected(): boolean;
  getConnection(): XComfortBridge;
};

class XComfortButtonDriver extends Homey.Driver {
  async onInit() {
    this.log('xComfort Button driver initialized');
  }

  async onPairListDevices() {
    this.log('xComfort Button onPairListDevices called');

    const app = this.homey.app as XComfortApp;
    if (!app.isConnected()) {
      this.error('xComfort Bridge not connected. Please configure bridge settings first.');
      throw new Error('xComfort Bridge not connected. Please configure bridge settings first.');
    }

    const connection = app.getConnection();
    const devices = connection.getDevices();

    this.log(`Found ${devices.length} total devices from xComfort bridge`);

    const inputDevices = devices.filter(
      (device: XComfortDevice) => device.devType === 220
    );

    this.log(`Found ${inputDevices.length} input devices (devType=220):`);
    inputDevices.forEach((device: XComfortDevice) => {
      this.log(`  - ${device.name} (ID: ${device.deviceId}, devType: ${device.devType})`);
    });

    return inputDevices.map((device: XComfortDevice) => ({
      name: device.name,
      data: {
        id: `button_${device.deviceId}`,
        deviceId: device.deviceId,
      },
      settings: {
        deviceType: device.devType ?? 'unknown',
      },
    }));
  }
}

export default XComfortButtonDriver;
