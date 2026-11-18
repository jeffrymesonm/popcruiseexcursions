/**
 * prices.mjs — Reads the tour prices from the price tables of src/index.html at build time.
 *
 * Same rules as assets/js/prices.js (which does the same in the browser):
 * - <table class="prices" data-prices="id"> is one tour (or one boat); th[data-option] names its
 *   price columns; each body row has data-min / data-max and one "US$…" cell per column;
 * - data-pricing="charter" tables (one per boat, grouped by data-tour) have a data-charge="flat"
 *   row (the whole boat) and a data-charge="extra" row (each extra person); extra rows are add-ons,
 *   never a "from" price;
 * - the scope "all" means every per-person tour (charters excluded).
 * The build uses it to write the "from US$…" labels into the static HTML, the JSON-LD offers,
 * the price range of the business and llms.txt.
 */

/**
 * @typedef {{min: number|null, max: number|null, charge: 'flat'|'extra'|null, cells: Array<number|null>}} PriceRow
 * @typedef {{id: string, tour: string|null, pricing: 'person'|'charter', deposit: number|null,
 *   options: string[], optionKeys: Array<string|null>, rows: PriceRow[]}} PriceTable
 */

/** <table … class="prices" …>…</table> — 1 = opening tag attributes, 2 = contents. */
const TABLE = /<table\b([^>]*\bclass="prices"[^>]*)>([\s\S]*?)<\/table>/g;

/** <tag … data-price-from="scope" …>text</tag> — 1 = tag, 2 = attributes, 3 = scope, 5 = closing tag. */
const PRICE_FROM = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*\sdata-price-from="([^"]+)"[^>]*)>([^<]*)(<\/\1\s*>)/g;

/**
 * Reads one attribute from a tag's attribute string.
 * @param {string} attrs - Attribute string of an opening tag.
 * @param {string} name - Attribute name.
 * @returns {string|null} The value, or null when absent.
 */
function attribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * Parses a whole-number attribute (data-min / data-max).
 * @param {string} attrs - Attribute string of a row.
 * @param {string} name - Attribute name.
 * @returns {number|null} The number, or null when absent or not a number.
 */
function wholeNumber(attrs, name) {
  const value = parseInt(attribute(attrs, name), 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses a price cell such as "US$100", "US$1,000" or "+US$25" (tags and symbols are ignored).
 * @param {string} cell - Inner HTML of a <td>.
 * @returns {number|null} The amount in USD, or null when the cell has no number.
 */
function parseCell(cell) {
  const amount = parseFloat(cell.replace(/<[^>]*>/g, '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Reads every price table of a page.
 * @param {string} html - Page or template markup.
 * @returns {PriceTable[]} The tables, in document order.
 */
export function parsePriceTables(html) {
  return [...html.matchAll(TABLE)].map(([, attrs, body]) => {
    const head = (body.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/) || [, ''])[1];
    const rowsHtml = (body.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/) || [, ''])[1];
    const optionCells = [...head.matchAll(/<th\b([^>]*\sdata-option="[^"]+"[^>]*)>/g)].map((match) => match[1]);
    const deposit = parseFloat(attribute(attrs, 'data-deposit'));
    return {
      id: attribute(attrs, 'data-prices'),
      tour: attribute(attrs, 'data-tour'),
      pricing: attribute(attrs, 'data-pricing') === 'charter' ? 'charter' : 'person',
      deposit: Number.isFinite(deposit) && deposit > 0 ? deposit : null,
      options: optionCells.map((cellAttrs) => attribute(cellAttrs, 'data-option')),
      optionKeys: optionCells.map((cellAttrs) => attribute(cellAttrs, 'data-i18n')),
      rows: [...rowsHtml.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].map(([, rowAttrs, rowHtml]) => ({
        min: wholeNumber(rowAttrs, 'data-min'),
        max: wholeNumber(rowAttrs, 'data-max'),
        charge: attribute(rowAttrs, 'data-charge'),
        cells: [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => parseCell(match[1]))
      }))
    };
  });
}

/**
 * Prices a scope can be booked at: every cell of its non-extra rows.
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id (data-prices), group (data-tour) or "all" (per-person tours only).
 * @returns {number[]} The amounts, in table order.
 */
function scopePrices(tables, scope) {
  const inScope = scope === 'all'
    ? tables.filter((table) => table.pricing !== 'charter')
    : tables.filter((table) => table.id === scope || table.tour === scope);
  return inScope.flatMap((table) => table.rows
    .filter((row) => row.charge !== 'extra')
    .flatMap((row) => row.cells.filter((cell) => cell !== null)));
}

/**
 * Lowest bookable price of a scope (the "from" price).
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id, data-tour group or "all".
 * @returns {number|null} USD, or null when the scope has no price.
 */
export function minPrice(tables, scope) {
  const prices = scopePrices(tables, scope);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Highest bookable price of a scope (the top of an AggregateOffer).
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id, data-tour group or "all".
 * @returns {number|null} USD, or null when the scope has no price.
 */
export function maxPrice(tables, scope) {
  const prices = scopePrices(tables, scope);
  return prices.length ? Math.max(...prices) : null;
}

/**
 * Number of bookable prices in a scope (AggregateOffer.offerCount).
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id, data-tour group or "all".
 * @returns {number} Count of priced cells in non-extra rows.
 */
export function priceCount(tables, scope) {
  return scopePrices(tables, scope).length;
}

/**
 * Formats a USD amount the way the tables do.
 * @param {number} amount - Amount in USD.
 * @returns {string} E.g. "US$1,250".
 */
export function formatUsd(amount) {
  return `US$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Writes the "from" price of every [data-price-from] element into the markup, so the static HTML
 * shows the right price without JavaScript.
 * @param {string} html - Page markup.
 * @param {PriceTable[]} tables - Parsed tables (from src/index.html).
 * @returns {{html: string, unknown: string[]}} Filled markup, and the scopes without a price (sorted, unique).
 */
export function fillPriceFrom(html, tables) {
  const unknown = new Set();
  const output = html.replace(PRICE_FROM, (match, tag, attrs, scope, text, closing) => {
    const amount = minPrice(tables, scope);
    if (amount === null) {
      unknown.add(scope);
      return match;
    }
    return `<${tag}${attrs}>${formatUsd(amount)}${closing}`;
  });
  return { html: output, unknown: [...unknown].sort() };
}
