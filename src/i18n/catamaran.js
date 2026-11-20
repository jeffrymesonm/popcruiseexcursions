/**
 * catamaran.js — English copy of the private catamaran and yacht page (src/catamaran.html).
 *
 * Build-only dictionary: tools/build.mjs loads it after assets/js/translations.js and merges it into
 * the `en` dictionary; browsers never download it (the page is generated already translated).
 * Spanish lives in the template. Keys: cat.*. The boats block, the booking form and shared labels
 * (boats.*, booking.*, faq.2, faq.7, port.*) come from assets/js/translations.js and src/i18n/ports.js.
 * Facts only from what the client confirmed: Sosúa departure, optional round-trip transport, whole boat
 * (not per person), 4 hours, deposit per boat; no amounts here (prices live in the price tables).
 */
window.SITE_TRANSLATIONS = window.SITE_TRANSLATIONS || {};
window.SITE_TRANSLATIONS.en = Object.assign(window.SITE_TRANSLATIONS.en || {}, {
  'cat.meta.title': 'Private Catamaran & Yacht Charter in Puerto Plata',
  'cat.meta.description': 'Charter a private catamaran or yacht in Puerto Plata: the whole boat for your group, not per person, for 4 hours. 6 boats that leave from Sosúa.',
  'cat.h1': 'Private Catamaran and Yacht Charters in Puerto Plata',
  'cat.lead': 'Charter the whole boat just for your group, not per person: 4 hours sailing the Puerto Plata coast on one of our 4 catamarans or 2 yachts. Boats leave from Sosúa beach, and we plan the day around your cruise ship’s schedule.',
  'cat.boats.lead': 'Tap a boat to see its photos, what’s included and its price.',
  'cat.how.title': 'How booking a boat works',
  'cat.how.1': 'Choose the boat and the date, and send us your booking on WhatsApp or by email with your ship’s name and all-aboard time.',
  'cat.how.2': 'You book with a deposit; each boat’s amount is in its details.',
  'cat.how.3': 'Boats leave from Sosúa beach, 45 minutes from Amber Cove and 30 from Taíno Bay. Add round-trip transport from the port if you like: it’s priced by group size.',
  'cat.how.4': 'We schedule the 4-hour trip around your ship’s times so you’re back on time.',
  'cat.faq.title': 'Boat charter questions',
  'cat.faq.1.q': 'Is the price per person or for the boat?',
  'cat.faq.1.a': 'For the whole boat. Unlike shared boat trips, which are sold per person, you charter the boat just for your group for 4 hours. The price covers up to 15 or 20 people, depending on the boat, and each additional person pays extra. Each boat’s price is in its details.',
  'cat.faq.2.q': 'Where do the boats leave from? Is transport included?',
  'cat.faq.2.a': 'From Sosúa beach, about 45 minutes from Amber Cove port and 30 minutes from Taíno Bay. Round-trip transport from the port is optional: add it in the booking form; it’s priced by group size (see the table with the boats).',
  'cat.faq.3.q': 'How do I book a boat?',
  'cat.faq.3.a': 'Choose the boat, fill in the booking form and send it to us on WhatsApp or by email: we write it up for you, ready to send. You book with a deposit; each boat’s amount is in its details. Tell us your ship’s name and all-aboard time.',
  'cat.faq.4.q': 'Are the boats good for bachelorette parties, birthdays or weddings?',
  'cat.faq.4.a': 'Yes. Since the boat is just for your group, it’s a great way to celebrate: bachelorette parties, birthdays, small weddings or a family day. On the Libreterre we can help with decorations, cake, catering, photos and video (on request).',
  'cat.cta.title': 'Not sure which boat to choose? Message us your date and how many of you there are.'
});
