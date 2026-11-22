/**
 * paypal-checkout.test.mjs — Tests for the pure helpers of the PayPal checkout (assets/js/paypal-checkout.js,
 * window.SitePayPal): the booking code, the payment description, the amount sent to PayPal, what is read back
 * from a capture, and the email sent to the team through Formspree. The script runs in a sandbox with an empty
 * document, so only the helpers load (the checkout wiring needs the booking form). The last tests check the build:
 * the sandbox Client ID guard, the booking-terms line of the pay block and the PayPal paragraph of the privacy policy.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

test('capture info reads what PayPal charged and survives missing fields', () => {
  const pp = loadSitePayPal();
  const order = {
    payer: { email_address: 'ana@example.com', name: { given_name: 'Ana', surname: 'Pérez' } },
    purchase_units: [{
      invoice_id: 'PCE-1203-AAAA',
      payments: { captures: [{
        id: '8AB12345CD678901E', status: 'PENDING', amount: { currency_code: 'USD', value: '112.50' },
        status_details: { reason: 'PENDING_REVIEW' }
      }] }
    }]
  };
  assert.deepEqual({ ...pp.captureInfo(order) }, {
    transaction: '8AB12345CD678901E', status: 'PENDING', payerEmail: 'ana@example.com', payerName: 'Ana Pérez',
    amount: 112.5, currency: 'USD', invoiceId: 'PCE-1203-AAAA', pendingReason: 'PENDING_REVIEW'
  });
  const nothing = {
    transaction: '', status: '', payerEmail: '', payerName: '', amount: null, currency: '', invoiceId: '', pendingReason: ''
  };
  assert.deepEqual({ ...pp.captureInfo({}) }, nothing);
  assert.deepEqual({ ...pp.captureInfo(null) }, nothing);
  const odd = { purchase_units: [{ payments: { captures: [{ amount: { currency_code: 'USD', value: 'abc' } }] } }] };
  assert.equal(pp.captureInfo(odd).amount, null, 'a value that is not a number became an amount');
});

test('paid lines: what PayPal charged, the balance, then PayPal details; warnings only when something is off', () => {
  const pp = loadSitePayPal();
  const paid = {
    amountText: 'US$97.50', kindText: 'depósito 50 %', paidFor: 'Damajagua · 3 de diciembre de 2026 · 3 personas',
    balanceText: 'US$97.50', transaction: 'T1', code: 'PCE-1203-AAAA', payerName: 'Ana Pérez',
    payerEmail: 'ana@example.com', status: 'COMPLETED'
  };
  const label = (key) => key;
  assert.deepEqual(Array.from(pp.paidLines(paid, label)), [
    '• booking.msg.paid: US$97.50 (depósito 50 %)',
    '• booking.msg.paidFor: Damajagua · 3 de diciembre de 2026 · 3 personas',
    '• booking.msg.balanceDue: US$97.50',
    '• booking.msg.transaction: T1',
    '• booking.msg.code: PCE-1203-AAAA',
    '• booking.msg.payerName: Ana Pérez',
    '• booking.msg.payerEmail: ana@example.com'
  ]);
  const odd = Array.from(pp.paidLines({
    ...paid, expectedText: 'US$195', balanceText: '', payerName: '', payerEmail: '', status: 'PENDING', pendingReason: 'PENDING_REVIEW'
  }, label));
  assert.deepEqual(odd, [
    '• booking.msg.paid: US$97.50 (depósito 50 %)',
    '• ⚠ booking.msg.amountMismatch: US$195',
    '• booking.msg.paidFor: Damajagua · 3 de diciembre de 2026 · 3 personas',
    '• booking.msg.transaction: T1',
    '• booking.msg.code: PCE-1203-AAAA',
    '• booking.msg.paymentStatus: PENDING (PENDING_REVIEW)'
  ]);
});

test('email payload: booking message, the payment lines, then the note for the team; reply-to only with an email', () => {
  const pp = loadSitePayPal();
  assert.deepEqual({ ...pp.emailPayload({ subject: 'S', message: 'M', lines: ['a', 'b'], note: 'N', payerEmail: 'x@y.com' }) },
    { _subject: 'S', message: 'M\n\na\nb\n\nN', email: 'x@y.com' });
  assert.equal(pp.emailPayload({ subject: 'S', message: 'M', lines: ['a'], payerEmail: '' }).message, 'M\n\na');
  assert.equal('email' in pp.emailPayload({ subject: 'S', message: 'M', lines: [], payerEmail: '' }), false);
});

/**
 * A sessionStorage stand-in backed by a Map, so a test can "reload the page" with the same storage.
 * @param {Map<string, string>} [items] - Stored items (shared between two loads to simulate a reload).
 * @returns {{getItem: function, setItem: function, removeItem: function, items: Map}} The storage.
 */
function memoryStorage(items = new Map()) {
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); }
  };
}

/**
 * Runs assets/js/paypal-checkout.js against stubs of the page, booking.js (SiteBooking), PayPal's SDK and fetch,
 * so the checkout wiring can be driven step by step: the form coming into view, PayPal's callbacks, Formspree.
 * @param {{blockHidden?: boolean, fetch?: function(): Promise, storage?: object}} [options] - Pay block hidden at
 *   start; fetch result; sessionStorage stand-in (memoryStorage()).
 * @returns {object} { log, state (mutable booking), block, slot, storage, listeners, intersect(), mutate(),
 *   loadSdk(), actions() }.
 */
function loadCheckout(options = {}) {
  const log = { statuses: [], tones: [], paid: [], paidOptions: [], emails: [], scripts: [], timers: [], orders: [], captures: 0, gets: 0, enabled: 0, resolved: 0, rejected: 0, restarts: 0 };
  const block = { hidden: Boolean(options.blockHidden) };
  const slot = { textContent: '', hidden: false, children: [], appendChild(child) { this.children.push(child); } };
  const observers = {};
  const listeners = {};
  const storage = options.storage || memoryStorage();
  const state = {
    payment: { kind: 'deposit', amount: 112.5, percent: 50, total: 225 },
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
      markPaid: (result, markOptions) => { log.paid.push(result); log.paidOptions.push(markOptions || {}); },
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
    sessionStorage: storage,
    addEventListener: (type, listener) => { listeners[type] = listener; },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    URLSearchParams,
    JSON,
    MutationObserver: class { constructor(callback) { observers.mutation = callback; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(callback) { observers.intersection = callback; } observe() {} disconnect() {} }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/paypal-checkout.js'), 'utf8'), context);
  const checkout = {
    log, state, block, slot, storage, listeners,
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
    /**
     * PayPal's actions object.
     * @param {function(): Promise} [capture] - What actions.order.capture() returns (default: COMPLETED).
     * @param {function(): Promise} [get] - What actions.order.get() returns (default: rejects).
     */
    actions: (capture, get) => ({
      resolve: () => { log.resolved++; return Promise.resolve(); },
      reject: () => { log.rejected++; return Promise.resolve(); },
      restart: () => { log.restarts++; return Promise.resolve(); },
      order: {
        create: (order) => { log.orders.push(order); return Promise.resolve('ORDER-' + log.orders.length); },
        capture: () => { log.captures++; return (capture || (() => Promise.resolve(captured('COMPLETED'))))(); },
        get: () => { log.gets++; return (get || (() => Promise.reject(new Error('no answer'))))(); }
      }
    })
  };
  return checkout;
}

/**
 * A captured PayPal order, as actions.order.capture() resolves it.
 * @param {string} status - Capture status.
 * @param {string} [value] - Amount PayPal charged (USD), "112.50" by default.
 * @returns {object} Order with one capture (amount, invoice) and a payer.
 */
function captured(status, value = '112.50') {
  return {
    payer: { email_address: 'ana@example.com', name: { given_name: 'Ana', surname: 'Pérez' } },
    purchase_units: [{ payments: { captures: [{ id: 'TX1', status, amount: { currency_code: 'USD', value } }] } }]
  };
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
  checkout.state.payment = { kind: 'total', amount: 450, percent: 50, total: 450 };
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  assert.equal(checkout.log.captures, 0, 'the old amount was captured for a changed booking');
  assert.equal(checkout.log.emails.length, 0);
  assert.equal(checkout.log.paid.length, 0);
  assert.equal(checkout.log.statuses.at(-1), 'booking.pay.changed');
  await buttons.onClick({}, checkout.actions());
  assert.equal(checkout.log.resolved, 1, 'the visitor cannot pay the new booking');

  // Same amount but another group size or date: still another booking.
  const people = loadCheckout();
  const peopleButtons = readyButtons(people);
  const peopleOrder = await peopleButtons.createOrder({}, people.actions());
  people.state.booking.people = '4 personas';
  await peopleButtons.onApprove({ orderID: peopleOrder }, people.actions());
  assert.equal(people.log.captures, 0, 'a payment for 3 people was captured for 4');
});

test('fixing the name or the ship while paying does not cancel the payment, and the email carries the fix', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  checkout.state.booking.message = 'Booking message, name fixed';
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  assert.equal(checkout.log.captures, 1);
  assert.ok(checkout.log.emails[0].body.message.startsWith('Booking message, name fixed\n\n'));
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

test('PayPal loads in USD for a capture, with no locale: PayPal picks the buyer language and card country', () => {
  const checkout = loadCheckout();
  checkout.intersect();
  const src = checkout.log.scripts[0].src;
  assert.match(src, /^https:\/\/www\.paypal\.com\/sdk\/js\?client-id=A{20}&/);
  assert.match(src, /[?&]currency=USD(&|$)/);
  assert.match(src, /[?&]intent=capture(&|$)/);
  assert.match(src, /[?&]components=buttons(&|$)/);
  assert.doesNotMatch(src, /locale=/, 'a fixed locale makes the card form default to Spain, France or Italy');
});

test('the order sent to PayPal: chosen amount in USD, booking code as invoice, what it pays for, no shipping', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  await buttons.createOrder({}, checkout.actions());
  const order = checkout.log.orders[0];
  assert.equal(order.intent, 'CAPTURE');
  assert.equal(order.application_context.shipping_preference, 'NO_SHIPPING');
  assert.equal(order.application_context.brand_name, 'Puerto Plata Cruise Excursions');
  const unit = order.purchase_units[0];
  assert.deepEqual({ ...unit.amount }, { currency_code: 'USD', value: '112.50' });
  assert.match(unit.invoice_id, /^PCE-1203-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(unit.description, 'Damajagua · 3 de diciembre de 2026 · 3 personas · booking.msg.paidDeposit');

  checkout.state.payment = { kind: 'total', amount: 225, percent: 50, total: 225 };
  await buttons.createOrder({}, checkout.actions());
  assert.equal(checkout.log.orders[1].purchase_units[0].amount.value, '225.00');
  assert.ok(checkout.log.orders[1].purchase_units[0].description.endsWith('booking.msg.paidTotal'));
});

test('the PayPal description names the cruise ship when given, last, so a long name is what gets cut', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  checkout.state.booking.ship = 'Wonder of the Seas';
  await buttons.createOrder({}, checkout.actions());
  assert.equal(checkout.log.orders[0].purchase_units[0].description,
    'Damajagua · 3 de diciembre de 2026 · 3 personas · booking.msg.paidDeposit · booking.msg.ship: Wonder of the Seas');

  checkout.state.booking.ship = 'S'.repeat(80);
  await buttons.createOrder({}, checkout.actions());
  const cut = checkout.log.orders[1].purchase_units[0].description;
  assert.equal(Array.from(cut).length, 127);
  assert.ok(cut.startsWith('Damajagua · 3 de diciembre de 2026 · 3 personas · booking.msg.paidDeposit · booking.msg.ship: S'));
  assert.ok(cut.endsWith('…'));

  checkout.state.booking.ship = '';
  await buttons.createOrder({}, checkout.actions());
  assert.ok(checkout.log.orders[2].purchase_units[0].description.endsWith('booking.msg.paidDeposit'), 'no ship, no label');
});

test('retries for the same day keep the booking code, so PayPal can refuse a second payment', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const first = await buttons.createOrder({}, checkout.actions());
  buttons.onCancel({ orderID: first });
  await buttons.createOrder({}, checkout.actions());
  const codes = checkout.log.orders.map((order) => order.purchase_units[0].invoice_id);
  assert.equal(codes[0], codes[1]);
  checkout.state.booking.dateIso = '2026-12-04';
  await buttons.createOrder({}, checkout.actions());
  assert.match(checkout.log.orders[2].purchase_units[0].invoice_id, /^PCE-1204-/);
});

test('closing PayPal or a PayPal error lets the visitor pay again, even after a capture that never answered', async () => {
  for (const close of ['onCancel', 'onError']) {
    const checkout = loadCheckout();
    const buttons = readyButtons(checkout);
    const orderId = await buttons.createOrder({}, checkout.actions());
    // PayPal restarts its own flow after a declined card: the capture promise never settles.
    buttons.onApprove({ orderID: orderId }, checkout.actions(() => new Promise(() => {})));
    await buttons.onClick({}, checkout.actions());
    assert.equal(checkout.log.rejected, 1);
    buttons[close]({ orderID: orderId });
    await buttons.onClick({}, checkout.actions());
    assert.equal(checkout.log.resolved, 1, close + ' left the pay button stuck on "processing"');
  }
});

test('when the capture answer is lost, PayPal is asked before showing an error', async () => {
  const lost = () => Promise.reject(new Error('Failed to fetch'));

  const charged = loadCheckout();
  let buttons = readyButtons(charged);
  let orderId = await buttons.createOrder({}, charged.actions());
  await buttons.onApprove({ orderID: orderId }, charged.actions(lost, () => Promise.resolve(captured('COMPLETED'))));
  assert.equal(charged.log.gets, 1);
  assert.equal(charged.log.emails.length, 1, 'a charged payment was not reported');
  assert.equal(charged.log.paid[0].key, 'booking.pay.done');

  const notCharged = loadCheckout();
  buttons = readyButtons(notCharged);
  orderId = await buttons.createOrder({}, notCharged.actions());
  const approved = () => Promise.resolve({ status: 'APPROVED', purchase_units: [{}] });
  await assert.rejects(buttons.onApprove({ orderID: orderId }, notCharged.actions(lost, approved)));
  assert.equal(notCharged.log.paid.length, 0);
  await buttons.onClick({}, notCharged.actions());
  assert.equal(notCharged.log.resolved, 1, 'the visitor cannot try again');
});

test('the email reports what PayPal charged, the balance due, and warns when the amount is not the expected one', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const orderId = await buttons.createOrder({}, checkout.actions());
  await buttons.onApprove({ orderID: orderId }, checkout.actions());
  let message = checkout.log.emails[0].body.message;
  assert.ok(message.includes('• booking.msg.paid: US$112.5 (booking.msg.paidDeposit)'));
  assert.ok(message.includes('• booking.msg.balanceDue: US$112.5'));
  assert.ok(message.includes('• booking.msg.payerName: Ana Pérez'));
  assert.ok(!message.includes('booking.msg.amountMismatch'));
  assert.ok(message.endsWith('\n\nbooking.msg.verify'), 'the team is not reminded to check PayPal');
  assert.match(checkout.log.emails[0].body._subject, /^booking\.msg\.paidSubject$/);

  const tampered = loadCheckout();
  const tamperedButtons = readyButtons(tampered);
  const tamperedOrder = await tamperedButtons.createOrder({}, tampered.actions());
  await tamperedButtons.onApprove({ orderID: tamperedOrder }, tampered.actions(() => Promise.resolve(captured('COMPLETED', '1.00'))));
  message = tampered.log.emails[0].body.message;
  assert.ok(message.includes('• booking.msg.paid: US$1 ('), 'the email shows the expected amount instead of the charged one');
  assert.ok(message.includes('• ⚠ booking.msg.amountMismatch: US$112.5'));
  assert.ok(message.includes('• booking.msg.balanceDue: US$224'));
  assert.ok(!tampered.log.paid[0].lines.some((line) => line.includes('booking.msg.verify')), 'the team note went into the visitor messages');
});

test('the paid email waits in sessionStorage until Formspree takes it, and goes again after a reload', async () => {
  const items = new Map();
  const offline = loadCheckout({ storage: memoryStorage(items), fetch: () => Promise.resolve({ ok: false }) });
  const buttons = readyButtons(offline);
  const orderId = await buttons.createOrder({}, offline.actions());
  await buttons.onApprove({ orderID: orderId }, offline.actions());
  assert.equal(offline.log.paid[0].key, 'booking.pay.emailFailed');
  assert.equal(items.size, 1, 'the unsent email was not kept');

  const reloaded = loadCheckout({ storage: memoryStorage(items) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reloaded.log.emails.length, 1, 'the kept email was not sent again');
  assert.equal(reloaded.log.paid[0].key, 'booking.pay.done');
  assert.equal(reloaded.log.paidOptions[0].quiet, true, 'the reload stole the focus');
  assert.equal(items.size, 0);

  const sent = loadCheckout();
  const sentButtons = readyButtons(sent);
  const sentOrder = await sentButtons.createOrder({}, sent.actions());
  await sentButtons.onApprove({ orderID: sentOrder }, sent.actions());
  assert.equal(sent.storage.items.size, 0, 'a sent email was kept');
});

test('leaving the page is questioned only while a payment is being captured or reported', async () => {
  const checkout = loadCheckout();
  const buttons = readyButtons(checkout);
  const leave = () => { const event = { prevented: false, preventDefault() { this.prevented = true; } }; checkout.listeners.beforeunload(event); return event.prevented; };
  assert.equal(leave(), false);
  const orderId = await buttons.createOrder({}, checkout.actions());
  let finishCapture;
  const approving = buttons.onApprove({ orderID: orderId }, checkout.actions(() => new Promise((resolve) => { finishCapture = resolve; })));
  assert.equal(leave(), true, 'the visitor can close the tab in the middle of the capture without a warning');
  finishCapture(captured('COMPLETED'));
  await approving;
  assert.equal(leave(), false, 'the warning stays after the payment is done');
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

/** One build of the whole site into a temporary folder, shared by the tests that read generated pages. */
let siteBuild = null;

/**
 * Builds the site once (later calls reuse it); the folder is removed after the tests.
 * @returns {Promise<{errors: string[], read: (file: string) => string}>} Build errors and a reader of its files.
 */
function builtSite() {
  if (!siteBuild) {
    siteBuild = (async () => {
      const { build } = await import('../build.mjs');
      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pce-'));
      const result = await build({ root: ROOT, outDir });
      return { outDir, errors: result.errors, read: (file) => fs.readFileSync(path.join(outDir, file), 'utf8') };
    })();
  }
  return siteBuild;
}

after(async () => {
  if (siteBuild) fs.rmSync((await siteBuild).outDir, { recursive: true, force: true });
});

test('the pay block links the booking terms, cancellation policy included (four languages)', async () => {
  const site = await builtSite();
  assert.deepEqual(site.errors, []);
  const english = ['By paying you accept our booking terms, including the cancellation policy.', '/booking-terms/'];
  const spanish = ['Al pagar aceptas nuestros términos de reserva, incluida la política de cancelación.', '/es/terminos-de-reserva/'];
  // Page → [sentence, page its link opens]. French and Italian link the English terms (no FR/IT version).
  const pages = {
    'index.html': english,
    'es/index.html': spanish,
    'fr/index.html': ['En payant, vous acceptez nos conditions de réservation, y compris la politique d’annulation.', '/booking-terms/'],
    'it/index.html': ['Pagando accetti i nostri termini di prenotazione, inclusa la politica di cancellazione.', '/booking-terms/'],
    'puerto-plata-catamaran/index.html': english,
    'es/catamaran-puerto-plata/index.html': spanish
  };
  for (const [file, [sentence, target]] of Object.entries(pages)) {
    const html = site.read(file);
    const notes = [...html.matchAll(/<p class="estimate__pay-note">([\s\S]*?)<\/p>/g)];
    const terms = notes.find((note) => note[1].includes('<a '));
    assert.ok(terms, `${file}: terms line in the pay block`);
    assert.ok(terms.index > html.indexOf('data-paypal-button'), `${file}: under the PayPal button`);
    assert.equal(terms[1].replace(/<[^>]+>/g, ''), sentence, file);
    const href = terms[1].match(/<a href="([^"]*)"/)[1];
    const pageUrl = `https://popcruiseexcursions.com/${file.replace(/index\.html$/, '')}`;
    assert.equal(new URL(href, pageUrl).pathname, target, `${file}: link`);
  }
});

test('the privacy policy tells what paying with PayPal shares and keeps (English and Spanish)', async () => {
  const site = await builtSite();
  assert.deepEqual(site.errors, []);
  // PayPal's own script and cookies, the paid booking emailed through Formspree, the payment status in the tab.
  const expected = {
    'privacy/index.html': ['PayPal’s script loads', 'its own cookies', 'through Formspree', 'session storage', 'no cookies of its own'],
    'es/privacidad/index.html': ['el script de PayPal', 'sus propias cookies', 'a través de Formspree', 'almacenamiento de sesión', 'cookies propias']
  };
  for (const [file, phrases] of Object.entries(expected)) {
    const html = site.read(file);
    for (const phrase of phrases) assert.ok(html.includes(phrase), `${file}: "${phrase}"`);
  }
});
