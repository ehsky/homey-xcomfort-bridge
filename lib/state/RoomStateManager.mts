/**
 * Room State Manager for xComfort Bridge
 *
 * Manages room state tracking and listener notifications.
 * Extracted from XComfortConnection for single responsibility.
 */

import type {
  XComfortRoom,
  RoomStateUpdate,
  RoomStateCallback,
} from '../types.mjs';

// Re-export types for module consumers
export type { XComfortRoom, RoomStateUpdate, RoomStateCallback };

// ============================================================================
// RoomStateManager Class
// ============================================================================

export class RoomStateManager {
  private rooms: Map<string, XComfortRoom> = new Map();
  private listeners: Map<string, RoomStateCallback[]> = new Map();

  /**
   * Add a room to the state manager
   */
  setRoom(room: XComfortRoom): void {
    this.rooms.set(room.roomId, room);
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): XComfortRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms
   */
  getAllRooms(): XComfortRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Clear all rooms
   */
  clearRooms(): void {
    this.rooms.clear();
  }

  /**
   * Get the number of rooms
   */
  get roomCount(): number {
    return this.rooms.size;
  }

  /**
   * Add a state listener for a specific room
   */
  addListener(roomId: string, callback: RoomStateCallback): void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, []);
    }
    this.listeners.get(roomId)!.push(callback);
    console.log(`[RoomStateManager] Added state listener for room ${roomId}`);
  }

  /**
   * Remove a state listener for a specific room
   */
  removeListener(roomId: string, callback: RoomStateCallback): boolean {
    const roomListeners = this.listeners.get(roomId);
    if (!roomListeners) return false;

    const index = roomListeners.indexOf(callback);
    if (index === -1) return false;

    roomListeners.splice(index, 1);
    if (roomListeners.length === 0) {
      this.listeners.delete(roomId);
    }
    return true;
  }

  /**
   * Remove all listeners for a specific room
   */
  removeAllListeners(roomId: string): void {
    this.listeners.delete(roomId);
  }

  /**
   * Trigger state listeners for a room (non-blocking via setImmediate)
   */
  triggerListeners(roomId: string, stateData: RoomStateUpdate): void {
    const roomListeners = this.listeners.get(roomId);
    if (!roomListeners) return;

    roomListeners.forEach((callback) => {
      setImmediate(() => {
        try {
          callback(roomId, stateData);
        } catch (error) {
          console.error(
            `[RoomStateManager] Error in state listener for room ${roomId}:`,
            error
          );
        }
      });
    });
  }
}
