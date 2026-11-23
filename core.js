/* HAKI Strike, standalone (owner 1116: "no server, just the extension"). Everything a trade needs, in the extension itself:
   base58, the Solana transaction layout, Ed25519 signing (WebCrypto), the wallet sealed with your password (PBKDF2-SHA256 + AES-GCM),
   Jupiter (route + swap with a Jito tip), sending to Jito's block engine and a public node. Loaded by bg.js (importScripts) and by the tests (node). */
'use strict';
const SOLX = (() => {
  const WSOL = 'So11111111111111111111111111111111111111112';
  const TOKEN_PROGS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const CONF = { jupKey: '' };   /* a free key from portal.jup.ag lifts the shared per-IP limit of lite-api ("Too many requests") */
  const jbase = () => CONF.jupKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /* Jupiter's free limits per IP (read from its x-ratelimit-* headers, 2026-11): /swap 5 per ~10 s, quotes 100. RL keeps what is left per
     kind; a trade that meets a 429 waits for the window to reset (max 10 s) and goes; a pre-build never waits and never spends the last 2. */
  const RL = {}, JW = { ms: 0 };   /* 3.12.18: time trades spent waiting for Jupiter's limit (shown in the status) */
  const kind = path => path.split('?')[0] === '/swap/v1/swap' ? 'swap' : path.startsWith('/swap/v1/swap-instructions') ? 'ix' : path.startsWith('/swap/v1/quote') ? 'quote' : 'other';   /* 3.12.18: quotes have their own counter */
  const rlLeft = k => { const x = RL[k]; return !x || Date.now() > x.reset ? Infinity : x.rem; };
  async function JF(path, opts, soft) {
    const k = kind(path);
    for (let i = 0; ; i++) {
      const h = Object.assign({}, (opts || {}).headers || {}); if (CONF.jupKey) h['x-api-key'] = CONF.jupKey;
      const r = await fetch(jbase() + path, Object.assign({}, opts || {}, { headers: h }));
      const rem = +r.headers.get('x-ratelimit-remaining'), rs = +r.headers.get('x-ratelimit-reset');
      if (rs > 0) RL[k] = { rem: isFinite(rem) ? rem : 0, reset: rs * 1000 };
      if (r.status !== 429 || i >= 2 || soft) return r;
      const wait = RL[k] && RL[k].reset > Date.now() ? Math.min(10000, RL[k].reset - Date.now() + 150) : [400, 1200][i];
      JW.ms += wait; await sleep(wait);
    }
  }
  const JITO = 'https://mainnet.block-engine.jito.wtf/api/v1/transactions';
  const RPC = 'https://solana-rpc.publicnode.com';   // the public mainnet-beta node answers 403 to browsers and extensions
  const TIP_MAX = 0.01, TIP_DEF = 0.0003, FEE_RESERVE = 0.004, MAX_IMPACT = 30;
  const subtle = globalThis.crypto.subtle;

  function b58e(b) {
    b = b instanceof Uint8Array ? b : new Uint8Array(b);
    let n = 0n; for (const x of b) n = n * 256n + BigInt(x);
    let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const x of b) { if (x) break; s = '1' + s; }
    return s;
  }
  function b58d(s) {
    let n = 0n;
    for (const ch of s) { const i = A.indexOf(ch); if (i < 0) throw new Error('not base58'); n = n * 58n + BigInt(i); }
    const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
    for (const ch of s) { if (ch !== '1') break; out.unshift(0); }
    return new Uint8Array(out);
  }
  const isAddr = s => { try { return typeof s === 'string' && s.length >= 32 && s.length <= 44 && b58d(s).length === 32; } catch (_) { return false; } };
  function cu16(b, i) { let v = 0, sh = 0; for (let k = 0; k < 3; k++) { const x = b[i + k]; v |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) return [v, i + k + 1]; } throw new Error('bad compact-u16'); }
  function parseTx(raw) {
    const [nsig, i] = cu16(raw, 0), sigAt = i, m = i + 64 * nsig;
    if (m >= raw.length) throw new Error('short transaction');
    if ((raw[m] & 0x80) && (raw[m] & 0x7f) !== 0) throw new Error('unsupported transaction version');
    const j = (raw[m] & 0x80) ? m + 1 : m, need = raw[j]; const [nk, k] = cu16(raw, j + 3);
    if (k + 32 * nk > raw.length) throw new Error('short transaction');
    const keys = []; for (let x = 0; x < nk; x++) keys.push(b58e(raw.slice(k + 32 * x, k + 32 * x + 32)));
    return { nsig, sigAt, msgAt: m, need, keys };
  }
  const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const b64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const PK8 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

  async function pubOf(seed) {   /* WebCrypto has no 'seed -> public key': import PKCS#8, export JWK, its x is the public key */
    const p = new Uint8Array(48); p.set(PK8); p.set(seed, 16);
    const k = await subtle.importKey('pkcs8', p, 'Ed25519', true, ['sign']);
    return b58e(fromB64u((await subtle.exportKey('jwk', k)).x));
  }
  async function sign(seed, msg) {
    const p = new Uint8Array(48); p.set(PK8); p.set(seed, 16);
    const k = await subtle.importKey('pkcs8', p, 'Ed25519', false, ['sign']);
    return new Uint8Array(await subtle.sign('Ed25519', k, msg));
  }
  /* sign a Jupiter-built transaction with OUR key only: our wallet pays and is the only signer asked for */
  async function signTx(raw, seed, pub) {
    const p = parseTx(raw);
    if (p.need !== 1 || p.nsig !== 1) throw new Error('the transaction asks for ' + p.need + ' signers');
    if (p.keys[0] !== pub) throw new Error('the transaction is not paid by your wallet');
    const sig = await sign(seed, raw.slice(p.msgAt)); const out = raw.slice(); out.set(sig, p.sigAt);
    return [out, b58e(sig)];
  }
  /* a secret key as Phantom / Solflare export it (base58, 64 bytes), a base58 seed (32) or a solana-keygen JSON array -> {seed, pub} */
  async function readSecret(s, expect) {
    s = String(s || '').trim(); let raw;
    try { raw = s.startsWith('[') ? Uint8Array.from(JSON.parse(s)) : b58d(s); } catch (_) { throw new Error('not a Solana private key'); }
    if (raw.length !== 64 && raw.length !== 32) throw new Error('a Solana private key is 32 or 64 bytes, this one is ' + raw.length);
    const seed = raw.slice(0, 32), pub = await pubOf(seed);
    if (raw.length === 64 && b58e(raw.slice(32)) !== pub) throw new Error('damaged key: its public half does not match');
    if (expect && expect !== pub) throw new Error('this key belongs to ' + pub + ', not ' + expect);
    return { seed, pub };
  }
  /* the seed sealed with the password: PBKDF2-SHA256 600k -> AES-256-GCM */
  async function kek(pass, salt) {
    const base = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(seed, pub, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(pub) }, await kek(pass, salt), seed));
    return { v: 1, pub, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function unseal(box, pass) {
    let seed;
    try { seed = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: new TextEncoder().encode(box.pub) }, await kek(pass, unb64(box.salt)), unb64(box.ct))); }
    catch (_) { throw new Error('wrong password'); }
    if (await pubOf(seed) !== box.pub) throw new Error('wallet data damaged');
    return seed;
  }
  function sellAmount(raw, pct) { raw = BigInt(raw); if (raw <= 0n || !(pct > 0 && pct <= 100)) return 0n; if (pct >= 100) return raw; return raw * BigInt(Math.round(pct * 100)) / 10000n; }

  /* ---- network ---- */
  async function rpc(method, params, url) {
    const r = await fetch(url || RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json().catch(() => null);
    if (j && 'result' in j) return j.result;
    throw new Error('Solana node: ' + JSON.stringify((j && j.error) || r.status).slice(0, 120));
  }
  async function balance(pub, url) { return ((await rpc('getBalance', [pub, { commitment: 'confirmed' }], url)) || {}).value || 0; }
  async function tokBal(owner, mint, url) {
    if (!url) {   /* the free public node refuses token-account lookups ("Request blocked"): Jupiter's holdings answer them */
      const r = await JF('/ultra/v1/holdings/' + owner); const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error('could not read your token balance (' + r.status + ')');
      let raw = 0n, dec = null;
      for (const x of ((j.tokens || {})[mint]) || []) { raw += BigInt(x.amount || 0); if (x.decimals != null) dec = x.decimals; }
      return { raw, dec };
    }
    let raw = 0n, dec = null;
    for (const prog of TOKEN_PROGS) {
      const r = await rpc('getTokenAccountsByOwner', [owner, { programId: prog }, { encoding: 'jsonParsed' }], url);
      for (const x of (r && r.value) || []) {
        const info = (((x.account || {}).data || {}).parsed || {}).info || {};
        if (info.mint !== mint) continue;
        const ta = info.tokenAmount || {}; raw += BigInt(ta.amount || 0); if (ta.decimals != null) dec = ta.decimals;
      }
    }
    return { raw, dec };
  }
  const MC = new Map();
  async function mintOf(a, url, known) {   /* /token/<mint> and Pulse rows hold the mint (known: no lookup); an old /meme/<pair> link holds the pair */
    if (!isAddr(a)) throw new Error('not a Solana address');
    if (a === WSOL) throw new Error('that is SOL itself');
    if (known) return a;
    if (MC.has(a)) return MC.get(a);
    let m = null;
    const acc = await rpc('getAccountInfo', [a, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }], url);
    if (TOKEN_PROGS.includes(((acc || {}).value || {}).owner)) m = a;
    else {
      try {
        const j = await (await fetch('https://api.dexscreener.com/latest/dex/pairs/solana/' + a)).json();
        for (const p of (j && j.pairs) || []) { const b = (p.baseToken || {}).address, q = (p.quoteToken || {}).address, x = b === WSOL ? q : b; if (isAddr(x) && x !== WSOL) { m = x; break; } }
      } catch (_) {}
    }
    if (!m) throw new Error('no token found for this address');
    if (MC.size > 2000) MC.clear(); MC.set(a, m); return m;
  }
  async function quote(inp, out, amount, slipBps, maxAcc) {
    const u = '/swap/v1/quote?inputMint=' + inp + '&outputMint=' + out + '&amount=' + amount + '&slippageBps=' + slipBps + '&restrictIntermediateTokens=true&maxAccounts=' + (maxAcc || 56);   /* room for our tip + priority fee in one transaction */
    const r = await JF(u); const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.outAmount) throw new Error('no route: ' + String((j && (j.error || j.message)) || r.status).slice(0, 120));
    return j;
  }
  async function build(q, pub, tipLamports, soft) {
    const body = { quoteResponse: q, userPublicKey: pub, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, dynamicSlippage: false };
    if (tipLamports > 0) body.prioritizationFeeLamports = { jitoTipLamports: tipLamports };
    const r = await JF('/swap/v1/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, soft);
    const j = await r.json().catch(() => null);
    if (!j || !j.swapTransaction) throw new Error('could not build the swap: ' + String((j && (j.error || j.message)) || r.status).slice(0, 120));
    const raw = unb64(j.swapTransaction); await vetRoute(txIxs(raw), pub); return raw;   /* 3.21.5: the same check as our own routes */
  }
  async function sendAll(tx64, url) {   /* the same signed transaction to Jito and to the node at once: ok when either took it */
    const one = async (u, params) => { try { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params }) }); const j = await r.json(); return ['result' in j, u, JSON.stringify(j.error || '').slice(0, 100)]; } catch (e) { return [false, u, String(e).slice(0, 100)]; } };
    const rs = await Promise.all([one(JITO, [tx64, { encoding: 'base64' }]), one(url || RPC, [tx64, { encoding: 'base64', skipPreflight: true, maxRetries: 3 }])]);
    if (!rs.some(x => x[0])) throw new Error('no node took it: ' + rs.map(x => x[2]).join('; '));
    return rs.filter(x => x[0]).map(x => new URL(x[1]).host);
  }
  const NEWCOIN = /Missing token program/i, NOQ = new Map();   /* coins Jupiter has no direct SOL route for (last seen) */
  /* two clicks in the same block would make byte-identical transactions (same blockhash, amounts, accounts) and the second is dropped as a
     duplicate: each transaction gets its own compute-unit limit (+1..63 units, no cost change) so every click lands as its own trade */
  let UQ = 0; const uq = () => (UQ = UQ % 63 + 1);
  const USED = new WeakSet();
  const PMISS = new Map();   /* 3.11.4 wallet|mint|side -> why the last pre-build did not happen */
  const PREP = new Map(); const PREP_MS = 8000;   /* a pre-built trade is used for 8 s (price moves inside the slippage; the blockhash lives ~60 s).
     3.12.4: was 4 s with a rebuild every 2.5 s while hovering = ~50-75 Jupiter calls a minute, over the free limit: the hover build failed
     and the click built from scratch (owner 1119: 'sent in 288 ms, not ready'). Now rebuilt every 6 s = ~20 calls a minute. */
  const pkey = (m, side, x, o, pub) => [pub, m, side, String(x), +o.slip || 20, +o.tip, +o.prio].join('|');   /* per wallet: it pays and signs */
  /* 3.8.0 (owner 1117, 99fes..pump "no route"): a pump.fun curve quoted in another meme coin (GTAVI). Jupiter has SOL -> GTAVI and GTAVI ->
     coin but will not chain them through a meme coin. We put both routes in one transaction: all or nothing. The second leg spends a fixed
     amount, 98 % of what the first is quoted to give (the first leg's output moves with other trades in the same block); the ~2 % rest stays
     in the wallet as the quote coin. A first leg that gives less than that fails the whole trade (nothing spent but the fee) and it is retried. */
  const LEG_KEEP = 0.98, LEG_ACC = 40,   /* two routes share one transaction's account room */ NOROUTE = /No routes found|NO_ROUTES_FOUND|COULD_NOT_FIND_ANY_ROUTE/i;
  /* the SOL <-> quote-coin leg: its best pool may need many accounts (a DLMM ~64) and both routes share 1232 bytes, so it is quoted at a few
     account caps at once, best output first; the coin leg (its pump.fun curve / pool) fits in 40 */
  const SOL_LEG = [64, 56, 48, 40, 32];   /* 3.9.9: 32 too, one more chance for both legs to fit one transaction */
  async function solLegs(inp, out, amt, slipBps) {
    const rs = await Promise.all(SOL_LEG.map(n => quote(inp, out, amt, slipBps, n).catch(() => null))), seen = new Set(), L = [];
    for (const q of rs) { if (!q) continue; const k = (q.routePlan || []).map(r => (r.swapInfo || {}).ammKey).join(); if (!seen.has(k)) { seen.add(k); L.push(q); } }
    if (!L.length) throw new Error('no route: No routes found between SOL and the quote coin');
    return L.sort((a, b) => Number(b.outAmount) - Number(a.outAmount));
  }
  /* 3.12.23 (owner 1120: fills above the click on coins paired to another token): the 2 % of the first leg kept back as margin stayed in the
     wallet as quote-coin change on every trade (~2 % of a buy, ~2 % of a sell). The next trade's second leg now also spends the change already
     in the wallet (at most 5 % of the leg, so a bag of the quote coin you hold on purpose is never touched) */
  const QPG = new Map();
  async function quoteHeld(pub, qm, url) {
    let pg = QPG.get(qm); if (!pg) { const [mi] = await accs([qm], url); pg = mi && TOKEN_PROGS.includes(mi.owner) ? mi.owner : null; if (pg) QPG.set(qm, pg); }
    if (!pg) return 0n; const [a] = await accs([await ata(pub, pg, qm)], url); return a && a.data.length >= 72 ? u64(a.data, 64) : 0n;
  }
  async function viaQuote(side, m, x, slipBps, qm, o, pub, url, soft) {
    const heldP = pub && !STABLE.has(qm) ? quoteHeld(pub, qm, url).catch(() => 0n) : Promise.resolve(0n);
    let held = 0n;
    const keep = q => { const out = Number(q.outAmount), v = BigInt(Math.floor(out * LEG_KEEP)), cap = BigInt(Math.floor(out * 0.05)); if (v <= 0n) throw new Error('no route: the quote coin leg gives nothing'); return (v + (held < cap ? held : cap)).toString(); };
    const pairs = [];   /* [q1, q2] in order of preference */
    let fullP = null;   /* 3.29.8: the second leg with no account limit (what two separate transactions get) */
    if (side === 'buy') { const [L, h] = await Promise.all([solLegs(WSOL, qm, String(x), slipBps), heldP]); held = h; for (const q1 of L) pairs.push([q1, null]); fullP = quote(qm, m, keep(L[0]), slipBps).catch(() => null); }
    else { const [q1, h] = await Promise.all([quote(m, qm, String(x), slipBps, LEG_ACC), heldP]); held = h; fullP = quote(qm, WSOL, keep(q1), slipBps).catch(() => null); for (const q2 of await solLegs(qm, WSOL, keep(q1), slipBps)) pairs.push([q1, q2]); }
    /* 3.9.9 (owner 1118: "5 s to sell"): every candidate is built at the same time (was one after another, ~0.3 s per miss), the first
       that fits one transaction in order of output wins */
    const SIZE = /too big|too many accounts/;
    const built = await Promise.all(pairs.slice(0, 5).map(async ([q1, q2]) => {
      try { if (!q2) q2 = await quote(qm, m, keep(q1), slipBps, LEG_ACC); return { q1, q2, b: await jupIx(q1, pub, o, url, soft, q2) }; } catch (e) { return { e }; }
    }));
    const ok = built.find(r => r.b);
    /* 3.29.8 (owner 1123 lost ~0.89 SOL: jackat -> JACKET -> SOL in one transaction, the 40-account second leg went through a tiny Meteora pool,
       0.038 SOL where the free route gave 0.926): the one-transaction route more than 5 % under the free one -> two transactions */
    const full = await fullP;
    if (ok && full && BigInt(ok.q2.outAmount) * 100n < BigInt(full.outAmount) * 95n) { const e = new Error('TWOTX'); e.two = true; e.q1 = null; throw e;   /* 3.29.9: step 1 quoted again with no account limit (the squeezed one gave ~52 % on a buy) */ }
    if (ok) {
      const { q1, q2, b } = ok;
      /* what trade() reads: in = SOL / tokens actually turned into the coin / SOL, out = what the second leg gives, impacts added up */
      const q = { inAmount: side === 'buy' ? String(Math.round(Number(q1.inAmount) * LEG_KEEP)) : q1.inAmount, outAmount: q2.outAmount,
        priceImpactPct: String((+q1.priceImpactPct || 0) + (+q2.priceImpactPct || 0)), routePlan: [...(q1.routePlan || []), ...(q2.routePlan || [])], legs: 2 };
      return { q, msg: b.msg, tip: b.tip, t: Date.now() };
    }
    const hard = built.find(r => r.e && !SIZE.test(String(r.e.message))), last = (hard || built[0] || {}).e;
    if (!hard && last && !soft) { const e = new Error('TWOTX'); e.two = true; e.q1 = null; throw e; }   /* trade() goes in two steps, with this first leg */
    throw last || new Error('no route');
  }
  async function jupMake(side, m, x, o, pub, url, soft, qm) {   /* x = lamports in (buy) or tokens in (sell) -> {q, msg | raw, tip, t}; qm: the coin's quote token */
    const slipBps = Math.round((+o.slip || 20) * 100);
    if (qm && qm !== WSOL && NOQ.get(m) > Date.now() - 60000) return viaQuote(side, m, x, slipBps, qm, o, pub, url, soft);   /* known: no direct route */
    /* a brand-new coin (seen 1116: a pump.fun curve quoted in another token) is quoted by Jupiter a few seconds before its swap builder
       knows the coin's token program ("Missing token program for <mint>"): a trade asks again for up to ~4 s instead of failing */
    /* 3.29.10 (route gate 1123: a direct buy gave 6 % fewer tokens than going through the coin's quote token): for such coins the two-leg
       price is asked at the same time as the direct one; clearly better (2 %+) -> the quote-token route */
    const estP = qm && qm !== WSOL ? (async () => { const a = await quote(side === 'buy' ? WSOL : m, qm, String(x), slipBps);
      return quote(qm, side === 'buy' ? m : WSOL, String(BigInt(Math.floor(Number(a.outAmount) * 0.98))), slipBps); })().catch(() => null) : null;
    for (let i = 0; ; i++) {
      let q;
      try { q = side === 'buy' ? await quote(WSOL, m, String(x), slipBps) : await quote(m, WSOL, String(x), slipBps); }
      catch (e) { if (!(qm && qm !== WSOL && NOROUTE.test(String(e.message)))) throw e; NOQ.set(m, Date.now()); if (NOQ.size > 500) NOQ.clear(); return viaQuote(side, m, x, slipBps, qm, o, pub, url, soft); }
      /* 3.29.6 (owner 1123, a USD-quoted pump.fun coin: "price impact 93 % is too high" on a $70 sell): the direct route went through a dead
         pool. Over 5 % impact: the route through the coin's quote token is tried too and the one that gives more wins; none in one
         transaction and the direct one is unusable -> two steps */
      const imp0 = (+q.priceImpactPct || 0) * 100, est = estP ? await estP : null, better = k => !!est && BigInt(est.outAmount) * 100n > BigInt(q.outAmount) * BigInt(k);
      if (qm && qm !== WSOL && (imp0 > 5 || better(102))) {
        try { const v = await viaQuote(side, m, x, slipBps, qm, o, pub, url, soft); if (BigInt(v.q.outAmount) > BigInt(q.outAmount)) { NOQ.set(m, Date.now()); if (NOQ.size > 500) NOQ.clear(); return v; } }
        catch (e) { if (imp0 > MAX_IMPACT || better(105)) { NOQ.set(m, Date.now()); if (e.two || soft) throw e; } }   /* a hover never pre-builds the dead direct route */
      }
      let e1;
      try { const b = await jupIx(q, pub, o, url, soft); return { q, msg: b.msg, tip: b.tip, t: Date.now() }; }
      catch (e) { if (soft || e.vet) throw e; e1 = e; }
      const fresh = NEWCOIN.test(String(e1 && e1.message));
      if (fresh && i < 4) { if (o._lap) o._lap.nc = i + 1; await sleep(900); continue; }
      const tip = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9);
      try { return { q, raw: await build(q, pub, tip), tip, t: Date.now() }; }   /* the old way (Jupiter-built, Jito tip) only if ours could not be made */
      catch (e) { if (NEWCOIN.test(String(e.message))) throw new Error('Jupiter does not know this new coin yet: try again in a few seconds'); throw e; }
    }
  }
  async function prep(o, pub, url) {   /* the mouse is on a button: everything but the signature is done now */
    const side = o.side === 'sell' ? 'sell' : 'buy', m = await mintOf(o.a, url, o.isMint);
    let st = null; try { st = await pumpState(m, pub, url, 800); } catch (_) {}
    warmSender(); blockhash(url).catch(() => {}); feeRefresh(st ? ((PL.get(st.mint) || {}).pool || st.bc) : null, url).catch(() => {});
    if (st && st.native) { await pumpConf(url); return { native: true }; }   /* a pump.fun curve: made here in ~1 ms at the click */
    if (poolOk(st)) { await ammConf(url).catch(() => {}); if (!st.live) { try { const P = await poolState(st, url); st.hpool = P; st.hpoolT = Date.now(); } catch (_) {} } return { native: true }; }   /* a PumpSwap pool: built at the click from its reserves (3.12.2: read during the hover, so the click does not wait for them) */
    let x;
    if (side === 'buy') { if (!(+o.sol > 0)) return null; x = BigInt(Math.round(+o.sol * 1e9)); }
    else { let raw = st ? st.raw : null; if (raw == null) { try { raw = (await tokBal(pub, m, url)).raw; } catch (_) { PMISS.set(pub + '|' + m + '|sell', 'coin data did not come in time'); return null; } } x = sellAmount(raw, +o.pct); if (x <= 0n) return null; }   /* 3.12.18 */
    const k = pkey(m, side, x, o, pub), have = PREP.get(k);
    if (have && (have.p || Date.now() - have.t < PREP_MS - 2000)) return have.p || have;
    const mk = pub + '|' + m + '|' + side;
    if (rlLeft('ix') <= 5 || rlLeft('quote') <= 20) { PMISS.set(mk, 'Jupiter limit, waited'); return null; }   /* 3.12.18: quotes kept for the click too */
    const p = jupMake(side, m, x, o, pub, url, true, st && st.curve && st.curve.quote);
    const hold = { p }; PREP.set(k, hold);
    try { const r = await p; if (PREP.get(k) === hold) PREP.set(k, r); PMISS.delete(mk); return r; } catch (e) { if (PREP.get(k) === hold) PREP.delete(k); PMISS.set(mk, 'pre-build failed: ' + String(e.message || e).slice(0, 50)); throw e; }
  }
  /* one trade: {side, a, sol | pct, slip, tip, prio, maxSol, live, isMint, have}; seed / pub = the unlocked wallet */
  async function trade(o, seed, pub, url) {
    const t0 = Date.now(), jw0 = JW.ms, lap = {}, slip = +o.slip || 20, tip = Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)), prio = Math.min(PRIO_MAX, Math.max(0, +o.prio >= 0 ? +o.prio : PRIO_DEF));
    if (!(slip >= 0.1 && slip <= 100)) throw new Error('slippage must be 0.1-100 %');
    const m = await mintOf(o.a, url, o.isMint);
    const hov = [...PREP.keys()].some(q => q.startsWith(pub + '|' + m + '|' + (o.side === 'sell' ? 'sell' : 'buy') + '|'));   /* 3.12.2: the button was hovered */
    let st = null; try { st = await pumpState(m, pub, url, hov ? (o.side === 'buy' ? 10000 : 3000) : (o.side === 'buy' ? 2500 : 0)); } catch (_) {}
    lap.st = Date.now() - t0;
    if (o.native !== false && st && st.native) return nativeTrade(o, st, seed, pub, url, t0, tip);
    if (o.native !== false && o.pool !== false && poolOk(st)) { try { return await poolTrade(o, st, seed, pub, url, t0, tip); } catch (e) { if (!/^POOLSKIP/.test(String(e.message))) throw e; } }
    let x, sol = 0;
    if (o.side === 'buy') { sol = +o.sol; if (!(sol > 0 && sol <= (+o.maxSol || 5))) throw new Error('amount must be above 0 and at most ' + (+o.maxSol || 5) + ' SOL'); x = BigInt(Math.round(sol * 1e9)); }
    else if (o.side === 'sell') {
      const pct = +o.pct; if (!(pct > 0 && pct <= 100)) throw new Error('sell percent must be 1-100');
      x = sellAmount(st ? st.raw : (await tokBal(pub, m, url)).raw, pct); if (x <= 0n) throw new Error('you hold none of this token');
    } else throw new Error('side must be buy or sell');
    lap.st = Date.now() - t0;
    const oo = Object.assign({}, o, { slip, tip, prio, _lap: lap, _spot: o.side === 'sell' ? spotSol(st, x) : null }), k = pkey(m, o.side, x, oo, pub), P = PREP.get(k);
    const miss = P ? '' : PMISS.get(pub + '|' + m + '|' + o.side) || ([...PREP.keys()].some(q => q.startsWith(pub + '|' + m + '|' + o.side + '|')) ? 'amount or fee changed' : 'not hovered long enough');   /* 3.12.4: the real reason (a failed hover build) first */
    PREP.delete(k);   /* taken at once: a second click right after builds its own transaction */
    let ready = P && (P.msg || P.raw) && Date.now() - P.t < PREP_MS ? P : null;
    if (!ready && P && P.p) { try { const r = await P.p; if (Date.now() - r.t < PREP_MS) ready = r; } catch (_) {} }   /* still being built: wait for it */
    if (ready && USED.has(ready)) ready = null; if (ready) USED.add(ready);
    const [b, have] = await Promise.all([ready || jupMake(o.side, m, x, oo, pub, url, false, st && st.curve && st.curve.quote).catch(e => { if (e && e.two) return { two: true, q1: e.q1 }; throw e; }),
      o.side === 'buy' && o.live !== false ? (o.have != null ? o.have : (balance(pub, url).catch(() => {}), null)) : null]);   /* 3.12.2: no balance round trip on the click (an unknown balance skips the pre-check; the chain refuses a short wallet anyway) */
    if (have != null && have / 1e9 < sol + tip + prio + FEE_RESERVE) throw new Error('not enough SOL: the wallet has ' + (have / 1e9).toFixed(4) + ', this needs about ' + (sol + tip + prio + FEE_RESERVE).toFixed(4));
    lap.route = Date.now() - t0 - lap.st;
    if (b.two) return twoStep(o.side, m, x, Math.round(slip * 100), st.curve.quote, oo, seed, pub, url, t0, b.q1);
    let imp = (+b.q.priceImpactPct || 0) * 100;
    { const out = +b.q.outAmount, v = o.side === 'sell' ? oo._spot : (out > 0 ? spotSol(st, BigInt(b.q.outAmount)) : null);   /* 3.29.6: ours when we know the price */
      const own = o.side === 'sell' ? (v > 0 && out > 0 ? (1 - out / 1e9 / v) * 100 : null) : (v > 0 && sol > 0 ? (1 - v / sol) * 100 : null);
      if (own != null && isFinite(own)) imp = Math.max(0, own); else if (o.side === 'sell') imp = 0; }   /* 3.29.8: a sell is refused only on a loss we measured ourselves */
    if (imp > MAX_IMPACT) throw new Error(o.side === 'sell' ? 'this route would lose ' + imp.toFixed(0) + ' % of the position (only ' + (+b.q.outAmount / 1e9).toFixed(4) + ' SOL back): not sold' : 'price impact ' + imp.toFixed(0) + ' % is too high');
    /* 3.12.22 Exact: a route quoted after the click (Jupiter, a coin paired to USDC / another coin) is checked against the MC the panel showed at
       the click; allowed = the Exact % + the route's own price impact + 1.5 % for pool fees. Further = not sent (owner 1120: 170K -> 182K) */
    if (o.exact && +o.mcClick > 0 && st && st.supply > 0n && +b.q.inAmount > 0 && +b.q.outAmount > 0) {
      const qi = +b.q.inAmount, qo = +b.q.outAmount, mcq = (o.side === 'sell' ? qo / qi : qi / qo) * Number(st.supply) / 1e9;
      const mv = o.side === 'buy' ? mcq / o.mcClick - 1 : 1 - mcq / o.mcClick, allow = slip / 100 + Math.abs(imp) / 100 + 0.015;
      if (mv > allow) { const u = PX.v > 0 ? PX.v : 0, f = v => u ? '$' + (v * u >= 1e6 ? (v * u / 1e6).toFixed(2) + 'M' : (v * u / 1e3).toFixed(1) + 'K') : v.toFixed(0) + ' SOL';
        throw new Error('Exact: the price moved ' + (mv * 100).toFixed(1) + '% since your click (MC ' + f(+o.mcClick) + ' → ' + f(mcq) + '), not ' + (o.side === 'buy' ? 'bought' : 'sold') + '. Click again at the new price or turn Exact off'); }
    }
    let tx64, sig;
    if (b.msg) { const sg = await sign(seed, b.msg); tx64 = b64(cat(Uint8Array.of(1), sg, b.msg)); sig = b58e(sg); }
    else { const [signed, s2] = await signTx(b.raw, seed, pub); tx64 = b64(signed); sig = s2; }
    lap.sign = Date.now() - t0 - lap.st - lap.route; lap.wait = JW.ms - jw0; lap.legs = (b.q && b.q.legs) || 1; lap.raw = !b.msg;
    const res = { ok: true, side: o.side, mint: m, sig, impact: +imp.toFixed(2), tip: b.tip / 1e9, prio, pre: !!ready, miss: ready ? '' : miss, lap, fast: !!b.msg, route: (b.q.routePlan || []).map(r => (r.swapInfo || {}).label), tx64 };
    if (st && st.supply > 0n) { const qi = +b.q.inAmount, qo = +b.q.outAmount; const px = o.side === 'sell' ? qo / qi : qi / qo; if (px > 0 && isFinite(px)) { res.mc0 = px * Number(st.supply) / 1e9; res.sup = st.supply.toString(); res.mcq = true; } }
    if (o.live === false) {
      const v = ((await rpc('simulateTransaction', [tx64, { encoding: 'base64', sigVerify: true, commitment: 'processed' }], url)) || {}).value || {};
      Object.assign(res, { sent: false, sim_err: v.err || null, cu: v.unitsConsumed });
    } else { res.sending = b.msg ? sendFast(tx64, url, b.tip >= 5000 ? b.tip : 0) : sendAll(tx64, url); res.via = []; res.sent = true; }   /* 3.11.11: on the wire now; the nodes' answers are not waited for */
    if (st && !st.live) ST.delete(m + '|' + pub);
    res.ms = Date.now() - t0; return res;
  }
  async function nativeTrade(o, st, seed, pub, url, t0, tip) {
    const pre = Date.now() - st.t > 30;   /* the coin's state was already here when you clicked */
    if (o.side === 'buy') {
      const sol = +o.sol; if (!(sol > 0 && sol <= (+o.maxSol || 5))) throw new Error('amount must be above 0 and at most ' + (+o.maxSol || 5) + ' SOL');
      const have = o.live === false || o.have == null ? Infinity : o.have;   /* 3.12.2: no balance round trip on the click */
      const need = sol + tip + (+o.prio >= 0 ? +o.prio : PRIO_DEF) + FEE_RESERVE;
      if (have / 1e9 < need) throw new Error('not enough SOL: the wallet has ' + (have / 1e9).toFixed(4) + ', this needs about ' + need.toFixed(4));
    } else if (o.side === 'sell') { if (!(+o.pct > 0 && +o.pct <= 100)) throw new Error('sell percent must be 1-100'); if (st.raw <= 0n) throw new Error('you hold none of this token'); }
    else throw new Error('side must be buy or sell');
    const b = await pumpBuild(Object.assign({}, o, { tip }), st, pub, url);
    if (b.impact > MAX_IMPACT) throw new Error('price impact ' + b.impact.toFixed(0) + ' % is too high');
    const sg = await sign(seed, b.msg), tx64 = b64(cat(Uint8Array.of(1), sg, b.msg));
    const res = { ok: true, side: o.side, mint: st.mint, sig: b58e(sg), impact: +b.impact.toFixed(2), tip: b.tip / 1e9, prio: b.prio, pre, route: ['pump.fun'], native: true, tx64,
      mc0: Number(st.curve.vQ) * Number(st.supply) / Number(st.curve.vT) / 1e9, sup: st.supply.toString() };
    if (o.live === false) {
      const v = ((await rpc('simulateTransaction', [tx64, { encoding: 'base64', sigVerify: true, commitment: 'processed' }], url)) || {}).value || {};
      Object.assign(res, { sent: false, sim_err: v.err || null, cu: v.unitsConsumed });
    } else { res.sending = sendFast(tx64, url, b.tip >= 5000 ? b.tip : 0); res.via = []; res.sent = true; }   /* 3.11.11: not waiting for the nodes' answers */
    if (!st.live) ST.delete(st.mint + '|' + pub);
    res.ms = Date.now() - t0; return res;
  }
  /* 3.8.6 (owner 1118: "route too big for one transaction (1322 bytes)"): when both routes of a quote-coin trade do not fit one transaction,
     two: SOL -> quote coin (or coin -> quote coin), wait until it lands, then exactly what arrived -> coin (or SOL). Slower (~1-2 s more) and
     not all-or-nothing: if the second step fails, the quote coin stays in the wallet and the error says so. */
  async function twoStep(side, m, x, slipBps, qm, o, seed, pub, url, t0, pq1) {
    const q1 = pq1 && pq1.inAmount === String(x) ? pq1 : side === 'buy' ? await quote(WSOL, qm, String(x), slipBps) : await quote(m, qm, String(x), slipBps);
    let imp1 = (+q1.priceImpactPct || 0) * 100;
    { const rate = quoteRateCached(qm), base = side === 'buy' ? Number(x) : (+o._spot || 0) * 1e9;   /* 3.29.6: step 1 measured from our prices (lamports per quote unit) */
      if (rate > 0 && base > 0 && +q1.outAmount > 0) imp1 = Math.max(0, (1 - Number(q1.outAmount) * rate / base) * 100); else if (side === 'sell') imp1 = 0; }
    if (imp1 > MAX_IMPACT) throw new Error('price impact ' + imp1.toFixed(0) + ' % is too high');
    const [[mi], b1] = await Promise.all([accs([qm], url), jupIx(q1, pub, o, url, false)]); if (!mi || !TOKEN_PROGS.includes(mi.owner)) throw new Error('quote coin not found');
    const qa = await ata(pub, mi.owner, qm), held = async () => { const [a] = await accs([qa], url); return a && a.data.length >= 72 ? u64(a.data, 64) : 0n; };
    const [before, sg1] = await Promise.all([held(), sign(seed, b1.msg)]), tx1 = b64(cat(Uint8Array.of(1), sg1, b1.msg)), sig1 = b58e(sg1);
    if (o.live === false) {   /* test mode: only the first step can be simulated (the second spends what it gives) */
      const v = ((await rpc('simulateTransaction', [tx1, { encoding: 'base64', sigVerify: true, commitment: 'processed' }], url)) || {}).value || {};
      return { ok: true, side, mint: m, sig: sig1, sent: false, sim_err: v.err || null, cu: v.unitsConsumed, tip: b1.tip / 1e9, prio: o.prio, route: (q1.routePlan || []).map(r => (r.swapInfo || {}).label), steps: 2, ms: Date.now() - t0 };
    }
    await sendFast(tx1, url, b1.tip >= 5000 ? b1.tip : 0);
    /* 3.9.9: step 2 is built now, for what step 1 is quoted to give, while step 1 lands; it goes the moment the coins arrive when they
       are that amount up to 1 % more (else it is built again for exactly what arrived). The balance is read every 150 ms. */
    const leg2 = n => side === 'buy' ? quote(qm, m, n.toString(), slipBps) : quote(qm, WSOL, n.toString(), slipBps);
    const pre = (async () => { const amt = BigInt(q1.outAmount), q2 = await leg2(amt), b2 = await jupIx(q2, pub, o, url, false), sg = await sign(seed, b2.msg);
      return { amt, q2, msg2: b2.msg, tip2: b2.tip, tx64: b64(cat(Uint8Array.of(1), sg, b2.msg)), sig: b58e(sg) }; })().catch(() => null);
    let got = 0n;
    for (let i = 0; i < 160 && got <= 0n; i++) {   /* up to ~24 s */
      await sleep(150);
      got = (await held().catch(() => before)) - before;
      if (got <= 0n && i % 6 === 5) { const s = await txStatus(sig1, url).catch(() => ({ st: 'pending' })); if (s.st === 'failed') throw new Error('step 1 of 2 failed (' + JSON.stringify(s.err).slice(0, 60) + '): nothing was swapped'); }
    }
    if (got <= 0n) throw new Error('step 1 of 2 did not land in time: check the wallet for the quote coin');
    try {
      const P2 = await pre;
      let q2, msg2, tip2, raw2, tx64, sig;
      if (P2 && got >= P2.amt && got * 100n <= P2.amt * 101n) ({ q2, msg2, tip2, tx64, sig } = P2);
      else {
        q2 = await leg2(got);
        try { const b2 = await jupIx(q2, pub, o, url, false); msg2 = b2.msg; tip2 = b2.tip; }
        catch (e) { tip2 = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9); raw2 = await build(q2, pub, tip2); }
        if (msg2) { const sg = await sign(seed, msg2); tx64 = b64(cat(Uint8Array.of(1), sg, msg2)); sig = b58e(sg); }
        else { const [signed, s2] = await signTx(raw2, seed, pub); tx64 = b64(signed); sig = s2; }
      }
      { const rate = quoteRateCached(qm), exp = Number(got) * (rate || 0);   /* 3.29.8 */
        if (side === 'sell' && exp > 0 && Number(q2.outAmount) < exp * (1 - MAX_IMPACT / 100)) throw new Error('its route gives only ' + (Number(q2.outAmount) / 1e9).toFixed(4) + ' SOL for ' + (exp / 1e9).toFixed(4) + ' SOL of the quote coin, not sent'); }
      const via = msg2 ? await sendFast(tx64, url, tip2 >= 5000 ? tip2 : 0) : await sendAll(tx64, url);
      return { ok: true, side, mint: m, sig, sig1, steps: 2, sent: true, via, tx64, impact: +(imp1 + (+q2.priceImpactPct || 0) * 100).toFixed(2), tip: tip2 / 1e9, tip1: b1.tip / 1e9, prio: o.prio,
        fast: !!msg2, route: [...(q1.routePlan || []), ...(q2.routePlan || [])].map(r => (r.swapInfo || {}).label), ms: Date.now() - t0 };
    } catch (e) { throw new Error('step 2 of 2 failed: ' + String(e.message || e).slice(0, 80) + '. The quote coin from step 1 is in your wallet'); }
  }
  async function txStatus(sig, url) {
    const r = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }], url); const v = ((r || {}).value || [null])[0];
    if (!v) return { st: 'pending' };
    return { st: v.err ? 'failed' : (v.confirmationStatus || 'processed'), err: v.err || null };
  }
  const VC = new Map();
  async function spotValue(m, raw, dec) {   /* 3.12.26: SOL value of `raw` at the current price, no price impact */
    try {
      const j = await (await JF('/price/v3?ids=' + m + ',' + WSOL)).json(), a = j && j[m], s = j && j[WSOL];
      if (a && s && +a.usdPrice > 0 && +s.usdPrice > 0 && dec != null) return Number(raw) / 10 ** dec * (+a.usdPrice) / (+s.usdPrice);
    } catch (_) {}
    const small = raw / 50n > 0n ? raw / 50n : raw;   /* 2 % of the bag: close to the spot price */
    const out = +(await quote(m, WSOL, small.toString(), 1000)).outAmount;
    if (!(out > 0)) throw new Error('no price');
    return out / 1e9 * Number(raw) / Number(small);
  }
  async function position(a, pub, url, known) {
    const m = await mintOf(a, url, known);
    let st = null; try { st = await pumpState(m, pub, url, 0); } catch (_) {}
    if (st && st.curve) {   /* on its curve or in its PumpSwap pool: valued from the reserves, kept live by the panel's WebSocket */
      try {
        await quoteRate(st.curve.quote);
        if (!st.curve.complete) { await pumpConf(url); st.kind = 'curve'; }
        else { const [P] = await Promise.all([poolState(st, url), ammConf(url)]); if (st.live && st.pool) Object.assign(st.pool, P); else st.pool = P; st.kind = 'pool'; }   /* a live state keeps its pool object (3.8.4) */
        const rate = quoteRateCached(st.curve.quote) || 0, sup = Number(st.supply || 0n);
        const mc_sol = st.kind === 'pool' ? (st.pool.B > 0n ? Number(st.pool.Q) / Number(st.pool.B) * sup * rate / 1e9 : null) : (st.curve.vT > 0n ? Number(st.curve.vQ) / Number(st.curve.vT) * sup * rate / 1e9 : null);
        return { ok: true, mint: m, raw: st.raw.toString(), dec: st.dec, ui: Number(st.raw) / 10 ** st.dec, value_sol: valueNow(st), mc_sol, live: st.kind, bc: st.bc, ata: st.ata,
          vb: st.pool && st.pool.vb, vq: st.pool && st.pool.vq, pool: st.pool && st.pool.pool, quote: st.curve.quote };
      } catch (_) {}
    }
    const { raw, dec } = st ? { raw: st.raw, dec: st.dec } : await tokBal(pub, m, url); let val = 0;
    if (raw > 0n) {
      const c = VC.get(m);
      /* 3.12.26 (owner 1120, float launchpad coin on Raydium CPMM: PnL slow and +11 % while Axiom showed +20 %): the value was a sell quote of
         the WHOLE bag (price impact on a $40K pool), refreshed every ~6 s. Now like the terminals: tokens x the current price, every 1.5 s. */
      if (c && c.raw === raw.toString() && Date.now() - c.t < 1500) val = c.v;
      else {
        try { val = await spotValue(m, raw, dec); VC.set(m, { raw: raw.toString(), v: val, t: Date.now() }); }
        catch (_) { try { val = +(await quote(m, WSOL, raw.toString(), 1000)).outAmount / 1e9; VC.set(m, { raw: raw.toString(), v: val, t: Date.now() }); } catch (_) { val = c ? c.v : null; } }
      }
    }
    const mc_sol = st && st.supply > 0n && raw > 0n && val > 0 ? val * Number(st.supply) / Number(raw) : null;   /* from the sell quote */
    return { ok: true, mint: m, raw: raw.toString(), dec, ui: dec != null ? Number(raw) / 10 ** dec : 0, value_sol: val, mc_sol };
  }
  /* what one confirmed trade did to the wallet, from the chain itself: SOL change of the wallet, the network fee, a new token account's
     rent (not a cost: it comes back when the account is closed), the token change. tip = the Jito tip we asked Jupiter to add. */
  async function txDeltas(sig, pub, mint, tipLamports, url) {
    const r = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }], url);   /* Axiom sends v1 */
    if (!r) return null;   /* not visible yet */
    const m = r.meta || {}, keys = ((r.transaction || {}).message || {}).accountKeys || [];
    const wi = keys.findIndex(k => (k.pubkey || k) === pub); if (wi < 0) throw new Error('our wallet is not in that transaction');
    if (m.err) return { failed: true, err: m.err, fee: m.fee || 0 };
    const d = (m.postBalances[wi] || 0) - (m.preBalances[wi] || 0), fee = m.fee || 0, msg = (r.transaction || {}).message || {};
    const out = i => i.program === 'system' && i.parsed && i.parsed.type === 'transfer' && i.parsed.info.source === pub;
    /* a trade made elsewhere (Axiom's buttons...): its tips are the wallet's small top-level SOL transfers */
    const tip = tipLamports != null ? +tipLamports || 0 : (msg.instructions || [])
      .filter(i => out(i) && !AXF.has(i.parsed.info.destination) && +i.parsed.info.lamports < 0.05e9).reduce((a, i) => a + +i.parsed.info.lamports, 0);
    /* Axiom's 1 % (its program sends it to one of its fee wallets): already inside the SOL in / out, shown apart for information */
    const plat = [...(msg.instructions || []), ...(m.innerInstructions || []).flatMap(g => g.instructions || [])]
      .filter(i => out(i) && AXF.has(i.parsed.info.destination)).reduce((a, i) => a + +i.parsed.info.lamports, 0);
    const base = 5000 * Math.max(1, ((r.transaction || {}).signatures || []).length);   /* the network's base fee per signature; the rest of fee = priority */
    const mine = L => (L || []).filter(b => b.owner === pub && b.mint === mint);
    const pre = mine(m.preTokenBalances), post = mine(m.postTokenBalances);
    const sum = L => L.reduce((a, b) => a + BigInt((b.uiTokenAmount || {}).amount || 0), 0n);
    let rent = 0; for (const b of post) if (!pre.some(x => x.accountIndex === b.accountIndex)) rent += m.postBalances[b.accountIndex] || 0;   /* a token account made by this trade */
    let back = 0; for (const b of pre) if (!post.some(x => x.accountIndex === b.accountIndex)) back += Math.max(0, (m.preBalances[b.accountIndex] || 0) - (m.postBalances[b.accountIndex] || 0));   /* closed: its rent came back */
    const dec = (post[0] || pre[0] || {}).uiTokenAmount ? (post[0] || pre[0]).uiTokenAmount.decimals : null;
    return { failed: false, payer: wi === 0, d, fee, base: Math.min(base, fee), tip, plat, rent, back, tok: (sum(post) - sum(pre)).toString(), dec, t: (r.blockTime || 0) * 1000 };
  }
  const PX = { v: null, t: 0 };
  async function solUsd() {   /* cached a minute: the panel must not eat the trade's share of the rate limit */
    if (Date.now() - PX.t < 60000) return PX.v;
    try { const j = await (await JF('/price/v3?ids=' + WSOL)).json(); PX.v = +((j[WSOL] || {}).usdPrice) || PX.v; PX.t = Date.now(); } catch (_) {}
    return PX.v;
  }
  /* the coin's PnL from the trades this extension made: bought / sold in SOL (what went into / came out of the pool), gas = network fees +
     Jito tips, holding = what the current balance sells for now; pnl = sold + holding - bought - gas */
  /* like the terminals: pnl leaves gas (network + priority + tips) out; net = pnl - gas. Axiom's 1 % is already inside bought / sold.
     rent = the token account's deposit still held (it comes back when the account is closed), not a cost. */
  function pnlOf(L, holdingSol) {
    /* 3.12.25 (owner 1120, FMWY: 'I did not buy for 2.7 SOL'): re-buys paid with what an earlier sell brought back were added to Bought
       (9 buys = 2.7 SOL while at most 1.45 SOL of his was ever in the coin). Bought = the most SOL in the coin at once (your real stake),
       Sold = what came back on top of the re-buys; PnL unchanged. The plain sums stay in buyAll / sellAll. */
    let bought = 0, sold = 0, gas = 0, base = 0, prio = 0, tip = 0, plat = 0, rent = 0, nb = 0, ns = 0, split = true, net0 = 0, peak = 0;
    for (const e of (L || []).slice().sort((x, y) => (x.t || 0) - (y.t || 0))) {
      if (e.side === 'buy') { bought += e.sol; nb++; net0 += e.sol; if (net0 > peak) peak = net0; } else { sold += e.sol; ns++; net0 -= e.sol; }
      gas += e.gas; plat += e.plat || 0; rent += (e.rent || 0) - (e.back || 0);
      if (e.fee != null) { base += e.base || 0; prio += Math.max(0, e.fee - (e.base || 0)); tip += e.tip || 0; } else split = false;
    }
    const hold = +holdingSol || 0, pnl = sold + hold - bought, net = pnl - gas, buyAll = bought, sellAll = sold;
    if (peak > 0 && peak < bought) { sold -= bought - peak; bought = peak; }
    return { bought, sold, buyAll, sellAll, gas, hold, pnl, pct: bought > 0 ? pnl / bought * 100 : null, net, netPct: bought > 0 ? net / bought * 100 : null,
      base, prio, tip, plat, rent: Math.max(0, rent), split, nb, ns };
  }

  /* ---- pump.fun bonding curve built right here (no Jupiter, no rate limit): buy_exact_quote_in_v3 / sell_v3 for SOL-quoted curves,
     priority fee + a tip to Helius Sender (it forwards to Jito and the other fast lanes). Other coins (migrated, cashback, other quotes) use Jupiter. */
  const AXF = new Set(['BfFX9rUm8qTZiZjmeq9BktWVTNuG3YWMc5AvkrCKJike', 'EqGzowSp6cKAsMSRyyrFTaBxnZEVeNY81LC18YFy8Cx9', '3PvqoztjnRxaAiFmLuEfqZkU4GSbjUareks8S2xCZaTa',
    '3Tu1Y9aNveLFN4WTAwnAwXL6tbUp5MMe3RxyybG4jTAS', '2ApLdwLrGayEmxgpLX9BTR47Q2QprfMg5SpjrLeaK8s7', 'HkJYryz2BNeMQfuuSWDYktWt5fZLV26eK6nqu7EJycoG',
    '5vPNE6VFyXmCmzmWotdxmRk57LEWiXxuAfZL3hKbi2LH', 'ECDrSz47nXihe5kyK4oWEePPsPi9qz6u5d6Fa2sDj3uM']);   /* Axiom's fee wallets (seen in its FLASHX trades, 2026-11) */
  const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', PFEE = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ', ATAP = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  const SYS = '11111111111111111111111111111111', CBP = 'ComputeBudget111111111111111111111111111111', TOKEN = TOKEN_PROGS[0];
  const SENDER = 'https://sender.helius-rpc.com/fast';
  /* 3.12.2 (1119: the owner's ISP route to Cloudflare = 200 ms + packet loss, the global Sender and Helius RPC sit behind it): Helius'
     regional Senders in Frankfurt / Amsterdam answer directly (~90 ms, no loss); plain http is how Helius serves the regional ones */
  let SENDERS_NEAR = ['http://fra-sender.helius-rpc.com/fast', 'http://ams-sender.helius-rpc.com/fast'];
  /* 3.20.5 (owner: "faster, 1000 users"): users are everywhere, not only near Frankfurt. Every 10 min the worker times a ping to each of
     Helius' regional Senders (a warm second ping, so the handshake is not counted) and sends to the two nearest + the global one.
     They answer CORS for any origin, so no new permission is needed */
  const SREG = ['slc', 'ewr', 'lon', 'fra', 'ams', 'sg', 'tyo'].map(r => 'http://' + r + '-sender.helius-rpc.com/fast');
  let pickT = 0, SNEAR_MS = null;
  try { chrome.storage.local.get({ sndNear: null }).then(o => { if (Array.isArray(o.sndNear) && o.sndNear.length === 2 && o.sndNear.every(u => SREG.includes(u))) SENDERS_NEAR = o.sndNear; }).catch(() => {}); } catch (_) {}
  async function pickSenders(force) {
    if (!force && Date.now() - pickT < 600000) return SNEAR_MS; pickT = Date.now();
    const t = async u => { const p = u.replace('/fast', '/ping'); try { await fetch(p, { mode: 'no-cors', cache: 'no-store' }); const t0 = performance.now(); await fetch(p, { mode: 'no-cors', cache: 'no-store' }); return [performance.now() - t0, u]; } catch (_) { return [1e9, u]; } };
    const r = (await Promise.all(SREG.map(t))).filter(x => x[0] < 1e9).sort((a, b) => a[0] - b[0]);
    if (r.length >= 2) { SENDERS_NEAR = [r[0][1], r[1][1]]; SNEAR_MS = r.map(x => [new URL(x[1]).host.split('-')[0], Math.round(x[0])]); try { chrome.storage.local.set({ sndNear: SENDERS_NEAR, sndMs: SNEAR_MS }); } catch (_) {} }
    return SNEAR_MS;
  }
  const HTIP = ['4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE', 'D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ', '9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta',
    '5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn', '2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD', '2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ',
    'wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF', '3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT', '4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey',
    '4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or'];   /* Helius Sender's tip accounts (helius.dev docs, 2026-11) */
  const hex = s => Uint8Array.from(s.match(/../g).map(x => parseInt(x, 16)));
  const D_BUY = hex('e1f7501ed5b38488'), D_SELL = hex('1c92de7726c469d5');
  const D_CASHBACK = Uint8Array.of(37, 58, 35, 126, 190, 53, 228, 197);   /* claim_cashback (pump and PumpSwap) */   /* buy_exact_quote_in_v3, sell_v3 (pump IDL) */
  /* compute budget: limit, price (the priority fee spread over the limit), and the loaded-accounts data limit. The leader orders by fee per
     cost unit, and an unset data limit counts as 64 MB (~16k cost units): a tight limit + tight data cap = higher priority for the same fee */
  /* measured 1116 (simulations + the owner's own trades): every pump.fun curve / PumpSwap trade loads ~11.8 MB of accounts and programs; it
     used 47k (curve sell), 71k (curve buy with a new token account), 68-71k (pool sell), 77-99k (pool buy). Tight limits ~20 % above that.
     o.safe = the old roomy limits, used by the automatic second try if a tight one ever runs out */
  const LDS_CURVE = 20 * 1024 * 1024, LDS_POOL = 20 * 1024 * 1024, CU_T = { buy: 88000, sell: 62000, abuy: 120000, asell: 88000 };
  /* 3.7.3 smart fees (owner 1117: "same speed, less gas"). The preset's priority fee and tip are the most a trade pays, not what it pays:
     - priority: 2x the 90th percentile of what landed in recent slots on this coin's curve / pool, at least 1,000,000 micro-lamports per
       compute unit (a "very high" fee on Solana); with the tight limits that is ~0.0001 SOL instead of the preset's 0.001;
     - tip (Helius Sender -> Jito): the 99th percentile of tips that landed lately ('fast', the default: as quick as before), or the 95th
       ('eco'), from Jito's tip floor every 30 s, at least the 0.0002 Sender needs. Both refreshed in the background (hover, the open coin), never at the click; without fresh numbers: the preset. */
  const FEE = { tip: 0, tip95: 0, tipAt: 0, tipT: 0, acct: new Map() }, PRIO_FLOOR = 1000000, TIP_MIN = 0.0002;
  async function feeRefresh(hot, url) {
    const now = Date.now(), jobs = [];
    if (now - FEE.tipT > 30000) { FEE.tipT = now; jobs.push(fetch('https://bundles.jito.wtf/api/v1/bundles/tip_floor').then(r => r.json()).then(j => { const x = (j && j[0]) || {}, v = +x.landed_tips_99th_percentile, w = +x.landed_tips_95th_percentile; if (v > 0 && w > 0) { FEE.tip = v; FEE.tip95 = w; FEE.tipAt = Date.now(); } }).catch(() => {})); }
    if (hot) { const a = FEE.acct.get(hot); if (!a || now - a.t > 10000) { FEE.acct.set(hot, { p: a ? a.p : 0, t: now });
      jobs.push(rpc('getRecentPrioritizationFees', [[hot]], url).then(r => { const v = (r || []).map(x => +x.prioritizationFee || 0).sort((x, y) => x - y); if (v.length) FEE.acct.set(hot, { p: v[Math.floor(v.length * 0.9)], t: Date.now() }); }).catch(() => {})); } }
    if (FEE.acct.size > 200) FEE.acct.clear();
    await Promise.all(jobs);
  }
  function smart(o, hot, cu, tipL, prio, url) {   /* tipL in lamports, prio in SOL (the preset's, already capped) -> the same units */
    if (!o.auto || o.auto === 'off') return { tip: tipL, prio };
    const a = hot && FEE.acct.get(hot), mu = Math.max(PRIO_FLOOR, 2 * ((a && a.p) || 0));
    const p2 = Math.min(prio, mu * cu / 1e15);
    let t2 = tipL; if (tipL >= TIP_MIN * 1e9 && FEE.tip > 0 && Date.now() - FEE.tipAt < 120000) t2 = Math.min(tipL, Math.round(Math.max(TIP_MIN, o.auto === 'eco' ? FEE.tip95 : FEE.tip) * 1e9));
    if (tipL >= 1000000) t2 = Math.max(t2, 1000000);   /* 3.20.5: from 0.001 SOL Helius Sender sends to Jito AND the SWQOS lanes at once: keep it there */
    feeRefresh(hot, url).catch(() => {});   /* for the next click */
    return { tip: t2, prio: p2 };
  }
  const cbIxs = (cu, prio, lds) => { const L = [{ prog: CBP, keys: [], data: cat(Uint8Array.of(2), le(cu, 4)) }, { prog: CBP, keys: [], data: cat(Uint8Array.of(3), le(Math.floor(prio * 1e15 / cu), 8)) }];
    if (lds > 0) L.push({ prog: CBP, keys: [], data: cat(Uint8Array.of(4), le(lds, 4)) }); return L; };
  const PRIO_DEF = 0.0001, PRIO_MAX = 0.01, CU_BUY = 110000, CU_SELL = 80000;   /* measured: buy with a new token account 69k, sell 46k */
  const enc = s => new TextEncoder().encode(s);
  const cat = (...a) => { const o = new Uint8Array(a.reduce((x, y) => x + y.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const le = (v, n) => { v = BigInt(v); const o = new Uint8Array(n); for (let i = 0; i < n; i++) { o[i] = Number(v & 255n); v >>= 8n; } return o; };
  const u64 = (d, o) => { let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(d[o + i]); return v; };
  const keyAt = (d, o) => b58e(d.slice(o, o + 32));
  const cu16e = n => { const o = []; for (;;) { let b = n & 0x7f; n >>= 7; if (n) { o.push(b | 0x80); } else { o.push(b); return Uint8Array.from(o); } } };

  /* program addresses: sha256(seeds, bump, program, "ProgramDerivedAddress") that is NOT a point on ed25519 */
  const FP = 2n ** 255n - 19n;
  const mpow = (b, e) => { let r = 1n; b %= FP; while (e > 0n) { if (e & 1n) r = r * b % FP; b = b * b % FP; e >>= 1n; } return r; };
  const ED_D = (FP - 121665n) * mpow(121666n, FP - 2n) % FP;
  function onCurve(b) {
    let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? b[i] & 0x7f : b[i]);
    if (y >= FP) return false;
    const y2 = y * y % FP, u = (y2 + FP - 1n) % FP, v = (ED_D * y2 + 1n) % FP, x2 = u * mpow(v, FP - 2n) % FP;
    if (x2 === 0n) return !(b[31] >> 7);
    return mpow(x2, (FP - 1n) / 2n) === 1n;
  }
  const PDAC = new Map();
  async function pda(seeds, prog) {
    const k = seeds.map(s => b58e(s)).join('.') + '@' + prog; if (PDAC.has(k)) return PDAC.get(k);
    const pb = b58d(prog), tag = enc('ProgramDerivedAddress');
    for (let n = 255; n >= 0; n--) {
      const h = new Uint8Array(await subtle.digest('SHA-256', cat(...seeds, Uint8Array.of(n), pb, tag)));
      if (!onCurve(h)) { const a = b58e(h); if (PDAC.size > 4000) PDAC.clear(); PDAC.set(k, a); return a; }
    }
    throw new Error('no program address');
  }
  const ata = (owner, prog, mint) => pda([b58d(owner), b58d(prog), b58d(mint)], ATAP);

  async function accs(list, url) {
    const r = await rpc('getMultipleAccounts', [list, { encoding: 'base64', commitment: 'processed' }], url);
    return ((r || {}).value || []).map(v => v ? { owner: v.owner, lamports: v.lamports, data: unb64(v.data[0]) } : null);
  }
  function curveOf(d) {
    const q = d.length >= 115 ? keyAt(d, 83) : SYS;
    return { vT: u64(d, 8), vQ: u64(d, 16), rT: u64(d, 24), rQ: u64(d, 32), supply: u64(d, 40), complete: !!d[48], creator: keyAt(d, 49),
      mayhem: d.length > 81 && !!d[81], cashback: d.length > 82 && !!d[82], quote: q === SYS ? WSOL : q, cfbps: d.length >= 123 ? u64(d, 115) : 0n };
  }
  /* global (buyback fee recipients) + fee config (fee tiers by market cap), read once per 5 min */
  const GC = { t: 0, v: null, p: null };
  async function pumpConf(url) {
    if (GC.v && Date.now() - GC.t < 300000) return GC.v;
    if (!GC.p) GC.p = (async () => {
      const [gl, fc] = await Promise.all([pda([enc('global')], PUMP), pda([enc('fee_config'), b58d(PUMP)], PFEE)]);
      const [g, f] = await accs([gl, fc], url); if (!g) throw new Error('pump.fun global not found');
      const bb = []; for (let i = 0; i < 8; i++) { const k = keyAt(g.data, 741 + 32 * i); if (k !== SYS) bb.push(k); }
      const tiers = []; let flat = { p: 95n, c: 30n };
      try {
        const d = f.data; flat = { p: u64(d, 49), c: u64(d, 57) };
        const n = d[65] | (d[66] << 8) | (d[67] << 16) | (d[68] << 24);
        for (let i = 0, o = 69; i < n && o + 40 <= d.length; i++, o += 40) tiers.push({ th: u64(d, o) | (u64(d, o + 8) << 64n), p: u64(d, o + 24), c: u64(d, o + 32) });
      } catch (_) {}
      GC.v = { gl, fc, fr: keyAt(g.data, 41), bb: bb.length ? bb : [keyAt(g.data, 41)], tiers, flat }; GC.t = Date.now(); return GC.v;
    })().finally(() => { GC.p = null; });
    return GC.p;
  }
  function feeOf(conf, c) {   /* {p, c} in bps for this curve's market cap (the fee tier table), creator fee 0 without a creator */
    let f = conf.flat;
    if (conf.tiers.length && c.vT > 0n) { const mc = c.vQ * c.supply / c.vT; for (const t of conf.tiers) if (mc >= t.th) f = t; }
    return { p: f.p, c: c.creator === SYS ? 0n : (c.cfbps > 0n ? c.cfbps : f.c) };   /* a creator may set his own fee (seen: 1 %) */
  }
  const ceilDiv = (a, b) => (a + b - 1n) / b;
  function buyOut(c, fee, spend) {   /* the IDL's quote formula for buy_exact_*_in */
    const tot = fee.p + fee.c; let net = spend * 10000n / (10000n + tot);
    const fees = ceilDiv(net * fee.p, 10000n) + ceilDiv(net * fee.c, 10000n);
    if (net + fees > spend) net -= net + fees - spend;
    if (net <= 1n) return 0n;
    let out = (net - 1n) * c.vT / (c.vQ + net - 1n); if (out > c.rT) out = c.rT; return out;
  }
  function sellOut(c, fee, amt) {
    if (amt <= 0n || c.vT + amt === 0n) return 0n;
    const gross = amt * c.vQ / (c.vT + amt), f = ceilDiv(gross * fee.p, 10000n) + ceilDiv(gross * fee.c, 10000n);
    return gross > f ? gross - f : 0n;
  }
  /* the coin's state + your balance in one request: {curve, prog, dec, ata, raw}; cached maxAge ms */
  const ST = new Map();
  async function pumpState(mint, pub, url, maxAge) {
    const k = mint + '|' + pub, have = ST.get(k);
    if (have && (have.live || (maxAge > 0 && Date.now() - have.t < maxAge))) return have;   /* live = kept current by the panel's WebSocket */
    const bc = await pda([enc('bonding-curve'), b58d(mint)], PUMP);
    const [a0, a1] = await Promise.all([ata(pub, TOKEN, mint), ata(pub, TOKEN_PROGS[1], mint)]);
    const [cv, mi, t0, t1] = await accs([bc, mint, a0, a1], url);
    if (!mi || !TOKEN_PROGS.includes(mi.owner)) throw new Error('not a token');
    const prog = mi.owner, ua = prog === TOKEN ? a0 : a1, ta = prog === TOKEN ? t0 : t1;
    const s = { t: Date.now(), mint, bc, prog, dec: mi.data[44], supply: u64(mi.data, 36), ata: ua, raw: ta && ta.data.length >= 72 ? u64(ta.data, 64) : 0n, curve: cv && cv.owner === PUMP && cv.data.length >= 81 ? curveOf(cv.data) : null };
    s.native = !!(s.curve && !s.curve.complete && !s.curve.cashback && !s.curve.mayhem && s.curve.quote === WSOL);
    if (ST.size > 300) ST.clear(); ST.set(k, s); return s;
  }
  /* compile a legacy message: payer first, then signer-writable, readonly-signer, writable, readonly */
  function compile(payer, ixs, bh, nsig) {
    const meta = new Map(); const add = (k, s, w) => { const m = meta.get(k) || { s: false, w: false }; m.s = m.s || s; m.w = m.w || w; meta.set(k, m); };
    add(payer, true, true); for (const ix of ixs) { for (const [k, s, w] of ix.keys) add(k, s, w); add(ix.prog, false, false); }
    const all = [...meta.entries()], grp = (s, w) => all.filter(([k, m]) => k !== payer && m.s === s && m.w === w).map(x => x[0]);
    const keys = [payer, ...grp(true, true), ...grp(true, false), ...grp(false, true), ...grp(false, false)], at = new Map(keys.map((k, i) => [k, i]));
    const nSig = 1 + grp(true, true).length + grp(true, false).length;
    const parts = [Uint8Array.of(nSig, grp(true, false).length, grp(false, false).length), cu16e(keys.length), ...keys.map(k => b58d(k)), b58d(bh), cu16e(ixs.length)];
    for (const ix of ixs) parts.push(Uint8Array.of(at.get(ix.prog)), cu16e(ix.keys.length), Uint8Array.from(ix.keys.map(x => at.get(x[0]))), cu16e(ix.data.length), ix.data);
    if (nSig !== (nsig || 1)) throw new Error((nsig || 1) + ' signer(s) expected');
    return cat(...parts);
  }
  const BH = { v: null, t: 0, p: null };
  async function blockhash(url) {
    if (BH.v && Date.now() - BH.t < 25000) { if (Date.now() - BH.t > 10000 && !BH.p) blockhash.refresh(url); return BH.v; }
    return blockhash.refresh(url);
  }
  blockhash.refresh = url => BH.p || (BH.p = rpc('getLatestBlockhash', [{ commitment: 'confirmed' }], url).then(r => { BH.v = r.value.blockhash; BH.t = Date.now(); return BH.v; }).finally(() => { BH.p = null; }));
  let warmT = 0;
  function warmSender() { if (Date.now() - warmT < 20000) return; warmT = Date.now(); pickSenders().catch(() => {}); for (const u of [SENDER, ...SENDERS_NEAR]) fetch(u.replace('/fast', '/ping'), { mode: 'no-cors' }).catch(() => {}); }   /* keep the TLS connection open */
  /* o: {side, sol | pct, slip, tip, prio}; st = pumpState; returns {msg, out (tokens or lamports), impact} without signing */
  async function pumpBuild(o, st, pub, url) {
    const c = st.curve, conf = await pumpConf(url), fee = feeOf(conf, c), slip = BigInt(Math.round((+o.slip || 20) * 100));
    let tip = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9);
    let prio = Math.min(PRIO_MAX, Math.max(0, +o.prio >= 0 ? +o.prio : PRIO_DEF));
    const [abc, qbc, qus, uva, ea, bh] = await Promise.all([ata(st.bc, st.prog, st.mint), ata(st.bc, TOKEN, WSOL), ata(pub, TOKEN, WSOL),
      pda([enc('user_volume_accumulator'), b58d(pub)], PUMP), pda([enc('__event_authority')], PUMP), blockhash(url)]);
    const keys = [[conf.gl, 0, 0], [st.mint, 0, 0], [WSOL, 0, 0], [st.prog, 0, 0], [TOKEN, 0, 0], [st.bc, 0, 1], [abc, 0, 1], [qbc, 0, 1], [pub, 1, 1], [st.ata, 0, 1],
      [qus, 0, 1], [uva, 0, 1], [conf.fc, 0, 0], [conf.bb[Math.floor(Math.random() * conf.bb.length)], 0, 1], [SYS, 0, 0], [ea, 0, 0], [PUMP, 0, 0]].map(([k, s, w]) => [k, !!s, !!w]);
    const spot = Number(c.vQ) / Number(c.vT);
    let ix, out, impact, cu, shut = false;
    if (o.side === 'buy') {
      const spend = BigInt(Math.round(+o.sol * 1e9)); out = buyOut(c, fee, spend); if (out <= 0n) throw new Error('the curve has no tokens left');
      const min = out * (10000n - slip) / 10000n;
      ix = { prog: PUMP, keys, data: cat(D_BUY, le(spend, 8), le(min, 8), Uint8Array.of(0)) };
      impact = (Number(spend) / Number(out) / spot - 1) * 100; cu = (o.safe ? CU_BUY : CU_T.buy) + uq();
    } else {
      const amt = sellAmount(st.raw, +o.pct); if (amt <= 0n) throw new Error('you hold none of this token');
      out = sellOut(c, fee, amt); const min = out * (10000n - slip) / 10000n;
      ix = { prog: PUMP, keys, data: cat(D_SELL, le(amt, 8), le(min, 8)) };
      impact = (1 - Number(out) / Number(amt) / spot) * 100; cu = (o.safe ? CU_SELL : CU_T.sell) + uq(); o.amt = amt;
      /* 3.17.0: selling everything closes the coin's token account in the same transaction: its ~0.002 SOL rent comes straight back */
      shut = +o.pct >= 100 && amt === st.raw; if (shut) cu += 6000;
    }
    if (o._raw) {   /* 3.26.0: only this wallet's own steps, for a transaction shared by several wallets (multiTrade) */
      const body = []; if (o.side === 'buy') body.push({ prog: ATAP, keys: [[pub, true, true], [st.ata, false, true], [pub, false, false], [st.mint, false, false], [SYS, false, false], [st.prog, false, false]], data: Uint8Array.of(1) });
      body.push(ix); if (shut) body.push({ prog: st.prog, keys: [[st.ata, false, true], [pub, false, true], [pub, true, false]], data: Uint8Array.of(9) });
      return { body, cu, out, impact, fee: Number(fee.p + fee.c), bc: st.bc };
    }
    ({ tip, prio } = smart(o, st.bc, cu, tip, prio, url));
    const ixs = cbIxs(cu, prio, o.lds != null ? o.lds : o.safe ? 0 : LDS_CURVE);
    if (o.side === 'buy') ixs.push({ prog: ATAP, keys: [[pub, true, true], [st.ata, false, true], [pub, false, false], [st.mint, false, false], [SYS, false, false], [st.prog, false, false]], data: Uint8Array.of(1) });
    ixs.push(ix);
    if (shut) ixs.push({ prog: st.prog, keys: [[st.ata, false, true], [pub, false, true], [pub, true, false]], data: Uint8Array.of(9) });
    if (tip > 0) ixs.push({ prog: SYS, keys: [[pub, true, true], [HTIP[Math.floor(Math.random() * HTIP.length)], false, true]], data: cat(le(2, 4), le(tip, 8)) });
    return { msg: compile(pub, ixs, bh), out, impact, tip, prio, fee: Number(fee.p + fee.c) };
  }
  /* 3.26.0 (owner: "all wallets in one transaction"): several wallets buy (or sell) the same pump.fun coin in ONE transaction: the same
     block, one after another with nobody in between, one network fee and one tip (paid by the first wallet) instead of one per wallet.
     As many wallets as fit Solana's 1232 bytes go in a transaction (2-3 on a curve); the rest in the next, sent at the same moment.
     list: [{seed, pub, st}] -> {groups: [{sig, tx64, pubs, payer, tip, prio, sent, sending}], errs: [{pub, err}], ms} */
  async function multiTrade(o, list, url) {
    const t0 = Date.now(), parts = [];
    for (const w of list) { try { parts.push({ w, b: await pumpBuild(Object.assign({}, o, { _raw: true }), w.st, w.pub, url) }); } catch (e) { parts.push({ w, err: String((e && e.message) || e).slice(0, 160) }); } }
    const okp = parts.filter(p => !p.err), out = [], bh = await blockhash(url);
    const tip0 = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9), prio0 = Math.min(PRIO_MAX, Math.max(0, +o.prio >= 0 ? +o.prio : PRIO_DEF));
    const make = g => {
      const cu = Math.min(1400000, g.reduce((s, p) => s + p.b.cu, 0)), { tip, prio } = smart(o, g[0].b.bc, cu, tip0, prio0, url), payer = g[0].w.pub;
      const ixs = cbIxs(cu, prio, 0); for (const p of g) ixs.push(...p.b.body);
      if (tip > 0) ixs.push({ prog: SYS, keys: [[payer, true, true], [HTIP[Math.floor(Math.random() * HTIP.length)], false, true]], data: cat(le(2, 4), le(tip, 8)) });
      const msg = compile(payer, ixs, bh, g.length); return { msg, tip, prio, size: cu16e(g.length).length + 64 * g.length + msg.length };
    };
    const groups = []; let cur = [];
    for (const p of okp) { if (!cur.length) { cur = [p]; continue; } let fit = false; try { fit = make([...cur, p]).size <= 1232; } catch (_) {} if (fit) cur.push(p); else { groups.push(cur); cur = [p]; } }
    if (cur.length) groups.push(cur);
    for (const g of groups) {
      const t = make(g); if (t.size > 1232) { for (const p of g) parts.push({ w: p.w, err: 'transaction too big' }); continue; }
      const [, k0] = cu16(t.msg, 3), seedOf = new Map(g.map(p => [p.w.pub, p.w.seed])), order = [];
      for (let i = 0; i < g.length; i++) order.push(b58e(t.msg.slice(k0 + 32 * i, k0 + 32 * i + 32)));   /* signatures in the message's signer order */
      const sigs = await Promise.all(order.map(k => sign(seedOf.get(k), t.msg))), tx64 = b64(cat(cu16e(g.length), ...sigs, t.msg));
      const res = { sig: b58e(sigs[0]), tx64, pubs: g.map(p => p.w.pub), payer: order[0], tip: t.tip / 1e9, prio: t.prio, out: g.map(p => p.b.out.toString()) };
      if (o.live === false) { const v = ((await rpc('simulateTransaction', [tx64, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }], url)) || {}).value || {};
        Object.assign(res, { sent: false, sim_err: v.err || null, cu: v.unitsConsumed, logs: v.logs }); }
      else { res.sending = sendFast(tx64, url, t.tip >= 5000 ? t.tip : 0); res.sent = true; }
      out.push(res);
    }
    return { groups: out, errs: parts.filter(p => p.err).map(p => ({ pub: p.w.pub, err: p.err })), ms: Date.now() - t0 };
  }
  const LANE = new Map();   /* 3.26.0: url -> {bad, until}: 3 refusals in a row = skipped for 2 min (the node itself never is) */
  const laneOk = u => { const x = LANE.get(u); return !x || x.until < Date.now(); };
  const laneNote = (u, ok) => { const x = LANE.get(u) || { bad: 0, until: 0 }; if (ok) { x.bad = 0; x.until = 0; } else if (++x.bad >= 3) { x.until = Date.now() + 120000; x.bad = 0; } LANE.set(u, x); };
  async function sendFast(tx64, url, sender) {   /* Helius Sender (tip inside) + the node, at once; ok when either took it */
    const one0 = async (u, params) => { try { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params }) }); const j = await r.json(); return ['result' in j, u, JSON.stringify(j.error || '').slice(0, 100)]; } catch (e) { return [false, u, String(e).slice(0, 100)]; } };
    const one = (u, params) => one0(u, params).then(x => { laneNote(u.split('?')[0], x[0]); return x; });
    const L = [one(url || RPC, [tx64, { encoding: 'base64', skipPreflight: true, maxRetries: 5 }])];
    /* 3.17.0: sender = the tip in lamports (true = old callers). Helius Sender's default lanes take tips from 0.001 SOL; a smaller tip goes
       to its SWQOS lane (from 0.000005 SOL), so the tip you pay always buys speed */
    const swq = typeof sender === 'number' && sender < 1000000;
    if (sender) for (const u of [...SENDERS_NEAR, SENDER].filter(laneOk)) L.push(one(swq ? u + '?swqos_only=true' : u, [tx64, { encoding: 'base64', skipPreflight: true, maxRetries: 0 }]));
    if (url) L.push(one(RPC, [tx64, { encoding: 'base64', skipPreflight: true, maxRetries: 5 }]));
    /* 3.11.4 (owner: "0.3-0.5 s"): done the moment the first lane took it; the others finish on their own (was: wait for the slowest) */
    return new Promise((res, rej) => {
      let left = L.length; const errs = [];
      for (const p of L) p.then(x => { if (x[0]) res([new URL(x[1]).host]); else { errs.push(x[2]); if (!--left) rej(new Error('no node took it: ' + errs.join('; '))); } });
    });
  }
  /* why a pump trade failed, from its logs: the program's error code -> plain words */
  const PERR = { 6002: 'price moved past your slippage', 6003: 'price moved past your slippage', 6042: 'price moved past your slippage', 6005: 'the coin just migrated: try again (it trades on the pool now)',
    6040: 'not enough SOL for the rent', 6041: 'not enough SOL for the fees', 6094: 'cashback coin: try again' };
  function whyFailed(err) {
    const t = JSON.stringify(err || ''); const m = t.match(/"Custom":(\d+)/); if (m && PERR[m[1]]) return PERR[m[1]];
    if (/InsufficientFunds|insufficient/i.test(t)) return 'not enough SOL';
    if (/BlockhashNotFound/.test(t)) return 'expired before it landed';
    return 'failed on chain (' + t.slice(0, 60) + ')';
  }
  /* why a trade failed, from its logs (the chain shows them ~1 s after the status): 'slip' = the price moved past the slippage (pump.fun
     curve, PumpSwap pool, or any DEX of a Jupiter route), 'moved' = the curve completed / migrated while the trade was on its way */
  async function failKind(sig, url) {
    for (let i = 0; i < 6; i++) {
      const t = await rpc('getTransaction', [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }], url).catch(() => null);
      if (t && t.meta) {
        const L = (t.meta.logMessages || []).join('\n'), E = JSON.stringify(t.meta.err || '');
        if (/MaxLoadedAccountsDataSizeExceeded|ComputationalBudgetExceeded/.test(E) || /exceeded CUs meter|Computational budget exceeded/.test(L)) return 'budget';
        const P = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P failed: custom program error: 0x', M = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA failed: custom program error: 0x';   /* by code when the log is cut */
        if (/BondingCurveComplete|QuoteCurveAwaitingMigration|BondingCurveNotComplete/.test(L) || L.includes(P + '1775') || L.includes(P + '17bb')) return 'moved';
        if (['1772', '1773', '179a'].some(h => L.includes(P + h)) || ['1774', '1798'].some(h => L.includes(M + h))) return 'slip';
        if (/Error: insufficient funds/.test(L)) return 'slip';   /* 3.8.0: a two-leg trade whose first leg gave less than the second spends */
        if (/TooMuchSolRequired|TooLittleSolReceived|BuySlippageBelowMin|ExceededSlippage|SlippageToleranceExceeded|[Ss]lippage|JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771/.test(L)) return 'slip';   /* Jupiter's 0x1771 = SlippageToleranceExceeded */
        return null;
      }
      await sleep(400);
    }
    return null;
  }
  /* the value of what you hold, straight from the curve: no quote request */
  function holdValue(st, conf) { if (!st.curve || st.raw <= 0n) return 0; return Number(sellOut(st.curve, feeOf(conf, st.curve), st.raw)) / 1e9; }


  /* ---- 3.3: Jupiter routes built our way. /swap-instructions has its own (100) limit, unlike /swap (5 per 10 s); we compile the v0 message
     ourselves (its address tables come with the answer), set our priority fee and tip Helius Sender, so these trades take the fast lanes too ---- */
  function compileV0(payer, ixs, bh, tables) {
    const meta = new Map(), progs = new Set(); const add = (k, s, w) => { const m = meta.get(k) || { s: false, w: false }; m.s = m.s || s; m.w = m.w || w; meta.set(k, m); };
    add(payer, true, true); for (const ix of ixs) { for (const [k, s, w] of ix.keys) add(k, s, w); add(ix.prog, false, false); progs.add(ix.prog); }
    const loaded = new Map();
    for (const [k, m] of meta) { if (k === payer || m.s || progs.has(k)) continue; for (let ti = 0; ti < tables.length; ti++) { const i = tables[ti][1].indexOf(k); if (i >= 0 && i < 256) { loaded.set(k, [ti, i]); break; } } }
    const stat = [...meta.entries()].filter(([k]) => !loaded.has(k)), grp = (s, w) => stat.filter(([k, m]) => k !== payer && m.s === s && m.w === w).map(x => x[0]);
    const keys = [payer, ...grp(true, true), ...grp(true, false), ...grp(false, true), ...grp(false, false)];
    const nSig = 1 + grp(true, true).length + grp(true, false).length; if (nSig !== 1) throw new Error('one signer expected');
    const used = tables.map((t, ti) => ({ key: t[0], w: [], r: [], wk: [], rk: [] }));
    for (const [k, [ti, i]] of loaded) { const u = used[ti]; if (meta.get(k).w) { u.w.push(i); u.wk.push(k); } else { u.r.push(i); u.rk.push(k); } }
    const U = used.filter(u => u.w.length || u.r.length), order = [...keys, ...U.flatMap(u => u.wk), ...U.flatMap(u => u.rk)], at = new Map(order.map((k, i) => [k, i]));
    if (order.length > 256) throw new Error('too many accounts');
    const parts = [Uint8Array.of(0x80, nSig, grp(true, false).length, grp(false, false).length), cu16e(keys.length), ...keys.map(k => b58d(k)), b58d(bh), cu16e(ixs.length)];
    for (const ix of ixs) parts.push(Uint8Array.of(at.get(ix.prog)), cu16e(ix.keys.length), Uint8Array.from(ix.keys.map(x => at.get(x[0]))), cu16e(ix.data.length), ix.data);
    parts.push(cu16e(U.length)); for (const u of U) parts.push(b58d(u.key), cu16e(u.w.length), Uint8Array.from(u.w), cu16e(u.r.length), Uint8Array.from(u.r));
    return cat(...parts);
  }
  const ALT = new Map();
  async function jupLeg(q, pub, soft, dyn) {
    const body = { quoteResponse: q, userPublicKey: pub, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: dyn !== false, dynamicSlippage: false };
    const r = await JF('/swap/v1/swap-instructions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, soft);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.swapInstruction) throw new Error('could not build the swap: ' + String((j && (j.error || j.message)) || r.status).slice(0, 120));
    return j;
  }
  /* 3.21.5 security (audit 1122): a Jupiter answer is not trusted blindly. Before signing, every instruction it gave must be one of:
     compute budget, create-account (ATA), the Jupiter v6 swap, a SOL transfer into your own wSOL account or to a known tip account,
     sync / close of your own wSOL (paid back to you). Anything else (a transfer to a stranger, an Approve, a new owner) = not signed. */
  const JUP6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
  const JITO_TIPS = new Set(['96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe', 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49', 'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT']);
  async function vetRoute(ixs, pub) {   /* ixs: [{prog, keys: [pubkey | null], data}] */
    const own = new Set(await Promise.all(TOKEN_PROGS.map(tp => ata(pub, tp, WSOL))));
    for (const ix of ixs) {
      const d = ix.data || new Uint8Array(0), k = ix.keys || [];
      if (ix.prog === CBP || ix.prog === JUP6) continue;
      if (ix.prog === ATAP && (d.length === 0 || (d.length === 1 && d[0] <= 1))) continue;
      if (ix.prog === SYS && d.length === 12 && d[0] === 2 && !d[1] && !d[2] && !d[3] && k[0] === pub && k[1] && (own.has(k[1]) || HTIP.includes(k[1]) || JITO_TIPS.has(k[1]))) continue;
      if (TOKEN_PROGS.includes(ix.prog) && d.length === 1 && (d[0] === 17 || (d[0] === 9 && k[1] === pub && own.has(k[0])))) continue;
      throw Object.assign(new Error('the route has a step HAKI does not allow (' + String(ix.prog).slice(0, 6) + '…): not signed'), { vet: true });
    }
  }
  function txIxs(raw) {   /* a serialized transaction -> its instructions (accounts from lookup tables are null: never allowed as a destination) */
    const p = parseTx(raw); let j = p.msgAt; if (raw[j] & 0x80) j++;
    const [nk, k0] = cu16(raw, j + 3); let x = k0 + 32 * nk + 32; const [ni, a0] = cu16(raw, x); x = a0; const out = [];
    for (let n = 0; n < ni; n++) {
      const pi = raw[x++]; const [na, b0] = cu16(raw, x); x = b0; const idx = [...raw.slice(x, x + na)]; x += na;
      const [nd, c0] = cu16(raw, x); x = c0; const data = raw.slice(x, x + nd); x += nd;
      out.push({ prog: pi < nk ? p.keys[pi] : null, keys: idx.map(i => i < nk ? p.keys[i] : null), data });
    }
    return out;
  }
  async function jupIx(q, pub, o, url, soft, q2) {   /* -> {msg, tip} or throws (the caller falls back to /swap). q2: a second route in the same transaction */
    let tip = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9), prio = Math.min(PRIO_MAX, Math.max(0, +o.prio >= 0 ? +o.prio : PRIO_DEF));
    /* the second leg spends tokens the first one makes in the same transaction: Jupiter cannot simulate it, so its limit is a fixed 300k */
    const [js, bh] = await Promise.all([Promise.all([jupLeg(q, pub, soft), ...(q2 ? [jupLeg(q2, pub, soft, false)] : [])]), blockhash(url)]);
    const conv = x => ({ prog: x.programId, keys: x.accounts.map(a => [a.pubkey, !!a.isSigner, !!a.isWritable]), data: unb64(x.data) });
    const cu = Math.min(1400000, (+js[0].computeUnitLimit || 300000) + (q2 ? 300000 : 0) + 2000 + uq());
    ({ tip, prio } = smart(o, null, cu, tip, prio, url));
    const ixs = [{ prog: CBP, keys: [], data: cat(Uint8Array.of(2), le(cu, 4)) }, { prog: CBP, keys: [], data: cat(Uint8Array.of(3), le(Math.floor(prio * 1e15 / cu), 8)) },
      ...js.flatMap(j => [...(j.setupInstructions || []).map(conv), conv(j.swapInstruction), ...(j.cleanupInstruction ? [conv(j.cleanupInstruction)] : []), ...(j.otherInstructions || []).map(conv)])];
    await vetRoute(ixs.map(x => ({ prog: x.prog, keys: x.keys.map(z => z[0]), data: x.data })), pub);
    if (tip > 0) ixs.push({ prog: SYS, keys: [[pub, true, true], [HTIP[Math.floor(Math.random() * HTIP.length)], false, true]], data: cat(le(2, 4), le(tip, 8)) });
    for (const ix of ixs) for (const k of ix.keys) if (k[1] && k[0] !== pub) throw new Error('the route asks for another signer');
    const T = Object.assign({}, ...js.map(j => j.addressesByLookupTableAddress || {})), list = [...new Set(js.flatMap(j => j.addressLookupTableAddresses || []))];
    const miss = list.filter(a => !T[a] && !ALT.has(a));
    if (miss.length) { const rr = await accs(miss, url); miss.forEach((a, i) => { const d = rr[i] && rr[i].data; if (!d) return; const ks = []; for (let x = 56; x + 32 <= d.length; x += 32) ks.push(b58e(d.slice(x, x + 32))); ALT.set(a, ks); }); }
    const tables = list.map(a => [a, T[a] || ALT.get(a)]).filter(t => t[1]);
    const msg = compileV0(pub, ixs, bh, tables);
    if (65 + msg.length > 1232) throw new Error('route too big for one transaction (' + (65 + msg.length) + ' bytes)');
    return { msg, tip };
  }

  /* ---- 3.3: what a coin is worth right now, whatever its quote: its pump.fun curve, or its PumpSwap pool after migration, in the quote
     token, turned into SOL with the quote's price (Jupiter price API, refreshed every 15 s). All live-updatable from account data. ---- */
  const AMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
  const STABLE = new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);
  const i128 = (d, o) => { let v = 0n; for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(d[o + i]); if (v >> 127n) v -= 1n << 128n; return v; };
  const QR = new Map();
  async function quoteRate(q) {   /* lamports per smallest unit of the quote token */
    if (q === WSOL) return 1;
    const c = QR.get(q); if (c && Date.now() - c.t < 15000) return c.v;
    const j = await (await JF('/price/v3?ids=' + q + ',' + WSOL)).json(); const a = j && j[q], s = j && j[WSOL];
    if (!a || !s || !(a.usdPrice > 0)) { if (c) return c.v; throw new Error('no price for the quote token'); }
    /* a Token-2022 quote with a UI multiplier (scaled UI amount, e.g. the Prestocks tokens: x10 since 2026-11-05): Jupiter's usdPrice is
       per scaled UI token, the curve holds raw units -> the price per raw unit is the prescaled one (owner 1117: holding shown 10x low) */
    const sc = a.scaledUiConfig, mul = sc ? (+sc.newMultiplier > 0 && Date.now() >= Date.parse(sc.newMultiplierEffectiveAt || 0) ? +sc.newMultiplier : +sc.multiplier || 1) : 1;
    const usdRaw = +a.usdPricePrescaled > 0 ? +a.usdPricePrescaled : a.usdPrice * mul;
    const v = (usdRaw / 10 ** (a.decimals != null ? a.decimals : 6)) / (s.usdPrice / 1e9); QR.set(q, { v, t: Date.now() }); PX.v = s.usdPrice; PX.t = Date.now(); return v;
  }
  const quoteRateCached = q => q === WSOL ? 1 : (QR.get(q) || {}).v;
  const AC = { t: 0, v: null, p: null };
  async function ammConf(url) {   /* PumpSwap fee table: by market cap for SOL pools, a stable table for USD quotes, a flat one for the rest */
    if (AC.v && Date.now() - AC.t < 600000) return AC.v;
    if (!AC.p) AC.p = (async () => {
      const fc = await pda([enc('fee_config'), b58d(AMM)], PFEE), [a] = await accs([fc], url), d = a.data;
      const rd = o => { const n = d[o] | (d[o + 1] << 8); const L = []; o += 4; for (let i = 0; i < n; i++, o += 40) L.push({ th: u64(d, o) | (u64(d, o + 8) << 64n), lp: u64(d, o + 16), p: u64(d, o + 24), c: u64(d, o + 32) }); return [L, o]; };
      const [tiers, o1] = rd(65), [stable, o2] = rd(o1);
      AC.v = { tiers, stable, exotic: { lp: u64(d, o2), p: u64(d, o2 + 8), c: u64(d, o2 + 16) }, flat: { lp: u64(d, 41), p: u64(d, 49), c: u64(d, 57) } }; AC.t = Date.now(); return AC.v;
    })().finally(() => { AC.p = null; });
    return AC.p;
  }
  function poolFee(conf, P, supply) {
    const mc = P.B > 0n ? P.Q * supply / P.B : 0n; let f;
    if (P.quote === WSOL) { f = conf.tiers[0] || conf.flat; for (const t of conf.tiers) if (mc >= t.th) f = t; }
    else if (STABLE.has(P.quote)) { f = conf.stable[0] || conf.flat; for (const t of conf.stable) if (mc >= t.th) f = t; }
    else f = conf.exotic;
    return f.lp + f.p + (P.cfbps > 0n ? P.cfbps : f.c);
  }
  const PL = new Map();
  async function poolState(st, url) {   /* the canonical pool of a migrated pump.fun coin: ["pool", 0, pool-authority(mint), mint, quote] */
    const quote = st.curve.quote; let x = PL.get(st.mint);
    if (!x) {
      const pa = await pda([enc('pool-authority'), b58d(st.mint)], PUMP), pool = await pda([enc('pool'), Uint8Array.of(0, 0), b58d(pa), b58d(st.mint), b58d(quote)], AMM);
      const [p] = await accs([pool], url); if (!p || p.owner !== AMM) throw new Error('pool not found');
      const d = p.data; x = { pool, vb: keyAt(d, 139), vq: keyAt(d, 171), cc: keyAt(d, 211), quote };
      PL.set(st.mint, x);
    }
    const [p, vb, vq] = await accs([x.pool, x.vb, x.vq], url); if (!p || !vb || !vq) throw new Error('pool not found');
    const f = poolFlags(p.data), Qv = u64(vq.data, 64);
    return Object.assign({}, x, f, { B: u64(vb.data, 64), Qv, Q: Qv + f.virt });   /* effective quote reserves = vault + virtual (signed) */
  }
  function poolFlags(d) { return { virt: d.length >= 261 ? i128(d, 245) : 0n, cfbps: d.length >= 269 ? u64(d, 261) : 0n, mayhem: !!d[243], cashback: !!d[244] }; }

  /* ---- 3.7: PumpSwap pools traded directly (owner 1116: "прямые сделки для монет в пуле"), like the curve: no Jupiter round trips.
     PumpSwap v2 instructions (pump-public-docs PUMP_SWAP_TRADE_V2.md): 17 accounts, fees kept in the pool; not for cashback pools. SOL pools only:
     SOL is wrapped into a temporary WSOL account inside the same transaction and unwrapped at its end. ---- */
  const AMM_GCFG = 'ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw';
  const BUYBACK = ['5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD', '9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7', 'GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL', '3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR',
    '5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6', 'EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL', '5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD', 'A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW'];
  const D_ABUY = Uint8Array.of(194, 171, 28, 70, 104, 77, 91, 47), D_ASELL = Uint8Array.of(93, 246, 130, 60, 231, 233, 64, 178);   /* buy_exact_quote_in_v2, sell_v2 */
  const CU_ABUY = 130000, CU_ASELL = 100000;   /* simulated on live pools 1116: buy 88-96k (with both token accounts new), sell 64-72k */
  const poolOk = st => !!(st && st.curve && st.curve.complete && st.curve.quote === WSOL);
  function poolBuy(P, fee, spend) { const net = spend * 10000n / (10000n + fee); return P.B > 0n && P.Q > 0n ? P.B * net / (P.Q + net) : 0n; }
  const D_ABUY1 = Uint8Array.of(198, 46, 21, 82, 180, 217, 232, 112), D_ASELL1 = Uint8Array.of(51, 230, 133, 164, 1, 127, 131, 173);   /* buy_exact_quote_in, sell (v1) */
  const AG = { v: null, t: 0 };
  async function ammGlobal(url) {   /* PumpSwap protocol fee recipients (global config) */
    if (AG.v && Date.now() - AG.t < 600000) return AG.v;
    const [g] = await accs([AMM_GCFG], url); const pfr = []; for (let i = 0; i < 8; i++) { const k = keyAt(g.data, 57 + 32 * i); if (k !== SYS) pfr.push(k); }
    AG.v = { pfr }; AG.t = Date.now(); return AG.v;
  }
  async function poolBuild(o, st, P, pub, url) {
    const conf = await ammConf(url), fee = poolFee(conf, P, st.supply), slip = BigInt(Math.round((+o.slip || 20) * 100));
    let tip = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9);
    let prio = Math.min(PRIO_MAX, Math.max(0, +o.prio >= 0 ? +o.prio : PRIO_DEF));
    const [wa, uva, ea, fc, bb, bh] = await Promise.all([ata(pub, TOKEN, WSOL), pda([enc('user_volume_accumulator'), b58d(pub)], AMM), pda([enc('__event_authority')], AMM),
      pda([enc('fee_config'), b58d(AMM)], PFEE), ata(BUYBACK[Math.floor(Math.random() * BUYBACK.length)], TOKEN, WSOL), blockhash(url)]);
    const keys = [[P.pool, 0, 1], [pub, 1, 1], [AMM_GCFG, 0, 0], [st.mint, 0, 0], [WSOL, 0, 0], [st.ata, 0, 1], [wa, 0, 1], [P.vb, 0, 1], [P.vq, 0, 1], [st.prog, 0, 0], [TOKEN, 0, 0],
      [SYS, 0, 0], [uva, 0, 1], [fc, 0, 0], [bb, 0, 1], [ea, 0, 0], [AMM, 0, 0]].map(([k, s, w]) => [k, !!s, !!w]);
    /* 3.17.0 cashback pools (pump.fun cashback coins, all migrated now): v2 does not take them; the v1 buy / sell with your volume
       accumulator's WSOL account appended keeps the creator fee for you as cashback (claim it in Settings -> Wallet tools) */
    let v1 = null;
    if (P.cashback) {
      if (!P.cc) throw new Error('POOLSKIP cashback');
      const g = await ammGlobal(url), pfr = g.pfr[Math.floor(Math.random() * g.pfr.length)];
      const bbk = BUYBACK[Math.floor(Math.random() * BUYBACK.length)];
      const [pfa, cva, gva, uvw, pv2, bba] = await Promise.all([ata(pfr, TOKEN, WSOL), pda([enc('creator_vault'), b58d(P.cc)], AMM), pda([enc('global_volume_accumulator')], AMM), ata(uva, TOKEN, WSOL),
        pda([enc('pool-v2'), b58d(st.mint)], AMM), ata(bbk, TOKEN, WSOL)]);
      const cvt = await ata(cva, TOKEN, WSOL), f = a => a.map(([k, s, w]) => [k, !!s, !!w]);
      /* remaining accounts, as pump.fun's SDK sends them: the cashback account(s), pool-v2 (a coin with a creator), a buyback recipient + its WSOL account */
      const tailR = (P.cc !== SYS ? [[pv2, 0, 0]] : []).concat([[bbk, 0, 0], [bba, 0, 1]]);
      const head = [[P.pool, 0, 1], [pub, 1, 1], [AMM_GCFG, 0, 0], [st.mint, 0, 0], [WSOL, 0, 0], [st.ata, 0, 1], [wa, 0, 1], [P.vb, 0, 1], [P.vq, 0, 1], [pfr, 0, 0], [pfa, 0, 1],
        [st.prog, 0, 0], [TOKEN, 0, 0], [SYS, 0, 0], [ATAP, 0, 0], [ea, 0, 0], [AMM, 0, 0], [cvt, 0, 1], [cva, 0, 0]];
      v1 = { buy: f(head.concat([[gva, 0, 0], [uva, 0, 1], [fc, 0, 0], [PFEE, 0, 0], [uvw, 0, 1]], tailR)), sell: f(head.concat([[fc, 0, 0], [PFEE, 0, 0], [uvw, 0, 1], [uva, 0, 1]], tailR)) };
    }
    const spot = Number(P.Q) / Number(P.B), mkAta = (a, m, prog) => ({ prog: ATAP, keys: [[pub, true, true], [a, false, true], [pub, false, false], [m, false, false], [SYS, false, false], [prog, false, false]], data: Uint8Array.of(1) });
    const ixs = [], close = { prog: TOKEN, keys: [[wa, false, true], [pub, false, true], [pub, true, false]], data: Uint8Array.of(9) };
    let out, impact, cu;
    if (o.side === 'buy') {
      const spend = BigInt(Math.round(+o.sol * 1e9)); out = poolBuy(P, BigInt(fee), spend); if (out <= 0n) throw new Error('the pool has no tokens');
      const min = out * (10000n - slip) / 10000n; impact = (Number(spend) / Number(out) / spot - 1) * 100; cu = (o.safe ? CU_ABUY : CU_T.abuy) + uq() + (v1 ? 30000 : 0);
      ixs.push(mkAta(wa, WSOL, TOKEN), { prog: SYS, keys: [[pub, true, true], [wa, false, true]], data: cat(le(2, 4), le(spend, 8)) }, { prog: TOKEN, keys: [[wa, false, true]], data: Uint8Array.of(17) },
        mkAta(st.ata, st.mint, st.prog), v1 ? { prog: AMM, keys: v1.buy, data: cat(D_ABUY1, le(spend, 8), le(min > 0n ? min : 1n, 8), Uint8Array.of(1)) } : { prog: AMM, keys, data: cat(D_ABUY, le(spend, 8), le(min > 0n ? min : 1n, 8)) }, close);
    } else {
      const amt = sellAmount(st.raw, +o.pct); if (amt <= 0n) throw new Error('you hold none of this token');
      out = poolSell(P, conf, st.supply, amt); const min = out * (10000n - slip) / 10000n; impact = (1 - Number(out) / Number(amt) / spot) * 100; cu = (o.safe ? CU_ASELL : CU_T.asell) + uq() + (v1 ? 30000 : 0); o.amt = amt;
      const shut = +o.pct >= 100 && amt === st.raw; if (shut) cu += 6000;   /* 3.17.0: all sold -> the coin's token account is closed, its rent comes back */
      ixs.push(mkAta(wa, WSOL, TOKEN), v1 ? { prog: AMM, keys: v1.sell, data: cat(D_ASELL1, le(amt, 8), le(min, 8)) } : { prog: AMM, keys, data: cat(D_ASELL, le(amt, 8), le(min, 8)) }, close);
      if (shut) ixs.push({ prog: st.prog, keys: [[st.ata, false, true], [pub, false, true], [pub, true, false]], data: Uint8Array.of(9) });
    }
    ({ tip, prio } = smart(o, P.pool, cu, tip, prio, url));
    ixs.unshift(...cbIxs(cu, prio, o.lds != null ? o.lds : o.safe ? 0 : LDS_POOL));
    if (tip > 0) ixs.push({ prog: SYS, keys: [[pub, true, true], [HTIP[Math.floor(Math.random() * HTIP.length)], false, true]], data: cat(le(2, 4), le(tip, 8)) });
    return { msg: compile(pub, ixs, bh), out, impact, tip, prio, fee: Number(fee) };
  }
  async function poolTrade(o, st, seed, pub, url, t0, tip) {
    let P = st.live && st.pool && st.pool.B > 0n ? st.pool : st.hpool && Date.now() - st.hpoolT < 2500 && st.hpool.B > 0n ? st.hpool : null;   /* kept current by the panel's WebSocket, or read during the hover */
    if (!P) { try { P = await poolState(st, url); } catch (e) { throw new Error('POOLSKIP ' + e.message); } }
    if (o.side === 'buy') {
      const sol = +o.sol; if (!(sol > 0 && sol <= (+o.maxSol || 5))) throw new Error('amount must be above 0 and at most ' + (+o.maxSol || 5) + ' SOL');
      const have = o.live === false || o.have == null ? Infinity : o.have, need = sol + tip + (+o.prio >= 0 ? +o.prio : PRIO_DEF) + FEE_RESERVE;
      if (have / 1e9 < need) throw new Error('not enough SOL: the wallet has ' + (have / 1e9).toFixed(4) + ', this needs about ' + need.toFixed(4));
    } else if (o.side === 'sell') { if (!(+o.pct > 0 && +o.pct <= 100)) throw new Error('sell percent must be 1-100'); if (st.raw <= 0n) throw new Error('you hold none of this token'); }
    else throw new Error('side must be buy or sell');
    const b = await poolBuild(Object.assign({}, o, { tip }), st, P, pub, url);
    if (b.impact > MAX_IMPACT) throw new Error('price impact ' + b.impact.toFixed(0) + ' % is too high');
    const sg = await sign(seed, b.msg), tx64 = b64(cat(Uint8Array.of(1), sg, b.msg));
    const res = { ok: true, side: o.side, mint: st.mint, sig: b58e(sg), impact: +b.impact.toFixed(2), tip: b.tip / 1e9, prio: b.prio, pre: !!(st.live && st.pool), route: ['PumpSwap'], native: true, pool: true, tx64,
      mc0: Number(P.Q) * Number(st.supply) / Number(P.B) / 1e9, sup: st.supply.toString() };
    if (o.live === false) {
      const v = ((await rpc('simulateTransaction', [tx64, { encoding: 'base64', sigVerify: true, commitment: 'processed' }], url)) || {}).value || {};
      Object.assign(res, { sent: false, sim_err: v.err || null, cu: v.unitsConsumed, logs: v.logs });
    } else { res.sending = sendFast(tx64, url, b.tip >= 5000 ? b.tip : 0); res.via = []; res.sent = true; }   /* 3.11.11: not waiting for the nodes' answers */
    if (!st.live) ST.delete(st.mint + '|' + pub);
    res.ms = Date.now() - t0; return res;
  }
  function poolSell(P, conf, supply, amt) { if (amt <= 0n || P.B <= 0n) return 0n; const gross = P.Q * amt / (P.B + amt), f = ceilDiv(gross * poolFee(conf, P, supply), 10000n); return gross > f ? gross - f : 0n; }
  /* value of st.raw in SOL from what is cached: synchronous, for the live feed */
  /* 3.29.6 (owner 1123: a $70 sell of a coin quoted in another pump.fun coin refused, "price impact 93 %", the real loss 0.4 %): Jupiter's
     priceImpactPct is wrong for pump.fun curve legs (seen: "1" = 100 % on a 0.35 % route). The impact is measured from our own spot price */
  function spotSol(st, raw) {
    if (!st || !st.curve || !(raw > 0n)) return null; const rate = quoteRateCached(st.curve.quote); if (rate == null) return null; const P = st.pool || st.hpool;
    const px = st.curve.complete ? (P && P.B > 0n && P.Q > 0n ? Number(P.Q) / Number(P.B) : null) : (st.curve.vT > 0n ? Number(st.curve.vQ) / Number(st.curve.vT) : null);
    return px == null ? null : Number(raw) * px * rate / 1e9;
  }
  function valueNow(st) {   /* market value like the terminals show it: tokens x the current price (no sell fee, no price impact) */
    if (!st || st.raw <= 0n) return 0;
    const rate = st.curve ? quoteRateCached(st.curve.quote) : null; if (rate == null) return null;
    if (st.kind === 'pool' && st.pool && st.pool.B > 0n) return Number(st.raw) * (Number(st.pool.Q) / Number(st.pool.B)) * rate / 1e9;
    if (st.kind === 'curve' && st.curve.vT > 0n) return Number(st.raw) * (Number(st.curve.vQ) / Number(st.curve.vT)) * rate / 1e9;
    return null;
  }


  /* ---- 3.9.0 Multi launch (owner 1118, like HAKI's Multi deploy): new pump.fun coins (create_v2, Token-2022, SOL quote, no mayhem) with
     the name, ticker and metadata link (picture, socials) of the coin you are on, from the wallet set as the launch wallet in Settings.
     Account list and data checked against a real create_v2 of 2026-11-18 (all 16 accounts derived the same). ---- */
  const MAYP = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e', METAP = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  const D_CREATE2 = Uint8Array.of(214, 144, 76, 236, 95, 139, 49, 180), CU_CREATE = 130000, CU_CREATE_Q = 180000;   /* measured 107k; paired with a coin: more accounts to make */
  const bStr = v => { const b = enc(v); return cat(le(b.length, 4), b); };
  const rdStr = (d, o) => { const n = d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24; if (n < 0 || o + 4 + n > d.length) throw new Error('bad metadata'); return [new TextDecoder().decode(d.slice(o + 4, o + 4 + n)).replace(/\0+$/, '').trim(), o + 4 + n]; };
  async function coinMeta(mint, url) {   /* {name, symbol, uri}: Token-2022 metadata inside the mint, else the Metaplex metadata account */
    const [mi] = await accs([mint], url); if (!mi) throw new Error('coin not found');
    const d = mi.data;
    if (mi.owner === TOKEN_PROGS[1] && d.length > 170) {
      for (let o = 166; o + 4 <= d.length;) {
        const t = d[o] | d[o + 1] << 8, n = d[o + 2] | d[o + 3] << 8;
        if (t === 19) { let p = o + 4 + 64, name, symbol, uri; [name, p] = rdStr(d, p); [symbol, p] = rdStr(d, p); [uri, p] = rdStr(d, p); return { name, symbol, uri }; }
        if (!t && !n) break; o += 4 + n;
      }
    }
    const md = await pda([enc('metadata'), b58d(METAP), b58d(mint)], METAP), [m] = await accs([md], url);
    if (!m) throw new Error('this coin has no metadata to copy');
    let p = 65, name, symbol, uri; [name, p] = rdStr(m.data, p); [symbol, p] = rdStr(m.data, p); [uri, p] = rdStr(m.data, p);
    return { name, symbol, uri };
  }
  /* 3.10.2 (owner 1118: copies of Fleeca Dollar, a coin paired with TTWO, came out paired with SOL): a copy gets the same pair as the coin
     it copies. create_v2 takes 4 more accounts for that (read from the real create of H6ZY..pump, 2026-11-18): the quote mint, the curve's
     account of it, its token program, the program's "quote-control" list. q = {mint, prog} or null for SOL. */
  async function launchTx(meta, seed, pub, url, o, q) {   /* one new coin: -> {mint, sig, tx64, tip} (signed by the wallet and the new mint) */
    const ms = crypto.getRandomValues(new Uint8Array(32)), mint = await pubOf(ms), T22 = TOKEN_PROGS[1];
    const bc = await pda([enc('bonding-curve'), b58d(mint)], PUMP);
    const [ma, abc, gl, gp, sv, mst, ev, bh] = await Promise.all([pda([enc('mint-authority')], PUMP), ata(bc, T22, mint), pda([enc('global')], PUMP),
      pda([enc('global-params')], MAYP), pda([enc('sol-vault')], MAYP), pda([enc('mayhem-state'), b58d(mint)], MAYP), pda([enc('__event_authority')], PUMP), blockhash(url)]);
    const mtv = await ata(sv, T22, mint);
    const name = String(meta.name || '').slice(0, 32), symbol = String(meta.symbol || '').slice(0, 10), uri = String(meta.uri || '').slice(0, 200);
    if (!name || !symbol || !uri) throw new Error('the coin has no name, ticker or metadata link');
    const data = cat(D_CREATE2, bStr(name), bStr(symbol), bStr(uri), b58d(pub), Uint8Array.of(0, 0));   /* creator = you, not mayhem, no cashback */
    const keys = [[mint, true, true], [ma, false, false], [bc, false, true], [abc, false, true], [gl, false, false], [pub, true, true], [SYS, false, false], [T22, false, false],
      [ATAP, false, false], [MAYP, false, true], [gp, false, false], [sv, false, true], [mst, false, true], [mtv, false, true], [ev, false, false], [PUMP, false, false]];
    if (q) { const [aq, qc] = await Promise.all([ata(bc, q.prog, q.mint), pda([enc('quote-control')], PUMP)]); keys.push([q.mint, false, false], [aq, false, true], [q.prog, false, false], [qc, false, false]); }
    const tip = Math.round(Math.min(TIP_MAX, Math.max(0, +o.tip >= 0 ? +o.tip : TIP_DEF)) * 1e9), prio = Math.min(PRIO_MAX, Math.max(0, +o.prio >= 0 ? +o.prio : PRIO_DEF));
    const cu = (q ? CU_CREATE_Q : CU_CREATE) + uq();
    const ixs = [cuLimit(cu), cuPrice(Math.floor(prio * 1e15 / cu)), { prog: PUMP, keys, data }];
    if (tip > 0) ixs.push({ prog: SYS, keys: [[pub, true, true], [HTIP[Math.floor(Math.random() * HTIP.length)], false, true]], data: cat(le(2, 4), le(tip, 8)) });
    const msg = compile(pub, ixs, bh, 2), [s1, s2] = await Promise.all([sign(seed, msg), sign(ms, msg)]);
    return { mint, sig: b58e(s1), tx64: b64(cat(Uint8Array.of(2), s1, s2, msg)), tip };
  }
  async function launchMany(src, n, seed, pub, url, o) {   /* n copies of src's metadata, all sent at once */
    n = Math.max(1, Math.min(10, Math.floor(+n) || 5));
    const [meta, st] = await Promise.all([coinMeta(src, url), pumpState(src, pub, url, 0).catch(() => null)]);
    const qm = st && st.curve && st.curve.quote; let q = null;
    if (qm && qm !== WSOL && qm !== SYS) { const [mi] = await accs([qm], url); if (!mi || !TOKEN_PROGS.includes(mi.owner)) throw new Error('the pair coin of this coin was not found'); q = { mint: qm, prog: mi.owner }; }
    meta.quote = q ? q.mint : WSOL;
    const txs = await Promise.all(Array.from({ length: n }, () => launchTx(meta, seed, pub, url, o, q)));
    if (o.live === false) {
      const v = ((await rpc('simulateTransaction', [txs[0].tx64, { encoding: 'base64', sigVerify: true, commitment: 'processed' }], url)) || {}).value || {};
      return { meta, n, sent: false, sim_err: v.err || null, cu: v.unitsConsumed, logs: (v.logs || []).slice(-6), list: txs.map(t => ({ mint: t.mint, sig: t.sig })) };
    }
    const res = await Promise.all(txs.map(t => sendFast(t.tx64, url, t.tip >= 5000 ? t.tip : 0).then(via => ({ mint: t.mint, sig: t.sig, via }), e => ({ mint: t.mint, sig: t.sig, err: String(e.message || e).slice(0, 100) }))));
    return { meta, n, sent: true, list: res };
  }
  /* 3.12.3 (owner 1119): Multi with a NEW wallet for every coin, as cheap as possible. keep(F, meta) stores the keys (hidden, not in the
     wallet list: "they only highlight the main coin, don't clutter") BEFORE any SOL moves. One transaction from the launch wallet funds
     them all (each: the coin's rent + its fees + the 0.00089 SOL an account must keep), each wallet creates its own coin (no dev buy, no
     tip, minimal priority fee), and once the coins are confirmed whatever is left goes back to the launch wallet (sweepBack). The keys
     stay so the creator fees can be claimed later (claimFresh, run by the worker). */
  async function freshNeed(q) { return Math.round(((q ? 0.0076 : 0.0062) + 0.00002) * 1e9) + RENT0; }   /* lamports per new wallet (rent measured 1118: ~0.0058 / ~0.0072 SOL) */
  async function launchFresh(src, n, seed, pub, url, o, keep) {
    n = Math.max(1, Math.min(10, Math.floor(+n) || 5));
    const [meta, st] = await Promise.all([coinMeta(src, url), pumpState(src, pub, url, 0).catch(() => null)]);
    const qm = st && st.curve && st.curve.quote; let q = null;
    if (qm && qm !== WSOL && qm !== SYS) { const [mi] = await accs([qm], url); if (!mi || !TOKEN_PROGS.includes(mi.owner)) throw new Error('the pair coin of this coin was not found'); q = { mint: qm, prog: mi.owner }; }
    meta.quote = q ? q.mint : WSOL;
    const F = await Promise.all(Array.from({ length: n }, async () => { const sd = crypto.getRandomValues(new Uint8Array(32)); return { seed: sd, pub: await pubOf(sd) }; }));
    const need = await freshNeed(q), oo = { tip: 0, prio: 0.00001 };
    if (o.live === false) return { meta, n, sent: false, fresh: true, need: need / 1e9, list: F.map(f => ({ pub: f.pub })) };
    await keep(F, meta);   /* the keys are stored before any SOL is sent to them */
    const ixs = [cuLimit(1000 + 300 * n), cuPrice(20000)].concat(F.map(f => ({ prog: SYS, keys: [[pub, true, true], [f.pub, false, true]], data: cat(le(2, 4), le(need, 8)) })));
    const msg = compile(pub, ixs, await blockhash.refresh(url)), sg = await sign(seed, msg);
    const fund = await sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url);
    const txs = await Promise.all(F.map(f => launchTx(meta, f.seed, f.pub, url, oo, q)));
    const res = await Promise.all(txs.map((t, i) => sendFast(t.tx64, url, false).then(via => ({ mint: t.mint, sig: t.sig, via, w: F[i].pub }), e => ({ mint: t.mint, sig: t.sig, w: F[i].pub, err: String(e.message || e).slice(0, 100) }))));
    sweepBack(F, res, pub, url).catch(() => {});   /* not on the click's path */
    return { meta, n, sent: true, fresh: true, fund, need: need / 1e9, list: res };
  }
  async function sweepBack(F, res, to, url) {   /* after the creates land (or fail): every new wallet's rest back to the launch wallet */
    const sigs = res.map(r => r.sig);
    for (let t0 = Date.now(); Date.now() - t0 < 60000;) {
      await sleep(2000);
      const st = await Promise.all(sigs.map(sg => txStatus(sg, url).catch(() => ({ st: 'pending' }))));
      if (st.every(x => x.st === 'confirmed' || x.st === 'finalized' || x.st === 'failed')) break;   /* the balance read below is 'confirmed' */
    }
    for (const f of F) { for (let i = 0; i < 3; i++) { try { await sweepTo(f.seed, f.pub, to, url); break; } catch (_) { await sleep(1500); } } }
  }
  async function claimFresh(fseed, fpub, pseed, ppub, to, url, min) {   /* -> null (under min) | {sig, lamports, sweep} */
    const f = await creatorFees(fpub, url), lam = f.curve + f.pool; if (lam < (min || 2000000)) return null;   /* under 0.002 SOL: not worth the fees (and the wallet must end with 0 or >= 0.00089) */
    const msg = compile(ppub, [cuLimit(60000 + uq()), cuPrice(20000), ...creatorIxs(f)], await blockhash.refresh(url)), sg = await sign(pseed, msg);
    const sig = await sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url);
    return { sig, lamports: lam, sweep: await sweepTo(fseed, fpub, to, url) };
  }
  async function sweepTo(seed, from, to, url) {   /* everything on a launch wallet back to yours (it ends at 0, which is allowed) */
    const have = await balance(from, url), lam = have - 5000 - 20; if (lam <= 0) return null;
    return { sig: await moveSol(seed, from, to, lam, url), sol: lam / 1e9 };
  }


  /* ---- 3.9.4 OG finder (owner 1118): the first coin ever made with this coin's name. Jupiter's token search (creation time of every
     token) and DexScreener's pair search, both asked for the name and the ticker; names compare without case, spaces or punctuation. ---- */
  const ogKey = s => { const t = String(s || '').normalize('NFKC').toLowerCase(), k = t.replace(/[^\p{L}\p{N}]+/gu, ''); return k || t.replace(/\s+/g, ''); };
  const getJ = async (u, h) => { const r = await fetch(u, h ? { headers: h } : undefined); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.st = r.status; throw e; } return r.json(); };
  /* 3.9.7 (owner: "the click must open it at once"): one pass, every source at the same time (~1-2 s from opening the coin, long before
     a click): Jupiter's token search, DexScreener (name, ticker, this coin), GeckoTerminal's pool search 5 pages at once (100 pools with
     their token names; 3.9.6 found 6bUP.. this way, 83 s older than the HQjX.. Jupiter alone gave for "Official Grand Theft Auto VI"),
     pump.fun's own search oldest first (when this Chrome passes its Cloudflare check; else skipped). What a name turned up is kept for
     10 min, so every copy of the same name answers at once, with no new requests. */
  const OGN = new Map();   /* ogKey(name) -> {at, all: Map(addr -> {a, name, sym, t, mc}), full} */
  async function ogFind(mint, url, quick) {   /* 3.12.11: quick = no picture downloads (an answer in ~1 s); the full one follows */
    const meta = await coinMeta(mint, url), k = ogKey(meta.name);
    let c = OGN.get(k);
    if (!c || Date.now() - c.at > 600000 || (!c.all.has(mint) && Date.now() - c.at > 60000)) {
      const DS = 'https://api.dexscreener.com/latest/dex/', jh = CONF.jupKey ? { 'x-api-key': CONF.jupKey } : null;
      const all = new Map(), put = (a, name, sym, t, mc, img) => {
        if (!a || !name || ogKey(name) !== k) return; const o = all.get(a) || { a, name, sym, t: Infinity, mc: 0 };
        if (t > 0 && t < o.t) o.t = t; if (mc > o.mc) o.mc = mc; if (img) { o.imgs = o.imgs || []; if (!o.imgs.includes(img)) o.imgs.push(img); } all.set(a, o);
      };
      const fromJ = L => { for (const x of Array.isArray(L) ? L : []) put(x.id, x.name, x.symbol, Date.parse(x.createdAt || (x.firstPool || {}).createdAt || '') || 0, +x.mcap || 0, x.icon); };
      const DQ = new Map();   /* 3.12.5: the pair (quote coin) DexScreener shows for a candidate */
      const fromD = j => { for (const p of (j && j.pairs) || (Array.isArray(j) ? j : [])) if (p.chainId === 'solana' && p.baseToken) { put(p.baseToken.address, p.baseToken.name, p.baseToken.symbol, +p.pairCreatedAt || 0, +p.marketCap || +p.fdv || 0); if (p.quoteToken && p.quoteToken.address && !DQ.has(p.baseToken.address)) DQ.set(p.baseToken.address, p.quoteToken.address); } };
      const fromG = g => { const T = new Map((g.included || []).map(t => [t.id, t.attributes || {}]));
        for (const x of g.data || []) { const t = T.get(((x.relationships || {}).base_token || { data: {} }).data.id) || {}; put(t.address, t.name, t.symbol, Date.parse((x.attributes || {}).pool_created_at || '') || 0, 0); } };
      const GT = 'https://api.geckoterminal.com/api/v2/search/pools?network=solana&include=base_token&query=' + encodeURIComponent(meta.name) + '&page=';
      const q = [meta.name, meta.symbol].filter((v, i, A) => v && A.indexOf(v) === i);
      let full = true;
      put(mint, meta.name, meta.symbol, 0, 0);
      /* 3.12.12 (owner: "still slow"): the answer waits only for the fast sources (each ~0.3-0.45 s); pump.fun's search and GeckoTerminal's
         pages 2-5 keep filling the cache for the next lookup */
      [2, 3, 4, 5].forEach(p => getJ(GT + p).then(fromG, () => { full = false; }));
      const SRC = Promise.all([
        getJ(jbase() + '/tokens/v2/search?query=' + encodeURIComponent(meta.name), jh).then(fromJ, () => {}),
        getJ(DS + 'tokens/' + mint).then(fromD, () => {}),
        ...q.map(v => getJ(DS + 'search?q=' + encodeURIComponent(v)).then(fromD, () => {})),
        getJ(GT + 1).then(fromG, () => { full = false; }),
      ]);
      fetch('https://frontend-api-v3.pump.fun/coins/search?offset=0&limit=50&sort=created_timestamp&order=ASC&includeNsfw=true&type=exact&searchTerm=' + encodeURIComponent(meta.name), { credentials: 'include' })
          .then(r => r.ok ? r.json() : null).then(j => { for (const x of Array.isArray(j) ? j : (j && j.coins) || []) put(x.mint, x.name, x.symbol, +x.created_timestamp || 0, +x.usd_market_cap || 0, x.image_uri); }, () => {});
      await Promise.race([SRC, sleep(OGWAIT)]);   /* 3.12.9 (owner: 'OG must load faster'): what is in after 1.5 s decides; the rest still fills the cache */
      if (c) for (const o of c.all.values()) { put(o.a, o.name, o.sym, o.t, o.mc); for (const im of o.imgs || []) put(o.a, o.name, o.sym, o.t, o.mc, im); }   /* keep what earlier lookups of this name found */
      /* 3.12.5 (owner 1119: "OG must be of the same pair"): each candidate's pair from its pump.fun curve (quote_mint at byte 83; SOL = all
         zeros or WSOL), else what DexScreener shows; earlier lookups' answers are kept */
      const A = [...all.keys()], Q = new Map(c && c.q ? c.q : []);
      const need = A.filter(a => !Q.has(a)), bcs = await Promise.all(need.map(a => pda([enc('bonding-curve'), b58d(a)], PUMP)));
      await Promise.all(Array.from({ length: Math.ceil(need.length / 100) }, (_, n) => n * 100).map(i => accs(bcs.slice(i, i + 100), url).catch(() => []).then(r =>
        r.forEach((v, j) => { const a = need[i + j]; if (v && v.owner === PUMP && v.data.length >= 115) { const qm = b58e(v.data.slice(83, 115)); Q.set(a, qm === SYS ? WSOL : qm); } else if (v && v.owner === PUMP) Q.set(a, WSOL); else if (DQ.has(a)) Q.set(a, DQ.get(a)); }))));   /* a curve from before paired coins existed is a SOL one */   /* 3.12.11: all pages at once */
      c = { at: Date.now(), all, full, q: Q }; OGN.set(k, c); if (OGN.size > 100) OGN.delete(OGN.keys().next().value);
    }
    if (c.q && !c.q.has(mint)) { try { const [v] = await accs([await pda([enc('bonding-curve'), b58d(mint)], PUMP)], url); if (v && v.owner === PUMP && v.data.length >= 115) { const qm = b58e(v.data.slice(83, 115)); c.q.set(mint, qm === SYS ? WSOL : qm); } else if (v && v.owner === PUMP) c.q.set(mint, WSOL); } catch (_) {} }
    const named = [...c.all.values()].filter(o => o.t < Infinity).sort((x, y) => x.t - y.t), me = c.all.get(mint) || { t: Infinity };
    if (!named.length) throw new Error('no creation time found for this coin');
    const myQ = c.q && c.q.get(mint), same = myQ ? named.filter(o => c.q.get(o.a) === myQ) : named;   /* the same pair only (unknown pair: all names) */
    let og = same.length ? same[0] : named[0], pic = null; const any = named[0];
    /* 3.12.14 (owner: "both matter, balance them"): 1) the oldest same-pair coin with this picture, 2) else the oldest coin with this
       picture in another pair, 3) else the oldest same-name coin of this pair (another picture), 4) else this coin */
    let dbg = null, M = { match: new Set(), how: new Map() };
    try { M = await ogByPic(meta, mint, named, url, c.all.get(mint), quick); dbg = M.dbg; } catch (_) {}
    const myT = me.t < Infinity ? me.t : Infinity, older = named.filter(o => o.a !== mint && o.t < myT), inPair = o => !myQ || (c.q && c.q.get(o.a) === myQ);
    let pick = older.find(o => M.match.has(o.a) && inPair(o));
    if (pick) pic = (M.how.get(pick.a) === 'same' ? 'same' : 'similar') + ' picture, same pair';
    else if ((pick = older.find(o => M.match.has(o.a)))) pic = (M.how.get(pick.a) === 'same' ? 'same' : 'similar') + ' picture, other pair';
    else if ((pick = older.find(inPair))) pic = 'first in this pair (a different picture)';
    else pic = quick ? 'checking pictures' : 'no older coin with this name in this pair';
    og = pick || me;
    if (!og.a) og = Object.assign({ a: mint, name: meta.name, sym: meta.symbol }, og);
    return { mint, name: meta.name, sym: meta.symbol, self: og.a === mint, og, any: any.a !== og.a ? any : null, pair: myQ || null, pic, dbg, quick: !!quick, me: { t: me.t < Infinity ? me.t : 0 }, n: same.length, nAll: named.length, deep: true, full: c.full };
  }
  /* 3.12.6 (owner 1119: "same pair + the same or a similar picture"): among the same-name same-pair coins, oldest first, the first whose
     picture is this coin's: the same IPFS file at once, else a similar picture by a 64-bit difference hash (9x8 grey, neighbours compared;
     <= 10 bits apart = the same picture re-uploaded or re-compressed). This coin is in the list, so with no earlier match it is the OG. */
  const PICH = new Map(), GW = ['https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://dweb.link/ipfs/', 'https://w3s.link/ipfs/'];
  const cidOf = u => { const t = String(u || ''); return (t.match(/\/ipfs\/([A-Za-z0-9]{40,})/) || t.match(/^ipfs:\/\/([A-Za-z0-9]{40,})/) || [])[1] || null; };
  async function getAny(u, kind, ms) {
    const cid = cidOf(u), urls = cid ? GW.map(g => g + cid) : [u], ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms || 5000);
    try { return await Promise.any(urls.map(x => fetch(x, { signal: ac.signal }).then(r => r.ok ? (kind === 'json' ? r.json() : r.blob()) : Promise.reject(new Error('HTTP ' + r.status))))); }
    finally { clearTimeout(tm); ac.abort(); }
  }
  async function dhash(blob) {
    const bm = await createImageBitmap(blob), cv = new OffscreenCanvas(9, 8), x = cv.getContext('2d'); x.drawImage(bm, 0, 0, 9, 8);
    const d = x.getImageData(0, 0, 9, 8).data, g = i => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; let h = 0n;
    for (let y = 0; y < 8; y++) for (let i = 0; i < 8; i++) { const p = (y * 9 + i) * 4; h = (h << 1n) | (g(p) > g(p + 4) ? 1n : 0n); }
    return h;
  }
  const ham = (a, b) => { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
  function picOf(uri) {   /* metadata link -> {img, cid, h} (cached per link) */
    if (PICH.has(uri)) return PICH.get(uri);
    const p = (async () => { const j = await getAny(uri, 'json', 5000), img = j && typeof j.image === 'string' ? j.image : null; if (!img) return null;
      const o = { img, cid: cidOf(img), h: null }; try { o.h = await dhash(await getAny(img, 'blob', 6000)); } catch (_) {} return o; })().catch(() => null);
    PICH.set(uri, p); if (PICH.size > 400) PICH.delete(PICH.keys().next().value); return p;
  }
  /* 3.12.7 (owner: "it must be practically instant"): the pictures come with the search answers (Jupiter icon, pump.fun image), so the same
     file is matched at once with no download; similar pictures are hashed all in parallel within 2.5 s (what is not in by then is skipped).
     The lookup runs as the coin opens, so the click itself only follows the answer. */
  const HH = new Map(), PICMS = 1300, OGWAIT = 1000;
  const hashOf = im => { if (!HH.has(im)) { HH.set(im, getAny(im, 'blob', 4000).then(dhash).catch(() => null)); if (HH.size > 600) HH.delete(HH.keys().next().value); } return HH.get(im); };
  /* 3.12.10 (owner: "WokeStar is not the OG, why does it say OG"): 8 of its 14 older namesakes had no picture in the search answers, so
     nothing was compared and the coin called itself the OG. Now every older namesake's own metadata picture is read (Token-2022 metadata
     in the mint, else Metaplex: Meteora / Raydium coins too), this coin's as well, all in parallel; the same IPFS file matches at once,
     a similar picture by the hash. A coin is called the OG only when every older namesake's picture was actually compared; otherwise
     the oldest namesake whose picture could not be read is offered (the cautious answer). */
  const META_URI = new Map();   /* mint -> metadata link */
  async function uriOf(list, url) {
    const need = list.filter(o => !META_URI.has(o.a)); if (!need.length) return;
    const r = await accs(need.map(o => o.a), url).catch(() => []);
    await Promise.all(need.map(async (o, i) => {
      const mi = r[i]; let uri = null;
      try { if (mi && mi.owner === TOKEN_PROGS[1] && mi.data.length > 170) { const d = mi.data; for (let q = 166; q + 4 <= d.length;) { const t = d[q] | d[q + 1] << 8, n = d[q + 2] | d[q + 3] << 8; if (t === 19) { let p = q + 4 + 64, v; [v, p] = rdStr(d, p); [v, p] = rdStr(d, p); [uri] = rdStr(d, p); break; } if (!t && !n) break; q += 4 + n; } } } catch (_) {}
      if (!uri && mi) { try { uri = (await coinMeta(o.a, url)).uri; } catch (_) {} }
      if (uri) META_URI.set(o.a, uri); if (META_URI.size > 3000) META_URI.delete(META_URI.keys().next().value);
    }));
  }
  /* 3.12.14: which older namesakes (any pair) have this coin's picture: the same file (URL / IPFS CID) or a similar one (difference hash
     <= 10 bits). Quick = only the files the search answers carried, no downloads. -> {match: Set of mints, how: Map mint -> 'same' | 'similar'} */
  async function ogByPic(meta, mint, list, url, meO, quick) {
    const me = list.find(o => o.a === mint) || meO, myT = me && me.t < Infinity ? me.t : Infinity;
    const older = list.filter(o => o.a !== mint && o.t < myT).slice(0, 40);   /* oldest first */
    const how = new Map(), out = { match: new Set(), how, dbg: { older: older.length } };
    const add = (o, im) => { if (o && im) { o.imgs = o.imgs || []; if (!o.imgs.includes(im)) o.imgs.push(im); } };
    const sameFile = (mine, myC, o) => (o.imgs || []).some(im => mine.has(im) || (cidOf(im) && myC.has(cidOf(im))));
    if (quick) {
      const mq = new Set(me && me.imgs ? me.imgs : []), mc = new Set([...mq].map(cidOf).filter(Boolean)); if (!mq.size) return out;
      for (const o of older) if (sameFile(mq, mc, o)) { out.match.add(o.a); how.set(o.a, 'same'); }
      return out;
    }
    const end = Date.now() + PICMS, left = () => Math.max(0, end - Date.now()), TO = Symbol(), cap = p => Promise.race([p, sleep(left()).then(() => TO)]);
    await cap(uriOf(older.concat(me ? [me] : []), url));
    const myP = META_URI.has(mint) ? picOf(META_URI.get(mint)) : meta.uri ? picOf(meta.uri) : Promise.resolve(null);
    const P = await Promise.all([myP, ...older.map(o => META_URI.has(o.a) ? picOf(META_URI.get(o.a)) : null)].map(p => p ? cap(p) : null));
    if (P[0] && P[0] !== TO && P[0].img) add(me, P[0].img);
    older.forEach((o, i) => { const p = P[i + 1]; if (p && p !== TO && p.img) add(o, p.img); });
    const mine = new Set(me && me.imgs ? me.imgs : []); if (!mine.size) return out;
    const myC = new Set([...mine].map(cidOf).filter(Boolean));
    for (const o of older) if (sameFile(mine, myC, o)) { out.match.add(o.a); how.set(o.a, 'same'); }
    const myH = await cap(Promise.any([...mine].map(im => hashOf(im).then(h => h == null ? Promise.reject() : h))).catch(() => null));
    if (myH && myH !== TO) {
      const pool = older.filter(o => !out.match.has(o.a) && o.imgs && o.imgs.length);
      const H = await Promise.all(pool.map(o => cap(Promise.any(o.imgs.map(im => hashOf(im).then(h => h == null ? Promise.reject() : h))).catch(() => null))));
      pool.forEach((o, i) => { const h = H[i]; if (h && h !== TO && ham(myH, h) <= 10) { out.match.add(o.a); how.set(o.a, 'similar'); } });
      out.dbg.hashed = H.filter(h => h && h !== TO).length;
    } else out.dbg.myHash = myH === TO ? 'timeout' : 'failed';
    return out;
  }
  /* ---- wallet housekeeping: empty token accounts back to SOL, SOL between your own wallets ---- */
  const cuLimit = n => ({ prog: CBP, keys: [], data: cat(Uint8Array.of(2), le(n, 4)) });
  const cuPrice = micro => ({ prog: CBP, keys: [], data: cat(Uint8Array.of(3), le(micro, 8)) });
  /* every token account of the wallet holding 0 tokens (each keeps ~0.002 SOL of rent; closing it sends that back to the wallet).
     Token-2022 accounts that still hold withheld transfer fees cannot be closed and are left out. */
  async function emptyAccounts(pub, url) {
    const out = [];
    if (!url) {   /* the free nodes refuse this lookup from a browser: Jupiter's holdings list the empty accounts and which can be closed */
      const r = await JF('/ultra/v1/holdings/' + pub), j = await r.json().catch(() => null); if (!j || !j.tokens) throw new Error('holdings unavailable');
      for (const L of Object.values(j.tokens)) for (const a of L) if (String(a.amount) === '0' && a.reclaimAction === 'close' && !a.isFrozen && TOKEN_PROGS.includes(a.programId))
        out.push({ addr: a.account, prog: a.programId, lamports: +a.lamports || +a.reclaimableLamports || 0 });
      return out;
    }
    for (const prog of TOKEN_PROGS) {
      const r = await rpc('getTokenAccountsByOwner', [pub, { programId: prog }, { encoding: 'jsonParsed', commitment: 'confirmed' }], url);
      for (const a of (r && r.value) || []) {
        const i = ((a.account.data || {}).parsed || {}).info || {}, amt = (i.tokenAmount || {}).amount;
        const held = ((i.extensions || []).find(e => e.extension === 'transferFeeAmount') || { state: {} }).state.withheldAmount;
        if (amt === '0' && i.state !== 'frozen' && i.owner === pub && !(+held > 0) && !(i.closeAuthority && i.closeAuthority !== pub)) out.push({ addr: a.pubkey, prog, lamports: a.account.lamports, mint: i.mint });
      }
    }
    return out;
  }
  async function sendWait(tx64, url, ms = 30000) {   /* send (with the node's checks) and wait for confirmed */
    const sig = await rpc('sendTransaction', [tx64, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }], url);
    for (const t0 = Date.now(); Date.now() - t0 < ms;) { await sleep(800); const s = await txStatus(sig, url).catch(() => ({ st: 'pending' })); if (s.st === 'failed') throw new Error('failed on chain'); if (s.st !== 'pending') return sig; }
    throw new Error('not confirmed in ' + Math.round(ms / 1000) + ' s');
  }
  /* 3.17.0 trader cashback (pump.fun cashback coins): on the curve it waits as lamports in your volume accumulator (above its rent), on
     PumpSwap as WSOL in that accumulator's WSOL account. -> {curve, pool} lamports */
  const AMMP = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
  async function cashbackOf(pub, url) {
    const [u1, u2] = await Promise.all([pda([enc('user_volume_accumulator'), b58d(pub)], PUMP), pda([enc('user_volume_accumulator'), b58d(pub)], AMMP)]);
    const w2 = await ata(u2, TOKEN, WSOL), [a1, a2] = await accs([u1, w2], url);
    let curve = 0;
    if (a1) { const rent = await rpc('getMinimumBalanceForRentExemption', [a1.data.length], url); curve = Math.max(0, a1.lamports - rent); }
    const pool = a2 && a2.data.length >= 72 ? Number(u64(a2.data, 64)) : 0;
    return { curve, pool, u1, u2, w2 };
  }
  async function claimCashback(seed, pub, url) {
    const cb = await cashbackOf(pub, url); if (cb.curve + cb.pool < 10000) return { sol: 0 };
    const [e1, e2, wa] = await Promise.all([pda([enc('__event_authority')], PUMP), pda([enc('__event_authority')], AMMP), ata(pub, TOKEN, WSOL)]);
    const ixs = [cuLimit(cb.pool ? 90000 : 40000), cuPrice(20000)];
    if (cb.curve >= 5000) ixs.push({ prog: PUMP, keys: [[pub, false, true], [cb.u1, false, true], [SYS, false, false], [e1, false, false], [PUMP, false, false]], data: D_CASHBACK });
    if (cb.pool >= 5000) {
      ixs.push({ prog: ATAP, keys: [[pub, true, true], [wa, false, true], [pub, false, false], [WSOL, false, false], [SYS, false, false], [TOKEN, false, false]], data: Uint8Array.of(1) });
      ixs.push({ prog: AMMP, keys: [[pub, false, true], [cb.u2, false, true], [WSOL, false, false], [TOKEN, false, false], [cb.w2, false, true], [wa, false, true], [SYS, false, false], [e2, false, false], [AMMP, false, false]], data: D_CASHBACK });
      ixs.push({ prog: TOKEN, keys: [[wa, false, true], [pub, false, true], [pub, true, false]], data: Uint8Array.of(9) });   /* WSOL back to SOL */
    }
    const msg = compile(pub, ixs, await blockhash.refresh(url)), sg = await sign(seed, msg);
    return { sig: await sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url), sol: (cb.curve + cb.pool) / 1e9 };
  }
  /* close the given empty accounts, 20 per transaction; the rent goes back to the owner */
  async function closeEmpty(list, seed, pub, url) {
    const res = { closed: 0, lamports: 0, sigs: [], errs: [] };
    for (let i = 0; i < list.length; i += 20) {
      const part = list.slice(i, i + 20);
      try {
        const ixs = [cuLimit(8000 + part.length * 4000), cuPrice(20000)].concat(part.map(x => ({ prog: x.prog, keys: [[x.addr, false, true], [pub, false, true], [pub, true, false]], data: Uint8Array.of(9) })));
        const msg = compile(pub, ixs, await blockhash.refresh(url)), sg = await sign(seed, msg);
        res.sigs.push(await sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url));
        res.closed += part.length; res.lamports += part.reduce((s, x) => s + x.lamports, 0);
      } catch (e) { res.errs.push(String((e && e.message) || e).slice(0, 140)); }
    }
    return res;
  }
  /* ---- 3.10.0 creator fees (owner 1118): pump.fun pays the creator of a coin a share of every trade. On the curve it piles up as SOL in
     the creator's vault (PDA "creator-vault" + creator, pump program); after migration as WSOL in the PumpSwap creator vault. One claim:
     transfer_creator_fees_to_pump (PumpSwap WSOL -> the pump vault, only when there is some) + collect_creator_fee (vault SOL minus its
     rent -> the wallet). Accounts and discriminators from pump-fun/pump-public-docs idl/pump.json and idl/pump_amm.json. ---- */
  const D_COLLECT = Uint8Array.of(20, 22, 86, 123, 198, 28, 219, 132), D_TO_PUMP = Uint8Array.of(139, 52, 134, 85, 228, 229, 108, 241), RENT0 = 890880;
  async function creatorFees(pub, url) {   /* -> {curve, pool} lamports claimable now, + the accounts */
    const T = TOKEN_PROGS[0], [cv, av, ev, aev] = await Promise.all([pda([enc('creator-vault'), b58d(pub)], PUMP), pda([enc('creator_vault'), b58d(pub)], AMM),
      pda([enc('__event_authority')], PUMP), pda([enc('__event_authority')], AMM)]);
    const ava = await ata(av, T, WSOL), [a, b] = await accs([cv, ava], url);
    return { pub, cv, av, ava, ev, aev, curve: a ? Math.max(0, a.lamports - RENT0) : 0, pool: b && b.data.length >= 72 ? Number(u64(b.data, 64)) : 0 };
  }
  function creatorIxs(f) {
    const ixs = [];
    if (f.pool > 0) ixs.push({ prog: AMM, keys: [[WSOL, false, false], [TOKEN_PROGS[0], false, false], [SYS, false, false], [ATAP, false, false], [f.pub, false, false],
      [f.av, false, true], [f.ava, false, true], [f.cv, false, true], [f.aev, false, false], [AMM, false, false]], data: D_TO_PUMP });
    ixs.push({ prog: PUMP, keys: [[f.pub, false, true], [f.cv, false, true], [SYS, false, false], [f.ev, false, false], [PUMP, false, false]], data: D_COLLECT });
    return ixs;
  }
  async function claimCreator(seed, pub, url, sim) {   /* -> {sig, lamports} (sim: a dry run, nothing sent) */
    const f = await creatorFees(pub, url), lam = f.curve + f.pool;
    if (lam < 10000) throw new Error('nothing to claim');
    const msg = compile(pub, [cuLimit(60000 + uq()), cuPrice(20000), ...creatorIxs(f)], await blockhash.refresh(url));
    if (sim) { const v = ((await rpc('simulateTransaction', [b64(cat(Uint8Array.of(1), new Uint8Array(64), msg)), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed', accounts: { encoding: 'base64', addresses: [pub, f.cv] } }], url)) || {}).value || {}; return { sim: v, lamports: lam }; }
    const sg = await sign(seed, msg);
    return { sig: await sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url), lamports: lam };
  }
  /* SOL from one of your wallets to another of your wallets */
  /* 3.28.0 subscription payment: SOL to the HAKI address + a memo naming the subscription (Memo v1: no accounts) */
  async function paySol(seed, from, to, lamports, memo, url) {
    const ix = { prog: SYS, keys: [[from, true, true], [to, false, true]], data: cat(le(2, 4), le(lamports, 8)) };
    const mo = { prog: 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo', keys: [], data: new TextEncoder().encode(memo) };
    const msg = compile(from, [cuLimit(20000), cuPrice(20000), ix, mo], await blockhash.refresh(url)), sg = await sign(seed, msg);
    return sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url);
  }
  async function moveSol(seed, from, to, lamports, url) {
    const ix = { prog: SYS, keys: [[from, true, true], [to, false, true]], data: cat(le(2, 4), le(lamports, 8)) };
    const msg = compile(from, [cuLimit(1000), cuPrice(20000), ix], await blockhash.refresh(url)), sg = await sign(seed, msg);
    return sendWait(b64(cat(Uint8Array.of(1), sg, msg)), url);
  }

  /* Auto sell decision: A = rules, f = what already fired on this position (+ peak multiple), x = price now / average entry,
     left = SOL put in minus SOL taken out, value = what the position is worth now. -> [kind, sell %, label] | ['safe-done'] | null.
     Stop loss first, then trailing, then Safe 2x, then take profit. m = { now, entry } market cap in $ (null: unknown): a rule set by
     market cap fires when the cap gets there, and only on a position bought on the other side of it (bought at 50K: a 30K take profit
     does not sell it at once). */
  const kmc = v => v >= 1e9 ? +(v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? +(v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
  function autoRule(A, f, x, left, value, m) {
    const byMc = r => r.by === 'mc';
    if (A.sl.on && !f.sl && (byMc(A.sl) ? m && m.now <= A.sl.mc && m.entry > A.sl.mc : x <= 1 - A.sl.at / 100)) return ['sl', A.sl.pct, byMc(A.sl) ? 'Stop loss at MC $' + kmc(A.sl.mc) : 'Stop loss −' + A.sl.at + '%'];
    if (A.tr.on && !f.tr && (f.peak || 0) > 1 && x <= f.peak * (1 - A.tr.at / 100)) return ['tr', A.tr.pct, 'Trailing stop −' + A.tr.at + '% from the top'];
    if (A.safe && !f.safe && x >= 2) return left > 0 && value > 0 ? ['safe', Math.min(100, left / value * 100), 'Safe trade: 2x, initials back'] : ['safe-done'];
    if (A.tp.on && !f.tp && (byMc(A.tp) ? m && m.now >= A.tp.mc && m.entry < A.tp.mc : x >= 1 + A.tp.at / 100)) return ['tp', A.tp.pct, byMc(A.tp) ? 'Take profit at MC $' + kmc(A.tp.mc) : 'Take profit +' + A.tp.at + '%'];
    return null;
  }
  return { paySol, multiTrade, pickSenders, cashbackOf, claimCashback, creatorFees, claimCreator, ogFind, coinMeta, launchTx, launchMany, launchFresh, sweepTo, freshNeed, claimFresh, twoStep, feeRefresh, poolFlags, poolBuild, poolState, warmSender, autoRule, emptyAccounts, closeEmpty, moveSol, failKind, compileV0, jupIx, quoteRate, ammConf, poolState, poolSell, poolFee, valueNow, AMM, i128, curveOf, u64, ST, pda, ata, onCurve, accs, pumpState, pumpConf, pumpBuild, feeOf, buyOut, sellOut, holdValue, whyFailed, sendFast, blockhash, compile, PUMP, HTIP,
    CONF, prep, txDeltas, solUsd, pnlOf, WSOL, TIP_MAX, TIP_DEF, b58e, b58d, isAddr, parseTx, pubOf, sign, signTx, readSecret, seal, unseal, sellAmount, rpc, balance, tokBal, mintOf, quote, build, sendAll, trade, txStatus, position, b64, unb64 };
})();
if (typeof module !== 'undefined') module.exports = SOLX;
