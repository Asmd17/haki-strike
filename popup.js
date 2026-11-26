const PRESETS = [{ slip: 20, prio: 0.0002, tip: 0.0002, sslip: 100 }, { slip: 25, prio: 0.001, tip: 0.001, sslip: 100 }, { slip: 30, prio: 0.002, tip: 0.001, sslip: 100 }];   /* 3.29.29: = bg.js */
/* 3.20.7 (owner: "let people make their own: buy 1 2 3 4, sell Q W E R"): 8 boxes; click one, press the key. Letters and digits (the
   top row or the number pad); a key already used elsewhere swaps over; Esc cancels; Backspace clears */
const hkKeyOf = e => { const c = e.code || ''; return /^Key[A-Z]$/.test(c) ? c.slice(3).toLowerCase() : /^(Digit|Numpad)[0-9]$/.test(c) ? c.slice(-1) : null; };
function hkBoxes() {
  const all = () => ['hkBuy', 'hkSell'].map(id => String($(id).value || '').toLowerCase().split(/[\s,]+/).filter(Boolean).concat(['', '', '', '']).slice(0, 4));
  const put = L => { $('hkBuy').value = L[0].join(' ').toUpperCase(); $('hkSell').value = L[1].join(' ').toUpperCase(); hkNames(); draw(); dirty(true); };
  const draw = () => { const L = all();
    document.querySelectorAll('.hks').forEach((w, r) => { w.textContent = ''; L[r].forEach((k, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hkk'; b.textContent = k ? k.toUpperCase() : '–';
      b.setAttribute('aria-label', (r ? 'Sell' : 'Buy') + ' key ' + (i + 1) + (k ? ': ' + k.toUpperCase() : ', not set'));
      b.onclick = () => { document.querySelectorAll('.hkk.rec').forEach(x => { x.classList.remove('rec'); }); b.classList.add('rec'); b.textContent = '…'; b.focus(); };
      b.onblur = () => { if (b.classList.contains('rec')) draw(); };
      b.onkeydown = e => { if (!b.classList.contains('rec')) return; if (e.key === 'Tab') return; e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { draw(); return; }
        const L2 = all(); if (e.key === 'Backspace' || e.key === 'Delete') { L2[r][i] = ''; put(L2); return; }
        const n = hkKeyOf(e); if (!n) return;   /* Shift, Ctrl ... alone: wait for the key */
        for (const row of L2) for (let j = 0; j < 4; j++) if (row[j] === n) row[j] = L2[r][i];   /* already used: the two swap */
        L2[r][i] = n; put(L2); };
      w.appendChild(b); }); }); };
  draw();
}
/* 3.21.0 settings window: the 4 amounts typed like the panel's keys (the hidden field keeps "a, b, c, d" for the save) */
function mxFill() {
  document.querySelectorAll('.mx').forEach(w => {
    const h = $(w.dataset.for), v = String(h.value || '').split(/[\s,;]+/).filter(Boolean); w.textContent = '';
    for (let i = 0; i < 4; i++) { const x = document.createElement('input'); x.inputMode = 'decimal'; x.value = v[i] || ''; x.setAttribute('aria-label', (w.classList.contains('s') ? 'Sell' : 'Buy') + ' key ' + (i + 1));
      x.oninput = () => { h.value = [...w.querySelectorAll('input')].map(e => e.value.trim().replace(',', '.')).filter(Boolean).join(', '); }; w.appendChild(x); }
  });
}
/* P1 / P2 / P3: one preset at a time (the panel's chosen one first) */
function pShow(i) { document.querySelectorAll('#pSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i))); document.querySelectorAll('.pset').forEach(p => { p.hidden = +p.dataset.i !== i; }); }
document.querySelectorAll('#pSeg button').forEach(b => { b.onclick = () => pShow(+b.dataset.i); });
/* the Save bar shows only while something on a saved page changed */
let DIRTY = false, doneT = 0;
function dirty(on) { DIRTY = !!on; $('bar').hidden = !DIRTY; if (DIRTY) { $('st').textContent = 'Unsaved changes'; $('st').className = 'st'; } }
let LOADING = false;   /* fields refilled by load() (and a refilled box losing focus) are not your edits */
const onEdit = e => { const t = e.target; if (!LOADING && t && t.closest && t.closest('[data-save]') && !t.hasAttribute('data-now')) dirty(true); };
document.addEventListener('input', onEdit); document.addEventListener('change', onEdit);
function saved() { dirty(false); const d = document.createElement('div'); d.className = 'done'; d.textContent = 'Saved'; d.setAttribute('role', 'status'); document.body.appendChild(d); clearTimeout(doneT); doneT = setTimeout(() => d.remove(), 1600); }
async function spdPaint() {   /* 3.26.0 Your speed */
  const r = await ask('speedStats').catch(() => null); if (!r || r.err) return;
  $('spdN').textContent = r.n ? 'last ' + r.n + ' trades' : 'no trades measured yet';
  $('spdC').textContent = r.clickMs != null ? r.clickMs + ' ms' : '–'; $('spdL').textContent = r.landMs != null ? (r.landMs / 1000).toFixed(2) + ' s' : '–';
  $('spdB').textContent = r.next != null ? Math.round(r.next * 100) + '%' : '–'; $('spdS').textContent = r.saved > 0 ? r.saved.toFixed(4) + ' SOL' : '–';
  if (r.on && r.fac < 0.999) $('spdT').textContent = 'P' + r.preset + ' now pays tip ' + (+r.tipNow).toFixed(4) + ' (preset ' + (+r.tipCap).toFixed(4) + ') and priority ' + (+r.prioNow).toFixed(5) + ' (preset ' + (+r.prioCap).toFixed(5) + ') SOL: your trades land in the next block';
}
function hkNames() {   /* 3.20.6: the options read like the keys you press: Q, Space + Q, Ctrl + Q ... (with your first buy key) */
  const k = (String($('hkBuy').value || '').trim().split(/[\s,]+/)[0] || 'Q').toUpperCase().slice(0, 1) || 'Q';
  for (const o of $('hkMod').options) o.textContent = { none: k, space: 'Space + ' + k, ctrl: 'Ctrl + ' + k, alt: 'Alt + ' + k, shift: 'Shift + ' + k, off: 'Off' }[o.value];
}
const DEF = { autoSpeed: false, oneTx: true, autoSlip: true, mevGuard: true, buys: [0.1, 0.5, 1, 3.5], sells: [25, 50, 75, 100], quick: 0.1, slip: 20, tip: 0.001, presets: null, hk: true, hkMod: 'none', hkBuy: ['q', 'w', 'e', 'r'], hkSell: ['a', 's', 'd', 'f'], pulse: true, maxSol: 5, rpc: '', jupKey: '', cTexts: [], cAuto: false, cMin: 0.5, sound: true, vol: 0.7, ui: 0.85, pz: 1, autoFee: 'off' };
const $ = id => document.getElementById(id);
const say = (el, t, k) => { $(el).textContent = t || ''; $(el).className = 'st' + (k ? ' ' + k : ''); };
const nums = (s, n, lo, hi) => String(s).split(/[\s,;]+/).map(x => parseFloat(x.replace(',', '.'))).filter(x => x > lo && x <= hi).slice(0, n);
const num = (s, lo, hi, d) => { const v = parseFloat(String(s).replace(',', '.')); return v >= lo && v <= hi ? v : d; };
const ask = (op, arg) => chrome.runtime.sendMessage({ op, arg });
const WIN = new URLSearchParams(location.search).get('win');   /* opened as its own small window from the panel */
if (WIN) document.documentElement.classList.add('win');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let NW = 0, adding = false;
/* 3.15.1: the coin marks next to balances, as in the panel */
const SOLM = '<svg class="sol" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="pSg" x1="6" y1="26" x2="26" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#000"/><g fill="url(#pSg)" transform="translate(16 16) scale(1.32) translate(-15.8 -15.9)"><path d="M10.2 19.9a.6.6 0 0 1 .43-.18h13.1c.27 0 .4.32.21.51l-2.59 2.59a.6.6 0 0 1-.43.18H7.82a.3.3 0 0 1-.21-.51z"/><path d="M10.2 9.18a.62.62 0 0 1 .43-.18h13.1c.27 0 .4.32.21.51l-2.59 2.59a.6.6 0 0 1-.43.18H7.82a.3.3 0 0 1-.21-.51z"/><path d="M21.35 14.5a.6.6 0 0 0-.43-.18H7.82a.3.3 0 0 0-.21.51l2.59 2.59a.6.6 0 0 0 .43.18h13.1a.3.3 0 0 0 .21-.51z"/></g></svg>';
const BNBM = '<svg class="sol" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#F0B90B"/><path fill="#fff" d="M12.1 14.2 16 10.3l3.9 3.9 2.3-2.3L16 5.7l-6.2 6.2zM5.7 16l2.3-2.3 2.3 2.3-2.3 2.3zm6.4 1.8L16 21.7l3.9-3.9 2.3 2.3L16 26.3l-6.2-6.2zm9.6-1.8 2.3-2.3 2.3 2.3-2.3 2.3zM18.3 16 16 13.7 14.3 15.4l-.2.2-.4.4L16 18.3z"/></svg>';
const RM = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4.25 4.25l.6 8.4c.05.6.55 1.1 1.15 1.1h4c.6 0 1.1-.5 1.15-1.1l.6-8.4"/></svg>';
async function paint() {   /* every wallet: name, address, SOL; one password unlocks them all */
  const r = await ask('wallets'), L = (r && r.list) || []; NW = L.length;
  if (r && r.err) say('wst', r.err, 'bad');
  $('wList').innerHTML = L.map(w => '<div class="wi"><span class="av" aria-hidden="true">' + esc((String(w.label).match(/\d+$/) || [String(w.label).trim()[0] || 'W'])[0].toUpperCase()) + '</span><span class="t"><b>' + esc(w.label) + (w.sel ? '<span class="on">trading</span>' : '') + '</b><i>' + esc(w.pub.slice(0, 6) + '…' + w.pub.slice(-6)) + '</i></span>'
    + (w.open ? '<span class="s">' + (w.sol == null ? '–' : (+w.sol).toFixed(4)) + SOLM + '</span>' : '<span class="s lk">Locked</span>')
    + '<button class="rm" data-rm="' + esc(w.pub) + '" aria-label="Remove ' + esc(w.label) + '" title="Remove this wallet from the extension (the coins stay on it)">' + RM + '</button></div>').join('');
  $('wList').querySelectorAll('[data-rm]').forEach(b => { b.onclick = async () => {
    if (!confirm('Remove this wallet from the extension? Its coins stay on the wallet; you can add it again with its private key.')) return;
    await ask('forget', { pub: b.dataset.rm }); say('wst', 'Wallet removed from the extension', 'ok'); paint(); }; });
  const locked = L.some(w => !w.open); $('wKeep').hidden = !(L.length && r && r.keep && !locked); $('iKeepL').hidden = !!L.length;
  $('wHint').hidden = L.length < 2; $('wLocked').hidden = !(L.length && locked); $('wOpen').hidden = !(L.length && !locked);
  $('wNew').hidden = !!L.length && !adding;
  $('iP2l').hidden = !!L.length; $('iP1l').firstChild.textContent = L.length ? 'Your HAKI Strike password (the same for every wallet)' : 'New password';
  $('iPw').style.gridTemplateColumns = L.length ? '1fr' : '';
  paintMove(L); paintSav();
  const on = L.filter(w => w.sel && w.open && w.sol != null);
  $('bal').textContent = on.length ? on.reduce((s, w) => s + w.sol, 0).toFixed(4) + ' SOL' + (on.length > 1 ? ' · ' + on.length + ' wallets' : '') : '';
  $('bal2').textContent = on.length ? on.reduce((s, w) => s + w.sol, 0).toFixed(3) + ' SOL' : '';
}
/* ---- saved on fees, empty accounts, moves between own wallets ---- */
const sol4 = v => (+v || 0).toFixed(v >= 1 ? 3 : 4);
async function paintSav() {
  paintPnl();
  const r = await ask('savings'); if (!r || r.err) { $('savV').textContent = '–'; $('volBV').textContent = '–'; return; } if (r.usd) USD = r.usd;
  const cell = (k, v) => '<div><i>' + k + '</i><b>' + sol4(v) + '</b><span>' + (r.usd ? '$' + (v * r.usd).toFixed(2) : '') + '</span></div>';
  $('savV').innerHTML = cell('Today', r.today) + cell('7 days', r.week) + cell('All time', r.all);
  if (r.vol) $('volBV').innerHTML = cell('Today', r.vol.today) + cell('7 days', r.vol.week) + cell('All time', r.vol.all);   /* 3.12.10: buys + sells through the HAKI panel */
}
/* 3.12.15: PnL today / 7 days / all time; a click opens the share card of that period */
const SHI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
async function paintPnl() {
  const r = await ask('pnlP'); if (!r || r.err) { $('pnlV').textContent = '–'; return; }
  const cell = (k, l, v) => '<button type="button" data-pk="' + k + '" title="Share ' + l.toLowerCase() + ' PnL"><i>' + l + SHI + '</i><b class="' + (v > 1e-9 ? 'up' : v < -1e-9 ? 'dn' : '') + '">' + (v > 1e-9 ? '+' : v < -1e-9 ? '−' : '') + sol4(Math.abs(v)) + '</b><span>' + (r.usd ? (v < -1e-9 ? '−' : '') + '$' + Math.abs(v * r.usd).toFixed(2) : '') + '</span></button>';
  $('pnlV').innerHTML = cell('today', 'Today', r.today) + cell('week', '7 days', r.week) + cell('all', 'All time', r.all);
}
document.addEventListener('click', async e => {
  const t = e.target.closest && e.target.closest('[data-pk]'); if (!t) return;
  const r = await ask('sharePeriod', { k: t.dataset.pk }); if (r && r.err) { const s = $('wst'); if (s) { s.textContent = r.err; s.className = 'st bad'; } }
});
let RC = null, USD = 0;
/* 3.8.5 (owner 1117: "hard to see how much you claim"): the SOL to get back is the big number on the right, the button says it too */
function rcShow(r) {
  const on = !!(r && r.n); $('rcV').hidden = !on; $('rcGo').textContent = on ? 'Claim ' + sol4(r.sol) + ' SOL' : 'Get SOL back';
  if (!on) return;
  $('rcSol').textContent = sol4(r.sol) + ' SOL'; $('rcUsd').textContent = USD ? '≈ $' + (r.sol * USD).toFixed(2) : '';
}
$('rcScan').onclick = async () => {
  say('tst', 'Checking your wallets…'); $('rcGo').disabled = true;
  const r = await ask('reclaimScan'); if (!r || r.err) { say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  RC = r; $('rcN').textContent = r.n ? r.n + ' empty account' + (r.n === 1 ? '' : 's') + ' · ' + r.list.filter(x => x.n).map(x => x.label + ': ' + x.n).join(' · ') : 'No empty accounts: nothing to get back'; rcShow(r);
  $('rcGo').disabled = !r.n; say('tst', '');
};
$('rcGo').onclick = async () => {
  if (!RC || !RC.n) return; $('rcGo').disabled = true; say('tst', 'Closing ' + RC.n + ' empty accounts…');
  const r = await ask('reclaim'); if (!r || r.err) { say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  say('tst', (r.closed ? sol4(r.sol) + ' SOL back from ' + r.closed + ' accounts' : 'Nothing closed') + (r.errs.length ? ' · ' + r.errs.join(' · ') : ''), r.errs.length && !r.closed ? 'bad' : 'ok');
  RC = null; rcShow(null); $('rcN').textContent = 'Done. Check again any time.'; paint();
};
/* 3.10.0 creator fees (owner 1118): checked when Settings opens, claimed with one button into the wallets that made the coins */
let CF = null;
async function cfScan(quiet) {
  if (!quiet) say('tst', 'Checking creator fees…'); $('cfGo').disabled = true;
  const r = await ask('creatorScan'); if (!r || r.err) { if (!quiet) say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  CF = r; const has = r.list.filter(x => x.sol >= 0.00001), on = r.sol >= 0.00001;
  $('cfV').hidden = !on; $('cfGo').textContent = on ? 'Claim ' + sol4(r.sol) + ' SOL' : 'Claim';
  if (on) { $('cfSol').textContent = sol4(r.sol) + ' SOL'; $('cfUsd').textContent = USD ? '≈ $' + (r.sol * USD).toFixed(2) : ''; }
  $('cfN').textContent = on ? has.map(x => x.label + ': ' + sol4(x.sol) + (x.locked ? ' (locked)' : '')).join(' · ') : 'No creator fees waiting right now';
  $('cfGo').disabled = !on; if (!quiet) say('tst', '');
}
$('cfScan').onclick = () => cfScan(false);
$('cfGo').onclick = async () => {
  if (!CF || !(CF.sol > 0)) return; $('cfGo').disabled = true; say('tst', 'Claiming creator fees…');
  const r = await ask('creatorClaim'); if (!r || r.err) { say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  say('tst', (r.n ? sol4(r.sol) + ' SOL claimed' : 'Nothing claimed') + (r.errs.length ? ' · ' + r.errs.join(' · ') : ''), r.errs.length && !r.n ? 'bad' : 'ok');
  CF = null; $('cfV').hidden = true; $('cfGo').textContent = 'Claim'; $('cfN').textContent = 'Done. It fills up again as people trade your coins.'; paint();
};
setTimeout(() => cfScan(true).catch(() => {}), 400);
/* 3.17.0 trader cashback (pump.fun cashback coins): the panel's trades on them keep the creator fee for you; it waits until claimed */
let CB = null;
async function cbScan(quiet) {
  if (!quiet) say('tst', 'Checking cashback…'); $('cbGo').disabled = true;
  const r = await ask('cashbackScan'); if (!r || r.err) { if (!quiet) say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  CB = r; const on = r.sol >= 0.00001, has = r.list.filter(x => x.sol >= 0.00001);
  $('cbV').hidden = !on; $('cbGo').textContent = on ? 'Claim ' + sol4(r.sol) + ' SOL' : 'Claim';
  if (on) { $('cbSol').textContent = sol4(r.sol) + ' SOL'; $('cbUsd').textContent = USD ? '≈ $' + (r.sol * USD).toFixed(2) : ''; }
  $('cbN').textContent = on ? has.map(x => x.label + ': ' + sol4(x.sol) + (x.locked ? ' (locked)' : '')).join(' · ') : 'No cashback waiting right now';
  $('cbGo').disabled = !on; if (!quiet) say('tst', '');
}
$('cbScan').onclick = () => cbScan(false);
$('cbGo').onclick = async () => {
  if (!CB || !(CB.sol > 0)) return; $('cbGo').disabled = true; say('tst', 'Claiming cashback…');
  const r = await ask('cashbackClaim'); if (!r || r.err) { say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  say('tst', (r.n ? sol4(r.sol) + ' SOL cashback claimed' : 'Nothing claimed') + (r.errs.length ? ' · ' + r.errs.join(' · ') : ''), r.errs.length && !r.n ? 'bad' : 'ok');
  CB = null; $('cbV').hidden = true; $('cbGo').textContent = 'Claim'; $('cbN').textContent = 'Done. It grows again as you trade cashback coins.'; paint();
};
setTimeout(() => cbScan(true).catch(() => {}), 700);
/* 3.9.0 Multi launch: which wallet launches, how many coins per click (saved at once) */
async function paintSpam(L) {
  const { spamW = '', spamN = 5, spamFresh = true } = await chrome.storage.local.get({ spamW: '', spamN: 5, spamFresh: true });
  $('spamFresh').checked = spamFresh !== false;
  $('spamW').innerHTML = '<option value="">Choose a wallet</option>' + L.map(w => '<option value="' + esc(w.pub) + '">' + esc(w.label) + ' · ' + (w.sol == null ? '–' : sol4(w.sol)) + ' SOL</option>').join('');
  $('spamW').value = L.some(w => w.pub === spamW) ? spamW : ''; $('spamN').value = String(Math.max(1, Math.min(10, +spamN || 5)));
  /* 3.12.3: creator fees of the new wallets' coins: claimed by the worker and sent to one of your wallets */
  const { feeTo = '' } = await chrome.storage.local.get({ feeTo: '' });
  $('feeTo').innerHTML = '<option value="">The launch wallet</option>' + L.map(w => '<option value="' + esc(w.pub) + '">' + esc(w.label) + ' · ' + esc(w.pub.slice(0, 4) + '…' + w.pub.slice(-4)) + '</option>').join('');
  $('feeTo').value = L.some(w => w.pub === feeTo) ? feeTo : '';
  const i = await ask('lwInfo'); if (i && !i.err) $('lwInfo').textContent = i.n + ' launch wallet' + (i.n === 1 ? '' : 's') + ' · ' + sol4(i.got) + ' SOL fees claimed so far · checked every 30 min';
}
$('feeTo').onchange = () => chrome.storage.local.set({ feeTo: $('feeTo').value });
$('lwGo').onclick = async () => { $('lwGo').disabled = true; $('lwGo').textContent = 'Claiming…'; const r = await ask('lwClaimNow'); $('lwGo').disabled = false; $('lwGo').textContent = 'Claim now'; if (r && !r.err) $('lwInfo').textContent = sol4(r.got) + ' SOL fees claimed so far'; else if (r) $('lwInfo').textContent = r.err; };
$('spamW').onchange = () => chrome.storage.local.set({ spamW: $('spamW').value });
$('spamN').onchange = () => chrome.storage.local.set({ spamN: +$('spamN').value });
$('spamFresh').onchange = () => chrome.storage.local.set({ spamFresh: $('spamFresh').checked });
function paintMove(L) {
  paintSpam(L).catch(() => {});
  $('mvBox').hidden = L.filter(w => w.open).length < 2;
  const opts = L.filter(w => w.open).map(w => '<option value="' + esc(w.pub) + '">' + esc(w.label) + ' · ' + (w.sol == null ? '–' : sol4(w.sol)) + '</option>').join('');
  const f = $('mvFrom').value, t = $('mvTo').value; $('mvFrom').innerHTML = opts; $('mvTo').innerHTML = opts;
  if (f) $('mvFrom').value = f; if (t) $('mvTo').value = t; else if ($('mvTo').options.length > 1) $('mvTo').selectedIndex = 1;
}
let mvMax = false;
$('mvMax').onclick = () => { mvMax = true; $('mvAmt').value = 'all'; };
$('mvAmt').oninput = () => { mvMax = false; };
$('mvGo').onclick = async () => {
  const from = $('mvFrom').value, to = $('mvTo').value; if (from === to) { say('tst', 'Choose two different wallets', 'bad'); return; }
  $('mvGo').disabled = true; say('tst', 'Sending…');
  const r = await ask('move', { from, to, sol: $('mvAmt').value, max: mvMax }); $('mvGo').disabled = false;
  if (!r || r.err) { say('tst', (r && r.err) || 'no answer', 'bad'); return; }
  say('tst', sol4(r.sol) + ' SOL moved from ' + r.from + ' to ' + r.to, 'ok'); $('mvAmt').value = ''; mvMax = false; paint();
};
/* 3.26.2 backup (to move the extension to another folder / PC): everything in this browser's storage except the copies that only this
   browser can open (the "stay unlocked" copies and the launch wallets, both locked with a key of this browser). Wallets stay sealed
   with your password inside the file. */
const BK_SKIP = ['keep', 'bkeep', 'lwBox'];
$('bkOut').onclick = async () => {
  const all = await chrome.storage.local.get(null), lw = Array.isArray(all.lwBox) ? all.lwBox.length : (all.lwBox ? 1 : 0); for (const k of BK_SKIP) delete all[k];
  const d = new Date(), name = 'haki-strike-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  const url = URL.createObjectURL(new Blob([JSON.stringify({ haki: 'strike-backup', v: 1, at: Date.now(), ver: chrome.runtime.getManifest().version, data: all })], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  say('bkst', 'Saved ' + name + ' (' + ((all.wallets || []).length) + ' Solana wallet(s)' + ((all.bwallets || []).length ? ', BSC wallet' : '') + '). Keep it safe: it opens with your password.' + (lw ? ' Launch wallets are not in it: claim their fees first (Multi launch → Claim now).' : ''), 'ok');
};
$('bkIn').onclick = () => $('bkFile').click();
$('bkFile').onchange = async () => {
  const f = $('bkFile').files[0]; $('bkFile').value = ''; if (!f) return;
  let j = null; try { j = JSON.parse(await f.text()); } catch (_) {}
  if (!j || j.haki !== 'strike-backup' || !j.data || !Array.isArray(j.data.wallets)) { say('bkst', 'This is not a HAKI Strike backup file', 'bad'); return; }
  if (!confirm('Restore ' + j.data.wallets.length + ' wallet(s) and all settings from this file? What is here now is replaced. Only restore a file you saved yourself.')) return;
  const data = Object.assign({}, j.data); for (const k of BK_SKIP) delete data[k];
  await chrome.storage.session.clear().catch(() => {}); await chrome.storage.local.remove(BK_SKIP); await chrome.storage.local.set(data);
  say('bkst', 'Restored. Unlock with your password (Wallets, above).', 'ok'); load();
};
$('wAddBtn').onclick = () => { adding = !adding; paint(); if (adding) $('iAddr').focus(); };
if (WIN === 'add') adding = true;   /* "Add or remove wallets" in the panel: the add form open right away */
async function load() {
  LOADING = true; try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); await load0(); } finally { setTimeout(() => { LOADING = false; }, 0); }
}
async function load0() {
  const c = Object.assign({}, DEF, await chrome.storage.local.get(DEF));
  $('buys').value = c.buys.join(', '); $('sells').value = c.sells.join(', '); $('quick').value = c.quick;
  const P = Array.isArray(c.presets) && c.presets.length === 3 ? c.presets : [Object.assign({}, PRESETS[0], { slip: c.slip, tip: c.tip }), PRESETS[1], PRESETS[2]];
  P.forEach((p, i) => { $('s' + i).value = p.slip; $('f' + i).value = p.prio; $('t' + i).value = p.tip;
    $('ss' + i).value = p.sslip ?? PRESETS[i].sslip ?? p.slip; $('sf' + i).value = p.sprio ?? p.prio; $('st' + i).value = p.stip ?? p.tip; });   /* 3.10.1: sell settings here too (owner: "slippage does not change") */
  $('hkMod').value = c.hk ? (['none', 'ctrl', 'alt', 'shift', 'space'].includes(c.hkMod) ? c.hkMod : 'none') : 'off';
  $('hkBuy').value = (c.hkBuy || DEF.hkBuy).join(' ').toUpperCase(); $('hkSell').value = (c.hkSell || DEF.hkSell).join(' ').toUpperCase();
  hkNames(); hkBoxes();
  const bs = await chrome.storage.local.get({ bscBuys: [0.01, 0.05, 0.1, 0.25], bscSlip: 15, bscGwei: 0, maxBnb: 2, preset: 0 });
  $('bBuys').value = bs.bscBuys.join(', '); $('bSlip').value = bs.bscSlip; $('bGwei').value = bs.bscGwei; $('maxBnb').value = bs.maxBnb;
  mxFill(); pShow([0, 1, 2].includes(+bs.preset) ? +bs.preset : 0);
  $('maxSol').value = c.maxSol; $('cTexts').value = (c.cTexts || []).filter(t => t !== 'Looks good, aiming for 2x').join('\n'); $('cAuto').checked = !!c.cAuto; $('cMin').value = c.cMin; $('rpc').value = c.rpc; $('jupKey').value = c.jupKey; $('pulse').checked = !!c.pulse; $('autoSlip').checked = c.autoSlip !== false; $('oneTx').checked = c.oneTx !== false; $('autoSpeed').checked = c.autoSpeed !== false; $('mevGuard').checked = c.mevGuard !== false; spdPaint(); $('autoFee').value = ['fast', 'eco', 'off'].includes(c.autoFee) ? c.autoFee : 'fast'; $('sound').checked = c.sound !== false; $('vol').value = c.vol; $('volV').textContent = Math.round(c.vol * 100) + '%'; $('ui').value = c.pz; $('uiV').textContent = Math.round(c.pz * 100) + '%';
  paint();
}
$('iGo').onclick = async () => {
  if (!NW && $('iP1').value !== $('iP2').value) { say('wst', 'The passwords differ', 'bad'); return; }
  if ($('iP1').value.length < 8) { say('wst', 'Password: at least 8 characters', 'bad'); return; }
  say('wst', 'Checking and sealing the key…');
  /* 3.14.4 (owner: a BNB key in this form said "not a Solana private key"): a BSC / EVM key (0x + 64 hex) added here goes to the BSC wallet */
  if (/^(0x)?[0-9a-fA-F]{64}$/.test($('iKey').value.trim())) {
    const b = await ask('bscImport', { secret: $('iKey').value.trim(), pass: $('iP1').value, label: $('iLabel').value });
    $('iKey').value = ''; $('iP1').value = ''; $('iP2').value = '';
    if (!b || b.err) { say('wst', (b && b.err) || 'failed', 'bad'); return; }
    $('iAddr').value = ''; $('iLabel').value = ''; adding = false; say('wst', 'BSC wallet added: ' + b.addr.slice(0, 6) + '…' + b.addr.slice(-4) + ' (trades on BSC coin pages)', 'ok'); paint(); paintBsc(); return;
  }
  const r = await ask('import', { secret: $('iKey').value, expect: $('iAddr').value.trim(), pass: $('iP1').value, label: $('iLabel').value, keep: !NW && $('iKeep').checked });
  $('iKey').value = ''; $('iP1').value = ''; $('iP2').value = '';
  if (r.err) say('wst', r.err, 'bad');
  else { $('iAddr').value = ''; $('iLabel').value = ''; adding = false; say('wst', r.label + ' added' + (NW ? ': tick it in the panel\'s wallet menu to trade with it' : ' and unlocked'), 'ok'); paint(); }
};
$('uGo').onclick = async () => { say('wst', 'Unlocking…'); const r = await ask('unlock', { pass: $('uP').value, keep: $('uKeep').checked }); $('uP').value = ''; if (r.err) say('wst', r.err, 'bad'); else { say('wst', (r.n > 1 ? r.n + ' wallets' : 'Wallet') + (r.keep ? ' unlocked and stays unlocked on this PC' : ' unlocked until Chrome closes'), 'ok'); paint(); } };
$('uP').onkeydown = e => { if (e.key === 'Enter') $('uGo').click(); };
$('oLock').onclick = async () => { await ask('lock'); say('wst', 'Locked', 'ok'); paint(); };

$('save').onclick = async () => {
  const rpc = $('rpc').value.trim();
  if (rpc) {
    let o; try { const u = new URL(rpc); if (u.protocol !== 'https:') throw 0; o = u.origin; } catch (_) { say('st', 'RPC must be an https address', 'bad'); return; }
    const ok = await chrome.permissions.request({ origins: [o + '/*'] }).catch(() => false);
    if (!ok) { say('st', 'Allow access to that RPC, or leave the field empty', 'bad'); return; }
  }
  /* 3.20.5 hotkeys: 4 buy + 4 sell keys, letters or digits, each used once; Ctrl + W / T / N belong to Chrome (a page never gets them) */
  const hkL = v => String(v || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const hkB = hkL($('hkBuy').value), hkS = hkL($('hkSell').value), hkM = $('hkMod').value, hkAll = hkB.concat(hkS);
  if (hkM !== 'off') {
    if (hkB.length !== 4 || hkS.length !== 4 || !hkAll.every(k => /^[a-z0-9]$/.test(k))) { say('st', 'Hotkeys: set all 4 buy and 4 sell keys', 'bad'); return; }
    if (new Set(hkAll).size !== 8) { say('st', 'Hotkeys: each key once', 'bad'); return; }
    if (hkM === 'ctrl' && hkAll.some(k => 'wtn'.includes(k))) { say('st', 'Hotkeys: Ctrl + W, T and N belong to Chrome, pick other keys or Alt', 'bad'); return; }
  }
  const buys = nums($('buys').value, 4, 0, 100), sells = nums($('sells').value, 4, 0, 100), bBuys = nums($('bBuys').value, 4, 0, 1000);
  if (buys.length !== 4 || sells.length !== 4) { say('st', 'Fill all 4 buy and 4 sell amounts', 'bad'); return; }
  const old = (await chrome.storage.local.get({ presets: null })).presets || [];
  const presets = PRESETS.map((d, i) => { const o = old[i] || {}, b = { slip: num($('s' + i).value, 0.1, 100, d.slip), prio: num($('f' + i).value, 0, 0.01, d.prio), tip: num($('t' + i).value, 0, 0.01, d.tip) };
    return Object.assign({}, o, b, { sslip: num($('ss' + i).value, 0.1, 100, o.sslip ?? b.slip), sprio: num($('sf' + i).value, 0, 0.01, o.sprio ?? b.prio), stip: num($('st' + i).value, 0, 0.01, o.stip ?? b.tip) }); });
  await chrome.storage.local.set({ buys: buys.length ? buys : DEF.buys, sells: sells.length ? sells : DEF.sells, quick: num($('quick').value, 0.001, 100, DEF.quick),
    presets, cTexts: $('cTexts').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 50), cAuto: $('cAuto').checked, cMin: num($('cMin').value, 0, 100, 0.5), maxSol: num($('maxSol').value, 0.001, 100, DEF.maxSol), rpc, jupKey: $('jupKey').value.trim(), ...(hkM === 'off' ? { hk: false } : { hk: true, hkMod: hkM, hkBuy: hkB, hkSell: hkS }), pulse: $('pulse').checked, autoSlip: $('autoSlip').checked, oneTx: $('oneTx').checked, autoSpeed: $('autoSpeed').checked, mevGuard: $('mevGuard').checked, autoFee: $('autoFee').value, sound: $('sound').checked, vol: +$('vol').value, pz: +$('ui').value,
    ...(bBuys.length === 4 ? { bscBuys: bBuys } : {}), bscSlip: num($('bSlip').value, 0.1, 100, 15), bscGwei: num($('bGwei').value, 0, 100, 0), maxBnb: num($('maxBnb').value, 0.001, 100, 2) });
  saved(); load();
};
$('undo').onclick = async () => { await load(); dirty(false); };
/* 3.22.0 Report a problem */
$('repGo').onclick = async () => {
  const t = $('repText').value.trim(); if (t.length < 3) { say('repSt', 'Write what happened first', 'bad'); return; }
  $('repGo').disabled = true; say('repSt', 'Sending…');
  const r = await ask('report', { text: t }); $('repGo').disabled = false;
  if (!r || r.err) { say('repSt', (r && r.err) || 'not sent', 'bad'); return; }
  $('repText').value = ''; say('repSt', 'Sent' + (r.n ? ' as report #' + r.n : '') + '. Thank you, we will look at it.', 'ok');
};
chrome.storage.local.get({ tele: true }).then(o => { $('tele').checked = o.tele !== false; });
$('tele').onchange = () => chrome.storage.local.set({ tele: $('tele').checked });
async function repFill() {   /* opened from an error's Report button: the error is in the text already */
  const { repText = '' } = await chrome.storage.session.get({ repText: '' }).catch(() => ({})); if (!repText) return;
  await chrome.storage.session.remove('repText'); tab('h'); $('repText').value = 'What happened:\n\n\nError shown: ' + repText; $('repText').focus(); $('repText').setSelectionRange(15, 15);
}
chrome.runtime.onMessage.addListener(m => { if (m && m.hkRep) repFill(); });
load();
/* Panel size applies at once (the open Axiom tab redraws), no Save needed */
$('ui').oninput = () => { const v = +$('ui').value; $('uiV').textContent = Math.round(v * 100) + '%'; chrome.storage.local.set({ pz: v }); };
/* sections (3.21.0: on the left in the window, a row on top in the toolbar popup); the last one is remembered */
const TABS = [...document.querySelectorAll('.tabs [data-t]')];
function tab(t) {
  TABS.forEach(b => { b.setAttribute('aria-selected', String(b.dataset.t === t)); if (b.dataset.t === t && !WIN) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  document.querySelectorAll('[data-p]').forEach(p => { p.hidden = p.dataset.p !== t; });
  const m = document.querySelector('main'); if (m) m.scrollTop = 0; scrollTo(0, 0);
  try { localStorage.setItem('hkTab', t); } catch (_) {}
}
TABS.forEach(b => { b.onclick = () => tab(b.dataset.t); });
let T0 = 'w'; try { T0 = localStorage.getItem('hkTab') || 'w'; } catch (_) {}
tab(WIN === 'add' || !TABS.some(b => b.dataset.t === T0) ? 'w' : T0);
if (WIN === 'rep') repFill();
$('vol').addEventListener('input', () => { $('volV').textContent = Math.round($('vol').value * 100) + '%'; });
$('ver').textContent = 'v' + chrome.runtime.getManifest().version;

/* ---- BSC wallet (3.14.0) ---- */
async function paintBsc() {
  const r = await ask('bscWallet');
  if (!r || r.none) { $('bList').innerHTML = ''; $('bList').hidden = true; $('bNew').hidden = false; $('bPl').hidden = false; return; }
  $('bNew').hidden = true; $('bList').hidden = false;
  $('bList').innerHTML = '<div class="wi"><span class="av" aria-hidden="true" style="background:#F0B90B;color:#000">B</span><span class="t"><b>' + esc(r.label || 'BSC wallet') + '</b><i>' + esc(r.addr.slice(0, 6) + '…' + r.addr.slice(-6)) + '</i></span>'
    + (r.open ? '<span class="s">' + (r.bnb == null ? '–' : (+r.bnb).toFixed(4)) + BNBM + '</span>' : '<span class="s lk">Locked</span>')
    + '<button class="rm" id="bRm" aria-label="Remove the BSC wallet" title="Remove this wallet from the extension (the coins stay on it)">' + RM + '</button></div>';
  $('bRm').onclick = async () => { if (!confirm('Remove the BSC wallet from the extension? Its coins stay on the wallet; you can add it again with its private key.')) return; await ask('bscForget'); say('bst', 'BSC wallet removed', 'ok'); paintBsc(); };
}
$('bGo').onclick = async () => {
  say('bst', 'Adding…'); const r = await ask('bscImport', { secret: $('bKey').value, pass: $('bPass').value });
  $('bKey').value = ''; $('bPass').value = '';
  if (!r || r.err) { say('bst', (r && r.err) || 'failed', 'bad'); return; }
  say('bst', 'BSC wallet added: ' + r.addr.slice(0, 6) + '…' + r.addr.slice(-4), 'ok'); paintBsc();
};
(async () => {
  paintBsc();
})();

/* ---- 3.28.0 subscription ---- */
const SUBD = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const subDays = ms => { const d = Math.max(0, Math.ceil(ms / 864e5)); return d + (d === 1 ? ' day' : ' days'); };
let SUB = null;
function subPaint(s) {
  SUB = s; const st = s && s.st, now = Date.now();
  const T = { open: ['Free for now', 'ok', 'Subscriptions have not started yet: everything works. Your free week starts when they do.'], free: ['Free for good', 'ok', 'Nothing to pay on this account.'], paid: ['Active', 'ok', 'Paid until ' + SUBD(s && s.until) + ' (' + subDays((s && s.until) - now) + ' left).'],
    trial: ['Free week', 'warn', subDays((s && s.until) - now) + ' left, until ' + SUBD(s && s.until) + '. Pay any time: the 30 days start after it.'],
    ended: ['Ended', 'bad', 'Buying is paused. Selling, wallets and paper trading still work.'],
    notrial: ['No free week', 'bad', 'The free week was already used on this PC, network or wallet. Buying is paused until you subscribe; selling still works.'],
    pending: ['Not started', '', 'Unlock your wallet (Wallets) and your free week starts.'], unknown: ['Could not check', '', 'No answer from the server. Try again in a moment.'] }[st] || ['Checking…', '', ''];
  $('subSt').textContent = T[0]; $('subDot').className = 'subdot' + (T[1] ? ' ' + T[1] : ''); $('subUntil').textContent = T[2];
  const bar = st === 'trial' || st === 'paid'; $('subBar').hidden = !bar;
  if (bar) { const tot = st === 'trial' ? (s.trialDays || 7) * 864e5 : Math.max(30 * 864e5, s.until - now); $('subFill').style.width = Math.max(3, Math.min(100, (s.until - now) / tot * 100)) + '%'; }
  const can = !!(s && s.treasury) && !['free', 'unknown', 'open'].includes(st); $('subPayS').hidden = !can; $('subManS').hidden = !can;
  if (s && s.price) $('subLead').textContent = 'HAKI Strike is ' + s.price + ' SOL for 30 days' + (s.trialDays ? ', the first ' + s.trialDays + ' days free' : '') + '. Paper trading is always free, and selling never needs a subscription.';
  if (can) { $('subAmt').textContent = s.price + ' SOL · 30 days'; $('subTo').textContent = 'To HAKI: ' + s.treasury.slice(0, 4) + '…' + s.treasury.slice(-4); $('subExact').textContent = s.pay + ' SOL'; $('subAddr').textContent = s.treasury; }
}
async function subLoad(k) { try { const r = await ask('lic', k ? { [k]: true } : {}); subPaint(r && !r.err ? r : { st: 'unknown' }); } catch (_) { subPaint({ st: 'unknown' }); } }
async function subWallets() {
  const r = await ask('wallets', {}).catch(() => null), L = (r && r.list) || [], sel = $('subW'); sel.textContent = '';
  for (const w of L) { const o = document.createElement('option'); o.value = w.pub; o.textContent = w.label + (w.sol != null ? ' · ' + (+w.sol).toFixed(3) + ' SOL' : '') + (w.open ? '' : ' · locked'); o.disabled = !w.open; sel.append(o); }
}
$('subPay').onclick = async () => {
  if (!SUB || !SUB.treasury) return; const pub = $('subW').value; if (!pub) { say('subMsg', 'Unlock a wallet first (Wallets)', 'bad'); return; }
  const lab = $('subW').selectedOptions[0] ? $('subW').selectedOptions[0].textContent.split(' · ')[0] : 'your wallet';
  if (!confirm('Send ' + SUB.pay + ' SOL from ' + lab + ' to HAKI (' + SUB.treasury.slice(0, 4) + '…' + SUB.treasury.slice(-4) + ') for 30 days of HAKI Strike?')) return;
  $('subPay').disabled = true; say('subMsg', 'Sending…');
  try { const r = await ask('licPay', { pub }); if (!r || r.err) throw new Error((r && r.err) || 'failed');
    subPaint(r); say('subMsg', r.credited ? 'Paid. Thank you: 30 days added.' : 'Sent. It shows up here within a minute.', 'ok'); if (!r.credited) setTimeout(() => subLoad('check'), 20000); subWallets(); }
  catch (e) { say('subMsg', String(e.message || e), 'bad'); } finally { $('subPay').disabled = false; }
};
$('subCheck').onclick = async () => { say('subMsg', 'Looking for your payment…'); const before = SUB && SUB.until; await subLoad('check'); const ok = SUB && SUB.st === 'paid' && SUB.until !== before; say('subMsg', ok ? 'Found it. Thank you: days added.' : 'Not found yet. Wait a minute after sending and check again.', ok ? 'ok' : ''); };
document.querySelectorAll('[data-cp]').forEach(b => { b.onclick = async () => { try { await navigator.clipboard.writeText($(b.dataset.cp).textContent.replace(/ SOL$/, '')); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); } catch (_) {} }; });
(async () => {   /* a device hash for the one-free-week rule: screen, graphics chip, CPU count, time zone (no names; only the hash leaves) */
  try { const { fp = '' } = await chrome.storage.local.get({ fp: '' }); if (!fp) { let gl = ''; try { const c = document.createElement('canvas').getContext('webgl'), d = c && c.getExtension('WEBGL_debug_renderer_info'); gl = d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) + '|' + c.getParameter(d.UNMASKED_VENDOR_WEBGL) : ''; } catch (_) {}
    const str = [gl, screen.width + 'x' + screen.height + 'x' + screen.colorDepth, navigator.hardwareConcurrency, navigator.deviceMemory, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.platform].join('|');
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); await chrome.storage.local.set({ fp: [...h.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('') }); } } catch (_) {}
  subLoad(); subWallets();
})();

/* ---- 3.29.0 migration snipe (only in the owner's build: the tab shows when the background has it) ---- */
const SN = ['snSol', 'snTp', 'snSl', 'snHold', 'snCap', 'snMinQ'], SNK = ['sol', 'tp', 'sl', 'hold', 'cap', 'minQ'];
const snRow = (b, s) => { const r = document.createElement('div'); r.className = 'row'; const l = document.createElement('span'); l.className = 'l'; const x = document.createElement('b'); x.textContent = b; const y = document.createElement('span'); y.textContent = s; l.append(x, y); r.append(l); return r; };
function snPaint(r, fill) {
  if (!r || r.err) { say('snSt', (r && r.err) || 'No answer', 'bad'); return; }
  if (fill) { SN.forEach((id, i) => { $(id).value = r.cfg[SNK[i]]; }); $('snAuto').checked = !!r.cfg.auto; }
  const b = r.book || {}, n = +b.net || 0; $('snNet').textContent = (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(4) + ' SOL'; $('snNet').style.color = n > 0 ? '#3DDC97' : n < 0 ? '#FF5C78' : '';
  $('snSum').textContent = (b.n || 0) + ' sold · ' + (b.wins || 0) + ' in profit · ' + (b.skipped || 0) + ' skipped · ' + (+r.atRisk || 0).toFixed(3) + ' SOL open · cap ' + r.cfg.cap + ' SOL';
  $('snFeed').textContent = r.cfg.auto ? (r.feed ? 'Auto on · listening' : 'Auto on · connecting…') : 'Auto off';
  const O = $('snOpen'); O.textContent = ''; for (const p of r.open || []) O.append(snRow(p.mint.slice(0, 4) + '…' + p.mint.slice(-4) + (p.pnl == null ? '' : ' · ' + (p.pnl >= 0 ? '+' : '') + p.pnl + ' %'), 'open ' + p.age + ' s · ' + p.cost.toFixed(3) + ' SOL in'));
  const H = $('snHist'); H.textContent = ''; for (const h of (b.hist || []).slice(0, 12)) H.append(snRow(h.mint.slice(0, 4) + '…' + h.mint.slice(-4) + ' · ' + (h.pnl >= 0 ? '+' : '') + h.pnl.toFixed(4) + ' SOL (' + h.pct + ' %)', new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + h.why + (h.auto ? ' · auto' : '')));
}
async function snLoad(fill) { snPaint(await ask('snipeCfg', {}).catch(() => null), fill); }
$('snSave').onclick = async () => { const set = { auto: $('snAuto').checked }; SN.forEach((id, i) => { set[SNK[i]] = +String($(id).value).replace(',', '.'); });
  const r = await ask('snipeCfg', { set }).catch(e => ({ err: String(e.message || e) })); if (r && r.err) { say('snSt', r.err, 'bad'); snLoad(true); return; } snPaint(r, true); say('snSt', set.auto ? 'Saved. Auto snipe is on: keep Chrome open.' : 'Saved.', 'ok'); };
$('snReset').onclick = async () => { if (!confirm('Reset the snipe results (net, history)? This also frees the loss cap.')) return; snPaint(await ask('snipeCfg', { reset: true }), false); say('snSt', 'Results reset.', 'ok'); };
ask('cfg').then(c => { if (c && c.snipe) { $('snpTab').hidden = false; snLoad(true); setInterval(() => { if (!document.querySelector('[data-p="m"]').hidden) snLoad(false); }, 3000); } }).catch(() => {});
