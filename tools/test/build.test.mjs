/**
 * build.test.mjs — Integration test of the static build (tools/build.mjs): runs the real build into a
 * temporary folder and checks the generated pages, sitemap.xml and llms.txt.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN_PAGES = ['index.html', 'es/index.html', 'fr/index.html', 'it/index.html'];
let result;
let outDir;

/**
 * Reads a generated file.
 * @param {string} file - Path relative to the output folder.
 * @returns {string} File contents.
 */
function read(file) {
  return fs.readFileSync(path.join(outDir, file), 'utf8');
}

/**
 * Parses the JSON-LD graph of a generated page.
 * @param {string} html - Page markup.
 * @returns {object[]} The @graph nodes.
 */
function graphOf(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'page has a JSON-LD script');
  return JSON.parse(match[1])['@graph'];
}

before(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pop-'));
  result = await build({ root: ROOT, outDir });
});

test('builds without errors', () => {
  assert.deepEqual(result.errors, []);
  for (const file of [...MAIN_PAGES, 'sitemap.xml', 'llms.txt']) {
    assert.ok(result.files.includes(file), `${file} was built`);
  }
});

test('every page is static, complete and marked as generated', () => {
  for (const file of result.files.filter((name) => name.endsWith('.html'))) {
    const html = read(file);
    const lines = html.split(/\r?\n/);
    assert.equal(lines[0], '<!doctype html>', file);
    assert.ok(lines[1].includes('GENERATED'), `${file}: banner on line 2`);
    for (const leftover of ['{{', 'noindex', 'data-template-only', 'data-lang-script']) {
      assert.ok(!html.includes(leftover), `${file} has no ${leftover}`);
    }
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${file}: one h1`);
  }
});

test('root is English with hreflang', () => {
  const html = read('index.html');
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('<link rel="canonical" href="https://popcruiseexcursions.com/">'));
  assert.ok(html.includes('hreflang="es" href="https://popcruiseexcursions.com/es/"'));
  assert.ok(html.includes('hreflang="x-default" href="https://popcruiseexcursions.com/"'));
  assert.ok(html.includes('Book your tour'));
});

test('Spanish page lives in /es/', () => {
  const html = read('es/index.html');
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(html.includes('<link rel="canonical" href="https://popcruiseexcursions.com/es/">'));
  assert.ok(html.includes('Reserva tu excursión'));
  assert.ok(html.includes('src="../assets/img/hero.webp"'));
  assert.doesNotMatch(html, /<script [^>]*translations-fr\.js/);
  assert.doesNotMatch(html, /<script [^>]*translations-it\.js/);
});

test('French page loads only its dictionary', () => {
  const html = read('fr/index.html');
  assert.match(html, /<script src="\.\.\/assets\/js\/translations-fr\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script [^>]*translations-it\.js/);
});

test('language links point to the other versions', () => {
  const spanish = read('es/index.html');
  assert.match(spanish, /<a [^>]*href="\.\.\/" hreflang="en"/);
  assert.match(spanish, /<a [^>]*data-lang-option="es" aria-current="page"/);
  const english = read('index.html');
  assert.match(english, /<a [^>]*href="es\/" hreflang="es"/);
  assert.ok(english.includes('aria-label="Open menu"'));
});

test('from prices are filled without JavaScript', () => {
  const html = read('index.html');
  assert.ok(html.includes('data-price-from="all">US$12<'));
  assert.ok(html.includes('data-price-from="catamaran">US$900<'));
});

test('JSON-LD describes the business, six tours and the FAQ', () => {
  const graph = graphOf(read('index.html'));
  const business = graph.find((node) => node['@type'] === 'TravelAgency');
  assert.equal(business['@id'], 'https://popcruiseexcursions.com/#org');
  assert.equal(business.priceRange, 'US$12–US$1,300');
  const trips = graph.filter((node) => node['@type'] === 'TouristTrip');
  assert.equal(trips.length, 6);
  const falls = trips.find((trip) => trip['@id'].endsWith('#tour-damajagua'));
  assert.equal(falls.offers.lowPrice, 50);
  assert.equal(falls.offers.highPrice, 100);
  assert.equal(graph.find((node) => node['@type'] === 'FAQPage').mainEntity.length, 7);
});

test('sitemap and llms.txt', () => {
  assert.equal((read('sitemap.xml').match(/<loc>/g) || []).length, 4);
  const llms = read('llms.txt');
  for (const text of ['Puerto Plata Cruise Excursions', '+1 (829) 627-7733', 'Damajagua', 'US$12']) {
    assert.ok(llms.includes(text), `llms.txt mentions ${text}`);
  }
});
