/**
 * template.mjs — The small template engine behind tools/build.mjs.
 *
 * Templates in src/ are plain HTML plus a few markers:
 * - {{include:<file>}} inlines a partial from src/partials/ (one level: partials may hold other
 *   markers but no includes);
 * - {{name}} / {{name:arg}} are filled per page and language by the build (see tools/build.mjs);
 * - data-template-only marks tags that exist only in the template (its noindex meta);
 * - data-lang-script="xx" marks scripts that only the page in language xx loads.
 * It also writes the relative paths that let one template serve pages at different folder depths, and
 * the ?v= versions of local scripts and stylesheets (cache-busting).
 */

/** {{include:<file>}} — 1 = file name. */
const INCLUDE = /\{\{include:([a-zA-Z0-9._/-]+)\}\}/g;

/** {{name}} or {{name:arg}} — 1 = name, 2 = argument. */
const PLACEHOLDER = /\{\{([a-z][a-z0-9-]*)(?::([a-zA-Z0-9._/-]+))?\}\}/g;

/** A void tag carrying data-template-only, with its indentation and line break. */
const TEMPLATE_ONLY = /[ \t]*<[a-zA-Z][^>]*\sdata-template-only(?:="[^"]*")?[^>]*>[ \t]*(?:\r?\n)?/g;

/** <script … data-lang-script="xx" …></script> with its indentation and line break — 1 = language. */
const LANG_SCRIPT = /[ \t]*<script\b[^>]*\sdata-lang-script="([a-z]+)"[^>]*><\/script>[ \t]*(?:\r?\n)?/g;

/**
 * Inlines {{include:<file>}} markers.
 * @param {string} html - Template.
 * @param {(name: string) => string} readPartial - Returns a partial's markup; throws when it is missing.
 * @returns {string} Markup with every include replaced.
 */
export function applyIncludes(html, readPartial) {
  return html.replace(INCLUDE, (match, name) => readPartial(name));
}

/**
 * Replaces {{name}} and {{name:arg}} markers.
 * @param {string} html - Markup.
 * @param {(name: string, arg: string|null) => string|undefined} resolve - Value for a marker, or
 *   undefined when the marker is unknown (it is then left in place and reported).
 * @returns {{html: string, unknown: string[]}} Filled markup and the unknown markers (sorted, unique).
 */
export function fillPlaceholders(html, resolve) {
  const unknown = new Set();
  const output = html.replace(PLACEHOLDER, (match, name, arg) => {
    const value = resolve(name, arg === undefined ? null : arg);
    if (value === undefined) {
      unknown.add(arg === undefined ? name : `${name}:${arg}`);
      return match;
    }
    return value;
  });
  return { html: output, unknown: [...unknown].sort() };
}

/**
 * Makes relative asset paths work from a page that lives in a sub-folder: every src/href/poster value
 * and every srcset candidate that starts with "assets/" gets the prefix.
 * @param {string} html - Markup.
 * @param {string} prefix - Path back to the site root, e.g. "../" ('' leaves the markup as is).
 * @returns {string} Markup with prefixed asset paths.
 */
export function prefixAssetPaths(html, prefix) {
  if (!prefix) return html;
  return html
    .replace(/(\s(?:src|href|poster)=")assets\//g, (match, start) => `${start}${prefix}assets/`)
    .replace(/(\ssrcset=")([^"]*)(")/g, (match, start, value, end) =>
      start + value.replace(/(^|,\s*)assets\//g, (candidate, separator) => `${separator}${prefix}assets/`) + end);
}

/**
 * Cache-busting: appends "?v=<version>" to the src of every <script> and the href of every <link>
 * (stylesheets, preloads) that points to a local .js or .css file under assets/, so a deploy never
 * mixes new pages with old cached scripts and styles. URLs that already carry a query or a hash, images
 * and external URLs are left as they are. Runs before prefixAssetPaths (paths still start with "assets/").
 * @param {string} html - Markup.
 * @param {(assetPath: string) => string|null} versionOf - Version of a file ("assets/js/i18n.js"), or
 *   null when the file does not exist (the reference is then left as is and reported).
 * @returns {{html: string, missing: string[]}} Versioned markup, and the referenced files that do not
 *   exist (sorted, unique).
 */
export function versionAssetUrls(html, versionOf) {
  const missing = new Set();
  const output = html.replace(/<(?:script|link)\b[^>]*>/g, (tag) =>
    tag.replace(/(\s(?:src|href)=")(assets\/[^"?#]+\.(?:js|css))"/, (match, start, assetPath) => {
      const version = versionOf(assetPath);
      if (version === null) {
        missing.add(assetPath);
        return match;
      }
      return `${start}${assetPath}?v=${version}"`;
    }));
  return { html: output, missing: [...missing].sort() };
}

/**
 * Removes the tags that only make sense in the template (void tags such as its noindex <meta>).
 * @param {string} html - Markup.
 * @returns {string} Markup without data-template-only tags.
 */
export function stripTemplateOnly(html) {
  return html.replace(TEMPLATE_ONLY, '');
}

/**
 * Keeps the per-language scripts of one language and drops the others.
 * @param {string} html - Markup.
 * @param {string} lang - Page language ("en", "es", "fr", "it").
 * @returns {string} Markup where only that language's data-lang-script tags remain (without the attribute).
 */
export function selectLangScripts(html, lang) {
  return html.replace(LANG_SCRIPT, (match, scriptLang) =>
    scriptLang === lang ? match.replace(/\sdata-lang-script="[a-z]+"/, '') : '');
}

/**
 * Splits a site URL path ("/es/excursiones-amber-cove/") into its folders.
 * @param {string} urlPath - Path that starts and ends with "/".
 * @returns {string[]} Folder names.
 */
function segments(urlPath) {
  return urlPath.split('/').filter(Boolean);
}

/**
 * Relative link from one site page to another (both URL paths ending in "/").
 * @param {string} from - Path of the page that holds the link, e.g. "/es/".
 * @param {string} to - Path of the target page, e.g. "/amber-cove-excursions/".
 * @returns {string} Relative URL ("../amber-cove-excursions/"), or '' when both are the same page.
 */
export function relativeUrl(from, to) {
  if (from === to) return '';
  const fromParts = segments(from);
  const toParts = segments(to);
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1;
  }
  const up = '../'.repeat(fromParts.length - common);
  const down = toParts.slice(common).map((part) => `${part}/`).join('');
  return up + down || './';
}

/**
 * Path from a page back to the site root.
 * @param {string} urlPath - Page path, e.g. "/es/excursiones-amber-cove/".
 * @returns {string} '' for "/", "../" for "/es/", "../../" two folders deep.
 */
export function rootPrefix(urlPath) {
  return '../'.repeat(segments(urlPath).length);
}
