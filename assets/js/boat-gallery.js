/**
 * boat-gallery.js — Photo thumbnails of each boat in tour card 05.
 *
 * Every boat has one figure ([data-boat-photo="id"]) holding all its photos
 * (img[data-boat-shot="n"], one visible) and one strip of thumbnail buttons
 * ([data-boat-shots="id"] [data-shot="n"]). Tapping a thumbnail shows that photo and marks the
 * button with aria-pressed. Each boat keeps its own choice when the visitor switches boats
 * (boat-tabs.js only shows/hides whole figures and strips). Hidden photos use loading="lazy",
 * so a photo downloads only when it is first shown. Without JS the strips stay hidden (CSS).
 */
(function () {
  'use strict';

  var card = document.querySelector('#tour-catamaran');
  if (!card) return;

  /**
   * Shows one photo of a boat and marks its thumbnail as pressed.
   * @param {HTMLElement} strip - The boat's thumbnail strip ([data-boat-shots]).
   * @param {string} shot - Photo number to show (value of data-shot / data-boat-shot).
   * @returns {void}
   */
  function showShot(strip, shot) {
    var boat = strip.getAttribute('data-boat-shots');
    var figure = card.querySelector('[data-boat-photo="' + boat + '"]');
    if (!figure) return;
    Array.prototype.forEach.call(figure.querySelectorAll('img[data-boat-shot]'), function (photo) {
      photo.hidden = photo.getAttribute('data-boat-shot') !== shot;
    });
    Array.prototype.forEach.call(strip.querySelectorAll('[data-shot]'), function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-shot') === shot ? 'true' : 'false');
    });
  }

  card.addEventListener('click', function (event) {
    var button = event.target.closest('[data-shot]');
    if (!button) return;
    var strip = button.closest('[data-boat-shots]');
    if (strip) showShot(strip, button.getAttribute('data-shot'));
  });
})();
