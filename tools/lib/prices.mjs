/**
 * prices.mjs — Reads the tour prices from the price tables of src/index.html (after its includes: the
 * boat and transport tables are in src/partials/boats.html) at build time.
 *
 * Same rules as assets/js/prices.js (which does the same in the browser):
 * - <table class="prices" data-prices="id"> is one tour (or one boat); th[data-option] names its
 *   price columns; each body row has data-min / data-max and one "US$…" cell per column;
 * - data-pricing="charter" tables (one per boat, grouped by data-tour) have a data-charge="flat"
 *   row (the whole boat) and a data-charge="extra" row (each extra person); extra rows are add-ons,
 *   never a "from" price;
 * - data-pricing="transfer" tables (the boats' optional round-trip transport, one price per group
 *   size) are add-ons too: they never count for "from" prices, price ranges or offers;
 * - data-pricing="vehicle" tables (Buggies & ATVs) are turned around: each body row is one vehicle
 *   (tr data-option = its id, data-seats = people per vehicle, its name in the first data-i18n of
 *   the row's <th>) and each priced column is a range of vehicles booked (th data-min / data-max in
 *   the header; no data-max = no limit). Their prices are per vehicle: they count for their own
 *   scope, never for "all";
 * - the scope "all" means every per-person tour (charters, transfers and vehicles excluded).
 * The build uses it to write the "from US$…" labels into the static HTML, the JSON-LD offers,
 * the price range of the business and llms.txt.
 */

/**
 * @typedef {{min: number|null, max: number|null, charge: 'flat'|'extra'|null, option: string|null,
 *   seats: number|null, nameKey: string|null, cells: Array<number|null>}} PriceRow
 *   option / seats are the row's data-option / data-seats (only vehicle rows carry them; null elsewhere).
 *   nameKey is read on every row: the first data-i18n key inside the row's first <th> (on the <th> itself
 *   or on a tag nested in it), null when it has none. On vehicle rows it names the vehicle; on other rows
 *   it is the row label ("price.g1" on per-person rows, "price.to" on "1 to 15" charter rows).
 * @typedef {{min: number|null, max: number|null}} PriceColumn - Range of vehicles a price column covers.
 * @typedef {{id: string, tour: string|null, pricing: 'person'|'charter'|'transfer'|'vehicle', deposit: number|null,
 *   depositPercent: number|null, options: string[], optionKeys: Array<string|null>, columns: PriceColumn[],
 *   rows: PriceRow[]}} PriceTable
 *   options / optionKeys are the price columns (th data-option) of every table except vehicle ones, where
 *   they are the rows (one per vehicle). columns is only filled for vehicle tables.
 */

/** data-pricing values other than the default per-person model. */
const PRICING_MODELS = ['charter', 'transfer', 'vehicle'];

/** Models of the boats card (booked through the boat field of the form, never copied to other pages). */
const BOAT_MODELS = ['charter', 'transfer'];

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
    const pricing = PRICING_MODELS.includes(attribute(attrs, 'data-pricing')) ? attribute(attrs, 'data-pricing') : 'person';
    const deposit = parseFloat(attribute(attrs, 'data-deposit'));
    const depositPercent = parseFloat(attribute(attrs, 'data-deposit-percent'));
    const rows = [...rowsHtml.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].map(([, rowAttrs, rowHtml]) => ({
      min: wholeNumber(rowAttrs, 'data-min'),
      max: wholeNumber(rowAttrs, 'data-max'),
      charge: attribute(rowAttrs, 'data-charge'),
      option: attribute(rowAttrs, 'data-option'),
      seats: wholeNumber(rowAttrs, 'data-seats'),
      nameKey: attribute((rowHtml.match(/<th\b[\s\S]*?<\/th>/) || [''])[0], 'data-i18n'),
      cells: [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => parseCell(match[1]))
    }));
    // Vehicle tables are turned around: their options are the rows and their header cells are vehicle counts.
    const isVehicle = pricing === 'vehicle';
    const optionCells = [...head.matchAll(/<th\b([^>]*\sdata-option="[^"]+"[^>]*)>/g)].map((match) => match[1]);
    const columnCells = [...head.matchAll(/<th\b([^>]*\sdata-min="[^"]+"[^>]*)>/g)].map((match) => match[1]);
    return {
      id: attribute(attrs, 'data-prices'),
      tour: attribute(attrs, 'data-tour'),
      pricing,
      deposit: Number.isFinite(deposit) && deposit > 0 ? deposit : null,
      depositPercent: Number.isFinite(depositPercent) && depositPercent > 0 ? depositPercent : null,
      options: isVehicle ? rows.map((row) => row.option) : optionCells.map((cellAttrs) => attribute(cellAttrs, 'data-option')),
      optionKeys: isVehicle ? rows.map((row) => row.nameKey) : optionCells.map((cellAttrs) => attribute(cellAttrs, 'data-i18n')),
      columns: isVehicle
        ? columnCells.map((cellAttrs) => ({ min: wholeNumber(cellAttrs, 'data-min'), max: wholeNumber(cellAttrs, 'data-max') }))
        : [],
      rows
    };
  });
}

/**
 * Markup of every per-person and vehicle price table of a page (neither charter nor transfer), exactly
 * as written. The build copies them, hidden, into pages that have the booking form but not the tour
 * cards (the catamaran page, which already has the boat tables), so the form can price every tour there too.
 * @param {string} html - Page or template markup.
 * @returns {string[]} One "<table …>…</table>" string per per-person or vehicle table, in document order.
 */
export function formTablesHtml(html) {
  return [...html.matchAll(TABLE)]
    .filter(([, attrs]) => !BOAT_MODELS.includes(attribute(attrs, 'data-pricing')))
    .map(([table]) => table);
}

/**
 * Tables a scope can be booked with (transfer tables are add-ons, never part of a scope).
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id (data-prices), group (data-tour) or "all" (per-person tours only).
 * @returns {PriceTable[]} The tables, in document order.
 */
function scopeTables(tables, scope) {
  return scope === 'all'
    ? tables.filter((table) => table.pricing === 'person')
    : tables.filter((table) => table.pricing !== 'transfer' && (table.id === scope || table.tour === scope));
}

/**
 * Prices a scope can be booked at: every cell of its non-extra rows.
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id (data-prices), group (data-tour) or "all" (per-person tours only).
 * @returns {number[]} The amounts, in table order.
 */
function scopePrices(tables, scope) {
  return scopeTables(tables, scope).flatMap((table) => table.rows
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
 * Pricing model of a scope (what one of its prices buys: a person, a whole boat, a vehicle).
 * @param {PriceTable[]} tables - Parsed tables.
 * @param {string} scope - Table id, data-tour group or "all".
 * @returns {'person'|'charter'|'vehicle'|null} The model its bookable tables share, or null when the
 *   scope has no table or mixes models.
 */
export function scopePricing(tables, scope) {
  const models = new Set(scopeTables(tables, scope).map((table) => table.pricing));
  return models.size === 1 ? [...models][0] : null;
}

/**
 * Formats a USD amount the way the tables do (same rule as format() in assets/js/prices.js).
 * @param {number} amount - Amount in USD.
 * @returns {string} E.g. "US$1,250", or "US$17.50" when there are cents.
 */
export function formatUsd(amount) {
  const decimals = amount % 1 === 0 ? 0 : 2;
  return `US$${amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
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
