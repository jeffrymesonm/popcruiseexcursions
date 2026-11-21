/**
 * paypal-checkout.js — Pay a tour's deposit or full price with PayPal from the booking form, and email the
 * booking to the team once the payment is approved.
 *
 * Pure helpers, exposed as window.SitePayPal (tested in tools/test/paypal-checkout.test.mjs):
 * - bookingCode: the code that travels with the payment (PayPal invoice_id), e.g. "PCE-1203-7F3K";
 * - description: the payment description PayPal shows (127 characters at most);
 * - amountValue: the amount as PayPal wants it ("97.50");
 * - captureInfo: transaction, status and payer email read from a PayPal capture;
 * - paidLines / emailPayload: the payment lines and the Formspree body of the email to the team.
 *
 * Checkout (only on pages with the booking form and a configured [data-paypal] block, see booking.js):
 * - PayPal's JavaScript SDK v5 loads the first time the pay block shows, in the page language, and renders
 *   PayPal's own buttons (PayPal account or card) into [data-paypal-button].
 * - Clicking validates the form first (window.SiteBooking.validate); PayPal does not open on errors.
 * - The order is created in the browser: the chosen amount in USD, a description (tour, date, people,
 *   deposit or full price), the booking code as invoice_id, the site's brand name and no shipping.
 *   The booking is frozen at that moment, so the email describes what was paid even if the form changes.
 * - Once PayPal approves, the order is captured and the booking (plus amount, transaction, code and payer
 *   email) is POSTed to the Formspree endpoint, which emails it to the team. Paid either way: the visitor
 *   sees the booking code, and if the email failed, is asked to send the booking on WhatsApp or by email
 *   (those messages then carry the payment lines).
 * Data leaves the browser only to PayPal (the payment) and, after an approved payment, to Formspree.
 * Nothing is stored or logged.
 */
(function () {
  'use strict';

  /** PayPal rejects a purchase-unit description longer than this. */
  var DESCRIPTION_MAX = 127;
  /** Characters of the random part of a booking code: no 0/O or 1/I, so it can be read over the phone. */
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var CODE_RANDOM_LENGTH = 4;

  /**
   * Builds the booking code sent to PayPal as invoice_id (unique enough per tour day).
   * @param {string} dateIso - Tour date as YYYY-MM-DD.
   * @param {function(): number} random - Random number source in [0, 1), e.g. Math.random.
   * @returns {string} "PCE-" + month and day of the tour + "-" + 4 random characters, e.g. "PCE-1203-7F3K".
   */
  function bookingCode(dateIso, random) {
    var monthDay = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso.slice(5, 7) + dateIso.slice(8, 10) : '0000';
    var suffix = '';
    for (var i = 0; i < CODE_RANDOM_LENGTH; i++) {
      suffix += CODE_ALPHABET.charAt(Math.floor(random() * CODE_ALPHABET.length));
    }
    return 'PCE-' + monthDay + '-' + suffix;
  }

  /**
   * Joins the parts of the payment description, cut to what PayPal accepts.
   * @param {string[]} parts - Tour, date, people, deposit or full price (empty parts are skipped).
   * @returns {string} Parts joined with " · ", at most 127 characters (cut ones end with "…").
   */
  function description(parts) {
    var characters = Array.from(parts.filter(Boolean).join(' · '));
    if (characters.length <= DESCRIPTION_MAX) return characters.join('');
    return characters.slice(0, DESCRIPTION_MAX - 1).join('') + '…';
  }

  /**
   * Formats an amount in USD the way the PayPal order API expects it.
   * @param {number} amount - Amount in USD (may carry cents, e.g. a 50% deposit).
   * @returns {string} The amount with exactly 2 decimals, e.g. "97.50".
   */
  function amountValue(amount) {
    return (Math.round(amount * 100) / 100).toFixed(2);
  }

  /**
   * Text value of a field read from PayPal, or '' when it is missing.
   * @param {*} value - Field value.
   * @returns {string} The value when it is a string, else ''.
   */
  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  /**
   * Reads what the team needs from a captured PayPal order.
   * @param {Object|null} order - Result of actions.order.capture().
   * @returns {{transaction: string, status: string, payerEmail: string}} Capture id (the PayPal transaction),
   *   capture status ("COMPLETED", "PENDING"…) and the payer's PayPal email; '' for anything missing.
   */
  function captureInfo(order) {
    var unit = order && order.purchase_units && order.purchase_units[0];
    var capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];
    return {
      transaction: text(capture && capture.id),
      status: text(capture && capture.status),
      payerEmail: text(order && order.payer && order.payer.email_address)
    };
  }

  /**
   * Lines that describe the payment, added under the booking message.
   * @param {{amountText: string, kindText: string, transaction: string, code: string, payerEmail: string,
   *   status: string}} paid - What was paid (amountText "US$97.50", kindText "depósito 50 %") and what PayPal returned.
   * @param {function(string): string} label - Translates a booking.msg.* key into the message language.
   * @returns {string[]} "• Label: value" lines; the payer email only when known, the status only when the
   *   payment is not COMPLETED.
   */
  function paidLines(paid, label) {
    var lines = [
      '• ' + label('booking.msg.paid') + ': ' + paid.amountText + ' (' + paid.kindText + ')',
      '• ' + label('booking.msg.transaction') + ': ' + (paid.transaction || '—'),
      '• ' + label('booking.msg.code') + ': ' + paid.code
    ];
    if (paid.payerEmail) lines.push('• ' + label('booking.msg.payerEmail') + ': ' + paid.payerEmail);
    if (paid.status !== 'COMPLETED') lines.push('• ' + label('booking.msg.paymentStatus') + ': ' + (paid.status || '—'));
    return lines;
  }

  /**
   * Body of the email sent to the team through Formspree.
   * @param {{subject: string, message: string, lines: string[], payerEmail: string}} input - Email subject,
   *   booking message, payment lines and the payer's email.
   * @returns {{_subject: string, message: string, email?: string}} Formspree fields; "email" (the reply-to
   *   address) only when the payer email is known.
   */
  function emailPayload(input) {
    var payload = { _subject: input.subject, message: input.message + '\n\n' + input.lines.join('\n') };
    if (input.payerEmail) payload.email = input.payerEmail;
    return payload;
  }

  window.SitePayPal = {
    bookingCode: bookingCode,
    description: description,
    amountValue: amountValue,
    captureInfo: captureInfo,
    paidLines: paidLines,
    emailPayload: emailPayload
  };

  // ---- Checkout: needs the booking form, booking.js (window.SiteBooking) and a configured pay block. ----
  if (!document.querySelector('[data-booking-form]')) return;
  var booking = window.SiteBooking;
  var i18n = window.SiteI18n;
  var config = booking && booking.payConfig();
  var payBlock = document.querySelector('[data-paypal]');
  var buttonSlot = document.querySelector('[data-paypal-button]');
  if (!config || !i18n || !window.SitePrices || !payBlock || !buttonSlot) return;

  var SDK_URL = 'https://www.paypal.com/sdk/js';
  var BRAND_NAME = 'Puerto Plata Cruise Excursions';
  /** PayPal locale of each page language. */
  var LOCALES = { es: 'es_ES', en: 'en_US', fr: 'fr_FR', it: 'it_IT' };
  /** How long to wait for Formspree before treating the email as failed. */
  var EMAIL_TIMEOUT_MS = 15000;
  var sdkRequested = false;
  /** Booking frozen when each PayPal order was created, by order id. */
  var ordersInProgress = {};
  /** Orders already captured and emailed, by order id (one email per payment). */
  var ordersDone = {};

  /**
   * Translates a key into the message language (the team's language: Spanish or English).
   * @param {string} key - booking.msg.* key.
   * @returns {string} Text for the email.
   */
  function label(key) {
    return i18n.t(key, i18n.messageLanguage());
  }

  /**
   * Fills the {placeholders} of a translated text.
   * @param {string} text - Translated template, e.g. "depósito {percent} %".
   * @param {Object<string, string|number>} values - Placeholder values by name.
   * @returns {string} Text with every known placeholder replaced.
   */
  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
    });
  }

  /**
   * Replaces PayPal's buttons with a note when PayPal cannot be used (script blocked, offline…). The note
   * stays in place of the buttons, so the visitor knows to book on WhatsApp or by email.
   * @returns {void}
   */
  function showUnavailable() {
    var note = document.createElement('p');
    note.className = 'estimate__pay-error';
    note.textContent = i18n.t('booking.pay.unavailable');
    buttonSlot.textContent = '';
    buttonSlot.appendChild(note);
  }

  /**
   * Loads PayPal's SDK once, in the page language, then renders the buttons.
   * @returns {void}
   */
  function loadSdk() {
    if (sdkRequested) return;
    sdkRequested = true;
    var script = document.createElement('script');
    script.src = SDK_URL + '?client-id=' + encodeURIComponent(config.clientId) +
      '&currency=USD&intent=capture&components=buttons&locale=' + (LOCALES[i18n.getLanguage()] || LOCALES.en);
    script.async = true;
    script.onload = renderButtons;
    script.onerror = showUnavailable;
    document.head.appendChild(script);
  }

  /**
   * Renders PayPal's buttons into the pay block.
   * @returns {void}
   */
  function renderButtons() {
    var paypal = window.paypal;
    if (!paypal || typeof paypal.Buttons !== 'function') {
      showUnavailable();
      return;
    }
    paypal.Buttons({
      style: { layout: 'vertical', shape: 'rect', label: 'pay' },
      onClick: onClick,
      createOrder: createOrder,
      onApprove: onApprove,
      onCancel: function (data) {
        delete ordersInProgress[data.orderID];
        booking.status('booking.pay.cancelled', 'error');
      },
      onError: function () {
        booking.status('booking.pay.error', 'error');
      }
    }).render(buttonSlot).catch(showUnavailable);
  }

  /**
   * Lets PayPal open only when the form is valid and there is an amount to pay.
   * @param {Object} data - PayPal click data (unused).
   * @param {{resolve: function, reject: function}} actions - PayPal click actions.
   * @returns {Promise} PayPal's resolve() or reject().
   */
  function onClick(data, actions) {
    return booking.validate() && booking.payment() ? actions.resolve() : actions.reject();
  }

  /**
   * Creates the PayPal order for the chosen amount, and freezes the booking it pays for.
   * @param {Object} data - PayPal data (unused).
   * @param {{order: {create: function(Object): Promise<string>}}} actions - PayPal order actions.
   * @returns {Promise<string>} The PayPal order id.
   */
  function createOrder(data, actions) {
    var chosen = booking.payment();
    if (!chosen) return Promise.reject(new Error('Nothing to pay online'));
    var frozen = booking.snapshot();
    var order = {
      booking: frozen,
      amount: chosen.amount,
      code: bookingCode(frozen.dateIso, Math.random),
      kindText: chosen.kind === 'total' ? label('booking.msg.paidTotal') : fill(label('booking.msg.paidDeposit'), { percent: chosen.percent })
    };
    return actions.order.create({
      intent: 'CAPTURE',
      application_context: { brand_name: BRAND_NAME, shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
      purchase_units: [{
        description: description([frozen.tour, frozen.date, frozen.people, order.kindText]),
        invoice_id: order.code,
        amount: { currency_code: 'USD', value: amountValue(chosen.amount) }
      }]
    }).then(function (orderId) {
      ordersInProgress[orderId] = order;
      return orderId;
    });
  }

  /**
   * Captures the approved payment and emails the booking. A declined card goes back to PayPal so the
   * visitor can pick another one; any other PayPal error shows the error status.
   * @param {{orderID: string}} data - PayPal approval data.
   * @param {{order: {capture: function(): Promise<Object>}, restart: function(): Promise}} actions - PayPal actions.
   * @returns {Promise} Settles once the visitor sees the result.
   */
  function onApprove(data, actions) {
    return actions.order.capture().then(function (result) {
      var issue = result && Array.isArray(result.details) && result.details[0] && result.details[0].issue;
      if (issue === 'INSTRUMENT_DECLINED') return actions.restart();
      if (issue) {
        booking.status('booking.pay.error', 'error');
        return null;
      }
      return finishPayment(data.orderID, result);
    });
  }

  /**
   * Emails the paid booking to the team and tells the visitor how it went.
   * @param {string} orderId - PayPal order id.
   * @param {Object} result - Captured PayPal order.
   * @returns {Promise|null} Settles once the status is shown; null when this order was already handled.
   */
  function finishPayment(orderId, result) {
    var order = ordersInProgress[orderId];
    if (!order || ordersDone[orderId]) return null;
    ordersDone[orderId] = true;
    delete ordersInProgress[orderId];

    var info = captureInfo(result);
    var amountText = window.SitePrices.format(order.amount);
    var lines = paidLines({
      amountText: amountText, kindText: order.kindText, transaction: info.transaction,
      code: order.code, payerEmail: info.payerEmail, status: info.status
    }, label);
    var payload = emailPayload({
      subject: fill(label('booking.msg.paidSubject'), { tour: order.booking.tour, date: order.booking.date, amount: amountText }),
      message: order.booking.message,
      lines: lines,
      payerEmail: info.payerEmail
    });
    return sendEmail(payload).then(function (sent) {
      booking.markPaid(sent
        ? { key: 'booking.pay.done', tone: 'success', values: { code: order.code }, lines: lines }
        : { key: 'booking.pay.emailFailed', tone: 'error', values: { code: order.code, transaction: info.transaction || '—' }, lines: lines });
    });
  }

  /**
   * POSTs the email to Formspree.
   * @param {Object} payload - emailPayload() result.
   * @returns {Promise<boolean>} True when Formspree accepted it; false on any error, refusal or timeout.
   */
  function sendEmail(payload) {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, EMAIL_TIMEOUT_MS) : null;
    return fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.ok;
    }, function () {
      return false;
    }).then(function (sent) {
      if (timer) clearTimeout(timer);
      return sent;
    });
  }

  // Load PayPal only once the pay block shows (a tour with an online deposit and a priced group).
  if (!payBlock.hidden) {
    loadSdk();
  } else if (typeof MutationObserver === 'function') {
    var observer = new MutationObserver(function () {
      if (payBlock.hidden) return;
      observer.disconnect();
      loadSdk();
    });
    observer.observe(payBlock, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
