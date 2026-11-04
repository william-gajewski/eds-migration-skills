/* eslint-env node */
/* eslint-disable no-console, import/extensions */
// Accessibility: axe-core (WCAG 2.1 A and AA, and best practice) on each path at desktop and phone
// width. It fails when a violation is serious or critical (--fail-on changes the bar). Rules are
// totalled over the renders, since the header and footer repeat on every page. The full results
// go to test/checks/results/axe-<host>.json.
//
// usage: node test/checks/axe.mjs [--host local|preview|live|<url>] [--port 3000] [--ref main]
//          [--paths a,b/c | --list <file>] [--widths 1280,390] [--scope main]
//          [--fail-on critical|serious|moderate|minor]
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  RESULTS, ROOT, die, hostLabel, hostOf, list, loadPlaywright, parseArgs, pathsOf, pool, settle,
} from './lib.mjs';

const IMPACT = ['minor', 'moderate', 'serious', 'critical'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const opts = parseArgs();
const host = hostOf(opts);
const paths = pathsOf(opts);
const widths = list(opts.widths || '1280,390').map(Number);
const failOn = IMPACT.indexOf(String(opts['fail-on'] || 'serious'));
if (failOn < 0) die(`--fail-on ${opts['fail-on']}: expected ${IMPACT.join(', ')}`);
const scope = opts.scope === 'main' ? 'main' : null;

let axeFile;
try {
  axeFile = createRequire(path.join(ROOT, 'noop.js')).resolve('axe-core/axe.min.js');
} catch (e) {
  die('axe-core is missing: run "npm install".');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const jobs = widths.flatMap((w) => paths.map((p) => ({ w, p })));
const renders = await pool(jobs, 3, async ({ w, p }) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${host}${p}`, { waitUntil: 'load', timeout: 60000 });
    await settle(page);
    await page.addScriptTag({ path: axeFile });
    const violations = await page.evaluate(async ({ tags, sel }) => {
      const res = await window.axe.run(sel ? document.querySelector(sel) || document : document, { runOnly: tags, resultTypes: ['violations'] });
      return res.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 2).map((n) => n.target.join(' ')),
      }));
    }, { tags: TAGS, sel: scope });
    return { w, p, violations };
  } catch (e) {
    return {
      w, p, violations: [], error: e.message.split('\n')[0],
    };
  } finally {
    await ctx.close();
  }
});
await browser.close();

// one line per rule, over all renders
const rules = new Map();
renders.forEach((r) => r.violations.forEach((v) => {
  const rule = rules.get(v.id) || {
    id: v.id, impact: v.impact, help: v.help, nodes: 0, renders: 0, example: `${r.p} @${r.w}: ${v.targets[0] || ''}`,
  };
  rule.nodes += v.nodes;
  rule.renders += 1;
  rules.set(v.id, rule);
}));
const rank = (r) => IMPACT.indexOf(r.impact);
const sorted = [...rules.values()].sort((a, b) => rank(b) - rank(a) || b.nodes - a.nodes);
const failing = sorted.filter((r) => rank(r) >= failOn);

console.log(`Accessibility (axe-core, ${TAGS.join(', ')}), ${host}${scope ? ', main only' : ''}: ${paths.length} paths at ${widths.join(', ')}\n`);
renders.filter((r) => r.error).forEach((r) => console.log(`  could not check ${r.p} @${r.w}: ${r.error}`));
if (!sorted.length) console.log('  no violations');
sorted.forEach((r) => {
  console.log(`  ${r.impact.padEnd(9)} ${r.id} (${r.nodes} element${r.nodes === 1 ? '' : 's'} on ${r.renders} render${r.renders === 1 ? '' : 's'}): ${r.help}`);
  console.log(`            e.g. ${r.example}`);
});
fs.mkdirSync(RESULTS, { recursive: true });
const out = path.join(RESULTS, `axe-${hostLabel(host)}.json`);
fs.writeFileSync(out, `${JSON.stringify({
  host, date: new Date().toISOString(), tags: TAGS, renders,
}, null, 1)}\n`);
console.log(`\n${failing.length} rule${failing.length === 1 ? '' : 's'} at ${IMPACT[failOn]} or above. Details: ${path.relative(process.cwd(), out)}`);
process.exitCode = failing.length || renders.some((r) => r.error) ? 1 : 0;
