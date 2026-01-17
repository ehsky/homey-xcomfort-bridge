import Homey from 'homey';

class XComfortButtonDevice extends Homey.Device {
  deviceId = '';

  async onInit() {
    this.log('xComfort Button device initialized');

    const deviceData = this.getData();
    this.deviceId = String(deviceData.deviceId ?? '');

    this.log(`Device ID: ${this.deviceId}`);
  }
}

export default XComfortButtonDevice;
