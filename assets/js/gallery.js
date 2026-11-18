/**
 * gallery.js — Photo thumbnails of the tour cards and of each boat in tour card 06.
 *
 * A gallery is one photo frame ([data-photos="id"]) holding all its photos (img[data-photo="n"],
 * one visible) and one strip of thumbnail buttons ([data-shots="id"] [data-shot="n"]) with the
 * same id. Tapping a thumbnail shows that photo and marks the button with aria-pressed.
 * Every tour card has one gallery; the boats card has one per boat, and each boat keeps its own
 * choice when the visitor switches boats (boat-tabs.js only shows/hides whole frames and strips).
 * Hidden photos use loading="lazy", so a photo downloads only when it is first shown.
 * Without JS the strips stay hidden (CSS).
 */
(function () {
  'use strict';

  /**
   * Shows one photo of a gallery and marks its thumbnail as pressed.
   * @param {HTMLElement} strip - The gallery's thumbnail strip ([data-shots]).
   * @param {string} shot - Photo number to show (value of data-shot / data-photo).
   * @returns {void}
   */
  function showShot(strip, shot) {
    var id = strip.getAttribute('data-shots');
    var frame = document.querySelector('[data-photos="' + id + '"]');
    if (!frame) return;
    Array.prototype.forEach.call(frame.querySelectorAll('img[data-photo]'), function (photo) {
      photo.hidden = photo.getAttribute('data-photo') !== shot;
    });
    Array.prototype.forEach.call(strip.querySelectorAll('[data-shot]'), function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-shot') === shot ? 'true' : 'false');
    });
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-shot]');
    if (!button) return;
    var strip = button.closest('[data-shots]');
    if (strip) showShot(strip, button.getAttribute('data-shot'));
  });
})();
