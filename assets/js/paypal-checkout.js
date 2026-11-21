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
 * - PayPal's JavaScript SDK v5 loads once the booking form comes near the screen with the pay block showing, in
 *   the page language, and renders PayPal's own buttons (PayPal account or card) into [data-paypal-button]. If
 *   PayPal does not load (blocked, offline, no answer in 20 s), a note replaces the buttons.
 * - Clicking validates the form first (window.SiteBooking.validate); PayPal does not open on errors, nor while a
 *   payment is being captured (no second payment).
 * - The order is created in the browser: the chosen amount in USD, a description (tour, date, people,
 *   deposit or full price), the booking code as invoice_id, the site's brand name and no shipping.
 *   The booking is frozen at that moment, so the email describes what was paid even if the form changes.
 * - Once PayPal approves, the order is captured. A COMPLETED or PENDING capture counts as paid: the booking
 *   (plus amount, what it paid for, transaction, code and payer email) is POSTed to the Formspree endpoint, which
 *   emails it to the team. Either way the visitor sees the booking code, and if the email failed, is asked to
 *   send the booking on WhatsApp or by email (those messages then carry the payment lines). A DECLINED capture
 *   goes back to PayPal to pick another card; any other result shows the error.
 * The booking leaves the browser only to PayPal (the payment) and, after an approved payment, to Formspree;
 * PayPal's script itself loads from paypal.com when the form comes near the screen. Nothing is stored or logged.
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
   * @param {{amountText: string, kindText: string, paidFor: string, transaction: string, code: string,
   *   payerEmail: string, status: string}} paid - What was paid (amountText "US$97.50", kindText "depósito 50 %"),
   *   what it paid for (the PayPal description: tour · date · people) and what PayPal returned.
   * @param {function(string): string} label - Translates a booking.msg.* key into the message language.
   * @returns {string[]} "• Label: value" lines; what it paid for and the payer email only when known, the status
   *   only when the payment is not COMPLETED.
   */
  function paidLines(paid, label) {
    var lines = ['• ' + label('booking.msg.paid') + ': ' + paid.amountText + ' (' + paid.kindText + ')'];
    if (paid.paidFor) lines.push('• ' + label('booking.msg.paidFor') + ': ' + paid.paidFor);
    lines.push(
      '• ' + label('booking.msg.transaction') + ': ' + (paid.transaction || '—'),
      '• ' + label('booking.msg.code') + ': ' + paid.code
    );
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
  /** How long to wait for PayPal's script before showing the "PayPal unavailable" note. */
  var SDK_TIMEOUT_MS = 20000;
  /** Load PayPal when the form is this close to the screen, so the buttons are ready when the visitor gets there. */
  var NEAR_SCREEN_MARGIN = '400px 0px';
  var sdkRequested = false;
  /** True once the booking form has come near the screen (always true without IntersectionObserver). */
  var formNearScreen = typeof IntersectionObserver !== 'function';
  /** True from PayPal's approval until the payment is settled: PayPal must not open for a second payment. */
  var paying = false;
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
   * Loads PayPal's SDK once, in the page language, then renders the buttons. Shows the "PayPal unavailable" note
   * when the script fails or does not answer in time (PayPal's buttons still replace it if it loads later).
   * @returns {void}
   */
  function loadSdk() {
    if (sdkRequested) return;
    sdkRequested = true;
    var loaded = false;
    var script = document.createElement('script');
    script.src = SDK_URL + '?client-id=' + encodeURIComponent(config.clientId) +
      '&currency=USD&intent=capture&components=buttons&locale=' + (LOCALES[i18n.getLanguage()] || LOCALES.en);
    script.async = true;
    var timer = setTimeout(function () {
      if (!loaded) showUnavailable();
    }, SDK_TIMEOUT_MS);
    script.onload = function () {
      loaded = true;
      clearTimeout(timer);
      renderButtons();
    };
    script.onerror = function () {
      clearTimeout(timer);
      showUnavailable();
    };
    document.head.appendChild(script);
  }

  /**
   * Renders PayPal's buttons into the pay block (replacing the note if PayPal answered late).
   * @returns {void}
   */
  function renderButtons() {
    var paypal = window.paypal;
    if (!paypal || typeof paypal.Buttons !== 'function') {
      showUnavailable();
      return;
    }
    buttonSlot.textContent = '';
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
   * Lets PayPal open only when the form is valid, there is an amount to pay and no payment is being captured.
   * @param {Object} data - PayPal click data (unused).
   * @param {{resolve: function, reject: function}} actions - PayPal click actions.
   * @returns {Promise} PayPal's resolve() or reject().
   */
  function onClick(data, actions) {
    if (paying) {
      booking.status('booking.pay.processing', 'success');
      return actions.reject();
    }
    return booking.validate() && booking.payment() ? actions.resolve() : actions.reject();
  }

  /**
   * Describes what a PayPal order pays for, from the booking as it is when PayPal opens.
   * @param {{kind: string, amount: number, percent: number}} chosen - SiteBooking.payment().
   * @param {{tour: string, date: string, dateIso: string, people: string}} frozen - SiteBooking.snapshot().
   * @returns {{booking: Object, amount: number, code: string, kindText: string, paidFor: string,
   *   description: string}} The frozen booking, the amount in USD, the booking code, "depósito 50 %" / "total",
   *   what it pays for (tour · date · people) and the PayPal description (the same plus the kind of payment).
   */
  function newOrder(chosen, frozen) {
    var kindText = chosen.kind === 'total'
      ? label('booking.msg.paidTotal')
      : fill(label('booking.msg.paidDeposit'), { percent: chosen.percent });
    return {
      booking: frozen,
      amount: chosen.amount,
      code: bookingCode(frozen.dateIso, Math.random),
      kindText: kindText,
      paidFor: description([frozen.tour, frozen.date, frozen.people]),
      description: description([frozen.tour, frozen.date, frozen.people, kindText])
    };
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
    var order = newOrder(chosen, booking.snapshot());
    return actions.order.create({
      intent: 'CAPTURE',
      application_context: { brand_name: BRAND_NAME, shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
      purchase_units: [{
        description: order.description,
        invoice_id: order.code,
        amount: { currency_code: 'USD', value: amountValue(chosen.amount) }
      }]
    }).then(function (orderId) {
      ordersInProgress[orderId] = order;
      return orderId;
    });
  }

  /**
   * Captures the approved payment and emails the booking. Until that is settled PayPal cannot open again.
   * A COMPLETED or PENDING capture counts as paid; a declined card goes back to PayPal so the visitor can pick
   * another one; anything else shows the error status (and PayPal's own errors reach onError).
   * @param {{orderID: string}} data - PayPal approval data.
   * @param {{order: {capture: function(): Promise<Object>}, restart: function(): Promise}} actions - PayPal actions.
   * @returns {Promise} Settles once the visitor sees the result.
   */
  function onApprove(data, actions) {
    paying = true;
    booking.status('booking.pay.processing', 'success');
    return actions.order.capture().then(function (result) {
      var issue = result && Array.isArray(result.details) && result.details[0] && result.details[0].issue;
      var status = captureInfo(result).status;
      if (issue === 'INSTRUMENT_DECLINED' || status === 'DECLINED') {
        paying = false;
        booking.status(null);
        return actions.restart();
      }
      if (issue || (status !== 'COMPLETED' && status !== 'PENDING')) {
        paying = false;
        booking.status('booking.pay.error', 'error');
        return null;
      }
      return finishPayment(data.orderID, result);
    }, function (error) {
      paying = false;
      throw error;
    });
  }

  /**
   * Emails the paid booking to the team and tells the visitor how it went.
   * @param {string} orderId - PayPal order id.
   * @param {Object} result - Captured PayPal order.
   * @returns {Promise|null} Settles once the status is shown; null when this order was already handled.
   */
  function finishPayment(orderId, result) {
    if (ordersDone[orderId]) return null;
    // The booking frozen in createOrder is always expected; without it the payment is still reported, with the
    // form as it is now, so money never moves silently.
    var chosen = ordersInProgress[orderId] ? null : booking.payment();
    var order = ordersInProgress[orderId] || (chosen && newOrder(chosen, booking.snapshot()));
    if (!order) {
      paying = false;
      booking.status('booking.pay.error', 'error');
      return null;
    }
    ordersDone[orderId] = true;
    delete ordersInProgress[orderId];

    var info = captureInfo(result);
    var amountText = window.SitePrices.format(order.amount);
    var lines = paidLines({
      amountText: amountText, kindText: order.kindText, paidFor: order.paidFor, transaction: info.transaction,
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
   * POSTs the email to Formspree. keepalive lets the request finish if the visitor closes the tab right away.
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
      keepalive: true,
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

  /**
   * Loads PayPal once both are true: the booking form is near the screen and the pay block shows (a tour with an
   * online deposit and a priced group). Visitors who never reach the form never download PayPal.
   * @returns {void}
   */
  function loadWhenNeeded() {
    if (formNearScreen && !payBlock.hidden) loadSdk();
  }

  if (!formNearScreen) {
    var nearObserver = new IntersectionObserver(function (entries) {
      var near = entries.some(function (entry) {
        return entry.isIntersecting;
      });
      if (!near) return;
      formNearScreen = true;
      nearObserver.disconnect();
      loadWhenNeeded();
    }, { rootMargin: NEAR_SCREEN_MARGIN });
    nearObserver.observe(document.querySelector('[data-booking-form]'));
  }
  if (typeof MutationObserver === 'function') {
    var hiddenObserver = new MutationObserver(function () {
      loadWhenNeeded();
      if (sdkRequested) hiddenObserver.disconnect();
    });
    hiddenObserver.observe(payBlock, { attributes: true, attributeFilter: ['hidden'] });
  }
  loadWhenNeeded();
})();
