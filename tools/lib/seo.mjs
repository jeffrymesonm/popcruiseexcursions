/**
 * seo.mjs — SEO outputs of the build: <head> tags with hreflang alternates, sitemap.xml, the JSON-LD
 * <script> tag and llms.txt (a Markdown summary of the business for AI assistants).
 *
 * Page definitions (PageDef) come from tools/site.config.mjs:
 *   { id, template, versions: { <lang>: '<url path>' }, port? }
 * Every version of a page lists all the others (and x-default → the default-language version), so the
 * hreflang annotations are always reciprocal.
 */
import { escapeAttr } from './translate.mjs';

/**
 * @typedef {{id: string, template: string, versions: Record<string, string>, port?: string}} PageDef
 */

/**
 * Absolute URL of a site path.
 * @param {string} origin - Site origin, e.g. "https://popcruiseexcursions.com".
 * @param {string} urlPath - Path that starts with "/", e.g. "/es/".
 * @returns {string} Absolute URL.
 */
export function absoluteUrl(origin, urlPath) {
  return origin.replace(/\/+$/, '') + urlPath;
}

/**
 * Path of the version used for x-default: the default language, or the first version listed.
 * @param {PageDef} page - Page definition.
 * @param {string} defaultLang - Default language code.
 * @returns {string} URL path.
 */
function defaultPath(page, defaultLang) {
  return page.versions[defaultLang] || Object.values(page.versions)[0];
}

/**
 * hreflang alternates of a page (every version plus x-default).
 * @param {string} origin - Site origin.
 * @param {PageDef} page - Page definition.
 * @param {string} defaultLang - Default language code.
 * @returns {Array<{hreflang: string, href: string}>} Alternates in version order, x-default last.
 */
function alternates(origin, page, defaultLang) {
  return Object.entries(page.versions)
    .map(([lang, urlPath]) => ({ hreflang: lang, href: absoluteUrl(origin, urlPath) }))
    .concat({ hreflang: 'x-default', href: absoluteUrl(origin, defaultPath(page, defaultLang)) });
}

/**
 * <head> tags for one language version of a page: canonical, hreflang alternates, og:url and
 * og:locale (+ og:locale:alternate for the other versions).
 * @param {{origin: string, page: PageDef, lang: string, locales: Record<string, string>, defaultLang: string}} input
 * @returns {string} Tags, one per line (indented for the template's <head>).
 */
export function seoHeadTags({ origin, page, lang, locales, defaultLang }) {
  const url = absoluteUrl(origin, page.versions[lang]);
  const lines = [`<link rel="canonical" href="${escapeAttr(url)}">`];
  for (const { hreflang, href } of alternates(origin, page, defaultLang)) {
    lines.push(`<link rel="alternate" hreflang="${hreflang}" href="${escapeAttr(href)}">`);
  }
  lines.push(`<meta property="og:url" content="${escapeAttr(url)}">`);
  lines.push(`<meta property="og:locale" content="${locales[lang]}">`);
  for (const other of Object.keys(page.versions)) {
    if (other !== lang) lines.push(`<meta property="og:locale:alternate" content="${locales[other]}">`);
  }
  return lines.join('\n  ');
}

/**
 * sitemap.xml with one <url> per page version, each listing all versions of its page and x-default.
 * No <lastmod>: the build cannot know when a page's content really changed.
 * @param {{origin: string, pages: PageDef[], defaultLang: string}} input
 * @returns {string} XML document.
 */
export function sitemapXml({ origin, pages, defaultLang }) {
  const urls = pages.flatMap((page) => {
    const links = alternates(origin, page, defaultLang)
      .map(({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeAttr(href)}"/>`)
      .join('\n');
    return Object.values(page.versions).map((urlPath) =>
      `  <url>\n    <loc>${escapeAttr(absoluteUrl(origin, urlPath))}</loc>\n${links}\n  </url>`);
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n');
}

/**
 * JSON-LD <script> tag. "<" is written as \u003c so no string inside can close the tag early.
 * @param {object} graph - JSON-LD object.
 * @returns {string} The script tag.
 */
export function jsonLdScript(graph) {
  return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`;
}

/**
 * Markdown list of links.
 * @param {Array<{title: string, url: string}>} links - Links to list.
 * @returns {string} One "- [title](url)" line per link.
 */
function linkList(links) {
  return links.map(({ title, url }) => `- [${title}](${url})`).join('\n');
}

/**
 * llms.txt: a plain-English summary of the business for AI assistants (llmstxt.org format).
 * @param {{
 *   site: {name: string, origin: string, phoneDisplay: string, whatsappUrl: string, email: string},
 *   summary: string,
 *   tours: Array<{name: string, url: string, description: string, from: string|null, priceLines: string[]}>,
 *   ports: Array<{title: string, url: string}>,
 *   languages: Array<{title: string, url: string}>,
 *   faq: Array<{q: string, a: string}>
 * }} input
 * @returns {string} Markdown document.
 */
export function llmsTxt({ site, summary, tours, ports, languages, faq }) {
  const tourBlocks = tours.map((tour) => {
    const price = tour.from ? ` From ${tour.from}.` : ' Price on request (depends on group size).';
    const details = tour.priceLines.map((line) => `  - ${line}`).join('\n');
    return `- [${tour.name}](${tour.url}): ${tour.description}${price}${details ? `\n${details}` : ''}`;
  });
  const questions = faq.map(({ q, a }) => `### ${q}\n\n${a}`);
  return [
    `# ${site.name}`,
    '',
    `> ${summary}`,
    '',
    `- Website: ${site.origin}/`,
    `- WhatsApp: ${site.phoneDisplay} (${site.whatsappUrl})`,
    `- Email: ${site.email}`,
    '- Location: Puerto Plata, Dominican Republic',
    '',
    '## Tours',
    '',
    'Prices in US dollars. Per-person prices depend on the size of the group.',
    '',
    ...tourBlocks,
    '',
    '## Cruise ports',
    '',
    linkList(ports),
    '',
    '## Booking and policies',
    '',
    ...questions.flatMap((block) => [block, '']),
    '## Other languages',
    '',
    linkList(languages),
    ''
  ].join('\n');
}
