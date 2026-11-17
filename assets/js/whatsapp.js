/**
 * whatsapp.js — WhatsApp links for Puerto Plata Cruise Excursions.
 *
 * - Every element with data-wa-link gets a wa.me link with a greeting in the message language
 *   (the page language when the team reads it, otherwise English; see SiteI18n.messageLanguage).
 *   The static href in the HTML, without text, is the no-JS fallback.
 * - Exposes window.SiteWhatsApp = { url, open } for booking.js.
 * To change the number, edit PHONE (country code + number, digits only) and the visible
 * "+1 (829) 627-7733" texts in index.html.
 */
(function () {
  'use strict';

  var PHONE = '18296277733';

  /**
   * Translates a message key into the language the team reads, or returns the key when i18n is
   * unavailable.
   * @param {string} key - Translation key.
   * @returns {string} Text in the message language (Spanish or English).
   */
  function tMessage(key) {
    return window.SiteI18n ? window.SiteI18n.t(key, window.SiteI18n.messageLanguage()) : key;
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
   * Points every [data-wa-link] at a chat with the greeting in the message language.
   * @returns {void}
   */
  function syncLinks() {
    var href = url(tMessage('wa.greeting'));
    document.querySelectorAll('[data-wa-link]').forEach(function (link) {
      link.setAttribute('href', href);
    });
  }

  window.addEventListener('i18n:change', syncLinks);
  syncLinks();

  window.SiteWhatsApp = { url: url, open: open };
})();
