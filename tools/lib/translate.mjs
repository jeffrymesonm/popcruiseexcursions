/**
 * translate.mjs — Writes one language into a Spanish template and reads the Spanish copy back out.
 *
 * Markup contract (the same one assets/js/i18n.js used at runtime):
 * - an element with data-i18n="key" holds plain text only (no nested tags);
 * - data-i18n-<attr>="key" (alt, aria-label, placeholder, content, title) names the attribute that
 *   carries the translation of that key.
 * Elements that break the contract are reported as "unprocessed" so the build can fail loudly
 * instead of publishing Spanish text on a page in another language.
 */

/** Attributes that can carry a translation through data-i18n-<attr>. */
export const I18N_ATTRIBUTES = ['alt', 'aria-label', 'placeholder', 'content', 'title'];

/** <tag … data-i18n="key" …>plain text</tag>: 1 = tag, 2 = attributes, 3 = key, 4 = text, 5 = closing tag. */
const ELEMENT = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?\sdata-i18n="([^"]+)"[^>]*)>([^<]*)(<\/\1\s*>)/g;

/** Every data-i18n="key" occurrence, matched or not by ELEMENT. */
const ELEMENT_KEY = /\sdata-i18n="([^"]+)"/g;

/** Any opening tag that carries at least one data-i18n-<attr>. */
const ATTRIBUTE_TAG = /<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\sdata-i18n-(?:alt|aria-label|placeholder|content|title)="[^"]*"[^>]*>/g;

/** Named entities the templates use; anything else is left as written. */
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Escapes text for an HTML text node.
 * @param {string} text - Raw text.
 * @returns {string} Text with &, < and > escaped.
 */
export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes text for a double-quoted HTML attribute value.
 * @param {string} text - Raw text.
 * @returns {string} Text with &, <, > and " escaped.
 */
export function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * Decodes numeric entities and the common named ones (&amp; &lt; &gt; &quot; &apos; &nbsp;).
 * @param {string} text - HTML text.
 * @returns {string} Plain text.
 */
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const value = NAMED_ENTITIES[name.toLowerCase()];
    return value === undefined ? match : value;
  });
}

/**
 * Checks an own property without trusting the dictionary's prototype (it may come from a vm sandbox).
 * @param {object} object - Dictionary.
 * @param {string} key - Key to look up.
 * @returns {boolean} True when the dictionary defines the key.
 */
function hasKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Collapses runs of ASCII whitespace (not no-break spaces) and trims the ends.
 * @param {string} text - Text read from the markup.
 * @returns {string} Normalized text.
 */
function collapseSpaces(text) {
  return text.replace(/[ \t\r\n]+/g, ' ').trim();
}

/**
 * Counts how many times each data-i18n key appears in the markup.
 * @param {string} html - Template.
 * @returns {Map<string, number>} Occurrences by key.
 */
function countElementKeys(html) {
  const counts = new Map();
  for (const match of html.matchAll(ELEMENT_KEY)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  return counts;
}

/**
 * Lists the data-i18n-<attr> keys of one opening tag.
 * @param {string} tag - Opening tag.
 * @returns {Array<{attr: string, key: string}>} One entry per translatable attribute.
 */
function attributeKeys(tag) {
  return I18N_ATTRIBUTES.map((attr) => {
    const match = tag.match(new RegExp(`\\sdata-i18n-${attr}="([^"]+)"`));
    return match ? { attr, key: match[1] } : null;
  }).filter(Boolean);
}

/**
 * Writes the translated value of every data-i18n-<attr> into its attribute, adding the
 * attribute when the tag lacks it. The match needs whitespace before the name, so
 * "aria-label" never touches "data-i18n-aria-label".
 * @param {string} html - Markup.
 * @param {Record<string, string>} dict - Target-language dictionary.
 * @param {Set<string>} missing - Collects keys the dictionary lacks.
 * @returns {string} Markup with translated attributes.
 */
function translateAttributes(html, dict, missing) {
  return html.replace(ATTRIBUTE_TAG, (tag) => {
    let result = tag;
    for (const { attr, key } of attributeKeys(tag)) {
      if (!hasKey(dict, key)) {
        missing.add(key);
        continue;
      }
      const value = escapeAttr(dict[key]);
      const target = new RegExp(`(\\s${attr}=")[^"]*(")`);
      result = target.test(result)
        ? result.replace(target, (match, start, end) => start + value + end)
        : result.replace(/^<[a-zA-Z][a-zA-Z0-9]*/, (name) => `${name} ${attr}="${value}"`);
    }
    return result;
  });
}

/**
 * Writes one language into a template.
 * @param {string} html - Template (Spanish copy, data-i18n keys).
 * @param {Record<string, string>|null} dict - Target-language dictionary, or null to keep the Spanish
 *   copy (the markup is still validated).
 * @returns {{html: string, missing: string[], unprocessed: string[]}} The translated markup, keys the
 *   dictionary lacks, and data-i18n keys whose element does not hold plain text (both sorted, unique).
 */
export function translateHtml(html, dict) {
  const missing = new Set();
  const handled = new Map();
  let output = html.replace(ELEMENT, (match, tag, attrs, key, text, closing) => {
    handled.set(key, (handled.get(key) || 0) + 1);
    if (!dict) return match;
    if (!hasKey(dict, key)) {
      missing.add(key);
      return match;
    }
    return `<${tag}${attrs}>${escapeHtml(dict[key])}${closing}`;
  });
  const unprocessed = [...countElementKeys(html)]
    .filter(([key, count]) => handled.get(key) !== count)
    .map(([key]) => key);
  if (dict) output = translateAttributes(output, dict, missing);
  return { html: output, missing: [...missing].sort(), unprocessed: unprocessed.sort() };
}

/**
 * Reads the base-language (Spanish) copy of a template: the text of every data-i18n element and the
 * value of every data-i18n-<attr> attribute, decoded and with whitespace collapsed.
 * @param {string} html - Template after includes.
 * @returns {{dict: Record<string, string>, conflicts: string[]}} The strings by key, and the keys that
 *   appear with two different texts (sorted, unique).
 */
export function extractBaseDictionary(html) {
  const dict = {};
  const conflicts = new Set();
  const record = (key, raw) => {
    const value = collapseSpaces(decodeEntities(raw));
    if (!hasKey(dict, key)) dict[key] = value;
    else if (dict[key] !== value) conflicts.add(key);
  };
  for (const match of html.matchAll(ELEMENT)) record(match[3], match[4]);
  for (const match of html.matchAll(ATTRIBUTE_TAG)) {
    for (const { attr, key } of attributeKeys(match[0])) {
      const value = match[0].match(new RegExp(`\\s${attr}="([^"]*)"`));
      if (value) record(key, value[1]);
    }
  }
  return { dict, conflicts: [...conflicts].sort() };
}
