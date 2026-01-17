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
    const rooms = connection.getRooms();

    this.log(`Found ${devices.length} total devices from xComfort bridge`);

    const inputDevices = devices.filter(
      (device: XComfortDevice) => device.devType === 220
    );

    this.log(`Found ${inputDevices.length} input devices (devType=220):`);
    inputDevices.forEach((device: XComfortDevice) => {
      const deviceId = String(device.deviceId);
      const associatedRooms = rooms.filter((room) =>
        Array.isArray(room.devices) && room.devices.map(String).includes(deviceId)
      );

      this.log(`Full device descriptor: ${JSON.stringify(device)}`);
      this.log(`  - ${device.name} (ID: ${device.deviceId}, devType: ${device.devType})`);
      if (associatedRooms.length > 0) {
        associatedRooms.forEach((room) => {
          this.log(`    Room: ${room.name} (ID: ${room.roomId})`);
        });
      } else {
        this.log('    Room: not associated');
      }
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
