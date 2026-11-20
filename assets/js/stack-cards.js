/**
 * stack-cards.js — Scroll effect for the sticky tour cards (tablet and desktop).
 * All cards stick at the same offset (CSS, from 768px), except a card taller than the screen, which
 * sticks by its bottom edge (CSS reads its height from --card-height, set here). As the next card slides over one, the
 * covered card shrinks to MIN_SCALE and fades out, so the stack reads as depth.
 * A card counts as covered from COVERED_AT on: it then fires "stack-cover" (bubbles, detail.covered),
 * and again when it is uncovered, so gallery.js can pause a video nobody can see.
 * Phones (plain list) and reduced motion keep the cards untouched (and never covered).
 */
(function () {
  'use strict';

  var MIN_SCALE = 0.94;
  /** Progress (0–1) of the next card over this one from which this card counts as covered. */
  var COVERED_AT = 0.75;
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
   * Records whether a card is covered and fires "stack-cover" when that changes.
   * @param {HTMLElement} card - A [data-stack-card].
   * @param {boolean} covered - True when the next card is (almost) fully on top of it.
   * @returns {void}
   */
  function setCovered(card, covered) {
    if (card.hasAttribute('data-stack-covered') === covered) return;
    card.toggleAttribute('data-stack-covered', covered);
    card.dispatchEvent(new CustomEvent('stack-cover', { bubbles: true, detail: { covered: covered } }));
  }

  /**
   * Removes the inline scale and fade from every card (none is covered then).
   * @returns {void}
   */
  function reset() {
    cards.forEach(function (card) {
      card.style.transform = '';
      card.style.opacity = '';
      setCovered(card, false);
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
      setCovered(card, progress >= COVERED_AT);
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

  /**
   * Publishes each card's height as --card-height, which styles.css uses to stick a card taller
   * than the screen by its bottom edge (so its button is never hidden below the screen).
   * offsetHeight ignores the scale transform, so the effect never feeds back into the height.
   * @returns {void}
   */
  function measure() {
    cards.forEach(function (card) {
      card.style.setProperty('--card-height', card.offsetHeight + 'px');
    });
    requestUpdate();
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', measure);
  [reducedMotion, stacked].forEach(function (query) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', measure);
  });
  // Heights also change without a resize: photos and fonts loading, or another boat picked in card 06.
  if (typeof window.ResizeObserver === 'function') {
    var observer = new window.ResizeObserver(measure);
    cards.forEach(function (card) { observer.observe(card); });
  }
  measure();
  update();
})();
