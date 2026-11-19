/**
 * template.test.mjs — Tests for the template engine (tools/lib/template.mjs): includes, placeholders,
 * asset paths, template-only tags, per-language scripts and relative links between site URLs.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIncludes,
  fillPlaceholders,
  prefixAssetPaths,
  stripTemplateOnly,
  selectLangScripts,
  relativeUrl,
  rootPrefix
} from '../lib/template.mjs';

test('applyIncludes inlines partials', () => {
  const readPartial = (name) => {
    if (name === 'x.html') return 'X';
    throw new Error(`Missing partial ${name}`);
  };
  assert.equal(applyIncludes('a{{include:x.html}}b', readPartial), 'aXb');
  assert.throws(() => applyIncludes('{{include:y.html}}', readPartial), /y\.html/);
});

test('fillPlaceholders resolves names and arguments and reports unknown ones', () => {
  const values = { home: '', 'lang-url:es': 'es/' };
  const result = fillPlaceholders('{{home}}#tours {{lang-url:es}} {{nope}}', (name, arg) => {
    return values[arg === null ? name : `${name}:${arg}`];
  });
  assert.equal(result.html, '#tours es/ {{nope}}');
  assert.deepEqual(result.unknown, ['nope']);
});

test('prefixAssetPaths prefixes src, href and srcset only for assets/', () => {
  const html = '<img src="assets/a.webp"><link href="assets/b.css"><a href="https://x.com/assets/c">';
  const result = prefixAssetPaths(html, '../');
  assert.ok(result.includes('<img src="../assets/a.webp">'), result);
  assert.ok(result.includes('<link href="../assets/b.css">'), result);
  assert.ok(result.includes('<a href="https://x.com/assets/c">'), result);
});

test('stripTemplateOnly removes the template noindex', () => {
  const result = stripTemplateOnly('<meta name="robots" content="noindex" data-template-only>\n<title>');
  assert.ok(!result.includes('noindex'), result);
  assert.ok(result.includes('<title>'), result);
});

test('selectLangScripts keeps only the page language', () => {
  const html = '<script src="assets/js/translations-fr.js" defer data-lang-script="fr"></script>\n' +
    '<script src="assets/js/translations-it.js" defer data-lang-script="it"></script>';
  const french = selectLangScripts(html, 'fr');
  assert.ok(french.includes('translations-fr.js'), french);
  assert.ok(!french.includes('translations-it.js'), french);
  assert.ok(!french.includes('data-lang-script'), french);
  const english = selectLangScripts(html, 'en');
  assert.ok(!english.includes('translations-fr.js') && !english.includes('translations-it.js'), english);
});

test('relativeUrl covers the site link shapes', () => {
  const cases = [
    ['/', '/', ''],
    ['/', '/es/', 'es/'],
    ['/es/', '/', '../'],
    ['/es/', '/es/excursiones-amber-cove/', 'excursiones-amber-cove/'],
    ['/es/excursiones-amber-cove/', '/es/', '../'],
    ['/fr/', '/amber-cove-excursions/', '../amber-cove-excursions/'],
    ['/amber-cove-excursions/', '/taino-bay-excursions/', '../taino-bay-excursions/'],
    ['/es/excursiones-amber-cove/', '/amber-cove-excursions/', '../../amber-cove-excursions/']
  ];
  for (const [from, to, expected] of cases) {
    assert.equal(relativeUrl(from, to), expected, `${from} → ${to}`);
  }
});

test('rootPrefix', () => {
  assert.equal(rootPrefix('/'), '');
  assert.equal(rootPrefix('/es/'), '../');
  assert.equal(rootPrefix('/es/excursiones-amber-cove/'), '../../');
});

test('prefixAssetPaths prefixes a video poster too', () => {
  assert.equal(
    prefixAssetPaths('<video poster="assets/img/a.webp"><source src="assets/video/a.mp4"></video>', '../'),
    '<video poster="../assets/img/a.webp"><source src="../assets/video/a.mp4"></video>'
  );
});
