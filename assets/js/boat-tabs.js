/**
 * boat-tabs.js — Boat picker of tour card 05 ("Catamarán o yate privado").
 *
 * ARIA tabs pattern with automatic activation: one tab per boat ([data-boat-tab="id"]).
 * Selecting a tab shows that boat's panel ([data-boat-panel="id"]) and photo
 * ([data-boat-photo="id"]) and hides the others. Keyboard: ← / → (wrapping), Home and End.
 * The markup already shows the first boat, so nothing jumps while the page loads; without JS the
 * CSS hides the tabs and lists every panel, so the tabpanel roles are only added here. The booking
 * form is not touched here: the "Reservar este barco" links preselect the boat (booking.js).
 */
(function () {
  'use strict';

  var tablist = document.querySelector('[data-boat-tabs]');
  if (!tablist) return;

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[data-boat-tab]'));
  var panels = document.querySelectorAll('[data-boat-panel]');
  var photos = document.querySelectorAll('[data-boat-photo]');

  /** Index change for each navigation key (Home/End are handled as absolute positions). */
  var STEP = { ArrowRight: 1, ArrowLeft: -1 };

  /**
   * Shows the elements that belong to one boat and hides the rest.
   * @param {NodeList} elements - Panels or photos.
   * @param {string} attribute - Attribute holding the boat id.
   * @param {string} id - Boat to show.
   * @returns {void}
   */
  function showOnly(elements, attribute, id) {
    Array.prototype.forEach.call(elements, function (element) {
      element.hidden = element.getAttribute(attribute) !== id;
    });
  }

  /**
   * Selects a boat: updates the tabs (aria-selected, roving tabindex), panel and photo.
   * @param {HTMLElement} tab - Tab to select.
   * @param {boolean} moveFocus - Also move keyboard focus to the tab (keyboard navigation).
   * @returns {void}
   */
  function select(tab, moveFocus) {
    var id = tab.getAttribute('data-boat-tab');
    tabs.forEach(function (other) {
      var active = other === tab;
      other.setAttribute('aria-selected', active ? 'true' : 'false');
      other.tabIndex = active ? 0 : -1;
    });
    showOnly(panels, 'data-boat-panel', id);
    showOnly(photos, 'data-boat-photo', id);
    if (moveFocus) tab.focus();
  }

  tablist.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-boat-tab]');
    if (tab) select(tab, false);
  });

  tablist.addEventListener('keydown', function (event) {
    var index = tabs.indexOf(event.target.closest('[data-boat-tab]'));
    if (index === -1) return;
    var next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (STEP[event.key]) next = (index + STEP[event.key] + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    select(tabs[next], true);
  });

  // Panels become tabpanels only now that their tabs work (without JS they are a plain list).
  Array.prototype.forEach.call(panels, function (panel) {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'boat-tab-' + panel.getAttribute('data-boat-panel'));
  });

  // Start from whatever the markup marks as selected (the first boat).
  select(tabs.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })[0] || tabs[0], false);
})();
