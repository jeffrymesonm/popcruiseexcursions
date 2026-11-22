/**
 * paypal-checkout.js — Pay a tour's deposit or full price with PayPal from the booking form, and email the
 * booking to the team once the payment is approved.
 *
 * Pure helpers, exposed as window.SitePayPal (tested in tools/test/paypal-checkout.test.mjs):
 * - bookingCode: the code that travels with the payment (PayPal invoice_id), e.g. "PCE-1203-7F3K";
 * - description: the payment description PayPal shows (127 characters at most);
 * - amountValue: the amount as PayPal wants it ("97.50");
 * - captureInfo: what PayPal says it charged (amount, currency, invoice), the transaction, its status (and the
 *   reason of a PENDING one) and the payer's name and email, read from a PayPal capture;
 * - paidLines / emailPayload: the payment lines and the Formspree body of the email to the team.
 *
 * Checkout (only on pages with the booking form and a configured [data-paypal] block, see booking.js):
 * - PayPal's JavaScript SDK v5 loads once the booking form comes near the screen with the pay block showing, and
 *   renders PayPal's own buttons (PayPal account or card) into [data-paypal-button]. No locale is passed: PayPal
 *   picks the buyer's language and the card form's country (a fixed es_ES/fr_FR/it_IT made the card form ask for
 *   a Spanish, French or Italian address). If PayPal does not load (blocked, offline, no answer in 20 s), a note
 *   replaces the buttons.
 * - Clicking validates the form first (window.SiteBooking.validate); PayPal does not open on errors, nor while a
 *   payment is being captured (no second payment). Closing PayPal or a PayPal error always lets the visitor try
 *   again.
 * - The order is created in the browser: the chosen amount in USD, a description (tour, date, people,
 *   deposit or full price), the booking code as invoice_id, the site's brand name and no shipping. Retries for the
 *   same tour day keep the booking code, so a PayPal account that blocks repeated invoice ids refuses a second
 *   payment. The booking is frozen at that moment.
 * - If the booking changed while PayPal was open (tour, date, people, deposit or full price), the approved order is
 *   not captured (nothing is charged) and the visitor is asked to pay again. A fixed name or ship is not a change:
 *   the email carries the booking as it is when PayPal approves.
 * - Once PayPal approves, the order is captured. A COMPLETED or PENDING capture counts as paid (PENDING is told as
 *   "PayPal is reviewing your payment"). When the capture answer is lost (the connection drops), PayPal is asked
 *   for the order before showing an error, so a charged payment is never left unreported. The booking, what PayPal
 *   actually charged (with a warning when it is not the expected amount), the balance due on the tour day, the
 *   transaction, the code and the payer are POSTed to the Formspree endpoint, which emails them to the team with
 *   a reminder to check the payment in PayPal (the email can be forged; PayPal is the proof). Either way the
 *   visitor sees the booking code, and if the email failed, is asked to send the booking on WhatsApp or by email
 *   (those messages then carry the payment lines). A DECLINED capture goes back to PayPal to pick another card;
 *   any other result shows the error.
 * - While a payment is being captured or reported, leaving the page asks for confirmation. An email Formspree did
 *   not take stays in sessionStorage (this tab only) and is sent again when the page loads; booking.js keeps the
 *   payment status there too, so a reload never offers a second payment.
 * The booking leaves the browser only to PayPal (the payment) and, after an approved payment, to Formspree;
 * PayPal's script itself loads from paypal.com when the form comes near the screen. Nothing is logged.
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
   * Reads what the team needs from a captured PayPal order (the answer of actions.order.capture() or
   * actions.order.get()).
   * @param {Object|null} order - Captured PayPal order.
   * @returns {{transaction: string, status: string, payerEmail: string, payerName: string, amount: number|null,
   *   currency: string, invoiceId: string, pendingReason: string}} Capture id (the PayPal transaction), capture
   *   status ("COMPLETED", "PENDING"…), the payer's PayPal email and name, the amount PayPal charged (null when
   *   missing or not a number) and its currency, the invoice id the payment carries, and why a PENDING capture
   *   waits (e.g. "PENDING_REVIEW"); '' for any missing text.
   */
  function captureInfo(order) {
    var unit = order && order.purchase_units && order.purchase_units[0];
    var capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];
    var charged = capture && capture.amount;
    var amount = charged ? parseFloat(text(charged.value)) : NaN;
    var name = order && order.payer && order.payer.name;
    return {
      transaction: text(capture && capture.id),
      status: text(capture && capture.status),
      payerEmail: text(order && order.payer && order.payer.email_address),
      payerName: name ? [text(name.given_name), text(name.surname)].filter(Boolean).join(' ') : '',
      amount: isFinite(amount) ? amount : null,
      currency: text(charged && charged.currency_code),
      invoiceId: text(capture && capture.invoice_id) || text(unit && unit.invoice_id),
      pendingReason: text(capture && capture.status_details && capture.status_details.reason)
    };
  }

  /**
   * Lines that describe the payment, added under the booking message (the team email and any later WhatsApp or
   * email message of the visitor).
   * @param {{amountText: string, kindText: string, expectedText?: string, paidFor: string, balanceText?: string,
   *   transaction: string, code: string, payerName?: string, payerEmail: string, status: string,
   *   pendingReason?: string}} paid - What PayPal charged (amountText "US$97.50", kindText "depósito 50 %"), the
   *   expected amount when PayPal charged something else, what it paid for (tour · date · people), what is left to
   *   pay on the tour day, and what PayPal returned.
   * @param {function(string): string} label - Translates a booking.msg.* key into the message language.
   * @returns {string[]} "• Label: value" lines; the warning only when the amount is not the expected one, what it
   *   paid for, the balance and the payer only when known, the status only when the payment is not COMPLETED.
   */
  function paidLines(paid, label) {
    var lines = ['• ' + label('booking.msg.paid') + ': ' + paid.amountText + ' (' + paid.kindText + ')'];
    if (paid.expectedText) lines.push('• ⚠ ' + label('booking.msg.amountMismatch') + ': ' + paid.expectedText);
    if (paid.paidFor) lines.push('• ' + label('booking.msg.paidFor') + ': ' + paid.paidFor);
    if (paid.balanceText) lines.push('• ' + label('booking.msg.balanceDue') + ': ' + paid.balanceText);
    lines.push(
      '• ' + label('booking.msg.transaction') + ': ' + (paid.transaction || '—'),
      '• ' + label('booking.msg.code') + ': ' + paid.code
    );
    if (paid.payerName) lines.push('• ' + label('booking.msg.payerName') + ': ' + paid.payerName);
    if (paid.payerEmail) lines.push('• ' + label('booking.msg.payerEmail') + ': ' + paid.payerEmail);
    if (paid.status !== 'COMPLETED') {
      lines.push('• ' + label('booking.msg.paymentStatus') + ': ' + (paid.status || '—') +
        (paid.pendingReason ? ' (' + paid.pendingReason + ')' : ''));
    }
    return lines;
  }

  /**
   * Body of the email sent to the team through Formspree.
   * @param {{subject: string, message: string, lines: string[], note?: string, payerEmail: string}} input - Email
   *   subject, booking message, payment lines, a closing note for the team (e.g. "check the payment in PayPal") and
   *   the payer's email.
   * @returns {{_subject: string, message: string, email?: string}} Formspree fields; "email" (the reply-to
   *   address) only when the payer email is known.
   */
  function emailPayload(input) {
    var message = input.message + '\n\n' + input.lines.join('\n') + (input.note ? '\n\n' + input.note : '');
    var payload = { _subject: input.subject, message: message };
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
  // booking.js keeps the pay block hidden until this script is running, so it never shows without buttons.
  booking.enablePayPal();

  var SDK_URL = 'https://www.paypal.com/sdk/js';
  var BRAND_NAME = 'Puerto Plata Cruise Excursions';
  /** How long to wait for Formspree before treating the email as failed. */
  var EMAIL_TIMEOUT_MS = 15000;
  /** How long to wait for PayPal's script before showing the "PayPal unavailable" note. */
  var SDK_TIMEOUT_MS = 20000;
  /** Load PayPal when the form is this close to the screen, so the buttons are ready when the visitor gets there. */
  var NEAR_SCREEN_MARGIN = '400px 0px';
  /** sessionStorage key of a paid email Formspree has not taken yet (sent again when the page loads). */
  var UNSENT_EMAIL_KEY = 'pce-unsent-email';
  var sdkRequested = false;
  /** True once the booking form has come near the screen (always true without IntersectionObserver). */
  var formNearScreen = typeof IntersectionObserver !== 'function';
  /** True from PayPal's approval until the payment is captured and reported: no second payment, and leaving asks. */
  var paying = false;
  /** Booking frozen when each PayPal order was created, by order id. */
  var ordersInProgress = {};
  /** Orders already captured and emailed, by order id (one email per payment). */
  var ordersDone = {};
  /** Booking code of this visit and the tour day it was made for: retries for the same day reuse it. */
  var visitCode = { dateIso: '', code: '' };

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
   * Loads PayPal's SDK once, then renders the buttons. No locale: PayPal uses the buyer's language and country, so
   * the card form asks for the right billing address. Shows the "PayPal unavailable" note when the script fails or
   * does not answer in time (PayPal's buttons still replace it if it loads later).
   * @returns {void}
   */
  function loadSdk() {
    if (sdkRequested) return;
    sdkRequested = true;
    var loaded = false;
    var script = document.createElement('script');
    script.src = SDK_URL + '?client-id=' + encodeURIComponent(config.clientId) +
      '&currency=USD&intent=capture&components=buttons';
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
      // Both let the visitor pay again: after a declined card PayPal restarts its own flow and the capture never
      // answers, so "paying" must not stay true when the visitor then closes PayPal.
      onCancel: function (data) {
        paying = false;
        delete ordersInProgress[data.orderID];
        booking.status('booking.pay.cancelled', 'info');
      },
      onError: function () {
        paying = false;
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
   * Booking code for a tour day: the same one for every retry of this visit on that day, so the invoice id stays
   * the same (a PayPal account that blocks repeated invoice ids then refuses a second payment), and a new one
   * when the visitor picks another day.
   * @param {string} dateIso - Tour date as YYYY-MM-DD.
   * @returns {string} Booking code, e.g. "PCE-1203-7F3K".
   */
  function codeFor(dateIso) {
    if (visitCode.dateIso !== dateIso || !visitCode.code) {
      visitCode = { dateIso: dateIso, code: bookingCode(dateIso, Math.random) };
    }
    return visitCode.code;
  }

  /**
   * Describes what a PayPal order pays for, from the booking as it is when PayPal opens.
   * @param {{kind: string, amount: number, percent: number, total: number}} chosen - SiteBooking.payment().
   * @param {{tour: string, date: string, dateIso: string, people: string}} frozen - SiteBooking.snapshot().
   * @returns {{booking: Object, kind: string, amount: number, total: number, code: string, kindText: string,
   *   paidFor: string, description: string}} The frozen booking, deposit or total, the amount in USD and the
   *   booking's full price, the booking code, "depósito 50 %" / "total", what it pays for (tour · date · people)
   *   and the PayPal description (the same plus the kind of payment).
   */
  function newOrder(chosen, frozen) {
    var kindText = chosen.kind === 'total'
      ? booking.tm('booking.msg.paidTotal')
      : booking.fill(booking.tm('booking.msg.paidDeposit'), { percent: chosen.percent });
    return {
      booking: frozen,
      kind: chosen.kind,
      amount: chosen.amount,
      total: chosen.total,
      code: codeFor(frozen.dateIso),
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
   * another one; anything else shows the error status (and PayPal's own errors reach onError). When the capture
   * answer is lost, PayPal is asked for the order first: it may have charged the card anyway.
   * @param {{orderID: string}} data - PayPal approval data.
   * @param {{order: {capture: function(): Promise<Object>, get: function(): Promise<Object>},
   *   restart: function(): Promise}} actions - PayPal actions.
   * @returns {Promise} Settles once the visitor sees the result.
   */
  function onApprove(data, actions) {
    // An order already paid and emailed: nothing to do, and the visitor's result stays on screen.
    if (ordersDone[data.orderID]) return Promise.resolve(null);
    // The booking changed while PayPal was open (PayPal's card form leaves the form editable): an approved order
    // that is never captured expires, so not capturing it means nothing is charged.
    var frozen = ordersInProgress[data.orderID];
    if (frozen && bookingChanged(frozen)) {
      delete ordersInProgress[data.orderID];
      booking.status('booking.pay.changed', 'error');
      return Promise.resolve(null);
    }
    // Same tour, date, people and amount: the email carries the booking as it is now (a fixed name or ship).
    if (frozen) frozen.booking = booking.snapshot();
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
      // With client-side capture, a declined card usually rejects (the issue is in the error text) rather than
      // resolving with details: it goes back to PayPal too.
      if (String(error && error.message ? error.message : error).indexOf('INSTRUMENT_DECLINED') !== -1) {
        paying = false;
        booking.status(null);
        return actions.restart();
      }
      // The answer may have been lost on the way back (cruise-ship Wi-Fi) after PayPal charged the card.
      return capturedOrder(actions).then(function (order) {
        if (order) return finishPayment(data.orderID, order);
        paying = false;
        throw error;
      });
    });
  }

  /**
   * Asks PayPal for an order whose capture did not answer, to know whether the card was charged anyway.
   * @param {{order: {get?: function(): Promise<Object>}}} actions - PayPal actions.
   * @returns {Promise<Object|null>} The order when its capture is COMPLETED or PENDING, else null (also when PayPal
   *   does not answer).
   */
  function capturedOrder(actions) {
    if (!actions.order || typeof actions.order.get !== 'function') return Promise.resolve(null);
    return actions.order.get().then(function (order) {
      var status = captureInfo(order).status;
      return status === 'COMPLETED' || status === 'PENDING' ? order : null;
    }, function () {
      return null;
    });
  }

  /**
   * Tells whether the booking changed since an order was created in a way PayPal would charge for something else
   * than what is on screen: deposit or full price, amount, tour (with boat, vehicle, zipline), date or people.
   * A fixed name or ship does not count.
   * @param {{booking: {tour: string, dateIso: string, people: string}, kind: string, amount: number}} order - A
   *   frozen order (newOrder).
   * @returns {boolean} True when the form no longer matches the order.
   */
  function bookingChanged(order) {
    var chosen = booking.payment();
    var now = booking.snapshot();
    return !chosen || chosen.kind !== order.kind || chosen.amount !== order.amount ||
      now.tour !== order.booking.tour || now.dateIso !== order.booking.dateIso || now.people !== order.booking.people;
  }

  /**
   * The amount PayPal charged, written for the team.
   * @param {{amount: number|null, currency: string}} info - captureInfo() result.
   * @param {number} expected - Amount the order asked for, in USD (used when PayPal's answer has no amount).
   * @returns {{text: string, usd: number|null, matches: boolean}} "US$112.50" (or "112.50 EUR"), the amount in USD
   *   (null in another currency) and whether it is the expected amount.
   */
  function chargedAmount(info, expected) {
    if (info.amount === null) return { text: window.SitePrices.format(expected), usd: expected, matches: true };
    if (info.currency && info.currency !== 'USD') {
      return { text: amountValue(info.amount) + ' ' + info.currency, usd: null, matches: false };
    }
    return {
      text: window.SitePrices.format(info.amount),
      usd: info.amount,
      matches: Math.round(info.amount * 100) === Math.round(expected * 100)
    };
  }

  /**
   * Emails the paid booking to the team and tells the visitor how it went. The email reports what PayPal charged
   * (with a warning when it is not the expected amount), so a tampered order cannot pass as fully paid.
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
    var charged = chargedAmount(info, order.amount);
    // The code that travels with the payment is the invoice id PayPal kept.
    var code = info.invoiceId || order.code;
    var balance = charged.usd === null || typeof order.total !== 'number' ? null : Math.max(0, order.total - charged.usd);
    var lines = paidLines({
      amountText: charged.text,
      kindText: order.kindText,
      expectedText: charged.matches ? '' : window.SitePrices.format(order.amount),
      paidFor: order.paidFor,
      balanceText: balance === null ? '' : window.SitePrices.format(Math.round(balance * 100) / 100),
      transaction: info.transaction,
      code: code,
      payerName: info.payerName,
      payerEmail: info.payerEmail,
      status: info.status,
      pendingReason: info.pendingReason
    }, booking.tm);
    var payload = emailPayload({
      subject: booking.fill(booking.tm('booking.msg.paidSubject'), { tour: order.booking.tour, date: order.booking.date, amount: charged.text }),
      message: order.booking.message,
      lines: lines,
      note: booking.tm('booking.msg.verify'),
      payerEmail: info.payerEmail
    });
    var unsent = {
      payload: payload,
      key: info.status === 'PENDING' ? 'booking.pay.pending' : 'booking.pay.done',
      code: code,
      lines: lines
    };
    // Kept until Formspree takes it: a reload or a closed tab sends it again on the next load.
    remember(UNSENT_EMAIL_KEY, unsent);
    return sendEmail(payload).then(function (sent) {
      paying = false;
      if (sent) forget(UNSENT_EMAIL_KEY);
      booking.markPaid(sent
        ? { key: unsent.key, tone: 'success', values: { code: code }, lines: lines }
        : { key: 'booking.pay.emailFailed', tone: 'error', values: { code: code, transaction: info.transaction || '—' }, lines: lines });
    });
  }

  /**
   * Stores a value in this tab's sessionStorage (nothing happens when storage is blocked).
   * @param {string} key - Storage key.
   * @param {*} value - Value, stored as JSON.
   * @returns {void}
   */
  function remember(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Private mode or blocked storage: the payment still works, it is just not kept across a reload.
    }
  }

  /**
   * Reads a value stored with remember().
   * @param {string} key - Storage key.
   * @returns {*} The stored value, or null when missing, unreadable or blocked.
   */
  function recall(key) {
    try {
      var stored = window.sessionStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Removes a value stored with remember().
   * @param {string} key - Storage key.
   * @returns {void}
   */
  function forget(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      // Blocked storage: nothing was stored either.
    }
  }

  /**
   * Sends again a paid email Formspree did not take before the page was reloaded or closed, and updates the
   * visitor's status quietly (no focus jump) once it goes through. When it fails again it stays stored, and the
   * status booking.js restored ("send it on WhatsApp or by email") stays on screen.
   * @returns {void}
   */
  function resendUnsentEmail() {
    var unsent = recall(UNSENT_EMAIL_KEY);
    if (!unsent || !unsent.payload || !unsent.key) return;
    sendEmail(unsent.payload).then(function (sent) {
      if (!sent) return;
      forget(UNSENT_EMAIL_KEY);
      booking.markPaid({ key: unsent.key, tone: 'success', values: { code: unsent.code }, lines: unsent.lines || [] }, { quiet: true });
    });
  }

  /**
   * POSTs the email to Formspree. keepalive lets the request finish if the visitor closes the tab right away. The
   * fields go form-encoded (Formspree accepts it) with only an Accept header: a CORS "simple" request, so there is
   * no preflight, which some browsers have refused for keepalive requests. Empty fields are left out.
   * @param {Object} payload - emailPayload() result.
   * @returns {Promise<boolean>} True when Formspree accepted it; false on any error, refusal or timeout.
   */
  function sendEmail(payload) {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, EMAIL_TIMEOUT_MS) : null;
    var body = new URLSearchParams();
    Object.keys(payload).forEach(function (field) {
      if (payload[field] != null && payload[field] !== '') body.append(field, payload[field]);
    });
    return fetch(config.endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: body,
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
  // A capture or its email in progress: closing or reloading now could leave a payment unreported.
  window.addEventListener('beforeunload', function (event) {
    if (!paying) return;
    event.preventDefault();
    event.returnValue = '';
  });
  resendUnsentEmail();
  loadWhenNeeded();
})();
