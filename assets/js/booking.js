/**
 * booking.js — Booking form that ends in a WhatsApp chat.
 *
 * - The visitor picks a tour, zipline (only for tours whose table has a zipline column),
 *   group size, date, name and optionally the ship. A live estimate shows the total and how it
 *   is made up (price per person × people, or boat price + extra people for the catamaran),
 *   read from the price tables through SitePrices (prices.js).
 * - On submit the fields are validated (bilingual messages) and WhatsApp opens with the booking
 *   already written in the visitor's language, ready to send. Nothing is sent to any server and
 *   nothing the visitor types is logged.
 * - "Book this tour" buttons ([data-book]) preselect their tour before jumping to the form.
 * Dates: the earliest allowed date is "today" in Puerto Plata (America/Santo_Domingo), because
 * the tour happens there, whatever the visitor's own time zone is.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-booking-form]');
  if (!form || !window.SitePrices || !window.SiteWhatsApp) return;

  var MIN_PEOPLE = 1;
  var MAX_PEOPLE = 50;
  var TOUR_TIME_ZONE = 'America/Santo_Domingo';

  var tourSelect = form.elements.tour;
  var ziplineInput = form.elements.zipline;
  var ziplineField = form.querySelector('[data-zipline-field]');
  var peopleInput = form.elements.people;
  var dateInput = form.elements.date;
  var estimateValue = form.querySelector('[data-estimate-value]');
  var estimateDetail = form.querySelector('[data-estimate-detail]');
  var statusElement = form.querySelector('[data-form-status]');
  var hasTriedSubmit = false;

  /** Current error key per field name ('' when valid), re-translated on language change. */
  var errors = {};
  /** Key of the status message on screen, or null. */
  var statusKey = null;

  /**
   * Translates a key with SiteI18n, or returns the key when i18n is unavailable.
   * @param {string} key - Translation key.
   * @returns {string} Text in the current language.
   */
  function t(key) {
    return window.SiteI18n ? window.SiteI18n.t(key) : key;
  }

  /**
   * Translates a key and fills its {placeholders}.
   * @param {string} key - Translation key, e.g. "booking.estimate.large" ("… {max} …").
   * @param {Object<string, string|number>} values - Placeholder values by name.
   * @returns {string} Text with every known placeholder replaced (unknown ones are left as is).
   */
  function fill(key, values) {
    return t(key).replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
    });
  }

  /**
   * Current page language.
   * @returns {string} "es" or "en".
   */
  function language() {
    return window.SiteI18n ? window.SiteI18n.getLanguage() : document.documentElement.lang || 'es';
  }

  /**
   * Today's date in Puerto Plata as YYYY-MM-DD (the format of <input type="date">).
   * Falls back to the UTC date if the browser lacks time-zone support.
   * @returns {string} ISO calendar date.
   */
  function todayInPuertoPlata() {
    try {
      // en-CA formats dates as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TOUR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (error) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /**
   * Formats a YYYY-MM-DD date for the WhatsApp message, with the month spelled out so
   * day and month can never be swapped by the reader.
   * @param {string} value - ISO calendar date.
   * @returns {string} e.g. "3 de diciembre de 2026" / "December 3, 2026".
   */
  function formatDate(value) {
    var date = new Date(value + 'T00:00:00Z');
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(language() === 'en' ? 'en-US' : 'es-DO', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    }).format(date);
  }

  /**
   * Reads the group size as an integer.
   * @returns {number} People, or NaN when the field is not a whole number.
   */
  function people() {
    var raw = peopleInput.value.trim();
    return /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
  }

  /**
   * Price column for the selected tour: "zipline" when available and switched on, else "basic".
   * @returns {string} Option name.
   */
  function currentOption() {
    var tourOptions = window.SitePrices.options(tourSelect.value);
    if (tourOptions.indexOf('zipline') > -1 && ziplineInput.checked) return 'zipline';
    return tourOptions.indexOf('basic') > -1 ? 'basic' : (tourOptions[0] || 'basic');
  }

  /**
   * Validation rules: each returns an error key, or '' when the value is valid.
   */
  var rules = {
    people: function () {
      var count = people();
      return count >= MIN_PEOPLE && count <= MAX_PEOPLE ? '' : 'booking.error.people';
    },
    date: function () {
      var value = dateInput.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'booking.error.date';
      return value < todayInPuertoPlata() ? 'booking.error.datePast' : '';
    },
    name: function () {
      return form.elements.name.value.trim().length >= 2 ? '' : 'booking.error.name';
    }
  };

  /**
   * Shows or clears the error for one field.
   * @param {string} name - Field name.
   * @param {string} errorKey - Translation key of the error, or '' to clear.
   * @returns {void}
   */
  function renderFieldError(name, errorKey) {
    var input = form.elements[name];
    var message = form.querySelector('[data-error-for="' + name + '"]');
    errors[name] = errorKey;
    if (!input || !message) return;
    if (errorKey) {
      input.setAttribute('aria-invalid', 'true');
      message.textContent = t(errorKey);
      message.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      message.textContent = '';
      message.hidden = true;
    }
  }

  /**
   * Validates every field and renders the results.
   * @returns {HTMLElement|null} First invalid input, or null when the form is valid.
   */
  function validateAll() {
    var firstInvalid = null;
    Object.keys(rules).forEach(function (name) {
      var errorKey = rules[name]();
      renderFieldError(name, errorKey);
      if (errorKey && !firstInvalid) firstInvalid = form.elements[name];
    });
    return firstInvalid;
  }

  /**
   * Shows a status line under the button.
   * @param {string|null} key - Translation key, or null to hide.
   * @param {'success'|'error'} [tone] - Visual tone.
   * @returns {void}
   */
  function renderStatus(key, tone) {
    statusKey = key;
    statusElement.classList.remove('form__status--success', 'form__status--error');
    if (!key) {
      statusElement.hidden = true;
      statusElement.textContent = '';
      return;
    }
    statusElement.classList.add('form__status--' + (tone || 'success'));
    statusElement.textContent = t(key);
    statusElement.hidden = false;
  }

  /**
   * Works out the price for the current selection.
   * @returns {{state: string, price?: Object, count?: number, max?: number|null}}
   *   state: "priced" (price = SitePrices.quote() result), "quote" (tour priced on request),
   *   "large" (group above the table; max = largest group it covers)
   *   or "invalid" (group size not a valid number).
   */
  function currentQuote() {
    var count = people();
    if (!(count >= MIN_PEOPLE)) return { state: 'invalid' };
    if (!window.SitePrices.options(tourSelect.value).length) return { state: 'quote' };
    var price = window.SitePrices.quote(tourSelect.value, count, currentOption());
    if (!price) return { state: 'large', max: window.SitePrices.maxPeople(tourSelect.value) };
    return { state: 'priced', price: price, count: count };
  }

  /**
   * Text for "N people" in the current language.
   * @param {number} count - Group size.
   * @returns {string} e.g. "4 personas" / "1 person".
   */
  function peopleLabel(count) {
    return count + ' ' + t(count === 1 ? 'booking.person' : 'booking.persons');
  }

  /**
   * Explains how a total is made up, under the estimate.
   * @param {Object} price - SitePrices.quote() result.
   * @param {number} count - Group size.
   * @returns {string} e.g. "US$65 por persona × 8 personas", "Barco privado completo, hasta 15
   *   personas" or "US$1,000 por el barco + 2 × US$25 por persona adicional".
   */
  function priceDetail(price, count) {
    var format = window.SitePrices.format;
    if (price.perPerson !== null) {
      return format(price.perPerson) + ' ' + t('price.perPerson') + ' × ' + peopleLabel(count);
    }
    if (price.extraCount > 0) {
      return fill('booking.estimate.charterExtra', {
        base: format(price.base), count: price.extraCount, extra: format(price.extraPrice)
      });
    }
    return fill('booking.estimate.charter', { max: price.included });
  }

  /**
   * Refreshes the zipline switch and the live estimate.
   * @returns {void}
   */
  function renderEstimate() {
    ziplineField.hidden = window.SitePrices.options(tourSelect.value).indexOf('zipline') === -1;

    var result = currentQuote();
    if (result.state === 'priced') {
      estimateValue.textContent = window.SitePrices.format(result.price.total);
      estimateDetail.textContent = priceDetail(result.price, result.count);
    } else if (result.state === 'quote') {
      estimateValue.textContent = t('booking.estimate.quote');
      estimateDetail.textContent = t('booking.estimate.quoteDetail');
    } else if (result.state === 'large') {
      estimateValue.textContent = t('booking.estimate.quote');
      estimateDetail.textContent = fill('booking.estimate.large', { max: result.max || MAX_PEOPLE });
    } else {
      estimateValue.textContent = '—';
      estimateDetail.textContent = '';
    }
  }

  /**
   * Writes the booking as a WhatsApp message in the current language.
   * @returns {string} Message text.
   */
  function buildMessage() {
    var tourName = tourSelect.options[tourSelect.selectedIndex].textContent.trim();
    if (!ziplineField.hidden) {
      tourName += ' (' + t(ziplineInput.checked ? 'booking.msg.withZipline' : 'booking.msg.withoutZipline') + ')';
    }
    var result = currentQuote();
    var format = window.SitePrices.format;
    var priceLine = t('booking.msg.toConfirm');
    if (result.state === 'priced' && result.price.perPerson !== null) {
      priceLine = format(result.price.perPerson) + ' ' + t('price.perPerson') + ', ' + t('booking.msg.total') + ' ' + format(result.price.total);
    } else if (result.state === 'priced') {
      priceLine = fill('booking.msg.charter', { total: format(result.price.total) });
    }
    var ship = form.elements.ship.value.trim();

    var lines = [
      t('booking.msg.greeting'),
      '',
      '• ' + t('booking.msg.tour') + ': ' + tourName,
      '• ' + t('booking.msg.date') + ': ' + formatDate(dateInput.value),
      '• ' + t('booking.msg.people') + ': ' + people(),
      '• ' + t('booking.msg.price') + ': ' + priceLine,
      '• ' + t('booking.msg.name') + ': ' + form.elements.name.value.trim()
    ];
    if (ship) lines.push('• ' + t('booking.msg.ship') + ': ' + ship);
    return lines.join('\n');
  }

  /**
   * Sets the group size, kept within the allowed range.
   * @param {number} count - Desired group size.
   * @returns {void}
   */
  function setPeople(count) {
    peopleInput.value = String(Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, count)));
    if (hasTriedSubmit) renderFieldError('people', rules.people());
    renderEstimate();
  }

  // − / + buttons.
  form.addEventListener('click', function (event) {
    var button = event.target.closest('[data-step]');
    if (!button) return;
    var current = people();
    setPeople((isNaN(current) ? MIN_PEOPLE : current) + parseInt(button.getAttribute('data-step'), 10));
  });

  // Any change refreshes the estimate; after the first attempt, fields re-validate as typed.
  form.addEventListener('input', function (event) {
    var name = event.target.name;
    if (hasTriedSubmit && rules[name]) renderFieldError(name, rules[name]());
    if (statusKey) renderStatus(null);
    renderEstimate();
  });
  form.addEventListener('change', renderEstimate);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    hasTriedSubmit = true;
    renderStatus(null);
    var firstInvalid = validateAll();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    window.SiteWhatsApp.open(buildMessage());
    renderStatus('booking.sent', 'success');
  });

  // "Book this tour" buttons preselect their tour; the link itself then scrolls to the form.
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-book]');
    if (!button) return;
    var tourId = button.getAttribute('data-book');
    if (tourSelect.querySelector('option[value="' + tourId + '"]')) {
      tourSelect.value = tourId;
      renderEstimate();
    }
  });

  // Keep visible messages in the selected language.
  window.addEventListener('i18n:change', function () {
    Object.keys(errors).forEach(function (name) {
      if (errors[name]) renderFieldError(name, errors[name]);
    });
    if (statusKey) statusElement.textContent = t(statusKey);
    renderEstimate();
  });

  dateInput.min = todayInPuertoPlata();
  renderEstimate();
})();
