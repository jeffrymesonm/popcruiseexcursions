/**
 * template.test.mjs — Tests for the template engine (tools/lib/template.mjs): includes, placeholders,
 * asset paths, script/stylesheet versions, template-only tags, per-language scripts, comment stripping and
 * relative links between site URLs.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIncludes,
  fillPlaceholders,
  prefixAssetPaths,
  stripTemplateOnly,
  selectLangScripts,
  relativeUrl,
  rootPrefix,
  versionAssetUrls,
  stripComments
} from '../lib/template.mjs';

test('applyIncludes inlines partials', () => {
  const readPartial = (name) => {
    if (name === 'x.html') return 'X';
    throw new Error(`Missing partial ${name}`);
  };
  assert.equal(applyIncludes('a{{include:x.html}}b', readPartial), 'aXb');
  assert.throws(() => applyIncludes('{{include:y.html}}', readPartial), /y\.html/);
});

test('fillPlaceholders resolves names and arguments and reports unknown ones', () => {
  const values = { home: '', 'lang-url:es': 'es/' };
  const result = fillPlaceholders('{{home}}#tours {{lang-url:es}} {{nope}}', (name, arg) => {
    return values[arg === null ? name : `${name}:${arg}`];
  });
  assert.equal(result.html, '#tours es/ {{nope}}');
  assert.deepEqual(result.unknown, ['nope']);
});

test('prefixAssetPaths prefixes src, href and srcset only for assets/', () => {
  const html = '<img src="assets/a.webp"><link href="assets/b.css"><a href="https://x.com/assets/c">';
  const result = prefixAssetPaths(html, '../');
  assert.ok(result.includes('<img src="../assets/a.webp">'), result);
  assert.ok(result.includes('<link href="../assets/b.css">'), result);
  assert.ok(result.includes('<a href="https://x.com/assets/c">'), result);
});

test('stripTemplateOnly removes the template noindex', () => {
  const result = stripTemplateOnly('<meta name="robots" content="noindex" data-template-only>\n<title>');
  assert.ok(!result.includes('noindex'), result);
  assert.ok(result.includes('<title>'), result);
});

test('selectLangScripts keeps only the page language', () => {
  const html = '<script src="assets/js/translations-fr.js" defer data-lang-script="fr"></script>\n' +
    '<script src="assets/js/translations-it.js" defer data-lang-script="it"></script>';
  const french = selectLangScripts(html, 'fr');
  assert.ok(french.includes('translations-fr.js'), french);
  assert.ok(!french.includes('translations-it.js'), french);
  assert.ok(!french.includes('data-lang-script'), french);
  const english = selectLangScripts(html, 'en');
  assert.ok(!english.includes('translations-fr.js') && !english.includes('translations-it.js'), english);
});

test('relativeUrl covers the site link shapes', () => {
  const cases = [
    ['/', '/', ''],
    ['/', '/es/', 'es/'],
    ['/es/', '/', '../'],
    ['/es/', '/es/excursiones-amber-cove/', 'excursiones-amber-cove/'],
    ['/es/excursiones-amber-cove/', '/es/', '../'],
    ['/fr/', '/amber-cove-excursions/', '../amber-cove-excursions/'],
    ['/amber-cove-excursions/', '/taino-bay-excursions/', '../taino-bay-excursions/'],
    ['/es/excursiones-amber-cove/', '/amber-cove-excursions/', '../../amber-cove-excursions/']
  ];
  for (const [from, to, expected] of cases) {
    assert.equal(relativeUrl(from, to), expected, `${from} → ${to}`);
  }
});

test('rootPrefix', () => {
  assert.equal(rootPrefix('/'), '');
  assert.equal(rootPrefix('/es/'), '../');
  assert.equal(rootPrefix('/es/excursiones-amber-cove/'), '../../');
});

test('prefixAssetPaths prefixes every srcset and imagesrcset candidate', () => {
  const html = '<link rel="preload" as="image" imagesrcset="assets/img/a-640.webp 640w, assets/img/a.webp 1600w" imagesizes="100vw">' +
    '<img src="assets/img/a.webp" srcset="assets/img/a-640.webp 640w,assets/img/a.webp 1600w" sizes="100vw">';
  assert.equal(prefixAssetPaths(html, '../../'),
    '<link rel="preload" as="image" imagesrcset="../../assets/img/a-640.webp 640w, ../../assets/img/a.webp 1600w" imagesizes="100vw">' +
    '<img src="../../assets/img/a.webp" srcset="../../assets/img/a-640.webp 640w,../../assets/img/a.webp 1600w" sizes="100vw">');
});

test('prefixAssetPaths prefixes a video poster too', () => {
  assert.equal(
    prefixAssetPaths('<video poster="assets/img/a.webp"><source src="assets/video/a.mp4"></video>', '../'),
    '<video poster="../assets/img/a.webp"><source src="../assets/video/a.mp4"></video>'
  );
});

test('versionAssetUrls versions local scripts and stylesheets only', () => {
  const versions = { 'assets/js/i18n.js': 'aaaa1111', 'assets/css/styles.css': 'bbbb2222' };
  const html = [
    '<script src="assets/js/i18n.js" defer></script>',
    '<link rel="stylesheet" href="assets/css/styles.css">',
    '<link rel="preload" as="script" href="assets/js/i18n.js">',
    '<link rel="preload" as="image" href="assets/img/hero.webp">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    '<script src="assets/js/i18n.js?v=keep" defer></script>',
    '<a href="assets/js/i18n.js">source</a>',
    '<script src="assets/js/gone.js"></script>'
  ].join('\n');
  const result = versionAssetUrls(html, (assetPath) => versions[assetPath] || null);
  const lines = result.html.split('\n');
  assert.equal(lines[0], '<script src="assets/js/i18n.js?v=aaaa1111" defer></script>');
  assert.equal(lines[1], '<link rel="stylesheet" href="assets/css/styles.css?v=bbbb2222">');
  assert.equal(lines[2], '<link rel="preload" as="script" href="assets/js/i18n.js?v=aaaa1111">');
  assert.deepEqual(lines.slice(3, 7), html.split('\n').slice(3, 7), 'images, external URLs, existing queries and links stay');
  assert.equal(lines[7], '<script src="assets/js/gone.js"></script>');
  assert.deepEqual(result.missing, ['assets/js/gone.js']);
});

test('stripComments drops whole-line comments with their lines (LF and CRLF)', () => {
  const lf = '<head>\n  <!-- one line -->\n  <meta charset="utf-8">\n  <!--\n    several\n    lines\n  -->\n  <title>T</title>\n</head>';
  assert.equal(stripComments(lf), '<head>\n  <meta charset="utf-8">\n  <title>T</title>\n</head>');
  assert.equal(stripComments(lf.replace(/\n/g, '\r\n')), '<head>\r\n  <meta charset="utf-8">\r\n  <title>T</title>\r\n</head>');
  assert.equal(stripComments('<!-- first line -->\n<p>a</p>\n<!-- last, no line break -->'), '<p>a</p>\n');
});

test('stripComments drops a comment that shares its line, keeping the markup and line break', () => {
  assert.equal(stripComments('<p>a</p> <!-- note -->\n<p>b</p>'), '<p>a</p>\n<p>b</p>');
  assert.equal(stripComments('  <!-- note --><p>a</p>\n'), '  <p>a</p>\n');
  assert.equal(stripComments('<p>a <!-- note --> b</p>'), '<p>a  b</p>');
});

test('stripComments never touches script or style text', () => {
  const html = '<script>\n  // <!-- not a comment -->\n  var a = "<!-- x -->";\n</script>\n' +
    '<style>\n  /* <!-- kept --> */\n</style>\n<SCRIPT type="application/ld+json">{"a": "<!-- b -->"}</SCRIPT>\n';
  assert.equal(stripComments(`${html}<!-- gone -->\n`), html);
  assert.equal(stripComments('<!-- a <script> inside a comment is text -->\n<p>x</p>'), '<p>x</p>');
});

test('versioned URLs still get the sub-folder prefix', () => {
  const versioned = versionAssetUrls('<script src="assets/js/i18n.js"></script>', () => 'aaaa1111').html;
  assert.equal(prefixAssetPaths(versioned, '../../'), '<script src="../../assets/js/i18n.js?v=aaaa1111"></script>');
});
