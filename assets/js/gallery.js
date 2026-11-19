/**
 * gallery.js — Photo thumbnails of the tour cards and of each boat in tour card 06, and the video of
 * the Buggies & ATVs card.
 *
 * A gallery is one photo frame ([data-photos="id"]) holding all its items ([data-photo="n"]: an img,
 * or one muted looping video; one item visible) and one strip of thumbnail buttons
 * ([data-shots="id"] [data-shot="n"]) with the same id. Tapping a thumbnail shows that item and marks
 * the button with aria-pressed.
 * Every tour card has one gallery; the boats card has one per boat, and each boat keeps its own
 * choice when the visitor switches boats (boat-tabs.js only shows/hides whole frames and strips).
 * Hidden photos use loading="lazy", so a photo downloads only when it is first shown; a video has
 * preload="none", so it downloads only when it first plays.
 * A video plays on its own only while it is the chosen item and on screen (IntersectionObserver), and
 * never with prefers-reduced-motion. Its pause/play button ([data-video-toggle], in the same frame)
 * lets the visitor stop it (WCAG 2.2.2); once paused by the visitor it does not start again by itself.
 * Without JS the strips and the button stay hidden (CSS / hidden attribute) and the video shows its poster.
 */
(function () {
  'use strict';

  /** Share of the video that must be on screen for it to play. */
  var VISIBLE_SHARE = 0.25;
  var reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var canWatch = 'IntersectionObserver' in window;

  /** Gallery id → function that plays or pauses its video after a change (galleries with a video only). */
  var videoSync = {};

  /**
   * Translates a runtime label.
   * @param {string} key - Translation key ("gallery.play" / "gallery.pause").
   * @returns {string|null} Text in the page language, or null without i18n (the label then stays as is).
   */
  function t(key) {
    return window.SiteI18n ? window.SiteI18n.t(key) : null;
  }

  /**
   * Wires one gallery video: autoplay rules, its pause/play button and its on-screen watcher.
   * @param {HTMLVideoElement} video - A video[data-photo] inside a [data-photos] frame.
   * @returns {void}
   */
  function setUpVideo(video) {
    var frame = video.closest('[data-photos]');
    if (!frame) return;
    var toggle = frame.querySelector('[data-video-toggle]');
    // choice: null = automatic, "play" / "pause" = what the visitor asked for with the button.
    var state = { onScreen: !canWatch, choice: null };

    /**
     * Shows the button only while the video is the visible item, labelled with what it will do.
     * @returns {void}
     */
    function renderToggle() {
      if (!toggle) return;
      toggle.hidden = video.hidden;
      var label = t(video.paused ? 'gallery.play' : 'gallery.pause');
      if (label) toggle.setAttribute('aria-label', label);
      var icon = toggle.querySelector('use');
      if (icon) icon.setAttribute('href', video.paused ? '#icon-play' : '#icon-pause');
    }

    /**
     * Plays or pauses the video to match the rules above.
     * @returns {void}
     */
    function sync() {
      var wanted = state.choice === 'play' || (state.choice === null && canWatch && !reduceMotion);
      if (!video.hidden && state.onScreen && wanted) {
        if (video.paused) {
          var attempt = video.play();
          // A browser may refuse to play (data saver, low-power mode): keep the poster and offer "play".
          if (attempt && typeof attempt.catch === 'function') attempt.catch(renderToggle);
        }
      } else if (!video.paused) {
        video.pause();
      }
      renderToggle();
    }

    video.addEventListener('play', renderToggle);
    video.addEventListener('pause', renderToggle);

    if (toggle) {
      toggle.addEventListener('click', function () {
        state.choice = video.paused ? 'play' : 'pause';
        // The visitor is looking at it: a "play" must not wait for the on-screen watcher.
        state.onScreen = true;
        sync();
      });
    }

    if (canWatch) {
      new IntersectionObserver(function (entries) {
        state.onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: VISIBLE_SHARE }).observe(video);
    }

    videoSync[frame.getAttribute('data-photos')] = sync;
    renderToggle();
  }

  /**
   * Shows one item of a gallery and marks its thumbnail as pressed.
   * @param {HTMLElement} strip - The gallery's thumbnail strip ([data-shots]).
   * @param {string} shot - Item number to show (value of data-shot / data-photo).
   * @returns {void}
   */
  function showShot(strip, shot) {
    var id = strip.getAttribute('data-shots');
    var frame = document.querySelector('[data-photos="' + id + '"]');
    if (!frame) return;
    Array.prototype.forEach.call(frame.querySelectorAll('[data-photo]'), function (item) {
      item.hidden = item.getAttribute('data-photo') !== shot;
    });
    Array.prototype.forEach.call(strip.querySelectorAll('[data-shot]'), function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-shot') === shot ? 'true' : 'false');
    });
    if (videoSync[id]) videoSync[id]();
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-shot]');
    if (!button) return;
    var strip = button.closest('[data-shots]');
    if (strip) showShot(strip, button.getAttribute('data-shot'));
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-photos] video[data-photo]'), setUpVideo);
})();
