/**
 * seo.test.mjs — Tests for the SEO outputs of the build (tools/lib/seo.mjs): head tags with hreflang,
 * sitemap.xml, the JSON-LD script tag and llms.txt. Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seoHeadTags, sitemapXml, jsonLdScript, llmsTxt } from '../lib/seo.mjs';

const ORIGIN = 'https://popcruiseexcursions.com';
const LOCALES = { en: 'en_US', es: 'es_ES', fr: 'fr_FR', it: 'it_IT' };
const HOME = { id: 'home', template: 'src/index.html', versions: { en: '/', es: '/es/', fr: '/fr/', it: '/it/' } };
const PORT = {
  id: 'amber-cove',
  template: 'src/amber-cove.html',
  port: 'amber-cove',
  versions: { en: '/amber-cove-excursions/', es: '/es/excursiones-amber-cove/' }
};
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

test('seoHeadTags lists every version plus x-default', () => {
  const tags = seoHeadTags({ origin: ORIGIN, page: HOME, lang: 'es', locales: LOCALES, defaultLang: 'en' });
  assert.ok(tags.includes('<link rel="canonical" href="https://popcruiseexcursions.com/es/">'), tags);
  assert.ok(tags.includes('hreflang="en" href="https://popcruiseexcursions.com/"'), tags);
  assert.ok(tags.includes('hreflang="fr" href="https://popcruiseexcursions.com/fr/"'), tags);
  assert.ok(tags.includes('hreflang="x-default" href="https://popcruiseexcursions.com/"'), tags);
  assert.ok(tags.includes('property="og:url" content="https://popcruiseexcursions.com/es/"'), tags);
  assert.ok(tags.includes('property="og:locale" content="es_ES"'), tags);
  assert.ok(tags.includes('property="og:locale:alternate" content="it_IT"'), tags);
  assert.ok(!tags.includes('property="og:locale:alternate" content="es_ES"'), tags);
});

test('sitemapXml has one url per version with alternates', () => {
  const xml = sitemapXml({ origin: ORIGIN, pages: [HOME, PORT], defaultLang: 'en' });
  assert.equal((xml.match(/<loc>/g) || []).length, 6);
  const block = (xml.match(/<url>[\s\S]*?<\/url>/g) || [])
    .find((url) => url.includes('<loc>https://popcruiseexcursions.com/es/excursiones-amber-cove/</loc>'));
  assert.ok(block, xml);
  assert.ok(block.includes('hreflang="en" href="https://popcruiseexcursions.com/amber-cove-excursions/"'), block);
  assert.ok(block.includes('hreflang="es" href="https://popcruiseexcursions.com/es/excursiones-amber-cove/"'), block);
  assert.ok(block.includes('hreflang="x-default" href="https://popcruiseexcursions.com/amber-cove-excursions/"'), block);
});

test('jsonLdScript escapes "<"', () => {
  const script = jsonLdScript({ text: '</script><b>' });
  assert.ok(script.startsWith('<script type="application/ld+json">'), script);
  assert.equal(script.split('</script>').length - 1, 1, script);
  assert.deepEqual(JSON.parse(script.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')), { text: '</script><b>' });
});

test('llmsTxt lists the business, tours and pages', () => {
  const text = llmsTxt({
    site: SITE,
    summary: 'Local tour operator for cruise passengers.',
    tours: [{
      name: 'Damajagua Waterfalls',
      url: 'https://popcruiseexcursions.com/#tour-damajagua',
      description: 'Jump, swim and slide.',
      from: 'US$50',
      priceLines: ['1 to 5 people: US$100 with zipline, US$75 no zipline']
    }],
    ports: [{ title: 'Amber Cove shore excursions', url: 'https://popcruiseexcursions.com/amber-cove-excursions/' }],
    languages: [{ title: 'Español', url: 'https://popcruiseexcursions.com/es/' }],
    faq: [{ q: 'Will I make it back to my ship on time?', a: 'We plan every tour around your ship.' }]
  });
  assert.ok(text.startsWith('# Puerto Plata Cruise Excursions'), text);
  assert.ok(text.includes('+1 (829) 627-7733'), text);
  assert.ok(text.includes('[Damajagua Waterfalls](https://popcruiseexcursions.com/#tour-damajagua)'), text);
  assert.ok(text.includes('From US$50'), text);
  assert.ok(text.includes('1 to 5 people: US$100 with zipline'), text);
  assert.ok(text.includes('https://popcruiseexcursions.com/amber-cove-excursions/'), text);
  assert.ok(text.includes('https://popcruiseexcursions.com/es/'), text);
  assert.ok(text.includes('Will I make it back to my ship on time?'), text);
});
