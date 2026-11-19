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

test('templates keep their noindex inside <head> (they are reachable under /src/)', () => {
  for (const template of ['src/index.html', 'src/amber-cove.html', 'src/taino-bay.html', 'src/catamaran.html']) {
    const html = fs.readFileSync(path.join(ROOT, template), 'utf8');
    const noindex = html.indexOf('content="noindex" data-template-only');
    assert.ok(noindex > -1, `${template} has a template-only noindex`);
    assert.ok(noindex < html.indexOf('{{include:head.html}}'), `${template}: noindex comes before the head include`);
  }
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
  // Links to the English root carry ?lang=en, so the choice holds even without localStorage.
  assert.match(spanish, /<a [^>]*href="\.\.\/\?lang=en" hreflang="en"/);
  assert.match(read('es/excursiones-amber-cove/index.html'), /<a [^>]*href="\.\.\/\.\.\/amber-cove-excursions\/" hreflang="en"/);
  assert.match(spanish, /<a [^>]*data-lang-option="es" aria-current="page"/);
  const english = read('index.html');
  assert.match(english, /<a [^>]*href="es\/" hreflang="es"/);
  assert.ok(english.includes('aria-label="Open menu"'));
});

test('only the root carries the redirect', () => {
  assert.ok(read('index.html').includes('location.replace'));
  for (const file of ['es/index.html', 'fr/index.html', 'it/index.html']) {
    assert.ok(!read(file).includes('location.replace'), `${file} has no redirect`);
  }
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
  assert.equal(business.paymentAccepted, 'PayPal, Zelle, Cash App');
  const trips = graph.filter((node) => node['@type'] === 'TouristTrip');
  assert.equal(trips.length, 6);
  const falls = trips.find((trip) => trip['@id'].endsWith('#tour-damajagua'));
  assert.equal(falls.offers.lowPrice, 50);
  assert.equal(falls.offers.highPrice, 120);
  assert.equal(graph.find((node) => node['@type'] === 'FAQPage').mainEntity.length, 10);
});

test('title targets both ports', () => {
  const html = read('index.html');
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&');
  assert.ok(title.includes('Amber Cove') && title.includes('Taíno Bay'), title);
  assert.ok(title.length <= 60, `${title.length} characters`);
  assert.match(html.match(/<h1[\s\S]*?<\/h1>/)[0], /Puerto Plata/);
});

test('ten FAQs in every main version', () => {
  for (const file of MAIN_PAGES) {
    const faq = graphOf(read(file)).find((node) => node['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, 10, file);
  }
});

test('main pages link the port pages', () => {
  assert.ok(read('index.html').includes('href="amber-cove-excursions/"'));
  assert.ok(read('es/index.html').includes('href="excursiones-amber-cove/"'));
  assert.ok(read('fr/index.html').includes('href="../amber-cove-excursions/" hreflang="en"'));
});

test('boats block says private boat, per boat and 4 hours', () => {
  for (const file of MAIN_PAGES) {
    const html = read(file);
    assert.ok(html.includes('class="boat-private"'), `${file}: private-boat note`);
    assert.ok(html.includes('data-i18n="boats.per-boat"'), `${file}: per boat next to the from price`);
  }
  const es = read('es/index.html');
  assert.ok(es.includes('no por persona'));
  assert.equal((es.match(/<li>4 <span data-i18n="boats.hours">horas<\/span><\/li>/g) || []).length, 6);
  assert.ok(!es.includes('3–4 <span data-i18n="boats.hours">'));
  assert.ok(read('index.html').includes('not per person'));
});

test('Spanish page names the place', () => {
  assert.ok(read('es/index.html').includes('27 Charcos de Damajagua'));
});

test('builds the four port pages', () => {
  for (const file of [
    'amber-cove-excursions/index.html',
    'es/excursiones-amber-cove/index.html',
    'taino-bay-excursions/index.html',
    'es/excursiones-taino-bay/index.html'
  ]) {
    assert.ok(result.files.includes(file), `${file} was built`);
  }
});

test('English Amber Cove page', () => {
  const html = read('amber-cove-excursions/index.html');
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('<link rel="canonical" href="https://popcruiseexcursions.com/amber-cove-excursions/">'));
  assert.ok(html.includes('hreflang="es" href="https://popcruiseexcursions.com/es/excursiones-amber-cove/"'));
  assert.ok(html.includes('hreflang="x-default" href="https://popcruiseexcursions.com/amber-cove-excursions/"'));
  assert.match(html, /<h1[^>]*>[^<]*Amber Cove[^<]*<\/h1>/);
  assert.ok(html.includes('src="../assets/'));
  assert.ok(html.includes('href="../#tour-damajagua"'));
  assert.ok(html.includes('href="../?tour=damajagua#booking"'));
  assert.ok(!html.includes('location.replace'));
  const graph = graphOf(html);
  const terminal = graph.find((node) => node['@type'] === 'BoatTerminal');
  assert.equal(terminal.geo.latitude, 19.8326);
  assert.equal(graph.find((node) => node['@type'] === 'BreadcrumbList').itemListElement.length, 2);
  assert.equal(graph.find((node) => node['@type'] === 'FAQPage').mainEntity.length, 5);
});

test('Spanish Taíno Bay page', () => {
  const html = read('es/excursiones-taino-bay/index.html');
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(html.includes('src="../../assets/'));
  assert.ok(html.includes('href="../#tour-city"'));
  assert.ok(html.includes('data-price-from="damajagua">US$50<'));
  assert.ok(!('geo' in graphOf(html).find((node) => node['@type'] === 'BoatTerminal')));
  assert.doesNotMatch(html, /<script [^>]*translations-fr\.js/);
});

test('sitemap and llms.txt', () => {
  assert.equal((read('sitemap.xml').match(/<loc>/g) || []).length, 10);
  const llms = read('llms.txt');
  for (const text of ['Puerto Plata Cruise Excursions', '+1 (829) 627-7733', 'Damajagua', 'US$12']) {
    assert.ok(llms.includes(text), `llms.txt mentions ${text}`);
  }
});

test('builds the two catamaran pages', () => {
  for (const file of ['puerto-plata-catamaran/index.html', 'es/catamaran-puerto-plata/index.html']) {
    assert.ok(result.files.includes(file), `${file} was built`);
  }
});

test('English catamaran page', () => {
  const url = 'https://popcruiseexcursions.com/puerto-plata-catamaran/';
  const html = read('puerto-plata-catamaran/index.html');
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes('hreflang="es" href="https://popcruiseexcursions.com/es/catamaran-puerto-plata/"'));
  assert.match(html, /<h1[^>]*>[^<]*Catamaran[^<]*<\/h1>/);
  assert.ok(html.includes('not per person'));
  assert.ok(html.includes('data-default-tour="catamaran"'));
  assert.ok(html.includes('id="booking"'));
  const graph = graphOf(html);
  const trips = graph.filter((node) => node['@type'] === 'TouristTrip');
  assert.equal(trips.length, 1);
  assert.equal(trips[0].url, url);
  assert.equal(graph.find((node) => node['@type'] === 'BreadcrumbList').itemListElement.length, 2);
  assert.equal(graph.find((node) => node['@type'] === 'FAQPage').mainEntity.length, 6);
});

test('catamaran page lists the six boats with static prices', () => {
  const html = read('es/catamaran-puerto-plata/index.html');
  assert.equal((html.match(/data-boat-panel="/g) || []).length, 6);
  assert.ok(html.includes('data-price-from="boat-viking">US$900<'));
  assert.ok(html.includes('src="../../assets/img/boat-viking.webp"'));
});

test('catamaran page language links', () => {
  const html = read('puerto-plata-catamaran/index.html');
  assert.ok(html.includes('href="../es/catamaran-puerto-plata/" hreflang="es"'));
  assert.ok(html.includes('href="../fr/" hreflang="fr"'));
});

test('port pages and footer link the catamaran page', () => {
  assert.ok(read('amber-cove-excursions/index.html').includes('href="../puerto-plata-catamaran/"'));
  assert.ok(read('es/index.html').includes('href="catamaran-puerto-plata/"'));
  assert.ok(read('fr/index.html').includes('href="../puerto-plata-catamaran/" hreflang="en"'));
  assert.ok(read('llms.txt').includes('https://popcruiseexcursions.com/puerto-plata-catamaran/'));
});

test('booking links stay on pages that have the form', () => {
  for (const file of ['puerto-plata-catamaran/index.html', 'es/catamaran-puerto-plata/index.html', 'index.html']) {
    const html = read(file);
    assert.ok(html.includes('class="btn btn--sun nav__cta" href="#booking"'), `${file}: header CTA stays on the page`);
    assert.ok(!/href="\.\.\/(\.\.\/)?#booking"/.test(html), `${file}: no booking link to another page`);
  }
  assert.ok(read('amber-cove-excursions/index.html').includes('class="btn btn--sun nav__cta" href="../#booking"'));
});
