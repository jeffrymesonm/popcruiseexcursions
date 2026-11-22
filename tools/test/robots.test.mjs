/**
 * robots.test.mjs — robots.txt keeps /src/ (templates) and /tools/ (the build) away from every crawler while
 * welcoming all of them to the site. A crawler obeys only the most specific group that names it (RFC 9309), so a
 * Disallow in "User-agent: *" alone would not reach Googlebot, GPTBot and the other named crawlers: every group
 * must carry it.
 * Run with: node --test "tools/test/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROBOTS = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
/** Crawlers the file names on purpose (its intent comment: AI assistants and search engines are welcome). */
const NAMED = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
  'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended'];

/**
 * Groups of a robots.txt (RFC 9309): one or more consecutive user-agent lines start a group; the allow and
 * disallow lines after them are its rules. Comments and other records (Sitemap) are ignored.
 * @param {string} text - File contents.
 * @returns {Array<{agents: string[], rules: Array<{allow: boolean, path: string}>}>} Groups in file order.
 */
function robotsGroups(text) {
  const groups = [];
  let previousWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.replace(/#.*$/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (key === 'user-agent') {
      if (!previousWasAgent) groups.push({ agents: [], rules: [] });
      groups[groups.length - 1].agents.push(match[2].trim());
      previousWasAgent = true;
      continue;
    }
    previousWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && groups.length) {
      groups[groups.length - 1].rules.push({ allow: key === 'allow', path: match[2].trim() });
    }
  }
  return groups;
}

/**
 * Whether a crawler may fetch a path (RFC 9309): the rules of the groups that name it (else of the "*"
 * groups), longest matching path wins, Allow wins a tie, no match allows. Paths are plain prefixes (the
 * file uses no "*" or "$").
 * @param {Array<object>} groups - From robotsGroups.
 * @param {string} agent - Product token, e.g. "GPTBot".
 * @param {string} urlPath - Path to fetch, e.g. "/src/index.html".
 * @returns {boolean} True when allowed.
 */
function isAllowed(groups, agent, urlPath) {
  const named = groups.filter((group) => group.agents.some((name) => name.toLowerCase() === agent.toLowerCase()));
  const rules = (named.length ? named : groups.filter((group) => group.agents.includes('*'))).flatMap((group) => group.rules);
  let best = null;
  for (const rule of rules) {
    if (!rule.path || !urlPath.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

test('every robots.txt group disallows /src/ and /tools/, before its Allow', () => {
  const groups = robotsGroups(ROBOTS);
  assert.ok(groups.length >= 2, 'the "*" group and the named crawlers');
  for (const group of groups) {
    const label = group.agents.join(', ');
    const disallowed = group.rules.filter((rule) => !rule.allow).map((rule) => rule.path);
    assert.ok(disallowed.includes('/src/') && disallowed.includes('/tools/'), `${label}: Disallow /src/ and /tools/`);
    const firstAllow = group.rules.findIndex((rule) => rule.allow);
    const lastDisallow = group.rules.map((rule) => rule.allow).lastIndexOf(false);
    assert.ok(firstAllow === -1 || lastDisallow < firstAllow, `${label}: Disallow before Allow (first-match parsers)`);
  }
});

test('robots.txt still welcomes every crawler to the site and lists the sitemap', () => {
  const groups = robotsGroups(ROBOTS);
  const agents = groups.flatMap((group) => group.agents);
  for (const agent of ['*', ...NAMED]) assert.ok(agents.includes(agent), `${agent} has a group`);
  for (const agent of [...NAMED, 'SomeOtherBot']) {
    for (const urlPath of ['/', '/es/', '/amber-cove-excursions/', '/assets/img/hero.webp', '/sitemap.xml', '/llms.txt']) {
      assert.ok(isAllowed(groups, agent, urlPath), `${agent} may fetch ${urlPath}`);
    }
    for (const urlPath of ['/src/', '/src/partials/boats.html', '/tools/build.mjs']) {
      assert.ok(!isAllowed(groups, agent, urlPath), `${agent} may not fetch ${urlPath}`);
    }
  }
  assert.match(ROBOTS, /^Sitemap: https:\/\/popcruiseexcursions\.com\/sitemap\.xml$/m);
});

test('a Disallow only in the "*" group does not reach a named crawler (why every group carries it)', () => {
  const groups = robotsGroups('User-agent: *\nDisallow: /src/\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n');
  assert.equal(isAllowed(groups, 'SomeOtherBot', '/src/a.html'), false);
  assert.equal(isAllowed(groups, 'GPTBot', '/src/a.html'), true);
});
