/* HAKI Strike stats API + admin (Cloudflare Worker, D1).
   What the extension sends: a random install ID, its version, the site (axiom / gmgn / padre), the chain (sol / bsc), error texts with
   addresses and numbers removed, and reports the user writes. Never wallets, keys, balances or trades.
   Public:  POST /v1/ping  POST /v1/err  POST /v1/report     (CORS *, rate limited per IP, daily quotas per install)
   Admin:   GET /admin (login with ADMIN_PASS, signed cookie), GET /admin/api/data, POST /admin/api/report */

const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...h } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const ID = /^[a-z0-9]{16,40}$/, VER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/, HOSTS = ['axiom', 'gmgn', 'padre', 'popup', 'other'], CHAINS = ['sol', 'bsc', ''];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
/* the same scrub as the extension: no addresses, no signatures, no amounts */
const scrub = s => clean(s, 400).replace(/0x[0-9a-fA-F]{20,}/g, '‹0x›').replace(/[1-9A-HJ-NP-Za-km-z]{32,90}/g, '‹addr›').replace(/\d+(\.\d+)?/g, '#');
async function sha(s) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); return [...b.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function body(req, max) {
  const t = await req.text(); if (t.length > max) throw new Error('too big');
  const o = JSON.parse(t); if (!o || typeof o !== 'object') throw new Error('bad body'); return o;
}
async function quota(env, id, what, add, max) {   /* per install, per UTC day */
  const d = day(); await env.DB.prepare('INSERT INTO quota(day,id,what,n) VALUES(?,?,?,?) ON CONFLICT(day,id,what) DO UPDATE SET n=n+?').bind(d, id, what, add, add).run();
  const r = await env.DB.prepare('SELECT n FROM quota WHERE day=? AND id=? AND what=?').bind(d, id, what).first(); return r && r.n <= max;
}
const base = o => {
  const id = String(o.id || ''), ver = String(o.ver || ''); if (!ID.test(id) || !VER.test(ver)) throw new Error('bad id');
  return { id, ver, host: HOSTS.includes(o.host) ? o.host : 'other', chain: CHAINS.includes(o.chain) ? o.chain : '', os: clean(o.os, 16) };
};

async function ping(env, req) {
  const b = base(await body(req, 2000)), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO installs(id,first,last,ver,host,chain,os) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last=excluded.last, ver=excluded.ver, host=excluded.host, chain=CASE WHEN excluded.chain<>\'\' THEN excluded.chain ELSE installs.chain END, os=excluded.os')
      .bind(b.id, now, now, b.ver, b.host, b.chain, b.os),
    env.DB.prepare('INSERT OR IGNORE INTO active(day,id,ver,host) VALUES(?,?,?,?)').bind(day(now), b.id, b.ver, b.host)]);
  return J({ ok: true }, 200, CORS);
}
async function err(env, req) {
  const o = await body(req, 12000), b = base(o), list = (Array.isArray(o.list) ? o.list : []).slice(0, 20);
  if (!list.length) return J({ ok: true }, 200, CORS);
  if (!(await quota(env, b.id, 'err', list.length, 300))) return J({ ok: false, why: 'quota' }, 429, CORS);
  const now = Date.now(), st = [];
  for (const e of list) {
    const kind = clean(e.kind, 40).replace(/[^\w.-]/g, '') || 'error', msg = scrub(e.msg), n = Math.max(1, Math.min(100, +e.n || 1)), k = await sha(kind + '|' + msg);
    st.push(env.DB.prepare('INSERT INTO errs(k,kind,msg,n,users,vers,hosts,first,last) VALUES(?,?,?,?,0,?,?,?,?) ON CONFLICT(k) DO UPDATE SET n=n+?, last=?, '
      + "vers=CASE WHEN instr(vers, ?)>0 THEN vers ELSE substr(vers || ' ' || ?, -120) END, hosts=CASE WHEN instr(hosts, ?)>0 THEN hosts ELSE hosts || ' ' || ? END")
      .bind(k, kind, msg, n, b.ver, b.host, now, now, n, now, b.ver, b.ver, b.host, b.host));
    st.push(env.DB.prepare('INSERT OR IGNORE INTO err_users(k,id) VALUES(?,?)').bind(k, b.id));
    st.push(env.DB.prepare('UPDATE errs SET users=(SELECT count(*) FROM err_users WHERE k=?) WHERE k=?').bind(k, k));
  }
  await env.DB.batch(st); return J({ ok: true }, 200, CORS);
}
async function report(env, req) {
  const o = await body(req, 16000), b = base(o), text = clean(o.text, 2000).trim();
  if (!text) return J({ ok: false, why: 'empty' }, 400, CORS);
  if (!(await quota(env, b.id, 'report', 1, 10))) return J({ ok: false, why: 'Too many reports today. Try again tomorrow.' }, 429, CORS);
  let ctx = ''; try { ctx = JSON.stringify(o.ctx || {}).slice(0, 6000); } catch (_) {}
  const r = await env.DB.prepare('INSERT INTO reports(t,id,ver,host,chain,text,ctx) VALUES(?,?,?,?,?,?,?)').bind(Date.now(), b.id, b.ver, b.host, b.chain, text, scrubCtx(ctx)).run();
  return J({ ok: true, n: r.meta && r.meta.last_row_id }, 200, CORS);
}
const scrubCtx = s => s.replace(/0x[0-9a-fA-F]{40,}/g, '‹0x›').replace(/[1-9A-HJ-NP-Za-km-z]{60,90}/g, '‹sig›');

/* ---------- admin ---------- */
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const eq = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
async function authed(env, req) {
  const c = (req.headers.get('cookie') || '').match(/(?:^|;\s*)hk=([0-9]+)\.([0-9a-f]{64})/); if (!c || !env.ADMIN_PASS) return false;
  if (+c[1] < Date.now()) return false; return eq(await hmac(env.ADMIN_PASS, 'admin|' + c[1]), c[2]);
}
const SEC = { 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
async function login(env, req) {
  const f = await req.formData(), p = String(f.get('p') || '');
  if (!env.ADMIN_PASS || !eq(await hmac('cmp', p), await hmac('cmp', env.ADMIN_PASS))) return new Response(page(false, 'Wrong password'), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', ...SEC } });
  const exp = Date.now() + 7 * 864e5, sig = await hmac(env.ADMIN_PASS, 'admin|' + exp);
  return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': 'hk=' + exp + '.' + sig + '; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=604800', ...SEC } });
}
async function data(env) {
  const now = Date.now(), d0 = day(now), d7 = day(now - 6 * 864e5), d30 = day(now - 29 * 864e5), q = (s, ...a) => env.DB.prepare(s).bind(...a);
  const [tot, newT, a1, a7, a30, daily, vers, hosts, chains, errs, reps, open] = await env.DB.batch([
    q('SELECT count(*) n FROM installs'), q('SELECT count(*) n FROM installs WHERE first>=?', Date.parse(d0)),
    q('SELECT count(*) n FROM active WHERE day=?', d0), q('SELECT count(DISTINCT id) n FROM active WHERE day>=?', d7), q('SELECT count(DISTINCT id) n FROM active WHERE day>=?', d30),
    q('SELECT day, count(*) n FROM active WHERE day>=? GROUP BY day ORDER BY day', d30),
    q('SELECT a.ver, count(DISTINCT a.id) n FROM active a WHERE a.day>=? GROUP BY a.ver ORDER BY n DESC LIMIT 12', d7),
    q('SELECT host, count(DISTINCT id) n FROM active WHERE day>=? GROUP BY host ORDER BY n DESC', d7),
    q("SELECT CASE chain WHEN '' THEN 'sol' ELSE chain END chain, count(*) n FROM installs WHERE last>=? GROUP BY 1 ORDER BY n DESC", now - 7 * 864e5),
    q('SELECT kind, msg, n, users, vers, hosts, first, last FROM errs ORDER BY last DESC LIMIT 60'),
    q('SELECT rid, t, ver, host, chain, text, ctx, status, note FROM reports ORDER BY rid DESC LIMIT 100'),
    q("SELECT count(*) n FROM reports WHERE status='open'")]);
  const one = r => (r.results[0] || {}).n || 0;
  return { now, total: one(tot), newToday: one(newT), today: one(a1), week: one(a7), month: one(a30), daily: daily.results, versions: vers.results, hosts: hosts.results,
    chains: chains.results, errors: errs.results, reports: reps.results, open: one(open) };
}
const page = (ok, msg) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAKI Strike admin</title><link rel="stylesheet" href="/admin/app.css"></head><body>'
  + (ok ? '<div id="app"></div><script src="/admin/app.js"></script>'
    : '<form class="login" method="post" action="/admin/login"><img src="/admin/logo.svg" alt=""><h1>HAKI Strike admin</h1>' + (msg ? '<p class="bad">' + msg + '</p>' : '') + '<input name="p" type="password" placeholder="Password" autocomplete="current-password" autofocus required><button>Sign in</button></form>')
  + '</body></html>';

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname, ip = req.headers.get('cf-connecting-ip') || 'x';
    try {
      if (p.startsWith('/v1/')) {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
        if (req.method !== 'POST') return J({ ok: false }, 405, CORS);
        const { success } = await env.RL.limit({ key: 'v1|' + ip }); if (!success) return J({ ok: false, why: 'slow down' }, 429, CORS);
        if (p === '/v1/ping') return await ping(env, req);
        if (p === '/v1/err') return await err(env, req);
        if (p === '/v1/report') return await report(env, req);
        return J({ ok: false }, 404, CORS);
      }
      if (p === '/admin/app.js') return new Response(APP_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', ...SEC } });
      if (p === '/admin/app.css') return new Response(APP_CSS, { headers: { 'content-type': 'text/css; charset=utf-8', ...SEC } });
      if (p === '/admin/logo.svg') return new Response(LOGO, { headers: { 'content-type': 'image/svg+xml', ...SEC } });
      if (p === '/admin/login' && req.method === 'POST') {
        const { success } = await env.RL.limit({ key: 'login|' + ip }); if (!success) return new Response(page(false, 'Too many tries, wait a minute'), { status: 429, headers: { 'content-type': 'text/html; charset=utf-8', ...SEC } });
        return await login(env, req);
      }
      if (p === '/admin/logout') return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': 'hk=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict', ...SEC } });
      if (p === '/admin' || p === '/admin/') return new Response(page(await authed(env, req)), { headers: { 'content-type': 'text/html; charset=utf-8', ...SEC } });
      if (p.startsWith('/admin/api/')) {
        if (!(await authed(env, req))) return J({ ok: false }, 401, SEC);
        if (p === '/admin/api/data') return J(await data(env), 200, SEC);
        if (p === '/admin/api/report' && req.method === 'POST' && req.headers.get('x-hk') === '1') {
          const o = await body(req, 3000), st = ['open', 'solved', 'ignored'].includes(o.status) ? o.status : null; if (!st) return J({ ok: false }, 400, SEC);
          await env.DB.prepare('UPDATE reports SET status=?, note=? WHERE rid=?').bind(st, clean(o.note, 500), +o.rid || 0).run(); return J({ ok: true }, 200, SEC);
        }
      }
      if (p === '/') return new Response('HAKI Strike', { headers: { 'content-type': 'text/plain' } });
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return J({ ok: false, why: 'bad request' }, 400, p.startsWith('/v1/') ? CORS : SEC);
    }
  }
};

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#EDEEF2" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2" fill="#E8132B" stroke="none"/></svg>';

const APP_CSS = `
:root{--bg:#12141B;--s1:#161821;--s2:#1B1D26;--ln:#262935;--sep:#22252F;--t1:#EDEEF2;--t2:#A3A8B8;--t3:#6E7487;--up:#3DDC97;--dn:#FF5C78;--wn:#F5A524;--red:#E8132B}
*{box-sizing:border-box;margin:0}html{background:var(--bg);color-scheme:dark}
body{font:13px/18px Inter,"Segoe UI",system-ui,sans-serif;color:var(--t1);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.login{max-width:320px;margin:18vh auto 0;display:grid;gap:12px;padding:28px;border:1px solid var(--ln);border-radius:14px;background:var(--s1)}
.login img{width:32px}.login h1{font-size:17px;font-weight:600}
input,select,textarea{height:36px;border-radius:8px;border:1px solid #2A2D39;background:var(--bg);color:var(--t1);padding:0 12px;font:inherit;outline:0}
input:focus,textarea:focus{border-color:#6E7487}
button{height:36px;border:0;border-radius:8px;background:#EDEEF2;color:#111318;font:600 13px/1 inherit;cursor:pointer;padding:0 14px}
button.sec{background:#252833;color:var(--t1);box-shadow:inset 0 0 0 1px #2E3240}button.sm{height:28px;padding:0 10px;font-size:12px}
.bad{color:var(--dn)}.ok{color:var(--up)}.muted{color:var(--t3)}
header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;height:56px;padding:0 28px;background:rgba(18,20,27,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--sep)}
header img{width:22px}header b{font-size:14px}header .sp{flex:1}header .upd{color:var(--t3);font-size:12px}
main{max-width:1180px;margin:0 auto;padding:24px 28px 64px;display:grid;gap:24px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.kpi{background:var(--s1);border:1px solid var(--ln);border-radius:12px;padding:16px}
.kpi span{color:var(--t3);font-size:12px}.kpi b{display:block;font-size:28px;line-height:34px;font-weight:600;margin-top:6px;letter-spacing:-.01em}
.kpi.hot b{color:var(--red)}
.grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
.card{background:var(--s1);border:1px solid var(--ln);border-radius:12px;padding:16px;min-width:0}
.card h2{font-size:13px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}.card h2 .muted{font-weight:500}
.bars{display:flex;align-items:flex-end;gap:3px;height:140px}.bars i{flex:1;background:#2C3040;border-radius:3px 3px 0 0;min-height:2px;position:relative}
.bars i:last-child{background:var(--up)}.bars i:hover{background:#3A4054}
.axis{display:flex;justify-content:space-between;color:var(--t3);font-size:11px;margin-top:6px}
.list{display:grid;gap:6px}.li{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.li .bar{grid-column:1/-1;height:4px;border-radius:2px;background:var(--sep);overflow:hidden}.li .bar i{display:block;height:100%;background:#6E7487}
table{width:100%;border-collapse:collapse}th{text-align:left;color:var(--t3);font-weight:500;font-size:12px;padding:0 10px 8px}
td{padding:10px;border-top:1px solid var(--sep);vertical-align:top}td.n{text-align:right;white-space:nowrap}
td.msg{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-word}
.tag{display:inline-block;height:20px;line-height:20px;padding:0 7px;border-radius:6px;background:#22252F;color:var(--t2);font-size:11px;margin:0 4px 2px 0}
.rep{border-top:1px solid var(--sep);padding:14px 0;display:grid;gap:8px}.rep:first-of-type{border-top:0;padding-top:0}
.rep .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rep .txt{white-space:pre-wrap;font-size:13.5px;line-height:20px}
.rep details summary{cursor:pointer;color:var(--t3);font-size:12px}.rep pre{margin-top:6px;padding:10px;border-radius:8px;background:var(--bg);font-size:11.5px;overflow:auto;max-height:240px}
.st-open{color:var(--wn)}.st-solved{color:var(--up)}.st-ignored{color:var(--t3)}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:9px;background:var(--bg);border:1px solid #2A2D39}
.seg button{height:24px;background:none;color:var(--t3);font-size:12px;padding:0 10px}.seg button.on{background:#22252F;color:var(--t1)}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}main,header{padding-left:16px;padding-right:16px}}
`;

const APP_JS = `
(() => {
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const app = document.getElementById('app'); let D = null, F = 'open';
  async function load() { const r = await fetch('/admin/api/data', { credentials: 'same-origin' }); if (r.status === 401) { location.reload(); return; } D = await r.json(); draw(); }
  function list(card, rows, key) {
    const max = Math.max(1, ...rows.map(r => r.n)), L = el('div', 'list');
    if (!rows.length) L.append(el('div', 'muted', 'No data yet'));
    for (const r of rows) { const li = el('div', 'li'); li.append(el('span', '', r[key] || '–'), el('b', '', String(r.n))); const b = el('div', 'bar'), i = el('i'); i.style.width = (r.n / max * 100) + '%'; b.append(i); li.append(b); L.append(li); }
    card.append(L);
  }
  function draw() {
    app.textContent = '';
    const h = el('header'); const img = el('img'); img.src = '/admin/logo.svg'; img.alt = '';
    const lo = el('button', 'sec sm', 'Sign out'); lo.onclick = () => { location.href = '/admin/logout'; };
    const rf = el('button', 'sec sm', 'Refresh'); rf.onclick = load;
    h.append(img, el('b', '', 'HAKI Strike'), el('span', 'muted', 'admin'), el('span', 'sp'), el('span', 'upd', 'Updated ' + new Date(D.now).toLocaleTimeString()), rf, lo); app.append(h);
    const m = el('main'); app.append(m);
    const k = el('div', 'kpis'); m.append(k);
    for (const [l, v, hot] of [['Users, all time', D.total], ['Active today', D.today], ['Active, 7 days', D.week], ['New today', D.newToday], ['Open reports', D.open, D.open > 0]]) { const c = el('div', 'kpi' + (hot ? ' hot' : '')); c.append(el('span', '', l), el('b', '', String(v))); k.append(c); }
    const g = el('div', 'grid'); m.append(g);
    const c1 = el('div', 'card'); c1.append(el('h2', '', 'Active users per day'));
    const days = []; for (let i = 29; i >= 0; i--) days.push(new Date(D.now - i * 864e5).toISOString().slice(0, 10));
    const by = Object.fromEntries(D.daily.map(r => [r.day, r.n])), mx = Math.max(1, ...days.map(d => by[d] || 0)), bars = el('div', 'bars');
    for (const d of days) { const i = el('i'); i.style.height = ((by[d] || 0) / mx * 100) + '%'; i.title = d + ': ' + (by[d] || 0); bars.append(i); }
    const ax = el('div', 'axis'); ax.append(el('span', '', days[0].slice(5)), el('span', '', 'today ' + (by[days[29]] || 0)));
    c1.append(bars, ax); g.append(c1);
    const c2 = el('div', 'card'); c2.append(el('h2', '', 'Versions, 7 days')); list(c2, D.versions, 'ver'); g.append(c2);
    const c3 = el('div', 'card'); c3.append(el('h2', '', 'Sites, 7 days')); list(c3, D.hosts, 'host'); c3.append(el('div', '', '\\u00a0')); const hc = el('h2', '', 'Chains'); c3.append(hc); list(c3, D.chains, 'chain'); g.append(c3);
    /* reports */
    const r = el('div', 'card'), rh = el('h2', '', 'Reports'); const seg = el('div', 'seg');
    for (const f of ['open', 'solved', 'ignored', 'all']) { const b = el('button', f === F ? 'on' : '', f[0].toUpperCase() + f.slice(1)); b.onclick = () => { F = f; draw(); }; seg.append(b); }
    rh.append(el('span', 'sp')); rh.style.justifyContent = 'space-between'; rh.append(seg); r.append(rh);
    const RS = D.reports.filter(x => F === 'all' || x.status === F); if (!RS.length) r.append(el('div', 'muted', 'Nothing here'));
    for (const x of RS) {
      const w = el('div', 'rep'), top = el('div', 'top');
      top.append(el('b', '', '#' + x.rid), el('span', 'tag', 'v' + x.ver), el('span', 'tag', x.host), el('span', 'tag', x.chain || 'sol'), el('span', 'muted', ago(x.t)), el('span', 'st-' + x.status, x.status));
      const sp = el('span'); sp.style.flex = '1'; top.append(sp);
      for (const s of ['solved', 'ignored', 'open']) if (s !== x.status) { const b = el('button', 'sec sm', s === 'open' ? 'Reopen' : s === 'solved' ? 'Mark solved' : 'Ignore'); b.onclick = async () => { b.disabled = true; await fetch('/admin/api/report', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hk': '1' }, body: JSON.stringify({ rid: x.rid, status: s, note: x.note || '' }) }); load(); }; top.append(b); }
      w.append(top, el('div', 'txt', x.text));
      if (x.ctx && x.ctx !== '{}') { const dt = el('details'), su = el('summary', '', 'Details from the extension'); let pre = x.ctx; try { pre = JSON.stringify(JSON.parse(x.ctx), null, 2); } catch (_) {} dt.append(su, el('pre', '', pre)); w.append(dt); }
      r.append(w);
    }
    m.append(r);
    /* errors */
    const e = el('div', 'card'); e.append(el('h2', '', 'Errors')); const t = el('table'), th = el('tr');
    for (const c of ['Where', 'Message', 'Times', 'Users', 'Versions', 'Last']) th.append(el('th', '', c)); t.append(th);
    if (!D.errors.length) { const tr = el('tr'), td = el('td', 'muted', 'No errors yet'); td.colSpan = 6; tr.append(td); t.append(tr); }
    for (const x of D.errors) { const tr = el('tr'); tr.append(el('td', '', x.kind), el('td', 'msg', x.msg), el('td', 'n', String(x.n)), el('td', 'n', String(x.users)), el('td', 'muted', (x.vers || '').trim()), el('td', 'n muted', ago(x.last))); t.append(tr); }
    e.append(t); m.append(e);
  }
  load(); setInterval(load, 60000);
})();
`;
