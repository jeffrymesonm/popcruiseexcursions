/**
 * prices.test.mjs — Tests for the build-time price reader (tools/lib/prices.mjs), which must follow
 * the same rules as assets/js/prices.js. Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePriceTables, minPrice, maxPrice, priceCount, formatUsd, fillPriceFrom } from '../lib/prices.mjs';

const FIXTURE = `
<table class="prices" data-prices="falls" data-deposit-percent="50">
  <thead><tr><th scope="col" data-i18n="price.group">Grupo</th><th scope="col" data-option="zipline" data-i18n="price.zipline">Con zipline</th><th scope="col" data-option="basic" data-i18n="price.noZipline">Sin zipline</th></tr></thead>
  <tbody>
    <tr data-min="1" data-max="5"><th scope="row">1 a 5</th><td>US$100</td><td>US$75</td></tr>
    <tr data-min="15" data-max="50"><th scope="row">15 a 50</th><td>US$70</td><td>US$50</td></tr>
  </tbody>
</table>
<table class="prices" data-prices="boat-a" data-tour="boats" data-pricing="charter" data-deposit="400">
  <thead><tr><th scope="col">Grupo</th><th scope="col" data-option="basic" data-i18n="price.boat">Precio del barco</th></tr></thead>
  <tbody>
    <tr data-min="1" data-max="15" data-charge="flat"><th scope="row">1 <span data-i18n="price.to">a</span> 15</th><td>US$1,100</td></tr>
    <tr data-min="16" data-charge="extra"><th scope="row">Persona adicional</th><td>+US$30</td></tr>
  </tbody>
</table>
<table class="prices" data-prices="boat-b" data-tour="boats" data-pricing="charter">
  <thead><tr><th scope="col">Grupo</th><th scope="col" data-option="basic">Precio del barco</th></tr></thead>
  <tbody>
    <tr data-min="1" data-max="20" data-charge="flat"><th scope="row">1 a 20</th><td>US$900</td></tr>
  </tbody>
</table>`;

test('parsePriceTables reads ids, options, rows and deposits', () => {
  const tables = parsePriceTables(FIXTURE);
  assert.equal(tables.length, 3);
  const falls = tables.find((table) => table.id === 'falls');
  assert.deepEqual(falls.options, ['zipline', 'basic']);
  assert.deepEqual(falls.optionKeys, ['price.zipline', 'price.noZipline']);
  assert.equal(falls.pricing, 'person');
  assert.deepEqual(falls.rows[1].cells, [70, 50]);
  assert.equal(falls.depositPercent, 50);
  assert.equal(falls.deposit, null);
  const boat = tables.find((table) => table.id === 'boat-a');
  assert.equal(boat.deposit, 400);
  assert.equal(boat.depositPercent, null);
  assert.equal(boat.pricing, 'charter');
  assert.equal(boat.tour, 'boats');
  assert.equal(boat.rows[1].charge, 'extra');
  assert.equal(boat.rows[1].max, null);
});

test('minPrice follows prices.js', () => {
  const tables = parsePriceTables(FIXTURE);
  assert.equal(minPrice(tables, 'falls'), 50);
  assert.equal(minPrice(tables, 'boats'), 900);
  assert.equal(minPrice(tables, 'boat-a'), 1100);
  assert.equal(minPrice(tables, 'all'), 50);
  assert.equal(minPrice(tables, 'nope'), null);
});

test('maxPrice and priceCount', () => {
  const tables = parsePriceTables(FIXTURE);
  assert.equal(maxPrice(tables, 'falls'), 100);
  assert.equal(maxPrice(tables, 'boats'), 1100);
  assert.equal(priceCount(tables, 'falls'), 4);
});

test('formatUsd', () => {
  assert.equal(formatUsd(1250), 'US$1,250');
  assert.equal(formatUsd(12), 'US$12');
  assert.equal(formatUsd(17.5), 'US$17.50');
});

test('fillPriceFrom writes the lowest price and reports unknown scopes', () => {
  const tables = parsePriceTables(FIXTURE);
  const result = fillPriceFrom(
    '<span data-price-from="falls">US$999</span><strong data-price-from="boats">x</strong><span data-price-from="buggy">-</span>',
    tables
  );
  assert.ok(result.html.includes('<span data-price-from="falls">US$50</span>'), result.html);
  assert.ok(result.html.includes('<strong data-price-from="boats">US$900</strong>'), result.html);
  assert.ok(result.html.includes('<span data-price-from="buggy">-</span>'), result.html);
  assert.deepEqual(result.unknown, ['buggy']);
});
