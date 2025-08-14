const Homey = require('homey');
const XComfortConnection = require('./lib/XComfortConnection');

class App extends Homey.App {
  async onInit() {
    this.log('xComfort Bridge app initialized');
    
    // Initialize connection when settings are available
    await this.initConnection();
    
    // Listen for settings changes
    this.homey.settings.on('set', async (key) => {
      if (key === 'bridge_ip' || key === 'auth_key') {
        this.log('Bridge settings changed, reinitializing connection');
        await this.initConnection();
      }
    });
  }

  async onUninit() {
    this.log('xComfort Bridge app shutting down');
    
    // Clean up periodic refresh
    if (this.periodicRefreshInterval) {
      clearInterval(this.periodicRefreshInterval);
      this.periodicRefreshInterval = null;
    }
    
    // Clean up pending refresh timeout
    if (this.pendingRefreshTimeout) {
      clearTimeout(this.pendingRefreshTimeout);
      this.pendingRefreshTimeout = null;
    }
    
    // Close connection if exists
    if (this.connection) {
      // TODO: Add proper connection cleanup
      this.connection = null;
    }
  }

  async initConnection() {
    const bridgeIp = this.homey.settings.get('bridge_ip');
    const authKey = this.homey.settings.get('auth_key');
    
    // Clean up existing periodic refresh
    if (this.periodicRefreshInterval) {
      clearInterval(this.periodicRefreshInterval);
      this.periodicRefreshInterval = null;
    }
    
    // Reset initial refresh flag
    this.initialRefreshDone = false;
    
    if (bridgeIp && authKey) {
      this.log('Initializing xComfort connection to', bridgeIp);
      try {
        // Close existing connection if any
        if (this.connection) {
          this.log('Closing existing connection');
          // TODO: Add proper connection cleanup
        }
        
        this.connection = new XComfortConnection(bridgeIp, authKey);
        await this.connection.init();
        this.log('xComfort connection initialized successfully');
        
        // Log discovered devices and rooms
        const devices = this.connection.getDevices();
        const rooms = this.connection.getRooms();
        this.log(`Discovered ${devices.length} devices and ${rooms.length} rooms`);
        
        // Make connection available to drivers
        this.homey.app = this.homey.app || {};
        this.homey.app.xcomfort = this.connection;
        
        // Start periodic temperature refresh for all devices
        this.startPeriodicRefresh();
        
      } catch (error) {
        this.error('Failed to initialize xComfort connection:', error.message);
        this.connection = null;
      }
    } else {
      this.log('Bridge IP or auth key not configured yet');
      this.connection = null;
    }
  }

  getConnection() {
    return this.connection;
  }

  // Helper method for drivers to access connection
  isConnected() {
    return this.connection && this.connection.connectionState === 'connected';
  }

  // Debounced refresh method that devices can request
  // This prevents overwhelming the bridge when multiple devices are added
  requestDeviceRefresh() {
    if (!this.isConnected()) {
      this.log('Cannot request refresh - not connected');
      return;
    }

    // Clear any existing pending refresh
    if (this.pendingRefreshTimeout) {
      clearTimeout(this.pendingRefreshTimeout);
    }

    // Schedule a refresh in 3 seconds, allowing time for multiple devices to request it
    this.pendingRefreshTimeout = setTimeout(() => {
      this.log('Executing requested device refresh');
      this.refreshAllDeviceData();
      this.pendingRefreshTimeout = null;
    }, 3000);
    
    this.log('Device refresh requested - will execute in 3 seconds');
  }

  startPeriodicRefresh() {
    // Initial refresh after 10 seconds to allow all devices to initialize
    setTimeout(() => {
      this.refreshAllDeviceData();
    }, 10000);
    
    // Then refresh every 3 minutes for all devices
    this.periodicRefreshInterval = setInterval(() => {
      this.refreshAllDeviceData();
    }, 180000); // 3 minutes
  }

  async refreshAllDeviceData() {
    if (!this.isConnected()) {
      return;
    }

    try {
      this.log('Performing periodic refresh for all device data...');
      await this.connection.refreshAllDeviceInfo();
      
      // On the initial refresh, also send a gentle heartbeat to trigger room state updates
      if (!this.initialRefreshDone) {
        this.initialRefreshDone = true;
        setTimeout(() => {
          if (this.isConnected()) {
            try {
              this.connection.sendEncrypted({
                type_int: 2,
                mc: this.connection.nextMc(),
                payload: {}
              });
              this.log('Sent heartbeat to trigger initial room state updates');
            } catch (err) {
              this.log('Initial heartbeat failed, room states will update on next interaction');
            }
          }
        }, 2000);
      }
    } catch (error) {
      this.error('Periodic refresh failed:', error);
    }
  }
}

module.exports = App;
