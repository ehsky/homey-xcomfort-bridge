/**
 * Value Converters for Homey ↔ xComfort
 *
 * Homey uses 0-1 range for dim values
 * xComfort uses 1-99 range (0 means off, 1 is minimum, 99 is maximum)
 */

import { DIM_LIMITS } from '../types.js';

/**
 * Convert Homey dim value (0-1) to xComfort dim value (0 or 1-99)
 *
 * @param value - Homey dim value (0-1 range)
 * @returns xComfort dim value (0 for off, or 1-99 for dimming)
 *
 * @example
 * homeyToXComfort(0)    // returns 0 (off)
 * homeyToXComfort(0.01) // returns 1 (minimum)
 * homeyToXComfort(0.5)  // returns 50
 * homeyToXComfort(1)    // returns 99 (maximum)
 */
export function homeyToXComfort(value: number): number {
  // Validate input
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError('Dim value must be a number');
  }

  // 0 means off - special case
  if (value === 0) {
    return 0;
  }

  // Clamp to valid Homey range first
  const clamped = Math.max(0, Math.min(1, value));

  // Convert to xComfort range (1-99)
  // Never return 0 for non-zero input (0 means "off" in xComfort)
  return Math.max(DIM_LIMITS.MIN, Math.min(DIM_LIMITS.MAX, Math.round(clamped * 99)));
}

/**
 * Convert xComfort dim value (0-99) to Homey dim value (0-1)
 *
 * @param value - xComfort dim value (0-99 range)
 * @returns Homey dim value (0-1 range)
 *
 * @example
 * xComfortToHomey(0)  // returns 0
 * xComfortToHomey(1)  // returns ~0.01
 * xComfortToHomey(50) // returns ~0.51
 * xComfortToHomey(99) // returns 1
 */
export function xComfortToHomey(value: number): number {
  // Validate input
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError('Dim value must be a number');
  }

  // Clamp to valid xComfort range
  const clamped = Math.max(0, Math.min(99, value));

  // Convert to Homey range (0-1)
  return clamped / 99;
}

/**
 * Validate that a dim value is within xComfort's valid range
 *
 * @param value - Value to validate
 * @returns true if value is valid (0 or 1-99)
 */
export function isValidXComfortDimValue(value: number): boolean {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return false;
  }
  return value === 0 || (value >= DIM_LIMITS.MIN && value <= DIM_LIMITS.MAX);
}

/**
 * Validate that a dim value is within Homey's valid range
 *
 * @param value - Value to validate
 * @returns true if value is valid (0-1)
 */
export function isValidHomeyDimValue(value: number): boolean {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return false;
  }
  return value >= 0 && value <= 1;
}

/**
 * Clamp an xComfort dim value to valid range
 *
 * @param value - Value to clamp
 * @returns Clamped value (1-99) or 0 if input was 0 or negative
 */
export function clampXComfortDimValue(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return Math.max(DIM_LIMITS.MIN, Math.min(DIM_LIMITS.MAX, Math.round(value)));
}
