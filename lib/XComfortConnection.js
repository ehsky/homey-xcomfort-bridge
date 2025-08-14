const WebSocket = require('ws');
const forge = require('node-forge');
const crypto = require('crypto');
const { MESSAGE_TYPES, CLIENT_CONFIG, INFO_TEXT_CODES, PROTOCOL_CONFIG } = require('./XComfortProtocol');

/**
 * xComfort Bridge WebSocket Connection Handler
 * 
 * Protocol implementation based on research and inspiration from:
 * https://github.com/jankrib/xcomfort-python (MIT License)
 * 
 * Key insights from the Python implementation:
 * - ACK handling for messages with 'mc' fields
 * - AES-256-CBC encryption with RSA key exchange
 * - Message counter management and connection state handling
 */

class XComfortConnection {
  constructor(bridgeIp, authKey) {
    this.bridgeIp = bridgeIp;
    this.authKey = authKey;
    this.ws = null;
    this.devices = new Map();
    this.rooms = new Map();
    
    // Connection state
    this.deviceId = null;
    this.connectionId = null;
    this.aesKey = null;
    this.aesIv = null;
    this.token = null;
    this.publicKey = null;
    this.mc = 0;
    this.connectionState = 'disconnected';
    this.deviceListReceived = false;
    
    // Event listeners for device state changes
    this.deviceStateListeners = new Map();
    
    // Event listeners for room state changes
    this.roomStateListeners = new Map();
    
    // Heartbeat interval reference for cleanup
    this.heartbeatInterval = null;
    
    // Base64 regex for encrypted message detection
    this.base64regex = /^[A-Za-z0-9+/=]+$/;
  }

  async init() {
    if (!this.bridgeIp || !this.authKey) {
      throw new Error('Bridge IP and auth key are required');
    }
    
    console.log(`[XComfort] Connecting to bridge at ${this.bridgeIp}`);
    return this.connect();
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://${this.bridgeIp}`);
        
        this.ws.on('open', () => {
          console.log('[XComfort] WebSocket connected, awaiting handshake...');
        });
        
        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });
        
        this.ws.on('error', (err) => {
          console.error('[XComfort] WebSocket error:', err);
          reject(err);
        });
        
        this.ws.on('close', (code, reason) => {
          this.connectionState = 'disconnected';
          console.log(`[XComfort] Connection closed. Code: ${code}, Reason: ${reason || 'No reason'}`);
          
          // Check if this is an expected disconnection after a command
          if (code === 1006) {
            console.log('[XComfort] Code 1006 detected - investigating if this is bridge behavior');
            console.log('[XComfort] This was NOT happening in the PoC, so something is different');
          }
          
          // Auto-reconnect after a short delay, but not if we're already reconnecting
          if (!this.reconnecting) {
            this.reconnecting = true;
            console.log('[XComfort] Attempting to reconnect in 5 seconds...');
            setTimeout(() => {
              this.reconnecting = false;
              this.connectionState = 'connecting';
              this.deviceListReceived = false; // Reset flag
              this.connect().catch(err => {
                console.error(`[XComfort] Reconnection failed: ${err.message}`);
              });
            }, PROTOCOL_CONFIG.TIMEOUTS.RECONNECT_DELAY);
          }
        });
        
        // Resolve when we receive the device list
        const checkConnection = setInterval(() => {
          if (this.deviceListReceived) {
            clearInterval(checkConnection);
            resolve();
          }
        }, 1000);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          if (!this.deviceListReceived) {
            reject(new Error('Connection timeout - device list not received'));
          }
        }, PROTOCOL_CONFIG.TIMEOUTS.CONNECTION);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Helper: Generate random salt
  generateSalt(length = PROTOCOL_CONFIG.LIMITS.SALT_LENGTH) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Helper: Hash per Python code
  hash(deviceId, authKey, salt) {
    const h1 = crypto.createHash('sha256');
    h1.update(deviceId);
    h1.update(authKey);
    const inner = h1.digest('hex');
    const h2 = crypto.createHash('sha256');
    h2.update(salt);
    h2.update(inner);
    return h2.digest('hex');
  }

  // Helper: Pad message with null bytes for AES block size
  padToBlockSize(str) {
    const buf = Buffer.from(str, 'utf8');
    const blockSize = PROTOCOL_CONFIG.ENCRYPTION.BLOCK_SIZE;
    const pad = blockSize - (buf.length % blockSize);
    if (pad === 0) return buf;
    const padded = Buffer.alloc(buf.length + pad, 0);
    buf.copy(padded);
    return padded;
  }

  // Helper: AES encrypt and base64 encode
  encryptAES256CBC(jsonObj) {
    const msgStr = JSON.stringify(jsonObj);
    const padded = this.padToBlockSize(msgStr);
    const cipher = crypto.createCipheriv(PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM, this.aesKey, this.aesIv);
    cipher.setAutoPadding(false);
    let encrypted = cipher.update(padded);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('base64') + '\u0004';
  }

  // Helper to send encrypted messages
  sendEncrypted(jsonObj) {
    if (this.ws.readyState !== this.ws.OPEN) {
      console.error('[XComfort] Cannot send message - WebSocket not open');
      return false;
    }
    try {
      this.ws.send(this.encryptAES256CBC(jsonObj));
      console.log('[XComfort] Sent encrypted:', jsonObj);
      return true;
    } catch (error) {
      console.error('[XComfort] Failed to send encrypted message:', error);
      return false;
    }
  }

  // Message counter
  nextMc() {
    return ++this.mc;
  }

  // Add device state listener
  addDeviceStateListener(deviceId, callback) {
    if (!this.deviceStateListeners.has(deviceId)) {
      this.deviceStateListeners.set(deviceId, []);
    }
    this.deviceStateListeners.get(deviceId).push(callback);
    console.log(`[XComfort] Added state listener for device ${deviceId}`);
  }

  // Remove device state listener
  removeDeviceStateListener(deviceId, callback) {
    if (this.deviceStateListeners.has(deviceId)) {
      const listeners = this.deviceStateListeners.get(deviceId);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.deviceStateListeners.delete(deviceId);
        }
      }
    }
  }

  // Add room state listener
  addRoomStateListener(roomId, callback) {
    if (!this.roomStateListeners.has(roomId)) {
      this.roomStateListeners.set(roomId, []);
    }
    this.roomStateListeners.get(roomId).push(callback);
    console.log(`[XComfort] Added state listener for room ${roomId}`);
  }

  // Remove room state listener
  removeRoomStateListener(roomId, callback) {
    if (this.roomStateListeners.has(roomId)) {
      const listeners = this.roomStateListeners.get(roomId);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.roomStateListeners.delete(roomId);
        }
      }
    }
  }

  // Trigger device state listeners
  triggerDeviceStateListeners(deviceId, stateData) {
    if (this.deviceStateListeners.has(deviceId)) {
      const listeners = this.deviceStateListeners.get(deviceId);
      listeners.forEach(callback => {
        try {
          callback(deviceId, stateData);
        } catch (error) {
          console.error(`[XComfort] Error in device state listener for device ${deviceId}:`, error);
        }
      });
    }
  }

  triggerRoomStateListeners(roomId, stateData) {
    if (this.roomStateListeners.has(roomId)) {
      const listeners = this.roomStateListeners.get(roomId);
      listeners.forEach(callback => {
        try {
          callback(roomId, stateData);
        } catch (error) {
          console.error(`[XComfort] Error in room state listener for room ${roomId}:`, error);
        }
      });
    }
  }

  async handleMessage(data) {
    let rawStr = data.toString();
    if (rawStr.endsWith('\u0004')) rawStr = rawStr.slice(0, -1);

    console.log(`[XComfort] Raw message: ${rawStr}`);

    // Try JSON first (unencrypted handshake)
    try {
      const msg = JSON.parse(rawStr);
      console.log('[XComfort] Parsed message:', msg);
      await this.handleUnencryptedMessage(msg);
      return;
    } catch (e) {
      // Not JSON, check for encrypted
    }

    // Handle encrypted messages
    if (this.aesKey && this.aesIv && this.base64regex.test(rawStr)) {
      try {
        const decrypted = await this.decryptMessage(rawStr);
        const msg = JSON.parse(decrypted);
        console.log('[XComfort] Parsed decrypted message:', msg);
        await this.handleEncryptedMessage(msg);
      } catch (e) {
        console.error('[XComfort] Failed to decrypt/parse message:', e);
      }
    }
  }

  async decryptMessage(rawStr) {
    let encryptedBuf = Buffer.from(rawStr, 'base64');
    const paddedLength = Math.ceil(encryptedBuf.length / 16) * 16;
    if (encryptedBuf.length < paddedLength) {
      const oldBuf = encryptedBuf;
      encryptedBuf = Buffer.alloc(paddedLength, 0);
      oldBuf.copy(encryptedBuf);
    }

    const decipher = crypto.createDecipheriv(PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM, this.aesKey, this.aesIv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);
    return decrypted.toString('utf8').replace(/\x00+$/, '');
  }

  async handleUnencryptedMessage(msg) {
    if (msg.type_int === MESSAGE_TYPES.CONNECTION_START) {
      this.deviceId = msg.payload.device_id;
      this.connectionId = msg.payload.connection_id;
      console.log(`[XComfort] CONNECTION_START received. deviceId=${this.deviceId}`);
      
      const confirmMsg = {
        type_int: MESSAGE_TYPES.CONNECTION_CONFIRM,
        mc: this.nextMc(),
        payload: {
          client_type: CLIENT_CONFIG.TYPE,
          client_id: CLIENT_CONFIG.ID,
          client_version: CLIENT_CONFIG.VERSION,
          connection_id: this.connectionId,
        },
      };
      this.ws.send(JSON.stringify(confirmMsg));
      console.log('[XComfort] Sent CONNECTION_CONFIRM');
    } else if (msg.type_int === MESSAGE_TYPES.SC_INIT_RESPONSE) {
      const scInitMsg = { type_int: MESSAGE_TYPES.SC_INIT_REQUEST, mc: this.nextMc(), payload: {} };
      this.ws.send(JSON.stringify(scInitMsg));
      console.log('[XComfort] Sent SC_INIT');
    } else if (msg.type_int === MESSAGE_TYPES.SC_INIT_REQUEST) {
      const pubkeyReq = { type_int: MESSAGE_TYPES.SC_INIT_REQUEST, mc: this.nextMc() };
      this.ws.send(JSON.stringify(pubkeyReq));
      console.log('[XComfort] Requested public key');
    } else if (msg.type_int === MESSAGE_TYPES.PUBLIC_KEY_RESPONSE) {
      this.publicKey = forge.pki.publicKeyFromPem(msg.payload.public_key);
      console.log('[XComfort] Received public key');
      
      this.aesKey = crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.KEY_SIZE);
      this.aesIv = crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.IV_SIZE);
      const secretStr = this.aesKey.toString('hex') + ':::' + this.aesIv.toString('hex');
      
      const encrypted = this.publicKey.encrypt(secretStr, PROTOCOL_CONFIG.ENCRYPTION.RSA_SCHEME);
      const secret = Buffer.from(encrypted, 'binary').toString('base64');
      const secretMsg = {
        type_int: MESSAGE_TYPES.SECRET_EXCHANGE,
        mc: this.nextMc(),
        payload: { secret },
      };
      this.ws.send(JSON.stringify(secretMsg));
      console.log('[XComfort] Sent encrypted AES keys');
    }
  }

  async handleEncryptedMessage(msg) {
    if ('mc' in msg) {
      const ackMsg = {
        type_int: MESSAGE_TYPES.ACK,
        ref: msg.mc
      };
      this.sendEncrypted(ackMsg);
      console.log(`[XComfort] Sent ACK for message mc: ${msg.mc}`);
    }

    // Log all message types to help debug missing temperature data
    console.log(`[XComfort] Received message type: ${msg.type_int}`);

    if (msg.type_int === MESSAGE_TYPES.SECRET_EXCHANGE_ACK) {
      const salt = this.generateSalt();
      const password = this.hash(this.deviceId, this.authKey, salt);
      
      const loginMsg = {
        type_int: MESSAGE_TYPES.LOGIN_REQUEST,
        mc: this.nextMc(),
        payload: {
          username: 'default',
          password: password,
          salt: salt,
        },
      };
      this.sendEncrypted(loginMsg);
      console.log('[XComfort] Sent login');
    } else if (msg.type_int === MESSAGE_TYPES.LOGIN_RESPONSE) {
      this.token = msg.payload.token;
      console.log('[XComfort] Login successful, received token');
      
      const applyTokenMsg = {
        type_int: MESSAGE_TYPES.TOKEN_APPLY,
        mc: this.nextMc(),
        payload: { token: this.token },
      };
      this.sendEncrypted(applyTokenMsg);
    } else if (msg.type_int === MESSAGE_TYPES.TOKEN_APPLY_ACK) {
      console.log('[XComfort] Token applied, authenticated!');
      this.connectionState = 'connected';
      
      // Request initial data
      this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_DEVICES, mc: this.nextMc(), payload: {} });
      this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_ROOMS, mc: this.nextMc(), payload: {} });
      this.sendEncrypted({ type_int: MESSAGE_TYPES.HEARTBEAT, mc: this.nextMc(), payload: {} });
      
      // Start heartbeat
      this.startHeartbeat();
    } else if (msg.type_int === MESSAGE_TYPES.SET_ALL_DATA) {
      console.log('[XComfort] Received SET_ALL_DATA');
      this.processDeviceData(msg.payload);
    } else if (msg.type_int === MESSAGE_TYPES.STATE_UPDATE) {
      console.log('[XComfort] Device state update');
      this.processStateUpdate(msg.payload);
    }
  }

  processDeviceData(payload) {
    if (payload.devices) {
      console.log(`[XComfort] Found ${payload.devices.length} devices`);
      payload.devices.forEach(device => {
        console.log(`[XComfort] Device ${device.deviceId}: name="${device.name}", devType=${device.devType}, dimmable=${device.dimmable}`);
        this.devices.set(device.deviceId, device);
      });
    }
    
    if (payload.rooms) {
      console.log(`[XComfort] Found ${payload.rooms.length} rooms`);
      payload.rooms.forEach(room => {
        console.log(`[XComfort] Room ${room.roomId}: name="${room.name}"`);
        this.rooms.set(room.roomId, room);
      });
    }
    
    if (payload.lastItem) {
      this.deviceListReceived = true;
      console.log('[XComfort] Device discovery complete!');
      
      // Note: xComfort Bridge doesn't provide initial device states
      // States are only sent when devices actually change (type 310 messages)
      // This is normal behavior - devices will show unknown state until operated
      console.log('[XComfort] Waiting for device state changes to populate current states...');
    }
  }

  processStateUpdate(payload) {
    console.log(`[XComfort] Full state update payload:`, JSON.stringify(payload, null, 2));
    if (payload && payload.item) {
      // Group items by deviceId to combine state and metadata updates
      const deviceUpdates = new Map();
      // Track room updates separately
      const roomUpdates = new Map();
      
      payload.item.forEach((item, index) => {
        console.log(`[XComfort] Processing item ${index}:`, JSON.stringify(item, null, 2));
        
        // Handle device updates
        if (item.deviceId) {
          // Get or create device update object
          if (!deviceUpdates.has(item.deviceId)) {
            deviceUpdates.set(item.deviceId, {});
          }
          const deviceUpdate = deviceUpdates.get(item.deviceId);
          
          // Process actual device state data (switch/dim)
          if (item.hasOwnProperty('switch') || item.hasOwnProperty('dimmvalue')) {
            console.log(`[XComfort] Device ${item.deviceId} state: switch=${item.switch}, dim=${item.dimmvalue}`);
            deviceUpdate.switch = item.switch;
            deviceUpdate.dimmvalue = item.dimmvalue;
            deviceUpdate.power = item.power;
            deviceUpdate.curstate = item.curstate;
          } 
          // Process known metadata info types (temperature, humidity ONLY)
          else if (item.hasOwnProperty('info') && Array.isArray(item.info)) {
            console.log(`[XComfort] Device ${item.deviceId} has info array:`, JSON.stringify(item.info, null, 2));
            const metadata = this.parseInfoMetadata(item.info);
            if (Object.keys(metadata).length > 0) {
              console.log(`[XComfort] Device ${item.deviceId} parsed metadata:`, metadata);
              deviceUpdate.metadata = metadata;
            } else {
              console.log(`[XComfort] Device ${item.deviceId} - skipping info metadata to maintain connection stability`);
            }
          } 
          else {
            console.log(`[XComfort] Skipping device ${item.deviceId} item - no recognized state data`);
          }
        }
        // Handle room updates
        else if (item.roomId) {
          console.log(`[XComfort] Room ${item.roomId} state update:`, {
            switch: item.switch,
            dimmvalue: item.dimmvalue,
            lightsOn: item.lightsOn,
            loadsOn: item.loadsOn,
            windowsOpen: item.windowsOpen,
            doorsOpen: item.doorsOpen,
            presence: item.presence,
            shadsClosed: item.shadsClosed,
            power: item.power,
            errorState: item.errorState
          });
          
          // Store complete room state
          roomUpdates.set(item.roomId, {
            switch: item.switch,
            dimmvalue: item.dimmvalue,
            lightsOn: item.lightsOn,
            loadsOn: item.loadsOn,
            windowsOpen: item.windowsOpen,
            doorsOpen: item.doorsOpen,
            presence: item.presence,
            shadsClosed: item.shadsClosed,
            power: item.power,
            errorState: item.errorState
          });
        }
      });
      
      // Send combined updates for each device
      deviceUpdates.forEach((updateData, deviceId) => {
        console.log(`[XComfort] Sending combined update for device ${deviceId}:`, updateData);
        this.triggerDeviceStateListeners(deviceId, updateData);
      });
      
      // Send room updates
      roomUpdates.forEach((updateData, roomId) => {
        console.log(`[XComfort] Sending room update for room ${roomId}:`, updateData);
        this.triggerRoomStateListeners(roomId, updateData);
      });
    }
  }

  // Parse known info metadata types based on xcomfort-python reference
  // Note: Text code "1109" confirmed as temperature for dimming actuators (devType 101)
  // Made public so devices can access it for polling temperature data
  parseInfoMetadata(infoArray) {
    const metadata = {};
    console.log(`[XComfort] Parsing info array with ${infoArray.length} items for temperature/humidity`);
    
    infoArray.forEach((info, index) => {
      console.log(`[XComfort] Processing info item ${index}:`, JSON.stringify(info, null, 2));
      if (info.text && info.value !== undefined) {
        switch (info.text) {
          case INFO_TEXT_CODES.TEMPERATURE_STANDARD:
            // Temperature sensor reading (°C) - standard xComfort text code
            metadata.temperature = parseFloat(info.value);
            console.log(`[XComfort] Found standard temperature: ${metadata.temperature}°C`);
            break;
          case INFO_TEXT_CODES.HUMIDITY_STANDARD:
            // Humidity sensor reading (%) - standard xComfort text code
            metadata.humidity = parseFloat(info.value);
            console.log(`[XComfort] Found humidity: ${metadata.humidity}%`);
            break;
          case INFO_TEXT_CODES.TEMPERATURE_DIMMER:
            // Temperature reading for dimming actuators (devType 101) - confirmed from testing
            metadata.temperature = parseFloat(info.value);
            console.log(`[XComfort] Found temperature from dimming actuator: ${metadata.temperature}°C`);
            break;
          default:
            console.log(`[XComfort] Skipping unknown info type "${info.text}" with value "${info.value}" to maintain connection stability`);
            break;
        }
      } else {
        console.log(`[XComfort] Skipping info item ${index} - missing text or value`);
      }
    });
    
    console.log(`[XComfort] Final parsed metadata:`, metadata);
    return metadata;
  }

  startHeartbeat() {
    // Clear existing heartbeat if any
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === this.ws.OPEN && this.connectionState === 'connected') {
        this.sendEncrypted({ type_int: MESSAGE_TYPES.HEARTBEAT, mc: this.nextMc(), payload: {} });
      }
    }, PROTOCOL_CONFIG.TIMEOUTS.HEARTBEAT);
  }

  // Cleanup method for proper resource management
  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Public API methods
  getDevices() {
    return Array.from(this.devices.values());
  }

  getRooms() {
    return Array.from(this.rooms.values());
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  async switchDevice(deviceId, switchState) {
    // Basic input validation
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    if (typeof switchState !== 'boolean') {
      throw new Error('Switch state must be a boolean');
    }
    
    console.log(`[XComfort] switchDevice called: deviceId=${deviceId}, switchState=${switchState}`);
    console.log(`[XComfort] Connection state: aesKey=${!!this.aesKey}, ws=${!!this.ws}, readyState=${this.ws ? this.ws.readyState : 'null'}, OPEN=${this.ws ? this.ws.OPEN : 'null'}`);
    
    if (!this.aesKey || !this.ws || this.ws.readyState !== this.ws.OPEN) {
      const error = 'xComfort Bridge not connected. Command will be retried when connection is restored.';
      console.error(`[XComfort] ${error}`);
      throw new Error(error);
    }
    
    const switchMsg = {
      type_int: MESSAGE_TYPES.DEVICE_SWITCH,
      mc: this.nextMc(),
      payload: {
        deviceId: deviceId,
        switch: switchState
      }
    };
    
    console.log(`[XComfort] Sending switch command:`, switchMsg);
    const result = this.sendEncrypted(switchMsg);
    console.log(`[XComfort] Switch command sent, result: ${result}`);
    
    return result;
  }

  async setDimmerValue(deviceId, dimmValue) {
    // Basic input validation
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    if (typeof dimmValue !== 'number' || isNaN(dimmValue)) {
      throw new Error('Dimmer value must be a number');
    }
    
    if (!this.aesKey || !this.ws || this.ws.readyState !== this.ws.OPEN) {
      throw new Error('xComfort Bridge not connected. Command will be retried when connection is restored.');
    }
    
    dimmValue = Math.max(PROTOCOL_CONFIG.LIMITS.DIM_MIN, Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, dimmValue));
    
    const dimMsg = {
      type_int: MESSAGE_TYPES.DEVICE_DIM,
      mc: this.nextMc(),
      payload: {
        deviceId: deviceId,
        dimmvalue: dimmValue
      }
    };
    
    return this.sendEncrypted(dimMsg);
  }

  async controlRoom(roomId, action, value = null) {
    if (!this.aesKey || this.ws.readyState !== this.ws.OPEN) {
      throw new Error('Not connected');
    }
    
    let roomMsg;
    
    if (action === 'switch') {
      roomMsg = {
        type_int: MESSAGE_TYPES.ROOM_SWITCH,
        mc: this.nextMc(),
        payload: {
          roomId: roomId,
          switch: value
        }
      };
    } else if (action === 'dimm' && value !== null) {
      value = Math.max(PROTOCOL_CONFIG.LIMITS.DIM_MIN, Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, value));
      roomMsg = {
        type_int: MESSAGE_TYPES.ROOM_DIM,
        mc: this.nextMc(),
        payload: {
          roomId: roomId,
          dimmvalue: value
        }
      };
    } else {
      throw new Error(`Invalid room action: ${action}`);
    }
    
    return this.sendEncrypted(roomMsg);
  }

  // Request current state info for all devices to get fresh temperature data
  async requestDeviceStates() {
    if (!this.aesKey || !this.ws || this.ws.readyState !== this.ws.OPEN) {
      console.log('[XComfort] Cannot request device states - not connected');
      return false;
    }

    console.log('[XComfort] Requesting fresh device data for temperature updates...');
    
    // Send the same sequence of messages as during initial connection
    // This ensures we get both device and room state updates
    try {
      await this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_DEVICES, mc: this.nextMc(), payload: {} });
      await this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_ROOMS, mc: this.nextMc(), payload: {} });
      await this.sendEncrypted({ type_int: MESSAGE_TYPES.HEARTBEAT, mc: this.nextMc(), payload: {} });
      console.log('[XComfort] Sent complete state refresh sequence');
      return true;
    } catch (error) {
      console.log('[XComfort] Failed to send state refresh sequence:', error);
      return false;
    }
  }

  // Request current states for devices and rooms - called after initial discovery
  async requestCurrentStates() {
    if (!this.aesKey || !this.ws || this.ws.readyState !== this.ws.OPEN) {
      console.log('[XComfort] Cannot request current states - not connected');
      return false;
    }

    console.log('[XComfort] Requesting current states using safe message types...');
    
    try {
      // Use only known safe message types that don't crash the bridge
      // The bridge responds to 240/242/2 sequence but only gives us device metadata, not states
      // For now, let's avoid sending unknown message types that cause 1006 errors
      console.log('[XComfort] Skipping state requests to avoid connection crashes');
      console.log('[XComfort] Bridge only provides device metadata, not actual current states');
      return true;
    } catch (error) {
      console.log('[XComfort] Failed to send state requests:', error);
      return false;
    }
  }

  // Request info for all devices to refresh temperature data
  async refreshAllDeviceInfo() {
    console.log(`[XComfort] Requesting fresh data...`);
    
    // Simply request fresh home data - this is what works during initial connection
    return this.requestDeviceStates();
  }
}

module.exports = XComfortConnection;
