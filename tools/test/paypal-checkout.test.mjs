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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** PayPal sandbox Client ID: right for testing, never on the published site with a Formspree endpoint set. */
const SANDBOX_CLIENT_ID = 'ATWrAKuH6y-bBzs0Yt6BfjiYZxCi4w4iZhWipC_AXED7uRRuCZUM1wwiY9GYU8SztF-B0DhgfST6DSl7';

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
    amountText: 'US$97.50', kindText: 'depósito 50 %', transaction: 'T1', code: 'PCE-1203-AAAA',
    payerEmail: 'ana@example.com', status: 'COMPLETED'
  };
  assert.deepEqual(Array.from(pp.paidLines(paid, (key) => key)), [
    '• booking.msg.paid: US$97.50 (depósito 50 %)', '• booking.msg.transaction: T1',
    '• booking.msg.code: PCE-1203-AAAA', '• booking.msg.payerEmail: ana@example.com'
  ]);
  const pending = pp.paidLines({ ...paid, payerEmail: '', status: 'PENDING' }, (key) => key);
  assert.equal(pending.length, 4);
  assert.equal(pending[3], '• booking.msg.paymentStatus: PENDING');
});

test('email payload: booking message, then the payment lines; reply-to only with an email', () => {
  const pp = loadSitePayPal();
  assert.deepEqual({ ...pp.emailPayload({ subject: 'S', message: 'M', lines: ['a', 'b'], payerEmail: 'x@y.com' }) },
    { _subject: 'S', message: 'M\n\na\nb', email: 'x@y.com' });
  assert.equal('email' in pp.emailPayload({ subject: 'S', message: 'M', lines: [], payerEmail: '' }), false);
});

test('the pay block is configured, and never with the sandbox Client ID once Formspree is set', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/partials/booking.html'), 'utf8');
  const block = html.match(/<div\b[^>]*\sdata-paypal(?=[\s>])[^>]*>/);
  assert.ok(block, 'src/partials/booking.html has no pay block [data-paypal]');
  const attribute = (name) => (block[0].match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
  const clientId = attribute('data-paypal-client-id');
  const endpoint = attribute('data-formspree-endpoint');
  assert.equal(typeof clientId, 'string', 'the pay block has no data-paypal-client-id');
  assert.equal(typeof endpoint, 'string', 'the pay block has no data-formspree-endpoint');
  if (endpoint.trim()) {
    assert.notEqual(clientId.trim(), SANDBOX_CLIENT_ID,
      'Formspree is set but the Client ID is still the sandbox one: put the live Client ID before publishing');
  }
});
