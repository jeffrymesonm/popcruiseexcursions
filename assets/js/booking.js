/**
 * booking.js — Booking form that ends in a WhatsApp chat or an email.
 *
 * - The visitor picks a tour, zipline (only for tours whose table has a zipline column), the boat
 *   (only for the "catamaran or yacht" tour: each boat has its own table, data-prices="boat-<id>"),
 *   the vehicle (only for "Buggies & ATVs": a row of its data-pricing="vehicle" table), group size,
 *   date, name and optionally the ship. A live estimate shows the total and how it is made up
 *   (price per person × people, boat price + extra people for a boat, or vehicles × price per
 *   vehicle for buggies, with as many vehicles as the group needs),
 *   read from the price tables through SitePrices (prices.js). It also shows the deposit that
 *   books the tour (a boat's fixed amount, or a share of the total for the other tours), which
 *   the message repeats. For a boat, the visitor can add the round-trip transport port ↔ Sosúa
 *   (switch off by default; price from the transfer table, more than its largest group = "we quote it").
 * - Pay with PayPal: for the tours booked with a share of the total (not boats), two buttons under the
 *   estimate open the PayPal payment link of [data-paypal-link], one showing the deposit and one the
 *   full total; the visitor types that amount in PayPal. Hidden while the page has no link.
 * - Two buttons send the same booking: "Book on WhatsApp" (the submit button, also Enter) opens
 *   WhatsApp, and "Book by email" ([data-booking-email], which holds the address) opens the
 *   visitor's email app. Either way the fields are validated first (bilingual messages) and the
 *   booking is already written in the message language, ready to send. Nothing is sent to any
 *   server and nothing the visitor types is logged.
 * - "Book this tour" buttons ([data-book]) preselect their tour before jumping to the form;
 *   "Book this boat" buttons also carry data-book-boat and preselect the boat. Links from other
 *   pages (the port pages) do the same with ?tour=<id>&boat=<id> in the URL. Without ?tour=, a page
 *   can name its own tour with data-default-tour (the catamaran page: data-default-tour="catamaran").
 * - The photo next to the form follows the selection: the chosen boat or vehicle, else the tour
 *   ([data-booking-photo] = "tour:boat", "tour:vehicle" or "tour"; "default" when none matches).
 * Dates: the earliest allowed date is "today" in Puerto Plata (America/Santo_Domingo), because
 * the tour happens there, whatever the visitor's own time zone is.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-booking-form]');
  if (!form) return;

  /**
   * Fallback for a page where prices.js or whatsapp.js did not load (e.g. a failed download on a ship's
   * Wi-Fi): the form can neither price nor write the booking, and the browser must still never submit it
   * (that would reload the page with the name and ship in the URL). The WhatsApp button opens the plain
   * chat (number of the page's wa.me links, no text) and the email button an empty email to the business.
   * @param {HTMLFormElement} bookingForm - The booking form.
   * @returns {void}
   */
  function useDirectChannels(bookingForm) {
    bookingForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var chatLink = document.querySelector('a[href^="https://wa.me/"]');
      if (chatLink) window.open(chatLink.href.split('?')[0], '_blank', 'noopener');
    });
    var mailButton = bookingForm.querySelector('[data-booking-email]');
    if (mailButton) {
      mailButton.addEventListener('click', function () {
        window.location.href = 'mailto:' + mailButton.getAttribute('data-booking-email');
      });
    }
  }

  if (!window.SitePrices || !window.SiteWhatsApp) {
    useDirectChannels(form);
    return;
  }

  var MIN_PEOPLE = 1;
  var MAX_PEOPLE = 50;
  var TOUR_TIME_ZONE = 'America/Santo_Domingo';
  /** Tour whose price depends on the boat chosen in the "boat" field. */
  var BOAT_TOUR = 'catamaran';
  /** Tour priced per vehicle: its options are the vehicles of the "vehicle" field. */
  var VEHICLE_TOUR = 'buggy';

  var tourSelect = form.elements.tour;
  var boatSelect = form.elements.boat;
  var boatField = form.querySelector('[data-boat-field]');
  var vehicleSelect = form.elements.vehicle;
  var vehicleField = form.querySelector('[data-vehicle-field]');
  var ziplineInput = form.elements.zipline;
  var ziplineField = form.querySelector('[data-zipline-field]');
  var transferInput = form.elements.transfer;
  var transferField = form.querySelector('[data-transfer-field]');
  var peopleInput = form.elements.people;
  var dateInput = form.elements.date;
  var estimateValue = form.querySelector('[data-estimate-value]');
  var estimateDetail = form.querySelector('[data-estimate-detail]');
  var estimateDeposit = form.querySelector('[data-estimate-deposit]');
  var statusElement = form.querySelector('[data-form-status]');
  var emailButton = form.querySelector('[data-booking-email]');
  var payBlock = form.querySelector('[data-paypal-link]');
  var payDeposit = form.querySelector('[data-paypal-pay="deposit"]');
  var payTotal = form.querySelector('[data-paypal-pay="total"]');
  // Only an https:// address counts as the PayPal link, so an empty or mistyped value keeps the buttons hidden.
  var payLink = payBlock && payDeposit && payTotal ? payBlock.getAttribute('data-paypal-link').trim() : '';
  if (!/^https:\/\/\S+$/.test(payLink)) payLink = '';
  var photos = Array.prototype.slice.call(document.querySelectorAll('[data-booking-photo]'));
  var hasTriedSubmit = false;

  /** Key of the status message on screen, or null (cleared as soon as the visitor edits the form). */
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
   * Fills the {placeholders} of an already translated text.
   * @param {string} text - Translated template, e.g. t("booking.estimate.large") ("… {max} …").
   * @param {Object<string, string|number>} values - Placeholder values by name.
   * @returns {string} Text with every known placeholder replaced (unknown ones are left as is).
   */
  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
    });
  }

  /**
   * Current page language.
   * @returns {string} "es", "en", "fr" or "it".
   */
  function language() {
    return window.SiteI18n ? window.SiteI18n.getLanguage() : document.documentElement.lang || 'es';
  }

  /**
   * Language of the WhatsApp message: the team reads Spanish and English, so French and
   * Italian pages write their booking in English (SiteI18n.messageLanguage).
   * @returns {string} "es" or "en".
   */
  function messageLanguage() {
    return window.SiteI18n ? window.SiteI18n.messageLanguage() : language();
  }

  /**
   * Translates a key into the message language.
   * @param {string} key - Translation key.
   * @returns {string} Text for the WhatsApp message.
   */
  function tm(key) {
    return window.SiteI18n ? window.SiteI18n.t(key, messageLanguage()) : key;
  }

  /**
   * Visible text of a translatable element (a select option), in the message language.
   * When the page is already in that language the element's own text is used, since Spanish
   * static copy lives only in the markup.
   * @param {HTMLElement} element - Element with optional data-i18n.
   * @returns {string} Text for the WhatsApp message.
   */
  function messageText(element) {
    var key = element.getAttribute('data-i18n');
    if (!key || messageLanguage() === language()) return element.textContent.trim();
    return tm(key);
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
    return new Intl.DateTimeFormat(messageLanguage() === 'en' ? 'en-US' : 'es-DO', {
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
   * Price table that applies to the current selection: the chosen boat's table for the boat
   * tour, otherwise the tour's own table.
   * @returns {string} Table id (data-prices), e.g. "horse" or "boat-libreterre".
   */
  function priceTableId() {
    return tourSelect.value === BOAT_TOUR ? 'boat-' + boatSelect.value : tourSelect.value;
  }

  /**
   * Price option for the selected tour: the chosen vehicle for buggies; otherwise "zipline" when
   * available and switched on, else "basic".
   * @returns {string} Option name (column) or vehicle id (row of a vehicle table).
   */
  function currentOption() {
    if (tourSelect.value === VEHICLE_TOUR) return vehicleSelect.value;
    var tourOptions = window.SitePrices.options(priceTableId());
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
   * Shows a status line under the button. The line is never hidden, only emptied (styles.css collapses
   * it), so screen readers already know the live region and announce each new text.
   * @param {string|null} key - Translation key, or null to clear.
   * @param {'success'|'error'} [tone] - Visual tone.
   * @returns {void}
   */
  function renderStatus(key, tone) {
    statusKey = key;
    statusElement.classList.remove('form__status--success', 'form__status--error');
    if (!key) {
      statusElement.textContent = '';
      return;
    }
    statusElement.classList.add('form__status--' + (tone || 'success'));
    statusElement.textContent = t(key);
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
    // Above the form's limit no price is shown (vehicle and boat tables have no upper row, so they
    // would price any group, while sending says "1 to 50"): the group is quoted on request instead.
    if (count > MAX_PEOPLE) return { state: 'large', max: MAX_PEOPLE };
    var tableId = priceTableId();
    if (!window.SitePrices.options(tableId).length) return { state: 'quote' };
    var price = window.SitePrices.quote(tableId, count, currentOption());
    if (!price) return { state: 'large', max: window.SitePrices.maxPeople(tableId) };
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
   * @returns {string} e.g. "US$65 por persona × 8 personas", "3 × Buggy · US$100 por vehículo
   *   (5 personas)", "Barco privado completo, hasta 15 personas" or "US$1,000 por el barco + 2 ×
   *   US$25 por persona adicional".
   */
  function priceDetail(price, count) {
    var format = window.SitePrices.format;
    if (price.perPerson !== null) {
      return format(price.perPerson) + ' ' + t('price.perPerson') + ' × ' + peopleLabel(count);
    }
    if (price.vehicles) {
      return fill(t('booking.estimate.vehicle'), {
        count: price.vehicles,
        vehicle: vehicleSelect.options[vehicleSelect.selectedIndex].textContent.trim(),
        price: format(price.perVehicle),
        people: peopleLabel(count)
      });
    }
    if (price.extraCount > 0) {
      return fill(t('booking.estimate.charterExtra'), {
        base: format(price.base), count: price.extraCount, extra: format(price.extraPrice)
      });
    }
    return fill(t('booking.estimate.charter'), { max: price.included });
  }

  /**
   * Round-trip transport the visitor added to a boat booking.
   * @param {number} count - Group size.
   * @returns {{state: string, amount?: number, max?: number|null}} state: "none" (not a boat, or the
   *   switch is off), "priced" (amount in USD for the group) or "quote" (group above the transfer
   *   table; max = the largest group it covers).
   */
  function currentTransfer(count) {
    if (transferField.hidden || !transferInput.checked) return { state: 'none' };
    var amount = window.SitePrices.transfer(count);
    if (amount === null) return { state: 'quote', max: window.SitePrices.transferMax() };
    return { state: 'priced', amount: amount };
  }

  /**
   * Boat total plus the transport when it has a price.
   * @param {Object} result - currentQuote() result with state "priced".
   * @returns {number} USD.
   */
  function totalWithTransfer(result) {
    var transfer = currentTransfer(result.count);
    return result.price.total + (transfer.state === 'priced' ? transfer.amount : 0);
  }

  /**
   * Transport part of the estimate detail, for boats only.
   * @param {number} count - Group size.
   * @returns {string} '' for other tours, else " · sin transporte", " · + US$160 transporte ida y
   *   vuelta" or " · transporte para más de 45 personas: te lo cotizamos".
   */
  function transferDetail(count) {
    if (transferField.hidden) return '';
    var transfer = currentTransfer(count);
    if (transfer.state === 'priced') {
      return ' · ' + fill(t('booking.estimate.withTransfer'), { amount: window.SitePrices.format(transfer.amount) });
    }
    if (transfer.state === 'quote') return ' · ' + fill(t('booking.estimate.transferLarge'), { max: transfer.max });
    return ' · ' + t('booking.estimate.noTransfer');
  }

  /**
   * Shows the photo of what is being booked and hides the others: the chosen boat ("catamaran:<boat>")
   * or vehicle ("buggy:<vehicle>") when the tour has one, else the tour itself, else "default".
   * @returns {void}
   */
  function renderPhoto() {
    var tour = tourSelect.value;
    var wanted = [tour, 'default'];
    if (tour === BOAT_TOUR) wanted.unshift(tour + ':' + boatSelect.value);
    if (tour === VEHICLE_TOUR) wanted.unshift(tour + ':' + vehicleSelect.value);
    var shown = null;
    for (var i = 0; i < wanted.length && !shown; i++) {
      for (var j = 0; j < photos.length && !shown; j++) {
        if (photos[j].getAttribute('data-booking-photo') === wanted[i]) shown = photos[j];
      }
    }
    photos.forEach(function (photo) {
      photo.hidden = photo !== shown;
    });
  }

  /**
   * Refreshes the boat and vehicle fields, the zipline and transport switches, the photo and the
   * live estimate.
   * @returns {void}
   */
  function renderEstimate() {
    renderPhoto();
    boatField.hidden = tourSelect.value !== BOAT_TOUR;
    vehicleField.hidden = tourSelect.value !== VEHICLE_TOUR;
    // Only for a boat, and only when the page has the transport price table.
    transferField.hidden = tourSelect.value !== BOAT_TOUR || window.SitePrices.transferMax() === null;
    ziplineField.hidden = window.SitePrices.options(priceTableId()).indexOf('zipline') === -1;

    var result = currentQuote();
    if (result.state === 'priced') {
      estimateValue.textContent = window.SitePrices.format(totalWithTransfer(result));
      estimateDetail.textContent = priceDetail(result.price, result.count) + transferDetail(result.count);
    } else if (result.state === 'quote') {
      estimateValue.textContent = t('booking.estimate.quote');
      estimateDetail.textContent = t('booking.estimate.quoteDetail');
    } else if (result.state === 'large') {
      estimateValue.textContent = t('booking.estimate.quote');
      estimateDetail.textContent = fill(t('booking.estimate.large'), { max: result.max || MAX_PEOPLE });
    } else {
      estimateValue.textContent = '—';
      estimateDetail.textContent = '';
    }

    // Deposit line: a group size the form accepts and a deposit (a boat's fixed one, or a share of a known total).
    var bookable = result.state !== 'invalid' && people() <= MAX_PEOPLE;
    var depositAmount = bookable ? window.SitePrices.deposit(priceTableId(), quotedTotal(result)) : null;
    var percent = window.SitePrices.depositPercent(priceTableId());
    estimateDeposit.hidden = depositAmount === null;
    estimateDeposit.textContent = depositAmount === null
      ? ''
      : fill(t(percent === null ? 'booking.estimate.deposit' : 'booking.estimate.depositPercent'), {
        deposit: window.SitePrices.format(depositAmount), percent: percent
      });
    // Online payment only for a share-of-the-total deposit: boats (fixed deposit) are confirmed first.
    renderPayPal(percent === null ? null : depositAmount, quotedTotal(result));
  }

  /**
   * Shows the PayPal buttons with the amounts to pay, or hides them when there is nothing to pay
   * online or the page has no PayPal link.
   * @param {number|null} deposit - Deposit in USD, or null when it cannot be paid online.
   * @param {number|null} total - Group total in USD, or null when the group has no price.
   * @returns {void}
   */
  function renderPayPal(deposit, total) {
    if (!payLink) return;
    var payable = deposit !== null && total !== null;
    payBlock.hidden = !payable;
    if (!payable) return;
    var format = window.SitePrices.format;
    payDeposit.querySelector('span').textContent = fill(t('booking.pay.deposit'), { amount: format(deposit) });
    payTotal.querySelector('span').textContent = fill(t('booking.pay.total'), { amount: format(total) });
  }

  /**
   * Group total of a quote, which a percent deposit is taken from.
   * @param {Object} result - currentQuote() result.
   * @returns {number|null} USD, or null when the quote has no price.
   */
  function quotedTotal(result) {
    return result.state === 'priced' ? result.price.total : null;
  }

  /**
   * Names what is being booked, in the message language: the tour plus the boat or vehicle and
   * the zipline choice when the form shows those fields.
   * @returns {string} e.g. "Buggies y ATV — Buggy" or "Charcos de Damajagua (con zipline)".
   */
  function messageTourName() {
    var tourName = messageText(tourSelect.options[tourSelect.selectedIndex]);
    if (!boatField.hidden) {
      tourName += ' — ' + messageText(boatSelect.options[boatSelect.selectedIndex]);
    }
    if (!vehicleField.hidden) {
      tourName += ' — ' + messageText(vehicleSelect.options[vehicleSelect.selectedIndex]);
    }
    if (!ziplineField.hidden) {
      tourName += ' (' + tm(ziplineInput.checked ? 'booking.msg.withZipline' : 'booking.msg.withoutZipline') + ')';
    }
    return tourName;
  }

  /**
   * Writes the booking as a message (WhatsApp text or email body) in the message language (Spanish
   * or English). When the page is in another language (French, Italian) the message is in English
   * and ends with the visitor's language, so the team knows who they are talking to.
   * @returns {string} Message text.
   */
  function buildMessage() {
    var tourName = messageTourName();
    var result = currentQuote();
    var format = window.SitePrices.format;
    var priceLine = tm('booking.msg.toConfirm');
    if (result.state === 'priced' && result.price.perPerson !== null) {
      priceLine = format(result.price.perPerson) + ' ' + tm('price.perPerson') + ', ' + tm('booking.msg.total') + ' ' + format(result.price.total);
    } else if (result.state === 'priced' && result.price.vehicles) {
      priceLine = fill(tm('booking.msg.perVehicle'), { price: format(result.price.perVehicle), total: format(result.price.total) });
    } else if (result.state === 'priced') {
      priceLine = fill(tm('booking.msg.charter'), { total: format(totalWithTransfer(result)) });
    }
    var ship = form.elements.ship.value.trim();
    var peopleLine = '• ' + tm('booking.msg.people') + ': ' + people();

    var lines = [
      tm('booking.msg.greeting'),
      '',
      '• ' + tm('booking.msg.tour') + ': ' + tourName,
      '• ' + tm('booking.msg.date') + ': ' + formatDate(dateInput.value),
      peopleLine,
      '• ' + tm('booking.msg.price') + ': ' + priceLine,
      '• ' + tm('booking.msg.name') + ': ' + form.elements.name.value.trim()
    ];
    if (result.state === 'priced' && result.price.vehicles) {
      // Right after "People": how many vehicles that group books.
      lines.splice(lines.indexOf(peopleLine) + 1, 0,
        '• ' + tm('booking.msg.vehicles') + ': ' + result.price.vehicles);
    }
    if (!transferField.hidden) {
      var transfer = currentTransfer(people());
      var transferText = tm('booking.msg.transferNo');
      if (transfer.state === 'priced') transferText = fill(tm('booking.msg.transferYes'), { amount: format(transfer.amount) });
      if (transfer.state === 'quote') transferText = fill(tm('booking.msg.transferQuote'), { max: transfer.max });
      lines.splice(lines.length - 1, 0, '• ' + tm('booking.msg.transfer') + ': ' + transferText);
    }
    var depositAmount = window.SitePrices.deposit(priceTableId(), quotedTotal(result));
    var percent = window.SitePrices.depositPercent(priceTableId());
    if (depositAmount !== null) {
      var depositText = format(depositAmount) + (percent === null ? '' : ' (' + percent + '%)');
      lines.splice(lines.length - 1, 0, '• ' + tm('booking.msg.deposit') + ': ' + depositText);
    }
    if (ship) lines.push('• ' + tm('booking.msg.ship') + ': ' + ship);
    if (messageLanguage() !== language()) {
      lines.push('• ' + tm('booking.msg.clientLanguage') + ': ' + tm('lang.' + language()));
    }
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

  /**
   * Opens the visitor's email app with the booking written as a new email to the business.
   * Line breaks go as CRLF, as mailto: links expect (RFC 6068).
   * @param {string} address - Business email address (from data-booking-email).
   * @param {string} message - Booking text from buildMessage().
   * @returns {void}
   */
  function openEmail(address, message) {
    var subject = fill(tm('booking.msg.subject'), { tour: messageTourName(), date: formatDate(dateInput.value) });
    window.location.href = 'mailto:' + address +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(message.replace(/\n/g, '\r\n'));
  }

  /**
   * Validates the form and, when it is valid, opens the chosen channel with the booking written.
   * @param {'whatsapp'|'email'} channel - Where the visitor wants to send the booking.
   * @returns {void}
   */
  function sendBooking(channel) {
    hasTriedSubmit = true;
    renderStatus(null);
    var firstInvalid = validateAll();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    if (channel === 'email') {
      openEmail(emailButton.getAttribute('data-booking-email'), buildMessage());
      renderStatus('booking.sentEmail', 'success');
      return;
    }
    window.SiteWhatsApp.open(buildMessage());
    renderStatus('booking.sent', 'success');
  }

  // Submit (the WhatsApp button, or Enter in a field) → WhatsApp; the email button → email.
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    sendBooking('whatsapp');
  });
  if (emailButton) {
    emailButton.addEventListener('click', function () {
      sendBooking('email');
    });
  }

  /**
   * Checks whether a select offers a value (compared as text, so URL input never reaches a selector).
   * @param {HTMLSelectElement} select - Field to look in.
   * @param {string|null} value - Option value.
   * @returns {boolean} True when an option has exactly that value.
   */
  function hasOption(select, value) {
    return Boolean(value) && Array.prototype.some.call(select.options, function (option) {
      return option.value === value;
    });
  }

  /**
   * Preselects a tour (and, for the catamaran or yacht, a boat) and refreshes the estimate.
   * Ids the form does not offer are ignored.
   * @param {string|null} tourId - Tour option value, e.g. "damajagua".
   * @param {string|null} boatId - Boat option value, e.g. "libreterre".
   * @returns {boolean} True when the form offers that tour (and it is now selected).
   */
  function preselect(tourId, boatId) {
    if (!hasOption(tourSelect, tourId)) return false;
    tourSelect.value = tourId;
    if (hasOption(boatSelect, boatId)) boatSelect.value = boatId;
    renderEstimate();
    return true;
  }

  /**
   * Preselects the tour named in the URL (?tour=<id>&boat=<id>), as the port pages link here; when
   * the URL names none, the page's own tour (data-default-tour, e.g. on the catamaran page).
   * @returns {void}
   */
  function preselectFromUrl() {
    var holder = document.querySelector('[data-default-tour]');
    var tourId = null;
    var boatId = null;
    try {
      var params = new URLSearchParams(window.location.search);
      tourId = params.get('tour');
      boatId = params.get('boat');
    } catch (error) {
      // Very old browsers without URLSearchParams: only the page default applies.
    }
    // A missing or unknown ?tour= falls back to the page's own tour (if it has one).
    if (!preselect(tourId, boatId) && holder) preselect(holder.getAttribute('data-default-tour'), boatId);
  }

  // The Boat field follows the boat the visitor is looking at in the picker (boat-tabs.js fires
  // "boat-select"), until the visitor picks a boat in the field themselves.
  var boatChosenInForm = false;
  boatSelect.addEventListener('change', function () {
    boatChosenInForm = true;
  });
  document.addEventListener('boat-select', function (event) {
    var boatId = event.detail && event.detail.id;
    if (boatChosenInForm || !hasOption(boatSelect, boatId)) return;
    boatSelect.value = boatId;
    renderEstimate();
  });

  // "Book this tour" / "Book this boat" buttons preselect their tour (and boat); the link itself
  // then scrolls to the form.
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-book]');
    if (button) preselect(button.getAttribute('data-book'), button.getAttribute('data-book-boat'));
  });

  dateInput.min = todayInPuertoPlata();
  if (payLink) payDeposit.href = payTotal.href = payLink;
  preselectFromUrl();
  renderEstimate();
})();
