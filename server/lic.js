/* HAKI Strike subscription (owner 2026-11-22: 1 SOL a month, 7 days free once, paper trading free, only the owner free for good).
   The extension sends: its install ID, a device hash (screen, GPU, CPU, time zone: no names), its Solana wallet ADDRESSES with a signature
   of "HAKI Strike license <id> <time>" made by each wallet (proof the wallet is really there; never a key), and when it paid, the payment's
   transaction signature. The answer is a token signed with LIC_KEY (Ed25519); the extension checks it with the public key it ships with.
   One free week per person: refused when the device hash, the IP (90 days), one of the wallets, or the wallet that funded a new wallet
   has already had one. Payments: SOL sent to the treasury, matched by the memo "HAKI-<code>" or by the exact amount price + code / 1e6 SOL. */

const DAY = 864e5, IPDAYS = 90;
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58d(s) {
  let n = 0n; for (const ch of s) { const i = A58.indexOf(ch); if (i < 0) throw new Error('b58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch !== '1') break; out.unshift(0); } return Uint8Array.from(out);
}
const b64 = b => btoa(String.fromCharCode(...b)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const te = s => new TextEncoder().encode(s);
async function hash(s) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', te(s))); return [...b.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join(''); }

async function conf(env) {
  const r = await env.DB.prepare('SELECT k, v FROM conf').all(), c = Object.fromEntries((r.results || []).map(x => [x.k, x.v]));
  const treasury = ADDR.test(c.treasury || '') ? c.treasury : '';
  return { treasury, enforce: c.enforce === '1', price: Math.max(0.01, +c.price || 1), trialDays: Math.max(0, +c.trial_days || 7),
    owners: String(c.owners || '').split(/[\s,]+/).filter(x => ADDR.test(x)).concat(treasury ? [treasury] : []) };
}
async function rpc(method, params) {
  const r = await fetch('https://solana-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc'); return j.result;
}
async function verifyWallet(pub, sig, msg) {
  try { const k = await crypto.subtle.importKey('raw', b58d(pub), { name: 'Ed25519' }, false, ['verify']); return await crypto.subtle.verify({ name: 'Ed25519' }, k, b58d(sig), msg); } catch (_) { return false; }
}
/* the wallet that sent a NEW wallet its first SOL (an old wallet, 1000+ transactions, is not looked at) */
async function funder(env, w) {
  const c = await env.DB.prepare('SELECT f FROM funders WHERE w=?').bind(w).first(); if (c) return c.f;
  let f = '';
  try {
    const L = await rpc('getSignaturesForAddress', [w, { limit: 1000 }]);
    if (L && L.length && L.length < 1000) {
      const tx = await rpc('getTransaction', [L[L.length - 1].signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
      const keys = tx.transaction.message.accountKeys.map(k => k.pubkey || k), pre = tx.meta.preBalances, post = tx.meta.postBalances;
      let best = 0; keys.forEach((k, i) => { const d = post[i] - pre[i]; if (k !== w && d < best) { best = d; f = k; } });
    }
  } catch (_) { return ''; }   /* not cached: tried again next time */
  await env.DB.prepare('INSERT OR REPLACE INTO funders(w,f) VALUES(?,?)').bind(w, f).run(); return f;
}
async function newCode(env) {
  for (let i = 0; i < 20; i++) { const c = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000); if (!(await env.DB.prepare('SELECT 1 FROM lic WHERE code=?').bind(c).first())) return c; }
  throw new Error('no code');
}
async function signTok(env, p) {
  const tok = JSON.stringify(p), k = await crypto.subtle.importKey('pkcs8', unb64(env.LIC_KEY), { name: 'Ed25519' }, false, ['sign']);
  return { tok, sig: b64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, k, te(tok)))) };
}
function status(L, C, owner, now) {
  if (owner || L.free) return { st: 'free', until: now + 3650 * DAY };
  if (L.paid_until > now) return { st: 'paid', until: L.paid_until };
  if (!C.enforce) return { st: 'open', until: now + 3 * DAY };   /* payments not switched on yet: everyone trades, no free week is used up */
  if (L.trial_start && L.trial_ok) { const end = L.trial_start + C.trialDays * DAY; return { st: end > now ? 'trial' : 'ended', until: end, paidBefore: L.paid_until > 0 }; }
  if (L.trial_ok === 0) return { st: L.paid_until > 0 ? 'ended' : 'notrial', until: L.paid_until || 0, why: L.why || '' };
  return { st: 'pending', until: 0 };
}

/* a payment transaction -> lamports the treasury received, the memo text */
async function readPay(sig, C) {
  const tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
  if (!tx || !tx.meta || tx.meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map(k => k.pubkey || k), i = keys.indexOf(C.treasury); if (i < 0) return null;
  const got = tx.meta.postBalances[i] - tx.meta.preBalances[i]; if (!(got > 0)) return null;
  let memo = ''; for (const ix of tx.transaction.message.instructions || []) if (ix.program === 'spl-memo' && typeof ix.parsed === 'string') memo += ix.parsed;
  const from = keys.find((k, j) => j !== i && tx.meta.postBalances[j] - tx.meta.preBalances[j] < 0) || '';
  return { got, memo, from, at: (tx.blockTime || 0) * 1000 };
}
/* which subscription a payment is for, and how many days it buys */
function match(p, C) {
  const price = Math.round(C.price * 1e9), m = /HAKI-(\d{4})/.exec(p.memo || '');
  if (m) return { code: +m[1], days: Math.floor(p.got / price * 30) };
  for (let k = 1; k <= 12; k++) { const x = p.got - k * price; if (x >= 1000 * 1000 && x <= 9999 * 1000 && x % 1000 === 0) return { code: x / 1000, days: 30 * k }; }
  return null;
}
async function credit(env, sig, p, C) {
  if (await env.DB.prepare('SELECT 1 FROM pays WHERE sig=?').bind(sig).first()) return false;
  const mt = match(p, C), L = mt ? await env.DB.prepare('SELECT id, paid_until FROM lic WHERE code=?').bind(mt.code).first() : null;
  const days = L && mt.days > 0 ? mt.days : 0, now = Date.now();
  await env.DB.prepare('INSERT INTO pays(sig,id,src,lamports,days,at) VALUES(?,?,?,?,?,?)').bind(sig, L ? L.id : null, p.from, p.got, days, p.at || now).run();
  if (L && days) await env.DB.prepare('UPDATE lic SET paid_until=? WHERE id=?').bind(Math.max(now, L.paid_until || 0) + days * DAY, L.id).run();
  return !!(L && days);
}
/* the treasury's latest transactions: payments sent from any wallet or exchange (no memo needed: the exact amount names the user) */
async function scan(env, C, limit) {
  if (!C.treasury) return 0;
  const L = await rpc('getSignaturesForAddress', [C.treasury, { limit: 60, commitment: 'confirmed' }]); let n = 0, looked = 0;
  for (const s of L || []) {
    if (s.err || looked >= limit) continue;
    if (await env.DB.prepare('SELECT 1 FROM pays WHERE sig=?').bind(s.signature).first()) continue;
    if (await env.DB.prepare('SELECT 1 FROM seen WHERE sig=?').bind(s.signature).first()) continue;
    looked++; const p = await readPay(s.signature, C).catch(() => null);
    if (p && p.got >= 0.005e9) { if (await credit(env, s.signature, p, C)) n++; }
    else await env.DB.prepare('INSERT OR IGNORE INTO seen(sig,at) VALUES(?,?)').bind(s.signature, Date.now()).run();   /* the owner's own trades etc. */
  }
  return n;
}

export async function licHello(env, req, o, J, CORS) {
  const id = String(o.id || ''); if (!/^[a-z0-9]{16,40}$/.test(id)) return J({ ok: false }, 400, CORS);
  const now = Date.now(), t = +o.t || 0, C = await conf(env), ip = await hash('ip|' + (req.headers.get('cf-connecting-ip') || '')), fp = /^[0-9a-f]{24}$/.test(o.fp || '') ? o.fp : '';
  /* proven wallets: the signature over "HAKI Strike license <id> <t>", t within 10 minutes */
  const W = []; if (Math.abs(now - t) < 10 * 60e3) { const msg = te('HAKI Strike license ' + id + ' ' + t);
    for (const w of (Array.isArray(o.w) ? o.w : []).slice(0, 25)) if (w && ADDR.test(w.pub || '') && typeof w.sig === 'string' && await verifyWallet(w.pub, w.sig, msg)) W.push(w.pub); }
  let L = await env.DB.prepare('SELECT * FROM lic WHERE id=?').bind(id).first();
  if (!L) { await env.DB.prepare('INSERT INTO lic(id,created,code,last) VALUES(?,?,?,?)').bind(id, now, await newCode(env), now).run(); L = await env.DB.prepare('SELECT * FROM lic WHERE id=?').bind(id).first(); }
  const wallets = [...new Set(String(L.wallets || '').split(',').filter(Boolean).concat(W))].slice(-40);
  await env.DB.prepare('UPDATE lic SET last=?, fp=CASE WHEN ?<>\'\' THEN ? ELSE fp END, ip=?, wallets=?, ver=? WHERE id=?').bind(now, fp, fp, ip, wallets.join(','), String(o.ver || '').slice(0, 12), id).run();
  const owner = W.some(w => C.owners.includes(w));
  /* the free week: starts once a wallet is proven (or for a BSC-only user, at once); refused when this person had one already */
  if (C.enforce && !owner && !L.free && L.trial_start == null && L.trial_ok == null && (W.length || o.bsc)) {
    const fund = []; for (const w of W) { const f = await funder(env, w); if (f && ADDR.test(f)) fund.push(f); }
    const vals = [...new Set(W.concat(fund))], q = 'SELECT kind, id FROM marks WHERE id<>? AND ((kind=\'fp\' AND val=?) OR (kind=\'ip\' AND val=? AND at>?)'
      + (vals.length ? ' OR (kind=\'w\' AND val IN (' + vals.map(() => '?').join(',') + '))' : '') + ') LIMIT 1';
    const hit = await env.DB.prepare(q).bind(id, fp || '-', ip, now - IPDAYS * DAY, ...vals).first();
    if (hit) { await env.DB.prepare('UPDATE lic SET trial_ok=0, why=? WHERE id=?').bind(hit.kind === 'fp' ? 'device' : hit.kind === 'ip' ? 'ip' : 'wallet', id).run(); }
    else await env.DB.prepare('UPDATE lic SET trial_start=?, trial_ok=1 WHERE id=?').bind(now, id).run();
  }
  /* everything this person used is marked, so a new install, wallet or device on the same things gets no second week */
  const mk = [['ip', ip]].concat(fp ? [['fp', fp]] : [], W.map(w => ['w', w]));
  await env.DB.batch(mk.map(([k, v]) => env.DB.prepare('INSERT INTO marks(kind,val,id,at) VALUES(?,?,?,?) ON CONFLICT(kind,val) DO UPDATE SET at=CASE WHEN marks.id=excluded.id THEN excluded.at ELSE marks.at END').bind(k, v, id, now)));
  if (o.check) await scan(env, C, 15).catch(() => 0);   /* "I sent it: check" in the settings */
  L = await env.DB.prepare('SELECT * FROM lic WHERE id=?').bind(id).first();
  const S = status(L, C, owner, now);
  const pay = (C.price + L.code / 1e6).toFixed(6);
  return J(Object.assign({ ok: true }, await signTok(env, Object.assign({ id, at: now, exp: now + 2 * DAY, price: C.price, treasury: C.treasury, code: L.code, pay, trialDays: C.trialDays }, S))), 200, CORS);
}
export async function licPaid(env, o, J, CORS) {   /* the extension paid from its own wallet: {id, sig} */
  const id = String(o.id || ''), sig = String(o.sig || ''); if (!/^[a-z0-9]{16,40}$/.test(id) || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) return J({ ok: false }, 400, CORS);
  const C = await conf(env); let p = null;
  for (let i = 0; i < 6 && !p; i++) { p = await readPay(sig, C).catch(() => null); if (!p) await new Promise(r => setTimeout(r, 2500)); }
  if (!p) return J({ ok: false, why: 'Payment not found yet. It is checked again automatically.' }, 200, CORS);
  const ok = await credit(env, sig, p, C); return J({ ok }, 200, CORS);
}

/* ---------- admin ---------- */
export async function licAdmin(env) {
  const C = await conf(env), now = Date.now(), q = (s, ...a) => env.DB.prepare(s).bind(...a);
  const [L, P, sum, month] = await env.DB.batch([
    q('SELECT id, created, last, ver, trial_start, trial_ok, why, paid_until, free, code, wallets FROM lic ORDER BY last DESC LIMIT 300'),
    q('SELECT sig, id, src, lamports, days, at FROM pays ORDER BY at DESC LIMIT 100'),
    q('SELECT coalesce(sum(lamports),0) s FROM pays WHERE id IS NOT NULL'),
    q('SELECT coalesce(sum(lamports),0) s FROM pays WHERE id IS NOT NULL AND at>=?', now - 30 * DAY)]);
  const rows = (L.results || []).map(r => Object.assign({ id: r.id, created: r.created, last: r.last, ver: r.ver, code: r.code, nw: String(r.wallets || '').split(',').filter(Boolean).length, owner: String(r.wallets || '').split(',').some(w => C.owners.includes(w)) },
    status(r, C, String(r.wallets || '').split(',').some(w => C.owners.includes(w)), now)));
  const n = s => rows.filter(r => r.st === s).length;   /* 'open': payments not on yet */
  return { conf: { enforce: C.enforce, treasury: C.treasury, price: C.price, trialDays: C.trialDays, owners: C.owners.filter(x => x !== C.treasury).join(' ') },
    counts: { paid: n('paid'), trial: n('trial'), ended: n('ended') + n('notrial'), free: n('free') }, revenue: (sum.results[0] || {}).s / 1e9, month: (month.results[0] || {}).s / 1e9,
    users: rows, pays: P.results || [] };
}
export async function licAct(env, o) {
  const id = String(o.id || ''), now = Date.now(); if (o.act === 'conf') {
    const st = [];
    if (o.treasury != null) { if (o.treasury && !ADDR.test(o.treasury)) throw new Error('bad address'); st.push(['treasury', o.treasury]); }
    if (o.price != null) { const p = +o.price; if (!(p >= 0.01 && p <= 1000)) throw new Error('bad price'); st.push(['price', String(p)]); }
    if (o.trialDays != null) st.push(['trial_days', String(Math.max(0, Math.min(60, +o.trialDays || 0)))]);
    if (o.owners != null) st.push(['owners', String(o.owners).split(/[\s,]+/).filter(x => ADDR.test(x)).join(' ')]);
    if (o.enforce != null) { if (o.enforce && !(o.treasury || (await conf(env)).treasury)) throw new Error('set the payment address first'); st.push(['enforce', o.enforce ? '1' : '0']); }
    await env.DB.batch(st.map(([k, v]) => env.DB.prepare('INSERT OR REPLACE INTO conf(k,v) VALUES(?,?)').bind(k, v))); return { ok: true };
  }
  if (o.act === 'scan') return { ok: true, n: await scan(env, await conf(env), 30) };
  const L = await env.DB.prepare('SELECT * FROM lic WHERE id=?').bind(id).first(); if (!L) throw new Error('no such user');
  if (o.act === 'add30') await env.DB.prepare('UPDATE lic SET paid_until=? WHERE id=?').bind(Math.max(now, L.paid_until || 0) + 30 * DAY, id).run();
  else if (o.act === 'end') await env.DB.prepare('UPDATE lic SET paid_until=0, free=0, trial_start=CASE WHEN trial_start IS NULL THEN NULL ELSE 1 END WHERE id=?').bind(id).run();
  else if (o.act === 'free') await env.DB.prepare('UPDATE lic SET free=CASE WHEN free=1 THEN 0 ELSE 1 END WHERE id=?').bind(id).run();
  else if (o.act === 'trial') await env.DB.prepare('UPDATE lic SET trial_start=?, trial_ok=1, why=NULL WHERE id=?').bind(now, id).run();
  else throw new Error('bad act');
  return { ok: true };
}
