// Preview and publish one document or sheet without surprises:
//   1. status: DA vs preview vs live, and who saved in DA since the last publish;
//   2. backup: the current DA source and both renderings, before anything changes;
//   3. optionally replace the DA source (--from), e.g. to restore a known-good version;
//   4. preview, then show what live would gain or lose;
//   5. publish only what was previewed and reviewed, then check live matches the preview, and
//      re-index.
//
// usage: node publish.mjs <path> [--from file:<f>|da:<path>|version:<url>]
//          [--preview] [--publish] [--accept-drift] [--no-index] [--backups <dir>]
//          [--org o --site s --ref main]
//   no --preview/--publish: a dry run; nothing is written
//   --preview: back up, (replace from --from), preview, compare preview with live, record the review
//   --publish: publish the reviewed preview (run --preview first and look at its output)
//   --accept-drift: go ahead although DA holds changes that are not on live, saved since the last
//     publish (they are someone's work: look at them first; the backup keeps them)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  api, describe, iso, isMain, loadConfig, loadToken, pageAt, parseArgs, resolvePath, run,
} from './lib/eds.mjs';
import { status } from './status.mjs';
import { compareTexts, load } from './compare.mjs';

const hash = (s) => crypto.createHash('sha256').update(s ?? '').digest('hex').slice(0, 16);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const safeName = (p) => p.admin.replace(/^\//, '').replace(/[^a-z0-9.-]+/gi, '_') || 'index';
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

export async function publish(opts, log = console.log) {
  const cfg = loadConfig(opts);
  const a = api(cfg, loadToken());
  const p = resolvePath(opts.path);
  const root = opts.backups || path.join(os.homedir(), '.safe-publish', `${cfg.org}-${cfg.site}`);
  const name = safeName(p);
  const ext = p.sheet ? 'json' : 'html';
  const reviewFile = path.join(root, `${name}.review.json`);

  // 1. status
  const st = await status(cfg, a, opts.path);
  log(`${p.admin} on ${cfg.org}/${cfg.site}: preview ${st.preview}, live ${st.live}`);
  log(`  saved in DA since the last publish: ${st.savesSinceLive?.length ? st.savesSinceLive.join('; ') : 'nothing'}`);
  log('  DA vs live:');
  (st.daVsLive || []).forEach((l) => log(`  ${l}`));
  log(`  => ${st.verdict}`);
  const drift = st.daVsLive && !st.daVsLive.join('').includes('same content') && st.savesSinceLive?.length;
  const writing = opts.preview || opts.publish;
  if (drift && writing && !opts['accept-drift']) {
    throw new Error('DA holds changes that are not live, saved since the last publish (see above). Look at them (compare.mjs da:<path> live:<path>, versions.mjs <path>) and rerun with --accept-drift if they are to be replaced or published.');
  }

  // what preview would show: the --from source, or the DA source as it is
  let next = null;
  if (opts.from) {
    next = await load(a, opts.from.includes(':') ? opts.from : `file:${opts.from}`);
    if (next.text === null) throw new Error(`${opts.from} doesn't exist`);
    const live = await a.rendered('live', p);
    if (live !== null) {
      log(`  ${opts.from} vs live (what live would get):`);
      describe(compareTexts(cfg, next, { text: live, sheet: p.sheet }), 'new', 'live').forEach((l) => log(`  ${l}`));
    }
  }

  if (!writing) {
    if (st.redirect?.preview) log(`dry run: nothing written. --preview would refuse: the previewed redirects sheet has a row for ${p.admin}, so preview can only show the redirect. Upload a rebuilt redirects sheet first.`);
    else log(`dry run: nothing written. --preview would back up to ${path.join(root, '<time>')} first${opts.from ? `, replace the DA source with ${opts.from}` : ''}, then preview.`);
    return { dryRun: true, status: st };
  }

  if (opts.preview && st.redirect?.preview) {
    throw new Error(`preview can't show ${p.admin}: the previewed redirects sheet has a row for it (-> ${st.redirect.preview}), and a row wins over a page. Rebuild the redirects sheet and upload it (its row drops once the DA document exists), then run --preview again. Nothing written.`);
  }

  if (opts.preview) {
    // 2. backup
    const dir = path.join(root, stamp());
    fs.mkdirSync(dir, { recursive: true });
    const [da, prev, live, versions] = await Promise.all([a.daGet(p), a.rendered('preview', p), a.rendered('live', p), a.versions(p)]);
    if (da !== null) fs.writeFileSync(path.join(dir, `${name}.da.${ext}`), da);
    if (prev !== null) fs.writeFileSync(path.join(dir, `${name}.preview.${p.sheet ? 'json' : 'plain.html'}`), prev);
    if (live !== null) fs.writeFileSync(path.join(dir, `${name}.live.${p.sheet ? 'json' : 'plain.html'}`), live);
    fs.writeFileSync(path.join(dir, `${name}.meta.json`), JSON.stringify({ path: p.admin, status: st, versions: versions.slice(0, 20) }, null, 1));
    log(`backed up to ${dir}`);

    // 3. replace the source
    if (next) {
      const s = await a.daPut(p, next.text);
      log(`DA source replaced from ${opts.from}: ${s}`);
    }

    // 4. preview, then what live would gain or lose
    const pv = await a.post('preview', p);
    if (!pv.ok) throw new Error(`preview failed: ${pv.status} ${pv.text.slice(0, 200)}`);
    const rendered = await a.rendered('preview', p);
    const liveNow = await a.rendered('live', p);
    log(`previewed: ${cfg.preview}${p.web}`);
    if (liveNow === null) log('  not live yet: publishing creates it');
    else if (rendered === liveNow) log('  preview is identical to live: publishing changes nothing');
    else {
      log('  preview vs live (what publishing changes):');
      describe(compareTexts(cfg, { text: rendered, sheet: p.sheet }, { text: liveNow, sheet: p.sheet }), 'preview', 'live').forEach((l) => log(`  ${l}`));
    }
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(reviewFile, JSON.stringify({ path: p.admin, previewed: new Date().toISOString(), hash: hash(rendered), backup: dir }, null, 1));
  }

  if (opts.publish) {
    // 5. publish what was reviewed
    if (!fs.existsSync(reviewFile)) throw new Error(`no reviewed preview for ${p.admin}: run with --preview first and look at its output`);
    const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    const rendered = await a.rendered('preview', p);
    if (hash(rendered) !== review.hash) throw new Error(`the preview of ${p.admin} changed since it was reviewed at ${review.previewed}: someone previewed again. Run --preview again and review.`);
    const pub = await a.post('live', p);
    if (!pub.ok) throw new Error(`publish failed: ${pub.status} ${pub.text.slice(0, 200)}`);
    if (st.redirect?.live) {
      // live still redirects the path, so its rendering can't be compared: ask the admin API
      const after = await a.status(p).catch(() => ({}));
      const ok = pageAt(after.live);
      log(`published: ${cfg.live}${p.web} -- ${ok ? 'the page is live' : 'the admin status shows NO page yet: check it'}, but a redirect row still sends visitors to ${st.redirect.live}.`);
      log('  Publish the rebuilt redirects sheet now (without this row), then re-index this page: an index request made while the row covers the path does nothing.');
      fs.renameSync(reviewFile, `${reviewFile}.published-${stamp()}`);
      return { status: st, hidden: true };
    }
    let liveNow = null;
    for (let i = 0; i < 10; i += 1) {
      liveNow = await a.rendered('live', p);
      if (liveNow === rendered) break;
      await wait(3000);
    }
    log(`published: ${cfg.live}${p.web} -- live ${liveNow === rendered ? 'is identical to the reviewed preview' : 'DIFFERS from the reviewed preview after 30s (cache, or someone else published): check it'}`);
    if (!p.sheet) {
      const [hp, hl] = await Promise.all([a.head('preview', p), a.head('live', p)]);
      const same = JSON.stringify(hp) === JSON.stringify(hl);
      log(`  head metadata: ${same ? `same as preview (${(hl || []).length} tags)` : 'DIFFERS from preview'}`);
    }
    if (!opts['no-index'] && !p.sheet) {
      const ix = await a.post('index', p);
      let rec = '';
      try {
        const j = JSON.parse(ix.text);
        const r = (j.results || []).map((x) => `${x.name}${x.record?.lastModified ? ` ${iso(x.record.lastModified * 1000)}` : ''}${x.noIndex ? ' (not in this index)' : ''}`);
        rec = r.join(', ');
      } catch (e) { rec = ix.text.slice(0, 120); }
      log(`  re-indexed: ${ix.status}${rec ? ` ${rec}` : ''}`);
    }
    fs.renameSync(reviewFile, `${reviewFile}.published-${stamp()}`);
  }
  return { status: st };
}

if (isMain(import.meta.url)) {
  run(async () => {
    const { opts, pos } = parseArgs();
    if (pos.length !== 1) throw new Error('usage: node publish.mjs <path> [--from file:<f>|da:<path>|version:<url>] [--preview] [--publish] [--accept-drift]');
    await publish({ ...opts, path: pos[0] });
  });
}
