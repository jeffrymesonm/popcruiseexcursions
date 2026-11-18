/**
 * schema.mjs — JSON-LD (schema.org) graph for each page version, built from the same data the page
 * shows: the business, the site, the page, the tours with their "from" prices, the FAQ and, on the
 * port pages, the cruise terminal, breadcrumbs and the list of tours from that port.
 * Never emits ratings or reviews: the business has no published reviews yet.
 */

/**
 * @typedef {{name: string, origin: string, phone: string, email: string, whatsappUrl: string,
 *   logo: string, image: string, priceRange: string, sameAs: string[], knowsLanguage: string[],
 *   areaServed: string[]}} SiteInfo
 * @typedef {{id: string, name: string, description: string, image: string, url: string,
 *   offer: {low: number, high: number, count: number}|null, stops?: string[]}} TourData
 * @typedef {{id: string, name: string, geo: {latitude: number, longitude: number}|null,
 *   homeUrl: string, homeName: string, pageName: string}} PortData
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
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: port.homeName, item: port.homeUrl },
        { '@type': 'ListItem', position: 2, name: port.pageName, item: url }
      ]
    },
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
 * @param {{origin: string, site: SiteInfo, lang: string, url: string, pageType: 'home'|'port',
 *   title: string, description: string, audience: string, tours: TourData[],
 *   faq: Array<{q: string, a: string}>, port?: PortData}} input
 * @returns {{'@context': string, '@graph': object[]}} The graph.
 */
export function buildGraph({ origin, site, lang, url, pageType, title, description, audience, tours, faq, port }) {
  const isPort = pageType === 'port' && port;
  const page = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: lang,
    isPartOf: { '@id': `${origin}/#website` },
    about: { '@id': isPort ? `${origin}/#port-${port.id}` : `${origin}/#org` }
  };
  if (isPort) {
    page.breadcrumb = { '@id': `${url}#breadcrumb` };
    page.mainEntity = { '@id': `${url}#tours` };
  }
  const graph = [
    businessNode(origin, site),
    { '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: site.name, inLanguage: lang, publisher: { '@id': `${origin}/#org` } },
    page,
    ...(isPort ? portNodes(origin, url, port, tours) : tours.map((tour) => tripNode(origin, tour, audience)))
  ];
  if (faq.length) graph.push(faqNode(url, faq));
  return { '@context': 'https://schema.org', '@graph': graph };
}
