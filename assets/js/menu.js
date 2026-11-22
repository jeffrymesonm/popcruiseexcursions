/**
 * menu.js — Full-screen navigation menu.
 * The toggle opens a curtain overlay (animated in CSS), locks page scroll, makes the rest of
 * the page inert so keyboard focus stays in the nav and menu, and moves focus to the first
 * link. Closes on the toggle, a menu link, or Escape, and returns focus to the toggle.
 */
(function () {
  'use strict';

  var toggle = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('[data-menu]');
  if (!toggle || !menu) return;

  var root = document.documentElement;
  var background = document.querySelectorAll('[data-menu-inert]');
  var isOpen = false;

  /**
   * Translates a label into the page language.
   * @param {string} key - Translation key.
   * @returns {string|null} Label text, or null when i18n.js or the dictionaries did not load.
   */
  function label(key) {
    var text = window.SiteI18n ? window.SiteI18n.t(key) : key;
    return text === key ? null : text;
  }

  /**
   * Updates the toggle's accessible name for the current state. Without translations the label the
   * build wrote in the page language stays (aria-expanded still tells whether the menu is open).
   * @returns {void}
   */
  function syncToggleLabel() {
    var text = label(isOpen ? 'nav.closeMenu' : 'nav.openMenu');
    if (text) toggle.setAttribute('aria-label', text);
  }

  /**
   * Opens or closes the menu.
   * @param {boolean} open - Desired state.
   * @param {boolean} restoreFocus - When closing, move focus back to the toggle.
   * @returns {void}
   */
  function setOpen(open, restoreFocus) {
    if (open === isOpen) return;
    isOpen = open;

    menu.classList.toggle('is-open', open);
    root.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    syncToggleLabel();

    if (open) {
      menu.removeAttribute('inert');
    } else {
      menu.setAttribute('inert', '');
    }
    background.forEach(function (element) {
      element.inert = open;
    });

    if (open) {
      var firstLink = menu.querySelector('a, button');
      if (firstLink) firstLink.focus({ preventScroll: true });
    } else if (restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  }

  toggle.addEventListener('click', function () {
    setOpen(!isOpen, true);
  });

  // A link closes the menu; the browser then follows the anchor (smooth scroll in CSS).
  menu.addEventListener('click', function (event) {
    if (event.target.closest('[data-menu-link]')) setOpen(false, false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen) setOpen(false, true);
  });

  // Back/forward cache (Safari on iPhone): a page left from the open menu (e.g. a language link) comes
  // back exactly as it was, menu open; close it when the page is shown again.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) setOpen(false, false);
  });

  syncToggleLabel();
})();
