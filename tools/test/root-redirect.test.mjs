/**
 * root-redirect.test.mjs — Tests for the root page's language redirect (src/partials/root-redirect.html):
 * the inline script runs in a sandbox with a fake location, navigator and localStorage.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Runs the redirect script once.
 * @param {{protocol?: string, search?: string, hash?: string, languages?: string[], stored?: string|null}} visit
 *   What the visitor's browser looks like.
 * @returns {{replaced: string[], storage: Map<string, string>}} URLs passed to location.replace, and storage.
 */
function runRedirect({ protocol = 'https:', search = '', hash = '', languages = ['en-US'], stored = null, storageBlocked = false }) {
  const partial = fs.readFileSync(path.join(ROOT, 'src/partials/root-redirect.html'), 'utf8');
  const script = partial.match(/<script>([\s\S]*?)<\/script>/)[1];
  const storage = new Map(stored ? [['site-lang', stored]] : []);
  const replaced = [];
  const blocked = () => { throw new Error('SecurityError: storage is blocked'); };
  const context = vm.createContext({
    location: { protocol, search, hash, replace: (url) => replaced.push(url) },
    navigator: { languages, language: languages[0] },
    localStorage: storageBlocked
      ? { getItem: blocked, setItem: blocked }
      : {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, String(value))
      },
    URLSearchParams
  });
  context.window = context;
  vm.runInContext(script, context);
  return { replaced, storage };
}

test('redirects Spanish browsers to es/', () => {
  assert.deepEqual(runRedirect({ languages: ['es-DO'] }).replaced, ['es/']);
});

test('keeps English browsers on the root', () => {
  assert.deepEqual(runRedirect({ languages: ['en-US'] }).replaced, []);
});

test('respects a saved English choice', () => {
  assert.deepEqual(runRedirect({ languages: ['es-ES'], stored: 'en' }).replaced, []);
});

test('?lang wins and is saved', () => {
  const { replaced, storage } = runRedirect({ search: '?lang=fr', languages: ['en-US'] });
  assert.deepEqual(replaced, ['fr/']);
  assert.equal(storage.get('site-lang'), 'fr');
});

test('keeps tour, boat and hash, drops lang', () => {
  assert.deepEqual(
    runRedirect({ search: '?tour=damajagua&boat=viking', hash: '#booking', languages: ['it-IT'] }).replaced,
    ['it/?tour=damajagua&boat=viking#booking']
  );
  assert.deepEqual(runRedirect({ search: '?lang=es&tour=city', languages: ['en-US'] }).replaced, ['es/?tour=city']);
});

test('does nothing on file:', () => {
  assert.deepEqual(runRedirect({ protocol: 'file:', languages: ['es'] }).replaced, []);
});

test('ignores built-in object names in ?lang and never saves them', () => {
  const { replaced, storage } = runRedirect({ search: '?lang=constructor', languages: ['en-US'] });
  assert.deepEqual(replaced, []);
  assert.ok(!storage.has('site-lang'));
});

test('ignores a corrupted saved choice and falls back to the browser language', () => {
  assert.deepEqual(runRedirect({ stored: 'constructor', languages: ['es-ES'] }).replaced, ['es/']);
  assert.deepEqual(runRedirect({ stored: '__proto__', languages: ['en-US'] }).replaced, []);
});

test('an explicit English link works when storage is blocked', () => {
  assert.deepEqual(runRedirect({ search: '?lang=en', languages: ['es-ES'], storageBlocked: true }).replaced, []);
});
