import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageHandler } from '../lib/messaging/MessageHandler.mjs';
import { DeviceStateManager } from '../lib/state/DeviceStateManager.mjs';
import { RoomStateManager } from '../lib/state/RoomStateManager.mjs';
import { MESSAGE_TYPES } from '../lib/XComfortProtocol.mjs';
import type { DeviceStateUpdate, RoomStateUpdate } from '../lib/types.mjs';

const waitImmediate = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

test('MessageHandler: SET_ALL_DATA populates devices, rooms, scenes, and completion', async () => {
  const deviceStateManager = new DeviceStateManager();
  const roomStateManager = new RoomStateManager();
  const handler = new MessageHandler(deviceStateManager, roomStateManager);

  let deviceListComplete = false;
  let scenesReceived: string[] = [];

  handler.setOnDeviceListComplete(() => {
    deviceListComplete = true;
  });
  handler.setOnScenesReceived((scenes) => {
    scenesReceived = scenes.map((scene) => scene.name ?? 'unknown');
  });

  await handler.processMessage({
    type_int: MESSAGE_TYPES.SET_ALL_DATA,
    payload: {
      devices: [
        {
          deviceId: 42,
          name: 'Gang 1',
          devType: 101,
          dimmable: true,
          dimmvalue: 0,
          switch: false,
          info: [{ text: '1109', value: '38' }],
        },
        {
          deviceId: 38,
          name: 'Dimming Actuator stue',
          devType: 101,
          dimmable: true,
          dimmvalue: 0,
          switch: false,
          info: [{ text: '1109', value: '36' }],
        },
      ],
      rooms: [
        {
          roomId: 15,
          name: 'Hallway',
          devices: [40],
          dimmvalue: 0,
          switch: false,
        },
        {
          roomId: 49,
          name: 'Living room',
          devices: [38, 42],
          dimmvalue: 0,
          switch: false,
        },
      ],
      scenes: [
        { sceneId: 6, name: 'Home', show: true },
        { sceneId: 9, name: 'Night', show: true },
      ],
      lastItem: true,
    },
  });

  assert.equal(deviceStateManager.getAllDevices().length, 2);
  assert.equal(roomStateManager.getAllRooms().length, 2);
  assert.deepEqual(scenesReceived, ['Home', 'Night']);
  assert.equal(deviceListComplete, true);
});

test('MessageHandler: STATE_UPDATE triggers device and room listeners', async () => {
  const deviceStateManager = new DeviceStateManager();
  const roomStateManager = new RoomStateManager();
  const handler = new MessageHandler(deviceStateManager, roomStateManager);

  let deviceUpdate: DeviceStateUpdate | undefined;
  let roomUpdate: RoomStateUpdate | undefined;

  deviceStateManager.addListener(38 as unknown as string, (_deviceId, update) => {
    deviceUpdate = update;
  });
  roomStateManager.addListener(49 as unknown as string, (_roomId, update) => {
    roomUpdate = update;
  });

  await handler.processMessage({
    type_int: MESSAGE_TYPES.STATE_UPDATE,
    payload: {
      item: [
        { deviceId: 38, dimmvalue: 100, switch: true, curstate: 0, power: 0 },
        { deviceId: 38, info: [{ text: '1109', value: '31' }] },
        {
          roomId: 2,
          dimmvalue: 0,
          switch: false,
          lightsOn: 0,
          loadsOn: 0,
          windowsOpen: 0,
          doorsOpen: 0,
          presence: 0,
          shadsClosed: 0,
          power: 0,
          errorState: 0,
        },
        {
          roomId: 49,
          dimmvalue: 0,
          switch: false,
          lightsOn: 0,
          loadsOn: 0,
          windowsOpen: 0,
          doorsOpen: 0,
          presence: 0,
          shadsClosed: 0,
          power: 0,
          errorState: 0,
        },
      ],
    },
  });

  await waitImmediate();

  assert.ok(deviceUpdate);
  assert.equal(deviceUpdate.switch, true);
  assert.equal(deviceUpdate.dimmvalue, 100);
  assert.equal(deviceUpdate.power, 0);
  assert.equal(deviceUpdate.metadata?.temperature, 31);

  assert.ok(roomUpdate);
  assert.equal(roomUpdate.switch, false);
  assert.equal(roomUpdate.dimmvalue, 0);
  assert.equal(roomUpdate.power, 0);
  assert.equal(roomUpdate.windowsOpen, 0);
  assert.equal(roomUpdate.doorsOpen, 0);
  assert.equal(roomUpdate.presence, 0);
});
