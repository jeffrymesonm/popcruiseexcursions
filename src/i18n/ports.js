/**
 * ports.js — English copy of the cruise-port landing pages (src/amber-cove.html, src/taino-bay.html).
 *
 * Build-only dictionary: tools/build.mjs loads it after assets/js/translations.js and merges it into
 * the `en` dictionary; browsers never download it (the port pages are generated already translated).
 * Spanish lives in the two templates. Keys: port.* (shared by both pages), port.ac.* (Amber Cove),
 * port.tb.* (Taíno Bay). Shared tour names and labels come from assets/js/translations.js.
 * Travel times are approximate public estimates (Sosúa times confirmed by the client); keep them as
 * ranges with "about" until the client confirms them.
 */
window.SITE_TRANSLATIONS = window.SITE_TRANSLATIONS || {};
window.SITE_TRANSLATIONS.en = Object.assign(window.SITE_TRANSLATIONS.en || {}, {
  // Shared by both port pages
  'port.crumbs': 'Breadcrumb',
  'port.home': 'Home',
  'port.cta.tours': 'See the tours',
  'port.tours.lead': 'Prices in US dollars. Travel times are approximate and depend on traffic.',
  'port.details': 'See details',
  'port.time.confirm': 'Travel time: we confirm it when you book',
  'port.pickup.tag': 'How it works',
  'port.pickup.title': 'We pick you up at the port',
  'port.pickup.1': 'Book on WhatsApp and tell us your ship’s name and all-aboard time.',
  'port.pickup.2': 'We confirm the exact meeting point at the port on WhatsApp.',
  'port.pickup.3': 'We plan the tour around your ship’s schedule and bring you back to the port.',
  'port.pickup.4': 'For catamarans and yachts, transport to Sosúa is optional: add it when you book; it’s priced by group size.',
  'port.cta.tag': 'Book on WhatsApp',

  // Amber Cove
  'port.ac.meta.title': 'Amber Cove Shore Excursions | Puerto Plata Cruise Excursions',
  'port.ac.meta.description': 'Shore excursions from Amber Cove, Puerto Plata: Damajagua waterfalls, a city tour, a Playa Dorada beach day and private boats. Pickup at the cruise port.',
  'port.ac.h1': 'Amber Cove Shore Excursions',
  'port.ac.lead': 'Amber Cove is the cruise port Carnival Corporation built on Maimón Bay, about 12 km (7.5 miles) from downtown Puerto Plata. We pick you up at the port and plan your tour around your ship’s schedule.',
  'port.ac.tours.title': 'Things to do from Amber Cove',
  'port.ac.time.damajagua': 'About 30–45 min from Amber Cove',
  'port.ac.time.city': 'Downtown is 15–20 min away',
  'port.ac.time.beach': 'Playa Dorada is about 25–30 min away',
  'port.ac.time.catamaran': 'Boats leave from Sosúa, 45 min away (round-trip transport optional)',
  'port.ac.faq.title': 'Amber Cove questions',
  'port.ac.faq.1.q': 'Which cruise lines dock at Amber Cove?',
  'port.ac.faq.1.a': 'Mostly Carnival Corporation brands: Carnival, Princess, Holland America, P&O and other lines in the group. Other cruise lines call occasionally, so check your cruise itinerary. If your ship docks at Taíno Bay instead, we pick you up there too.',
  'port.ac.faq.2.q': 'How far is Amber Cove from downtown Puerto Plata?',
  'port.ac.faq.2.a': 'About 12 km (7.5 miles), a 15–20 minute drive. It is not walkable: the port sits on Maimón Bay, west of the city. Round-trip transport from the port is included in our other tours; for the catamarans and yachts it’s optional.',
  'port.ac.faq.3.q': 'How far are the Damajagua waterfalls from Amber Cove?',
  'port.ac.faq.3.a': 'About 30–45 minutes by road, depending on traffic. The 27 Charcos de Damajagua (Damajagua Falls) are near Imbert, south of Puerto Plata. We pick you up at the port and bring you back, and the tour includes a buffet lunch.',
  'port.ac.faq.4.q': 'Can I book a tour that my cruise line doesn’t sell?',
  'port.ac.faq.4.a': 'Yes. You can leave the port during your call and take your tour with a local operator like us. Tell us your ship’s name and all-aboard time: we pick you up at the port and plan the day around your ship’s schedule.',
  'port.ac.faq.5.q': 'What is there inside Amber Cove?',
  'port.ac.faq.5.a': 'Pools, shops, restaurants, bars and a zip line; some attractions cost extra. To see more of Puerto Plata, our tours start right at the port: waterfalls, the city, the beach or a private boat.',
  'port.ac.cta.title': 'Docking at Amber Cove? Message us your date and your ship’s name.',
  'port.ac.other': 'Is your ship at Taíno Bay? See the tours from Taíno Bay',

  // Taíno Bay
  'port.tb.meta.title': 'Taíno Bay Shore Excursions | Puerto Plata Cruise Excursions',
  'port.tb.meta.description': 'Shore excursions from Taíno Bay, Puerto Plata: Damajagua waterfalls, a city tour that starts by the port, a Playa Dorada beach day and private boats.',
  'port.tb.h1': 'Taíno Bay Shore Excursions',
  'port.tb.lead': 'Taíno Bay is the cruise port in downtown Puerto Plata, right next to the historic center and the San Felipe Fortress. We pick you up at the port and plan your tour around your ship’s schedule.',
  'port.tb.tours.title': 'Things to do from Taíno Bay',
  'port.tb.time.damajagua': 'About 35–45 min from Taíno Bay',
  'port.tb.time.city': 'Starts downtown, a short walk from the port',
  'port.tb.time.beach': 'Playa Dorada is about 10–15 min away',
  'port.tb.time.catamaran': 'Boats leave from Sosúa, 30 min away (round-trip transport optional)',
  'port.tb.faq.title': 'Taíno Bay questions',
  'port.tb.faq.1.q': 'Which cruise lines dock at Taíno Bay?',
  'port.tb.faq.1.a': 'Lines such as Royal Caribbean, Celebrity, Norwegian and MSC, among others. It can vary by sailing, so check your cruise itinerary. If your ship docks at Amber Cove instead, we pick you up there too.',
  'port.tb.faq.2.q': 'Can you walk from Taíno Bay to downtown Puerto Plata?',
  'port.tb.faq.2.a': 'Yes. The historic center is about a 10–15 minute walk: Umbrella Street, the Amber Museum and Central Park. The San Felipe Fortress is visible from the port. It gets hot, so bring water. Our City Tour covers downtown with a guide and ends at Playa Dorada.',
  'port.tb.faq.3.q': 'How far is Playa Dorada from Taíno Bay?',
  'port.tb.faq.3.a': 'About 10–15 minutes by car, east of the city. Our Beach Day includes private round-trip transport, umbrellas reserved for your group, a lounger for everyone and 4 hours at the beach.',
  'port.tb.faq.4.q': 'How far are the Damajagua waterfalls from Taíno Bay?',
  'port.tb.faq.4.a': 'About 35–45 minutes by road, depending on traffic. We pick you up at the port, take you to the 27 Charcos de Damajagua near Imbert and bring you back. The tour includes a buffet lunch.',
  'port.tb.faq.5.q': 'What is there inside Taíno Bay?',
  'port.tb.faq.5.a': 'A pool with a bar, loungers and shops. Because the port is right in the city, you can also head out on foot or take a tour: waterfalls, the city, the beach or a private boat, with pickup at the port.',
  'port.tb.cta.title': 'Docking at Taíno Bay? Message us your date and your ship’s name.',
  'port.tb.other': 'Is your ship at Amber Cove? See the tours from Amber Cove'
});
