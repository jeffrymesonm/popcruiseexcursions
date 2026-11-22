/**
 * legal.js — English copy of the legal pages: the privacy policy (src/privacy.html) and the booking terms
 * (src/booking-terms.html).
 *
 * Build-only dictionary: tools/build.mjs loads it after assets/js/translations.js and merges it into the
 * `en` dictionary; browsers never download it (the pages are generated already translated). Spanish lives
 * in the two templates. Keys: privacy.* (privacy policy), terms.* (booking terms), legal.* (shared by both);
 * the breadcrumbs reuse port.crumbs and port.home (src/i18n/ports.js).
 * Confirmed facts only: FAQ 1, 3, 7, 8 and 11 of the home page, and what the site's code does. No legal
 * name, tax ID (RNC) or address, and no rules on weather, no-shows, minors, liability or how and when
 * refunds are paid, until the client confirms them. When a text changes, change it in both languages and
 * update its "Last updated" date (privacy.updated, terms.updated).
 */
window.SITE_TRANSLATIONS = window.SITE_TRANSLATIONS || {};
window.SITE_TRANSLATIONS.en = Object.assign(window.SITE_TRANSLATIONS.en || {}, {
  // Shared by both pages: "… on WhatsApp at <number> or email <address>."
  'legal.orEmail': 'or email',

  // Privacy policy
  'privacy.meta.title': 'Privacy policy | Puerto Plata Cruise Excursions',
  'privacy.meta.description': 'What the Puerto Plata Cruise Excursions booking form asks for, where it goes, and how to ask us to delete it.',
  'privacy.h1': 'Privacy policy',
  'privacy.intro': 'Puerto Plata Cruise Excursions runs shore excursions in Puerto Plata, Dominican Republic, for cruise passengers. This page explains what personal data we use when you book, why, and who it is shared with. If you have questions, message us on WhatsApp at',
  'privacy.data.title': 'What we ask for',
  'privacy.data.text': 'The booking form asks for the tour, the date, how many people, your name and, if you like, the name of your cruise ship, plus the tour options (zipline, boat, vehicle or transport). We only ask for what we need to organize your tour and get you back to your ship on time.',
  'privacy.channels.title': 'How your booking reaches us',
  'privacy.channels.text': 'The form does not send anything on its own. “Book on WhatsApp” opens WhatsApp with your booking already written, and you choose to send it; “Book by email” opens your email app with a message to popcruiseexcursions@gmail.com. Your booking then stays in our WhatsApp chat (a Meta service) or in our email (a Gmail account, by Google), which are also subject to those services’ policies.',
  'privacy.use.title': 'What we use it for',
  'privacy.use.text': 'We use your data only to confirm availability, organize the tour, arrange the meeting point and time around your ship, and handle your deposit, the remaining payment and any cancellation or refund. We don’t sell it or use it for advertising.',
  'privacy.payments.title': 'Payments',
  'privacy.payments.text': 'Deposits are paid by PayPal, Zelle or Cash App, and the rest in person on the day of the tour. Each payment service handles your payment details under its own privacy policy; we never see or store your card details.',
  'privacy.payments.paypal': 'If you pay with PayPal from the booking form, PayPal processes the payment: when you reach the form, PayPal’s script loads, and it may use its own cookies to prevent fraud. Once you pay, your booking, the amount, the booking code, the transaction number and the name and email of your PayPal account reach us by email through Formspree (United States). While the tab stays open, your browser keeps the payment status (session storage), so reloading the page doesn’t ask you to pay again and the notice still reaches us if it failed to go out.',
  'privacy.browser.title': 'What your browser keeps',
  'privacy.browser.text': 'The site sets no cookies of its own, and uses no analytics and no advertising. If you choose a language, your browser remembers it (local storage) to show you the site in that language next time; you can clear it in your browser settings. Fonts, images and videos are served from our own site.',
  'privacy.hosting.title': 'Where the site is hosted',
  'privacy.hosting.text': 'The site is hosted on GitHub Pages (GitHub, Inc., United States). Like any web server, GitHub logs technical data about each visit, such as the IP address, to keep the service secure.',
  'privacy.retention.title': 'How long',
  'privacy.retention.text': 'We keep your booking messages for as long as we need them to run your tour and meet our accounting and legal obligations.',
  'privacy.rights.title': 'Your rights',
  'privacy.rights.text': 'You can ask us to see, correct or delete your data by messaging us on WhatsApp or by email. We will answer as soon as possible, under the applicable law (in the Dominican Republic, Law 172-13 on personal data protection; if you visit from the European Union, the General Data Protection Regulation).',
  'privacy.updated': 'Last updated: November 22, 2026.',

  // Booking terms
  'terms.meta.title': 'Booking terms | Puerto Plata Cruise Excursions',
  'terms.meta.description': 'How booking works at Puerto Plata Cruise Excursions: prices in US dollars, deposit, paying the rest and the cancellation policy.',
  'terms.h1': 'Booking terms',
  'terms.intro': 'These are the terms for bookings with Puerto Plata Cruise Excursions. If anything is unclear, message us on WhatsApp at',
  'terms.introEnd': 'before you pay.',
  'terms.book.title': 'How to book',
  'terms.book.text': 'Send us your booking on WhatsApp or by email from the form. We confirm availability, the meeting point and the time on WhatsApp or by email. Catamarans and yachts depend on the boat’s availability: message us first and pay the deposit only once we confirm.',
  'terms.prices.title': 'Prices',
  'terms.prices.text': 'Prices are in US dollars (US$). On the excursions, the price per person depends on how many travel together: 1 to 2, 3 to 5, 6 to 14 or 15 to 50 people. Buggies and ATVs are priced per vehicle. Catamarans and yachts are rented whole for a fixed price for up to 15 or 20 people, depending on the boat, and each extra person pays an extra fee. The price the form shows is an estimate until we confirm your booking.',
  'terms.transport.title': 'Transport',
  'terms.transport.text': 'The excursions include round-trip transport from the port where your cruise docks, Amber Cove or Taíno Bay. On catamarans and yachts, transport to Sosúa beach is optional and priced by group size.',
  'terms.payment.title': 'Deposit and payment',
  'terms.payment.text': 'Your booking is secured with a deposit by PayPal, Zelle or Cash App: 50% of the total on the excursions and a fixed amount on catamarans and yachts (shown on each boat’s card). The rest is paid in person on the day of the tour. On the excursions you can also pay the full price in advance.',
  'terms.cancel.title': 'Cancellation and refunds',
  'terms.cancel.text': 'If you cancel 10 or more days ahead, we refund 100% of what you paid; with less than 10 days, 50%. If your cruise ship doesn’t reach Puerto Plata, we refund 90%. To cancel, message us on WhatsApp or by email.',
  'terms.timing.title': 'Timing and your ship',
  'terms.timing.text': 'We plan each tour around your ship’s departure time. When you book, tell us your ship’s name and your all-aboard time.',
  'terms.updated': 'Last updated: November 22, 2026.'
});
