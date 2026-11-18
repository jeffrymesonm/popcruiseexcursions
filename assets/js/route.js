/**
 * route.js — Dashed road through the adventure cards, with a little jeep that drives along it
 * as the visitor scrolls (adapted from the paper-plane route of the "La Plancha" template).
 *
 * - The path is built from the real card positions (top centre → each card → bottom centre),
 *   so it follows the zig-zag desktop layout and the alternating phone list alike, and survives
 *   copy changes. Rebuilt on resize, after fonts load and after a language switch.
 * - The jeep faces the way it is driving: it is mirrored when the road heads left, and tilted
 *   with the slope (clamped so it never drives upside down). Its wheels spin with the distance
 *   travelled and the body bounces slightly, so scrolling up or down looks like real driving.
 * - Hidden for reduced motion (the road line stays).
 */
(function () {
  'use strict';

  var route = document.querySelector('[data-route]');
  if (!route) return;

  var svg = route.querySelector('.route__path');
  var path = route.querySelector('[data-route-path]');
  var car = route.querySelector('[data-route-car]');
  var body = car ? car.querySelector('[data-car-body]') : null;
  var wheels = car ? Array.prototype.slice.call(car.querySelectorAll('[data-car-wheel]')) : [];
  var cards = Array.prototype.slice.call(route.querySelectorAll('.spot__card'));
  if (!svg || !path || !cards.length) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TENSION = 1.35;          // > 1 makes wider, swoopier curves between stops
  var MAX_TILT = 38;           // degrees; steeper stretches keep this tilt instead of flipping over
  var FLIP_THRESHOLD = 0.2;    // horizontal share of the heading needed to turn around (hysteresis)
  var WHEEL_RATIO = 13 / 128;  // tyre radius / jeep width, from the SVG drawing
  var BOUNCE_PERIOD = 16;      // px of road per bounce cycle
  var BOUNCE_HEIGHT = 0.9;     // SVG units
  var length = 0;
  var facingLeft = false;
  var frameRequested = false;

  /**
   * Builds a smooth cubic path through the points (Catmull-Rom converted to Bézier segments).
   * @param {Array<Array<number>>} points - [x, y] pairs in route coordinates.
   * @returns {string} SVG path data.
   */
  function smoothPath(points) {
    var d = 'M' + points[0][0].toFixed(1) + ',' + points[0][1].toFixed(1);
    for (var i = 0; i < points.length - 1; i += 1) {
      var p0 = points[i - 1] || points[i];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[i + 2] || p2;
      var c1x = p1[0] + ((p2[0] - p0[0]) / 6) * TENSION;
      var c1y = p1[1] + ((p2[1] - p0[1]) / 6) * TENSION;
      var c2x = p2[0] - ((p3[0] - p1[0]) / 6) * TENSION;
      var c2y = p2[1] - ((p3[1] - p1[1]) / 6) * TENSION;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }

  /**
   * Measures the cards and redraws the route in pixel coordinates of the route box.
   * Uses offset geometry (not getBoundingClientRect) so reveal and rotation transforms are ignored.
   * @returns {void}
   */
  function build() {
    var width = route.clientWidth;
    var height = route.clientHeight;
    if (!width || !height) return;

    var points = [[width * 0.5, 0]];
    cards.forEach(function (card) {
      var item = card.closest('.spot'); // the <li>, positioned inside the list
      var x = item.offsetLeft + card.offsetLeft + card.offsetWidth / 2;
      var y = item.offsetTop + card.offsetTop + card.offsetHeight / 2;
      // On tablet/desktop each <li> is shifted with `translate`; include it so the road hits the card.
      var shift = (window.getComputedStyle(item).translate || '').split(' ');
      if (shift.length === 2 && shift[0] !== 'none') {
        x += (parseFloat(shift[0]) / 100) * (shift[0].indexOf('%') > -1 ? item.offsetWidth : 100);
        y += (parseFloat(shift[1]) / 100) * (shift[1].indexOf('%') > -1 ? item.offsetHeight : 100);
      }
      points.push([x, y]);
    });
    points.push([width * 0.5, height]);

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    path.setAttribute('d', smoothPath(points));
    length = path.getTotalLength();
    requestUpdate();
  }

  /**
   * Normalises an angle to the range (-180, 180].
   * @param {number} degrees - Any angle in degrees.
   * @returns {number} Equivalent angle in (-180, 180].
   */
  function normalize(degrees) {
    var value = degrees % 360;
    if (value > 180) value -= 360;
    if (value <= -180) value += 360;
    return value;
  }

  /**
   * Places the jeep on the route according to scroll progress through the route box.
   * @returns {void}
   */
  function update() {
    frameRequested = false;
    if (!car || !length) return;
    if (reducedMotion.matches) {
      car.style.opacity = '0';
      return;
    }

    var rect = route.getBoundingClientRect();
    var progress = (window.innerHeight * 0.55 - rect.top) / rect.height;
    progress = Math.min(1, Math.max(0, progress));

    var at = progress * length;
    var point = path.getPointAtLength(at);
    var ahead = path.getPointAtLength(Math.min(length, at + 3));
    var behind = path.getPointAtLength(Math.max(0, at - 3));
    var dx = ahead.x - behind.x;
    var dy = ahead.y - behind.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;

    // Turn around only when the road clearly heads the other way, so near-vertical
    // stretches don't make the jeep flicker between left and right.
    if (dx / distance < -FLIP_THRESHOLD) facingLeft = true;
    else if (dx / distance > FLIP_THRESHOLD) facingLeft = false;

    var heading = Math.atan2(dy, dx) * 180 / Math.PI;
    var tilt = normalize(facingLeft ? heading - 180 : heading);
    tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt));

    // The jeep's transform-origin (50% 90%, where the tyres touch) lands exactly on the point.
    car.style.transform = 'translate(' + point.x.toFixed(1) + 'px,' + point.y.toFixed(1) + 'px) translate(-50%,-90%) rotate(' + tilt.toFixed(1) + 'deg) scaleX(' + (facingLeft ? -1 : 1) + ')';
    car.style.opacity = progress > 0.01 && progress < 0.99 ? '1' : '0';

    // Rolling without slipping: angle = distance / radius.
    var wheelRadius = (car.offsetWidth || 100) * WHEEL_RATIO;
    var spin = (at / wheelRadius) * 180 / Math.PI;
    wheels.forEach(function (wheel) {
      wheel.style.transform = 'rotate(' + spin.toFixed(1) + 'deg)';
    });
    if (body) {
      body.style.transform = 'translateY(' + (Math.sin(at / BOUNCE_PERIOD) * BOUNCE_HEIGHT).toFixed(2) + 'px)';
    }
  }

  /**
   * Schedules one jeep update per animation frame.
   * @returns {void}
   */
  function requestUpdate() {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(update);
  }

  var rebuildTimer = null;
  /**
   * Debounced rebuild for layout-changing events.
   * @returns {void}
   */
  function scheduleBuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(build, 120);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', scheduleBuild);
  window.addEventListener('load', scheduleBuild);
  if (typeof reducedMotion.addEventListener === 'function') {
    reducedMotion.addEventListener('change', requestUpdate);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleBuild);
  build();
})();
