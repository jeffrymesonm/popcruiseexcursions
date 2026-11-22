/**
 * reveal.js — Fades [data-reveal] blocks in the first time they scroll into view.
 * Without IntersectionObserver, or with reduced motion, everything is shown immediately.
 * Optional stagger: style="--delay: 120ms" on the element.
 * styles.css shows every block after 3 s if this script never runs ("reveal-failsafe"); the script
 * cancels that failsafe with .reveal-ready on <html> as soon as it starts.
 */
(function () {
  'use strict';

  var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (!items.length) return;

  /**
   * Marks an element as revealed.
   * @param {Element} element - Element with data-reveal.
   * @returns {void}
   */
  function show(element) {
    element.classList.add('is-visible');
  }

  // On a slow connection this script can start after the CSS failsafe: blocks it has already shown (even
  // halfway) stay shown instead of disappearing and fading in again; then the failsafe is cancelled.
  items.forEach(function (item) {
    if (window.getComputedStyle(item).opacity !== '0') show(item);
  });
  document.documentElement.classList.add('reveal-ready');

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      show(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  items.forEach(function (item) {
    observer.observe(item);
  });
})();
