// A document's DA history, newest first: when, who, and (for previewed or published saves) a
// snapshot URL you can compare or restore from. Marks the saves made after the last publish.
// Read-only.
// usage: node versions.mjs <path> [--limit 15] [--org o --site s]
import {
  api, iso, isMain, loadConfig, loadToken, pageAt, parseArgs, resolvePath, rowAt, run,
} from './lib/eds.mjs';

if (isMain(import.meta.url)) {
  run(async () => {
    const { opts, pos } = parseArgs();
    if (pos.length !== 1) throw new Error('usage: node versions.mjs <path> [--limit 15]');
    const cfg = loadConfig(opts);
    const a = api(cfg, loadToken());
    const p = resolvePath(pos[0]);
    const [st, versions] = await Promise.all([a.status(p).catch(() => ({})), a.versions(p)]);
    // a redirect row's own status entry (sourceLocation "markup:*") is not a publish of this page
    const liveTime = pageAt(st.live) ? Date.parse(st.live.lastModified) : 0;
    const when = (x) => (pageAt(x) ? iso(x.lastModified) : 'never');
    const row = rowAt(st.live) || rowAt(st.preview);
    console.log(`${p.admin}: preview ${when(st.preview)}, live ${when(st.live)}${row ? ` (a redirect row sends the path to ${row})` : ''}; ${versions.length} saves in DA`);
    versions.slice(0, Number(opts.limit || 15)).forEach((v) => {
      console.log(`  ${v.ts > liveTime ? '*' : ' '} ${iso(v.time)}  ${(v.users || '?').padEnd(32)} ${v.label.padEnd(10)} ${v.url ? `version:${v.url}` : ''}`);
    });
    if (versions.some((v) => v.ts > liveTime)) console.log('  * saved after the last publish: not live');
    console.log('  Only previewed or published saves keep a snapshot (version:...); restore one with publish.mjs --from version:<url>.');
  });
}
