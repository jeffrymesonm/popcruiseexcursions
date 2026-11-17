/**
 * stack-cards.js — Scroll effect for the sticky tour cards (tablet and desktop).
 * All cards stick at the same offset (CSS, from 768px). As the next card slides over one, the
 * covered card shrinks to MIN_SCALE and fades out, so the stack reads as depth.
 * Phones (plain list) and reduced motion keep the cards untouched.
 */
(function () {
  'use strict';

  var MIN_SCALE = 0.94;
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-stack-card]'));
  if (cards.length < 2) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var stacked = window.matchMedia('(min-width: 768px)'); // must match the sticky breakpoint in styles.css
  var frameRequested = false;

  /**
   * Clamps a number into [0, 1].
   * @param {number} value - Raw value.
   * @returns {number} Value limited to the unit range.
   */
  function clampUnit(value) {
    return Math.min(1, Math.max(0, value));
  }

  /**
   * Removes the inline scale and fade from every card.
   * @returns {void}
   */
  function reset() {
    cards.forEach(function (card) {
      card.style.transform = '';
      card.style.opacity = '';
    });
  }

  /**
   * Recomputes scale and opacity for every card that can be covered.
   * Progress goes from 0 (next card just below this one) to 1 (next card fully on top).
   * transform-origin is the top edge, so getBoundingClientRect().top is unaffected by scale.
   * @returns {void}
   */
  function update() {
    frameRequested = false;

    if (reducedMotion.matches || !stacked.matches) {
      reset();
      return;
    }

    for (var i = 0; i < cards.length - 1; i += 1) {
      var card = cards[i];
      var stickyTop = parseFloat(window.getComputedStyle(card).top) || 0;
      var height = card.offsetHeight || 1;
      var nextTop = cards[i + 1].getBoundingClientRect().top;
      var progress = clampUnit((stickyTop + height - nextTop) / height);

      card.style.transform = progress > 0 ? 'scale(' + (1 - (1 - MIN_SCALE) * progress).toFixed(4) + ')' : '';
      card.style.opacity = progress > 0 ? (1 - progress).toFixed(3) : '';
    }
  }

  /**
   * Schedules one update per animation frame, however many scroll events arrive.
   * @returns {void}
   */
  function requestUpdate() {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  [reducedMotion, stacked].forEach(function (query) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', requestUpdate);
  });
  update();
})();
