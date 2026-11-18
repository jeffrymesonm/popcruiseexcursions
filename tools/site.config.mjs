/**
 * site.config.mjs — What the static build (tools/build.mjs) generates.
 *
 * - SITE: business data used by the structured data (JSON-LD) and llms.txt.
 * - PAGES: every page, its Spanish template in src/ and the URL path of each language version.
 *   The default language (English) is the x-default version; "/" is English.
 * - TOURS: the six tours as structured data shows them (names and descriptions come from the
 *   dictionaries, prices from the price tables of src/index.html).
 * - PORTS: the cruise terminals that have a landing page.
 * Texts never live here: Spanish is in src/, the other languages in the dictionaries.
 */

/** Business data (priceRange is computed by the build from the price tables). */
export const SITE = {
  name: 'Puerto Plata Cruise Excursions',
  origin: 'https://popcruiseexcursions.com',
  phone: '+1-829-627-7733',
  phoneDisplay: '+1 (829) 627-7733',
  email: 'popcruiseexcursions@gmail.com',
  whatsappUrl: 'https://wa.me/18296277733',
  logo: 'assets/img/logo.webp',
  image: 'assets/img/og-image.jpg',
  /** Social and listing profiles (Facebook, Instagram, TripAdvisor, Google Business Profile) once they exist. */
  sameAs: [],
  knowsLanguage: ['es', 'en'],
  areaServed: ['Puerto Plata', 'Amber Cove Cruise Port', 'Taíno Bay Cruise Port']
};

/** Open Graph locale of each language. */
export const LOCALES = { en: 'en_US', es: 'es_ES', fr: 'fr_FR', it: 'it_IT' };

/** Language names as each language writes itself (llms.txt links). */
export const LANGUAGE_NAMES = { en: 'English', es: 'Español', fr: 'Français', it: 'Italiano' };

/** Language of "/" and of every x-default alternate. */
export const DEFAULT_LANG = 'en';

/** Who the tours are for, per language (TouristTrip.touristType). */
export const AUDIENCE = { en: 'Cruise passengers', es: 'Pasajeros de crucero', fr: 'Croisiéristes', it: 'Crocieristi' };

/** Dictionary scripts, in load order (translations.js first: it creates window.SITE_TRANSLATIONS). */
export const DICTIONARY_FILES = [
  'assets/js/translations.js',
  'assets/js/translations-fr.js',
  'assets/js/translations-it.js'
];

/** Pages and their language versions (URL paths end in "/"; the file is <path>index.html). */
export const PAGES = [
  { id: 'home', template: 'src/index.html', versions: { en: '/', es: '/es/', fr: '/fr/', it: '/it/' } }
];

/**
 * Tours in page order. scope = price table id or data-tour group (null: priced on request);
 * stops = number of tours.city.stopN keys.
 */
export const TOURS = [
  { id: 'damajagua', scope: 'damajagua', image: 'assets/img/tour-damajagua.webp' },
  { id: 'city', scope: 'city', image: 'assets/img/tour-city.webp', stops: 7 },
  { id: 'horse', scope: 'horse', image: 'assets/img/tour-horse.webp' },
  { id: 'buggy', scope: null, image: 'assets/img/tour-buggy.webp' },
  { id: 'beach', scope: 'beach', image: 'assets/img/tour-beach.webp' },
  { id: 'catamaran', scope: 'catamaran', image: 'assets/img/boat-libreterre.webp' }
];

/** Cruise terminals with a landing page (filled when the port pages exist). */
export const PORTS = {};
