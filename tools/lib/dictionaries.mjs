/**
 * dictionaries.mjs — Loads the site's translation dictionaries for the build (tools/build.mjs).
 *
 * The dictionaries are browser scripts (assets/js/translations*.js, src/i18n/ports.js) that assign
 * window.SITE_TRANSLATIONS. They are evaluated here, in order, inside a sandbox with a fake `window`,
 * so the build and the browser read exactly the same files.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * Evaluates the dictionary scripts in order and returns what they put in window.SITE_TRANSLATIONS.
 * @param {string[]} files - Absolute paths, in load order (translations.js first: it creates the object).
 * @returns {Record<string, Record<string, string>>} Dictionaries by language code ("es", "en", "fr"…).
 * @throws {Error} When a file cannot be read or does not run, naming the file.
 */
export function loadDictionaries(files) {
  const context = vm.createContext({ window: {} });
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch (error) {
      throw new Error(`Cannot read dictionary ${file}: ${error.message}`);
    }
    try {
      vm.runInContext(source, context, { filename: file });
    } catch (error) {
      throw new Error(`Dictionary ${file} failed to run: ${error.message}`);
    }
  }
  return context.window.SITE_TRANSLATIONS || {};
}
