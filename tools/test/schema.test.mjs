/**
 * schema.test.mjs — Tests for the JSON-LD graph of each page (tools/lib/schema.mjs).
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../lib/schema.mjs';

const ORIGIN = 'https://popcruiseexcursions.com';
const SITE = {
  name: 'Puerto Plata Cruise Excursions',
  origin: ORIGIN,
  phone: '+1-829-627-7733',
  phoneDisplay: '+1 (829) 627-7733',
  email: 'popcruiseexcursions@gmail.com',
  whatsappUrl: 'https://wa.me/18296277733',
  logo: 'assets/img/logo.webp',
  image: 'assets/img/og-image.jpg',
  priceRange: 'US$12–US$1,300',
  sameAs: [],
  knowsLanguage: ['es', 'en'],
  areaServed: ['Puerto Plata', 'Amber Cove Cruise Port', 'Taíno Bay Cruise Port']
};
const TOURS = [
  {
    id: 'damajagua',
    name: 'Damajagua Waterfalls',
    description: 'Jump, swim and slide.',
    image: 'assets/img/tour-damajagua.webp',
    url: `${ORIGIN}/#tour-damajagua`,
    offer: { low: 50, high: 100, count: 6 }
  },
  {
    id: 'city',
    name: 'Puerto Plata City Tour',
    description: 'The best of the city.',
    image: 'assets/img/tour-city.webp',
    url: `${ORIGIN}/#tour-city`,
    offer: null,
    stops: ['Paseo Doña Blanca', 'Umbrella Street']
  }
];
const FAQ = [
  { q: 'Where do the tours start?', a: 'We pick you up at the cruise port.' },
  { q: 'What language are the tours in?', a: 'English and Spanish.' }
];

/**
 * Finds the graph nodes of one @type.
 * @param {object} graph - Result of buildGraph.
 * @param {string} type - Schema.org type.
 * @returns {object[]} Matching nodes.
 */
function nodes(graph, type) {
  return graph['@graph'].filter((node) => node['@type'] === type);
}

/**
 * Builds the graph of the English home page used by several tests.
 * @returns {object} JSON-LD graph.
 */
function homeGraph() {
  return buildGraph({
    origin: ORIGIN, site: SITE, lang: 'en', url: `${ORIGIN}/`, pageType: 'home',
    title: 'Puerto Plata Cruise Excursions', description: 'Shore excursions.', audience: 'Cruise passengers',
    tours: TOURS, faq: FAQ
  });
}

/**
 * Builds the graph of a port page.
 * @param {{latitude: number, longitude: number}|null} geo - Port coordinates.
 * @returns {object} JSON-LD graph.
 */
function portGraph(geo) {
  return buildGraph({
    origin: ORIGIN, site: SITE, lang: 'en', url: `${ORIGIN}/amber-cove-excursions/`, pageType: 'port',
    title: 'Amber Cove Shore Excursions', description: 'Tours from Amber Cove.', audience: 'Cruise passengers',
    tours: TOURS, faq: FAQ,
    port: { id: 'amber-cove', name: 'Amber Cove Cruise Port', geo, homeUrl: `${ORIGIN}/`, homeName: 'Home', pageName: 'Amber Cove Shore Excursions' }
  });
}

test('home graph has the business, the site, one trip per tour and the FAQ', () => {
  const graph = homeGraph();
  assert.equal(graph['@context'], 'https://schema.org');
  const [business] = nodes(graph, 'TravelAgency');
  assert.equal(business['@id'], `${ORIGIN}/#org`);
  assert.equal(business.address.addressCountry, 'DO');
  assert.equal(business.telephone, '+1-829-627-7733');
  assert.equal(nodes(graph, 'WebSite')[0]['@id'], `${ORIGIN}/#website`);
  const [page] = nodes(graph, 'WebPage');
  assert.equal(page.url, `${ORIGIN}/`);
  assert.equal(page.inLanguage, 'en');
  const trips = nodes(graph, 'TouristTrip');
  assert.equal(trips.length, 2);
  assert.equal(trips[0]['@id'], `${ORIGIN}/#tour-damajagua`);
  assert.deepEqual(trips[0].offers, {
    '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: 50, highPrice: 100, offerCount: 6
  });
  assert.equal(trips[0].image, `${ORIGIN}/assets/img/tour-damajagua.webp`);
  assert.ok(!('offers' in trips[1]));
  assert.equal(trips[1].itinerary.itemListElement[0].name, 'Paseo Doña Blanca');
  const [faqPage] = nodes(graph, 'FAQPage');
  assert.equal(faqPage.mainEntity.length, FAQ.length);
  assert.equal(faqPage.mainEntity[0].acceptedAnswer.text, FAQ[0].a);
});

test('graph never contains ratings or reviews', () => {
  const text = JSON.stringify(homeGraph()) + JSON.stringify(portGraph(null));
  assert.ok(!text.includes('Rating'));
  assert.ok(!text.includes('Review'));
});

test('port graph has the terminal, breadcrumbs and tour list', () => {
  const graph = portGraph({ latitude: 19.8326, longitude: -70.7739 });
  const [terminal] = nodes(graph, 'BoatTerminal');
  assert.equal(terminal.name, 'Amber Cove Cruise Port');
  assert.equal(terminal.geo.latitude, 19.8326);
  assert.ok(!('geo' in nodes(portGraph(null), 'BoatTerminal')[0]));
  assert.equal(nodes(graph, 'BreadcrumbList')[0].itemListElement.length, 2);
  const [list] = nodes(graph, 'ItemList');
  assert.equal(list.itemListElement.length, TOURS.length);
  assert.equal(list.itemListElement[0].url, `${ORIGIN}/#tour-damajagua`);
  assert.equal(nodes(graph, 'WebPage')[0].about['@id'], terminal['@id']);
  assert.equal(nodes(graph, 'TouristTrip').length, 0);
});
