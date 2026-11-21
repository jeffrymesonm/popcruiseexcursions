/**
 * hero-slides.js — Rotating tour photos in the home hero, with one dot per photo and a pause button.
 *
 * Markup: the photos are the .hero__image elements of [data-hero-slides] (the first one, .is-active, is
 * the page's main image; the others start hidden + loading="lazy", so they download only when this
 * script prepares them); the controls are [data-slides-controls] with [data-slides-toggle] and one
 * [data-slide-to="n"] button per photo (n starts at 1).
 * Timing lives in CSS: the pressed dot's bar fills in --hero-interval (styles.css, "hero-slide-timer")
 * and its animationend shows the next photo. So pausing is just the CSS play-state: the pause button,
 * the hero being off screen or the tab hidden (.is-paused), a mouse over the controls or keyboard focus
 * on them. Only the photo after the visible one is downloaded ahead of time (one at a time, which keeps
 * phones on mobile data from fetching every photo up front); a photo is shown once it has loaded.
 * With prefers-reduced-motion nothing rotates by itself and the pause button is hidden; the dots still
 * change the photo (styles.css drops the fade and the zoom). Without JS the controls stay hidden and
 * only the first photo shows.
 */
(function () {
  'use strict';

  var media = document.querySelector('[data-hero-slides]');
  var controls = document.querySelector('[data-slides-controls]');
  if (!media || !controls) return;

  var slides = media.querySelectorAll('.hero__image');
  var dots = controls.querySelectorAll('[data-slide-to]');
  var toggle = controls.querySelector('[data-slides-toggle]');
  if (slides.length < 2 || dots.length !== slides.length) return;

  var reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var current = 0;
  // Increases on every request to show a photo, so a slow photo never replaces a later choice.
  var request = 0;
  var state = { userPaused: false, onScreen: true };

  /**
   * Translates a runtime label.
   * @param {string} key - Translation key ("hero.pause" / "hero.play").
   * @returns {string|null} Text in the page language, or null without i18n (the label then stays as is).
   */
  function t(key) {
    return window.SiteI18n ? window.SiteI18n.t(key) : null;
  }

  /**
   * Makes a hidden photo downloadable and renderable (still invisible: opacity 0 until .is-active).
   * Eager loading so it downloads even while the hero is scrolled away; the forced layout lets its
   * fade-in run later instead of appearing at once.
   * @param {HTMLImageElement} slide - One of the hero photos.
   * @returns {void}
   */
  function prepare(slide) {
    if (!slide.hidden) return;
    slide.loading = 'eager';
    slide.hidden = false;
    void slide.offsetWidth;
  }

  /**
   * Waits until a photo has loaded (or failed) and is decoded, so it never fades in half drawn.
   * @param {HTMLImageElement} slide - A prepared hero photo.
   * @returns {Promise<boolean>} Resolves true when the photo can be shown, false when it failed to load.
   */
  function whenReady(slide) {
    var loaded = slide.complete ? Promise.resolve() : new Promise(function (resolve) {
      slide.addEventListener('load', resolve, { once: true });
      slide.addEventListener('error', resolve, { once: true });
    });
    return loaded.then(function () {
      if (!slide.naturalWidth) return false;
      // decode() can reject for an image the browser already dropped; the photo is still usable.
      return typeof slide.decode === 'function' ? slide.decode().then(function () { return true; }, function () { return true; }) : true;
    });
  }

  /**
   * Shows one photo, presses its dot and prepares the photo after it.
   * @param {number} index - Photo position (0-based).
   * @returns {void}
   */
  function activate(index) {
    slides[current].classList.remove('is-active');
    slides[index].classList.add('is-active');
    Array.prototype.forEach.call(dots, function (dot, position) {
      dot.setAttribute('aria-pressed', position === index ? 'true' : 'false');
    });
    current = index;
    prepare(slides[(index + 1) % slides.length]);
  }

  /**
   * Shows a photo as soon as it is ready. A photo that fails to load is skipped (the next one is
   * tried), so one broken file never stops the rotation; after a full lap of failures it gives up.
   * @param {number} index - Photo position (0-based).
   * @param {number} [attempts] - Photos already tried for this request (internal).
   * @returns {void}
   */
  function go(index, attempts) {
    if (index === current) return;
    var ticket = ++request;
    var tried = attempts || 0;
    prepare(slides[index]);
    whenReady(slides[index]).then(function (ok) {
      if (ticket !== request) return;
      if (ok) {
        activate(index);
      } else if (tried + 1 < slides.length) {
        go((index + 1) % slides.length, tried + 1);
      }
    });
  }

  /**
   * Applies the pause rules and keeps the pause button's icon and label in step.
   * @returns {void}
   */
  function sync() {
    controls.classList.toggle('is-paused', state.userPaused || !state.onScreen || document.hidden);
    if (!toggle) return;
    var label = t(state.userPaused ? 'hero.play' : 'hero.pause');
    if (label) toggle.setAttribute('aria-label', label);
    var icon = toggle.querySelector('use');
    if (icon) icon.setAttribute('href', state.userPaused ? '#icon-play' : '#icon-pause');
  }

  Array.prototype.forEach.call(dots, function (dot) {
    dot.addEventListener('click', function () {
      go(Number(dot.getAttribute('data-slide-to')) - 1);
    });
  });

  controls.hidden = false;

  // The second photo downloads only after the first (the page's main image) has finished.
  if (document.readyState === 'complete') {
    prepare(slides[1]);
  } else {
    window.addEventListener('load', function () { prepare(slides[1]); }, { once: true });
  }

  if (reduceMotion) {
    if (toggle) toggle.hidden = true;
    return;
  }

  controls.classList.add('is-autoplay');

  // The pressed dot's bar has filled up: time for the next photo.
  controls.addEventListener('animationend', function (event) {
    if (event.animationName !== 'hero-slide-timer') return;
    go((current + 1) % slides.length);
  });

  if (toggle) {
    toggle.addEventListener('click', function () {
      state.userPaused = !state.userPaused;
      sync();
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      state.onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(media);
  }

  document.addEventListener('visibilitychange', sync);
  sync();
})();
