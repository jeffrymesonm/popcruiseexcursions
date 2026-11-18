/**
 * translate.test.mjs — Tests for the dictionary loader and the template translator
 * (tools/lib/dictionaries.mjs, tools/lib/translate.mjs). Run with: node --test tools/test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateHtml, extractBaseDictionary } from '../lib/translate.mjs';
import { loadDictionaries } from '../lib/dictionaries.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('replaces element text and escapes it', () => {
  const result = translateHtml('<p class="x" data-i18n="a">Hola</p>', { a: 'Fish & <chips>' });
  assert.ok(result.html.includes('<p class="x" data-i18n="a">Fish &amp; &lt;chips&gt;</p>'), result.html);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unprocessed, []);
});

test('sets the attribute named by data-i18n-<attr>', () => {
  const result = translateHtml('<img src="x.webp" alt="Uno" data-i18n-alt="b" title="Keep">', { b: 'Say "hi"' });
  assert.ok(result.html.includes('alt="Say &quot;hi&quot;"'), result.html);
  assert.ok(result.html.includes('title="Keep"'), result.html);
});

test('does not touch aria-label when only data-i18n-alt is set', () => {
  const result = translateHtml('<img alt="Uno" aria-label="Etiqueta" data-i18n-alt="b">', { b: 'One' });
  assert.ok(result.html.includes('aria-label="Etiqueta"'), result.html);
  assert.ok(result.html.includes('alt="One"'), result.html);
});

test('adds a missing target attribute', () => {
  const result = translateHtml('<input data-i18n-placeholder="p">', { p: 'Name' });
  assert.ok(result.html.includes('placeholder="Name"'), result.html);
});

test('reports missing keys', () => {
  const result = translateHtml('<p data-i18n="z">a</p><p data-i18n="a">b</p>', {});
  assert.deepEqual(result.missing, ['a', 'z']);
});

test('reports data-i18n elements with nested tags', () => {
  const source = '<p data-i18n="a">Hola <b>x</b></p>';
  assert.deepEqual(translateHtml(source, { a: 'Hi' }).unprocessed, ['a']);
  const base = translateHtml(source, null);
  assert.deepEqual(base.unprocessed, ['a']);
  assert.equal(base.html, source);
});

test('extractBaseDictionary reads text and attributes and flags conflicts', () => {
  const { dict, conflicts } = extractBaseDictionary(
    '<p data-i18n="a">Hola &amp; adiós</p><p data-i18n="a">Otro</p><img alt="Foto" data-i18n-alt="b">'
  );
  assert.equal(dict.a, 'Hola & adiós');
  assert.equal(dict.b, 'Foto');
  assert.deepEqual(conflicts, ['a']);
});

test('loadDictionaries reads the site files', () => {
  const dicts = loadDictionaries([
    path.join(ROOT, 'assets/js/translations.js'),
    path.join(ROOT, 'assets/js/translations-fr.js'),
    path.join(ROOT, 'assets/js/translations-it.js')
  ]);
  assert.equal(dicts.en['tours.damajagua.title'], 'Damajagua Waterfalls');
  assert.ok(dicts.fr['nav.book'].length > 0);
  assert.ok(dicts.it['nav.book'].length > 0);
  assert.ok(dicts.es['wa.greeting'].startsWith('¡Hola'));
});
