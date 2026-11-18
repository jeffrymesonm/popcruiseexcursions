/**
 * prices.js — Reads the tour prices from the price tables in index.html.
 *
 * The tables (<table data-prices="tourId">) are the single source of prices:
 * - each <th data-option="…"> in the header names a price column ("zipline", "basic"…);
 * - each body row has data-min / data-max (group size, people) and one "US$…" cell per column.
 * Two pricing models:
 * - per person (default): the row covering the group size gives the price each person pays;
 * - charter (data-pricing="charter", one table per boat): the row with data-charge="flat" is the
 *   price of the whole boat for up to its data-max people, and the row with data-charge="extra" is
 *   what each person above that adds, with no upper limit unless the extra row has a data-max
 *   (no extra row: no extras).
 * Boat tables are named data-prices="boat-<id>" and grouped with data-tour="catamaran".
 * This script fills every [data-price-from="id"] (a table id, a data-tour group, or "all" for
 * per-person tours only) with the lowest price, and exposes window.SitePrices for booking.js.
 * Edit a price in its table and the "from" labels, the hero card and the booking estimate follow.
 */
(function () {
  'use strict';

  /**
   * Finds the price table of a tour.
   * @param {string} tourId - Value of data-prices, e.g. "damajagua".
   * @returns {HTMLTableElement|null} The table, or null for tours priced on request.
   */
  function table(tourId) {
    return document.querySelector('table[data-prices="' + tourId + '"]');
  }

  /**
   * Lists the price columns of a tour, in table order.
   * @param {string} tourId - Tour id.
   * @returns {Array<string>} Option names such as ["zipline", "basic"]; empty when on request.
   */
  function options(tourId) {
    var element = table(tourId);
    if (!element) return [];
    return Array.prototype.map.call(element.querySelectorAll('thead th[data-option]'), function (cell) {
      return cell.getAttribute('data-option');
    });
  }

  /**
   * Parses a price cell such as "US$100", "US$1,000" or "+US$25".
   * @param {HTMLTableCellElement|null} cell - Body cell.
   * @returns {number|null} The amount in USD, or null if the cell is missing or has no number.
   */
  function parseCell(cell) {
    if (!cell) return null;
    var amount = parseFloat((cell.textContent || '').replace(/[^0-9.]/g, ''));
    return isFinite(amount) ? amount : null;
  }

  /**
   * Reads a whole-number row attribute (data-min / data-max).
   * @param {HTMLTableRowElement} row - Body row.
   * @param {string} name - Attribute name.
   * @returns {number} The value, or NaN when missing.
   */
  function rowNumber(row, name) {
    return parseInt(row.getAttribute(name), 10);
  }

  /**
   * Price per person for a group, on a per-person table.
   * @param {HTMLTableElement} element - Price table.
   * @param {number} people - Group size.
   * @param {string} option - Column name (falls back to the first column if unknown).
   * @returns {number|null} USD per person, or null when no row covers that group size.
   */
  function perPersonPrice(element, people, option) {
    var column = Math.max(0, options(element.getAttribute('data-prices')).indexOf(option));
    var rows = element.querySelectorAll('tbody tr[data-min][data-max]');
    for (var i = 0; i < rows.length; i += 1) {
      if (people >= rowNumber(rows[i], 'data-min') && people <= rowNumber(rows[i], 'data-max')) {
        return parseCell(rows[i].querySelectorAll('td')[column]);
      }
    }
    return null;
  }

  /**
   * Total for a group on a charter table: the boat price, plus the extra-person price for
   * everyone above the people the boat price covers. An extra row without data-max has no limit.
   * @param {HTMLTableElement} element - Price table with data-pricing="charter".
   * @param {number} people - Group size.
   * @returns {{total: number, perPerson: null, base: number, included: number, extraCount: number, extraPrice: number}|null}
   *   The breakdown, or null when the group is larger than the table allows.
   */
  function charterQuote(element, people) {
    var flatRow = element.querySelector('tbody tr[data-charge="flat"]');
    if (!flatRow) return null;
    var base = parseCell(flatRow.querySelector('td'));
    var included = rowNumber(flatRow, 'data-max');
    if (base === null || isNaN(included)) return null;
    if (people <= included) {
      return { total: base, perPerson: null, base: base, included: included, extraCount: 0, extraPrice: 0 };
    }

    var extraRow = element.querySelector('tbody tr[data-charge="extra"]');
    if (!extraRow) return null;
    var extraMax = rowNumber(extraRow, 'data-max');
    if (!isNaN(extraMax) && people > extraMax) return null;
    var extraPrice = parseCell(extraRow.querySelector('td'));
    if (extraPrice === null) return null;
    var extraCount = people - included;
    return {
      total: base + extraCount * extraPrice,
      perPerson: null,
      base: base,
      included: included,
      extraCount: extraCount,
      extraPrice: extraPrice
    };
  }

  /**
   * Price of a tour for a group, whatever its pricing model.
   * @param {string} tourId - Tour id.
   * @param {number} people - Group size.
   * @param {string} option - Column name (per-person tables only).
   * @returns {{total: number, perPerson: number|null, base?: number, included?: number, extraCount?: number, extraPrice?: number}|null}
   *   perPerson is set for per-person tours; base/included/extra* for charters.
   *   null when the tour is priced on request or no row covers that group size.
   */
  function quote(tourId, people, option) {
    var element = table(tourId);
    if (!element) return null;
    if (element.getAttribute('data-pricing') === 'charter') return charterQuote(element, people);
    var perPerson = perPersonPrice(element, people, option);
    return perPerson === null ? null : { total: perPerson * people, perPerson: perPerson };
  }

  /**
   * Largest group a tour's table covers.
   * @param {string} tourId - Tour id.
   * @returns {number|null} People, or null when the tour has no table.
   */
  function maxPeople(tourId) {
    var element = table(tourId);
    if (!element) return null;
    var largest = null;
    element.querySelectorAll('tbody tr[data-max]').forEach(function (row) {
      var max = rowNumber(row, 'data-max');
      if (!isNaN(max) && (largest === null || max > largest)) largest = max;
    });
    return largest;
  }

  /**
   * Lowest price of one table, of a tour that groups several tables (the boats share
   * data-tour="catamaran"), or the lowest price per person of every per-person tour.
   * Extra-person rows are skipped: they are add-ons, not a price you can book on its own.
   * @param {string} tourId - Table id (data-prices), group id (data-tour), or "all".
   * @returns {number|null} USD, or null when nothing is priced.
   */
  function minPrice(tourId) {
    var scopes = tourId === 'all'
      ? ['table[data-prices]:not([data-pricing="charter"])']
      : ['table[data-prices="' + tourId + '"]', 'table[data-tour="' + tourId + '"]'];
    var cells = scopes.map(function (scope) {
      return scope + ' tbody tr:not([data-charge="extra"]) td';
    }).join(', ');
    var lowest = null;
    document.querySelectorAll(cells).forEach(function (cell) {
      var amount = parseCell(cell);
      if (amount !== null && (lowest === null || amount < lowest)) lowest = amount;
    });
    return lowest;
  }

  /**
   * Formats a USD amount the same way the tables do ("US$1,250").
   * @param {number} amount - Amount in USD.
   * @returns {string} Formatted amount.
   */
  function format(amount) {
    return 'US$' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  document.querySelectorAll('[data-price-from]').forEach(function (element) {
    var amount = minPrice(element.getAttribute('data-price-from'));
    if (amount !== null) element.textContent = format(amount);
  });

  window.SitePrices = { options: options, quote: quote, maxPeople: maxPeople, minPrice: minPrice, format: format };
})();
