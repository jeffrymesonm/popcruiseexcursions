/**
 * build.mjs — Static site generator for popcruiseexcursions.com.
 *
 * Reads the Spanish templates in src/ (partials in src/partials/), the dictionaries listed in
 * tools/site.config.mjs and the price tables of src/index.html (with its partials: the boat tables are in
 * src/partials/boats.html), and writes:
 * - one static page per language version ("/" = English, /es/, /fr/, /it/, the port pages, the catamaran page…), each with
 *   its title, description, canonical, hreflang alternates, Open Graph tags and JSON-LD;
 * - sitemap.xml (with language alternates) and llms.txt (a summary for AI assistants).
 * Every generated page starts with a GENERATED banner: edit src/ and the dictionaries, never the output.
 * A missing translation, an unknown marker, an unpriced "from" label or a page without exactly one
 * <h1> stops the build, and nothing is written.
 *
 * Usage: node tools/build.mjs          (writes into the repository root)
 * API:   build({ root, outDir })       (the tests write into a temporary folder)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as config from './site.config.mjs';
import { loadDictionaries } from './lib/dictionaries.mjs';
import { translateHtml, extractBaseDictionary, decodeEntities } from './lib/translate.mjs';
import {
  applyIncludes, fillPlaceholders, prefixAssetPaths, stripTemplateOnly, selectLangScripts, relativeUrl, rootPrefix
} from './lib/template.mjs';
import { parsePriceTables, minPrice, maxPrice, priceCount, formatUsd, fillPriceFrom } from './lib/prices.mjs';
import { seoHeadTags, sitemapXml, jsonLdScript, llmsTxt, absoluteUrl } from './lib/seo.mjs';
import { buildGraph } from './lib/schema.mjs';

/** Template whose price tables are the single source of prices. */
const MAIN_TEMPLATE = 'src/index.html';
/** Folder of the {{include:…}} partials. */
const PARTIALS_DIR = 'src/partials';
/** Lengths above which search results cut the title / description (warnings, not errors). */
const TITLE_MAX = 65;
const DESCRIPTION_MAX = 165;

/**
 * Output file of a URL path.
 * @param {string} urlPath - "/" or "/es/excursiones-amber-cove/".
 * @returns {string} "index.html" or "es/excursiones-amber-cove/index.html".
 */
function outputFile(urlPath) {
  return `${urlPath.slice(1)}index.html`;
}

/**
 * The home page definition.
 * @returns {object} PageDef with id "home".
 */
function homePage() {
  return config.PAGES.find((page) => page.id === 'home');
}

/**
 * URL path of the home page in a language (the default language when it has no such version).
 * @param {string} lang - Language code.
 * @returns {string} URL path.
 */
function homePath(lang) {
  const home = homePage();
  return home.versions[lang] || home.versions[config.DEFAULT_LANG];
}

/**
 * Page definition by id.
 * @param {string} pageId - "home", "amber-cove", "catamaran"…
 * @returns {object|undefined} PageDef, or undefined when there is no such page.
 */
function pageById(pageId) {
  return config.PAGES.find((page) => page.id === pageId);
}

/**
 * Absolute URL of a tour: its own landing page in that language when there is one (the catamaran
 * page), else its card on the home page.
 * @param {string} tourId - TOURS id.
 * @param {string} lang - Language code.
 * @returns {string} Absolute URL.
 */
function tourUrl(tourId, lang) {
  const landing = config.PAGES.find((page) => page.tour === tourId && page.versions[lang]);
  if (landing) return absoluteUrl(config.SITE.origin, landing.versions[lang]);
  return `${absoluteUrl(config.SITE.origin, homePath(lang))}#tour-${tourId}`;
}

/**
 * Price range of the business: lowest per-person price to the highest price of any table.
 * @param {Array<object>} tables - Parsed price tables.
 * @returns {string} E.g. "US$12–US$1,300" ('' when there are no prices).
 */
function priceRange(tables) {
  const low = minPrice(tables, 'all');
  const highs = tables.map((table) => maxPrice(tables, table.id)).filter((amount) => amount !== null);
  return low === null || !highs.length ? '' : `${formatUsd(low)}–${formatUsd(Math.max(...highs))}`;
}

/**
 * Reads a dictionary entry, recording an error when it is missing.
 * @param {Record<string, string>} dict - Dictionary of the page language.
 * @param {string} key - Translation key.
 * @param {string[]} errors - Collects build errors.
 * @param {string} where - Page label for the error message.
 * @returns {string} The text ('' when missing).
 */
function textOf(dict, key, errors, where) {
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  errors.push(`${where}: missing text for "${key}"`);
  return '';
}

/**
 * FAQ keys of a template, in document order: "faq.1", "port.ac.faq.2"… (each has .q and .a).
 * @param {string} html - Template.
 * @returns {string[]} Key prefixes.
 */
function faqKeys(html) {
  const keys = [];
  for (const match of html.matchAll(/\sdata-i18n="((?:[\w-]+\.)*faq\.\d+)\.q"/g)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

/**
 * Questions and answers of a page in one language.
 * @param {string} template - Template.
 * @param {Record<string, string>} dict - Dictionary of the page language.
 * @param {string[]} errors - Collects build errors.
 * @param {string} where - Page label.
 * @returns {Array<{q: string, a: string}>} FAQ entries.
 */
function faqOf(template, dict, errors, where) {
  return faqKeys(template).map((key) => ({
    q: textOf(dict, `${key}.q`, errors, where),
    a: textOf(dict, `${key}.a`, errors, where)
  }));
}

/**
 * Title and description of a rendered page.
 * @param {string} html - Page markup.
 * @returns {{title: string, description: string}} Decoded texts ('' when absent).
 */
function pageMeta(html) {
  const title = (html.match(/<title\b[^>]*>([^<]*)<\/title>/) || [null, ''])[1];
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [null, ''])[1];
  return { title: decodeEntities(title), description: decodeEntities(description) };
}

/**
 * The six tours in one language, for the JSON-LD and llms.txt.
 * @param {Record<string, string>} dict - Dictionary of the language.
 * @param {string} lang - Language code (decides which home page the tour links point to).
 * @param {Array<object>} tables - Parsed price tables.
 * @param {string[]} errors - Collects build errors.
 * @param {string} where - Page label.
 * @returns {Array<object>} TourData list (see tools/lib/schema.mjs).
 */
function toursOf(dict, lang, tables, errors, where) {
  return config.TOURS.map((tour) => {
    const low = tour.scope ? minPrice(tables, tour.scope) : null;
    return {
      id: tour.id,
      name: textOf(dict, `tours.${tour.id}.title`, errors, where),
      description: textOf(dict, `tours.${tour.id}.desc`, errors, where),
      image: tour.image,
      url: tourUrl(tour.id, lang),
      offer: low === null ? null : { low, high: maxPrice(tables, tour.scope), count: priceCount(tables, tour.scope) },
      stops: tour.stops
        ? Array.from({ length: tour.stops }, (unused, index) => textOf(dict, `tours.${tour.id}.stop${index + 1}`, errors, where))
        : undefined
    };
  });
}

/**
 * Data of the port a page is about, for its JSON-LD.
 * @param {object} page - PageDef with a port.
 * @param {string} lang - Language code.
 * @param {Record<string, string>} dict - Dictionary of the language.
 * @param {string[]} errors - Collects build errors.
 * @param {string} where - Page label.
 * @returns {object|undefined} PortData (see tools/lib/schema.mjs), or undefined for non-port pages.
 */
function portOf(page, lang, dict, errors, where) {
  if (!page.port) return undefined;
  const port = config.PORTS[page.port];
  if (!port) {
    errors.push(`${where}: tools/site.config.mjs has no PORTS entry for "${page.port}"`);
    return undefined;
  }
  return {
    id: page.port,
    name: port.name,
    geo: port.geo,
    homeUrl: absoluteUrl(config.SITE.origin, homePath(lang)),
    homeName: textOf(dict, 'port.home', errors, where),
    pageName: textOf(dict, `port.${port.key}.h1`, errors, where)
  };
}

/**
 * Kind of page, for its JSON-LD.
 * @param {object} page - PageDef.
 * @returns {'home'|'port'|'tour'} "port" for cruise-port pages, "tour" for one-tour pages, else "home".
 */
function pageTypeOf(page) {
  if (page.port) return 'port';
  return page.tour ? 'tour' : 'home';
}

/**
 * Data of the tour a tour page is about (e.g. the catamaran page), for its JSON-LD.
 * @param {object} page - PageDef with a tour and a textKey (its H1 is "<textKey>.h1").
 * @param {string} lang - Language code.
 * @param {Record<string, string>} dict - Dictionary of the language.
 * @param {string[]} errors - Collects build errors.
 * @param {string} where - Page label.
 * @returns {object|undefined} TourPageData (see tools/lib/schema.mjs), or undefined for other pages.
 */
function tourPageOf(page, lang, dict, errors, where) {
  if (!page.tour) return undefined;
  if (!config.TOURS.some((tour) => tour.id === page.tour)) {
    errors.push(`${where}: tools/site.config.mjs has no TOURS entry for "${page.tour}"`);
    return undefined;
  }
  return {
    id: page.tour,
    homeUrl: absoluteUrl(config.SITE.origin, homePath(lang)),
    homeName: textOf(dict, 'port.home', errors, where),
    pageName: textOf(dict, `${page.textKey}.h1`, errors, where)
  };
}

/**
 * Value of a template marker for one page version.
 * @param {{page: object, lang: string, urlPath: string, seoHead: string, readPartial: Function,
 *   hasBooking: boolean}} context - hasBooking: the page has the booking form (id="booking").
 * @returns {(name: string, arg: string|null) => string|undefined} Resolver for fillPlaceholders.
 */
function markerResolver({ page, lang, urlPath, seoHead, readPartial, hasBooking }) {
  return (name, arg) => {
    if (name === 'home' && arg === null) return relativeUrl(urlPath, homePath(lang));
    // {{book-url}}: the booking form of this page when it has one (home, catamaran page), else the home page's.
    if (name === 'book-url' && arg === null) return hasBooking ? '#booking' : `${relativeUrl(urlPath, homePath(lang))}#booking`;
    if (name === 'current' && arg) return arg === lang ? ' aria-current="page"' : '';
    if (name === 'seo-head' && arg === null) return seoHead;
    if (name === 'root-redirect' && arg === null) return urlPath === '/' ? readPartial('root-redirect.html') : '';
    if (name === 'lang-url' && arg) {
      const target = page.versions[arg] || homePage().versions[arg];
      if (!target) return undefined;
      const link = relativeUrl(urlPath, target) || './';
      // "/" redirects by saved choice or browser language: the explicit ?lang keeps the visitor's pick
      // even when localStorage is blocked or the click happens before i18n.js has loaded.
      return target === '/' ? `${link}?lang=${arg}` : link;
    }
    // {{page-url:<page id>}} / {{page-lang:<page id>}}: link to another page in this language, or in
    // the default language when that page has no version in it (FR/IT link to the English port pages).
    if ((name === 'page-url' || name === 'page-lang') && arg) {
      const target = pageById(arg);
      if (!target) return undefined;
      const targetLang = target.versions[lang] ? lang : config.DEFAULT_LANG;
      return name === 'page-lang' ? targetLang : relativeUrl(urlPath, target.versions[targetLang]) || './';
    }
    return undefined;
  };
}

/**
 * Adds the GENERATED banner right after the doctype.
 * @param {string} html - Page markup.
 * @param {string} template - Template path.
 * @param {string} lang - Language code.
 * @returns {string} Markup with the banner on line 2.
 */
function addBanner(html, template, lang) {
  const banner = `<!-- GENERATED by tools/build.mjs from ${template} (${lang}). Do not edit: change src/ or the dictionaries and run "node tools/build.mjs". -->`;
  return html.replace(/^<!doctype html>\r?\n/i, (doctype) => `${doctype}${banner}\n`);
}

/**
 * Final checks on a rendered page.
 * @param {string} html - Page markup.
 * @param {string} where - Page label.
 * @param {string[]} errors - Collects build errors.
 * @param {string[]} warnings - Collects warnings.
 * @returns {void}
 */
function validatePage(html, where, errors, warnings) {
  if (!/^<!doctype html>\r?\n<!-- GENERATED/i.test(html)) errors.push(`${where}: missing doctype or GENERATED banner`);
  const leftover = html.match(/\{\{[^}]*\}\}/);
  if (leftover) errors.push(`${where}: unresolved marker ${leftover[0]}`);
  const headings = (html.match(/<h1[\s>]/g) || []).length;
  if (headings !== 1) errors.push(`${where}: ${headings} <h1> elements (expected 1)`);
  const { title, description } = pageMeta(html);
  if (title.length > TITLE_MAX) warnings.push(`${where}: <title> has ${title.length} characters (search shows ~${TITLE_MAX})`);
  if (description.length > DESCRIPTION_MAX) {
    warnings.push(`${where}: description has ${description.length} characters (search shows ~${DESCRIPTION_MAX})`);
  }
}

/**
 * Renders one language version of a page.
 * @param {object} input - { page, lang, urlPath, template, data, tables, site, readPartial, dictionaries, errors, warnings, where }
 * @returns {string} Final page markup.
 */
function renderVersion({ page, lang, urlPath, template, data, tables, site, readPartial, dictionaries, errors, warnings, where }) {
  if (lang !== 'es' && !dictionaries[lang]) errors.push(`${where}: no dictionary for "${lang}"`);
  const translated = translateHtml(template, lang === 'es' ? null : dictionaries[lang] || {});
  if (translated.missing.length) errors.push(`${where}: missing translations: ${translated.missing.join(', ')}`);
  if (translated.unprocessed.length) {
    errors.push(`${where}: data-i18n elements must hold plain text: ${translated.unprocessed.join(', ')}`);
  }
  let html = translated.html.replace(/<html lang="[a-z-]+"/i, `<html lang="${lang}"`);

  const { title, description } = pageMeta(html);
  const graph = buildGraph({
    origin: site.origin,
    site,
    lang,
    url: absoluteUrl(site.origin, urlPath),
    pageType: pageTypeOf(page),
    title,
    description,
    audience: config.AUDIENCE[lang] || config.AUDIENCE[config.DEFAULT_LANG],
    tours: toursOf(data, lang, tables, errors, where),
    faq: faqOf(template, data, errors, where),
    port: portOf(page, lang, data, errors, where),
    tourPage: tourPageOf(page, lang, data, errors, where)
  });
  const seoHead = `${seoHeadTags({ origin: site.origin, page, lang, locales: config.LOCALES, defaultLang: config.DEFAULT_LANG })}\n  ${jsonLdScript(graph)}`;

  const hasBooking = /\sid="booking"/.test(template);
  const filled = fillPlaceholders(html, markerResolver({ page, lang, urlPath, seoHead, readPartial, hasBooking }));
  if (filled.unknown.length) errors.push(`${where}: unknown markers: ${filled.unknown.join(', ')}`);
  html = prefixAssetPaths(selectLangScripts(stripTemplateOnly(filled.html), lang), rootPrefix(urlPath));

  const priced = fillPriceFrom(html, tables);
  if (priced.unknown.length) errors.push(`${where}: "from" labels without a price table: ${priced.unknown.join(', ')}`);
  html = addBanner(priced.html, page.template, lang);
  validatePage(html, where, errors, warnings);
  return html;
}

/**
 * Price lines of a tour for llms.txt ("1 to 5 people: US$100 with zipline, US$75 no zipline").
 * @param {string|null} scope - Price table id or data-tour group.
 * @param {Array<object>} tables - Parsed price tables.
 * @param {Record<string, string>} dict - English dictionary (column labels).
 * @param {Record<string, string>} boatNames - Boat id → English name.
 * @returns {string[]} One line per group size, or per boat for charters.
 */
function priceLines(scope, tables, dict, boatNames) {
  if (!scope) return [];
  return tables.filter((table) => table.id === scope || table.tour === scope).flatMap((table) => {
    if (table.pricing === 'charter') {
      const flat = table.rows.find((row) => row.charge === 'flat');
      const extra = table.rows.find((row) => row.charge === 'extra');
      if (!flat || flat.cells[0] === null) return [];
      const name = boatNames[table.id.replace(/^boat-/, '')] || table.id;
      let line = `${name}: ${formatUsd(flat.cells[0])} for the whole boat (up to ${flat.max} people)`;
      if (extra && extra.cells[0] !== null) line += `, +${formatUsd(extra.cells[0])} per extra person`;
      if (table.deposit) line += `; ${formatUsd(table.deposit)} deposit to book`;
      return [line];
    }
    const lines = table.rows.filter((row) => row.min !== null && row.max !== null).map((row) => {
      const prices = row.cells
        .map((cell, index) => (cell === null ? null : `${formatUsd(cell)} ${(dict[table.optionKeys[index]] || table.options[index]).toLowerCase()}`))
        .filter(Boolean);
      return `${row.min} to ${row.max} people: ${prices.join(', ')}`;
    });
    if (table.depositPercent) lines.push(`${table.depositPercent}% of the total to book`);
    return lines;
  });
}

/**
 * Boat names of the booking form's boat picker, as written on a rendered page.
 * @param {string} html - Rendered page (English).
 * @returns {Record<string, string>} Boat id → name.
 */
function boatNamesOf(html) {
  const select = (html.match(/<select\b[^>]*\bid="booking-boat"[^>]*>([\s\S]*?)<\/select>/) || [null, ''])[1];
  const names = {};
  for (const match of select.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)) {
    names[match[1]] = decodeEntities(match[2]).trim();
  }
  return names;
}

/**
 * llms.txt from the English pages.
 * @param {object} input - { site, dictEn, tables, mainTemplate, templates, rendered, errors }
 * @returns {string} Markdown document.
 */
function buildLlms({ site, dictEn, tables, mainTemplate, templates, rendered, errors }) {
  const where = 'llms.txt';
  const home = rendered.get(`home:${config.DEFAULT_LANG}`);
  const boatNames = boatNamesOf(home ? home.html : '');
  const tours = toursOf(dictEn, config.DEFAULT_LANG, tables, errors, where).map((tour) => {
    const definition = config.TOURS.find((item) => item.id === tour.id);
    return {
      name: tour.name,
      url: tour.url,
      description: tour.description,
      from: tour.offer ? formatUsd(tour.offer.low) : null,
      priceLines: priceLines(definition.scope, tables, dictEn, boatNames)
    };
  });
  const ports = config.PAGES.filter((page) => page.port && page.versions[config.DEFAULT_LANG]).map((page) => ({
    title: (rendered.get(`${page.id}:${config.DEFAULT_LANG}`) || { title: page.id }).title,
    url: absoluteUrl(site.origin, page.versions[config.DEFAULT_LANG])
  }));
  const languages = config.PAGES.flatMap((page) => Object.entries(page.versions)
    .filter(([lang]) => lang !== config.DEFAULT_LANG)
    .map(([lang, urlPath]) => ({
      title: `${config.LANGUAGE_NAMES[lang]}: ${(rendered.get(`${page.id}:${lang}`) || { title: page.id }).title}`,
      url: absoluteUrl(site.origin, urlPath)
    })));
  const faq = [];
  for (const page of config.PAGES.filter((item) => item.versions[config.DEFAULT_LANG])) {
    for (const entry of faqOf(templates.get(page.id) || mainTemplate, dictEn, errors, where)) {
      if (!faq.some((known) => known.q === entry.q)) faq.push(entry);
    }
  }
  const summary = dictEn['about.lead'] || dictEn['meta.description'] || '';
  return llmsTxt({ site, summary, tours, ports, languages, faq });
}

/**
 * Builds every page version, sitemap.xml and llms.txt.
 * @param {{root: string, outDir?: string}} options - root: repository root; outDir: where to write (default root).
 * @returns {Promise<{files: string[], warnings: string[], errors: string[]}>} Written files (relative to
 *   outDir, "/"-separated), warnings, and errors (when there are errors nothing is written).
 */
export async function build({ root, outDir = root }) {
  const errors = [];
  const warnings = [];
  const outputs = new Map();
  const readSource = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const readPartial = (name) => {
    try {
      return readSource(path.posix.join(PARTIALS_DIR, name)).replace(/\r?\n$/, '');
    } catch (error) {
      throw new Error(`partial "${name}" not found in ${PARTIALS_DIR}`);
    }
  };

  let dictionaries;
  let mainTemplate;
  try {
    dictionaries = loadDictionaries(config.DICTIONARY_FILES.map((file) => path.join(root, file)));
    mainTemplate = applyIncludes(readSource(MAIN_TEMPLATE), readPartial);
  } catch (error) {
    return { files: [], warnings, errors: [error.message] };
  }
  const tables = parsePriceTables(mainTemplate);
  const mainBase = extractBaseDictionary(mainTemplate).dict;
  const site = { ...config.SITE, priceRange: priceRange(tables) };
  const rendered = new Map();
  const templates = new Map();

  for (const page of config.PAGES) {
    let template;
    try {
      template = page.template === MAIN_TEMPLATE ? mainTemplate : applyIncludes(readSource(page.template), readPartial);
    } catch (error) {
      errors.push(`${page.template}: ${error.message}`);
      continue;
    }
    templates.set(page.id, template);
    const base = extractBaseDictionary(template);
    if (base.conflicts.length) {
      errors.push(`${page.template}: same key with different Spanish texts: ${base.conflicts.join(', ')}`);
    }
    for (const [lang, urlPath] of Object.entries(page.versions)) {
      const where = `${outputFile(urlPath)} (${lang})`;
      const data = lang === 'es' ? { ...mainBase, ...base.dict } : dictionaries[lang] || {};
      try {
        const html = renderVersion({
          page, lang, urlPath, template, data, tables, site, readPartial, dictionaries, errors, warnings, where
        });
        rendered.set(`${page.id}:${lang}`, { html, title: pageMeta(html).title });
        outputs.set(outputFile(urlPath), html);
      } catch (error) {
        errors.push(`${where}: ${error.message}`);
      }
    }
  }

  outputs.set('sitemap.xml', sitemapXml({ origin: site.origin, pages: config.PAGES, defaultLang: config.DEFAULT_LANG }));
  outputs.set('llms.txt', buildLlms({
    site, dictEn: dictionaries[config.DEFAULT_LANG] || {}, tables, mainTemplate, templates, rendered, errors
  }));

  if (errors.length) return { files: [], warnings, errors };
  for (const [file, contents] of outputs) {
    const target = path.join(outDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return { files: [...outputs.keys()], warnings, errors };
}

/**
 * Command-line entry: builds into the repository root, prints warnings and errors, and sets exit
 * code 1 when the build fails.
 * @returns {Promise<void>}
 */
async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { files, warnings, errors } = await build({ root });
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const error of errors) console.error(`error: ${error}`);
  if (errors.length) {
    console.error(`Build failed with ${errors.length} error(s); nothing was written.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Built ${files.length} files: ${files.join(', ')}`);
}

const invokedDirectly = Boolean(process.argv[1])
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) main();
