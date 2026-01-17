/**
 * Unit tests for ValueConverters
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  homeyToXComfort,
  xComfortToHomey,
  isValidXComfortDimValue,
  isValidHomeyDimValue,
  clampXComfortDimValue,
} from '../lib/utils/ValueConverters.js';

describe('ValueConverters', () => {
  describe('homeyToXComfort', () => {
    it('converts 0 to 0 (off)', () => {
      assert.strictEqual(homeyToXComfort(0), 0);
    });

    it('converts 1 to 99 (maximum)', () => {
      assert.strictEqual(homeyToXComfort(1), 99);
    });

    it('converts 0.5 to approximately 50', () => {
      assert.strictEqual(homeyToXComfort(0.5), 50);
    });

    it('converts small values to minimum (1)', () => {
      assert.strictEqual(homeyToXComfort(0.001), 1);
      assert.strictEqual(homeyToXComfort(0.01), 1);
    });

    it('never returns 0 for non-zero input', () => {
      assert.strictEqual(homeyToXComfort(0.001), 1);
      assert.notStrictEqual(homeyToXComfort(0.0001), 0);
    });

    it('clamps values above 1', () => {
      assert.strictEqual(homeyToXComfort(1.5), 99);
      assert.strictEqual(homeyToXComfort(100), 99);
    });

    it('throws for non-number input', () => {
      assert.throws(() => homeyToXComfort('0.5' as unknown as number), TypeError);
      assert.throws(() => homeyToXComfort(NaN), TypeError);
    });
  });

  describe('xComfortToHomey', () => {
    it('converts 0 to 0', () => {
      assert.strictEqual(xComfortToHomey(0), 0);
    });

    it('converts 99 to 1', () => {
      assert.strictEqual(xComfortToHomey(99), 1);
    });

    it('converts 50 to approximately 0.505', () => {
      const result = xComfortToHomey(50);
      assert.ok(result > 0.5 && result < 0.51);
    });

    it('clamps values above 99', () => {
      assert.strictEqual(xComfortToHomey(100), 1);
      assert.strictEqual(xComfortToHomey(150), 1);
    });

    it('throws for non-number input', () => {
      assert.throws(() => xComfortToHomey('50' as unknown as number), TypeError);
      assert.throws(() => xComfortToHomey(NaN), TypeError);
    });
  });

  describe('isValidXComfortDimValue', () => {
    it('returns true for 0', () => {
      assert.strictEqual(isValidXComfortDimValue(0), true);
    });

    it('returns true for values 1-99', () => {
      assert.strictEqual(isValidXComfortDimValue(1), true);
      assert.strictEqual(isValidXComfortDimValue(50), true);
      assert.strictEqual(isValidXComfortDimValue(99), true);
    });

    it('returns false for values outside range', () => {
      assert.strictEqual(isValidXComfortDimValue(-1), false);
      assert.strictEqual(isValidXComfortDimValue(100), false);
    });

    it('returns false for non-numbers', () => {
      assert.strictEqual(isValidXComfortDimValue(NaN), false);
      assert.strictEqual(isValidXComfortDimValue('50' as unknown as number), false);
    });
  });

  describe('isValidHomeyDimValue', () => {
    it('returns true for values 0-1', () => {
      assert.strictEqual(isValidHomeyDimValue(0), true);
      assert.strictEqual(isValidHomeyDimValue(0.5), true);
      assert.strictEqual(isValidHomeyDimValue(1), true);
    });

    it('returns false for values outside range', () => {
      assert.strictEqual(isValidHomeyDimValue(-0.1), false);
      assert.strictEqual(isValidHomeyDimValue(1.1), false);
    });
  });

  describe('clampXComfortDimValue', () => {
    it('returns 0 for 0 or negative values', () => {
      assert.strictEqual(clampXComfortDimValue(0), 0);
      assert.strictEqual(clampXComfortDimValue(-5), 0);
    });

    it('clamps to minimum (1) for small positive values', () => {
      assert.strictEqual(clampXComfortDimValue(0.5), 1);
    });

    it('clamps to maximum (99) for large values', () => {
      assert.strictEqual(clampXComfortDimValue(100), 99);
      assert.strictEqual(clampXComfortDimValue(150), 99);
    });

    it('rounds decimal values', () => {
      assert.strictEqual(clampXComfortDimValue(50.4), 50);
      assert.strictEqual(clampXComfortDimValue(50.6), 51);
    });
  });

  describe('round-trip conversion', () => {
    it('preserves approximate values through round-trip', () => {
      // Convert Homey -> xComfort -> Homey
      const originalValues = [0, 0.1, 0.25, 0.5, 0.75, 1];

      for (const original of originalValues) {
        const xcomfort = homeyToXComfort(original);
        const backToHomey = xComfortToHomey(xcomfort);

        // Allow small rounding error (within 2%)
        const diff = Math.abs(original - backToHomey);
        assert.ok(
          diff < 0.02,
          `Round-trip for ${original}: got ${backToHomey}, diff ${diff}`
        );
      }
    });
  });
});
