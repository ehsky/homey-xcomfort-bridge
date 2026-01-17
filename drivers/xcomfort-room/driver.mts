import Homey from 'homey';
import type { XComfortBridge } from '../../lib/connection/XComfortBridge.mjs';
import type { XComfortRoom } from '../../lib/types.mjs';

type XComfortApp = Homey.App & {
  isConnected(): boolean;
  getConnection(): XComfortBridge;
};

class RoomDriver extends Homey.Driver {
  async onInit() {
    this.log('Room driver initialized');
  }

  async onPairListDevices() {
    this.log('Room onPairListDevices called');
    
    try {
      // Get connection from app
      const app = this.homey.app as XComfortApp;
      if (!app.isConnected()) {
        this.error('xComfort Bridge not connected. Please configure bridge settings first.');
        throw new Error('xComfort Bridge not connected. Please configure bridge settings first.');
      }
      
      const connection = app.getConnection();
      const rooms = connection.getRooms();
      
      this.log(`Found ${rooms.length} total rooms from xComfort bridge`);
      
      // Filter rooms that have devices
      const roomsWithDevices = rooms.filter((room: XComfortRoom) => {
        return room.devices && room.devices.length > 0;
      });
      
      this.log(`Found ${roomsWithDevices.length} rooms with devices:`);
      roomsWithDevices.forEach((room: XComfortRoom) => {
        this.log(`  - ${room.name} (ID: ${room.roomId}, ${room.devices ? room.devices.length : 0} devices)`);
      });
      
      // Convert to Homey device format
      const homeyRooms = roomsWithDevices.map((room: XComfortRoom) => ({
        name: room.name,
        data: {
          id: `room_${room.roomId}`,
          roomId: room.roomId
        },
        settings: {
          deviceCount: room.devices ? room.devices.length : 0
        }
      }));
      
      this.log(`Returning ${homeyRooms.length} rooms for pairing`);
      return homeyRooms;
      
    } catch (error) {
      this.error('Error in room onPairListDevices:', error);
      throw error;
    }
  }
}

export default RoomDriver;
