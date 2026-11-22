/**
 * whatsapp.js — WhatsApp links for Puerto Plata Cruise Excursions.
 *
 * - Every element with data-wa-link gets a wa.me link with a greeting in the message language
 *   (the page language when the team reads it, otherwise English; see SiteI18n.messageLanguage).
 *   The static href in the HTML, without text, is the no-JS fallback, and stays when the greeting
 *   cannot be translated (i18n.js or translations.js did not load).
 * - Exposes window.SiteWhatsApp = { url, open } for booking.js.
 * To change the number, edit PHONE (country code + number, digits only) and the visible
 * "+1 (829) 627-7733" texts in src/ (index.html, partials/footer.html, partials/booking.html) and the
 * about.fact.4 key, then rebuild.
 */
(function () {
  'use strict';

  var PHONE = '18296277733';

  /**
   * Translates a message key into the language the team reads.
   * @param {string} key - Translation key.
   * @returns {string} Text in the message language (Spanish or English), or '' when i18n.js or the
   *   dictionaries did not load (the raw key must never end up in a message).
   */
  function tMessage(key) {
    var text = window.SiteI18n ? window.SiteI18n.t(key, window.SiteI18n.messageLanguage()) : key;
    return text === key ? '' : text;
  }

  /**
   * Builds a wa.me URL that opens a chat with the business.
   * @param {string} [message] - Text to prefill in the chat.
   * @returns {string} The URL.
   */
  function url(message) {
    return 'https://wa.me/' + PHONE + (message ? '?text=' + encodeURIComponent(message) : '');
  }

  /**
   * Opens the chat in a new tab (the WhatsApp app on phones).
   * A temporary link is clicked instead of window.open so it runs inside the visitor's click
   * and popup blockers let it through.
   * @param {string} message - Text to prefill in the chat.
   * @returns {void}
   */
  function open(message) {
    var link = document.createElement('a');
    link.href = url(message);
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /**
   * Points every [data-wa-link] at a chat with the greeting in the message language. Without a
   * translated greeting the links keep their static href (a chat without text).
   * @returns {void}
   */
  function syncLinks() {
    var greeting = tMessage('wa.greeting');
    if (!greeting) return;
    var href = url(greeting);
    document.querySelectorAll('[data-wa-link]').forEach(function (link) {
      link.setAttribute('href', href);
    });
  }

  syncLinks();

  window.SiteWhatsApp = { url: url, open: open };
})();
