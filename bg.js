/* HAKI Strike, standalone: the only place that touches your keys. Wallets are stored sealed with your password
   (chrome.storage.local: {wallets: [{pub, label, box}]}, all with the same password); unlocking keeps the keys in chrome.storage.session
   (memory only, gone when Chrome closes, never readable by web pages or by the script on axiom.trade). 'sel' = the wallets that trade
   together (multi-wallet: each one buys the amount, each one sells its own %). The page script asks here and gets JSON back. */
importScripts('core.js', 'evm.js', 'bsc.js');   /* 3.14.0: BSC */

/* Self-update. This extension runs unpacked from a folder on your PC; a new version is written into that same folder and build.txt
   last. The worker notices build.txt changed and reloads the extension (your wallet, settings and PnL history stay: they live in
   chrome.storage.local), then puts the panel back into the open Axiom tabs. Only the local folder is read; nothing is downloaded.
   Never in the middle of a trade (waits until no transaction is being watched). A reload locks the wallets (the unlocked keys only
   live in memory), so while they are unlocked the new version waits: the panel shows "Update ready" and it is applied when you press
   it, or by itself when the wallets are locked anyway (Chrome restarted, Lock pressed). */
let UPD = '', UPD_GO = false;
async function buildNow() { try { return (await (await fetch(chrome.runtime.getURL('build.txt'), { cache: 'no-store' })).text()).trim(); } catch (_) { return ''; } }
const STORE = !!chrome.runtime.getManifest().update_url;   /* installed from the Chrome Web Store: the store updates it, no folder to watch */
async function buildCheck() {
  if (STORE) return;
  const v = await buildNow(); if (!v) return;
  const { build0 } = await chrome.storage.session.get({ build0: '' });
  if (!build0) { await chrome.storage.session.set({ build0: v }); return; }   /* first look since this version was loaded */
  if (v === build0 || [...RB.values()].some(x => Date.now() - x.t < 30000)) return;
  const open = Object.keys(await seedsAll()).length > 0;
  if (!open || UPD_GO || await keepOn()) { chrome.runtime.reload(); return; }   /* staying unlocked: nothing to lose, update now */
  if (UPD !== v) { UPD = v; for (const p of LIVE.ports) p.say({ upd: v }); }
}
setInterval(buildCheck, 3000); buildCheck();
try { chrome.alarms.create('build', { periodInMinutes: 0.5 }); chrome.alarms.onAlarm.addListener(a => { if (a.name === 'build') buildCheck(); }); } catch (_) {}
chrome.runtime.onInstalled.addListener(async d => {
  if (d.reason !== 'update' && d.reason !== 'install') return;
  try {   /* the panel back into Axiom tabs that are already open (the old one stopped with the old version) */
    for (const t of await chrome.tabs.query({ url: ['https://axiom.trade/*', 'https://*.axiom.trade/*', 'https://gmgn.ai/*', 'https://*.gmgn.ai/*', 'https://trade.padre.gg/*'] })) {   /* 3.13.0: + GMGN, Terminal */
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['early.js'] }).catch(() => {});
      chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['content.js'] }).catch(() => {});
    }
  } catch (_) {}
});
const PRESETS = [{ slip: 20, prio: 0.0001, tip: 0.001 }, { slip: 25, prio: 0.0005, tip: 0.0005 }, { slip: 30, prio: 0.001, tip: 0.001 }];
const DEF = { bscBuys: [0.01, 0.05, 0.1, 0.25], bscBuys2: [0.02, 0.2, 0.5, 1], buys2: [0.25, 2, 5, 10], sells2: [33, 55, 75, 90], bscSlip: 15, bscGwei: 0, maxBnb: 2, sellExact: true, exactTol: 2, exactTolBuy: 5, buys: [0.1, 0.5, 1, 3.5], sells: [25, 50, 75, 100], quick: 0.1, slip: 20, tip: 0.001, tipMig: 0, presets: null, preset: 0, hk: true, hkMod: 'none', hkBuy: ['q', 'w', 'e', 'r'], hkSell: ['a', 's', 'd', 'f'], pulse: true, maxSol: 5, rpc: '', jupKey: '', aiKey: '', aiModel: 'claude-opus-5-5',
  cTexts: [], cAuto: false, cMin: 0.5, sound: true, vol: 0.7, ui: 0.85, pz: 1, autoFee: 'fast', spamW: '', spamN: 5, spamFresh: true, feeTo: '' };

/* pump.fun Callout from the panel: the same requests pump.fun's own Callout button sends, with your pump.fun login in this Chrome
   (its cookies; this worker has host access to frontend-api-v3.pump.fun). Eligibility first: pump.fun needs a few seconds to see a new buy. */
const PF = 'https://frontend-api-v3.pump.fun';
/* pump.fun's API refuses requests whose Origin is not pump.fun ("Not allowed by CORS"). For this worker's own requests only (tabIds -1:
   not from any tab, so your pump.fun browsing is untouched) the Origin / Referer are set to pump.fun, as when you press its button. */
function pfRule() {
  try {
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [7101], addRules: [{ id: 7101, priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'set', value: 'https://pump.fun' }, { header: 'referer', operation: 'set', value: 'https://pump.fun/' }] },
      condition: { requestDomains: ['frontend-api-v3.pump.fun'], tabIds: [-1], resourceTypes: ['xmlhttprequest', 'other'] } }] }).catch(() => {});
  } catch (_) {}
}
pfRule();
async function pfElig(mint) {
  const r = await fetch(PF + '/callout/eligibility/' + mint, { credentials: 'include' }), txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch (_) {}
  if (/Just a moment|cf-chl|challenge-platform/i.test(txt)) return 'VERIFY';   /* Cloudflare wants this browser checked: open pump.fun once */
  if (r.status === 401 || r.status === 403 || (j.preflight && j.preflight.userFound === false)) return 'LOGIN';
  const a = ((j.preflight && j.preflight.postableAccounts) || [])[0] || {}, cr = (j.preflight && j.preflight.create) || {};
  /* a callout already there is updated the way pump.fun's Update button does it: a reply by its author on that callout
     (POST /callout/{calloutId}/replies, read from pump.fun's own route table 2026-11-16); a second create is refused DUPLICATE_CALLOUT */
  const left = a.attemptsRemaining != null ? +a.attemptsRemaining : cr.attemptsRemaining != null ? +cr.attemptsRemaining : 0;
  PFL.set(mint, { left, id: a.existingCalloutId || cr.existingCalloutId || '', t: Date.now() });
  if (a.existingCalloutId || a.verdict === 'EXISTING_CALLOUT' || cr.verdict === 'EXISTING_CALLOUT') return 'CALLED';
  return a.verdict || ((j.preflight && j.preflight.create) || {}).verdict || (r.ok ? 'UNKNOWN' : 'HTTP_' + r.status);
}
const TRS = new Map();   /* 3.10.3 text -> Russian */
const TRA = new Map();   /* 3.12.0 model|text -> Russian by Claude */
const AI_SYS = "You translate crypto-Twitter posts (Solana memecoin trading) into natural Russian, the way a Russian memecoin trader would say it. Output only the translation, nothing else. Keep tickers ($XYZ), coin and project names, @handles, numbers, links and emojis as they are. Slang: larp = фейк / наёбка; dev = дев (создатель монеты); to dev / devved a coin = задеплоить / создал монету (\"devved 500K\" = создал монету, которая дошла до 500K маркеткапа); jeet = паперхенд / слил; ape in = залететь; send it = в луну / качаем; rug = скам / раг; cto = CTO (комьюнити забрало монету); mc = маркеткап; ath = ATH; bullpost = буллпостить; callout = колл; kol = KOL / инфлюенсер; cabal = кабал (инсайдеры); bundle = бандл; snipers = снайперы; pvp = PvP; ngmi / wagmi as is; gm = гм; cooked = всё, конец; based = база; fud = FUD; degen = деген; bags = мешки / позиция; 10x = 10х. All caps in the original is emphasis, not names.";
/* 3.11.9 (owner: "everything is larp" came out as "всё РИПП"): crypto-twitter slang is put in plain English first and ALL-CAPS text
   lowered (Google misreads both: larp = role play, rug = carpet, ape = monkey, caps = names) */
const SLANG = [
  [/\bdev(?:v?ed|'d)\s+(\$?[\w]+)\s+to\s+(\$?\d[\d.,]*[kmb]?)/gi, 'launched the $1 coin, it went to $2 market cap'], [/\bdev(?:v?ed|'d)\b/gi, 'launched a coin'],
  [/\bdevving\b/gi, 'launching coins'], [/\bbullposters?\b/gi, 'people posting hype'], [/\bbullposting\b/gi, 'posting hype'], [/\bcallouts?\b/gi, 'promo posts'],
  [/\blarp(?:ing|ers?|ed)?\b/gi, 'fake'], [/\brug(?:ged|pull(?:ed)?|s)?\b/gi, 'scam'], [/\bjeeted\b/gi, 'dumped'], [/\bjeeting\b/gi, 'dumping'], [/\bjeets?\b/gi, 'paper hands'],
  [/\bape[ds]? in\b/gi, 'buy in big'], [/\baping\b/gi, 'buying in big'], [/\bsend(?:ing)? it\b/gi, 'pump it'], [/\bsend(?:ing)? (?=\$?[a-z0-9]*coin\b)/gi, 'pump '],
  [/\bcto\b/gi, 'community takeover'], [/\bngmi\b/gi, 'not going to make it'], [/\bwagmi\b/gi, 'we are all going to make it'],
  [/\bfud(?:ding)?\b/gi, 'fear-mongering'], [/\bdegens?\b/gi, 'gamblers'], [/\bbags\b/gi, 'holdings'], [/\bmoon(?:ing|ed)?\b/gi, 'skyrocket'],
  [/\blfg\b/gi, "let's go"], [/\bgm\b/gi, 'good morning'], [/\bgn\b/gi, 'good night'], [/\bkols?\b/gi, 'influencers'], [/\brekt\b/gi, 'wrecked'],
  [/\bhodl(?:ing)?\b/gi, 'hold'], [/\bshill(?:ing|ed)?\b/gi, 'promote'], [/\bcooked\b/gi, 'finished'], [/\bcabal\b/gi, 'insider group'],
  [/\bdyor\b/gi, 'do your own research'], [/\bnfa\b/gi, 'not financial advice'], [/\bath\b/gi, 'all-time high'], [/\bmc\b/gi, 'market cap'],
  [/\bdev\b/gi, 'developer'], [/\bdevs\b/gi, 'developers'], [/\bpvp\b/gi, 'player vs player'], [/\bsnipers?\b/gi, 'snipers'], [/\bbundled?\b/gi, 'bundled'],
  [/\brn\b/gi, 'right now'], [/\bngl\b/gi, 'not gonna lie'], [/\bfr\b/gi, 'for real'], [/\bidk\b/gi, "I don't know"],
];
function trPrep(t) {
  const L = (t.match(/\p{L}/gu) || []), up = L.filter(c => c !== c.toLowerCase()).length;
  if (L.length > 8 && up / L.length > 0.6) t = t.split(/(\s+)/).map(w => /^\$/.test(w) ? w : w.toLowerCase()).join('').replace(/(^|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  for (const [r, v] of SLANG) t = t.replace(r, v);
  return t;
}
const PFL = new Map();   /* mint -> {left: create attempts pump.fun still allows, id: your callout on it} */
const PFERR = { DUPLICATE_CALLOUT: 'you already called this coin: write the text and press Update', ATTEMPT_LIMIT: 'no updates left on this coin (pump.fun allows 3 per coin)', COOLDOWN: 'pump.fun cooldown: try again in a moment',
  INVALID_CONTENT: 'pump.fun refused the text', INSUFFICIENT_BALANCE: 'hold the coin first', SPAM_RESTRICTED: 'pump.fun limited your callouts for now' };
async function pfCallout(mint, text, waitMs, update) {
  let v = '';
  for (const t0 = Date.now(); ;) {
    v = await pfElig(mint).catch(() => 'NETWORK');
    if (v === 'ELIGIBLE') break;
    if (v === 'LOGIN') throw new Error('log in to pump.fun in this Chrome first');
    if (v === 'VERIFY') throw new Error('open pump.fun once in this Chrome (Cloudflare check), then try again');
    if (v === 'CALLED') {
      if (!update) throw new Error('you already called this coin: write the new text and press Update');
      if (!String(text || '').trim()) throw new Error('write the update first');
      const id = (PFL.get(mint) || {}).id; if (!id) throw new Error('pump.fun did not say which callout is yours: update it on pump.fun this time');
      const fu = new FormData(); fu.append('content', String(text).slice(0, 2000));
      const ru = await fetch(PF + '/callout/' + encodeURIComponent(id) + '/replies', { method: 'POST', body: fu, credentials: 'include' }), tu = await ru.text(); let ju = {}; try { ju = JSON.parse(tu); } catch (_) {}
      if (!ru.ok && /Just a moment|cf-chl|challenge-platform/i.test(tu)) throw new Error('open pump.fun once in this Chrome (Cloudflare check), then try again');
      if (!ru.ok) { const code = String(ju.code || ju.error || ''); throw new Error(PFERR[code] || (code + ' ' + (Array.isArray(ju.message) ? ju.message.join('; ') : (ju.message || ru.status))).trim()); }
      return { ok: true, update: true };
    }
    if (!/INSUFFICIENT_BALANCE|PENDING|INDEX|NETWORK|UNKNOWN/i.test(v) || Date.now() - t0 > waitMs) throw new Error('pump.fun says: ' + v.toLowerCase().replace(/_/g, ' '));
    await new Promise(r => setTimeout(r, 2500));
  }
  const fd = new FormData(); fd.append('coinMint', mint); if (text) fd.append('thesis', String(text).slice(0, 2000));
  const r = await fetch(PF + '/callout/create', { method: 'POST', body: fd, credentials: 'include' }), txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch (_) {}
  if (!r.ok && /Just a moment|cf-chl|challenge-platform/i.test(txt)) throw new Error('open pump.fun once in this Chrome (Cloudflare check), then post again');
  if (!r.ok) { const code = String(j.code || j.error || ''); throw new Error(PFERR[code] || (code + ' ' + (Array.isArray(j.message) ? j.message.join('; ') : (j.message || r.status))).trim()); }
  const { pfCalled = {} } = await chrome.storage.local.get({ pfCalled: {} }); pfCalled[mint] = Date.now();
  for (const k of Object.keys(pfCalled)) if (Date.now() - pfCalled[k] > 86400000) delete pfCalled[k];
  await chrome.storage.local.set({ pfCalled }); return { ok: true };
}
const CALLING = new Set();
async function autoCallout(c, mint) {   /* after a buy through this panel: your texts, from cMin SOL bought in the last 10 min, once per coin per 6 h */
  if (!c.cAuto || CALLING.has(mint)) return;
  const { led = {}, pfCalled = {} } = await chrome.storage.local.get({ led: {}, pfCalled: {} });
  if (pfCalled[mint] && Date.now() - pfCalled[mint] < 6 * 3600000) return;
  const sum = (led[mint] || []).filter(e => e.side === 'buy' && !e.ext && Date.now() - e.t < 600000).reduce((a, e) => a + e.sol, 0);
  if (sum < (+c.cMin || 0)) return;
  const L = c.cTexts, text = L.length ? L[Math.floor(Math.random() * L.length)] : '';
  CALLING.add(mint);
  try { await pfCallout(mint, text, 45000); for (const p of LIVE.ports) p.say({ callout: { ok: true, text: 'posted: ' + text } }); }
  catch (e) { for (const p of LIVE.ports) p.say({ callout: { ok: false, text: String(e.message || e) } }); }
  finally { CALLING.delete(mint); }
}
try { chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch (_) {}

/* 3.22.0 (owner: "an admin panel: how many users, what bugs; a Report button"): HAKI's own small stats server (Cloudflare).
   It gets ONLY: a random install ID (made here, not tied to you), the version, the site (axiom / gmgn / padre), the chain (sol / bsc),
   error texts with every address, signature and number removed, and the reports you write. Never a wallet, key, balance or trade.
   Settings -> Report a problem -> "Anonymous stats" turns the automatic part off. If the server is down nothing waits for it. */
const API = 'https://haki-strike-api.strike-api.workers.dev', VERS = chrome.runtime.getManifest().version;
const scrubT = s => String(s == null ? '' : s).slice(0, 400).replace(/0x[0-9a-fA-F]{20,}/g, '‹0x›').replace(/[1-9A-HJ-NP-Za-km-z]{32,90}/g, '‹addr›').replace(/\d+(\.\d+)?/g, '#');
const hostOf = u => /axiom\.trade/.test(u) ? 'axiom' : /gmgn\.ai/.test(u) ? 'gmgn' : /padre\.gg/.test(u) ? 'padre' : /^chrome-extension:/.test(u) ? 'popup' : 'other';
async function iid() {
  let { iid = '' } = await chrome.storage.local.get({ iid: '' });
  if (!/^[a-z0-9]{16,40}$/.test(iid)) { iid = [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join(''); await chrome.storage.local.set({ iid }); }
  return iid;
}
const teleOn = async () => (await chrome.storage.local.get({ tele: true })).tele !== false;
const apiPost = (p, o) => fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o), signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null);
const osOf = () => { try { return String((navigator.userAgentData && navigator.userAgentData.platform) || '').slice(0, 16); } catch (_) { return ''; } };
async function telePing(host, chain) {   /* at most every 6 h: counts you as active today */
  if (!(await teleOn())) return; const { tping = 0 } = await chrome.storage.local.get({ tping: 0 }); if (Date.now() - tping < 6 * 3600e3) return;
  await chrome.storage.local.set({ tping: Date.now() }); apiPost('/v1/ping', { id: await iid(), ver: VERS, host, chain, os: osOf() });
}
/* errors: kept here (the last 20, for a report) and counted for the server in one batch a minute; your own typos are not bugs */
const ERRS = [], EQ = new Map(); let eqT = 0, LHOST = 'other';
const USERERR = /not enough|hold none|nothing to sell|above your|password|choose|pick a|tick the|is locked|no wallet|unlock|already added|at least|too little|cancel/i;
function teleErr(kind, msg) {
  const m = scrubT(msg); if (!m || USERERR.test(m)) return;
  ERRS.push({ t: Date.now(), kind, msg: m }); if (ERRS.length > 20) ERRS.shift();
  const k = kind + '|' + m, x = EQ.get(k); if (x) x.n++; else if (EQ.size < 20) EQ.set(k, { kind, msg: m, n: 1 });
  if (!eqT) eqT = setTimeout(async () => { eqT = 0; const list = [...EQ.values()]; EQ.clear(); if (list.length && await teleOn()) apiPost('/v1/err', { id: await iid(), ver: VERS, host: LHOST, list }); }, 60000);
}
self.addEventListener('unhandledrejection', e => teleErr('worker', (e.reason && (e.reason.message || e.reason)) || 'rejection'));
self.addEventListener('error', e => teleErr('worker', e.message || 'error'));

async function cfg() {
  const c = Object.assign({}, DEF, await chrome.storage.local.get(DEF));
  c.cTexts = (Array.isArray(c.cTexts) ? c.cTexts : []).filter(t => t && t !== 'Looks good, aiming for 2x');   /* the old built-in sample text is not yours: dropped */
  SOLX.CONF.jupKey = String(c.jupKey || '').trim();
  /* P1 / P2 / P3 like HAKI: slippage, priority fee, tip each; an older single setting becomes P1 */
  /* 3.20.5 (owner: "faster"): P1's old default tip 0.0003 SOL only reached Helius' SWQOS lane; from 0.001 it goes to Jito and SWQOS at once.
     Once: a P1 still on the old default 0.0003 moves to 0.001 (a tip someone set themselves stays) */
  if (!c.tipMig) { let ch = false; if (+c.tip === 0.0003) { c.tip = 0.001; ch = true; }
    const p0 = Array.isArray(c.presets) && c.presets[0]; if (p0) { if (+p0.tip === 0.0003) { p0.tip = 0.001; ch = true; } if (+p0.stip === 0.0003) { p0.stip = 0.001; ch = true; } }
    c.tipMig = 1; chrome.storage.local.set(Object.assign({ tipMig: 1 }, ch ? { tip: c.tip } : {}, ch && p0 ? { presets: c.presets } : {})).catch(() => {}); }
  const P = Array.isArray(c.presets) && c.presets.length === 3 ? c.presets : [Object.assign({}, PRESETS[0], { slip: +c.slip || 20, tip: c.tip != null ? +c.tip : 0.001 }), PRESETS[1], PRESETS[2]];
  /* each preset: buy slip / prio / tip and its own sell sslip / sprio / stip (a preset saved before 3.3.7 sells with its buy values) */
  const S = v => Math.min(100, Math.max(0.1, +v)), F = (v, d) => Math.min(0.01, Math.max(0, +v >= 0 && v !== '' && v != null ? +v : d)), T = (v, d) => Math.min(SOLX.TIP_MAX, Math.max(0, +v >= 0 && v !== '' && v != null ? +v : d));
  c.presets = P.map((p, i) => { const b = { slip: S(+p.slip || PRESETS[i].slip), prio: F(p.prio, PRESETS[i].prio), tip: T(p.tip, PRESETS[i].tip) };
    return Object.assign(b, { sslip: +p.sslip ? S(p.sslip) : b.slip, sprio: F(p.sprio, b.prio), stip: T(p.stip, b.tip) }); });
  c.preset = [0, 1, 2].includes(+c.preset) ? +c.preset : 0;
  const a = c.presets[c.preset]; c.slip = a.slip; c.prio = a.prio; c.tip = a.tip; c.sslip = a.sslip; c.sprio = a.sprio; c.stip = a.stip;
  return c;
}
const feeOf = (c, side) => Object.assign(side === 'sell' ? { slip: c.sslip, prio: c.sprio, tip: c.stip } : { slip: c.slip, prio: c.prio, tip: c.tip }, { auto: ['fast', 'eco', 'off'].includes(c.autoFee) ? c.autoFee : 'fast' });   /* smart fees: the preset is the cap */   /* the preset's buy or sell settings */
/* 3.12.21 (owner 1120: "I sell at 12K, it fills at 10K"): Exact sell. A sell you click fills within 2 % of what the coin gives at the
   click (the quote at the click already has the pump.fun fee and your own size in it) or not at all: no fill far below the price you saw,
   and no automatic second try with more slippage. Auto sell (take profit / stop) keeps the preset's slippage: a stop must fill. */
const EXACT = false;   /* 3.18.4 (owner: "Exact is not needed"): trades use the preset slippage; the switch is gone from the panel */
const feeT = (c, side, auto) => { const f = feeOf(c, side); if (!auto && EXACT && c.sellExact !== false) {   /* 3.12.22: buys too (owner 1120: 'clicked at 170K, filled at 182K') */ f.slip = Math.min(f.slip, Math.max(0.5, side === 'buy' ? (+c.exactTolBuy || 5) : (+c.exactTol || 2))); f.exact = true; }   /* 3.12.24: buys 5 %, sells 2 % (owner 1120) */ return f; };
const BAL = { v: null, t: 0 }, BALS = new Map();   /* BALS: each wallet's last balance read */   /* the last balance read (state / pos): a buy checks against it instead of asking the node again */
/* wallets: a single 'box' from before 3.4 becomes Wallet 1 (kept in place, nothing re-sealed) */
async function walletsAll() {
  const { wallets = null, box = null } = await chrome.storage.local.get({ wallets: null, box: null });
  if (Array.isArray(wallets)) return wallets;
  const W = box ? [{ pub: box.pub, label: 'Wallet 1', box }] : []; if (box) await chrome.storage.local.set({ wallets: W, sel: [box.pub] }); return W;
}
async function selected() {   /* the wallets that trade now (at least the first one) */
  const W = await walletsAll(), { sel = null } = await chrome.storage.local.get({ sel: null });
  const S = W.filter(w => Array.isArray(sel) && sel.includes(w.pub)); return S.length ? S : W.slice(0, 1);
}
/* "Stay unlocked on this PC" (the owner's choice, 2026-11-16: no password after updates or a Chrome restart). The unlocked keys are
   kept in chrome.storage.local encrypted (AES-GCM) with a key that only this extension can use (a non-extractable WebCrypto key in its
   IndexedDB). It stops a copied settings file from showing the keys, but someone with access to this PC's Chrome profile could still
   use them; Lock in the toolbar popup turns it off and wipes the copy. */
function kdb() { return new Promise((res, rej) => { const r = indexedDB.open('hk-keep', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kdbDo(mode, fn) { const db = await kdb(); return new Promise((res, rej) => { const tx = db.transaction('k', mode), q = fn(tx.objectStore('k')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
async function keepSave(seeds) {
  let key = await kdbDo('readonly', s => s.get('key'));
  if (!key) { key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await kdbDo('readwrite', s => s.put(key, 'key')); }
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(seeds))));
  await chrome.storage.local.set({ keep: { iv: SOLX.b64(iv), ct: SOLX.b64(ct) } });
}
async function keepLoad() {
  const { keep } = await chrome.storage.local.get({ keep: null }); if (!keep) return null;
  try { const key = await kdbDo('readonly', s => s.get('key')); if (!key) return null;
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: SOLX.unb64(keep.iv) }, key, SOLX.unb64(keep.ct)))); } catch (_) { return null; }
}
async function keepClear() { await chrome.storage.local.remove('keep'); try { await kdbDo('readwrite', s => s.delete('key')); } catch (_) {} }
const keepOn = async () => !!(await chrome.storage.local.get({ keep: null })).keep;
let LOCKGEN = 0;   /* 3.21.5: Lock bumps it; a "stays unlocked" read that started before the Lock does not put the keys back */
async function seedsAll() {
  const g = LOCKGEN, { seeds = {}, seed = null } = await chrome.storage.session.get({ seeds: {}, seed: null });
  if (seed && !Object.keys(seeds).length) { const W = await walletsAll(); if (W[0]) seeds[W[0].pub] = seed; }   /* unlocked by 3.3.x */
  if (!Object.keys(seeds).length) { const k = await keepLoad(); if (k && Object.keys(k).length && g === LOCKGEN) { await chrome.storage.session.set({ seeds: k }); return k; } }   /* stays unlocked */
  return seeds;
}
async function box() { return (await selected())[0] || null; }   /* the main wallet: the first one that trades */
/* ---- BSC wallet (3.14.0): {bwallets: [{addr, label, box}]} sealed with the same password; unlocked keys in session 'bseeds' (address ->
   base64 key); "stay unlocked" keeps them encrypted with the same device key as the Solana ones ('bkeep'). ---- */
async function bwalletsAll() { const { bwallets = [] } = await chrome.storage.local.get({ bwallets: [] }); return Array.isArray(bwallets) ? bwallets : []; }
async function bkeepSave(K) {
  let key = await kdbDo('readonly', s => s.get('key'));
  if (!key) { key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await kdbDo('readwrite', s => s.put(key, 'key')); }
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(K))));
  await chrome.storage.local.set({ bkeep: { iv: SOLX.b64(iv), ct: SOLX.b64(ct) } });
}
async function bkeepLoad() {
  const { bkeep } = await chrome.storage.local.get({ bkeep: null }); if (!bkeep) return null;
  try { const key = await kdbDo('readonly', s => s.get('key')); if (!key) return null;
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: SOLX.unb64(bkeep.iv) }, key, SOLX.unb64(bkeep.ct)))); } catch (_) { return null; }
}
async function bseedsAll() {
  const g = LOCKGEN, { bseeds = {} } = await chrome.storage.session.get({ bseeds: {} });
  if (!Object.keys(bseeds).length) { const k = await bkeepLoad(); if (k && Object.keys(k).length && g === LOCKGEN) { await chrome.storage.session.set({ bseeds: k }); return k; } }
  return bseeds;
}
async function bscKey() {
  const W = await bwalletsAll(), w = W[0]; if (!w) throw new Error('add your BSC wallet in HAKI Strike settings (toolbar icon)');
  const K = await bseedsAll(); if (!K[w.addr]) throw new Error('unlock your wallets in HAKI Strike settings (toolbar icon)');
  return { addr: w.addr, key: SOLX.unb64(K[w.addr]) };
}
async function unlockedOf(pub) { const s = (await seedsAll())[pub]; return s ? { seed: SOLX.unb64(s), pub } : null; }
async function unlocked() { const b = await box(); return b ? unlockedOf(b.pub) : null; }
const legacyW = async () => ((await walletsAll())[0] || {}).pub;   /* trades booked before 3.4 have no wallet: they are Wallet 1's */
async function ledOf(mint, pubs) {   /* this coin's trades of the given wallets */
  const { led = {} } = await chrome.storage.local.get({ led: {} }), w1 = await legacyW(), P = new Set(pubs);
  return (led[mint] || []).filter(e => P.has(e.w || w1));
}
/* the position of several wallets on one coin, as one: tokens and value added up; the coin's state (curve / pool) is the first wallet's */
async function posAll(c, a, isMint, pubs) {
  const ps = await Promise.all(pubs.map(pub => SOLX.position(a, pub, rpcUrl(c), isMint)));
  const p = Object.assign({}, ps[0]), raw = ps.reduce((s, q) => s + BigInt(q.raw || 0), 0n);
  p.raw = raw.toString(); p.ui = p.dec != null ? Number(raw) / 10 ** p.dec : 0; p.value_sol = ps.every(q => q.value_sol != null) ? ps.reduce((s, q) => s + (+q.value_sol || 0), 0) : null;
  p.parts = ps.map((q, i) => ({ pub: pubs[i], raw: q.raw, ata: q.ata })); p.n = pubs.length; return p;
}
const rpcUrl = c => (c.rpc && /^https:\/\//.test(c.rpc)) ? c.rpc : undefined;
const busy = new Set(), done = new Map();

/* PnL ledger (chrome.storage.local 'led' = {mint: [{t, side, sol, gas, rent, tok, sig}]}): every trade this extension sent is kept as
   pending (storage.session 'pend') and booked once the chain shows it, with the amounts read from the transaction itself. */
async function pend(sig, mint, side, tipLamports, w) { const { pend = {} } = await chrome.storage.session.get({ pend: {} }); pend[sig] = { mint, side, tip: tipLamports, t: Date.now(), w }; await chrome.storage.session.set({ pend }); }
async function book(c, pub0, only) {
  const { pend = {} } = await chrome.storage.session.get({ pend: {} }); let ch = false;
  for (const [sig, p] of Object.entries(pend)) {
    if (only && sig !== only) continue;
    const pub = p.w || pub0;
    let x = null; try { x = await SOLX.txDeltas(sig, pub, p.mint, p.tip, rpcUrl(c)); } catch (_) { x = null; }
    if (!x) { if (Date.now() - p.t > 180000) { delete pend[sig]; ch = true; } continue; }   /* not visible after 3 min: dropped (failed / expired) */
    delete pend[sig]; ch = true;
    if (x.failed) continue;
    const e = { t: x.t || Date.now(), side: p.side, gas: (x.fee + x.tip) / 1e9, fee: x.fee / 1e9, base: x.base / 1e9, tip: x.tip / 1e9, plat: x.plat / 1e9, back: x.back / 1e9, v: 2, rent: x.rent / 1e9, tok: x.tok, dec: x.dec, sig, w: pub };
    e.sol = p.side === 'buy' ? Math.max(0, -x.d - x.fee - x.tip - x.rent) / 1e9 : Math.max(0, x.d + x.fee + x.tip) / 1e9;
    const { led = {} } = await chrome.storage.local.get({ led: {} }); const L = led[p.mint] = led[p.mint] || [];
    if (!L.some(y => y.sig === sig)) { L.push(e); if (L.length > 300) L.splice(0, L.length - 300); await chrome.storage.local.set({ led }); if (e.side === 'buy') autoCallout(c, p.mint).catch(() => {}); }
  }
  if (ch) { await chrome.storage.session.set({ pend }); liveLedger(); }
  return ch;
}
/* every trade of this wallet on the coin, wherever it was made (Axiom's own buttons, another terminal): read from the chain through the
   wallet's token account, booked like ours (SOL into / out of the trade; network fee + tips = gas; rent apart). Known signatures are skipped. */
const SEEN = new Map(), SYNCING = new Set();
async function syncChain(c, pub, mint, ata) {
  const k = mint + '|' + pub; if (!ata || SYNCING.has(k)) return; SYNCING.add(k);
  try {
    const sigs = await SOLX.rpc('getSignaturesForAddress', [ata, { limit: 40, commitment: 'confirmed' }], rpcUrl(c)).catch(() => []);
    const seen = SEEN.get(k) || new Set(); SEEN.set(k, seen);
    const { pend = {} } = await chrome.storage.session.get({ pend: {} }), { led = {} } = await chrome.storage.local.get({ led: {} });
    const L = led[mint] = led[mint] || []; let ch = false;
    for (const s of (sigs || []).slice().reverse()) {
      const g = s.signature;
      if (s.err || seen.has(g) || pend[g] || L.some(y => y.sig === g)) { seen.add(g); continue; }
      let x = null; try { x = await SOLX.txDeltas(g, pub, mint, null, rpcUrl(c)); } catch (_) { seen.add(g); continue; }
      if (!x) continue;   /* not visible yet: next time */
      seen.add(g);
      if (x.failed || !x.payer || x.tok === '0') continue;   /* tokens sent to you by someone else are not a trade */
      const buy = BigInt(x.tok) > 0n, e = { t: x.t || Date.now(), side: buy ? 'buy' : 'sell', gas: (x.fee + x.tip) / 1e9, fee: x.fee / 1e9, base: x.base / 1e9, tip: x.tip / 1e9, plat: x.plat / 1e9, back: x.back / 1e9, v: 2, rent: x.rent / 1e9, tok: x.tok, dec: x.dec, sig: g, ext: true, w: pub };
      e.sol = buy ? Math.max(0, -x.d - x.fee - x.tip - x.rent) / 1e9 : Math.max(0, x.d + x.fee + x.tip - x.back) / 1e9;
      L.push(e); ch = true;
    }
    /* trades booked before 3.3.5 have the gas as one number: read them once more for the split (network / priority / tips, Axiom's fee) */
    let n = 0;
    const w1 = await legacyW();
    for (const e of L) {
      if (e.v === 2 || !e.sig || n >= 25 || (e.w || w1) !== pub) continue; n++;
      let x = null; try { x = await SOLX.txDeltas(e.sig, pub, mint, null, rpcUrl(c)); } catch (_) { e.v = 2; ch = true; continue; }
      if (!x || x.failed) { if (x) { e.v = 2; ch = true; } continue; }
      const tip = Math.max(0, e.gas - x.fee / 1e9);   /* what we booked as gas stays; the part above the network fee is the tip */
      Object.assign(e, { fee: x.fee / 1e9, base: x.base / 1e9, tip, plat: x.plat / 1e9, back: e.side === 'sell' ? x.back / 1e9 : 0, v: 2 }); ch = true;
    }
    if (ch) { L.sort((a, b) => a.t - b.t); if (L.length > 300) L.splice(0, L.length - 300); await chrome.storage.local.set({ led }); liveLedger(); }
  } finally { SYNCING.delete(k); }
}
/* ---- Share PnL: the card data for share/share.html (HAKI's share card). The coin's name / picture / price history come from
   GeckoTerminal (public, no key); without it the line is drawn from your own fills. Nothing is posted anywhere from here. ---- */
const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const gtGet = async u => { const r = await fetch(GT + u, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error('gt ' + r.status); return r.json(); };
async function dataUri(u) {   /* the coin picture as data: (the card is exported as one image, so it can not point outside) */
  try {
    if (!/^https:\/\//i.test(String(u || ''))) return '';   /* 3.21.5 security: https only, 6 s, never more than 3 MB read */
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(u, { signal: ac.signal }).finally(() => clearTimeout(tm)); if (!r.ok) return ''; const t = (r.headers.get('content-type') || 'image/png').split(';')[0]; if (!/^image\//.test(t)) return '';
    if (+r.headers.get('content-length') > 3e6) return '';
    const rd = r.body.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > 3e6) { ac.abort(); return ''; } parts.push(value); }
    const b = new Uint8Array(n); { let o = 0; for (const p of parts) { b.set(p, o); o += p.length; } }
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return 'data:' + t + ';base64,' + btoa(s);
  } catch (_) { return ''; }
}
const COIN = new Map(), LINE = new Map();   /* mint -> {info + logo data URI, t}; line key -> {line, t} */
async function coinFull(mint) {   /* name / picture / pool, kept 30 min (the picture as data: for the exported card) */
  const h = COIN.get(mint); if (h && (h.p || Date.now() - h.t < 1800e3)) return h.p || h;
  const p = (async () => { const i = await coinInfo(mint); i.logo = i.image ? await dataUri(i.image) : ''; const r = Object.assign(i, { t: Date.now() }); COIN.set(mint, r); return r; })();
  COIN.set(mint, { p }); try { return await p; } catch (e) { COIN.delete(mint); throw e; }
}
async function coinInfo(mint) {
  let o = { ticker: '', name: '', image: '', pool: '' };
  try {
    const j = await gtGet('/tokens/' + mint + '?include=top_pools'), a = (j.data || {}).attributes || {}, tp = ((((j.data || {}).relationships || {}).top_pools || {}).data || [])[0];
    o = { ticker: a.symbol || '', name: a.name || '', image: a.image_url && !/missing/.test(a.image_url) ? a.image_url : '', pool: tp ? String(tp.id).replace(/^solana_/, '') : '' };
  } catch (_) {}
  /* 3.19.1 (owner: the card showed "J" instead of the coin): a fresh pump.fun coin is not on GeckoTerminal yet; Jupiter has its icon */
  if (!o.image || !o.name) try {
    const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mint), L = await r.json(), t = Array.isArray(L) ? L.find(x => x.id === mint) || L[0] : null;
    if (t) { o.image = o.image || t.icon || ''; o.name = o.name || t.name || ''; o.ticker = o.ticker || t.symbol || ''; }
  } catch (_) {}
  return o;
}
/* the price line over the holding time (with a margin on both sides) and where each fill sits on it */
async function priceLine(pool, L, from, to, cur) {
  const N = 120, span = Math.max(60e3, to - from), t0 = from - Math.max(span * .25, 5 * 60e3), t1 = to + (to >= Date.now() - 60e3 ? 0 : Math.max(span * .25, 5 * 60e3));
  let pts = [];
  if (pool) {
    const W = t1 - t0, [tf, ag, sec] = W <= 16 * 3600e3 ? ['minute', 1, 60] : W <= 3 * 86400e3 ? ['minute', 5, 300] : W <= 10 * 86400e3 ? ['minute', 15, 900] : ['hour', 1, 3600];
    try {
      const j = await gtGet(`/pools/${pool}/ohlcv/${tf}?aggregate=${ag}&limit=1000&currency=usd&token=base&before_timestamp=${Math.ceil(t1 / 1000) + sec}`);
      pts = (((j.data || {}).attributes || {}).ohlcv_list || []).map(r => [r[0] * 1000, +r[4]]).filter(p => p[1] > 0 && p[0] >= t0 - sec * 1000).sort((a, b) => a[0] - b[0]);
    } catch (_) { pts = []; }
  }
  if (pts.length < 3) {   /* not indexed yet: the fills' own prices (SOL per token) and the price now */
    pts = L.filter(e => e.tok && e.tok !== '0' && e.sol > 0).map(e => [e.t, e.sol / (Math.abs(Number(e.tok)) / 10 ** (e.dec || 6))]);
    if (cur > 0) pts.push([Date.now(), cur]);
    pts.sort((a, b) => a[0] - b[0]);
  }
  if (!pts.length) return { chart: Array(N).fill(1), trades: [] };
  const a = Math.min(t0, pts[0][0]), b = Math.max(t1, pts[pts.length - 1][0]), chart = [];
  for (let i = 0, k = 0; i < N; i++) {   /* straight lines between the known prices (flat before the first / after the last) */
    const t = a + (b - a) * i / (N - 1); while (k + 1 < pts.length && pts[k + 1][0] <= t) k++;
    const p0 = pts[k], p1 = pts[k + 1], v = t <= pts[0][0] ? pts[0][1] : !p1 ? p0[1] : p0[1] + (p1[1] - p0[1]) * (t - p0[0]) / Math.max(1, p1[0] - p0[0]);
    chart.push(+v.toPrecision(6));
  }
  const trades = [];
  for (const e of L) { const i = Math.max(0, Math.min(N - 1, Math.round((e.t - a) / (b - a) * (N - 1)))), s = e.side === 'buy' ? 'b' : 's';
    if (!trades.some(x => x.side === s && Math.abs(x.i - i) <= 3)) trades.push({ i, side: s }); }
  return { chart, trades: trades.slice(-10) };
}
const heldFor = ms => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.floor(m / 1440) + 'd ' + Math.floor(m % 1440 / 60) + 'h'; };
/* quick: only what is already here (the panel's position, cached name / picture / line) -> the window opens at once; the full pass
   fills in what was missing and the window updates by itself */
async function shareData(c, pubs, a, isMint, title, opt = {}) {
  const lp = opt.p && opt.p.mint && opt.p.raw != null ? opt.p : null;
  const p = lp || await posAll(c, a, isMint, pubs);
  const L = (await ledOf(p.mint, pubs)).sort((x, y) => x.t - y.t);
  if (!L.length) throw new Error('no trades on this coin from ' + (pubs.length > 1 ? 'these wallets' : 'this wallet') + ' yet');
  const ch = COIN.get(p.mint), have = ch && !ch.p ? ch : null;
  const [x, usd, info] = await Promise.all([Promise.resolve(SOLX.pnlOf(L, p.value_sol)), SOLX.solUsd().catch(() => null),
    opt.quick ? Promise.resolve(have || { ticker: '', name: '', logo: '', pool: '' }) : coinFull(p.mint).catch(() => ({ ticker: '', name: '', logo: '', pool: '' }))]);
  const open = +p.raw > 0 && x.hold > 0.00001, first = L[0].t, end = open ? Date.now() : L[L.length - 1].t;
  const cur = +p.raw > 0 ? x.hold / (Number(p.raw) / 10 ** (p.dec || 6)) : 0;
  const lk = p.mint + '|' + pubs.join(',') + '|' + L.length + '|' + open, lc = LINE.get(lk);
  let line = lc && Date.now() - lc.t < 90e3 ? lc.line : null; const cached = !!line;   /* the real line from a moment ago (hover) */
  if (!line) {
    if (opt.quick) line = await priceLine('', L, first, end, cur);   /* the fills' own prices for now */
    else { line = await priceLine(info.pool, L, first, end, cur); LINE.set(lk, { line, t: Date.now() }); }
  }
  const full = cached;
  const ticker = info.ticker || (String(title || '').match(/^\s*\$?([A-Za-z0-9]{1,12})\b/) || [])[1] || p.mint.slice(0, 4);
  const U = v => usd ? v * usd : null, net = x.net;
  return { a: p.mint, at: Date.now(), done: !opt.quick || (full && !!have), ticker, name: info.name, chain: 'SOL', logo: info.logo || '', open,
    pnlBnb: +net.toFixed(6), pnlUsd: usd ? +(net * usd).toFixed(2) : null, pnlPct: x.netPct != null ? +x.netPct.toFixed(1) : 0,
    boughtBnb: x.bought, soldBnb: x.sold, holdBnb: x.hold, boughtUsd: U(x.bought), soldUsd: U(x.sold), holdUsd: U(x.hold),
    gasBnb: x.gas, gasUsd: U(x.gas), gross: { boughtUsd: U(x.bought), soldUsd: U(x.sold), holdUsd: U(x.hold), boughtBnb: x.bought, soldBnb: x.sold, holdBnb: x.hold },
    held: heldFor(end - first), chart: line.chart, trades: line.trades, user: { name: '', x: '', avatar: '' }, ref: '', brandX: 'haki', brandSite: 'hakitrade.com' };
}
/* 3.12.15 (owner: "daily PnL I can share, daily / weekly etc."): realized PnL of every trade the extension knows (panel trades and
   the Axiom-button trades it read from the chain), per period. Per coin in time order: a buy adds its SOL to the cost of the tokens held,
   a sell realizes (SOL out - the average cost of the tokens sold); network fees + tips of the period's trades are taken off (net, like the
   coin card). A sell of tokens bought before the ledger knew the coin has no cost to compare with and is left out. */
async function pnlPeriods() {
  const { led = {} } = await chrome.storage.local.get({ led: {} }), d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const P = { today: { from: d0.getTime() }, week: { from: Date.now() - 7 * 86400e3 }, all: { from: 0 } };
  for (const p of Object.values(P)) Object.assign(p, { pnl: 0, gas: 0, basis: 0, buys: 0, sells: 0, coins: new Map() });
  for (const [mint, L0] of Object.entries(led)) {
    const L = (L0 || []).filter(e => e && e.t).sort((x, y) => x.t - y.t); let held = 0, cost = 0;
    for (const e of L) {
      let tk = 0; try { tk = Math.abs(Number(BigInt(e.tok || 0))); } catch (_) { tk = 0; }
      let real = null, bas = 0;
      if (e.side === 'buy') { held += tk; cost += +e.sol || 0; }
      else if (held > 0 && tk > 0) { const f = Math.min(1, tk / held); bas = cost * f; real = (+e.sol || 0) - bas; cost -= bas; held = Math.max(0, held - tk); if (held < 1) { held = 0; cost = 0; } }
      for (const p of Object.values(P)) {
        if (e.t < p.from) continue;
        p.gas += +e.gas || 0; if (e.side === 'buy') p.buys++; else p.sells++;
        if (real == null) continue;
        p.pnl += real; p.basis += bas;
        const c = p.coins.get(mint) || { mint, pnl: 0, basis: 0, t: 0 }; c.pnl += real; c.basis += bas; c.t = Math.max(c.t, e.t); p.coins.set(mint, c);
      }
    }
  }
  for (const p of Object.values(P)) { p.pnl -= p.gas; p.pct = p.basis > 0 ? p.pnl / p.basis * 100 : 0; }
  return P;
}
async function periodCard(k) {
  const P = await pnlPeriods(), p = P[k] || P.today, usd = await SOLX.solUsd().catch(() => null), U = v => usd ? +(v * usd).toFixed(2) : null;
  const C = [...p.coins.values()].sort((x, y) => Math.abs(y.pnl) - Math.abs(x.pnl));
  if (!C.length && !p.buys) throw new Error('no trades ' + (k === 'today' ? 'today' : k === 'week' ? 'in the last 7 days' : 'yet'));
  const top = C.slice(0, 5), info = await Promise.all(top.map(c => Promise.race([coinFull(c.mint).catch(() => null), new Promise(z => setTimeout(z, 2500))])));
  const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const md = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const rows = C.map((c, i) => ({ t: k === 'today' ? hm(c.t) : md(c.t), ticker: (i < 5 && info[i] && info[i].ticker) || c.mint.slice(0, 4), bnb: +c.pnl.toFixed(6), usd: U(c.pnl), pct: c.basis > 0 ? +(c.pnl / c.basis * 100).toFixed(1) : 0 }));
  const now = new Date(), first = C.length ? Math.min(...C.map(c => c.t)) : Date.now();
  const date = k === 'today' ? now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '')
    : md(k === 'week' ? Date.now() - 6 * 86400e3 : first) + ' – ' + md(Date.now()) + ' ' + now.getFullYear();
  const prof = C.filter(c => c.pnl > 0).reduce((s, c) => s + c.pnl, 0), loss = C.filter(c => c.pnl < 0).reduce((s, c) => s + c.pnl, 0);
  return { kind: '1d', a: 'period:' + k, k, ticker: k === 'today' ? 'Today' : k === 'week' ? '7 days' : 'All time', range: k === 'today' ? 'Today' : k === 'week' ? 'Last 7 days' : 'All time',
    badge: k === 'today' ? String(now.getDate()) : k === 'week' ? '7D' : 'ALL', date, chain: 'SOL', at: Date.now(), done: true,
    pnlBnb: +p.pnl.toFixed(6), pnlUsd: U(p.pnl), pnlPct: +p.pct.toFixed(1), profitBnb: prof, profitUsd: U(prof), lossBnb: loss, lossUsd: U(loss),
    buys: p.buys, sells: p.sells, rows, user: { name: '', x: '', avatar: '' }, ref: '', brandX: 'haki', brandSite: 'hakitrade.com' };
}
let SHARE_WIN = null;
/* 3.21.2: the card over the open Axiom / GMGN / Terminal tab (the same window as the panel's Share); false = no such tab */
async function shareOnPage() {
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }); const [t] = await chrome.tabs.query({ active: true, windowId: w.id });
    if (!t) return false;
    const r = await chrome.tabs.sendMessage(t.id, { shareShow: true }, { frameId: 0 }); if (!r || !r.ok) return false;
    await chrome.windows.update(w.id, { focused: true }); return true;
  } catch (_) { return false; }
}
async function openShare(d) {
  await chrome.storage.session.set({ share: d });
  if (SHARE_WIN != null) { try { await chrome.windows.update(SHARE_WIN, { focused: true }); return; } catch (_) { SHARE_WIN = null; } }
  const w = await chrome.windows.create({ url: chrome.runtime.getURL('share/share.html'), type: 'popup', width: 856, height: 852, focused: true });
  SHARE_WIN = w.id;
}
let SET_WIN = null;
chrome.windows.onRemoved.addListener(id => { if (id === SHARE_WIN) SHARE_WIN = null; if (id === SET_WIN) SET_WIN = null; });
/* ---- Auto sell: Safe trade (2x -> initials back), take profit, stop loss, trailing stop. Every coin held in the trading wallets is
   checked every 2 s against its average entry price (this position's buys); each rule fires once per position (a new position after
   selling out starts fresh). Runs while Chrome is open; the sell goes out like a panel click (all trading wallets, the preset's sell
   settings, one automatic retry). ---- */
const AUTO_DEF = { safe: false, tp: { on: false, at: 100, pct: 50, by: 'pct', mc: 30000 }, sl: { on: false, at: 30, pct: 100, by: 'pct', mc: 5000 }, tr: { on: false, at: 25, pct: 100, by: 'pct', mc: 0 } };   /* by: 'pct' from the entry | 'mc' market cap in $ */
async function autoCfg() {
  const { auto } = await chrome.storage.local.get({ auto: null }), a = auto || {}, r = { safe: !!a.safe };
  for (const k of ['tp', 'sl', 'tr']) { const d = AUTO_DEF[k], x = a[k] || {}; r[k] = { on: !!x.on, at: +x.at > 0 ? +x.at : d.at, pct: +x.pct > 0 ? Math.min(100, +x.pct) : d.pct, by: k !== 'tr' && x.by === 'mc' ? 'mc' : 'pct', mc: +x.mc >= 100 ? +x.mc : d.mc }; }
  return r;
}
const AUTO = { busy: false, quiet: new Map() };   /* quiet: mint -> until (no tokens there: do not ask the node every tick) */
async function autoTick() {
  if (AUTO.busy) return; AUTO.busy = true;
  try {
    const A = await autoCfg(); if (!A.safe && !A.tp.on && !A.sl.on && !A.tr.on) return;
    const K = await seedsAll(), pubs = (await selected()).filter(w => K[w.pub]).map(w => w.pub); if (!pubs.length) return;
    const c = await cfg(), { led = {}, afired = {} } = await chrome.storage.local.get({ led: {}, afired: {} }), w1 = await legacyW(), P = new Set(pubs);
    const usd = (A.tp.on && A.tp.by === 'mc') || (A.sl.on && A.sl.by === 'mc') ? await SOLX.solUsd().catch(() => null) : null;
    let ch = false;
    for (const [mint, all] of Object.entries(led)) {
      const L = all.filter(e => P.has(e.w || w1) && e.tok).sort((a, b) => a.t - b.t);
      let net = 0n, start = 0; L.forEach((e, i) => { const prev = net; net += BigInt(e.tok); if (prev <= 0n && net > 0n) start = i; });
      if (net <= 0n) { if (afired[mint]) { delete afired[mint]; ch = true; } continue; }
      if ((AUTO.quiet.get(mint) || 0) > Date.now()) continue;
      const seg = L.slice(start), dec = (seg.find(e => e.dec != null) || {}).dec ?? 6;
      let bS = 0, bT = 0, sS = 0; for (const e of seg) { if (e.side === 'buy') { bS += e.sol; bT += Number(BigInt(e.tok)) / 10 ** dec; } else sS += e.sol; }
      if (!(bS > 0 && bT > 0)) continue;
      const p = await posAll(c, mint, true, pubs).catch(() => null);
      if (!p || !(+p.raw > 0) || !(p.value_sol > 0)) { AUTO.quiet.set(mint, Date.now() + 300e3); continue; }   /* sold elsewhere / not readable */
      const x = (p.value_sol / (Number(BigInt(p.raw)) / 10 ** p.dec)) / (bS / bT);   /* price now / average entry */
      let f = afired[mint]; if (!f || f.open !== seg[0].t) { f = afired[mint] = { open: seg[0].t, peak: x }; ch = true; }
      if (x > (f.peak || 0)) { f.peak = x; ch = true; }
      if (f.err && Date.now() - f.err < 15000) continue;
      const mcNow = usd > 0 && p.mc_sol > 0 ? p.mc_sol * usd : 0;
      const fire = SOLX.autoRule(A, f, x, bS - sS, p.value_sol, mcNow > 0 ? { now: mcNow, entry: mcNow / x } : null);
      if (fire && fire[0] === 'safe-done') { f.safe = Date.now(); ch = true; continue; }   /* the initials are already out */
      if (!fire) continue;
      f[fire[0]] = Date.now(); await chrome.storage.local.set({ afired }); ch = false;
      autoSell(mint, fire, x).catch(() => {});
    }
    if (ch) await chrome.storage.local.set({ afired });
  } catch (_) {} finally { AUTO.busy = false; }
}
async function autoSell(mint, [kind, pct, label], x) {
  const say = o => { for (const p of LIVE.ports) p.say({ auto: Object.assign({ kind, label, mint, x: +x.toFixed(2) }, o) }); };
  pct = Math.max(1, Math.round(pct * 10) / 10);
  const r = await handle({ op: 'trade', arg: { side: 'sell', a: mint, pct, isMint: true, key: 'auto-' + kind + '-' + mint.slice(0, 8) + '-' + Date.now() } }).catch(e => ({ err: String((e && e.message) || e) }));
  if (r.err) {
    const { afired = {} } = await chrome.storage.local.get({ afired: {} }); if (afired[mint]) { afired[mint][kind] = 0; afired[mint].err = Date.now(); await chrome.storage.local.set({ afired }); }
    say({ st: 'failed', why: r.err.slice(0, 160) }); return;
  }
  say({ st: 'sent', pct, ms: r.ms });
  const go = (r.list || [r]).filter(y => y.sig && !y.err);
  const res = await Promise.all(go.map(y => autoWatch(y.sig)));
  const ok = res.filter(y => y.ok).length;
  say({ st: ok ? 'landed' : 'failed', pct, n: ok, of: go.length, why: res.filter(y => !y.ok).map(y => y.why).join('; ').slice(0, 160) });
}
async function autoWatch(sig) {   /* like the panel's watch: follows the automatic retry */
  for (let t0 = Date.now(); Date.now() - t0 < 45000;) {
    await new Promise(r => setTimeout(r, 400));
    const r = await handle({ op: 'tx', arg: { sig } }).catch(() => ({ st: 'pending' }));
    if (r.st === 'retry') { sig = r.sig; t0 = Date.now(); continue; }
    if (r.st === 'failed') return { ok: false, why: r.why || 'failed' };
    if (r.st === 'confirmed' || r.st === 'finalized' || r.st === 'processed') return { ok: true };
  }
  return { ok: false, why: 'not landed in 45 s' };
}
setInterval(autoTick, 2000);
/* 3.14.3 (owner 1122: "where is Safe trade on BSC"): the same Auto sell rules (Safe 2x, take profit, stop loss, trailing) for BSC coins
   held from the panel. The ledger 'bled' (token -> BNB in / out); x = what the holding is worth now / the BNB still in it (in - out).
   Sold through the BSC engine; the sale goes into the ledger from its quote once the receipt is there. */
const BAUTO = { busy: false, quiet: new Map() };
async function bscAutoTick() {
  if (BAUTO.busy) return; BAUTO.busy = true;
  try {
    const A = await autoCfg(); if (!A.safe && !A.tp.on && !A.sl.on && !A.tr.on) return;
    const w = (await bwalletsAll())[0]; if (!w || !(await bseedsAll())[w.addr]) return;
    const { bled = {}, bafired = {} } = await chrome.storage.local.get({ bled: {}, bafired: {} }); let ch = false;
    for (const [tok, L] of Object.entries(bled)) {
      const basis = (+L.in || 0) - (+L.out || 0);
      if ((BAUTO.quiet.get(tok) || 0) > Date.now()) continue;
      const p = await BSC.position(tok, w.addr).catch(() => null);
      if (!p || BigInt(p.raw || '0') <= 0n || !(p.value_bnb > 0)) { if (bafired[tok]) { delete bafired[tok]; ch = true; } BAUTO.quiet.set(tok, Date.now() + 60e3); continue; }
      if (!(basis > 0) && !A.tr.on) continue;
      const x = basis > 0 ? p.value_bnb / basis : (bafired[tok] && bafired[tok].peak) || 1;
      let f = bafired[tok]; if (!f || f.open !== L.nb) { f = bafired[tok] = { open: L.nb, peak: x }; ch = true; }
      if (x > (f.peak || 0)) { f.peak = x; ch = true; }
      if (f.err && Date.now() - f.err < 15000) continue;
      const fire = SOLX.autoRule(A, f, x, Math.max(0, basis), p.value_bnb, null);
      if (fire && fire[0] === 'safe-done') { f.safe = Date.now(); ch = true; continue; }
      if (!fire) continue;
      f[fire[0]] = Date.now(); await chrome.storage.local.set({ bafired }); ch = false;
      bscAutoSell(tok, fire, x).catch(() => {});
    }
    if (ch) await chrome.storage.local.set({ bafired });
  } catch (_) {} finally { BAUTO.busy = false; }
}
async function bscAutoSell(tok, [kind, pct, label], x) {
  const say = o => { for (const p of LIVE.ports) p.say({ auto: Object.assign({ kind, label: label + ' (BSC)', mint: tok, x: +x.toFixed(2) }, o) }); };
  pct = Math.max(1, Math.round(pct * 10) / 10);
  const r = await handle({ op: 'bscTrade', arg: { side: 'sell', token: tok, pct } }).catch(e => ({ err: String((e && e.message) || e) }));
  if (r.err) { const { bafired = {} } = await chrome.storage.local.get({ bafired: {} }); if (bafired[tok]) { bafired[tok][kind] = 0; bafired[tok].err = Date.now(); await chrome.storage.local.set({ bafired }); } say({ st: 'failed', why: r.err.slice(0, 160) }); return; }
  say({ st: 'sent', pct });
  for (let i = 0; i < 60; i++) {
    await new Promise(z => setTimeout(z, 500)); const s = await BSC.receipt(r.hash).catch(() => ({ st: 'pending' }));
    if (s.st === 'confirmed') { const { bled = {} } = await chrome.storage.local.get({ bled: {} }); const L = Object.assign({ in: 0, out: 0, nb: 0, ns: 0 }, bled[tok]); L.out += Number(BigInt(r.out || 0)) / 1e18; L.ns++; bled[tok] = L; await chrome.storage.local.set({ bled }); say({ st: 'landed', pct }); return; }
    if (s.st === 'failed') { say({ st: 'failed', why: 'failed on chain' }); return; }
  }
}
setInterval(bscAutoTick, 3000);
try { chrome.alarms.create('auto', { periodInMinutes: 0.5 }); chrome.alarms.onAlarm.addListener(a => { if (a.name === 'auto') autoTick(); }); } catch (_) {}
/* after a confirmation the chain may need a moment to show the transaction: try again in the background, the panel updates by itself */
function bookSoon(c, pub, sig) {   /* pub: only the fallback; a pending trade knows its wallet */ let n = 0; const go = async () => { const { pend = {} } = await chrome.storage.session.get({ pend: {} }); if (!pend[sig] || n++ > 25) return; await book(c, pub, sig).catch(() => {}); setTimeout(go, 400); }; setTimeout(go, 250); }
const RB = new Map();   /* sig -> signed transaction, sent again every 1.5 s until the chain shows it (25 s max) */

/* 3.12.3 the new wallets of Multi (hidden: not in the wallet list). Their keys are encrypted with a key of their own (a non-extractable
   WebCrypto key in IndexedDB 'hk-lw'; Lock does not wipe it, so the creator fees can still be claimed). Every 30 min the worker claims
   each coin's creator fees once they are worth it (>= 0.002 SOL): the launch wallet pays the fee, everything goes to the wallet chosen
   in Settings (Claimed fees go to), one of your own. Wallets older than 14 days with nothing to claim are dropped. */
function lwDb() { return new Promise((res, rej) => { const r = indexedDB.open('hk-lw', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function lwKey() {
  const db = await lwDb(), get = () => new Promise((res, rej) => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  let k = await get(); if (k) return k;
  k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise((res, rej) => { const tx = db.transaction('k', 'readwrite'); tx.objectStore('k').put(k, 'key'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return k;
}
async function lwLoad() { const { lwBox = null } = await chrome.storage.local.get({ lwBox: null }); if (!lwBox) return [];
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: SOLX.unb64(lwBox.iv) }, await lwKey(), SOLX.unb64(lwBox.ct)))); }
async function lwSave(L) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await lwKey(), new TextEncoder().encode(JSON.stringify(L))));
  await chrome.storage.local.set({ lwBox: { iv: SOLX.b64(iv), ct: SOLX.b64(ct) } }); }
let LWQ = Promise.resolve();   /* one writer at a time */
const lwAdd = (F, meta) => (LWQ = LWQ.then(async () => { const L = await lwLoad(); for (const f of F) L.push({ pub: f.pub, seed: SOLX.b64(f.seed), sym: meta.symbol, t: Date.now() }); await lwSave(L); }));
let LWC = false;
async function lwClaim() {
  if (LWC) return; LWC = true;
  try {
    const c = await cfg(), W = await walletsAll(), K = await seedsAll(), payer = W.find(w => w.pub === c.spamW) || W[0], to = W.find(w => w.pub === c.feeTo && K[w.pub]) || payer;   /* 3.21.5: an unlocked wallet of yours */
    if (!payer || !K[payer.pub]) return;
    const L = await lwLoad(); if (!L.length) return;
    const url = rpcUrl(c), keepL = []; let got = 0;
    for (const x of L) {
      let r = null; try { r = await SOLX.claimFresh(SOLX.unb64(x.seed), x.pub, SOLX.unb64(K[payer.pub]), payer.pub, to.pub, url); } catch (_) {}
      if (r) { got += r.lamports; x.claimed = (x.claimed || 0) + r.lamports; x.last = Date.now(); }
      if (Date.now() - (x.last || x.t) < 14 * 86400000) keepL.push(x);
    }
    await (LWQ = LWQ.then(async () => { const cur = await lwLoad(), have = new Set(L.map(x => x.pub)); await lwSave(keepL.concat(cur.filter(x => !have.has(x.pub)))); }));
    if (got) { const { lwGot = 0 } = await chrome.storage.local.get({ lwGot: 0 }); await chrome.storage.local.set({ lwGot: lwGot + got }); }
  } finally { LWC = false; }
}
try { chrome.alarms.create('lwClaim', { periodInMinutes: 30 }); chrome.alarms.onAlarm.addListener(a => { if (a.name === 'lwClaim') lwClaim(); }); } catch (_) {}

const OGR = new Map();   /* mint -> {t, p}: OG answers */
async function handle(m) {
  const a = m.arg || {}, c = await cfg();
  if (m.op === 'cfg') { const b = await box(), u = await unlocked(), S = await selected(); return { upd: UPD, bscBuys: c.bscBuys, bscBuys2: c.bscBuys2, buys2: c.buys2, sells2: c.sells2, bscSlip: c.bscSlip, bscGwei: c.bscGwei, buys: c.buys, sells: c.sells, quick: c.quick, slip: c.slip, presets: c.presets, preset: c.preset, sellExact: c.sellExact !== false, exactTol: Math.max(0.5, +c.exactTol || 2), exactTolBuy: Math.max(0.5, +c.exactTolBuy || 5), hk: !!c.hk, hkMod: c.hkMod, hkBuy: c.hkBuy, hkSell: c.hkSell, pulse: c.pulse, sound: c.sound !== false, vol: +c.vol, ui: Math.min(1, Math.max(0.6, +c.ui || 1)), pz: Math.min(1.5, Math.max(0.75, +c.pz || 1)), ready: !!(b && u), wallet: b ? b.pub : '', nw: S.length, cTexts: c.cTexts, cAuto: !!c.cAuto, cMin: c.cMin }; }
  if (m.op === 'wallets') {   /* the list with balances (panel menu, settings); 3.15.0 with a = the coin on the page: how much of it each wallet holds */
    const W = await walletsAll(), S = new Set((await selected()).map(w => w.pub)), K = await seedsAll(), url = rpcUrl(c);
    const mint = a && a.a && !/^0x/i.test(a.a) ? await SOLX.mintOf(a.a, url, !!a.isMint).catch(() => null) : null;
    const [bal, tok, sym] = await Promise.all([
      Promise.all(W.map(w => SOLX.balance(w.pub, url).then(v => v / 1e9).catch(() => null))),
      mint ? Promise.all(W.map(w => SOLX.tokBal(w.pub, mint, url).then(t => t.dec != null ? Number(t.raw) / 10 ** t.dec : 0).catch(() => null))) : [],
      mint ? symOf(mint, url) : null]);
    return { keep: await keepOn(), list: W.map((w, i) => ({ pub: w.pub, label: w.label || 'Wallet ' + (i + 1), sel: S.has(w.pub), open: !!K[w.pub], sol: bal[i], tok: mint ? tok[i] : null, sym })) };
  }
  if (m.op === 'consolidate' || m.op === 'split') {   /* 3.15.0 (owner: like Axiom / GMGN): SOL between your own wallets only, as 'move' */
    const W = await walletsAll(), K = await seedsAll(), url = rpcUrl(c), RENT = 890880, FEE = 5100;
    const send1 = (f, t, lam) => SOLX.moveSol(SOLX.unb64(K[f.pub]), f.pub, t.pub, lam, url).then(sig => ({ label: m.op === 'split' ? t.label : f.label, sig, sol: lam / 1e9 }), e => ({ label: m.op === 'split' ? t.label : f.label, err: String((e && e.message) || e).slice(0, 80) }));
    let list;
    if (m.op === 'consolidate') {   /* every other unlocked wallet sends all its SOL to a.to */
      const t = W.find(w => w.pub === a.to && K[w.pub]); if (!t) throw new Error('choose one of your unlocked wallets');   /* 3.21.5 security */
      const src = W.filter(w => w !== t && K[w.pub]), bal = await Promise.all(src.map(w => SOLX.balance(w.pub, url).catch(() => 0))), dst = await SOLX.balance(t.pub, url).catch(() => 0);
      const go = src.map((w, i) => [w, bal[i] - FEE]).filter(x => x[1] > 10000);
      if (!go.length) throw new Error('no other unlocked wallet holds SOL');
      if (dst + go.reduce((s, x) => s + x[1], 0) < RENT) throw new Error('too little SOL to move');
      list = await Promise.all(go.map(([w, lam]) => send1(w, t, lam)));
    } else {   /* a.from shares its SOL evenly with the wallets in a.to (it keeps one share) */
      const f = W.find(w => w.pub === a.from), to = (Array.isArray(a.to) ? a.to : []).map(p => W.find(w => w.pub === p)).filter(w => w && w !== f && K[w.pub]);   /* 3.21.5: unlocked ones only */
      if (!f || !to.length) throw new Error('pick a wallet and tick the wallets to split into');
      if (!K[f.pub]) throw new Error(f.label + ' is locked');
      const have = await SOLX.balance(f.pub, url), share = Math.floor((have - FEE * to.length) / (to.length + 1));
      if (!(share >= RENT)) throw new Error(f.label + ' has ' + (have / 1e9).toFixed(4) + ' SOL: too little to split ' + (to.length + 1) + ' ways');
      list = []; for (const t of to) list.push(await send1(f, t, share));
    }
    return { ok: true, list, sol: list.filter(x => x.sig).reduce((s, x) => s + x.sol, 0) };
  }
  if (m.op === 'selWallets') {
    const W = await walletsAll(), want = (Array.isArray(a.pubs) ? a.pubs : []).filter(p => W.some(w => w.pub === p));
    if (!want.length) throw new Error('keep at least one wallet on');
    await chrome.storage.local.set({ sel: W.map(w => w.pub).filter(p => want.includes(p)) }); for (const p of LIVE.ports) p.resub(); return { ok: true };
  }
  if (m.op === 'autoCfg') return autoCfg();
  if (m.op === 'saveAuto') {   /* the panel's Auto sell section */
    const x = a || {}, n = (v, lo, hi, d) => { v = +String(v).replace(',', '.'); return v >= lo && v <= hi ? v : d; }, out = { safe: !!x.safe };
    for (const k of ['tp', 'sl', 'tr']) { const d = AUTO_DEF[k], y = x[k] || {}; out[k] = { on: !!y.on, at: n(y.at, 1, k === 'tp' ? 10000 : 99, d.at), pct: n(y.pct, 1, 100, d.pct), by: k !== 'tr' && y.by === 'mc' ? 'mc' : 'pct', mc: k === 'tr' ? 0 : n(y.mc, 100, 1e12, d.mc) }; }
    await chrome.storage.local.set({ auto: out }); autoTick(); return out;
  }
  if (m.op === 'savePanel') {
    const out = {}, n = (v, lo, hi) => { v = +String(v).replace(',', '.'); if (!(v >= lo && v <= hi)) throw new Error('out of range'); return Math.round(v * 1e9) / 1e9; };
    if (a.buys) { out.buys = a.buys.slice(0, 4).map(v => n(v, 0.0001, 100)); if (out.buys.length !== 4) throw new Error('4 buy amounts'); }
    if (a.sells) { out.sells = a.sells.slice(0, 4).map(v => n(v, 0.1, 100)); if (out.sells.length !== 4) throw new Error('4 sell amounts'); }
    if (a.buys2) { out.buys2 = a.buys2.slice(0, 4).map(v => n(v, 0.0001, 100)); if (out.buys2.length !== 4) throw new Error('4 buy amounts'); }   /* 3.16.0 second row */
    if (a.sells2) { out.sells2 = a.sells2.slice(0, 4).map(v => n(v, 0.1, 100)); if (out.sells2.length !== 4) throw new Error('4 sell amounts'); }
    if (a.presets) { if (!Array.isArray(a.presets) || a.presets.length !== 3) throw new Error('3 presets');
      out.presets = a.presets.map(p => ({ slip: n(p.slip, 0.1, 100), prio: n(p.prio, 0, 0.01), tip: n(p.tip, 0, SOLX.TIP_MAX), sslip: n(p.sslip, 0.1, 100), sprio: n(p.sprio, 0, 0.01), stip: n(p.stip, 0, SOLX.TIP_MAX) })); }
    await chrome.storage.local.set(out); return { ok: true };
  }
  if (m.op === 'calloutCheck') { const mint = /^0x[0-9a-f]{40}$/i.test(a.a || '') ? a.a : await SOLX.mintOf(a.a, rpcUrl(c), !!a.isMint), v = await pfElig(mint); return { v, left: (PFL.get(mint) || {}).left || 0 }; }
  if (m.op === 'callout') { const mint = /^0x[0-9a-f]{40}$/i.test(a.a || '') ? a.a : await SOLX.mintOf(a.a, rpcUrl(c), !!a.isMint);   /* 3.14.3: pump.fun takes BSC coins by their 0x address (x2 boost) */ return pfCallout(mint, a.text, 45000, !!a.update); }
  if (m.op === 'report') {   /* 3.22.0: Settings -> Report a problem */
    const text = String(a.text || '').trim().slice(0, 2000); if (text.length < 3) throw new Error('write what happened');
    const W = await walletsAll(), BW = await bwalletsAll(), p = (c.presets || [])[c.preset || 0] || {};
    const ctx = { ver: VERS, os: osOf(), lang: (navigator.language || '').slice(0, 8), site: LHOST, wallets: W.length, bsc: BW.length > 0, preset: (c.preset || 0) + 1,
      slip: p.slip, prio: p.prio, tip: p.tip, smartFees: c.autoFee, hotkeys: c.hk ? c.hkMod : 'off', ownRpc: !!c.rpc, jupKey: !!c.jupKey, pz: c.pz,
      recentErrors: ERRS.slice(-10).map(e => ({ ago: Math.round((Date.now() - e.t) / 1000) + 's', kind: e.kind, msg: e.msg })) };
    const r = await apiPost('/v1/report', { id: await iid(), ver: VERS, host: 'popup', chain: BW.length && !W.length ? 'bsc' : 'sol', text, ctx });
    if (!r) throw new Error('could not reach the HAKI server: check the internet and try again');
    if (!r.ok) throw new Error(r.why || 'not sent'); return { ok: true, n: r.n };
  }
  if (m.op === 'openSettings') {   /* a small window of its own next to the page (not a tab; it stays open while you copy a key from your wallet) */
    if (a.report) await chrome.storage.session.set({ repText: String(a.report).slice(0, 300) });   /* 3.22.0: the toast's Report opens the report page with the error */
    if (SET_WIN != null) { try { await chrome.windows.update(SET_WIN, { focused: true }); if (a.report) chrome.runtime.sendMessage({ hkRep: 1 }).catch(() => {}); return { ok: true }; } catch (_) { SET_WIN = null; } }
    let W = 880, H = 680, left, top;   /* 3.21.0: the settings window (sections on the left) */
    try { const cur = await chrome.windows.getLastFocused(); W = Math.min(W, Math.max(400, cur.width - 48)); H = Math.min(H, Math.max(480, cur.height - 96)); left = Math.max(0, cur.left + cur.width - W - 24); top = Math.max(0, cur.top + 72); } catch (_) {}
    const w = await chrome.windows.create({ url: chrome.runtime.getURL('popup.html?win=' + (a.add ? 'add' : a.report ? 'rep' : '1')), type: 'popup', width: W, height: H, left, top, focused: true });
    SET_WIN = w.id; return { ok: true };
  }
  if (m.op === 'import') {   /* popup only (see the sender check). A second wallet needs the same password as the first. */
    if (!a.pass || String(a.pass).length < 8) throw new Error('password: at least 8 characters');
    const W = await walletsAll();
    if (W.length) { try { await SOLX.unseal(W[0].box, a.pass); } catch (_) { throw new Error('type the password you use for your other wallets'); } }
    else { const BW = await bwalletsAll(); if (BW.length) { try { await SOLX.unseal(BW[0].box, a.pass); } catch (_) { throw new Error('type the password of your BSC wallet'); } } }   /* 3.21.5 */
    if (W.length >= 20) throw new Error('20 wallets at most');
    const { seed, pub } = await SOLX.readSecret(a.secret, a.expect || '');
    if (W.some(w => w.pub === pub)) throw new Error('this wallet is already added');
    const label = String(a.label || '').trim().slice(0, 24) || 'Wallet ' + (W.length + 1);
    W.push({ pub, label, box: await SOLX.seal(seed, pub, a.pass) });
    const set = { wallets: W }; if (W.length === 1) { set.sel = [pub]; set.box = W[0].box; }
    await chrome.storage.local.set(set);
    const K = await seedsAll(); K[pub] = SOLX.b64(seed); await chrome.storage.session.set({ seeds: K });
    if (a.keep || (W.length > 1 && await keepOn())) await keepSave(K);
    return { ok: true, wallet: pub, label };
  }
  if (m.op === 'unlock') {   /* one password opens every wallet */
    const W = await walletsAll(), BW = await bwalletsAll(); if (!W.length && !BW.length) throw new Error('no wallet yet');
    const K = {}; for (const w of W) { try { K[w.pub] = SOLX.b64(await SOLX.unseal(w.box, a.pass)); } catch (_) { if (w === W[0]) throw new Error('wrong password'); } }
    const BK = {}; for (const w of BW) { try { BK[w.addr] = SOLX.b64(await SOLX.unseal(w.box, a.pass)); } catch (_) { if (!W.length && w === BW[0]) throw new Error('wrong password'); } }   /* 3.14.0 BSC */
    await chrome.storage.session.set({ seeds: K, bseeds: BK }); await chrome.storage.session.remove('seed');
    if (a.keep) { await keepSave(K); await bkeepSave(BK); } else { await keepClear(); await chrome.storage.local.remove('bkeep'); }
    return { ok: true, wallet: W[0].pub, n: Object.keys(K).length, keep: !!a.keep };
  }
  if (m.op === 'lock') { LOCKGEN++; await keepClear(); await chrome.storage.local.remove('bkeep'); await chrome.storage.session.remove(['seed', 'seeds', 'bseeds']); return { ok: true }; }
  /* ---- BSC (3.14.0) ---- */
  if (m.op === 'bscImport') {   /* popup only: one BSC wallet, sealed with the password of the Solana wallets (or a new one when there are none) */
    const hex = String(a.secret || '').trim().replace(/^0x/i, ''); if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('a BSC private key is 64 hex characters (0x...)');
    if (!a.pass || String(a.pass).length < 8) throw new Error('password: at least 8 characters');
    const W = await walletsAll(), BW = await bwalletsAll();
    if (W.length) { try { await SOLX.unseal(W[0].box, a.pass); } catch (_) { throw new Error('type the password you use for your other wallets'); } }
    else if (BW.length) { try { await SOLX.unseal(BW[0].box, a.pass); } catch (_) { throw new Error('type the password of your BSC wallet'); } }
    const key = EVM.hexToBytes(hex), addr = EVM.addressOf(key);
    if (BW.length && BW[0].addr.toLowerCase() !== addr.toLowerCase()) throw new Error('remove your BSC wallet first (one BSC wallet for now)');   /* 3.21.5: never replaced silently */
    const label = String(a.label || '').trim().slice(0, 24) || 'BSC wallet';
    await chrome.storage.local.set({ bwallets: [{ addr, label, box: await SOLX.seal(key, addr, a.pass) }] });
    const BK = { [addr]: SOLX.b64(key) }; await chrome.storage.session.set({ bseeds: BK }); if (await keepOn()) await bkeepSave(BK);
    return { ok: true, addr };
  }
  if (m.op === 'bscForget') { await chrome.storage.local.set({ bwallets: [] }); await chrome.storage.local.remove('bkeep'); await chrome.storage.session.remove('bseeds'); return { ok: true }; }
  if (m.op === 'bscWallet') {   /* address, label, unlocked, BNB */
    const w = (await bwalletsAll())[0]; if (!w) return { none: true };
    const K = await bseedsAll(), bnb = await BSC.bnb(w.addr).then(v => Number(v) / 1e18).catch(() => null);
    return { addr: w.addr, label: w.label, open: !!K[w.addr], bnb };
  }
  if (m.op === 'bscPos') {   /* the coin on the page: venue, tokens held, value, market cap, BNB */
    const w = (await bwalletsAll())[0], me = w ? w.addr : '0x0000000000000000000000000000000000000001';
    const [p, bnb] = await Promise.all([BSC.position(a.token, me), w ? BSC.bnb(me).then(v => Number(v) / 1e18).catch(() => null) : null]);
    return Object.assign(p, { bnb, wallet: !!w });
  }
  if (m.op === 'bscTrade') {   /* {side, token, bnb | pct} with the BSC settings (slippage, gas) */
    const { addr, key } = await bscKey();
    const maxB = Math.min(100, Math.max(0.001, +c.maxBnb || 2));   /* 3.21.5 security: a cap per BNB buy, as Max per trade on Solana */
    if (a.side === 'buy' && !(+a.bnb > 0 && +a.bnb <= maxB)) throw new Error('above your BNB cap per trade (' + maxB + ' BNB, Settings → Buy and sell)');
    const r = await BSC.trade({ side: a.side, token: a.token, bnb: a.bnb, pct: a.pct, slip: +c.bscSlip || 15, gwei: +c.bscGwei || 0, live: a.live !== false }, key, addr);
    return r;
  }
  if (m.op === 'bscStatus') return BSC.receipt(a.hash);
  if (m.op === 'bscBought') {   /* 3.14.3: auto callout after a BSC buy (your texts, once per coin per 6 h) */
    if (!c.cAuto || CALLING.has(a.token)) return { ok: true };
    const { pfCalled = {} } = await chrome.storage.local.get({ pfCalled: {} }); if (pfCalled[a.token] && Date.now() - pfCalled[a.token] < 6 * 3600000) return { ok: true };
    const L = c.cTexts, text = L.length ? L[Math.floor(Math.random() * L.length)] : ''; CALLING.add(a.token);
    pfCallout(a.token, text, 45000).then(() => { for (const p of LIVE.ports) p.say({ callout: { ok: true, text: 'posted: ' + text } }); }, e => { for (const p of LIVE.ports) p.say({ callout: { ok: false, text: String(e.message || e) } }); }).finally(() => CALLING.delete(a.token));
    return { ok: true };
  }
  if (m.op === 'forget') {   /* one wallet (a.pub) or all of them */
    const W = await walletsAll(), K = await seedsAll(), left = a.pub ? W.filter(w => w.pub !== a.pub) : [];
    for (const w of W) if (!left.includes(w)) delete K[w.pub];
    const { sel = [] } = await chrome.storage.local.get({ sel: [] });
    await chrome.storage.local.set({ wallets: left, sel: (sel || []).filter(p => left.some(w => w.pub === p)) });
    if (!left.length || (W[0] && !left.includes(W[0]))) await chrome.storage.local.remove('box');
    await chrome.storage.session.set({ seeds: K }); await chrome.storage.session.remove('seed');
    if (await keepOn()) { if (left.length) await keepSave(K); else await keepClear(); }
    return { ok: true };
  }
  /* ---- wallet housekeeping (settings window only) ---- */
  if (m.op === 'reclaimScan') {   /* empty token accounts of every unlocked wallet and the SOL they hold */
    const W = await walletsAll(), K = await seedsAll(), url = rpcUrl(c);
    const per = await Promise.all(W.filter(w => K[w.pub]).map(async w => { const L = await SOLX.emptyAccounts(w.pub, url).catch(() => null); return { pub: w.pub, label: w.label, n: L ? L.length : null, sol: L ? L.reduce((s, x) => s + x.lamports, 0) / 1e9 : 0 }; }));
    return { list: per, n: per.reduce((s, x) => s + (x.n || 0), 0), sol: per.reduce((s, x) => s + x.sol, 0) };
  }
  if (m.op === 'reclaim') {   /* close them: the rent goes back to each wallet */
    const W = await walletsAll(), K = await seedsAll(), url = rpcUrl(c), out = { closed: 0, sol: 0, errs: [] };
    for (const w of W.filter(x => K[x.pub])) {
      const L = await SOLX.emptyAccounts(w.pub, url).catch(() => []); if (!L.length) continue;
      const r = await SOLX.closeEmpty(L, SOLX.unb64(K[w.pub]), w.pub, url);
      out.closed += r.closed; out.sol += r.lamports / 1e9; out.errs.push(...r.errs.map(e => w.label + ': ' + e));
    }
    return out;
  }
  if (m.op === 'cashbackScan') {   /* 3.17.0 trader cashback waiting for each wallet (pump.fun cashback coins, curve + PumpSwap) */
    const W = await walletsAll(), K = await seedsAll();
    const list = await Promise.all(W.map(w => SOLX.cashbackOf(w.pub, rpcUrl(c)).then(x => ({ label: w.label, pub: w.pub, sol: (x.curve + x.pool) / 1e9, locked: !K[w.pub] }), () => ({ label: w.label, pub: w.pub, sol: 0, locked: !K[w.pub] }))));
    return { list, sol: list.reduce((s, x) => s + x.sol, 0) };
  }
  if (m.op === 'cashbackClaim') {
    const W = await walletsAll(), K = await seedsAll(); let n = 0, sol = 0; const errs = [];
    for (const w of W) { if (!K[w.pub]) continue; try { const r = await SOLX.claimCashback(SOLX.unb64(K[w.pub]), w.pub, rpcUrl(c)); if (r.sol > 0) { n++; sol += r.sol; } } catch (e) { errs.push(w.label + ': ' + String(e.message || e).slice(0, 80)); } }
    return { n, sol, errs };
  }
  if (m.op === 'creatorScan') {   /* 3.10.0 pump.fun creator fees waiting for each wallet (curve vault SOL + PumpSwap vault WSOL) */
    const W = await walletsAll(), K = await seedsAll(), url = rpcUrl(c);
    const list = await Promise.all(W.map(async w => { const f = await SOLX.creatorFees(w.pub, url).catch(() => null); return { pub: w.pub, label: w.label, locked: !K[w.pub], sol: f ? (f.curve + f.pool) / 1e9 : 0, err: !f }; }));
    return { list, sol: list.reduce((s, x) => s + x.sol, 0) };
  }
  if (m.op === 'creatorClaim') {   /* claim them into each unlocked wallet (the fees always go to the creator wallet itself) */
    const W = await walletsAll(), K = await seedsAll(), url = rpcUrl(c), out = { sol: 0, n: 0, errs: [] };
    for (const w of W) {
      const f = await SOLX.creatorFees(w.pub, url).catch(() => null); if (!f || f.curve + f.pool < 10000) continue;
      if (!K[w.pub]) { out.errs.push(w.label + ' is locked'); continue; }
      try { const r = await SOLX.claimCreator(SOLX.unb64(K[w.pub]), w.pub, url); out.sol += r.lamports / 1e9; out.n++; } catch (e) { out.errs.push(w.label + ': ' + String((e && e.message) || e).slice(0, 120)); }
    }
    return out;
  }
  if (m.op === 'tr') {   /* 3.10.3 a tweet in Russian: Google Translate's free endpoint (the same as its web widget), cached */
    const t = String(a.text || '').slice(0, 4000); if (!t.trim()) return { text: '' };
    const h = TRS.get(t); if (h) return { text: h };
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'q=' + encodeURIComponent(trPrep(t)) });
    if (!r.ok) throw new Error('translate HTTP ' + r.status);
    const j = await r.json(), out = ((j && j[0]) || []).map(x => x && x[0] || '').join('');
    TRS.set(t, out); if (TRS.size > 300) TRS.delete(TRS.keys().next().value);
    return { text: out, from: j && j[2] };
  }
  if (m.op === 'trAi') {   /* 3.12.0 (owner: Google gets crypto slang wrong): Claude with the owner's own API key (Settings), short memecoin-slang prompt */
    const key = String(c.aiKey || '').trim(), t = String(a.text || '').slice(0, 4000); if (!key || !t.trim()) return { text: '' };
    const model = c.aiModel === 'claude-haiku-5-5' ? 'claude-haiku-5-5' : 'claude-opus-5-5', ck = model + '|' + t, h = TRA.get(ck); if (h) return { text: h };
    { /* 3.21.5 security: at most 12 AI translations a minute and 400 a day (a page could otherwise spend your API key without limit) */
      const now = Date.now(), day = new Date().toDateString(), { aiUse = {} } = await chrome.storage.session.get({ aiUse: {} });
      const u = aiUse.d === day ? aiUse : { d: day, n: 0, m: [] }; u.m = (u.m || []).filter(x => now - x < 60000);
      if (u.m.length >= 12 || u.n >= 400) return { text: '' };
      u.m.push(now); u.n++; await chrome.storage.session.set({ aiUse: u }); }
    const body = { model, max_tokens: 2000, output_config: { effort: 'low' }, system: AI_SYS, messages: [{ role: 'user', content: t }] };
    const hd = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' };
    if (model === 'claude-opus-5-5') { body.fallbacks = 'default'; hd['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }   /* a declined request is re-run on a fallback model */
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: hd, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('AI translation: ' + ((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 120));
    if (j.stop_reason === 'refusal') return { text: '' };
    const out = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (out) { TRA.set(ck, out); if (TRA.size > 300) TRA.delete(TRA.keys().next().value); }
    return { text: out, ai: true };
  }
  if (m.op === 'og') {   /* 3.9.4 OG button: the first coin made with this name. 3.12.9: one lookup per coin for 3 min, started as the page
     opens (the button's own ask then gets the same answer); a failed lookup is not kept */
    const mint = await SOLX.mintOf(a.a, rpcUrl(c), !!a.isMint); let h = OGR.get(mint);
    if (!h || Date.now() - h.t > 180000 || a.fresh) {   /* 3.12.11: a quick answer (~1 s, same picture file) and the full one (similar pictures, ~1 s more) */
      const q = SOLX.ogFind(mint, rpcUrl(c), true), f = q.then(() => SOLX.ogFind(mint, rpcUrl(c), false));
      h = { t: Date.now(), q, f, done: null }; f.then(r => { h.done = r; }, () => OGR.delete(mint)); q.catch(() => OGR.delete(mint));
      OGR.set(mint, h); if (OGR.size > 200) OGR.delete(OGR.keys().next().value);
    }
    if (h.done) return h.done;
    if (a.full) return h.f;
    return h.q.then(r => Object.assign({}, r, { refining: true }));
  }
  if (m.op === 'lwInfo') { const L = await lwLoad().catch(() => []), { lwGot = 0 } = await chrome.storage.local.get({ lwGot: 0 }); return { n: L.length, got: lwGot / 1e9 }; }
  if (m.op === 'lwClaimNow') { await lwClaim(); const { lwGot = 0 } = await chrome.storage.local.get({ lwGot: 0 }); return { ok: true, got: lwGot / 1e9 }; }
  if (m.op === 'launch') {   /* 3.9.0 Multi launch: n new pump.fun coins with the metadata of the coin on the page, from the launch wallet */
    const c = await cfg(), W = await walletsAll(), K = await seedsAll(), w = W.find(x => x.pub === c.spamW);
    if (!w) throw new Error('choose a launch wallet in Settings > Wallets first');
    if (!K[w.pub]) throw new Error((w.label || 'the launch wallet') + ' is locked: unlock it in Settings');
    const url = rpcUrl(c), mint = await SOLX.mintOf(a.a, url, !!a.isMint), n = Math.max(1, Math.min(10, Math.floor(+c.spamN) || 5)), o = feeOf(c, 'buy');
    const fresh = c.spamFresh !== false;   /* 3.12.3: a new wallet for every coin (funded, used once, emptied back, forgotten) */
    const per = fresh ? (await SOLX.freshNeed(true)) / 1e9 + 0.00002 : 0.0072 + (+o.tip || 0) + (+o.prio || 0), have = await SOLX.balance(w.pub, url);   /* rent of the new accounts: ~0.0058 SOL, ~0.0072 paired with a coin (measured 1118) */
    if (have / 1e9 < n * per + 0.001) throw new Error((w.label || 'the launch wallet') + ' has ' + (have / 1e9).toFixed(4) + ' SOL, ' + n + ' coins need about ' + (n * per).toFixed(4));
    const r = fresh ? await SOLX.launchFresh(mint, n, SOLX.unb64(K[w.pub]), w.pub, url, o, (F, meta) => lwAdd(F, meta)) : await SOLX.launchMany(mint, n, SOLX.unb64(K[w.pub]), w.pub, url, o);
    return Object.assign(r, { wallet: w.label, cost: +(n * (fresh ? 0.0063 : per)).toFixed(4) });   /* fresh: ~0.0063 SOL a coin stays (rent + fees), the rest comes back */
  }
  if (m.op === 'move') {   /* SOL from one of your wallets to another of yours (never anywhere else) */
    const W = await walletsAll(), K = await seedsAll(), f = W.find(w => w.pub === a.from), t = W.find(w => w.pub === a.to);
    if (!f || !t || f === t) throw new Error('choose two different wallets of yours');
    if (!K[f.pub]) throw new Error(f.label + ' is locked');
    const RENT = 890880, FEE = 5100, have = await SOLX.balance(f.pub, rpcUrl(c)), dst = await SOLX.balance(t.pub, rpcUrl(c));
    let lam = a.max ? have - FEE : Math.round(+String(a.sol).replace(',', '.') * 1e9);
    if (!(lam > 0)) throw new Error('nothing to send: ' + f.label + ' has ' + (have / 1e9).toFixed(4) + ' SOL');
    if (lam > have - FEE) throw new Error(f.label + ' has ' + (have / 1e9).toFixed(4) + ' SOL (fee ' + (FEE / 1e9) + ')');
    const rest = have - FEE - lam; if (rest > 0 && rest < RENT) { if (a.max) lam = have - FEE; else throw new Error('leave 0 or at least 0.0009 SOL on ' + f.label); }
    if (dst + lam < RENT) throw new Error('an empty wallet needs at least 0.0009 SOL');
    const sig = await SOLX.moveSol(SOLX.unb64(K[f.pub]), f.pub, t.pub, lam, rpcUrl(c));
    return { ok: true, sig, sol: lam / 1e9, from: f.label, to: t.label };
  }
  if (m.op === 'savings') {   /* Axiom takes 1 % of each trade made with its buttons; trades through this panel do not pay it */
    const { led = {} } = await chrome.storage.local.get({ led: {} }), d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const day = d0.getTime(), wk = Date.now() - 7 * 86400e3; let today = 0, week = 0, all = 0, n = 0;
    let vT = 0, vW = 0, vA = 0;   /* 3.12.10: the volume itself (owner: 'to see how much volume I make') */
    for (const L of Object.values(led)) for (const e of L) { if (e.ext || !(e.sol > 0)) continue; const f = e.sol * 0.01; all += f; vA += e.sol; n++; if (e.t >= wk) { week += f; vW += e.sol; } if (e.t >= day) { today += f; vT += e.sol; } }
    return { today, week, all, n, vol: { today: vT, week: vW, all: vA }, usd: await SOLX.solUsd().catch(() => null) };
  }
  if (m.op === 'pnlP') { const r = await pnlPeriods(); return { today: r.today.pnl, week: r.week.pnl, all: r.all.pnl, n: r.all.sells, usd: await SOLX.solUsd().catch(() => null) }; }
  if (m.op === 'sharePeriod') { const d = await periodCard(a.k); await chrome.storage.session.set({ share: d }); if (!(await shareOnPage())) await openShare(d); return { ok: true }; }
  if (m.op === 'rename') { const W = await walletsAll(), w = W.find(x => x.pub === a.pub); if (!w) throw new Error('no such wallet'); w.label = String(a.label || '').trim().slice(0, 24) || w.label; await chrome.storage.local.set({ wallets: W }); return { ok: true }; }
  const b = await box();
  if (!b) throw new Error('Open HAKI Strike (toolbar icon) and add your wallet');
  const SW = await selected(), pubs = SW.map(w => w.pub);
  if (m.op === 'state') {   /* the trading wallets: SOL added up; locked when any of them is */
    const K = await seedsAll(), lams = await Promise.all(pubs.map(p => SOLX.balance(p, rpcUrl(c))));
    lams.forEach((v, i) => { BALS.set(pubs[i], { v, t: Date.now() }); }); BAL.v = lams[0]; BAL.t = Date.now();
    return { ok: true, wallet: b.pub, n: pubs.length, locked: pubs.some(p => !K[p]), sol: lams.reduce((s, v) => s + v, 0) / 1e9, tip: c.tip, send: true };
  }
  if (m.op === 'prep') {   /* the mouse is on a buy button: route + transaction built now (for each trading wallet), the click only signs and sends */
    const K = await seedsAll();
    await Promise.all(pubs.filter(p => K[p]).map(pub => {
      const x = BALS.get(pub); if (!x || Date.now() - x.t > 30000) SOLX.balance(pub, rpcUrl(c)).then(v => BALS.set(pub, { v, t: Date.now() })).catch(() => {});
      return SOLX.prep(Object.assign({ a: a.a, side: a.side, sol: a.sol, pct: a.pct, isMint: !!a.isMint }, feeT(c, a.side)), pub, rpcUrl(c)).catch(() => null);
    })); return { ok: true };
  }
  if (m.op === 'sharePrep') {   /* the mouse is on the share icon: name, picture and price line fetched now, the click shows them at once */
    shareData(c, pubs, a.a, !!a.isMint, a.title, { p: a.p }).catch(() => {}); return { ok: true };
  }
  if (m.op === 'share') {   /* the card window opens on the page right away (quick data), then fills in */
    const d = await shareData(c, pubs, a.a, !!a.isMint, a.title, { p: a.p, quick: true });
    await chrome.storage.session.set({ share: d });
    if (!d.done) shareData(c, pubs, a.a, !!a.isMint, a.title, { p: a.p }).then(d2 => chrome.storage.session.set({ share: d2 })).catch(() => {});
    return { ok: true };
  }
  if (m.op === 'shareWin') { const { share } = await chrome.storage.session.get({ share: null }); if (share) await openShare(share); return { ok: true }; }
  if (m.op === 'applyUpdate') { UPD_GO = true; buildCheck(); return { ok: true }; }
  if (m.op === 'pos') {
    await book(c, b.pub).catch(() => {});
    const [p, usd] = await Promise.all([posAll(c, a.a, !!a.isMint, pubs), SOLX.solUsd()]);
    const L = await ledOf(p.mint, pubs);
    return Object.assign(p, { usd, pnl: L.length ? SOLX.pnlOf(L, p.value_sol) : null });
  }
  if (m.op === 'tx') {
    const hit = SIGS.get(a.sig); let r;
    if (hit && hit.err && hit.err.send) { RB.delete(a.sig); return { st: 'failed', why: 'no node took it: ' + hit.err.send.replace(/^no node took it: /, '') }; }
    if (hit) r = hit.err ? { st: 'failed', err: hit.err } : { st: 'processed' };
    else { if (Date.now() - (SIGQ.get(a.sig) || 0) < 450) return { st: 'pending' }; SIGQ.set(a.sig, Date.now()); r = await SOLX.txStatus(a.sig, rpcUrl(c)); }   /* the panel asks often; the node at most every 0.45 s */
    const x = RB.get(a.sig);
    if (r.st === 'pending') { if (x && Date.now() - x.t < 25000 && Date.now() - x.last > (Date.now() - x.t < 3000 ? 400 : 1500)) { x.last = Date.now(); SOLX.sendFast(x.tx64, rpcUrl(c), x.sender).catch(() => {}); } return r; }
    if (r.st === 'failed') {
      r.why = SOLX.whyFailed(r.err); teleErr('tx_fail', r.why);
      /* one automatic second try: price moved past the slippage -> again with 1.5x the slippage (max 50 %); the curve migrated on the
         way -> again through its pool. Only after the chain says the first one FAILED, so it can never fill twice. */
      if (x && x.o && !x.retried) {
        x.retried = true;
        const kind0 = await SOLX.failKind(a.sig, rpcUrl(c)).catch(() => null), kind = x.o.exact && kind0 === 'slip' ? null : kind0, slip = kind === 'slip' ? Math.max(x.o.slip, Math.min(50, Math.round(x.o.slip * 1.5))) : x.o.slip;   /* 3.21.5: at most 50 % */
        if (kind && !(kind === 'slip' && x.o.slip >= 100)) {
          if (kind === 'budget') x.o = Object.assign({}, x.o, { safe: true });
          const u = await unlockedOf(x.w || b.pub);
          if (u) {
            try {
              if (kind === 'moved') SOLX.ST.delete(x.mint + '|' + u.pub);
              const o2 = Object.assign({}, x.o, { slip }), r2 = await SOLX.trade(o2, u.seed, u.pub, rpcUrl(c));
              if (r2.sending) { const sp = r2.sending, sg = r2.sig; delete r2.sending; sp.then(() => {}, e => { SIGS.set(sg, { err: { send: String((e && e.message) || e).slice(0, 140) } }); RB.delete(sg); }); }
              if (r2.tx64) { RB.set(r2.sig, { tx64: r2.tx64, t: Date.now(), last: Date.now(), sender: r2.tip >= 0.000005 ? Math.round(r2.tip * 1e9) : 0, o: o2, mint: r2.mint, retried: true, w: u.pub }); delete r2.tx64; }
              sigWatch(c, r2.sig).catch(() => {}); await pend(r2.sig, r2.mint, r2.side, Math.round(r2.tip * 1e9), u.pub);
              RB.delete(a.sig); await book(c, b.pub, a.sig).catch(() => {});
              return { st: 'retry', sig: r2.sig, why: kind === 'slip' ? 'price moved past your ' + x.o.slip + '% slippage' : kind === 'budget' ? 'it needed more compute' : 'the coin migrated on the way', slip, ms: r2.ms };
            } catch (e) { r.why += '; second try not sent: ' + String(e.message || e).slice(0, 120); }
          }
        } else if (kind0 === 'slip' && x.o.exact) r.why = 'the price moved more than ' + x.o.slip + '% before it landed: not ' + (x.o.side === 'buy' ? 'bought' : 'sold') + ' (Exact is on, click again at the new price)';
        else if (kind === 'slip') r.why = 'price moved past your ' + x.o.slip + '% slippage (already 100 %)';
      }
    }
    RB.delete(a.sig);
    if (r.st !== 'failed') for (const p of LIVE.ports) p.fresh();   /* landed: the panel shows the new balance now, not at the next tick */
    if (!(await book(c, b.pub, a.sig).catch(() => false))) bookSoon(c, b.pub, a.sig);
    return r;
  }
  if (m.op === 'fill') {   /* what a landed trade really got: SOL and tokens from the chain (the PnL ledger) */
    await book(c, b.pub, a.sig).catch(() => {});
    const { led = {} } = await chrome.storage.local.get({ led: {} });
    for (const L of Object.values(led)) { const e = L.find(y => y.sig === a.sig); if (e) return { ok: true, sol: e.sol, tok: e.tok }; }
    return { ok: false };
  }
  if (m.op === 'resetPnl') { const { led = {} } = await chrome.storage.local.get({ led: {} }); delete led[a.mint]; await chrome.storage.local.set({ led }); return { ok: true }; }
  if (m.op === 'trade') {   /* every trading wallet at once: each buys the amount / sells its own %; one wallet failing does not stop the others */
    const K = await seedsAll(), ready = SW.filter(w => K[w.pub]);
    if (!ready.length) throw new Error('Locked: click the HAKI icon in Chrome’s toolbar, type your password once and keep “Stay unlocked” on');
    const ck = String(a.key || ''); if (ck.length < 8) throw new Error('missing click key');
    for (const [k, v] of done) if (Date.now() - v.t > 120000) done.delete(k);
    if (done.has(ck)) return Object.assign({ dup: true }, done.get(ck).r);   /* one click = one trade */
    /* buys stack: two clicks = two buys (owner 1116). A sell waits for the one in flight: its % is of what you hold */
    const lk = a.side === 'sell' ? (a.a || '') + '|sell' : 'buy|' + ck; if (busy.has(lk)) throw new Error('a sell of this token is already in flight');
    busy.add(lk);
    try {
      const fz = feeT(c, a.side, /^auto-/.test(ck)), t0 = Date.now(); if (fz.exact && +a.mc > 0) fz.mcClick = +a.mc;   /* the coin's MC (in SOL) the panel showed at the click */   /* auto sell (take profit / stop): the preset slippage, it must fill */
      const one = async w => {
        const u = { seed: SOLX.unb64(K[w.pub]), pub: w.pub }, hb = BALS.get(w.pub), have = hb && Date.now() - hb.t < 60000 ? hb.v : null;
        try {
          const r = await SOLX.trade(Object.assign({ side: a.side, a: a.a, sol: a.sol, pct: a.pct, maxSol: c.maxSol, isMint: !!a.isMint, have }, fz), u.seed, u.pub, rpcUrl(c));
          /* 3.11.11 (owner: "118 ms, precious milliseconds"): the trade is on the wire when SOLX.trade returns; the nodes' answers (~100 ms
             round trip) come later. Every lane refusing it = the trade failed, the panel hears it from the watch at once */
          if (r.sending) { const sp = r.sending, sg = r.sig; delete r.sending; sp.then(() => {}, e => { SIGS.set(sg, { err: { send: String((e && e.message) || e).slice(0, 140) } }); RB.delete(sg); }); }
          if (r.tx64) { if (r.sent) RB.set(r.sig, { tx64: r.tx64, t: Date.now(), last: Date.now(), sender: r.tip >= 0.000005 ? Math.round(r.tip * 1e9) : 0, mint: r.mint, w: u.pub,
            o: Object.assign({ side: a.side, a: a.a, sol: a.sol, pct: a.pct, isMint: !!a.isMint, maxSol: c.maxSol }, fz) }); delete r.tx64; }
          if (r.side === 'buy' && hb) hb.v -= Math.round((+a.sol + r.tip) * 1e9);   /* until the next read */
          if (r.sent) { sigWatch(c, r.sig).catch(() => {}); pend(r.sig, r.mint, r.side, Math.round(r.tip * 1e9), u.pub).catch(() => {}); }   /* the ledger note is not on the click's path */
          if (r.sent && r.sig1) await pend(r.sig1, r.mint, r.side, Math.round((r.tip1 || 0) * 1e9), u.pub);   /* 3.8.6 two steps: both count for PnL (SOL in one, tokens in the other) */
          return Object.assign(r, { w: w.pub, label: w.label });
        } catch (e) { return { w: w.pub, label: w.label, err: String((e && e.message) || e).slice(0, 160) }; }
      };
      const list = await Promise.all(ready.map(one)), ok = list.filter(x => !x.err);
      if (!ok.length && ready.length === 1 && SW.length === 1) throw new Error(list[0].err);   /* one wallet: as before */
      if (!ok.length) throw new Error(list.map(x => x.label + ': ' + x.err).join(' · '));
      const r = Object.assign({}, ok[0], { list, ms: Date.now() - t0, locked: SW.length - ready.length });
      done.set(ck, { t: Date.now(), r }); return r;
    }
    finally { busy.delete(lk); }
  }
  throw new Error('unknown op');
}

/* live position: one WebSocket to the node, subscribed to the coin's pump.fun curve and to your token account; every change (each block,
   ~0.4 s) is pushed to the panel through its port. Coins off the curve (migrated) are re-read every 3 s instead. */
const LIVE = { ws: null, ready: null, id: 0, subs: new Map(), wait: new Map(), ports: new Set(), sigs: new Map() };
const SIGS = new Map(), SIGQ = new Map();   /* sig -> {err} as soon as the node saw it land; sig -> last time we asked the node ourselves */
async function sigWatch(c, sig) {
  if (SIGS.size > 500) SIGS.clear(); if (SIGQ.size > 500) SIGQ.clear();
  const r = await wsCall(c, 'signatureSubscribe', [sig, { commitment: 'processed' }]); if (r.result != null) LIVE.sigs.set(r.result, sig);
}
/* while a coin is open in the panel: keep the TLS connection to Helius Sender warm, so a click does not pay the handshake */
setInterval(() => { if (LIVE.ports.size) { SOLX.warmSender(); SOLX.feeRefresh(null).catch(() => {}); } }, 15000);
const wsUrl = c => { const u = rpcUrl(c); return u ? u.replace(/^https:/, 'wss:') : 'wss://solana-rpc.publicnode.com'; };
function wsOpen(c) {
  if (LIVE.ws && LIVE.ws.readyState <= 1) return LIVE.ready;
  const ws = new WebSocket(wsUrl(c)); LIVE.ws = ws; LIVE.subs.clear();
  /* a quiet coin sends nothing for minutes: a small request every 20 s keeps the socket (and this worker) alive */
  /* 3.8.3 (owner 1117: PnL froze): a socket can die without closing. Nothing heard for 50 s (not even the getHealth answers) = dead:
     dropped and every panel subscribes again on a new one */
  LIVE.at = Date.now();
  const ka = setInterval(() => { if (LIVE.ws !== ws || ws.readyState > 1) { clearInterval(ka); return; }
    if (ws.readyState === 1 && Date.now() - LIVE.at > 50000) { clearInterval(ka); wsDrop(ws); return; }
    if (ws.readyState === 1) try { ws.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'getHealth' })); } catch (_) {} }, 20000);
  LIVE.ready = new Promise((res, rej) => { ws.onopen = () => res(ws); ws.onerror = () => rej(new Error('live feed unavailable')); });
  ws.onmessage = e => {
    LIVE.at = Date.now(); let j; try { j = JSON.parse(e.data); } catch (_) { return; }
    if (j.id != null && LIVE.wait.has(j.id)) { LIVE.wait.get(j.id)(j); LIVE.wait.delete(j.id); return; }
    if (j.method === 'accountNotification') { const f = LIVE.subs.get(j.params.subscription); if (f) f(j.params.result.value); }
    if (j.method === 'signatureNotification') { const s = LIVE.sigs.get(j.params.subscription); if (s) { LIVE.sigs.delete(j.params.subscription); SIGS.set(s, { err: ((j.params.result || {}).value || {}).err || null });
      for (const p of LIVE.ports) try { p.postMessage({ sigDone: s }); } catch (_) {} } }   /* 3.20.5: the panel hears it at once (was: its next 120 ms ask) */
  };
  ws.onclose = () => { if (LIVE.ws !== ws) return; LIVE.ws = null; setTimeout(() => { for (const p of LIVE.ports) p.resub(); }, 800); };
  return LIVE.ready;
}
async function wsCall(c, method, params) {
  const ws = await wsOpen(c), id = ++LIVE.id; ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  return new Promise((res, rej) => { LIVE.wait.set(id, res); setTimeout(() => { if (LIVE.wait.delete(id)) rej(new Error('live feed timeout')); }, 6000); });
}
function wsDrop(ws) { if (LIVE.ws !== ws) return; LIVE.ws = null; try { ws.close(); } catch (_) {} setTimeout(() => { for (const p of LIVE.ports) p.resub(); }, 300); }
async function wsSub(c, addr, fn) { const r = await wsCall(c, 'accountSubscribe', [addr, { encoding: 'base64', commitment: 'processed' }]); if (r.result == null) throw new Error('subscribe refused'); LIVE.subs.set(r.result, fn); return r.result; }
function wsUnsub(c, id) { if (!LIVE.subs.delete(id) || !LIVE.ws || LIVE.ws.readyState !== 1) return; LIVE.ws.send(JSON.stringify({ jsonrpc: '2.0', id: ++LIVE.id, method: 'accountUnsubscribe', params: [id] })); }
function liveLedger() { for (const p of LIVE.ports) p.ledger(); }
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'live' || !port.sender || port.sender.id !== chrome.runtime.id) return;
  const S = { a: null, mint: null, isMint: false, ids: [], st: null, L: [], usd: null, poll: 0, rate: 0, chk: 0, lastN: 0, tm: 0, last: 0, gen: 0, c: null, pubs: [], raws: new Map(), atas: [] };
  const total = () => { let t = 0n; for (const v of S.raws.values()) t += v; return t; };   /* tokens of all trading wallets */
  const post = p => { try { port.postMessage(p); } catch (_) {} };
  const paint = () => {   /* at most every 120 ms: a busy coin changes every block */
    if (S.tm) return; const d = Math.max(0, 120 - (Date.now() - S.last));
    S.tm = setTimeout(async () => {
      S.tm = 0; S.last = Date.now(); if (!S.st) return;
      const st = S.st, raw = total(), v = SOLX.valueNow(Object.assign({}, st, { raw })); if (v == null) return;
      post({ mint: S.mint, raw: raw.toString(), dec: st.dec, ui: Number(raw) / 10 ** st.dec, value_sol: v, usd: S.usd, pnl: S.L.length ? SOLX.pnlOf(S.L, v) : null, live: true, n: S.pubs.length });
    }, d);
  };
  const stop = () => { for (const id of S.ids) wsUnsub(S.c, id); S.ids = []; clearInterval(S.poll); clearInterval(S.rate); clearInterval(S.chk); S.poll = S.rate = S.chk = 0; if (S.st) S.st.live = false; S.st = null; };
  async function start(gen) {
    const c = S.c = await cfg(), SW = await selected(), b = SW[0]; if (!b || !S.a) return;
    const pubs = SW.map(w => w.pub); S.pubs = pubs;
    await book(c, b.pub).catch(() => {});
    const bals = new Map(pubs.filter(p => BALS.has(p)).map(p => [p, BALS.get(p).v]));   /* SOL of the trading wallets, added up (last reads to start) */
    for (const pub of pubs) wsSub(c, pub, v => { if (!v) return; bals.set(pub, v.lamports); BALS.set(pub, { v: v.lamports, t: Date.now() }); if (pub === b.pub) { BAL.v = v.lamports; BAL.t = Date.now(); }
      if (bals.size === pubs.length) post({ bal: [...bals.values()].reduce((s, x) => s + x, 0) / 1e9 }); }).then(id => { if (gen === S.gen) S.ids.push(id); else wsUnsub(c, id); }).catch(() => {});
    const p = await posAll(c, S.a, S.isMint, pubs); if (gen !== S.gen) return;
    S.mint = p.mint; S.usd = await SOLX.solUsd(); S.L = await ledOf(p.mint, pubs); coinFull(p.mint).catch(() => {});   /* for Share PnL */
    if (gen !== S.gen) return;
    post(Object.assign({}, p, { usd: S.usd, pnl: S.L.length ? SOLX.pnlOf(S.L, p.value_sol) : null }));
    S.raws = new Map(p.parts.map(q => [q.pub, BigInt(q.raw || 0)]));
    S.atas = p.parts.map(q => ({ pub: q.pub, ata: q.ata || (SOLX.ST.get(p.mint + '|' + q.pub) || {}).ata })).filter(q => q.ata);
    for (const q of S.atas) syncChain(c, q.pub, p.mint, q.ata).catch(() => {});   /* trades made outside the panel count too */
    const sT = new Map(), syncSoon = q => { clearTimeout(sT.get(q.pub)); sT.set(q.pub, setTimeout(() => { if (gen === S.gen) syncChain(c, q.pub, p.mint, q.ata).catch(() => {}); }, 1500)); };
    if (p.live) {
      const st = SOLX.ST.get(p.mint + '|' + b.pub);
      if (st) {
        S.st = st;
        try {
          if (p.live === 'curve') S.ids.push(await wsSub(c, p.bc, v => { if (!S.st || !v) return; const cv = SOLX.curveOf(SOLX.unb64(v.data[0])); S.st.curve = cv; S.lastN = Date.now(); S.st.t = Date.now(); if (cv.complete) { port.resub(); return; } paint(); }));
          else {   /* migrated: the PumpSwap pool's two vaults */
            /* 3.8.4 (owner 1117: PnL stuck at the price of the last trade): always the coin's CURRENT pool object. A trade or a position read
               puts a fresh one on the shared state; the old one captured here kept getting the updates while the panel read the new one */
            const PP = () => S.st && S.st.pool, amt = v => { const d = v && SOLX.unb64(v.data[0]); return d && d.length >= 72 ? SOLX.u64(d, 64) : null; };
            S.ids.push(await wsSub(c, p.vb, v => { const x = amt(v), P = PP(); if (P && x != null) { P.B = x; S.lastN = Date.now(); paint(); } }));
            S.ids.push(await wsSub(c, p.vq, v => { const x = amt(v), P = PP(); if (P && x != null) { P.Qv = x; P.Q = x + (P.virt || 0n); S.lastN = Date.now(); paint(); } }));
            if (p.pool) S.ids.push(await wsSub(c, p.pool, v => { const d = v && SOLX.unb64(v.data[0]), P = PP(); if (!P || !d || d.length < 245) return; Object.assign(P, SOLX.poolFlags(d)); P.Q = P.Qv + P.virt; paint(); }));
          }
          if (p.quote && p.quote !== SOLX.WSOL) S.rate = setInterval(() => { SOLX.quoteRate(p.quote).then(paint).catch(() => {}); }, 15000);   /* the quote token's SOL price */
          for (const q of S.atas) S.ids.push(await wsSub(c, q.ata, v => {   /* each wallet's token account */
            if (!S.st) return; const d = v && SOLX.unb64(v.data[0]), raw = d && d.length >= 72 ? SOLX.u64(d, 64) : 0n;
            S.raws.set(q.pub, raw); if (q.pub === b.pub) { S.st.raw = raw; S.st.t = Date.now(); } paint(); syncSoon(q); }));
          if (gen !== S.gen) { stop(); return; }
          st.live = true; S.lastN = Date.now();
          /* watchdog (3.8.3): the feed quiet for 15 s while a direct read shows the coin moved = it stopped delivering: a new socket */
          S.chk = setInterval(async () => {
            if (gen !== S.gen || !S.st || Date.now() - S.lastN < 15000) return;
            const T = await SOLX.accs(p.live === 'curve' ? [p.bc] : [p.vb, p.vq], rpcUrl(c)).catch(() => null); if (!T || gen !== S.gen || !S.st) return;
            const amt = x => x && x.data.length >= 72 ? SOLX.u64(x.data, 64) : null;
            let moved = false;
            if (p.live === 'curve') { const cv = T[0] && T[0].data.length >= 81 ? SOLX.curveOf(T[0].data) : null; moved = !!cv && (cv.vT !== S.st.curve.vT || cv.vQ !== S.st.curve.vQ); }
            else { const B = amt(T[0]), Q = amt(T[1]), P = S.st.pool; moved = B != null && Q != null && P && (B !== P.B || Q !== P.Qv); }
            if (moved) { S.lastN = Date.now(); if (LIVE.ws) wsDrop(LIVE.ws); else port.resub(); }
          }, 8000);
          return;
        } catch (_) { S.st = null; /* no live feed: fall back to reading */ }
      }
    }
    if (gen !== S.gen) return;
    /* 3.12.27 (owner 1120: float launchpad coin on Raydium CPMM, the PnL still not live): the coin's Raydium CPMM pool with SOL (its biggest
       on DexScreener), both vaults on the live feed: the price from the reserves on every change, like the PumpSwap pools. Else: polling. */
    try {
      const CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
      const J = await (await fetch('https://api.dexscreener.com/tokens/v1/solana/' + p.mint)).json();
      const pr = (Array.isArray(J) ? J : []).filter(x => x.dexId === 'raydium' && (x.labels || []).includes('CPMM') && [x.baseToken && x.baseToken.address, x.quoteToken && x.quoteToken.address].includes(SOLX.WSOL))
        .sort((x, y) => ((y.liquidity || {}).usd || 0) - ((x.liquidity || {}).usd || 0))[0];
      if (!pr || gen !== S.gen) throw new Error('no cpmm');
      const [pa] = await SOLX.accs([pr.pairAddress], rpcUrl(c)); if (!pa || pa.owner !== CPMM || pa.data.length < 373) throw new Error('not cpmm');
      const d = pa.data, key = o => SOLX.b58e(d.slice(o, o + 32));
      const v0 = key(72), v1 = key(104), m0 = key(168), m1 = key(200), dec0 = d[331], dec1 = d[332];
      const fees = [SOLX.u64(d, 341) + SOLX.u64(d, 357), SOLX.u64(d, 349) + SOLX.u64(d, 365)];   /* protocol + fund fees sit in the vaults too */
      const tokSide = m0 === p.mint ? 0 : m1 === p.mint ? 1 : -1; if (tokSide < 0 || (tokSide === 0 ? m1 : m0) !== SOLX.WSOL) throw new Error('not a SOL pool');
      const R = [null, null], amt = v => { const x = v && SOLX.unb64(v.data[0]); return x && x.length >= 72 ? SOLX.u64(x, 64) : null; };
      const T0 = await SOLX.accs([v0, v1], rpcUrl(c)); R[0] = T0[0] ? SOLX.u64(T0[0].data, 64) : null; R[1] = T0[1] ? SOLX.u64(T0[1].data, 64) : null;
      const dec = tokSide === 0 ? dec0 : dec1;
      let gt = 0, gl = 0;
      const gpaint = () => { if (gt) return; gt = setTimeout(() => { gt = 0; gl = Date.now(); if (gen !== S.gen || R[0] == null || R[1] == null) return;
        const tok = Number(R[tokSide] - fees[tokSide]) / 10 ** dec, sol = Number(R[1 - tokSide] - fees[1 - tokSide]) / 1e9; if (!(tok > 0 && sol > 0)) return;
        const raw = total(), v = Number(raw) / 10 ** p.dec * (sol / tok);
        post({ mint: S.mint, raw: raw.toString(), dec: p.dec, ui: Number(raw) / 10 ** p.dec, value_sol: v, usd: S.usd, pnl: S.L.length ? SOLX.pnlOf(S.L, v) : null, live: true, n: S.pubs.length });
      }, Math.max(0, 120 - (Date.now() - gl))); };
      S.ids.push(await wsSub(c, v0, v => { const x = amt(v); if (x != null) { R[0] = x; gpaint(); } }));
      S.ids.push(await wsSub(c, v1, v => { const x = amt(v); if (x != null) { R[1] = x; gpaint(); } }));
      for (const q of S.atas) S.ids.push(await wsSub(c, q.ata, v => {   /* each wallet's token account */
        const x = v && SOLX.unb64(v.data[0]), raw = x && x.length >= 72 ? SOLX.u64(x, 64) : 0n; S.raws.set(q.pub, raw); gpaint(); syncSoon(q); }));
      if (gen !== S.gen) { stop(); return; }
      gpaint();
      /* safety net: a direct read every 10 s (fees, a dead socket) */
      S.poll = setInterval(async () => { if (gen !== S.gen) return; const T = await SOLX.accs([pr.pairAddress, v0, v1], rpcUrl(c)).catch(() => null); if (!T || !T[0]) return;
        fees[0] = SOLX.u64(T[0].data, 341) + SOLX.u64(T[0].data, 357); fees[1] = SOLX.u64(T[0].data, 349) + SOLX.u64(T[0].data, 365);
        if (T[1]) R[0] = SOLX.u64(T[1].data, 64); if (T[2]) R[1] = SOLX.u64(T[2].data, 64); gpaint(); }, 10000);
      return;
    } catch (_) { /* not a Raydium CPMM coin with SOL: polling below */ }
    let lastRaw = p.raw;
    S.poll = setInterval(async () => { const q = await posAll(c, S.a, S.isMint, pubs).catch(() => null); if (q && gen === S.gen) { if (q.raw !== lastRaw) { lastRaw = q.raw; for (const a of S.atas) syncSoon(a); } post(Object.assign(q, { usd: S.usd, pnl: S.L.length ? SOLX.pnlOf(S.L, q.value_sol) : null })); } }, 1500);   /* 3.12.26: was 3 s (float / Raydium coins: PnL lagged) */
  }
  port.say = post;
  port.fresh = async () => {   /* re-read the token account (and the wallet) right after a trade lands; again 1 s later for a lagging node */
    for (const wait of [0, 1000, 2500]) {
      if (wait) await new Promise(r => setTimeout(r, wait));
      const st = S.st; if (!st || !S.atas.length) { if (!S.st && S.a) port.resub(); return; }
      try {
        const T = await SOLX.accs(S.atas.map(q => q.ata), rpcUrl(S.c || {})); if (S.st !== st) return;
        S.atas.forEach((q, i) => { const ta = T[i], raw = ta && ta.data.length >= 72 ? SOLX.u64(ta.data, 64) : 0n; S.raws.set(q.pub, raw); if (q.pub === S.pubs[0]) st.raw = raw; }); paint();
      } catch (_) {}
    }
  };
  port.resub = () => { if (!S.a) return; stop(); const g = ++S.gen; start(g).catch(e => { if (g === S.gen) post({ err: String((e && e.message) || e) }); }); };
  port.ledger = async () => { if (!S.mint) return; S.L = await ledOf(S.mint, S.pubs); if (S.st) paint(); else port.resub(); };
  port.onMessage.addListener(m => { if (!m || m.op !== 'watch') return; S.a = m.a || null; S.isMint = !!m.isMint;
    if (S.a) { const h = hostOf((port.sender && port.sender.url) || ''); LHOST = h; telePing(h, /^0x/i.test(S.a) ? 'bsc' : 'sol').catch(() => {}); } if (S.a) port.resub(); else { S.gen++; stop(); } });
  LIVE.ports.add(port);
  port.onDisconnect.addListener(() => { LIVE.ports.delete(port); S.gen++; stop(); if (!LIVE.ports.size && LIVE.ws) { try { LIVE.ws.close(); } catch (_) {} LIVE.ws = null; } });
});

const SYM = new Map();
async function symOf(mint, url) {   /* 3.15.0: the coin's ticker for the wallet menu ("1.98M WIF"), cached */
  if (SYM.has(mint)) return SYM.get(mint);
  const v = await SOLX.coinMeta(mint, url).then(x => String((x && x.symbol) || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 12) || null).catch(() => null);
  SYM.set(mint, v); return v;
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || typeof m.op !== 'string') return false;
  if (m.op === 'hkey') {   /* a hotkey pressed in the site's chart frame -> the panel in the top frame of the same tab (3.20.5: side + key number) */
    const x = m.arg || {}, sd = x.s, i = +x.i; if (sender.id === chrome.runtime.id && sender.tab && (sd === 'b' || sd === 's') && i >= 0 && i < 4) chrome.tabs.sendMessage(sender.tab.id, { hkey2: { s: sd, i } }, { frameId: 0 }).catch(() => {});
    return false;
  }
  const fromPopup = sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL('popup.html'));   /* key handling only from our own popup page, never from a page script */
  if (['import', 'unlock', 'lock', 'forget', 'rename', 'reclaim', 'move', 'bscImport', 'bscForget'].includes(m.op) && !fromPopup) { reply({ err: 'not allowed here' }); return false; }
  if (sender.tab && sender.tab.url) LHOST = hostOf(sender.tab.url);
  handle(m).then(reply, e => { const t = String((e && e.message) || e).slice(0, 220); if (!['tx', 'wallets', 'cfg', 'pos', 'coin'].includes(m.op)) teleErr(m.op, t); reply({ err: t }); });
  return true;
});
