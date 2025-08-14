import Homey from 'homey';
import XComfortConnection from './lib/XComfortConnection.mjs';
import XComfortSceneManager from './lib/XComfortSceneManager.mjs';

class App extends Homey.App {
  async onInit() {
    this.log('xComfort Bridge app initialized');
    
    // Initialize scene manager
    this.sceneManager = null;
    
    // Initialize connection when settings are available
    await this.initConnection();
    
    // Register Flow actions
    this.registerFlowActions();
    
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
      this.connection.cleanup();
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
          this.connection.cleanup();
        }
        
        this.connection = new XComfortConnection(bridgeIp, authKey);
        await this.connection.init();
        this.log('xComfort connection initialized successfully');
        
        // Initialize scene manager when connection is ready
        this.sceneManager = new XComfortSceneManager(this.connection);
        
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

  registerFlowActions() {
    // Register scene activation Flow action by name
    const activateSceneCard = this.homey.flow.getActionCard('activate_scene');
    
    activateSceneCard.registerRunListener(this.onFlowActionActivateScene.bind(this));
    
    // Register autocomplete listener for scene names
    activateSceneCard.registerArgumentAutocompleteListener('scene_name', async (query) => {
      this.log(`Autocomplete request for scene name: "${query}"`);
      
      if (!this.sceneManager) {
        this.log('Scene manager not initialized - returning empty list');
        return [];
      }
      
      try {
        // Discover scenes first to ensure we have fresh data
        await this.sceneManager.discoverScenes();
        
        // Filter scenes based on query
        const filteredScenes = this.sceneManager.filterScenes(query);
        
        this.log(`Found ${filteredScenes.length} matching scenes for query "${query}"`);
        
        // Return results in format expected by Homey autocomplete
        const autocompleteResults = filteredScenes.map(scene => ({
          id: scene.id.toString(),
          name: scene.name,
          description: `Scene ID: ${scene.id}`
        }));
        
        this.log('Autocomplete results:', JSON.stringify(autocompleteResults, null, 2));
        return autocompleteResults;
        
      } catch (error) {
        this.error('Error in scene autocomplete:', error);
        return [];
      }
    });
    
    this.log('Flow actions registered');
  }

  async onFlowActionActivateScene(args) {
    // Debug: Log the raw args to understand the structure
    this.log('Flow action args received:', JSON.stringify(args, null, 2));
    
    // Extract the scene name from the autocomplete selection
    const sceneName = args.scene_name.name || args.scene_name;
    this.log(`Flow action: Activate scene by name "${sceneName}"`);
    
    if (!this.sceneManager) {
      throw new Error('Scene manager not initialized - xComfort Bridge may not be connected');
    }
    
    try {
      await this.sceneManager.activateScene(sceneName);
      this.log(`Successfully activated scene "${sceneName}"`);
      return true;
    } catch (error) {
      this.error(`Failed to activate scene "${sceneName}":`, error);
      throw error;
    }
  }
}

export default App;
