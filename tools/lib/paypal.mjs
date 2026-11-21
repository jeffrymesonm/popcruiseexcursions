/**
 * paypal.mjs — Checks the PayPal settings of the booking form (src/partials/booking.html), so the build itself
 * refuses to publish fake payments: the sandbox Client ID only takes test payments, and with a Formspree endpoint
 * set the pay block shows on the live site. Used by tools/build.mjs (a failed check fails the build) and by
 * tools/test/paypal-checkout.test.mjs.
 */

/** PayPal sandbox Client ID: right for testing, never on the published site with a Formspree endpoint set. */
export const SANDBOX_CLIENT_ID = 'ATWrAKuH6y-bBzs0Yt6BfjiYZxCi4w4iZhWipC_AXED7uRRuCZUM1wwiY9GYU8SztF-B0DhgfST6DSl7';

/**
 * Reads the PayPal settings of the pay block.
 * @param {string} html - Booking form markup (src/partials/booking.html).
 * @returns {{clientId: string, endpoint: string}|null} The two attributes (trimmed, '' when missing), or null
 *   when there is no [data-paypal] block.
 */
export function readPayPalConfig(html) {
  const block = html.match(/<div\b[^>]*\sdata-paypal(?=[\s>])[^>]*>/);
  if (!block) return null;
  const attribute = (name) => ((block[0].match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1] || '').trim();
  return { clientId: attribute('data-paypal-client-id'), endpoint: attribute('data-formspree-endpoint') };
}

/**
 * Lists what is wrong with the PayPal settings of the booking form.
 * @param {string} html - Booking form markup (src/partials/booking.html).
 * @returns {string[]} Error messages; empty when the block exists and is not the sandbox ID with Formspree set.
 */
export function paypalConfigErrors(html) {
  const config = readPayPalConfig(html);
  if (!config) return ['src/partials/booking.html: no pay block [data-paypal]'];
  if (config.endpoint && config.clientId === SANDBOX_CLIENT_ID) {
    return ['src/partials/booking.html: Formspree is set but the PayPal Client ID is the sandbox one (test '
      + 'payments only): put the live Client ID before publishing'];
  }
  return [];
}
