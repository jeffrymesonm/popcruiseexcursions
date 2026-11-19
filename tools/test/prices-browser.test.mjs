/**
 * prices-browser.test.mjs — Tests for the per-vehicle arithmetic of the browser price reader
 * (assets/js/prices.js): how many vehicles a group books and which price column applies. The script runs
 * in a sandbox with an empty document; the prices come from the real buggy table of src/index.html, read
 * by the build reader, so both readers are checked against the same table.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parsePriceTables } from '../lib/prices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Loads assets/js/prices.js in a sandbox and returns what it exposes.
 * @returns {object} window.SitePrices of the sandbox.
 */
function loadSitePrices() {
  const script = fs.readFileSync(path.join(ROOT, 'assets/js/prices.js'), 'utf8');
  const context = vm.createContext({
    document: { querySelector: () => null, querySelectorAll: () => [] }
  });
  context.window = context;
  vm.runInContext(script, context);
  return context.SitePrices;
}

/**
 * Quotes one vehicle of the real buggy table with the browser arithmetic.
 * @param {number} people - Group size.
 * @param {string} vehicle - Row id, e.g. "buggy".
 * @returns {{total: number, perVehicle: number, vehicles: number}|null} The quote (main fields), or null.
 */
function quoteBuggy(people, vehicle) {
  const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const table = parsePriceTables(html).find((candidate) => candidate.id === 'buggy');
  const row = table.rows.find((candidate) => candidate.option === vehicle);
  const result = loadSitePrices().vehicleTotal(people, row.seats, table.columns, row.cells);
  return result && { total: result.total, perVehicle: result.perVehicle, vehicles: result.vehicles };
}

test('one vehicle per seat count, at the 1-to-2-vehicles price', () => {
  assert.deepEqual(quoteBuggy(1, 'atv'), { total: 90, perVehicle: 90, vehicles: 1 });
  assert.deepEqual(quoteBuggy(2, 'atv-double'), { total: 100, perVehicle: 100, vehicles: 1 });
  assert.deepEqual(quoteBuggy(4, 'buggy-family'), { total: 160, perVehicle: 160, vehicles: 1 });
});

test('a group that needs more vehicles rounds up and keeps the 1-to-2 price until 3 vehicles', () => {
  assert.deepEqual(quoteBuggy(3, 'atv-double'), { total: 200, perVehicle: 100, vehicles: 2 });
  assert.deepEqual(quoteBuggy(4, 'buggy'), { total: 240, perVehicle: 120, vehicles: 2 });
});

test('3 vehicles or more use the "3 or more" price, with no upper limit', () => {
  assert.deepEqual(quoteBuggy(5, 'buggy'), { total: 300, perVehicle: 100, vehicles: 3 });
  assert.deepEqual(quoteBuggy(9, 'buggy-family'), { total: 420, perVehicle: 140, vehicles: 3 });
  assert.deepEqual(quoteBuggy(50, 'atv'), { total: 3750, perVehicle: 75, vehicles: 50 });
});

test('no quote without seats, without a covering column or without a price', () => {
  const prices = loadSitePrices();
  const columns = [{ min: 1, max: 2 }, { min: 3, max: null }];
  assert.equal(prices.vehicleTotal(2, 0, columns, [90, 75]), null);
  assert.equal(prices.vehicleTotal(5, 1, [{ min: 1, max: 2 }], [90]), null);
  assert.equal(prices.vehicleTotal(1, 1, columns, [null, 75]), null);
});
