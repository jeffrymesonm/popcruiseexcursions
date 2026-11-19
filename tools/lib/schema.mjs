/**
 * schema.mjs — JSON-LD (schema.org) graph for each page version, built from the same data the page
 * shows: the business, the site, the page, the tours with their "from" prices, the FAQ and, on the
 * port pages, the cruise terminal, breadcrumbs and the list of tours from that port; on a tour page
 * (the catamaran page), only that tour, breadcrumbs and the FAQ.
 * Never emits ratings or reviews: the business has no published reviews yet.
 */

/**
 * @typedef {{name: string, origin: string, phone: string, email: string, whatsappUrl: string,
 *   logo: string, image: string, priceRange: string, sameAs: string[], knowsLanguage: string[],
 *   areaServed: string[], paymentAccepted?: string[]}} SiteInfo
 * @typedef {{id: string, name: string, description: string, image: string, url: string,
 *   offer: {low: number, high: number, count: number}|null, stops?: string[]}} TourData
 * @typedef {{id: string, name: string, geo: {latitude: number, longitude: number}|null,
 *   homeUrl: string, homeName: string, pageName: string}} PortData
 * @typedef {{id: string, homeUrl: string, homeName: string, pageName: string}} TourPageData
 *   A page about one tour: id = its TOURS id; the other fields feed the breadcrumbs.
 */

/**
 * Turns a site-relative asset path into an absolute URL (absolute URLs pass through).
 * @param {string} origin - Site origin.
 * @param {string} path - "assets/img/x.webp" or an absolute URL.
 * @returns {string} Absolute URL.
 */
function toAbsolute(origin, path) {
  return /^https?:\/\//.test(path) ? path : `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * The business node, the same on every page.
 * @param {string} origin - Site origin.
 * @param {SiteInfo} site - Business data.
 * @returns {object} TravelAgency node.
 */
function businessNode(origin, site) {
  const node = {
    '@type': 'TravelAgency',
    '@id': `${origin}/#org`,
    name: site.name,
    url: `${origin}/`,
    logo: toAbsolute(origin, site.logo),
    image: toAbsolute(origin, site.image),
    telephone: site.phone,
    email: site.email,
    priceRange: site.priceRange,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Puerto Plata',
      addressRegion: 'Puerto Plata',
      addressCountry: 'DO'
    },
    areaServed: site.areaServed.map((name) => ({ '@type': 'Place', name })),
    knowsLanguage: site.knowsLanguage,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'reservations',
      telephone: site.phone,
      url: site.whatsappUrl,
      availableLanguage: site.knowsLanguage
    }
  };
  if (site.sameAs.length) node.sameAs = site.sameAs;
  if (site.paymentAccepted && site.paymentAccepted.length) node.paymentAccepted = site.paymentAccepted.join(', ');
  return node;
}

/**
 * One tour as a TouristTrip, with its price range and, for the city tour, its stops.
 * @param {string} origin - Site origin.
 * @param {TourData} tour - Tour data in the page language.
 * @param {string} audience - Who the trip is for, in the page language.
 * @returns {object} TouristTrip node.
 */
function tripNode(origin, tour, audience) {
  const node = {
    '@type': 'TouristTrip',
    '@id': `${origin}/#tour-${tour.id}`,
    name: tour.name,
    description: tour.description,
    image: toAbsolute(origin, tour.image),
    url: tour.url,
    touristType: audience,
    provider: { '@id': `${origin}/#org` }
  };
  if (tour.offer) {
    node.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: tour.offer.low,
      highPrice: tour.offer.high,
      offerCount: tour.offer.count
    };
  }
  if (tour.stops && tour.stops.length) {
    node.itinerary = {
      '@type': 'ItemList',
      itemListElement: tour.stops.map((name) => ({ '@type': 'TouristAttraction', name }))
    };
  }
  return node;
}

/**
 * The page's questions and answers.
 * @param {string} url - Page URL.
 * @param {Array<{q: string, a: string}>} faq - Questions in the page language.
 * @returns {object} FAQPage node.
 */
function faqNode(url, faq) {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
}

/**
 * Two-step breadcrumbs: the home page, then this page.
 * @param {string} url - Page URL.
 * @param {string} homeName - Name of the home page in the page language.
 * @param {string} homeUrl - Home page URL in the page language.
 * @param {string} pageName - Name of this page (its H1).
 * @returns {object} BreadcrumbList node.
 */
function breadcrumbNode(url, homeName, homeUrl, pageName) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: homeName, item: homeUrl },
      { '@type': 'ListItem', position: 2, name: pageName, item: url }
    ]
  };
}

/**
 * Nodes that only port pages have: the terminal, the breadcrumbs and the list of tours.
 * @param {string} origin - Site origin.
 * @param {string} url - Page URL.
 * @param {PortData} port - Port data in the page language.
 * @param {TourData[]} tours - Tours offered from the port.
 * @returns {object[]} BoatTerminal, BreadcrumbList and ItemList nodes.
 */
function portNodes(origin, url, port, tours) {
  const terminal = {
    '@type': 'BoatTerminal',
    '@id': `${origin}/#port-${port.id}`,
    name: port.name,
    address: { '@type': 'PostalAddress', addressLocality: 'Puerto Plata', addressCountry: 'DO' }
  };
  if (port.geo) terminal.geo = { '@type': 'GeoCoordinates', latitude: port.geo.latitude, longitude: port.geo.longitude };
  return [
    terminal,
    breadcrumbNode(url, port.homeName, port.homeUrl, port.pageName),
    {
      '@type': 'ItemList',
      '@id': `${url}#tours`,
      itemListElement: tours.map((tour, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: tour.name,
        url: tour.url
      }))
    }
  ];
}

/**
 * JSON-LD graph for one page version.
 * Home: every tour as a TouristTrip. Port: terminal, breadcrumbs and tour list. Tour: only the tour
 * named by tourPage.id (the page is about that trip) and breadcrumbs.
 * @param {{origin: string, site: SiteInfo, lang: string, url: string, pageType: 'home'|'port'|'tour',
 *   title: string, description: string, audience: string, tours: TourData[],
 *   faq: Array<{q: string, a: string}>, port?: PortData, tourPage?: TourPageData}} input
 * @returns {{'@context': string, '@graph': object[]}} The graph.
 */
export function buildGraph({ origin, site, lang, url, pageType, title, description, audience, tours, faq, port, tourPage }) {
  const isPort = pageType === 'port' && port;
  const isTour = pageType === 'tour' && tourPage;
  const tripId = isTour ? `${origin}/#tour-${tourPage.id}` : null;
  let about = `${origin}/#org`;
  if (isPort) about = `${origin}/#port-${port.id}`;
  if (isTour) about = tripId;
  const page = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: lang,
    isPartOf: { '@id': `${origin}/#website` },
    about: { '@id': about }
  };
  let pageNodes;
  if (isPort) {
    page.breadcrumb = { '@id': `${url}#breadcrumb` };
    page.mainEntity = { '@id': `${url}#tours` };
    pageNodes = portNodes(origin, url, port, tours);
  } else if (isTour) {
    page.breadcrumb = { '@id': `${url}#breadcrumb` };
    page.mainEntity = { '@id': tripId };
    pageNodes = [
      ...tours.filter((tour) => tour.id === tourPage.id).map((tour) => tripNode(origin, tour, audience)),
      breadcrumbNode(url, tourPage.homeName, tourPage.homeUrl, tourPage.pageName)
    ];
  } else {
    pageNodes = tours.map((tour) => tripNode(origin, tour, audience));
  }
  const graph = [
    businessNode(origin, site),
    { '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: site.name, inLanguage: lang, publisher: { '@id': `${origin}/#org` } },
    page,
    ...pageNodes
  ];
  if (faq.length) graph.push(faqNode(url, faq));
  return { '@context': 'https://schema.org', '@graph': graph };
}
