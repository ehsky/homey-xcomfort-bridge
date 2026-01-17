import { test } from 'node:test';
import assert from 'node:assert/strict';

type TestDriver = {
  homey: { app?: unknown };
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type TestDevice = TestDriver & {
  getData: () => Record<string, unknown>;
  setData: (data: Record<string, unknown>) => void;
  hasCapability: (capability: string) => boolean;
  addCapability: (capability: string) => Promise<void>;
  removeCapability: (capability: string) => Promise<void>;
  registerCapabilityListener: (
    capability: string,
    callback: unknown
  ) => void;
  setCapabilityValue: (capability: string, value: unknown) => Promise<void>;
  getCapabilityValue: (capability: string) => unknown;
  setSettings: (settings: Record<string, unknown>) => Promise<void>;
  getSettings: () => Record<string, unknown>;
};

test('DimmingActuatorDriver: onPairListDevices returns only dimmable devices', async () => {
  const { default: DimmingActuatorDriver } = await import(
    '../drivers/xcomfort-dimming-actuator/driver.mjs'
  );

  const driver = new DimmingActuatorDriver() as unknown as TestDriver;
  const connection = {
    getDevices: () => [
      { deviceId: '1', name: 'Dimmer A', dimmable: true },
      { deviceId: '2', name: 'Switch B', dimmable: false },
    ],
  };
  driver.homey = {
    app: {
      isConnected: () => true,
      getConnection: () => connection,
    },
  };

  const result = await (driver as unknown as {
    onPairListDevices: () => Promise<Array<Record<string, unknown>>>;
  }).onPairListDevices();

  assert.equal(result.length, 1);
  const [first] = result;
  assert.ok(first);
  assert.equal(first.name, 'Dimmer A');
  assert.deepEqual(first.data, { id: 'dimmer_1', deviceId: '1' });
});

test('RoomDriver: onPairListDevices returns rooms with devices', async () => {
  const { default: RoomDriver } = await import(
    '../drivers/xcomfort-room/driver.mjs'
  );

  const driver = new RoomDriver() as unknown as TestDriver;
  const connection = {
    getRooms: () => [
      { roomId: '10', name: 'Living', devices: ['1'] },
      { roomId: '11', name: 'Empty', devices: [] },
    ],
  };
  driver.homey = {
    app: {
      isConnected: () => true,
      getConnection: () => connection,
    },
  };

  const result = await (driver as unknown as {
    onPairListDevices: () => Promise<Array<Record<string, unknown>>>;
  }).onPairListDevices();

  assert.equal(result.length, 1);
  const [first] = result;
  assert.ok(first);
  assert.equal(first.name, 'Living');
  assert.deepEqual(first.data, { id: 'room_10', roomId: '10' });
  assert.deepEqual(first.settings, { deviceCount: 1 });
});

test('DimmingActuatorDevice: state updates map to capabilities', async () => {
  const { default: DimmingActuatorDevice } = await import(
    '../drivers/xcomfort-dimming-actuator/device.mjs'
  );

  let stateListener:
    | ((deviceId: string, stateData: Record<string, unknown>) => Promise<void>)
    | undefined;

  const connection = {
    addDeviceStateListener: (
      _deviceId: string,
      callback: (deviceId: string, stateData: Record<string, unknown>) => Promise<void>
    ) => {
      stateListener = callback;
    },
  };

  const device = new DimmingActuatorDevice() as unknown as TestDevice;
  device.setData({ deviceId: '1' });
  device.homey = {
    app: {
      isConnected: () => true,
      getConnection: () => connection,
    },
  };
  (device as unknown as { startTemperaturePolling: () => void }).startTemperaturePolling =
    () => {};

  await (device as unknown as { setupStateListener: () => void }).setupStateListener();

  assert.ok(stateListener);
  await stateListener('1', {
    switch: true,
    dimmvalue: 99,
    metadata: { temperature: 21.5 },
  });

  assert.equal(device.getCapabilityValue('onoff'), true);
  assert.equal(device.getCapabilityValue('dim'), 1);
  assert.equal(device.getCapabilityValue('measure_temperature'), 21.5);
});

test('RoomDevice: state updates map to capabilities', async () => {
  const { default: RoomDevice } = await import(
    '../drivers/xcomfort-room/device.mjs'
  );

  let stateListener:
    | ((roomId: string, stateData: Record<string, unknown>) => Promise<void>)
    | undefined;

  const connection = {
    addRoomStateListener: (
      _roomId: string,
      callback: (roomId: string, stateData: Record<string, unknown>) => Promise<void>
    ) => {
      stateListener = callback;
    },
  };

  const device = new RoomDevice() as unknown as TestDevice;
  device.setData({ roomId: '10' });
  device.homey = {
    app: {
      isConnected: () => true,
      getConnection: () => connection,
      requestDeviceRefresh: () => {},
    },
  };
  (device as unknown as { requestInitialRoomState: () => void }).requestInitialRoomState =
    () => {};

  await (device as unknown as { setupRoomStateListener: () => void }).setupRoomStateListener();

  assert.ok(stateListener);
  await stateListener('10', {
    switch: false,
    dimmvalue: 50,
    power: 10,
    windowsOpen: 1,
    doorsOpen: 0,
    presence: 1,
  });

  assert.equal(device.getCapabilityValue('onoff'), false);
  assert.equal(device.getCapabilityValue('dim'), 50 / 99);
  assert.equal(device.getCapabilityValue('meter_power'), 10);
  assert.equal(device.getCapabilityValue('alarm_contact.windows'), true);
  assert.equal(device.getCapabilityValue('alarm_contact.doors'), false);
  assert.equal(device.getCapabilityValue('alarm_motion'), true);
});
