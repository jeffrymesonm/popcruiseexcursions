/**
 * paypal-checkout.test.mjs — Tests for the pure helpers of the PayPal checkout (assets/js/paypal-checkout.js,
 * window.SitePayPal): the booking code, the payment description, the amount sent to PayPal, what is read back
 * from a capture, and the email sent to the team through Formspree. The script runs in a sandbox with an empty
 * document, so only the helpers load (the checkout wiring needs the booking form).
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SANDBOX_CLIENT_ID } from '../lib/paypal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');


/**
 * Loads assets/js/paypal-checkout.js in a sandbox and returns what it exposes.
 * @returns {object} window.SitePayPal of the sandbox.
 */
function loadSitePayPal() {
  const script = fs.readFileSync(path.join(ROOT, 'assets/js/paypal-checkout.js'), 'utf8');
  const context = vm.createContext({
    document: { querySelector: () => null, querySelectorAll: () => [] }
  });
  context.window = context;
  vm.runInContext(script, context);
  return context.SitePayPal;
}

test('booking code: PCE, month and day of the tour, 4 unambiguous characters', () => {
  const pp = loadSitePayPal();
  assert.equal(pp.bookingCode('2026-12-03', () => 0), 'PCE-1203-AAAA');
  assert.equal(pp.bookingCode('2026-01-31', () => 0.999), 'PCE-0131-9999');
  assert.match(pp.bookingCode('2026-07-04', Math.random), /^PCE-0704-[A-HJ-NP-Z2-9]{4}$/);
});

test('description joins the parts and never passes 127 characters', () => {
  const pp = loadSitePayPal();
  assert.equal(pp.description(['Damajagua', '', '4 personas']), 'Damajagua · 4 personas');
  const long = pp.description(['Charcos de Damajagua (avec tyrolienne) '.repeat(4), '31 décembre 2026', '12 personnes', 'acompte 50 %']);
  assert.equal(Array.from(long).length, 127);
  assert.ok(long.endsWith('…'));
});

test('amount value always has 2 decimals and no float noise', () => {
  const pp = loadSitePayPal();
  assert.equal(pp.amountValue(97.5), '97.50');
  assert.equal(pp.amountValue(195 * 0.5), '97.50');
  assert.equal(pp.amountValue(0.1 + 0.2), '0.30');
  assert.equal(pp.amountValue(130), '130.00');
});

test('capture info reads the PayPal capture and survives missing fields', () => {
  const pp = loadSitePayPal();
  const order = {
    payer: { email_address: 'ana@example.com' },
    purchase_units: [{ payments: { captures: [{ id: '8AB12345CD678901E', status: 'COMPLETED' }] } }]
  };
  assert.deepEqual({ ...pp.captureInfo(order) }, { transaction: '8AB12345CD678901E', status: 'COMPLETED', payerEmail: 'ana@example.com' });
  assert.deepEqual({ ...pp.captureInfo({}) }, { transaction: '', status: '', payerEmail: '' });
  assert.deepEqual({ ...pp.captureInfo(null) }, { transaction: '', status: '', payerEmail: '' });
});

test('paid lines: status line only when the payment is not completed', () => {
  const pp = loadSitePayPal();
  const paid = {
    amountText: 'US$97.50', kindText: 'depósito 50 %', paidFor: 'Damajagua · 3 de diciembre de 2026 · 3 personas',
    transaction: 'T1', code: 'PCE-1203-AAAA', payerEmail: 'ana@example.com', status: 'COMPLETED'
  };
  assert.deepEqual(Array.from(pp.paidLines(paid, (key) => key)), [
    '• booking.msg.paid: US$97.50 (depósito 50 %)',
    '• booking.msg.paidFor: Damajagua · 3 de diciembre de 2026 · 3 personas',
    '• booking.msg.transaction: T1',
    '• booking.msg.code: PCE-1203-AAAA', '• booking.msg.payerEmail: ana@example.com'
  ]);
  const pending = pp.paidLines({ ...paid, payerEmail: '', status: 'PENDING' }, (key) => key);
  assert.equal(pending.length, 5);
  assert.equal(pending[4], '• booking.msg.paymentStatus: PENDING');
});

test('email payload: booking message, then the payment lines; reply-to only with an email', () => {
  const pp = loadSitePayPal();
  assert.deepEqual({ ...pp.emailPayload({ subject: 'S', message: 'M', lines: ['a', 'b'], payerEmail: 'x@y.com' }) },
    { _subject: 'S', message: 'M\n\na\nb', email: 'x@y.com' });
  assert.equal('email' in pp.emailPayload({ subject: 'S', message: 'M', lines: [], payerEmail: '' }), false);
});

/**
 * Runs assets/js/paypal-checkout.js against stubs of the page, booking.js (SiteBooking), PayPal's SDK and fetch,
 * so the checkout wiring can be driven step by step: the form coming into view, PayPal's callbacks, Formspree.
 * @param {{blockHidden?: boolean, fetch?: function(): Promise}} [options] - Pay block hidden at start; fetch result.
 * @returns {object} { log, booking (mutable state), block, slot, intersect(), mutate(), loadSdk(), actions() }.
 */
function loadCheckout(options = {}) {
  const log = { statuses: [], tones: [], paid: [], emails: [], scripts: [], timers: [], orders: [], captures: 0, enabled: 0, resolved: 0, rejected: 0, restarts: 0 };
  const block = { hidden: Boolean(options.blockHidden) };
  const slot = { textContent: '', hidden: false, children: [], appendChild(child) { this.children.push(child); } };
  const observers = {};
  const state = {
    payment: { kind: 'deposit', amount: 112.5, percent: 50 },
    booking: { message: 'Booking message', tour: 'Damajagua', date: '3 de diciembre de 2026', dateIso: '2026-12-03', people: '3 personas' }
  };
  const context = vm.createContext({
    document: {
      head: { appendChild: (script) => log.scripts.push(script) },
      querySelector: (selector) => ({ '[data-booking-form]': {}, '[data-paypal]': block, '[data-paypal-button]': slot })[selector] || null,
      querySelectorAll: () => [],
      createElement: (tag) => ({ tagName: tag.toUpperCase() })
    },
    SiteBooking: {
      payConfig: () => ({ clientId: 'A'.repeat(20), endpoint: 'https://formspree.io/f/test' }),
      validate: () => true,
      payment: () => state.payment && { ...state.payment },
      snapshot: () => ({ ...state.booking }),
      status: (key, tone) => { log.statuses.push(key); log.tones.push(tone); },
      markPaid: (result) => log.paid.push(result),
      enablePayPal: () => { log.enabled++; },
      tm: (key) => key,
      fill: (text, values) => text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
    },
    SiteI18n: { t: (key) => key, messageLanguage: () => 'es', getLanguage: () => 'es' },
    SitePrices: { format: (amount) => 'US$' + amount },
    setTimeout: (fn, ms) => log.timers.push({ fn, ms, cleared: false }),
    clearTimeout: (id) => { if (log.timers[id - 1]) log.timers[id - 1].cleared = true; },
    fetch: (url, init) => {
      log.emails.push({ url, init, body: Object.fromEntries(new URLSearchParams(String(init.body))) });
      return options.fetch ? options.fetch() : Promise.resolve({ ok: true });
    },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    URLSearchParams,
    MutationObserver: class { constructor(callback) { observers.mutation = callback; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(callback) { observers.intersection = callback; } observe() {} disconnect() {} }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/paypal-checkout.js'), 'utf8'), context);
  const checkout = {
    log, state, block, slot,
    /** The booking form comes near the screen. */
    intersect: () => observers.intersection && observers.intersection([{ isIntersecting: true }]),
    /** booking.js toggled the pay block's hidden attribute. */
    mutate: () => observers.mutation && observers.mutation([]),
    /** PayPal's script finishes loading; returns the options given to paypal.Buttons(). */
    loadSdk() {
      context.paypal = { Buttons: (config) => { checkout.buttons = config; return { render: () => Promise.resolve() }; } };
      log.scripts[0].onload();
      return checkout.buttons;
    },
    /** PayPal's actions object; capture() returns what the test gives it. */
    actions: (capture) => ({
      resolve: () => { log.resolved++; return Promise.resolve(); },
      reject: () => { log.rejected++; return Promise.resolve(); },
      restart: () => { log.restarts++; return Promise.resolve(); },
      order: {
        create: (order) => { log.orders.push(order); return Promise.resolve('ORDER-' + log.orders.length); },
        capture: () => { log.captures++; return (capture || (() => Promise.resolve(captured('COMPLETED'))))(); }
      }
    })
  };
  return checkout;
}

/**
 * A captured PayPal order, as actions.order.capture() resolves it.
 * @param {string} status - Capture status.
 * @returns {object} Order with one capture and a payer.
 */
function captured(status) {
  return { payer: { email_address: 'ana@example.com' }, purchase_units: [{ payments: { captures: [{ id: 'TX1', status }] } }] };
}

/**
 * Lets a checkout with the form on screen load PayPal and returns PayPal's button options.
 * @param {object} checkout - loadCheckout() result.
 * @returns {object} Options given to paypal.Buttons().
 */
function readyButtons(checkout) {
  checkout.intersect();
  return checkout.loadSdk();
}

test('PayPal loads only once the booking form is near the screen and the pay block shows', () => {
  const visible = loadCheckout();
  assert.equal(visible.log.scripts.length, 0, 'loaded before the form came into view');
  visible.intersect();
  assert.equal(visible.log.scripts.length, 1);

  const hidden = loadCheckout({ blockHidden: true });
  hidden.intersect();
  assert.equal(hidden.log.scripts.length, 0, 'loaded while the pay block was hidden');
  hidden.block.hidden = false;
  hidden.mutate();
  assert.equal(hidden.log.scripts.length, 1);
});

test('a PayPal script that never answers leaves a notice instead of a blank panel', () => {
  const checkout = loadCheckout();
  checkout.intersect();
  const timeout = checkout.log.timers.find((timer) => timer.ms >= 10000);
  assert.ok(timeout, 'no load timeout');
  timeout.fn();
  assert.equal(checkout.slot.children[0].textContent, 'booking.pay.unavailable');
});

test('no second payment can start while the first one is being captured', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  let finishCapture;
  const approving = buttons.onApprove({ orderID: orderId }, checkout.actions(() => new Promise((resolve) => { finishCapture = resolve; })));
  await buttons.onClick({}, checkout.actions());
  assert.equal(checkout.log.rejected, 1, 'PayPal could open again during the capture');
  assert.ok(checkout.log.statuses.includes('booking.pay.processing'));
  finishCapture(captured('COMPLETED'));
  await approving;
  assert.equal(checkout.log.paid.length, 1);
  assert.equal(checkout.log.paid[0].key, 'booking.pay.done');
});

test('a DECLINED capture goes back to PayPal and a FAILED one shows the error; neither counts as paid', async () => {
  const declined = loadCheckout();
  let buttons = readyButtons(declined);
  let orderId = await buttons.createOrder({}, declined.actions());
  await buttons.onApprove({ orderID: orderId }, declined.actions(() => Promise.resolve(captured('DECLINED'))));
  assert.equal(declined.log.restarts, 1);
  assert.equal(declined.log.paid.length, 0);
  assert.equal(declined.log.emails.length, 0);

  const failed = loadCheckout();
  buttons = readyButtons(failed);
  orderId = await buttons.createOrder({}, failed.actions());
  await buttons.onApprove({ orderID: orderId }, failed.actions(() => Promise.resolve(captured('FAILED'))));
  assert.ok(failed.log.statuses.includes('booking.pay.error'));
  assert.equal(failed.log.paid.length, 0);
  assert.equal(failed.log.emails.length, 0);
  await buttons.onClick({}, failed.actions());
  assert.equal(failed.log.resolved, 1, 'the visitor cannot try again after a failed capture');
});

test('the email describes the paid booking, is sent once, as a simple form post that survives closing the tab', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  assert.equal(checkout.log.emails.length, 1);
  const email = checkout.log.emails[0];
  assert.equal(email.init.keepalive, true, 'the email can be cancelled when the tab closes');
  assert.equal(email.init.headers['Content-Type'], undefined, 'a JSON content type forces a CORS preflight');
  assert.equal(email.init.headers.Accept, 'application/json');
  assert.ok(email.body.message.startsWith('Booking message\n\n'));
  assert.ok(email.body.message.includes('US$112.5'));
  assert.ok(email.body.message.includes('booking.msg.paidFor: Damajagua · 3 de diciembre de 2026 · 3 personas'));
  assert.equal(email.body.email, 'ana@example.com');
});

test('a captured payment whose frozen booking is missing is still emailed and shown', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  await buttons.onApprove({ orderID: 'UNKNOWN-ORDER' }, checkout.actions());
  assert.equal(checkout.log.emails.length, 1);
  assert.equal(checkout.log.paid.length, 1);
});

test('when Formspree fails after the payment, the visitor keeps the code and the transaction', async () => {
  const checkout = loadCheckout({ fetch: () => Promise.reject(new Error('offline')) });
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  assert.equal(checkout.log.paid.length, 1);
  assert.equal(checkout.log.paid[0].key, 'booking.pay.emailFailed');
  assert.equal(checkout.log.paid[0].values.transaction, 'TX1');
  assert.match(checkout.log.paid[0].values.code, /^PCE-1203-/);
});

test('a booking changed while PayPal is open is not charged', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  // The visitor edits the form while typing card details: PayPal would charge something else.
  checkout.state.booking.message = 'Edited after PayPal opened';
  checkout.state.payment = { kind: 'total', amount: 450, percent: 50 };
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  assert.equal(checkout.log.captures, 0, 'the old amount was captured for a changed booking');
  assert.equal(checkout.log.emails.length, 0);
  assert.equal(checkout.log.paid.length, 0);
  assert.equal(checkout.log.statuses.at(-1), 'booking.pay.changed');
  await buttons.onClick({}, checkout.actions());
  assert.equal(checkout.log.resolved, 1, 'the visitor cannot pay the new booking');
});

test('a card declined when the capture is rejected goes back to PayPal', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  const declined = () => Promise.reject(new Error('Order could not be captured: {"details":[{"issue":"INSTRUMENT_DECLINED"}]}'));
  await buttons.onApprove({ orderID: orderId }, checkout.actions(declined));
  assert.equal(checkout.log.restarts, 1);
  assert.equal(checkout.log.emails.length, 0);
});

test('a PENDING payment is not announced as received', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  await buttons.onApprove({ orderID: orderId }, checkout.actions(() => Promise.resolve(captured('PENDING'))));
  assert.equal(checkout.log.emails.length, 1);
  assert.equal(checkout.log.paid[0].key, 'booking.pay.pending');
});

test('closing PayPal is not shown as an error', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  buttons.onCancel({ orderID: orderId });
  assert.equal(checkout.log.statuses.at(-1), 'booking.pay.cancelled');
  assert.equal(checkout.log.tones.at(-1), 'info');
});

test('the checkout tells booking.js it is there, so the pay block never shows without it', () => {
  const checkout = loadCheckout();
  assert.equal(checkout.log.enabled, 1);
});

test('the build refuses to publish the sandbox Client ID with Formspree set', async () => {
  const { paypalConfigErrors } = await import('../lib/paypal.mjs');
  const block = (clientId, endpoint) => `<div class="estimate__pay" data-paypal data-paypal-client-id="${clientId}" data-formspree-endpoint="${endpoint}" hidden>`;
  assert.equal(paypalConfigErrors(block(SANDBOX_CLIENT_ID, 'https://formspree.io/f/abc')).length, 1);
  assert.deepEqual(paypalConfigErrors(block(SANDBOX_CLIENT_ID, '')), []);
  assert.deepEqual(paypalConfigErrors(block('BAA3live', 'https://formspree.io/f/abc')), []);
  assert.equal(paypalConfigErrors('<div class="estimate"></div>').length, 1, 'a missing pay block passed');
  assert.deepEqual(paypalConfigErrors(fs.readFileSync(path.join(ROOT, 'src/partials/booking.html'), 'utf8')), []);
  assert.ok(fs.readFileSync(path.join(ROOT, 'tools/build.mjs'), 'utf8').includes('paypalConfigErrors('), 'the build does not run the check');
});
