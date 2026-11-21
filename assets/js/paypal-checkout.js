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

  if (!document.querySelector('[data-booking-form]')) return;
})();
