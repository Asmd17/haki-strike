import APP_CSS from './ui/app.css';
import APP_JS from './ui/app.js.txt';
import LOGO from './logo.svg';
import PRIVACY from './ui/privacy.html';

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
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
async function login(env, req) {
  const f = await req.formData(), p = String(f.get('p') || '');
  if (!env.ADMIN_PASS || !eq(await hmac('cmp', p), await hmac('cmp', env.ADMIN_PASS))) return new Response(page(false, 'Wrong password'), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', ...SEC } });
  const exp = Date.now() + 7 * 864e5, sig = await hmac(env.ADMIN_PASS, 'admin|' + exp);
  return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': 'hk=' + exp + '.' + sig + '; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=604800', ...SEC } });
}
async function data(env) {
  const now = Date.now(), D = n => day(now - n * 864e5), q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [tot, newT, newY, a1, a0, a7, ap7, daily, newDaily, vers, hosts, chains, errs, err24, reps, cnt] = await env.DB.batch([
    q('SELECT count(*) n FROM installs'), q('SELECT count(*) n FROM installs WHERE first>=?', Date.parse(D(0))), q('SELECT count(*) n FROM installs WHERE first>=? AND first<?', Date.parse(D(1)), Date.parse(D(0))),
    q('SELECT count(*) n FROM active WHERE day=?', D(0)), q('SELECT count(*) n FROM active WHERE day=?', D(1)),
    q('SELECT count(DISTINCT id) n FROM active WHERE day>=?', D(6)), q('SELECT count(DISTINCT id) n FROM active WHERE day>=? AND day<=?', D(13), D(7)),
    q('SELECT day, count(*) n FROM active WHERE day>=? GROUP BY day ORDER BY day', D(29)),
    q("SELECT strftime('%Y-%m-%d', first/1000, 'unixepoch') day, count(*) n FROM installs WHERE first>=? GROUP BY day ORDER BY day", Date.parse(D(29))),
    q('SELECT ver, count(DISTINCT id) n FROM active WHERE day>=? GROUP BY ver ORDER BY n DESC LIMIT 8', D(6)),
    q('SELECT host, count(DISTINCT id) n FROM active WHERE day>=? GROUP BY host ORDER BY n DESC', D(6)),
    q("SELECT CASE chain WHEN '' THEN 'sol' ELSE chain END chain, count(*) n FROM installs WHERE last>=? GROUP BY 1 ORDER BY n DESC", now - 7 * 864e5),
    q('SELECT kind, msg, n, users, vers, hosts, first, last FROM errs ORDER BY last DESC LIMIT 80'),
    q('SELECT count(*) n FROM errs WHERE last>=?', now - 864e5),
    q('SELECT rid, t, ver, host, chain, text, ctx, status, note FROM reports ORDER BY rid DESC LIMIT 200'),
    q('SELECT status, count(*) n FROM reports GROUP BY status')]);
  const one = r => (r.results[0] || {}).n || 0;
  return { now, total: one(tot), newToday: one(newT), newYesterday: one(newY), today: one(a1), yesterday: one(a0), week: one(a7), prevWeek: one(ap7),
    daily: daily.results, newDaily: newDaily.results, versions: vers.results, hosts: hosts.results, chains: chains.results, errors: errs.results, err24: one(err24),
    reports: reps.results, counts: Object.fromEntries(cnt.results.map(r => [r.status, r.n])) };
}
const page = (ok, msg) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAKI Strike admin</title>'
  + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">'
  + '<link rel="icon" href="/admin/logo.svg"><link rel="stylesheet" href="/admin/app.css"></head><body>'
  + (ok ? '<div id="app"></div><script src="/admin/app.js"></script>'
    : '<form class="login" method="post" action="/admin/login"><img src="/admin/logo.svg" alt=""><div><h1>HAKI Strike admin</h1><p>Users, errors and reports from the extension.</p></div>' + (msg ? '<p class="bad">' + msg + '</p>' : '')
      + '<input name="p" type="password" placeholder="Password" aria-label="Password" autocomplete="current-password" autofocus required><button class="pri">Sign in</button></form>')
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
      if (p === '/privacy' || p === '/privacy/') return new Response(PRIVACY, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'" } });
      if (p === '/') return new Response('HAKI Strike', { headers: { 'content-type': 'text/plain' } });
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return J({ ok: false, why: 'bad request' }, 400, p.startsWith('/v1/') ? CORS : SEC);
    }
  }
};
