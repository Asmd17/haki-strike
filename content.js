/* HAKI Strike: the HAKI Strike trade panel (same layout, sizes and colours as HAKI's own #it), for SOL, floating on axiom.trade.
   It lives in a shadow root (Axiom's CSS never reaches it, ours never reaches Axiom) and never edits Axiom's page. The token comes from the URL
   (/token/<mint>; an old /meme/<pair> works too), the Pulse quick buy floats in our own layer over the row the mouse is on. Trades go to the
   background worker (it signs with your wallet); the position and PnL arrive live through a port (the coin's pump.fun curve over a WebSocket). */
(() => {
  /* once per page; after the extension updated itself the old copy is dead (its extension context is gone), so this one takes over */
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  if (typeof window.__hakiAx === 'function' && window.__hakiAx()) return; window.__hakiAx = alive;
  if (window.top === window) { const old = document.getElementById('haki-ax'); if (old) old.remove(); }
  /* 3.20.5 hotkeys (owner: "hotkeys don't work; plain Q W E R or Ctrl + Q; never buy by itself when the window is minimised or another app is
     on top"). The key is matched by its PLACE on the keyboard (e.code), so a Russian / any layout works (Q = Й). Modes: plain key, Ctrl,
     Alt, Shift, or hold Space. Never while typing, never a held-down repeat, only a real key press, only while this tab is in front and
     focused, and not in the first 0.4 s after the window comes back (the key that switched apps never trades) */
  const HKD = { hk: true, hkMod: 'none', hkBuy: ['q', 'w', 'e', 'r'], hkSell: ['a', 's', 'd', 'f'] };
  const hkKey = e => { const c = e.code || ''; return /^Key[A-Z]$/.test(c) ? c.slice(3).toLowerCase() : /^(Digit|Numpad)[0-9]$/.test(c) ? c.slice(-1) : null; };
  const hkMods = (e, m, sp) => { const n = !e.metaKey; return m === 'ctrl' ? n && e.ctrlKey && !e.altKey && !e.shiftKey : m === 'alt' ? n && e.altKey && !e.ctrlKey && !e.shiftKey
    : m === 'shift' ? n && e.shiftKey && !e.ctrlKey && !e.altKey : m === 'space' ? n && sp && !e.ctrlKey && !e.altKey && !e.shiftKey : n && !e.ctrlKey && !e.altKey && !e.shiftKey; };
  const hkFind = (e, c, sp) => { if (!c || !c.hk || !e.isTrusted || e.repeat || !hkMods(e, c.hkMod, sp)) return null; const k = hkKey(e); if (!k) return null;
    let i = (c.hkBuy || []).indexOf(k); if (i >= 0 && i < 4) return { s: 'b', i }; i = (c.hkSell || []).indexOf(k); return i >= 0 && i < 4 ? { s: 's', i } : null; };
  let hkFocAt = 0; const hkFront = () => document.visibilityState === 'visible' && document.hasFocus() && Date.now() - hkFocAt > 400;
  addEventListener('focus', e => { if (e.target === window) hkFocAt = Date.now(); });   /* the window came back (not a click on the page) */ document.addEventListener('visibilitychange', () => { hkFocAt = Date.now(); });
  if (window.top !== window) {   /* a frame inside the site (the chart): a hotkey pressed there is handed to the panel through the extension, never through the page */
    let sp = false, hc = Object.assign({}, HKD);
    try { chrome.storage.local.get(HKD).then(o => { hc = o; }).catch(() => {}); chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local' && (ch.hk || ch.hkMod || ch.hkBuy || ch.hkSell)) chrome.storage.local.get(HKD).then(o => { hc = o; }).catch(() => {}); }); } catch (_) {}
    addEventListener('keydown', e => {
      const t = e.composedPath()[0]; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      if (e.code === 'Space' && hc.hk && hc.hkMod === 'space') { sp = true; return; }
      const h = hkFind(e, hc, sp); if (!h || !hkFront()) return;
      e.preventDefault(); e.stopImmediatePropagation(); try { chrome.runtime.sendMessage({ op: 'hkey', arg: h }); } catch (_) {}
    }, true);
    addEventListener('keyup', e => { if (e.code === 'Space') sp = false; }, true);
    addEventListener('blur', () => { sp = false; });
    return;
  }
  const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
  const send = (op, arg) => new Promise(res => { try { chrome.runtime.sendMessage({ op, arg }, r => res(r || { err: (chrome.runtime.lastError || {}).message || 'no answer' })); } catch (e) { res({ err: 'Reload the page: the extension was updated' }); } });
  /* 3.13.0 (owner 1122: "the same on GMGN and Terminal"): one panel on three hosts. The coin comes from each host's URL:
     Axiom /token/<mint> (/meme/<pair>), GMGN /sol/token/<mint> (a referral link puts "<code>_" before it), Terminal (Padre)
     /trade/solana/<mint or pool> (a pool is turned into its coin by the worker, as Axiom's /meme/ pairs are). */
  const HOST = /(^|\.)gmgn\.ai$/.test(location.hostname) ? 'gmgn' : /(^|\.)padre\.gg$/.test(location.hostname) ? 'padre' : 'axiom';
  const pageAddr = () => {
    const p = location.pathname, re = HOST === 'gmgn' ? '^/sol/token/(?:[A-Za-z0-9]+_)?(' + B58 + ')' : HOST === 'padre' ? '^/trade/solana/(' + B58 + ')' : '^/(?:token|meme)/(' + B58 + ')';
    const m = p.match(new RegExp(re)); if (m) return m[1];
    /* 3.14.1 BSC coin pages: the same panel in BNB mode (GMGN /bsc/token/0x.., Terminal /trade/bsc/0x.., Axiom /meme/0x..) */
    const b = HOST === 'gmgn' ? p.match(/^\/bsc\/token\/(?:[A-Za-z0-9]+_)?(0x[0-9a-fA-F]{40})/) : HOST === 'padre' ? p.match(/^\/trade\/bsc\/(0x[0-9a-fA-F]{40})/i) : p.match(/^\/(?:meme|token)\/(0x[0-9a-fA-F]{40})/i);
    return b ? b[1].toLowerCase() : null;
  };
  const isBsc = a => /^0x[0-9a-f]{40}$/i.test(a || '');
  const isMintPage = () => isBsc(pageAddr()) ? false : HOST === 'gmgn' ? true : HOST === 'padre' ? /pump$|bonk$/.test(pageAddr() || '') : location.pathname.startsWith('/token/');
  const fmt = n => { n = +n; if (!isFinite(n)) return '–'; const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K'; if (a >= 1) return n.toFixed(2); return n.toPrecision(3); };
  const s4 = v => v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : Math.abs(v) >= 0.0001 || v === 0 ? (v === 0 ? '0' : v.toFixed(4)) : v.toExponential(1);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const ESC = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /* the SOL coin mark (Solana's three bars on a dark coin), drawn inline */
  const SOLI = '<svg class="sol" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="hkSg" x1="6" y1="26" x2="26" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#000"/><g fill="url(#hkSg)" transform="translate(16 16) scale(1.32) translate(-15.8 -15.9)"><path d="M10.2 19.9a.6.6 0 0 1 .43-.18h13.1c.27 0 .4.32.21.51l-2.59 2.59a.6.6 0 0 1-.43.18H7.82a.3.3 0 0 1-.21-.51z"/><path d="M10.2 9.18a.62.62 0 0 1 .43-.18h13.1c.27 0 .4.32.21.51l-2.59 2.59a.6.6 0 0 1-.43.18H7.82a.3.3 0 0 1-.21-.51z"/><path d="M21.35 14.5a.6.6 0 0 0-.43-.18H7.82a.3.3 0 0 0-.21.51l2.59 2.59a.6.6 0 0 0 .43.18h13.1a.3.3 0 0 0 .21-.51z"/></g></svg>';
  const BNBI = '<svg class="sol bnbm" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#F0B90B"/><path fill="#fff" d="M12.1 14.2 16 10.3l3.9 3.9 2.3-2.3L16 5.7l-6.2 6.2zM5.7 16l2.3-2.3 2.3 2.3-2.3 2.3zm6.4 1.8L16 21.7l3.9-3.9 2.3 2.3L16 26.3l-6.2-6.2zm9.6-1.8 2.3-2.3 2.3 2.3-2.3 2.3zM18.3 16 16 13.7 14.3 15.4l-.2.2-.4.4L16 18.3z"/></svg>';
  const I = {
    kb: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5"/><path d="M4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M12 6.5h.01M5 9.5h6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    wal: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M2.25 4.75a1.5 1.5 0 0 1 1.5-1.5h7.5v2.5"/><rect x="2.25" y="4.75" width="11.5" height="8" rx="1.5"/><path d="M11 8.75h.01"/></svg>',
    min: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>',
    max: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 10 3.5-3.5 3.5 3.5"/></svg>',
    chev: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
    shuffle: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3"/></svg>',
    bolt: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9 1 3 9h4l-1 6 6-8H8z"/></svg>',
    share: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10.25V2.5M5.25 5.25 8 2.5l2.75 2.75M3 8.5v3.75c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V8.5"/></svg>',
    pen: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.75 13.25 5.5 5.5 13.25H2.75V10.5z"/><path d="M9 4.25 11.75 7"/></svg>',
    x: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8.5 3.25 3.25L13 5"/></svg>',
    shield: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 1.2 2.6 3.3v4c0 3.4 2.3 6.2 5.4 7.5 3.1-1.3 5.4-4.1 5.4-7.5v-4z"/></svg>',
    swap: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5h9.5L10 3M13 10.5H3.5L6 13"/></svg>',
    slip: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 11c2.2-.1 3.3-1.4 4.2-3.3S8.7 4.3 11 4.2"/><path d="m9.6 2.7 1.7 1.5-1.6 1.6M2.5 13.5h11"/></svg>',
    gas: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 13.5V3.6c0-.6.5-1.1 1.1-1.1h4.3c.6 0 1.1.5 1.1 1.1v9.9M2.5 13.5h8M10 7h1.2c.6 0 1.1.5 1.1 1.1v2.4a.9.9 0 0 0 1.8 0V6.3l-1.7-1.8M5.5 5.5h2.5"/></svg>',
    fast: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8 3 3.7v3.6c0 3 2.1 5.4 5 6.7 2.9-1.3 5-3.7 5-6.7V3.7z"/></svg>',
    con: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h3l2.5 4.5M2.5 12.5h3L8 8h5.5M11 5.5 13.5 8 11 10.5"/></svg>',
    spl: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8H8l2.5-4.5h3M8 8l2.5 4.5h3M11.5 1.75l2 1.75-2 1.75M11.5 10.75l2 1.75-2 1.75"/></svg>',
    plus: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>',
    p: ['<i class="pd" style="--c:#2DD4BF" aria-hidden="true"></i>', '<i class="pd" style="--c:#F59E0B" aria-hidden="true"></i>', '<i class="pd" style="--c:#A78BFA" aria-hidden="true"></i>']   /* 3.11.6: dots, not droplets */
  };
  let BK = ['q', 'w', 'e', 'r'], SK = ['a', 's', 'd', 'f'];   /* 3.20.5: your own keys (settings → Hotkeys) */
  /* sounds (made with ElevenLabs, in sounds/): buy / sell landed, failed, auto sell; the Sounds switch in Settings, its volume.
     Web Audio so a quiet file can be raised: GAIN evens every file to the buy sound's loudness (RMS measured: buy -27.3, sell -17.6,
     fail -24.8, auto -34.6 dBFS); peaks stay below 0.4 after the gain. */
  const SND = { buy: 'sounds/buy.mp3', sell: 'sounds/sell.mp3', fail: 'sounds/fail.mp3', auto: 'sounds/auto.mp3' };
  const GAIN = { buy: 1, sell: 1, fail: 0.75, auto: 2.3 };   /* 3.19.2: sell = the owner's ka-ching (cash register sound effect, -30 dB mean, -3.7 dB peak) */
  let AC = null; const BUF = {};
  const sndBuf = k => BUF[k] || (BUF[k] = fetch(chrome.runtime.getURL(SND[k])).then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b)).catch(e => { delete BUF[k]; throw e; }));
  window.hkSound = async k => {
    try {
      if (!k || !SND[k] || (C && C.sound === false)) return;
      AC = AC || new AudioContext(); if (AC.state === 'suspended') await AC.resume().catch(() => {});
      const src = AC.createBufferSource(), g = AC.createGain(); src.buffer = await sndBuf(k);
      g.gain.value = Math.max(0, (C && C.vol != null ? +C.vol : 0.7) * (GAIN[k] || 1)); src.connect(g).connect(AC.destination); src.start();
    } catch (_) {}
  };

  /* the HAKI mark (the extension's own icon file, not redrawn) on our quick-buy button, so it is never mistaken for Axiom's */
  const QM = '<img class="qm" src="' + chrome.runtime.getURL('icons/fav-48.png') + '" alt="" draggable="false">';

  /* HAKI's font (Medeo Sans, OFL), loaded into the page's font set from our own file so the shadow root can use it */
  (async () => { try { const b2 = await (await fetch(chrome.runtime.getURL('fonts/medeo-latin.woff2'))).arrayBuffer(); const f2 = new FontFace('HakiMedeo', b2, { weight: '100 900' }); await f2.load(); document.fonts.add(f2); } catch (_) {} })();
  (async () => { try { const b3 = await (await fetch(chrome.runtime.getURL('fonts/inter-latin.woff2'))).arrayBuffer(); const f3 = new FontFace('HakiInter', b3, { weight: '100 900' }); await f3.load(); document.fonts.add(f3); } catch (_) {} })();   /* 3.27.1: Inter, as in the owner's reference */
  (async () => { try { const buf = await (await fetch(chrome.runtime.getURL('fonts/geist-latin.woff2'))).arrayBuffer(); const f = new FontFace('HakiGeist', buf, { weight: '100 900' }); await f.load(); document.fonts.add(f); } catch (_) {} })();

  const host = document.createElement('div'); host.id = 'haki-ax'; host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0';
  const R = host.attachShadow({ mode: 'closed' });
  R.innerHTML = `<style>
/* 3.15.0 "Obsidian" (owner 1122 picked it from three mocks, then: smaller, neater, fewer empty places, resizable, Consolidate / Split).
   One stylesheet (the old layers are gone). Grid 4 px; text 11 / 12 / 13, PnL 20; colour only for buy / sell / profit / loss. */
*{box-sizing:border-box;margin:0;font-family:HakiInter,HakiGeist,Geist,Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;padding:0}
.num,.n{font-variant-numeric:tabular-nums}
.p,.pw,.wm{transform-origin:0 0;font-feature-settings:"tnum" 1;text-rendering:optimizeLegibility}
.p{position:fixed;color:#EDEEF0;line-height:16px;user-select:none;overflow:hidden}
.sol{width:12px;height:12px;flex:none;display:block}
.up{color:#37D399!important}.dn{color:#F0596B!important}
button:focus-visible{outline:2px solid rgba(255,255,255,.5);outline-offset:1px}
/* header: logo, presets, wallets, tools (drag the panel by it) */
.tb{position:relative;display:flex;align-items:center;cursor:grab}
.tb:active{cursor:grabbing}
.tb .mk{flex:none;pointer-events:none;display:block}
.tabs{display:flex;flex:none}
.tabs button{position:relative;transition:color .12s}


.tabs button.on:after{content:"";position:absolute;left:7px;right:7px;bottom:-1px;height:1.5px;border-radius:1px;background:#EDEEF0}
.tabs .pd{display:none}
.sp{flex:1}
.ib{display:grid;place-items:center;flex:none;transition:background-color .12s,color .12s}

.ib svg{width:15px;height:15px}

.wal{display:flex;align-items:center;margin-right:2px;flex:none}
.wal .cv{width:12px;height:12px;color:#5F646D}
.wal:hover,.wal.on{color:#EDEEF0}
.wn{display:none}.wn.on{display:inline}.wb[hidden]{display:none}
/* PnL, the live line of this position, Bought / Sold / Holding + Share */
.hero{display:grid;grid-template-columns:1fr auto;align-items:end;column-gap:8px;padding:10px 12px 0}
.p.nopos .hero,.p.min .hero{display:none}
.cp{cursor:pointer;min-width:0}
.hero .k{font-size:11px;line-height:14px;color:#6B7079}
.hv{display:flex;align-items:baseline;gap:6px;margin-top:2px;white-space:nowrap}
.hv .un{display:none!important}
.hv .pn{font-size:20px;line-height:24px;font-weight:600;letter-spacing:-.02em;color:#EDEEF0}
.hv .pp{font-size:12px;font-weight:500;color:#6B7079}
.spk{width:96px;height:28px;margin-bottom:2px;overflow:visible}
.spk path{vector-effect:non-scaling-stroke}
.spk .spl{fill:none;stroke:#37D399;stroke-width:1.25;stroke-linejoin:round;stroke-linecap:round}
.spk .spf{fill:url(#hkSpf);stroke:none}
.hero.loss .spk .spl{stroke:#F0596B}.hero.loss .spk .spf{fill:url(#hkSpfD)}
.spk.no{visibility:hidden}
.shr{flex:none;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;color:#7C818A;box-shadow:inset 0 0 0 1px #24262B}
.shr:hover{color:#EDEEF0;background:#1C1D21}.shr svg{width:13px;height:13px}.shr:disabled{opacity:.5}
/* Buy / Sell */

.p.min .side,.p.min .updb{display:none}
.hd{display:flex;align-items:center;gap:6px}


.rt{margin-left:auto;display:flex;align-items:center;gap:4px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}

.init{flex:none;margin-left:8px}
.init svg{display:none}
.init:hover:not(:disabled){color:#FF8090}.init:disabled{color:#4A3036;cursor:default}
.rail{display:grid;grid-template-columns:repeat(4,1fr)}
button.c{position:relative;height:34px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;line-height:16px;font-weight:600;background:linear-gradient(180deg,#1C1D22,#16171B);box-shadow:inset 0 1px 0 rgba(255,255,255,.065),inset 0 0 0 1px #232429,0 1px 0 rgba(0,0,0,.7),0 2px 5px -2px rgba(0,0,0,.6)}
.rs button.c{height:38px}
button.c .sol{display:none}
button.c sub{display:none}

.rb button.c:hover,.rb button.c:focus-visible{outline:0}
.rs button.c:hover,.rs button.c:focus-visible{outline:0}

.c kbd{display:none;position:absolute;right:5px;bottom:3px;font:500 8.5px/10px HakiInter,HakiGeist,Geist,system-ui,sans-serif;color:#3F4249}
.p.hk .c kbd{display:block}
.rail.off button.c{pointer-events:none}
button.c.busy{overflow:hidden}

button.c.busy:after{content:"";position:absolute;left:-40%;bottom:0;width:40%;height:2px;border-radius:1px;background:currentColor;animation:hkrun .9s linear infinite}
@keyframes hkrun{to{left:100%}}
.set{display:flex;align-items:center;font-weight:500;white-space:nowrap}

.set .gu{display:none}
.set .fast{display:flex;align-items:center;gap:5px}
.adv{margin-left:auto;font-weight:500}
.cus{display:none;gap:6px;margin-bottom:8px}.cus.on{display:flex}
.cus input{flex:1;min-width:0;height:32px;border-radius:8px;border:1px solid #24262B;background:#0D0E10;color:#EDEEF0;padding:0 10px;font:13px HakiInter,HakiGeist,Geist,system-ui,sans-serif;font-variant-numeric:tabular-nums;outline:0}
.cus input:focus{border-color:#4A4D54}
.cus button{width:64px;height:32px;border-radius:8px;background:#37D399;color:#06140D;font-weight:600}
/* switches */
.aut{display:flex;align-items:center;gap:6px;cursor:pointer;flex:none}
.aut input{position:absolute;opacity:0;width:1px;height:1px}
.sw{position:relative;background:#26282D;transition:background-color .15s;flex:none}
.sw:after{content:"";position:absolute;left:2px;top:2px;border-radius:50%;background:#6B7079;transition:transform .15s,background-color .15s}
.aut input:checked+.sw:after{background:#fff}
.aut input:focus-visible+.sw{outline:2px solid rgba(255,255,255,.5);outline-offset:1px}
/* Auto sell / Callout: one quiet row each, open below */


.atg,.ctg{display:flex;align-items:center;gap:4px}
.atg svg,.ctg svg{width:12px;height:12px;transition:transform .15s}
.sa.shut .atg svg,.sc.shut .ctg svg{transform:rotate(-90deg)}
.ast,.cst{margin-left:6px!important;margin-right:auto;color:#5F646D;max-width:120px}.ast.on,.cst.ok{color:#6B7079}.cst.bad{color:#F0596B}
.sa.shut .abody,.sc.shut .cbody{display:none}
.sa:not(.shut),.sc:not(.shut){padding-bottom:10px}
.ar{display:flex;align-items:center;gap:8px;height:30px}
.ar .aut{width:98px;color:#C9CCD1;flex-direction:row}.ar .aut span{order:2}.ar .aut .sw{order:1}
.af{display:flex;align-items:center;gap:4px;color:#6B7079;white-space:nowrap;font-variant-numeric:tabular-nums}
.ar .af:nth-child(2){width:100px;justify-content:flex-end}.af:last-child{margin-left:auto}
.aun{display:inline-block;width:26px;text-align:center}
.ain{width:44px;height:24px;border-radius:6px;border:1px solid #24262B;background:#0D0E10;color:#EDEEF0;padding:0 6px;font:12px HakiInter,HakiGeist,Geist,system-ui,sans-serif;font-variant-numeric:tabular-nums;text-align:right;outline:0}
.ain:focus{border-color:#4A4D54}.ain.bad{border-color:#F0596B}.ain.mc{width:50px}
.aby{all:unset;box-sizing:border-box;height:20px;width:26px;border-radius:5px;border:1px solid #2A2C31;display:inline-flex;align-items:center;justify-content:center;color:#7C818A;font:600 10px HakiInter,HakiGeist,Geist,system-ui,sans-serif;cursor:pointer}
.aby:hover{color:#EDEEF0}.aby.on{color:#EDEEF0;background:#1C1D21}
.ar.off .af{opacity:.45}
.an{display:none}
.crow{display:flex;gap:6px}
.crow input{flex:1;min-width:0;height:32px;border-radius:8px;border:1px solid #24262B;background:#0D0E10;color:#EDEEF0;padding:0 10px;font:12px HakiInter,HakiGeist,Geist,system-ui,sans-serif;outline:0}
.crow input:focus{border-color:#4A4D54}
.cnx{width:32px;height:32px;border-radius:8px;background:#1C1D21;color:#8A8F98;display:grid;place-items:center;flex:none}.cnx:hover{color:#EDEEF0}.cnx[hidden]{display:none}
.cpost{width:64px;height:32px;border-radius:8px;background:#EDEEF0;color:#111215;font-weight:600;flex:none}.cpost:disabled{opacity:.5;cursor:default}
/* 3.16.3 (owner: "the message is too big, the panel grows and feels laggy"): one short line floating next to the panel, it never
   moves the panel; the full text on hover; it goes by itself */
.msg{position:fixed;z-index:1;display:flex;align-items:center;font-size:12px;line-height:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;pointer-events:none;transform-origin:0 0}
.msg:before{content:"";flex:none}
.msg.on{opacity:1;pointer-events:auto}
.msg.ok:before{background:#37D399}.msg.bad:before{background:#F0596B}
.msg span{overflow:hidden;text-overflow:ellipsis}
.set .sl.asl{color:#3DDC97}
.snp{height:22px;margin-left:6px;padding:0 8px;border-radius:7px;background:#1E2029;box-shadow:inset 0 0 0 1px #2A2D39;color:#C9CCD1;font-size:11.5px;font-weight:600}
.snp:hover{color:#fff;background:#252834}
/* 3.25.0 (owner: "the pop-up under the panel is not harmonious"): a status bar under the panel, exactly its width */
.msg{box-sizing:border-box;height:36px;gap:10px;padding:0 8px 0 10px;border-radius:10px;color:#C9CCD1;font:500 12.5px/16px HakiInter,HakiGeist,Geist,system-ui,sans-serif;font-variant-numeric:tabular-nums;transform:translateY(-6px);transition:opacity .16s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.msg.on{transform:none}
.msg:before{width:16px;height:16px;border-radius:50%;box-sizing:border-box;background:none;border:2px solid #3A3E4C;border-top-color:#C9CCD1;animation:hkspin .8s linear infinite}
.msg.ok:before,.msg.bad:before{border:0;animation:none;background-repeat:no-repeat;background-position:center;background-size:16px}
.msg.ok:before{background-color:rgba(61,220,151,.14);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%233DDC97' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 8.2 2 2 4-4.4'/%3E%3C/svg%3E")}
.msg.bad:before{background-color:rgba(255,92,120,.14);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23FF5C78' stroke-width='1.8' stroke-linecap='round'%3E%3Cpath d='m5.5 5.5 5 5m0-5-5 5'/%3E%3C/svg%3E")}
.msg.ok{color:#EDEEF2}.msg.bad{color:#FFC7D0}
.msg span{flex:1;min-width:0}
.msg .rpt{margin:0;box-shadow:inset 0 0 0 1px #2E3240}

@keyframes hkspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.msg:before{animation:none}.msg{transition:opacity .16s ease}}.snp.on{color:#F5A524;box-shadow:inset 0 0 0 1px rgba(245,165,36,.5)}   /* 3.24.0: anti-sandwich slippage in use */
.msg .rpt{flex:none;height:20px;margin-right:-4px;padding:0 8px;border-radius:6px;background:rgba(255,255,255,.06);color:#EDEEF0;font:600 11px/20px HakiInter,HakiGeist,Geist,system-ui,sans-serif;cursor:pointer}
.msg .rpt:hover{background:rgba(255,255,255,.12)}
.updb{display:none;width:calc(100% - 24px);height:28px;margin:0 12px 10px;border-radius:8px;background:#1C1D21;color:#EDEEF0;font-weight:600}.updb.on{display:block}.updb:hover{background:#26282D}
.p>.side:last-of-type,.sc{margin-bottom:0}
/* edit mode: the 8 amounts as fields */
.rail .cw{position:relative;min-width:0}
input.c{width:100%;min-width:0;color:#EDEEF0;font:500 13px HakiInter,HakiGeist,Geist,system-ui,sans-serif;font-variant-numeric:tabular-nums;outline:0;cursor:text}
input.c:focus{border:1px solid #6B7079}input.c.bad{border-color:#F0596B}
.rail .cw i{position:absolute;right:6px;top:50%;transform:translateY(-50%);font-style:normal;font-size:10px;color:#5F646D;pointer-events:none}
/* resize: drag the corner (bigger / smaller, saved) */
/* 3.16.1 (owner: "from the top, bottom, left and right too"): every edge and corner resizes, like a window */
.rh{position:absolute;z-index:3;touch-action:none}
.rh[data-d=n],.rh[data-d=s]{left:12px;right:12px;height:6px;cursor:ns-resize}.rh[data-d=n]{top:0}.rh[data-d=s]{bottom:0}
.rh[data-d=e],.rh[data-d=w]{top:12px;bottom:12px;width:6px;cursor:ew-resize}.rh[data-d=e]{right:0}.rh[data-d=w]{left:0}
.rh[data-d=ne],.rh[data-d=nw],.rh[data-d=se],.rh[data-d=sw]{width:14px;height:14px}
.rh[data-d=ne]{top:0;right:0;cursor:nesw-resize}.rh[data-d=sw]{bottom:0;left:0;cursor:nesw-resize}
.rh[data-d=nw]{top:0;left:0;cursor:nwse-resize}.rh[data-d=se]{bottom:0;right:0;cursor:nwse-resize}
.rh[data-d=se]:after{content:"";position:absolute;right:4px;bottom:4px;width:6px;height:6px;border-right:1.5px solid #3A3D44;border-bottom:1.5px solid #3A3D44;border-bottom-right-radius:2px}
.rh[data-d=se]:hover:after{border-color:#8A8F98}
.p.min .rh,.p.min .xt{display:none}
.xt{display:block;cursor:ns-resize;touch-action:none}
.xt:after{content:"";position:absolute;left:50%;border-radius:2px;transition:background-color .12s}
.xt:hover:after{background:#6B7079}
.p.ext .rail{row-gap:6px}
.p.bsc .shr,.p.bsc .fu,.p.bsc .fu2{display:none}
/* wallets menu */
.wm{position:fixed;width:288px;color:#EDEEF0;font-size:12px;line-height:16px;border-radius:12px;background:#141518;overflow:hidden;
 box-shadow:0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.05),0 24px 56px -12px rgba(0,0,0,.9)}
.wm[hidden]{display:none}
.wmh{display:flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 12px;border-bottom:1px solid #1E1F23;color:#6B7079;font-weight:500}
.wmh b{color:#C9CCD1;font-weight:600}
/* 3.23.0 Paper trading: the switch on top of the wallet menu; when it is on the panel carries an amber line and the wallet button says Paper */
.wmp{display:flex;align-items:center;gap:8px;min-height:44px;padding:6px 12px;border-bottom:1px solid #1E1F23}
.wmpt{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}.wmpt b{color:#EDEEF0;font-weight:600}.wmpt .pbal{color:#F5A524;font-size:11px}.wmpt .pbal:empty{display:none}
.wmp .prs{height:24px;padding:0 8px;border-radius:6px;color:#A9ADB4;font-weight:600}.wmp .prs:hover{background:#1E1F23;color:#EDEEF0}
.p.paper{box-shadow:inset 0 2px 0 #F5A524,0 0 0 1px #2A2D39,0 24px 60px -12px rgba(0,0,0,.85)}
.p.paper .wal .wn{display:none}.p.paper .wal .wb{display:inline!important;color:#F5A524;font-size:0}.p.paper .wal .wb:before{content:"Paper";font-size:12px;font-weight:600}
.p.paper .shr{display:none}
.wmh .sp{flex:1}
.wmh button{height:24px;padding:0 6px;border-radius:6px;color:#A9ADB4;font-weight:600}.wmh button:hover{background:#1E1F23;color:#EDEEF0}
.wml{max-height:300px;overflow-y:auto}
.wml .wmh{border:0}
.wr{position:relative;display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 12px;cursor:pointer}
.wr+.wr{box-shadow:inset 0 1px 0 #1A1B1F}
.wr:hover{background:rgba(255,255,255,.025)}
.wr input{position:absolute;opacity:0;width:1px;height:1px}
.wr .ck{width:16px;height:16px;border-radius:5px;box-shadow:inset 0 0 0 1.5px #34363C;flex:none;display:grid;place-items:center}
.wr input:checked+.ck{box-shadow:none}
.wr input:checked+.ck:after{content:"";width:8px;height:4px;border:2px solid #111215;border-top:0;border-right:0;transform:translateY(-1px) rotate(-45deg)}
.wr input:focus-visible+.ck{outline:2px solid rgba(255,255,255,.5);outline-offset:1px}
.wr .wl{display:flex;flex-direction:column;min-width:0}
.wr .wl b{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wr .wl i{font:500 10.5px/14px ui-monospace,"Cascadia Mono",Consolas,monospace;font-style:normal;color:#555A62}
.wr .ws{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;white-space:nowrap;font-variant-numeric:tabular-nums}
.wr .ws b{display:flex;align-items:center;gap:4px;font-weight:600}
.wr .ws small{font-size:11px;line-height:14px;color:#6B7079;font-weight:500}.wr .ws small em{font-style:normal;color:#C9CCD1}
.wr .ws.lk{color:#F5A524;font-size:11px}
.wr.off .wl b,.wr.off .ws b{color:#7C818A}
.wr .rd{display:none;width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1.5px #34363C;flex:none}
.wm.pick .wr .ck{display:none}.wm.pick .wr .rd{display:block}
.wm.pick .wr.tgt .rd{box-shadow:inset 0 0 0 5px #EDEEF0}
.wm.pick .wr.tgt{background:rgba(255,255,255,.04)}
.wmf{display:flex;align-items:center;gap:2px;height:40px;padding:0 12px 0 6px;border-top:1px solid #1E1F23}
.wmf button{height:26px;padding:0 6px;border-radius:6px;font-weight:600;color:#A9ADB4;display:flex;align-items:center;gap:5px}
.wmf button:hover{background:#1E1F23;color:#EDEEF0}.wmf button svg{width:13px;height:13px}
.wmf .tot{margin-left:auto;display:flex;align-items:center;gap:4px;font-weight:600;font-variant-numeric:tabular-nums}.wmtot{display:flex;align-items:center;gap:4px}.wmf .tot span{color:#5F646D;font-weight:500;margin-right:2px}
.wmx{padding:10px 12px;border-top:1px solid #1E1F23;color:#A9ADB4;line-height:16px}
.wmx[hidden]{display:none}
.wm.bsc .wmc,.wm.bsc .wms,.wm.bsc .wma,.wm.bsc .wmb{display:none}
.wmx b{color:#EDEEF0;font-weight:600}
.wmx .row{display:flex;gap:6px;margin-top:8px}
.wmx .row button{flex:1;height:30px;border-radius:8px;font-weight:600;background:#1E1F23;color:#C9CCD1}
.wmx .row .go{background:#EDEEF0;color:#111215}.wmx .row .go:disabled{opacity:.4;cursor:default}
/* Trading settings (click the preset that is on) */
.pw{position:fixed;width:320px;color:#EDEEF0;font-size:12px;line-height:16px;border-radius:12px;background:#141518;padding:14px;
 box-shadow:0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.05),0 24px 56px -12px rgba(0,0,0,.9)}
.pw[hidden]{display:none}
.pwh{display:flex;align-items:center;margin-bottom:12px}.pwt{font-size:13px;font-weight:600}
.pwx{margin-left:auto;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;color:#7C818A}.pwx:hover{background:#1E1F23;color:#EDEEF0}
.seg{display:grid;gap:2px;padding:2px;border-radius:8px;background:#0D0E10;box-shadow:inset 0 0 0 1px #1E1F23;margin-bottom:8px}.seg3{grid-template-columns:repeat(3,1fr)}.seg2{grid-template-columns:1fr 1fr}
.seg button{height:26px;border-radius:6px;color:#6B7079;font-weight:600}.seg button:hover{color:#EDEEF0}
.seg button.on{background:#232429;color:#EDEEF0;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}.seg2 button.on.b{color:#37D399}.seg2 button.on.s{color:#F0596B}
.pwf{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px}
.fld{display:flex;flex-direction:column;gap:4px;cursor:text;min-width:0}
.fi{display:flex;align-items:center;height:36px;border-radius:8px;background:#0D0E10;border:1px solid #24262B;padding:0 8px}
.fi:focus-within{border-color:#6B7079}.fi.bad{border-color:#F0596B}
.fi input{flex:1;width:0;min-width:0;background:none;border:0;outline:0;color:#EDEEF0;font:600 13px HakiInter,HakiGeist,Geist,system-ui,sans-serif;font-variant-numeric:tabular-nums;text-align:center}
.fi i{font-style:normal;color:#5F646D;font-size:11px;margin-left:4px}
.fl{font-size:11px;color:#6B7079;text-align:center}
.pwn{margin-top:10px;font-size:11.5px;line-height:16px;color:#7C818A}.pwn b{color:#EDEEF0;font-weight:500}.pwn .w{color:#F5A524}
.pwd{width:100%;height:34px;margin-top:12px;border-radius:8px;background:#EDEEF0;color:#111215;font-weight:600}.pwd:hover{background:#fff}
/* Share PnL card */
.shm{position:fixed;inset:0;display:grid;place-items:center;background:rgba(5,6,8,.62);backdrop-filter:blur(2px)}
.shm[hidden]{display:none}
.shf{width:818px;height:782px;border:0;background:transparent;color-scheme:dark;transform-origin:center}
/* ===== 3.18.2 (owner: "a bit dark, lighter"): surfaces one step lighter. 3.18.1 (owner: "like Axiom, but not stolen"): Axiom's proven layout, HAKI's own look. HAKI's font (Medeo Sans), HAKI blue from the
   colours: neutral graphite, HAKI red once (the chosen preset; the logo's eye), keys with a coloured base line instead of pills, a wide PnL cell leading the stats bar ===== */
.p{width:314px;font-family:HakiInter,HakiGeist,Geist,system-ui,sans-serif;font-size:13px}
/* 3.19.1 (owner: "the text is not sharp"): Geist for every UI text (Medeo is a display face: soft at 10-13 px); Medeo only for the Buy / Sell titles */
.lb{font-family:HakiInter,HakiGeist,Geist,system-ui,sans-serif}
.p button,.p input{font-family:inherit}
.num,.n,.rt,.set b,.hero .v2{font-family:HakiInter,HakiGeist,Geist,system-ui,sans-serif}


.tabs{align-self:center;gap:0}

.tabs button:hover{color:#fff}

.tabs button.on:after{display:none}
.ib{width:28px;height:28px;border-radius:8px;color:#8A91A5}
.ib:hover{background:#1E2029;color:#fff}
.ib.acc,.edt.on{color:#fff;background:#2B2E3A}
.wal{color:#fff}
.wal svg{color:#C9CDD8}
.wal .cv{display:none}
.tb .wb{display:none}
.smode{display:flex;align-items:center;gap:4px;margin-left:6px;padding:0 7px;color:#C9CDD8}
.smode:hover{color:#fff;background:#252834}.smode .sol{width:13px;height:13px}.smode svg:last-child{color:#8A91A5}   /* 3.18.3 (owner: the minimise button stuck out): the balance is already next to Buy; the header shows the wallet count only */
.tb>*{flex-shrink:0}.tb .sp{flex-shrink:1;min-width:0}
.wal:hover,.wal.on{background:#252834;box-shadow:inset 0 0 0 1px #474B5C}
.side{border-top:0}
.ss{padding-top:4px}

.lb{color:#fff}
.ccy{display:flex;margin-left:6px;padding:0;background:none;box-shadow:none}
.ccy span{display:flex;align-items:center;gap:5px}

.rt{color:#8A91A5}.rt b{color:#fff}


button.c,.rs button.c{letter-spacing:0}


.rb button.c:hover,.rb button.c:focus-visible{background:#16342A;box-shadow:inset 0 0 0 1px #22A673,inset 0 -2px 0 #3DDC97;color:#5BF0B2}
.rs button.c:hover,.rs button.c:focus-visible{background:#3A1A22;box-shadow:inset 0 0 0 1px #C2384F,inset 0 -2px 0 #FF5C78;color:#FF7A92}
button.c small{display:block;font-family:HakiInter,HakiGeist,Geist,system-ui,sans-serif}
.p.hk .rail .c kbd{display:block;right:auto;bottom:auto;letter-spacing:0}   /* 3.20.5: your hotkey letter */
.p.hk .rail.off .c kbd{display:none}
.rail.off button.c{color:#474B5C;background:#191B23;box-shadow:inset 0 0 0 1px #242733}
.rail.off button.c small{color:#3A3E4C}
.rb button.c.busy{background:#16342A}.rs button.c.busy{background:#3A1A22}
input.c{height:40px;border-radius:10px;text-align:center;padding:0 18px 0 8px;background:#12141B;border:1px dashed #474B5C}
.set{color:#8A91A5}
.set>span,.set .fast{display:flex;align-items:center;gap:5px}
.set svg{flex:none}
.set b{font-weight:500}
.set .fast.no svg{color:#5A6178}
.adv{color:#C9CDD8}.adv:hover{color:#fff}

.sa,.sc{margin:4px 12px 0;border-top:1px solid #2A2D39}
.sc{margin-top:0}


.aut input:checked+.sw{background:#2FBF86}
.hero,.p.nopos .hero{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:0;align-items:stretch;column-gap:0}
.p.min .hero{display:none}
.hero .spk{display:none}
.hero .fc{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-width:0}

.hero .v2{display:flex;align-items:center;gap:4px;line-height:16px;color:#fff;white-space:nowrap;max-width:100%;overflow:hidden}
.hero .cp .v2{line-height:20px}
.hero .hv .un,.hero .v2 .un{display:inline-flex!important}
.hero .un .sol{width:14px;height:14px}
.hero .k2{line-height:13px;font-weight:500;letter-spacing:0}
.hero .pn{font-size:inherit;line-height:inherit;letter-spacing:-.01em;font-weight:600;color:#fff}
.hero .k2 .pp{font-weight:600;margin-left:3px;color:#8A91A5}
.hero .cp{cursor:pointer}
/* 3.20.1 (owner: Share squeezed at the edge, an empty strip under the stats): Share sits next to the PnL label, the grabber lies on the
   panel's bottom edge instead of a row of its own */
.hero .k2{display:flex;align-items:center;width:100%}
.hero .shr{margin-left:auto;width:20px;height:18px;border-radius:5px;box-shadow:none;color:#8A91A5;display:grid;place-items:center}.hero .shr svg{width:12px;height:12px}.hero .shr:hover{background:#1E2029;color:#fff}
.p{padding-bottom:0}
.hero{border-radius:0 0 14px 14px}
.xt{position:absolute;left:50%;bottom:0;width:64px;height:10px;margin-left:-32px;z-index:4}.xt:after{top:auto;bottom:3px;height:3px;width:28px;margin-left:-14px}
.xt:after{background:#3A3E4C}
.wm,.pw{background:#161821;box-shadow:0 0 0 1px #2A2D39,0 24px 56px -12px rgba(0,0,0,.9);font-family:HakiInter,HakiGeist,Geist,system-ui,sans-serif}
.wr input:checked+.ck{background:#fff}.wr input:checked+.ck:after{border-color:#161821}
.msg{background:#1E2029;box-shadow:0 0 0 1px #343848,0 12px 28px -8px rgba(0,0,0,.8)}
/* 3.20.0 (owner: "smooth"): the panel is its own layer (its updates never re-layout the page), menus fade in, keys answer at once */
.p,.wm,.pw{contain:layout paint style}
.p{will-change:transform}
.wm:not([hidden]),.pw:not([hidden]){animation:hkpop .14s cubic-bezier(.2,.8,.2,1)}
@keyframes hkpop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.abody,.cbody{animation:hkfold .16s cubic-bezier(.2,.8,.2,1)}
@keyframes hkfold{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
button.c{transition:background-color .1s,box-shadow .1s,color .1s,transform .06s}
button.c:active{transform:translateY(1px) scale(.985)}
.tabs button,.ib,.wal,.smode,.adv{transition:background-color .12s,color .12s,box-shadow .12s}
.sw,.sw:after{transition:background-color .15s,transform .15s cubic-bezier(.2,.8,.2,1)}
.hero .pn,.hero .v2{transition:color .25s}
@media (prefers-reduced-motion:reduce){.wm:not([hidden]),.pw:not([hidden]),.abody,.cbody{animation:none}}
@media (prefers-reduced-motion:reduce){button.c{transition:none}button.c:active{transform:none}button.c.busy:after{animation:none;left:0;width:100%;opacity:.5}}
/* 3.27.0 glass look (owner reference): near-black panel, outlined header groups, glass keys with a coloured lower edge, lighter weights */
.p{border-radius:14px;background:linear-gradient(180deg,#15181D 0,#0C0E13 34%,#090B0F 100%);box-shadow:0 0 0 1px #2B2D33,0 24px 60px -18px rgba(0,0,0,.9)}
.tb{gap:4px;background:transparent;border-bottom:1px solid rgba(255,255,255,.055)}

.tb .sp{display:none}
.tb .ib{width:26px;height:26px}
.tb .edt{margin-left:auto}
.tb .mn{width:18px}
.tb .kbt{height:21px;border-radius:7px;background:rgba(255,255,255,.015);box-shadow:inset 0 0 0 1px rgba(255,255,255,.11);color:#C3C7D2}
.tabs{padding:2px;border-radius:8px;background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.tabs button{height:19px;border-radius:6px;font-weight:500;color:#A3A7B3}
.tabs button.on{background:#D42443;color:#fff;box-shadow:none}
.tb .edt,.tb .cfg{color:#B5BAC6}
.wal{height:21px;margin:0;gap:5px;border-radius:7px;background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.11);font-weight:500}
.wal svg{width:13px;height:13px}
.side{padding:6px 12px 0}
.hd{height:22px;margin-bottom:5px}
.lb{font-weight:600;letter-spacing:0}
.ccy span{height:19px;padding:0 8px 0 4px;border-radius:10px;background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);font-weight:500;color:#C3C7D2}
.ccy .sol{width:12px;height:12px}
.smode{height:19px;border-radius:6px;background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);font-size:10.5px;font-weight:500}


.rt b.bal{font-weight:600}
.rt .sol{width:12px;height:12px}
.init{font-weight:500;color:#F0506A}
.rail{gap:8px;margin-bottom:2px}
button.c,.rs button.c{height:var(--kh,33px);border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.05) 0,rgba(255,255,255,.03) 60%,color-mix(in srgb,var(--k) 8%,transparent) 100%)}
.rb button.c{color:#3DDC97;--k:#2FD28A}
.rs button.c{color:#F0506A;--k:#E23A55}
.rs button.c span{line-height:14px}
button.c small{line-height:11px;color:#A5AEBF}
.rb button.c:hover{background:color-mix(in srgb,#2FD28A 12%,transparent);box-shadow:inset 0 0 0 1px rgba(47,210,138,.45),inset 0 -1.5px 0 #2FD28A,0 6px 14px -6px #2FD28A;color:#5BF0B2}
.rs button.c:hover{background:color-mix(in srgb,#E23A55 12%,transparent);box-shadow:inset 0 0 0 1px rgba(226,58,85,.45),inset 0 -1.5px 0 #E23A55,0 6px 14px -6px #E23A55;color:#FF7A92}
.p.hk .rail .c kbd{left:7px;top:5px;font:500 8px/9px HakiInter,HakiGeist,Geist,system-ui,sans-serif;color:#6E7180}
.set{height:24px;gap:12px}

.set b{color:#DADDE5}
.sa{margin-top:2px;border-top:1px solid rgba(255,255,255,.06);padding-top:0}
.sc{border-top:1px solid rgba(255,255,255,.06);padding-top:0}
.sa .hd,.sc .hd{height:21px;margin:0}
.atg,.ctg{font-weight:500;color:#E3E5EB}
.atg svg,.ctg svg{color:#7A7F8C}
.aut{font-weight:400;color:#AEB2BC}
.hero,.p.nopos .hero{margin-top:3px;background:#0D0F14;border-top:1px solid rgba(255,255,255,.07);border-radius:0 0 14px 14px}
.hero .fc{height:44px;padding:0 12px}
.hero .fc+.fc{box-shadow:inset 1px 0 0 rgba(255,255,255,.07)}
.hero .v2{font-weight:500}


.hero .k2{color:#8A8F9C}
.sa,.sc{padding:0}
.set b.asl{color:#3DDC97}
.set svg{width:13px;height:13px}
.hero .fc:not(.cp){align-items:center}
.xt,.rh{opacity:0;transition:opacity .15s}
.p:hover .xt,.p:hover .rh{opacity:1}

/* 3.27.1 closer to the owner reference: Inter, reference text sizes, header positions, smaller switches */
.side .num,.side .n,.hero .num,.hero .n,button.c{font-variant-numeric:normal}
.tabs button{font-size:10.5px}
.lb{font-size:12px}
.ccy span{font-size:10px}

button.c,.rs button.c{font-size:12px;font-weight:600}
button.c small{font-weight:500}
.set{font-size:9px}
.rt{font-size:9px}.rt b{font-size:10px;font-weight:600}
.init{font-size:9px}
.atg,.ctg{font-size:9.5px}
.aut{font-size:10px}
.hero .k2,.hero .k2 .pp{font-size:8.5px}
.hero .v2{font-size:10px}
.hero .cp .v2{font-size:12.5px}
.rb button.c{font-size:11px}


.rt b.bal{font-size:10.5px}
.hero .k2{font-size:8px}.hero .k2 .pp{font-size:9px}
.hero .fc:not(.cp) .v2,.hero .fc:not(.cp) .v2 *{font-weight:500}
.tb{padding:0 6px 0 16px}
.tb .mk{width:18px;height:18px;margin-right:10px}
.tb .kbt{width:25px}
.tabs{margin:0}
.tb .edt{margin-right:2px}
.wal{padding:0 6px;margin-left:5px;font-size:10px}
.tb .mn{margin-left:-2px}
.set svg{color:#C3C7D2}
.set .fast svg{color:#3DDC97}
.tb{height:39px}
.tabs button{padding:0 7.5px}

button.c small{font-size:8px}
.rb button.c{padding-top:3px}
button.c,.rs button.c{box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),inset 0 -1.5px 0 color-mix(in srgb,var(--k) 50%,transparent),0 3px 6px -5px var(--k)}
.sw{width:21px;height:12px;border-radius:6px}
.sw:after{width:8px;height:8px}
.aut input:checked+.sw:after{transform:translateX(9px)}
.rs button.c{font-size:10.5px}
.hero .cp .v2{font-weight:700}
.hero .fc:not(.cp) .k2{width:auto;justify-content:center}   /* label and number on one axis (owner) */
.hero .fc{gap:0}.hero .k2{line-height:11px}
.hero .fc .k2{height:14px;align-items:center}.hero .fc .v2{height:22px;align-items:center}.hero .shr{height:14px}
.hero .k2,.hero .k2 .pp{font-size:10.5px}.hero .k2{color:#9499A6}.hero .fc:not(.cp) .v2,.hero .fc:not(.cp) .v2 *{font-size:13px;font-weight:600}.hero .cp .v2{font-size:16px}.hero .cp .k2{position:relative;top:1px}.hero .cp .v2{position:relative;top:-1px}   /* 3.27.3 (owner: footer text too small to read) */   /* 3.27.3: every cell has the label line and the number line at the same heights, so the four cells read as two straight rows */.hero .fc:not(.cp) .v2{justify-content:center;text-align:center}   /* 3.27.2: label sits close above the number, as in the reference */
/* 3.27.5: wallet amounts in two columns (numbers right-aligned, units in one column); address copies on click; hotkeys on / off readable; crisp logo */
.wr .ws{display:grid;grid-template-columns:auto 34px;column-gap:5px;align-items:center;justify-items:start}
.wr .ws .wv{justify-self:end}
.wr .ws b.wu{display:flex;align-items:center}
.wr .ws small.wv{color:#C9CCD1}
.wr .ws.lk{display:block}
.wmf button{padding:0 3px;gap:4px;font-size:11.5px}.wmf{gap:2px}.wmf .tot{min-width:0;flex:none}.wmf .tot span{margin-right:0}   /* the bottom bar fits again, so the total lines up with the rows */
.wmtot{display:inline-grid!important;grid-template-columns:auto 34px;column-gap:5px;align-items:center;justify-items:start}   /* total: number and coin mark in the same columns as the rows */
.wr .wcp{cursor:copy;border-radius:4px;transition:color .12s}
.wr .wcp:hover{color:#C9CDD8;text-decoration:underline;text-underline-offset:2px}
.wr .wcp.cpd{color:#3DDC97}
.tb .kbt{color:#6E7380}
.tb .kbt.acc{color:#3DDC97;background:rgba(47,210,138,.14);box-shadow:inset 0 0 0 1px rgba(47,210,138,.6)}
.tb .kbt:hover{color:#E3E5EB}
.tb .kbt.acc:hover{color:#5BF0B2}
.p.paper .wal svg{display:none}.p.paper .wal .wb:before{font-size:10.5px}.p.paper .wal{padding:0 7px}   /* 3.27.6: "Paper" fits the header */
.tb{height:41px}   /* 40 inside the 1px line: the 18px logo sits on whole pixels */
</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="hkSg" x1="6" y1="26" x2="26" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient>
<linearGradient id="hkSpf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#37D399" stop-opacity=".18"/><stop offset="1" stop-color="#37D399" stop-opacity="0"/></linearGradient>
<linearGradient id="hkSpfD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0596B" stop-opacity=".16"/><stop offset="1" stop-color="#F0596B" stop-opacity="0"/></linearGradient></defs></svg>
<div class="p" hidden>
 <div class="tb">
  <img class="mk" src="${chrome.runtime.getURL('icons/mark-18.png')}" srcset="${[[18, 1], [23, 1.25], [27, 1.5], [36, 2], [54, 3]].map(([n, x]) => chrome.runtime.getURL('icons/mark-' + n + '.png') + ' ' + x + 'x').join(', ')}" width="18" height="18" alt="HAKI" draggable="false">
  <button class="ib kbt" title="Hotkeys: hold Space, then Q W E R to buy, A S D F to sell" aria-label="Hotkeys">${I.kb}</button>
  <div class="tabs" role="tablist" aria-label="Presets"><button data-p="0">${I.p[0]}P1</button><button data-p="1">${I.p[1]}P2</button><button data-p="2">${I.p[2]}P3</button></div>
  <button class="ib edt" title="Edit the buy and sell amounts" aria-label="Edit amounts">${I.pen}</button>
  <span class="sp"></span>
  <button class="ib cfg" title="Settings" aria-label="Settings">${I.gear}</button>
  <button class="wal num" title="Wallets: choose which ones trade" aria-label="Wallets" aria-haspopup="menu" aria-expanded="false">${I.wal}<span class="wn"></span><span class="wb">–</span><svg class="cv" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 6.5 3.5 3.5 3.5-3.5"/></svg></button>
  <button class="ib mn" title="Minimise" aria-label="Minimise">${I.min}</button>
 </div>
 <section class="side sb">
  <div class="hd"><span class="lb">Buy</span><span class="ccy"><span>${SOLI}SOL</span></span><button class="snp" type="button" hidden>Snipe</button><span class="rt num"><b class="bal">–</b>${SOLI}</span></div>
  <div class="rail rb"></div>
  <div class="set"><span title="Slippage">${I.slip}<b class="num sl">–</b></span><span title="Priority fee + bribe, SOL">${I.gas}<b class="num fe">–</b></span><span class="gu num fu"></span><span class="fast" title="">${I.fast}<b>Fast</b></span><button class="adv" aria-expanded="false">Custom</button></div>
  <div class="cus"><input class="amt" inputmode="decimal" placeholder="Amount in SOL" aria-label="Buy amount in SOL"><button class="cgo">Buy</button></div>
 </section>
 <section class="side ss">
  <div class="hd"><span class="lb">Sell</span><button class="smode" aria-label="Sell by % or by SOL amount">%</button><span class="rt num pos">No position</span><button class="init" disabled title="Sell what you put in, keep the rest">${I.bolt}Initials</button></div>
  <div class="rail rs off"></div>
  <div class="set"><span title="Slippage">${I.slip}<b class="num sl">–</b></span><span title="Priority fee + bribe, SOL">${I.gas}<b class="num fe">–</b></span><span class="gu num fu2"></span><span class="fast" title="">${I.fast}<b>Fast</b></span></div>
 </section>
 <section class="side sa shut">
  <div class="hd"><button class="atg" aria-expanded="false" title="For every coin in your trading wallets, against your average entry. Each rule once per position. Runs while Chrome is open.">Auto sell${I.chev}</button><span class="rt ast"></span><label class="aut" title="Safe trade: when the coin does 2x, sell what you put in (the rest rides for free)"><span>Safe 2x</span><input type="checkbox" class="asf"><i class="sw"></i></label></div>
  <div class="abody">
   <div class="ar"><label class="aut"><input type="checkbox" class="atp"><i class="sw"></i><span>Take profit</span></label><span class="af"><span class="apx">at +</span><input class="ain" data-k="tp.at" aria-label="Take profit at, %"><button type="button" class="aby" data-k="tp" title="Switch: % from your entry or market cap">%</button></span><span class="af">sell<input class="ain" data-k="tp.pct" inputmode="decimal" aria-label="Take profit sells, %">%</span></div>
   <div class="ar"><label class="aut"><input type="checkbox" class="asl"><i class="sw"></i><span>Stop loss</span></label><span class="af"><span class="apx">at −</span><input class="ain" data-k="sl.at" aria-label="Stop loss at, %"><button type="button" class="aby" data-k="sl" title="Switch: % from your entry or market cap">%</button></span><span class="af">sell<input class="ain" data-k="sl.pct" inputmode="decimal" aria-label="Stop loss sells, %">%</span></div>
   <div class="ar"><label class="aut" title="Trailing stop: sells when the price falls this far from its highest point since you bought (after it was in profit)"><input type="checkbox" class="atr"><i class="sw"></i><span>Trailing</span></label><span class="af" title="from the highest price">at −<input class="ain" data-k="tr.at" inputmode="decimal" aria-label="Trailing stop, % below the highest price"><span class="aun">%</span></span><span class="af">sell<input class="ain" data-k="tr.pct" inputmode="decimal" aria-label="Trailing stop sells, %">%</span></div>
   <div class="an">For every coin in your trading wallets, against your average entry. Each rule once per position. Runs while Chrome is open.</div>
  </div>
 </section>
 <section class="side sc">
  <div class="hd"><button class="ctg" aria-expanded="true">Callout${I.chev}</button><span class="rt cst"></span><label class="aut" title="Post a callout by itself after your buy through this panel (from the amount in Settings)"><span>Auto</span><input type="checkbox" class="cau"><i class="sw"></i></label></div>
  <div class="cbody"><div class="crow"><input class="cth" maxlength="2000" placeholder="Write your callout" aria-label="Callout text"><button class="cnx" title="Another of your texts" aria-label="Another text">${I.shuffle}</button><button class="cpost">Post</button></div></div>
 </section>
 <div class="hero">
  <svg class="spk no" viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true"><path class="spf"/><path class="spl"/></svg>
  <div class="fc cp" title="Click: SOL / USD"><span class="k2">PnL <span class="pp num">+0%</span><button class="shr" title="Share PnL: a HAKI card of this trade (PNG, copy, X)" aria-label="Share PnL">${I.share}</button></span><span class="v2 hv"><i class="un">${SOLI}</i><span class="pn">+0</span></span></div>
  <div class="fc fh"><span class="k2">Holding</span><span class="v2"><span class="ph">0</span></span></div>
  <div class="fc fb"><span class="k2">Bought</span><span class="v2"><b class="pb">0</b></span></div>
  <div class="fc fs"><span class="k2">Sold</span><span class="v2"><b class="ps">0</b></span></div>
 </div>
 <button class="updb" title="A new HAKI Strike version is ready. Applying it locks the wallets: type the password once after.">Update ready · apply now</button>
 <button class="xt" title="Drag the bottom edge down (or click): a second row of buy and sell buttons. Up: one row" aria-label="More buttons"></button>
 ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => '<i class="rh" data-d="' + d + '" title="Drag: wider / taller" aria-hidden="true"></i>').join('')}
 </div>
<div class="msg" role="status" aria-live="polite"></div>
<div class="shm" hidden><iframe class="shf" title="Share PnL" allow="clipboard-write"></iframe></div>
<div class="wm" hidden role="menu" aria-label="Wallets">
 <div class="wmp"><span class="wmpt"><b>Paper trading</b><span class="pbal num"></span></span><button class="prs" type="button" title="Start again with 10 SOL and 1 BNB of play money">Reset</button><label class="aut" title="Practice on live prices with play money: nothing is signed or sent"><input type="checkbox" class="ppr" aria-label="Paper trading"><i class="sw"></i></label></div>
 <div class="wmh">Trade with<b class="wmt"></b><span class="sp"></span><button class="wma" title="Tick every wallet">All</button><button class="wmb" title="Tick the wallets that hold SOL">With SOL</button></div>
 <div class="wml"></div>
 <div class="wmx" hidden></div>
 <div class="wmf"><button class="wmc" title="Move the SOL of your other wallets into one">${I.con}Consolidate</button><button class="wms" title="Share one wallet's SOL evenly with the ticked wallets">${I.spl}Split</button><button class="wmg" title="Add or remove wallets" aria-label="Add or remove wallets">${I.plus}</button><span class="tot num"><span>Total</span><b class="wmtot">–</b></span></div>
</div>
<div class="pw" hidden role="dialog" aria-label="Trading settings">
 <div class="pwh"><span class="pwt">Trading settings</span><button class="pwx" aria-label="Close">${I.x}</button></div>
 <div class="seg seg3"><button data-pp="0">Preset 1</button><button data-pp="1">Preset 2</button><button data-pp="2">Preset 3</button></div>
 <div class="seg seg2"><button data-ps="b" class="b">Buy settings</button><button data-ps="s" class="s">Sell settings</button></div>
 <div class="pwf">
  <label class="fld"><span class="fi"><input class="fsl" inputmode="decimal" aria-label="Slippage, %"><i>%</i></span><span class="fl">Slippage</span></label>
  <label class="fld"><span class="fi"><input class="fpr" inputmode="decimal" aria-label="Priority fee, SOL"></span><span class="fl">Priority, SOL</span></label>
  <label class="fld"><span class="fi"><input class="ftp" inputmode="decimal" aria-label="Bribe (tip), SOL"></span><span class="fl">Bribe, SOL</span></label>
 </div>
 <div class="pwn"></div>
 <button class="pwd">Done</button>
</div>`;
  const $ = s => R.querySelector(s), $$ = s => [...R.querySelectorAll(s)], P = $('.p'), S = $('.msg');
  let lastT = 0, C = null, A = null, busy = false, last = null, usdView = false, bal = null;

  /* the toast: the first part of the message (what happened), the rest in its tooltip; under the panel, or above it near the bottom */
  let sT = 0;
  const zNow = () => { try { return Z; } catch (_) { return 1; } };   /* Z is declared further down */
  const toastAt = () => { const r = P.getBoundingClientRect(); if (!r.width) return; const Z = zNow(), h = 36 * Z, below = r.bottom + 8 + h < innerHeight - 4;
    S.style.left = r.left / Z + 'px'; S.style.width = S.style.maxWidth = r.width / Z + 'px'; S.style.top = (below ? r.bottom + 8 : r.top - 8 - h) / Z + 'px'; };
  const status = (t, k) => {
    clearTimeout(sT); S.title = t || '';
    if (!t || P.hidden) { S.className = 'msg' + (k ? ' ' + k : ''); return; }
    const short = String(t).split(' · ')[0].replace(/\s*\((?:sent|ready|not ready|quoted)[^)]*\)/g, '').replace(/;.*$/, '');
    S.innerHTML = '<span></span>'; S.firstChild.textContent = short; S.className = 'msg on' + (k ? ' ' + k : '');
    if (k === 'bad') { const b = document.createElement('button'); b.className = 'rpt'; b.type = 'button'; b.textContent = 'Report'; b.title = 'Tell HAKI about this problem';
      b.onclick = e => { e.stopPropagation(); if (e.isTrusted) send('openSettings', { report: String(t).slice(0, 300) }); }; S.appendChild(b); }   /* 3.22.0 */
    toastAt();
    sT = setTimeout(() => { S.classList.remove('on'); }, k === 'ok' ? 3500 : k === 'bad' ? 8000 : 20000);
  };
  let nBuy = 0, selling = false;   /* buys run side by side (every click is a buy); a sell blocks the sell buttons until it is back */
  const lock = () => { busy = selling || nBuy > 0; for (const b of $$('.rs button.c, .init')) b.disabled = selling; };
  const pre = () => (C && C.presets && C.presets[C.preset || 0]) || { slip: 20, prio: 0.0001, tip: 0.0003 };
  function aslipPaint() {   /* 3.24.0 anti-sandwich: the slippage the next buy / sell will use, from this coin's real moves (your preset is the most) */
    const sl = $$('.sl'), A2 = last && last.aslip, on = C && C.autoSlip !== false && !PAPER;
    [['b', 0], ['s', 1]].forEach(([k, i]) => { const e = sl[i]; if (!e) return; const v = on && A2 && A2[k];
      if (v) { const t = (+v).toFixed(1).replace(/\.0$/, '') + '%'; if (e.textContent !== t) e.textContent = t; e.classList.add('asl'); e.parentElement.title = 'Anti-sandwich slippage ' + t + ': set from how this coin really moves between a click and its block. Your preset is the most it can be (Settings → Speed and fees)'; }
      else if (e.classList.contains('asl')) { e.classList.remove('asl'); e.parentElement.title = 'Slippage'; } });
  }
  function paintSet() { paintSet0(); aslipPaint(); }
  function paintSet0() {
    const p = pre(), fee = (+p.prio || 0) + (+p.tip || 0), sfee = (+(p.sprio ?? p.prio) || 0) + (+(p.stip ?? p.tip) || 0);
    const sl = $$('.sl'), fe = $$('.fe');
    const ssl = +(p.sslip ?? p.slip);
    sl[0].textContent = +p.slip + '%'; fe[0].textContent = s4(fee);
    if (sl[1]) { sl[1].textContent = ssl + '%'; fe[1].textContent = s4(sfee); }
    $('.fu').textContent = last && last.usd ? '$' + (fee * last.usd).toFixed(2) : '';
    $('.fu2').textContent = last && last.usd ? '$' + (sfee * last.usd).toFixed(2) : '';
    $$('.fast').forEach((e, i) => { const tp = i ? +(p.stip ?? p.tip) : +p.tip, pr = i ? +(p.sprio ?? p.prio) : +p.prio;
      e.classList.toggle('no', !(tp >= 0.000005)); e.title = tp >= 0.000005 ? 'Sent through Helius Sender (Jito and the other fast lanes) with a ' + tp + ' SOL bribe, priority fee ' + pr + ' SOL' : 'No bribe: sent to the node only'; });
    $$('.tabs button').forEach((b, i) => b.classList.toggle('on', i === (C.preset || 0)));
    if (BSCM()) {   /* 3.14.1: BSC slippage and gas (settings → BSC wallet) */
      const g = +C.bscGwei || 0; sl.forEach(x => { x.textContent = (+C.bscSlip || 15) + '%'; }); fe.forEach(x => { x.textContent = g ? g + ' gwei' : 'auto'; });
      $$('.fast').forEach(e => { e.classList.remove('no'); e.title = 'Sent to the private BSC relays at once (48 Club, BlockRazor, bloXroute, PancakeSwap, Merkle, Jetbldr): no public mempool, no sandwich'; });
    }
  }

  /* live position from the background worker (pump.fun curve over a WebSocket; ~every block) */
  let port = null;
  function connect() {
    try { port = chrome.runtime.connect({ name: 'live' }); } catch (_) { port = null; return; }
    port.onMessage.addListener(m => { if (!m) return; if (m.sigDone) { const f = SIGW.get(m.sigDone); if (f) f(); return; }
      if (m.snipe) { const z = m.snipe; status(z.msg, z.st === 'sent' || z.st === 'sim' ? 'ok' : z.st === 'error' ? 'bad' : ''); if (z.st === 'sent') window.hkSound('buy'); if (z.st !== 'armed') { SNP.delete(z.mint); snpPaint(); } return; } if (m.upd) showUpd(m.upd); if (m.auto) autoNews(m.auto); if (m.bal != null && !PAPER) { bal = m.bal; paintBal(); } if (m.callout) { status('Auto callout: ' + m.callout.text, m.callout.ok ? 'ok' : 'bad'); cCheck(); } if ((m.mint || m.raw != null) && !PAPER) paintPos(m); });
    port.onDisconnect.addListener(() => { port = null; setTimeout(() => { connect(); watchNow(); }, 600); });
  }
  let bscT = 0;
  async function bscPoll(now) {
    if (!BSCM() || PAPER) return; const a = A, p = await send('bscPos', { token: a }); if (a !== A || p.err || PAPER) return;
    if (p.bnb != null) { bal = p.bnb; paintBal(); }
    const L = await bled(a), val = p.value_bnb || 0, has = BigInt(p.raw || '0') > 0n, pnl = L.out + val - L.in;
    paintPos({ mint: a, raw: p.raw, ui: p.ui, dec: p.dec, value_sol: val, mc_sol: p.mc_bnb, usd: null, aslip: p.aslip,
      pnl: L.nb || L.ns ? { bought: L.in, sold: L.out, pnl, pct: L.in > 0 ? pnl / L.in * 100 : null, gas: 0, nb: L.nb, ns: L.ns } : null });
    if (!has && p.route && !['four', 'four_x', 'flap', 'pancake_v2', 'pancake_v2q', 'pancake_v3'].includes(p.route) && !S.title) status(p.why || 'no BNB market found for this coin', 'bad');
  }
  const watchNow = () => {
    clearInterval(bscT); bscT = 0;
    if (BSCM()) { if (port) try { port.postMessage({ op: 'watch', a: null }); } catch (_) {} bscPoll(); bscT = setInterval(() => { if (!document.hidden) bscPoll(); }, 1500); return; }
    if (port) try { port.postMessage({ op: 'watch', a: A, isMint: isMintPage() }); } catch (_) {}
    if (PAPER) paperPoll();
    if (C && C.snipe) send('snipe', { do: 'list' }).then(r => { if (r && !r.err) snpSet(r.armed); });
  };
  setInterval(() => { if (PAPER && A && !document.hidden && !P.hidden) paperPoll(); }, 1500);
  let nW = 1;   /* several wallets: the button shows how many (the SOL of all of them is in the Buy row) */
  /* 3.23.0 Paper trading: the same panel, the same keys and hotkeys, play money at live prices; nothing is ever signed or sent */
  let PAPER = false;
  async function paperPoll() {
    if (!PAPER || !A || !C) return; const a = A, p = await send('paperPos', { a, isMint: isMintPage() });
    if (!PAPER || a !== A || !p || p.err) return; bal = p.bal; paintBal(); paintPos(p); paperBal(p.bal);
  }
  const paperBal = b => { const e = $('.pbal'); if (e) e.textContent = b == null ? '' : (+b).toFixed(3) + ' ' + CUR(); };
  async function paperTrade(a, side, v, btn) {
    const cur = isBsc(a) ? 'BNB' : 'SOL', label = 'Paper ' + (side === 'buy' ? 'buy ' + v + ' ' + cur : 'sell ' + (+v).toFixed(v % 1 ? 1 : 0) + '%');
    if (btn) { if (!btn._n) btn.classList.add('busy'); btn._n = (btn._n || 0) + 1; } status(label + '…');
    const r = await send('paperTrade', { side, a, isMint: isMintPage(), v });
    if (btn && !--btn._n) btn.classList.remove('busy');
    if (!r || r.err) { status(label + ': ' + ((r && r.err) || 'failed'), 'bad'); window.hkSound('fail'); return; }
    status(label + (side === 'buy' ? ': got ' + fmt(r.got) + ' tokens' : ': got ' + f3(r.got) + ' ' + cur) + ' · play money, nothing sent', 'ok');
    window.hkSound(side === 'sell' ? 'sell' : 'buy'); paperPoll();
  }
  function paperUi() {
    P.classList.toggle('paper', PAPER); const t = $('.ppr'); if (t) t.checked = PAPER;
    $('.wal').title = PAPER ? 'Paper trading is on: play money, nothing is sent. Click to switch it off' : 'Wallets: choose which ones trade';
    if (PAPER) { last = null; paperPoll(); } else { const e = $('.pbal'); if (e) e.textContent = ''; refreshBal(); watchNow(); }
  }
  const paintBal = () => { const t = bal == null ? '–' : (+bal).toFixed(bal >= 100 ? 1 : 3); $('.wb').textContent = t; $('.wb').hidden = nW > 1; $('.bal').textContent = bal == null ? '–' : (+bal).toFixed(3); };
  async function refreshBal() {
    if (PAPER) { paperPoll(); return; }
    if (BSCM()) {
      const w = await send('bscWallet'); nW = 1; $('.wn').textContent = ''; $('.wn').classList.remove('on');
      if (!w || w.none) { bal = null; paintBal(); status('Add your BSC wallet: HAKI Strike settings (toolbar icon) → BSC wallet', 'bad'); return; }
      bal = w.bnb; paintBal(); $('.wal').title = 'BSC wallet ' + w.addr.slice(0, 6) + '…' + w.addr.slice(-4);
      if (!w.open) status('Locked: click the HAKI icon in Chrome’s toolbar and type your password once', 'bad');
      return;
    }
    const st = await send('state');
    if (st.err) { $('.wb').textContent = '–'; status(st.err, 'bad'); return; }
    const n = +st.n || 1; nW = n; bal = st.sol; paintBal(); $('.wn').textContent = n > 1 ? n : ''; $('.wn').classList.toggle('on', n > 1);
    $('.wal').title = n > 1 ? n + ' wallets trade together (SOL added up). Click to choose.' : 'Wallet. Click to choose the wallets that trade.';
    if (st.locked) status('Locked: click the HAKI icon in Chrome’s toolbar, type your password once and keep “Stay unlocked” on', 'bad');
  }
  const f3 = v => { const a = Math.abs(v); return !isFinite(v) ? '–' : v === 0 ? '0' : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : a >= 0.01 ? v.toFixed(3) : v.toFixed(4); };
  const showVal = v => usdView && last && last.usd ? (v < 0 ? '-$' : '$') + Math.abs(v * last.usd).toFixed(2) : f3(v);
  /* 3.15.0: each sell key shows what it brings (its share of Holding); the PnL line of this position since the page opened */
  const paintSubs = h => { $$('.rs .c').forEach((b, i) => { const s = b.querySelector('small'); if (s) { const t = h > 0 && C && C.sells && SROW()[i] != null ? (SM === 'sol' ? '≈' + Math.min(100, Math.round(SROW()[i] / h * 100)) + '%' : f3(h * SROW()[i] / 100)) : ''; if (s.textContent !== t) s.textContent = t; } }); };
  const SPK = new Map();
  function spkPush(p) {
    const x = p.pnl, sv = $('.spk'); if (!x || !p.mint) { sv.classList.add('no'); return; }
    let L = SPK.get(p.mint); if (!L) SPK.set(p.mint, L = []);
    const now = Date.now(); if (!L.length || now - L[L.length - 1][0] > 1500) L.push([now, +x.pnl]); else L[L.length - 1][1] = +x.pnl; if (L.length > 80) L.shift();
    if (L.length < 3) { sv.classList.add('no'); return; }
    let lo = Math.min(...L.map(q => q[1])), hi = Math.max(...L.map(q => q[1])); if (hi - lo < 1e-9) { hi += 1e-6; lo -= 1e-6; }
    const d = L.map((q, i) => (i ? 'L' : 'M') + (i / (L.length - 1) * 96).toFixed(1) + ' ' + (26 - (q[1] - lo) / (hi - lo) * 24).toFixed(1)).join(' ');
    sv.querySelector('.spl').setAttribute('d', d); sv.querySelector('.spf').setAttribute('d', d + ' L96 28 L0 28 Z'); sv.classList.remove('no');
  }
  /* 3.20.0: the feed ticks every block; writing unchanged numbers made the page re-layout for nothing */
  const setT = (k, t) => { const e = $(k); if (e && e.textContent !== t) e.textContent = t; };
  const setC = (k, c) => { const e = $(k); if (e && e.className !== c) e.className = c; };
  function paintPos(p) {
    if (p.err) return;
    last = p; lastT = Date.now(); const x = p.pnl, hold = p.value_sol, has = +p.raw > 0;
    aslipPaint(); snpPaint();
    const posH = has ? '<b>' + ESC(fmt(p.ui)) + '</b> held' : 'No position'; if ($('.pos').innerHTML !== posH) $('.pos').innerHTML = posH; paintSubs(has ? +hold || 0 : 0); spkPush(p);
    $('.rs').classList.toggle('off', !has);
    setT('.ph', has ? showVal(hold || 0) : '0');
    P.classList.toggle('nopos', !has && !x); $$('.un').forEach(e => { e.style.display = usdView && p.usd ? 'none' : ''; });
    $('.hero').classList.toggle('loss', !!(x && x.pnl < 0)); $('.hero').classList.toggle('flat', !x || !x.pnl);
    $('.init').disabled = busy || !(has && x && x.bought - x.sold > 0);
    if (!x) { setT('.pb', '0'); setT('.ps', '0'); setT('.pn', '+0'); setC('.pn', 'pn'); setT('.pp', '+0%'); setC('.pp', 'pp num'); $('.hero').title = 'No trades from HAKI on this coin yet'; paintSet(); return; }
    setT('.pb', showVal(x.bought)); setT('.ps', showVal(x.sold));
    const k = x.pnl >= 0 ? 'up' : 'dn';
    setT('.pn', (x.pnl >= 0 ? '+' : '') + showVal(x.pnl)); setC('.pn', 'pn ' + k);
    setT('.pp', x.pct != null ? (x.pct >= 0 ? '+' : '') + x.pct.toFixed(1) + '%' : ''); setC('.pp', 'pp num ' + k);
    $('.hero').title = 'Fees paid ' + x.gas.toFixed(5) + ' SOL (network, priority, tip; not in PnL, as on Axiom) · Holding = tokens x the current price · Bought = the most SOL you had in this coin at once (re-buys paid by earlier sells not added twice) · ' + x.nb + ' buy' + (x.nb === 1 ? '' : 's') + (x.buyAll != null ? ' ' + s4(x.buyAll) : '') + ' / ' + x.ns + ' sell' + (x.ns === 1 ? '' : 's') + (x.sellAll != null ? ' ' + s4(x.sellAll) : '') + ' SOL in all' + (p.usd ? ' · PnL ' + (x.pnl >= 0 ? '+$' : '-$') + Math.abs(x.pnl * p.usd).toFixed(2) : '');
    paintSet();
  }
  const SIGW = new Map();
  async function watch1(sig, onRetry) {   /* one transaction until the chain says landed / failed (a slippage miss is sent again once by the worker) */
    for (let tw = Date.now(); Date.now() - tw < 45000;) {
      await new Promise(r => { const t = setTimeout(r, 120); SIGW.set(sig, () => { clearTimeout(t); r(); }); }); SIGW.delete(sig);   /* the worker answers from memory; it asks the node itself at most every 0.45 s; 3.20.5: its WebSocket "landed" ends the wait at once */
      const r = await send('tx', { sig });
      if (r.st === 'retry') { sig = r.sig; tw = Date.now(); if (onRetry) onRetry(r); continue; }
      if (r.st === 'failed') return { ok: false, why: r.why || 'on chain' };
      if (r.st === 'confirmed' || r.st === 'finalized' || r.st === 'processed') return { ok: true, sig };
    }
    return { ok: false, slow: true, why: 'not landed in 45 s' };
  }
  /* market cap when you clicked vs the price the trade really got on chain (owner 1116: "I sell at 13k, it shows 10k") */
  const mcTxt = v => { const u = last && last.usd; return u ? '$' + fmt(v * u) : fmt(v) + ' SOL'; };
  async function fillNote(r, sig) {
    if (!(r.mc0 > 0) || !r.sup) return '';
    for (let i = 0; i < 10; i++) {
      const f = await send('fill', { sig });
      if (f.ok) { const tok = Math.abs(+f.tok); if (!(tok > 0) || !(f.sol > 0)) return ''; const mc1 = f.sol / tok * +r.sup; return ' · MC ' + mcTxt(r.mc0) + (r.mcq ? ' quoted by Jupiter → ' : ' at click → ') + mcTxt(mc1) + ' filled';   /* a Jupiter coin: its quote lags a fast coin */ }
      await new Promise(z => setTimeout(z, 600));
    }
    return '';
  }
  /* 3.12.18 (owner 1119, a 3.5 s sell): where the time of a trade built at the click went */
  const lapTxt = r => {
    const L = r && r.lap; if (!L || r.pre || L.route == null) return '';
    const p = ['coin data ' + L.st + ' ms', 'route ' + L.route + ' ms', 'sign ' + L.sign + ' ms'];
    if (L.wait > 50) p.push('Jupiter limit wait ' + L.wait + ' ms'); if (L.nc) p.push('new coin, Jupiter asked ' + (L.nc + 1) + ' times');
    if (L.legs > 1) p.push('2 legs via the quote coin'); if (L.raw) p.push('Jupiter-built'); return '; ' + p.join(', ');
  };
  async function watch(sig, label, t0, rr) {
    const r = await watch1(sig, x => status(label + ': ' + x.why + ', sent again' + (x.why.includes('slippage') ? ' with ' + x.slip + '%' : '') + '…'));
    if (r.ok) {
      const msg = label + ' landed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (rr && rr.ms != null ? ' (sent in ' + rr.ms + ' ms' + (rr.pre ? ', ready before the click' : rr.miss ? ', not ready: ' + rr.miss : '') + lapTxt(rr) + ')' : ''); status(msg, 'ok'); refreshBal(); window.hkSound(/^Sell/.test(label) ? 'sell' : 'buy');
      if (rr) fillNote(rr, r.sig).then(n => { if (n && S.title === msg) status(msg + n, 'ok'); }).catch(() => {});
    }
    else { status(r.slow ? label + ': not landed in 45 s. Check the wallet on Solscan.' : label + ' failed: ' + r.why, 'bad'); window.hkSound('fail'); }
  }
  /* after the worker sent the trade: one wallet as before; several wallets -> how many landed, and why the others did not */
  async function sent(r, label, t0) {
    const L = (r.list || []).filter(x => !(x.err && /hold none/.test(x.err)));   /* a wallet without this coin has nothing to sell: not a failure */
    if (L.length <= 1) { status(label + ' sent in ' + r.ms + ' ms' + (r.tip != null && r.prio != null ? ' · fee ' + (+r.tip + +r.prio).toFixed(5) : '') + (r.native ? ' (pump.fun direct)' : r.fast ? ' (' + (r.route || []).join(' › ') + ')' : '') + ', landing…'); await watch(r.sig, label, t0, r); return; }
    const go = L.filter(x => x.sig && !x.err), bad = L.filter(x => x.err).map(x => x.label + ': ' + x.err);
    status(label + ' × ' + go.length + ' wallets sent in ' + r.ms + ' ms, landing…' + (bad.length ? ' · ' + bad.join(' · ') : ''));
    let n = 0;
    const res = await Promise.all(go.map(x => watch1(x.sig).then(y => { if (y.ok) { n++; status(label + ': ' + n + '/' + go.length + ' landed…'); } return Object.assign(y, { label: x.label }); })));
    const fails = bad.concat(res.filter(y => !y.ok).map(y => y.label + ': ' + y.why));
    status(label + ': ' + n + '/' + L.length + ' wallets landed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (fails.length ? ' · ' + fails.join(' · ') : ''), !fails.length ? 'ok' : n ? '' : 'bad');
    window.hkSound(n ? (/^Sell/.test(label) ? 'sell' : 'buy') : 'fail');
    refreshBal();
  }
  const simWhy = e => { const t = JSON.stringify(e); return /AccountNotFound|InsufficientFunds/.test(t) ? 'the wallet has no SOL for this trade' : 'simulation failed (' + t.slice(0, 60) + ')'; };
  /* 3.14.1 BSC: the worker's BSC engine (bsc.js), then the receipt; the ledger of this coin for Bought / Sold / PnL */
  async function bled(tok, f) { const { bled = {} } = await chrome.storage.local.get({ bled: {} }); const L = Object.assign({ in: 0, out: 0, nb: 0, ns: 0 }, bled[tok]); if (f) { f(L); bled[tok] = L; await chrome.storage.local.set({ bled }); } return L; }
  async function tradeBsc(a, side, v, btn) {
    if (side === 'buy') nBuy++; else selling = true; lock(); const t0 = Date.now();
    const label = side === 'buy' ? 'Buy ' + v + ' BNB' : 'Sell ' + (+v).toFixed(v % 1 ? 1 : 0) + '%';
    if (btn) { if (!btn._n) btn.classList.add('busy'); btn._n = (btn._n || 0) + 1; }
    status(label + '…');
    const r = await send('bscTrade', side === 'buy' ? { side, token: a, bnb: v } : { side, token: a, pct: v });
    if (btn && !--btn._n) btn.classList.remove('busy');
    if (side === 'buy') nBuy--; else selling = false; lock();
    if (r.err) { status(r.err, 'bad'); window.hkSound('fail'); return; }
    if (r.sent === false) { status(r.sim && r.sim.ok ? 'Test mode: would go through, nothing sent' : 'Test mode: would fail: ' + ((r.sim && r.sim.err) || '?'), r.sim && r.sim.ok ? 'ok' : 'bad'); return; }
    status(label + ' sent in ' + (Date.now() - t0) + ' ms (' + (r.venue || '') + ', ' + r.via + '), landing…');
    for (let i = 0; i < 60; i++) {
      await new Promise(z => setTimeout(z, 500)); const s = await send('bscStatus', { hash: r.hash });
      if (s.st === 'confirmed') {
        const outB = side === 'sell' ? Number(BigInt(r.out || 0)) / 1e18 : 0;
        await bled(a, L => { if (side === 'buy') { L.in += v; L.nb++; } else { L.out += outB; L.ns++; } });
        if (side === 'buy') send('bscBought', { token: a, bnb: v });   /* auto callout */
        status(label + ' landed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', 'ok'); window.hkSound(side === 'sell' ? 'sell' : 'buy'); bscPoll(true); refreshBal(); return;
      }
      if (s.st === 'failed') { status(label + ' failed on chain', 'bad'); window.hkSound('fail'); return; }
    }
    status(label + ': not landed in 30 s. Check the wallet on BscScan.', 'bad');
  }
  let pathAt = 0;   /* 3.26.1: when the page's address last changed */
  async function trade(a, side, v, btn) {
    if (!a || (side === 'sell' && selling)) return;
    /* 3.26.1 security (audit 1122): a page can swap the coin in its address right under your click. A trade within 0.6 s of the address
       changing (or for another coin than the one on the page now) is not sent: look, then click again */
    if (Date.now() - pathAt < 600 || a !== pageAddr()) { status('The page just switched coins: check the coin and click again', 'bad'); return; }
    if (PAPER) return paperTrade(a, side, v, btn);
    if (isBsc(a)) return tradeBsc(a, side, v, btn);
    if (side === 'buy') nBuy++; else selling = true; lock(); const t0 = Date.now();
    const label = (side === 'buy' ? 'Buy ' + v + ' SOL' : 'Sell ' + (+v).toFixed(v % 1 ? 1 : 0) + '%') + (last && last.sym && last.mint && (a === last.mint || pageAddr() === a) ? ' · $' + String(last.sym).slice(0, 12) : '');
    if (btn) { if (!btn._n) btn.classList.add('busy'); btn._n = (btn._n || 0) + 1; }   /* 3.11.2 (owner): the amount stays on the key while it trades */
    status(label + (side === 'buy' && nBuy > 1 ? '… (' + nBuy + ' buys going)' : '…'));
    const mc = last && Date.now() - lastT < 5000 && +last.mc_sol > 0 ? +last.mc_sol : 0;   /* 3.12.22 Exact: the MC you saw at the click */
    const r = await send('trade', side === 'buy' ? { side, a, sol: v, key: uid(), isMint: isMintPage(), mc } : { side, a, pct: v, key: uid(), isMint: isMintPage(), mc });
    if (btn && !--btn._n) btn.classList.remove('busy');
    if (side === 'buy') nBuy--; else selling = false; lock(); if (last) paintPos(last);
    if (r.err) { status(r.err, 'bad'); return; }
    if (r.sent === false) { status(r.sim_err ? 'Test mode: ' + simWhy(r.sim_err) : 'Test mode: simulated OK, nothing sent', r.sim_err ? 'bad' : 'ok'); return; }
    await sent(r, label, t0);
  }

  let editing = false;
  /* Panel size (Settings): the whole panel, its wallet menu and Trading settings scale as one, nothing moves inside */
  let Z = 1;
  /* 3.15.0 (owner: "bigger / smaller like GMGN and Axiom"): 75-150 %, set by dragging the panel's corner (or in Settings); the top-left
     corner stays where it is */
  const ZMIN = 0.75, ZMAX = 1.5;
  function setZ(z) { const r = P.hidden ? null : P.getBoundingClientRect(); Z = z; for (const e of [P, PW, WM, S]) { e.style.transform = ''; e.style.zoom = Z === 1 ? '' : String(Z); } if (r && r.width) place(r.left, r.top); }
  function applyZ() {
    const z = Math.min(ZMAX, Math.max(ZMIN, +(C && C.pz) || 1)); if (z === Z && P.dataset.z) return; P.dataset.z = '1'; setZ(z);
  }
  /* 3.14.1 BNB mode: one panel, two chains */
  const BSCM = () => isBsc(A), CUR = () => BSCM() ? 'BNB' : 'SOL', MARK = () => BSCM() ? BNBI : SOLI, BUYS = () => BSCM() ? (C.bscBuys || [0.01, 0.05, 0.1, 0.25]) : C.buys;
  function chainMarks() {   /* every SOL mark of the panel <-> the BNB mark, the labels with them */
    P.classList.toggle('bsc', BSCM());
    for (const e of R.querySelectorAll('svg.sol')) { if (!!e.classList.contains('bnbm') === BSCM()) continue; const t = document.createElement('template'); t.innerHTML = MARK(); e.replaceWith(t.content.firstChild); }
    const cc = $('.ccy span'); if (cc) cc.innerHTML = MARK() + CUR();
    const am = $('.amt'); if (am) { am.placeholder = 'Amount in ' + CUR(); am.setAttribute('aria-label', 'Buy amount in ' + CUR()); }
    $('.cp').title = 'Click: ' + CUR() + ' / USD';
  }
  /* 3.16.0 (owner: "extend, a second row of buys and sells, like Axiom"): drag the handle under the panel down (or click it) */
  let EXT = false;
  const BUYS2 = () => BSCM() ? (C.bscBuys2 || [0.02, 0.2, 0.5, 1]) : (C.buys2 || [0.25, 2, 5, 10]);
  const SELLS2 = () => C.sells2 || [33, 55, 75, 90];
  const BROW = () => BUYS().slice(0, 4).concat(EXT ? BUYS2().slice(0, 4) : []);
  /* 3.19.0 (owner: "sell by 0.1 / 0.5 SOL, not only %"): the switch next to Sell. In SOL mode a key sells that much SOL worth of the
     position (its share of Holding, at most all of it); each trading wallet sells that share of its own coins */
  let SM = 'pct', SSOL = [0.1, 0.25, 0.5, 1], SSOL2 = [0.05, 2, 3, 5];
  const SROW = () => SM === 'sol' ? SSOL.slice(0, 4).concat(EXT ? SSOL2.slice(0, 4) : []) : C.sells.slice(0, 4).concat(EXT ? SELLS2().slice(0, 4) : []);
  const pctOf = v => { if (SM !== 'sol') return v; const h = last && +last.value_sol; return h > 0 ? Math.max(0.1, Math.min(100, Math.round(v / h * 1000) / 10)) : null; };
  const sellKey = (v, b) => { const pc = pctOf(+v); if (pc == null) { status('Holding value not known yet, try again in a second', 'bad'); return; } trade(A, 'sell', pc, b); };
  function build() {
    applyZ(); P.classList.toggle('ext', EXT);
    BK = (C.hkBuy || HKD.hkBuy).slice(0, 4); SK = (C.hkSell || HKD.hkSell).slice(0, 4);
    const rb = $('.rb'), rs = $('.rs'); rb.textContent = ''; rs.textContent = '';
    $('.edt').classList.toggle('on', editing); $('.edt').innerHTML = editing ? I.check : I.pen; $('.edt').title = editing ? 'Save the amounts (Enter) · Esc: cancel' : 'Edit the buy and sell amounts';
    if (editing) {   /* the 8 amounts as fields in the same places; the check mark (or Enter) saves */
      rs.classList.remove('off');
      const mk = (rail, v, unit, lab) => { const w = document.createElement('span'); w.className = 'cw' + (unit === '%' ? ' pc' : ''); w.innerHTML = '<input class="c num" inputmode="decimal" aria-label="' + lab + '"><i>' + unit + '</i>'; const inp = w.firstChild; inp.value = v;
        inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') saveAmounts(); if (e.key === 'Escape') { editing = false; build(); } }; inp.onkeyup = e => e.stopPropagation(); rail.appendChild(w); };
      BROW().forEach((v, i) => mk(rb, v, CUR(), 'Buy amount ' + (i + 1) + ', ' + CUR()));
      SROW().forEach((v, i) => mk(rs, v, SM === 'sol' ? CUR() : '%', 'Sell amount ' + (i + 1) + (SM === 'sol' ? ', ' + CUR() : ', %')));
      const f = rb.querySelector('input'); if (f) { f.focus(); f.select(); }
      return;
    }
    if (last) $('.rs').classList.toggle('off', !(+last.raw > 0));
    BROW().forEach((v, i) => {
      const b = document.createElement('button'); b.className = 'c num'; b.innerHTML = (BK[i] ? '<kbd>' + BK[i].toUpperCase() + '</kbd>' : '') + MARK() + '<span>' + ESC(v) + '</span>'; b.title = 'Buy ' + v + ' ' + CUR();
      b.onclick = () => trade(A, 'buy', +v, b); b.onpointerenter = () => hold(() => warm(A, +v, isMintPage())); b.onpointerleave = unhold; rb.appendChild(b);
    });
    SROW().forEach((v, i) => {
      const b = document.createElement('button'); b.className = 'c num'; b.innerHTML = (SK[i] ? '<kbd>' + SK[i].toUpperCase() + '</kbd>' : '') + '<span>' + ESC(v) + (SM === 'sol' ? '' : '%') + '</span><small></small>';
      b.title = SM === 'sol' ? 'Sell ' + v + ' ' + CUR() + ' worth of your position' : 'Sell ' + v + '% of your position';
      b.onclick = () => sellKey(v, b); b.onpointerenter = () => hold(() => { const pc = pctOf(+v); if (pc != null) warm(A, pc, isMintPage(), 'sell'); }); b.onpointerleave = unhold; rs.appendChild(b);
    });
    chainMarks(); if (last) paintSubs(+last.raw > 0 ? +last.value_sol || 0 : 0);
    const smb = $('.smode'); smb.innerHTML = (SM === 'sol' ? MARK() + CUR() : '%') + I.swap; smb.title = SM === 'sol' ? 'Selling by ' + CUR() + ' amount. Click: by % of the position' : 'Selling by % of the position. Click: by ' + CUR() + ' amount';
    P.classList.toggle('hk', !!C.hk); $('.kbt').classList.toggle('acc', !!C.hk);
    { const md = { ctrl: 'Ctrl + ', alt: 'Alt + ', shift: 'Shift + ', space: 'hold Space, then ' }[C.hkMod] || '';
      $('.kbt').title = C.hk ? 'Hotkeys on: ' + md + BK.join(' ').toUpperCase() + ' buy, ' + md + SK.join(' ').toUpperCase() + ' sell. Click: off. Keys and mode: settings → Trading' : 'Hotkeys off. Click: on'; } $('.cau').checked = !!C.cAuto; $('.cnx').hidden = !(C.cTexts || []).filter(Boolean).length;   /* the ↻ only when you saved texts */
    for (const h of document.querySelectorAll("hk-qb")) { h._v = null; qLabel(h); }   /* the quick-buy amount when Settings change */
    paintSet();
  }
  $('.adv').onclick = () => { const on = $('.cus').classList.toggle('on'); $('.adv').setAttribute('aria-expanded', on); $('.adv').textContent = on ? 'Close' : 'Custom'; if (on) $('.amt').focus(); };
  const cusVal = () => parseFloat(String($('.amt').value).replace(',', '.'));
  $('.cgo').onpointerenter = () => { const v = cusVal(); if (v > 0) warm(A, v, isMintPage()); };
  $('.cgo').onclick = () => { const v = cusVal(); if (v > 0) trade(A, 'buy', v); else status('Type an amount in SOL', 'bad'); };
  $('.amt').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('.cgo').click(); };
  $('.amt').onkeyup = e => e.stopPropagation();
  $('.init').onclick = () => {   /* take out what you put in: sell the share of the holding worth (bought - sold) */
    const x = last && last.pnl, h = last && last.value_sol; if (!x || !(h > 0)) return;
    const pct = Math.min(100, Math.max(1, (x.bought - x.sold) / h * 100)); trade(A, 'sell', Math.round(pct * 10) / 10);
  };
  $('.cp').onclick = () => { usdView = !usdView; if (last) paintPos(last); };
  /* Share PnL: the card window over the page (our layer), loaded once ahead of time; the data is written by the worker, then shown */
  const SHM = $('.shm'), SHF = $('.shf'), SHURL = chrome.runtime.getURL('share/share.html') + '?embed=1';
  const shLoad = () => { if (!SHF.getAttribute('src')) SHF.setAttribute('src', SHURL); };
  const shFit = () => { const k = Math.min(1, (innerWidth - 24) / 818, (innerHeight - 24) / 782); SHF.style.transform = k < 1 ? 'scale(' + k.toFixed(3) + ')' : ''; };
  const shClose = () => { SHM.hidden = true; };
  const shPos = () => last && last.mint ? { mint: last.mint, raw: last.raw, dec: last.dec, value_sol: last.value_sol } : null;
  $('.shr').onpointerenter = () => { shLoad(); if (A && last && last.pnl) send('sharePrep', { a: A, isMint: isMintPage(), title: document.title, p: shPos() }); };
  $('.shr').onclick = async e => {
    e.stopPropagation(); if (!A) return;
    if (!last || !last.pnl) { status('No trades on this coin from this wallet yet', 'bad'); return; }
    shLoad(); const sb = $('.shr'); sb.disabled = true;
    const r = await send('share', { a: A, isMint: isMintPage(), title: document.title, p: shPos() }); sb.disabled = false;
    if (r && r.err) { status('Share PnL: ' + r.err, 'bad'); return; }
    shShow();
  };
  function shShow() {
    shLoad(); shFit(); SHM.hidden = false;
    const go = () => { try { SHF.contentWindow.postMessage({ hakiShare: 'open' }, new URL(SHURL).origin); } catch (_) {} };
    if (SHF.dataset.ok) go(); else {
      SHF.addEventListener('load', () => { SHF.dataset.ok = '1'; setTimeout(go, 30); }, { once: true });
      setTimeout(() => { if (!SHF.dataset.ok) { shClose(); send('shareWin'); } }, 2500);   /* the page would not show it: its own window instead */
    }
    SHF.focus();
  }
  /* 3.21.2 (owner: "PnL from the extension should open like on the coin"): Today / 7 days / All time from Settings shows here, over the page */
  chrome.runtime.onMessage.addListener((m, s, reply) => { if (!m || !m.shareShow || !s || s.id !== chrome.runtime.id || !alive()) return; shShow(); reply({ ok: true }); });
  SHF.addEventListener('load', () => { SHF.dataset.ok = '1'; });
  SHM.addEventListener('click', e => { if (e.target === SHM) shClose(); });
  addEventListener('message', e => { if (e.source === SHF.contentWindow && e.data && e.data.hakiShare === 'close') shClose(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !SHM.hidden) shClose(); }, true);
  addEventListener('resize', () => { if (!SHM.hidden) shFit(); });
  /* a new version is waiting (it would lock the wallets): applied when you press it */
  const autoNews = a => {   /* an Auto sell rule fired somewhere (this coin or another) */
    const coin = a.mint === (last && last.mint) ? '' : ' (' + a.mint.slice(0, 4) + '…)';
    if (a.st === 'sent') status(a.label + coin + ': selling ' + a.pct + '% at ' + a.x + 'x…');
    else if (a.st === 'landed') { status(a.label + coin + ': sold ' + a.pct + '%' + (a.of > 1 ? ' (' + a.n + '/' + a.of + ' wallets)' : '') + ' at ' + a.x + 'x', 'ok'); refreshBal(); }
    else status(a.label + coin + ': not sold, ' + (a.why || 'failed') + (a.st === 'failed' ? ' (tries again)' : ''), 'bad');
    if (window.hkSound) window.hkSound(a.st === 'landed' ? 'auto' : a.st === 'failed' ? 'fail' : null);
  };
  const showUpd = v => { $('.updb').classList.toggle('on', !!v); };
  $('.updb').onclick = () => { $('.updb').textContent = 'Updating…'; send('applyUpdate'); };
  $$('.tabs button').forEach((b, i) => {
    b.title = 'P' + (i + 1) + ': click again to change its slippage, priority and bribe';
    b.onclick = () => { if ((C.preset || 0) === i) { if (PW.hidden) pwOpen(i); else pwClose(); return; } C.preset = i; chrome.storage.local.set({ preset: i }); paintSet(); };
  });
  async function saveAmounts() {
    const get = (rail, lo, hi) => [...$(rail).querySelectorAll('input')].map(x => { const v = +String(x.value).replace(',', '.'); const ok = v >= lo && v <= hi; x.classList.toggle('bad', !ok); return ok ? v : null; });
    const B8 = get('.rb', 0.0001, 1000), S8 = SM === 'sol' ? get('.rs', 0.0001, 1000) : get('.rs', 0.1, 100);
    if (B8.includes(null) || S8.includes(null)) { status('Buy 0.0001-1000 ' + CUR() + (SM === 'sol' ? ', sell 0.0001-1000 ' + CUR() : ', sell 0.1-100 %'), 'bad'); return; }
    if (SM === 'sol') { SSOL = S8.slice(0, 4); if (EXT) SSOL2 = S8.slice(4, 8); await chrome.storage.local.set({ sellSol: SSOL, sellSol2: SSOL2 }); for (let i = 0; i < S8.length; i++) S8[i] = (i < 4 ? C.sells[i] : SELLS2()[i - 4]); }
    const buys = B8.slice(0, 4), sells = S8.slice(0, 4), buys2 = EXT ? B8.slice(4, 8) : null, sells2 = EXT ? S8.slice(4, 8) : null;   /* 3.16.0: the second row too when extended */
    if (BSCM()) { await chrome.storage.local.set(Object.assign({ bscBuys: buys }, buys2 ? { bscBuys2: buys2 } : {})); const r = await send('savePanel', Object.assign({ buys: C.buys, sells }, sells2 ? { sells2 } : {})); if (r.err) { status('Not saved: ' + r.err, 'bad'); return; } C.bscBuys = buys; if (buys2) C.bscBuys2 = buys2; }
    else { const r = await send('savePanel', Object.assign({ buys, sells }, buys2 ? { buys2, sells2 } : {})); if (r.err) { status('Not saved: ' + r.err, 'bad'); return; } C.buys = buys; if (buys2) C.buys2 = buys2; }
    C.sells = sells; if (sells2) C.sells2 = sells2; editing = false; build(); status('Amounts saved', 'ok');
  }
  $('.edt').onclick = () => { if (editing) saveAmounts(); else { editing = true; build(); } };

  /* preset window: click the preset that is already on (or switch, then click it again) -> its buy / sell slippage, priority, bribe */
  const PW = $('.pw'); let pd = null, pp = 0, ps = 'b';
  const fk = f => ps === 'b' ? f : 's' + f;
  const pwFields = [['.fsl', 'slip', 0.1, 100], ['.fpr', 'prio', 0, 0.01], ['.ftp', 'tip', 0, 0.01]];
  function pwPaint() {
    PW.querySelectorAll('[data-pp]').forEach(b => b.classList.toggle('on', +b.dataset.pp === pp));
    PW.querySelectorAll('[data-ps]').forEach(b => b.classList.toggle('on', b.dataset.ps === ps));
    const p = pd[pp]; for (const [sel, f] of pwFields) { const x = PW.querySelector(sel); x.value = p[fk(f)]; x.parentNode.classList.remove('bad'); }
    pwNote();
  }
  function pwNote() {
    const p = pd[pp], pr = +p[fk('prio')] || 0, tp = +p[fk('tip')] || 0, sl = +p[fk('slip')] || 0, usd = last && last.usd;
    const fee = pr + tp;
    PW.querySelector('.pwn').innerHTML = 'Each ' + (ps === 'b' ? 'buy' : 'sell') + ' pays <b>' + s4(fee) + ' SOL</b>' + (usd ? ' (≈ $' + (fee * usd).toFixed(2) + ')' : '') + ' in priority + bribe.<br>'
      + (tp >= 0.000005 ? 'Fast lane on: sent through Helius Sender (Jito and the other fast lanes).' : '<span class="w">Bribe 0: sent to the node only, slower in busy blocks.</span>')
      + (sl >= 50 ? '<br><span class="w">Slippage ' + sl + '%: fills at almost any price.</span>' : '');
  }
  function pwOpen(i) {
    pd = JSON.parse(JSON.stringify(C.presets)).map(p => Object.assign(p, { sslip: p.sslip ?? p.slip, sprio: p.sprio ?? p.prio, stip: p.stip ?? p.tip }));   /* a preset without its own sell settings sells with its buy ones */
    pp = i; ps = 'b'; PW.hidden = false; pwPaint();
    const r = P.getBoundingClientRect(), w = PW.offsetWidth * Z, h = PW.offsetHeight * Z;
    let x = r.left - w - 8; if (x < 8) x = r.right + 8; if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - w - 8);
    PW.style.left = x / Z + 'px'; PW.style.top = Math.min(Math.max(8, r.top), innerHeight - h - 8) / Z + 'px';
    PW.querySelector('.fsl').focus();
  }
  const pwClose = () => { PW.hidden = true; pd = null; };
  for (const [sel, f, lo, hi] of pwFields) {
    const x = PW.querySelector(sel);
    x.oninput = () => { const v = +String(x.value).replace(',', '.'), ok = x.value !== '' && v >= lo && v <= hi; x.parentNode.classList.toggle('bad', !ok); if (ok) pd[pp][fk(f)] = v; pwNote(); };
    x.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') PW.querySelector('.pwd').click(); if (e.key === 'Escape') pwClose(); };
    x.onkeyup = e => e.stopPropagation();
  }
  PW.querySelectorAll('[data-pp]').forEach(b => { b.onclick = () => { pp = +b.dataset.pp; pwPaint(); }; });
  PW.querySelectorAll('[data-ps]').forEach(b => { b.onclick = () => { ps = b.dataset.ps; pwPaint(); }; });
  PW.querySelector('.pwx').onclick = pwClose;
  PW.querySelector('.pwd').onclick = async () => {
    if (PW.querySelector('.fi.bad')) { status('Slippage 0.1-100 %, priority and bribe 0-0.01 SOL', 'bad'); return; }
    const r = await send('savePanel', { presets: pd }); if (r.err) { status('Not saved: ' + r.err, 'bad'); return; }
    C.presets = pd; pwClose(); paintSet(); status('Preset ' + (pp + 1) + ' saved', 'ok');
  };
  document.addEventListener('pointerdown', e => { if (PW.hidden) return; if (e.composedPath().includes(host)) return; pwClose(); }, true);
  /* wallets menu: tick the wallets that trade together (each buys the amount, each sells its own %) */
  const WM = $('.wm');
  const short = p => p.slice(0, 4) + '…' + p.slice(-4);
  let WL = [], wMode = null, wTgt = null;   /* 3.15.0: the list; Consolidate / Split pick a wallet (wTgt) */
  const wsol = v => v == null ? '–' : !+v ? '0' : v >= 100 ? (+v).toFixed(1) : v >= 0.01 ? (+v).toFixed(3) : (+v).toFixed(4);
  async function wmPaint() {
    WM.classList.toggle('bsc', BSCM());
    if (BSCM()) {   /* 3.14.2 (owner: "Solana wallets on BNB"): on a BSC coin the menu is the BSC wallet */
      const w = await send('bscWallet'); wMode = null; $('.wmx').hidden = true; WM.classList.remove('pick');
      $('.wmt').textContent = w && !w.none ? '1 of 1' : '0'; $('.wmtot').innerHTML = w && w.bnb != null ? wsol(w.bnb) + BNBI : '–';
      $('.wml').innerHTML = w && !w.none ? '<label class="wr"><input type="checkbox" checked disabled><span class="ck"></span><span class="wl"><b>' + ESC(w.label || 'BSC wallet') + '</b><i class="wcp" data-cp="' + ESC(w.addr) + '" title="Copy address">' + ESC(short(w.addr)) + '</i></span>'
        + (w.open ? '<span class="ws num"><b class="wv">' + (w.bnb == null ? '–' : wsol(+w.bnb)) + '</b><b class="wu">' + BNBI + '</b></span>' : '<span class="ws lk">locked</span>') + '</label>' : '<div class="wmh">No BSC wallet yet</div>';
      return;
    }
    const r = await send('wallets', { a: A, isMint: isMintPage() }); if (r.err) { status(r.err, 'bad'); return; }
    WL = r.list || []; wmRender();
  }
  function wmRender() {
    const L = WL, on = L.filter(w => w.sel), pick = !!wMode;
    WM.classList.toggle('pick', pick);
    $('.wmt').textContent = on.length + ' of ' + L.length;
    $('.wmtot').innerHTML = wsol(L.reduce((s, w) => s + (+w.sol || 0), 0)) + MARK();
    $('.wml').innerHTML = L.length ? L.map(w => '<label class="wr' + (w.sel ? '' : ' off') + (pick && w.pub === wTgt ? ' tgt' : '') + '" data-w="' + ESC(w.pub) + '"><input type="checkbox" data-pub="' + ESC(w.pub) + '"' + (w.sel ? ' checked' : '') + (pick ? ' disabled' : '') + '><span class="ck"></span><i class="rd"></i><span class="wl"><b>' + ESC(w.label) + '</b><i class="wcp" data-cp="' + ESC(w.pub) + '" title="Copy address">' + ESC(short(w.pub)) + '</i></span>'
      + (w.open ? '<span class="ws num"><b class="wv">' + wsol(w.sol) + '</b><b class="wu">' + MARK() + '</b>' + (w.tok != null ? '<small class="wv">' + ESC(w.tok > 0 ? fmt(w.tok) : '0') + '</small><small class="wu">' + ESC(w.sym || 'held') + '</small>' : '') + '</span>' : '<span class="ws lk">locked</span>') + '</label>').join('') : '<div class="wmh">No wallet yet</div>';
    WM.querySelectorAll('input[data-pub]').forEach(x => { x.onchange = wmSel; });
    if (pick) WM.querySelectorAll('.wr').forEach(row => { row.onclick = e => { e.preventDefault(); wTgt = row.dataset.w; wmRender(); }; });
    wmBar();
  }
  /* 3.27.5 (owner): click a wallet address to copy it; the row's checkbox is not touched */
  WM.addEventListener('click', e => { const t = e.target.closest && e.target.closest('.wcp'); if (!t) return; e.preventDefault(); e.stopPropagation(); hkCopy(t.dataset.cp, t); }, true);
  async function hkCopy(txt, el) {
    let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (_) {
      try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) {} }
    if (el) { el.classList.add('cpd'); setTimeout(() => el.classList.remove('cpd'), 1200); }
    status(ok ? 'Address copied' : 'Could not copy the address', ok ? 'ok' : 'bad');
  }
  async function wmSel() {
    const pubs = [...WM.querySelectorAll('input[data-pub]:checked')].map(y => y.dataset.pub);
    if (!pubs.length) { status('Keep at least one wallet on', 'bad'); wmRender(); return; }
    const q = await send('selWallets', { pubs }); if (q.err) { status(q.err, 'bad'); wmPaint(); return; }
    WL.forEach(w => { w.sel = pubs.includes(w.pub); }); wmRender();
    status(pubs.length > 1 ? pubs.length + ' wallets trade together: each buys the amount, each sells its own %' : 'One wallet trades', 'ok');
    refreshBal(); C = await send('cfg');
  }
  WM.querySelector('.wma').onclick = () => { if (wMode || BSCM()) return; WM.querySelectorAll('input[data-pub]').forEach(x => { x.checked = true; }); wmSel(); };
  WM.querySelector('.wmb').onclick = () => { if (wMode || BSCM()) return; const has = new Set(WL.filter(w => w.open && w.sol > 0.001).map(w => w.pub)); if (!has.size) { status('No wallet holds SOL', 'bad'); return; }
    WM.querySelectorAll('input[data-pub]').forEach(x => { x.checked = has.has(x.dataset.pub); }); wmSel(); };
  const wLbl = p => (WL.find(w => w.pub === p) || {}).label || short(p);
  function wmBar() {   /* Consolidate: everything into the picked wallet. Split: the picked wallet shares evenly with the ticked ones */
    const X = $('.wmx'); if (!wMode) { X.hidden = true; X.textContent = ''; return; } X.hidden = false;
    let t, ok = false;
    if (wMode === 'con') {
      const src = WL.filter(w => w.pub !== wTgt && w.open && w.sol > 0.0011), sum = src.reduce((s, w) => s + w.sol, 0);
      t = !wTgt ? '<b>Consolidate</b>: click the wallet that gets the SOL of all your other wallets.' : 'Move all SOL of <b>' + src.length + '</b> wallet' + (src.length === 1 ? '' : 's') + ' (about ' + wsol(sum) + ' SOL) into <b>' + ESC(wLbl(wTgt)) + '</b>.';
      ok = !!wTgt && src.length > 0;
    } else {
      const f = WL.find(w => w.pub === wTgt), dst = WL.filter(w => w.sel && w.pub !== wTgt), n = dst.length, share = f && n ? Math.max(0, (f.sol - 0.0000051 * n) / (n + 1)) : 0;
      t = !wTgt ? '<b>Split</b>: click the wallet to share from. It splits evenly with the ticked wallets.' : !n ? 'Tick the wallets to split into first: Cancel, tick them, Split.' : 'Split <b>' + ESC(wLbl(wTgt)) + '</b> evenly: <b>' + wsol(share) + ' SOL</b> to each of ' + n + ' wallet' + (n === 1 ? '' : 's') + ', it keeps the same.';
      ok = !!wTgt && n > 0 && share > 0.0009;
    }
    X.innerHTML = t + '<div class="row"><button class="no">Cancel</button><button class="go"' + (ok ? '' : ' disabled') + '>' + (wMode === 'con' ? 'Consolidate' : 'Split') + '</button></div>';
    X.querySelector('.no').onclick = () => { wMode = null; wTgt = null; wmRender(); };
    X.querySelector('.go').onclick = wmGo;
  }
  async function wmGo() {
    const m = wMode, t = wTgt, go = $('.wmx .go'); go.disabled = true; go.textContent = m === 'con' ? 'Moving…' : 'Splitting…';
    const r = m === 'con' ? await send('consolidate', { to: t }) : await send('split', { from: t, to: WL.filter(w => w.sel && w.pub !== t).map(w => w.pub) });
    wMode = null; wTgt = null;
    if (r.err) { status((m === 'con' ? 'Consolidate: ' : 'Split: ') + r.err, 'bad'); wmPaint(); return; }
    const L = r.list || [], n = L.filter(x => x.sig).length, bad = L.filter(x => x.err).map(x => x.label + ': ' + x.err);
    status((m === 'con' ? 'Consolidate: ' : 'Split: ') + n + '/' + L.length + ' transfers landed, ' + wsol(r.sol || 0) + ' SOL' + (bad.length ? ' · ' + bad.join(' · ') : ''), bad.length ? (n ? '' : 'bad') : 'ok');
    window.hkSound(n ? 'buy' : 'fail'); refreshBal(); wmPaint();
  }
  WM.querySelector('.wmc').onclick = () => { if (BSCM()) return; wMode = wMode === 'con' ? null : 'con'; wTgt = null; wmRender(); };
  WM.querySelector('.wms').onclick = () => { if (BSCM()) return; wMode = wMode === 'spl' ? null : 'spl'; wTgt = null; wmRender(); };
  function wmOpen() {
    WM.hidden = false; $('.wal').classList.add('on'); $('.wal').setAttribute('aria-expanded', 'true');
    const r = $('.wal').getBoundingClientRect(), w = WM.offsetWidth * Z;
    WM.style.left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8) / Z + 'px'; WM.style.top = Math.min(r.bottom + 6, innerHeight - 200) / Z + 'px';
    wmPaint();
  }
  const wmClose = () => { WM.hidden = true; wMode = null; wTgt = null; WM.classList.remove('pick'); $('.wmx').hidden = true; $('.wal').classList.remove('on'); $('.wal').setAttribute('aria-expanded', 'false'); };
  $('.wal').onclick = e => { e.stopPropagation(); if (WM.hidden) wmOpen(); else wmClose(); };
  WM.querySelector('.wmg').onclick = () => { wmClose(); send('openSettings', { add: true }); };
  document.addEventListener('pointerdown', e => { if (!WM.hidden && !e.composedPath().includes(host)) wmClose(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !WM.hidden) wmClose(); }, true);
  $('.kbt').onclick = () => { C.hk = !C.hk; chrome.storage.local.set({ hk: C.hk }); build(); };
  $('.cfg').onclick = () => send('openSettings');
  /* 3.25.0 Snipe (an add-on of the owner's build): arm a curve coin, it is bought into its PumpSwap pool the moment migration creates it */
  let SNP = new Map();
  const snpPaint = () => { const b = $('.snp'); if (!b) return; const show = !!(C && C.snipe) && !!A && !isBsc(A) && !PAPER; b.hidden = !show; if (!show) return;
    const m = (last && last.mint) || A, x = SNP.get(m); b.classList.toggle('on', !!x); b.textContent = x ? 'Armed ' + x.sol : 'Snipe';
    b.title = x ? 'Armed: ' + x.sol + ' SOL is bought into the PumpSwap pool the moment this coin migrates. Click to disarm' : 'Snipe the migration: buy the moment the PumpSwap pool appears (amount: the Custom field, else your first buy key)'; };
  const snpSet = L => { SNP = new Map((L || []).map(x => [x.mint, x])); snpPaint(); };
  $('.snp').onclick = async e => {
    if (!e.isTrusted || !A) return; const m = (last && last.mint) || A;
    if (SNP.has(m)) { const r = await send('snipe', { do: 'off', a: A }); if (r && !r.err) snpSet(r.armed); return; }
    const own = parseFloat(String(($('.amt') || {}).value || '').replace(',', '.')), sol = own > 0 ? own : +BROW()[0];
    status('Arming snipe ' + sol + ' SOL…'); const r = await send('snipe', { do: 'arm', a: A, sol });
    if (!r || r.err) { status('Snipe: ' + ((r && r.err) || 'failed'), 'bad'); return; }
    snpSet(r.armed); status('Snipe armed: ' + sol + ' SOL the moment this coin migrates (keep Chrome open)', 'ok');
  };
  $('.ppr').onchange = async e => { const r = await send('paperSet', { on: e.target.checked }); PAPER = !!(r && r.on); paperUi(); if (PAPER) status('Paper trading on: play money at live prices, nothing is sent', 'ok'); };
  $('.prs').onclick = async e => { e.stopPropagation(); const r = await send('paperSet', { reset: true }); paperBal(r && (BSCM() ? r.bnb : r.sol)); if (PAPER) paperPoll(); status('Paper money reset: 10 SOL and 1 BNB', 'ok'); };
  chrome.storage.local.get({ paper: null }).then(o => { const on = !!(o.paper && o.paper.on); if (on !== PAPER) { PAPER = on; paperUi(); } }).catch(() => {});
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.paper) { const on = !!(ch.paper.newValue && ch.paper.newValue.on); if (on !== PAPER) { PAPER = on; paperUi(); } } });
  $('.mn').onclick = () => { const m = P.classList.toggle('min'); $('.mn').innerHTML = m ? I.max : I.min; chrome.storage.local.set({ min: m }); };

  /* hotkeys (the keyboard button, on by default): hold Space, then Q W E R buy, A S D F sell. Works with the chart focused too (its frame
     hands the key over). Never while typing; only real key presses (a page script cannot fake one). */
  const hotkey = h => {   /* h = { s: 'b' | 's', i: key number } */
    if (!C || !C.hk || !A || P.hidden || !h) return false;
    if (h.s === 'b' && BROW()[h.i] != null) { trade(A, 'buy', +BROW()[h.i], $$('.rb .c')[h.i]); return true; }   /* BNB mode buys its BNB amounts */
    if (h.s === 's' && SROW()[h.i] != null) { if (last && +last.raw > 0) sellKey(SROW()[h.i], $$('.rs .c')[h.i]); else status('Nothing to sell yet', 'bad'); return true; }
    return false;
  };
  let space = false;
  /* typing anywhere: the page's fields, and ours (our layer is a closed shadow root, so from the window the event comes from its host:
     look at what has focus inside it). Typing never trades and Space types a space (owner 1116: Callout text with hotkeys on) */
  const field = t => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')));
  const typing = e => { const t = e.composedPath()[0]; return t === host ? field(R.activeElement) : field(t); };
  window.__hakiField = () => field(R.activeElement);   /* for early.js (same extension world, never the page's) */
  /* fallback when early.js came too late (a tab open before an update): the page cancelled Space in our field -> type it ourselves */
  R.addEventListener('keydown', e => { const t = e.composedPath()[0];
    if (e.key === ' ' && e.defaultPrevented && !e.ctrlKey && !e.metaKey && field(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName) && t.type !== 'checkbox') {
      const a = t.selectionStart, b = t.selectionEnd; if (a == null) return; t.setRangeText(' ', a, b, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); } });
  /* true = ours: the caller stops the key before the site sees it. early.js calls this first (it runs before the site's own scripts, so
     the site's hotkeys never eat ours); the listener below is the fallback for a tab opened before an update */
  const hkDown = e => {
    if (!e.isTrusted || !C || !C.hk || !A || P.hidden) return false;
    if (typing(e)) { space = false; return false; }
    if (e.code === 'Space' && C.hkMod === 'space' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { space = true; return true; }   /* Space held = hotkey mode (no page scroll) */
    const h = hkFind(e, C, space); if (!h || !hkFront()) return false;
    return hotkey(h);
  };
  window.__hakiHot = e => { if (e.type === 'keydown') return hkDown(e); if (e.code === 'Space') { const was = space; space = false; return was && !!C && C.hkMod === 'space' && !typing(e); } return false; };
  addEventListener('keydown', e => { if (window.__hakiEarly) return; if (hkDown(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('keyup', e => { if (window.__hakiEarly || e.code !== 'Space') return; if (window.__hakiHot(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('blur', () => { space = false; });
  chrome.runtime.onMessage.addListener(m => { if (m && m.hkey2 && hkFront()) hotkey(m.hkey2); });   /* from the chart frame, via the extension */

  let wT = 0, wD = 0, wK = '';
  /* 3.11.3 (owner: "faster"): while the mouse stays on a key its trade is built again every 1.5 s (a build is used for 4 s), so a click
     after a long rest still only signs and sends */
  let hT = 0; const unhold = () => { clearInterval(hT); hT = 0; };
  const hold = f => { unhold(); f(); hT = setInterval(f, 1600); };
  /* 3.24.0 (owner: "the trade ready before the click"): pump.fun and PumpSwap coins are built locally at the click (~1 ms, the coin's state
     comes every block). A coin traded through Jupiter needs a route from the network, so while the panel is open on it every key is kept
     built ahead (refreshed every 6 s, inside Jupiter's limits): the click only signs and sends */
  const NATV = new Map();
  setInterval(() => {
    if (PAPER || !A || isBsc(A) || P.hidden || document.visibilityState !== 'visible' || !C || editing) return;
    const a = A, im = isMintPage(), nv = NATV.get(a);
    if (nv === undefined) { NATV.set(a, null); send('prep', { a, sol: BROW()[0], isMint: im }).then(r => { NATV.set(a, r && !r.err ? !!r.native : undefined); }); return; }
    if (nv !== false) return;
    for (const v of BROW()) send('prep', { a, sol: v, isMint: im });
    if (last && +last.raw > 0) for (const v of SROW()) { const pc = pctOf(+v); if (pc != null) send('prep', { a, side: 'sell', pct: pc, isMint: im }); }
  }, 6000);
  const warm = (a, v, isMint, side) => {   /* get the trade ready while the mouse rests on the button (150 ms): the click only signs and sends */
    clearTimeout(wD); if (!a || !(v > 0) || isBsc(a)) return; side = side || 'buy';
    if (side === 'sell' && !(last && +last.raw > 0)) return;
    wD = setTimeout(() => { const k = side + a + '|' + v + '|' + (last ? last.raw : ''); if (k === wK && Date.now() - wT < 1500) return; wK = k; wT = Date.now(); send('prep', side === 'buy' ? { a, sol: v, isMint } : { a, side, pct: v, isMint }); }, 150);
  };
  /* Callout: posts from your pump.fun login in this Chrome (the same request as pump.fun's own Callout button) */
  const CS = { 'ELIGIBLE': ['Ready to post', 'ok'], 'CALLED': ['Already called', ''], 'LOGIN': ['Log in to pump.fun', 'bad'], 'VERIFY': ['Open pump.fun once', 'bad'], 'INSUFFICIENT_BALANCE': ['Hold the coin first', ''] };
  const cStat = (v, k) => { const e = $('.cst'); e.textContent = v || ''; e.className = 'rt cst' + (k ? ' ' + k : ''); e.title = v || ''; };
  let cT = 0, cI = 0, cUpd = false;
  const cMode = (upd, left) => {   /* already called: the same field and button update it, like pump.fun's Update callout */
    cUpd = upd; $('.cpost').textContent = upd ? 'Update' : 'Post';
    $('.cth').placeholder = upd ? 'Write the new text' : 'Write your callout';
    $('.cpost').title = upd ? 'Post an update on your callout, like the Update button on pump.fun' : 'Post a callout on pump.fun';
  };
  const pickText = () => { const L = (C.cTexts || []).filter(Boolean); if (!L.length) return ''; cI = (cI + 1) % L.length; return L[cI]; };
  async function cCheck() {
    if (!A || $('.sc').classList.contains('shut')) return; const a = A; cStat('Checking…');
    const r = await send('calloutCheck', { a, isMint: isMintPage() }); if (a !== A) return;
    if (r.err) { cStat(r.err, 'bad'); return; }
    if (r.v === 'CALLED') { cMode(true, 1); cStat('Called · post an update', 'ok'); $('.cpost').disabled = false; return; }
    cMode(false); const m = CS[r.v] || [String(r.v || '').toLowerCase().replace(/_/g, ' '), '']; cStat(m[0], m[1]); $('.cpost').disabled = r.v === 'LOGIN';
  }
  /* Auto sell: Safe 2x (always one click in the header), take profit, stop loss, trailing; saved in the extension, the worker runs them */
  let AS = null;
  const kmc = v => v >= 1e9 ? +(v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? +(v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
  const mcIn = s => { const m = String(s).trim().replace(/[$\s]/g, '').replace(',', '.').match(/^(\d*\.?\d+)([kmb])?$/i); if (!m) return NaN;
    const v = +m[1], u = (m[2] || '').toLowerCase(); return u === 'k' ? v * 1e3 : u === 'm' ? v * 1e6 : u === 'b' ? v * 1e9 : v < 1000 ? v * 1e3 : v; };   /* "30" = 30K */
  const byMc = k => AS && AS[k] && AS[k].by === 'mc';
  const asSum = () => { if (!AS) return; const t = []; if (AS.safe) t.push('Safe 2x'); if (AS.tp.on) t.push(byMc('tp') ? 'TP $' + kmc(AS.tp.mc) : 'TP +' + AS.tp.at + '%'); if (AS.sl.on) t.push(byMc('sl') ? 'SL $' + kmc(AS.sl.mc) : 'SL −' + AS.sl.at + '%'); if (AS.tr.on) t.push('Trail −' + AS.tr.at + '%');
    const e = $('.ast'); e.textContent = t.filter(x => x !== 'Safe 2x').join(' · '); e.title = t.join(' · ') || 'No auto sell'; e.classList.toggle('on', t.length > 0); };
  function asPaint() {
    if (!AS) return; $('.asf').checked = AS.safe;
    for (const [k, cl] of [['tp', '.atp'], ['sl', '.asl'], ['tr', '.atr']]) { $(cl).checked = AS[k].on; $(cl).closest('.ar').classList.toggle('off', !AS[k].on); }
    for (const k of ['tp', 'sl']) { const mc = byMc(k), b = R.querySelector('.aby[data-k="' + k + '"]'), x = R.querySelector('.ain[data-k="' + k + '.at"]');
      b.textContent = mc ? 'MC' : '%'; b.classList.toggle('on', mc); b.closest('.af').querySelector('.apx').textContent = mc ? 'at' : k === 'tp' ? 'at +' : 'at −';
      x.classList.toggle('mc', mc); x.setAttribute('aria-label', (k === 'tp' ? 'Take profit' : 'Stop loss') + (mc ? ' at market cap, $' : ' at, %')); }
    $$('.ain').forEach(x => { const [k, f] = x.dataset.k.split('.'); if (document.activeElement !== host || R.activeElement !== x) x.value = f === 'at' && byMc(k) ? '$' + kmc(AS[k].mc) : AS[k][f]; });
    asSum();
  }
  async function asSave() { const r = await send('saveAuto', AS); if (r && !r.err) { AS = r; asPaint(); } else status('Auto sell not saved: ' + ((r && r.err) || ''), 'bad'); }
  (async () => { AS = await send('autoCfg'); if (AS && !AS.err) asPaint(); })();
  $('.asf').onchange = () => { AS.safe = $('.asf').checked; asSave(); status(AS.safe ? 'Safe trade on: at 2x the initials are sold by themselves' : 'Safe trade off', AS.safe ? 'ok' : ''); };
  for (const [k, cl] of [['tp', '.atp'], ['sl', '.asl'], ['tr', '.atr']]) $(cl).onchange = () => { AS[k].on = $(cl).checked; asSave(); };
  $$('.ain').forEach(x => {
    x.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') x.blur(); }; x.onkeyup = e => e.stopPropagation();
    x.onchange = () => { const [k, f] = x.dataset.k.split('.');
      if (f === 'at' && byMc(k)) { const v = mcIn(x.value), ok = v >= 100 && v <= 1e12; x.classList.toggle('bad', !ok); if (!ok) { status('Market cap in $, like 30k or 1.5m', 'bad'); return; } AS[k].mc = v; asSave(); return; }
      const v = +String(x.value).replace(',', '.'), hi = f === 'pct' ? 100 : k === 'tp' ? 10000 : 99;
      const ok = v >= 1 && v <= hi; x.classList.toggle('bad', !ok); if (!ok) { status((f === 'pct' ? 'Sell 1-100 %' : 'Level 1-' + hi + ' %'), 'bad'); return; } AS[k][f] = v; asSave(); };
  });
  $$('.aby').forEach(b => { b.onclick = () => { if (!AS) return; const k = b.dataset.k, r = AS[k]; r.by = r.by === 'mc' ? 'pct' : 'mc'; if (!(r.mc >= 100)) r.mc = k === 'tp' ? 30000 : 5000; asSave();
    const nm = k === 'tp' ? 'Take profit' : 'Stop loss';
    status(r.by === 'mc' ? nm + ' by market cap: sells ' + r.pct + '% when MC ' + (k === 'tp' ? 'reaches' : 'falls to') + ' $' + kmc(r.mc) : nm + ' by % from your entry', 'ok'); }; });
  $('.atg').onclick = () => { const shut = $('.sa').classList.toggle('shut'); $('.atg').setAttribute('aria-expanded', !shut); chrome.storage.local.set({ aShut: shut }); };
  $('.ctg').onclick = () => { const shut = $('.sc').classList.toggle('shut'); $('.ctg').setAttribute('aria-expanded', !shut); chrome.storage.local.set({ cShut2: shut }); if (!shut) cCheck(); };
  $('.cnx').onclick = () => { $('.cth').value = pickText(); };
  $('.cth').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('.cpost').click(); };
  $('.cth').onkeyup = e => e.stopPropagation();
  $('.cau').onchange = () => chrome.storage.local.set({ cAuto: $('.cau').checked });
  $('.cpost').onclick = async () => {
    if (!A) return; const text = $('.cth').value.trim(), upd = cUpd;
    if (upd && !text) { status('Write the new text, then Update', 'bad'); $('.cth').focus(); return; }
    $('.cpost').disabled = true; cStat(upd ? 'Updating…' : 'Posting…'); status(upd ? 'Callout: updating…' : 'Callout: waiting until pump.fun lets you post…');
    const r = await send('callout', { a: A, isMint: isMintPage(), text, update: upd });
    $('.cpost').disabled = false;
    if (r.err) { cStat(upd ? 'Not updated' : 'Not posted', 'bad'); status('Callout: ' + r.err, 'bad'); }
    else { status((upd ? 'Callout updated' : 'Callout posted') + (text ? ': ' + text : ''), 'ok'); $('.cth').value = ''; setTimeout(cCheck, 1200); }
  };
  function place(x, y) {
    const h = (P.offsetHeight || 360) * Z, w = (P.offsetWidth || 322) * Z;
    x = Math.min(Math.max(8, x), innerWidth - w - 8); y = Math.min(Math.max(8, y), innerHeight - h - 8);
    { const dp = devicePixelRatio || 1; x = Math.round(x * dp) / dp; y = Math.round(y * dp) / dp; }   /* 3.27.5: whole screen pixels, so the logo and hairlines stay sharp */
    P.style.left = x / Z + 'px'; P.style.top = y / Z + 'px'; if (S.classList.contains('on')) requestAnimationFrame(toastAt); return [x, y];
  }
  (function drag() {
    let d = null; const tb = $('.tb');
    tb.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = P.getBoundingClientRect(); d = [e.clientX - r.left, e.clientY - r.top]; tb.setPointerCapture(e.pointerId); });
    let fr = 0, lx = 0, ly = 0;   /* 3.20.0: one move per frame, however fast the mouse sends events */
    tb.addEventListener('pointermove', e => { if (!d) return; lx = e.clientX; ly = e.clientY; if (!fr) fr = requestAnimationFrame(() => { fr = 0; if (d) place(lx - d[0], ly - d[1]); }); });
    tb.addEventListener('pointerup', () => { if (!d) return; d = null; const r = P.getBoundingClientRect(); chrome.storage.local.set({ at: [r.left, r.top] }); });
  })();
  (function extend() {
    const xt = $('.xt'); let d = null;
    const set = on => { if (on === EXT) return; EXT = on; chrome.storage.local.set({ ext: on }); build(); };
    xt.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); d = { y: e.clientY, moved: false }; xt.setPointerCapture(e.pointerId); });
    xt.addEventListener('pointermove', e => { if (!d) return; const dy = (e.clientY - d.y) / Z; if (dy > 18) { d.moved = true; set(true); d.y = e.clientY; } else if (dy < -18) { d.moved = true; set(false); d.y = e.clientY; } });
    xt.addEventListener('pointerup', () => { if (!d) return; if (!d.moved) set(!EXT); d = null; });
  })();
  const PWMIN = 280, PWMAX = 760, KHMIN = 28, KHMAX = 160; let KH = 33;   /* 3.27.4 (owner: "growing up feels capped"): keys up to 160 high, panel up to 760 wide */   /* 3.27.2: keys 33 by default (reference look); the edges still make them taller */
  (function resize() {
    /* 3.20.2 (owner: "pull right = it gets wider, the same up and down"): every edge and corner changes the SIZE, it never scales.
       Left / right = width (the keys widen), top / bottom = height (the keys get taller); the text keeps its size; the opposite side stays put.
       Scale (zoom) stays on the slider in the settings window. The middle of the bottom edge is still the extend handle */
    let d = null;
    const rows = () => Math.max(1, Math.ceil($$('.rb .c, .rs .c').length / 4));
    for (const h of $$('.rh')) {
      h.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const r = P.getBoundingClientRect();
        d = { k: h.dataset.d, x: e.clientX, y: e.clientY, r, w: P.offsetWidth, kh: KH, n: rows() }; h.setPointerCapture(e.pointerId); });
      h.addEventListener('pointermove', e => {
        if (!d) return; const k = d.k, r = d.r, dx = (e.clientX - d.x) / Z, dy = (e.clientY - d.y) / Z;
        if (k.includes('e') || k.includes('w')) { const w = Math.round(Math.min(PWMAX, Math.max(PWMIN, d.w + (k.includes('e') ? dx : -dx)))); P.style.width = w + 'px'; }
        if (k.includes('n') || k.includes('s')) { KH = Math.round(Math.min(KHMAX, Math.max(KHMIN, d.kh + (k.includes('s') ? dy : -dy) / d.n))); P.style.setProperty('--kh', KH + 'px'); }
        const b = P.getBoundingClientRect();
        place(k.includes('w') ? r.right - b.width : r.left, k.includes('n') ? r.bottom - b.height : r.top);
      });
      h.addEventListener('pointerup', () => { if (!d) return; d = null; const r = P.getBoundingClientRect(); chrome.storage.local.set({ pwid: P.offsetWidth, pkh: KH, at: [r.left, r.top] }); });
    }
  })();

  /* Pulse quick buy (3.8.1, owner 1117: "only ours", and the floating button slid away on scroll): our button now lives INSIDE each row, in
     the box of Axiom's own quick-buy button, which is hidden (visibility only, so the row keeps its layout). It scrolls with the row and is
     there on every row, not only under the mouse. Each one is a tiny closed shadow root, so the page's styles never reach it, and its
     mouse events stop at it, so Axiom's button and row (open the coin) never see the click. Settings -> Pulse quick buy off = Axiom's back. */
  const QCSS = '<style>:host{all:initial}button{all:unset;box-sizing:border-box;width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:6px;'
    + 'white-space:nowrap;background:#0027D2;color:#fff;font:600 var(--fs,12px)/1 HakiGeist,Geist,system-ui,sans-serif;border-radius:var(--rd,6px);cursor:pointer;'
    + 'transition:background-color .12s}button:hover{background:#1A3DE0}button:active{transform:scale(.98)}button:focus-visible{outline:2px solid rgba(255,255,255,.55);outline-offset:1px}'
    + 'button[disabled]{opacity:.6;cursor:default}.qm{width:1.3em;height:1.3em;border-radius:24%;flex:none;display:block;box-shadow:0 0 0 1px rgba(255,255,255,.18)}</style>';
  const QAMT = /^(\d+(?:\.\d+)?)\s*SOL$/, QMISS = new WeakMap();
  const ROWA = HOST === 'gmgn' ? 'data-trenches-token-address' : HOST === 'padre' ? 'data-trenches-item' : 'data-pulse-token-address';   /* 3.13.0: the list row's coin, per host */
  const rowOf = t => t && t.closest ? t.closest('[' + ROWA + ']') : null;
  /* the row's Solana coin, or null for another chain (3.13.4: GMGN BSC rows hold 0x addresses, Terminal "BSC:..." items: no button there) */
  const rowAddr = row => {
    const v = row && row.getAttribute(ROWA); if (!v) return null;
    if (HOST === 'padre') { const m = v.match(new RegExp('^SOLANA:(' + B58 + ')(?:-|$)')); return m ? m[1] : null; }
    return new RegExp('^' + B58 + '$').test(v) ? v : null;
  };
  const painted = x => { const cs = getComputedStyle(x), bg = cs.backgroundColor; return (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) || parseFloat(cs.borderTopLeftRadius) > 0; };
  function axPill(row) {   /* Axiom's quick-buy button of the row: of the elements whose whole text is "<n> SOL", the painted one */
    /* 3.13.8: textContent, not innerText: a host button we hid earlier (its button since lost to a re-render) reads empty through innerText */
    const cand = [...row.querySelectorAll('*')].filter(x => x.tagName !== 'HK-QB' && QAMT.test((x.textContent || '').trim()) && x.getBoundingClientRect().width > 0);
    return cand.find(x => painted(x) && x.getBoundingClientRect().width < 320) || null;
  }
  /* 3.13.0 GMGN Trenches: its "⚡ Buy" is the whole right block of the row (MC / V drawn over it by a click-through layer): ours takes
     that block, see-through so the numbers stay readable, our amount at the bottom where GMGN's "Buy" was */
  const gmPill = row => { const x = row.querySelector('[class*="bg-btn-secondary-buy"]'); return x && x.getBoundingClientRect().width > 0 ? x : null; };
  const qAmtOf = pill => { const m = (pill.textContent || '').trim().match(QAMT); const v = m ? +m[1] : 0; return v > 0 && v <= 100 ? v : +C.quick; };
  function qLabel(h) { const v = qAmtOf(h.parentElement); if (h._v === v || h._busy) return; h._v = v; h._t.textContent = v + ' SOL'; h._b.title = 'HAKI quick buy ' + v + ' SOL (no ' + (HOST === 'gmgn' ? 'GMGN' : HOST === 'padre' ? 'Terminal' : 'Axiom') + ' fee)'; }
  function qMount(row) {
    /* an older copy's button: replaced by ours. 3.13.8: its host button is shown again first (left hidden, its text reads empty and the row
       never got a new button after an update) */
    for (const x of row.querySelectorAll('hk-qb')) if (x.dataset.hv !== VER) { const p = x.parentElement; x.remove(); if (p) p.style.visibility = ''; QMISS.delete(row); }
    let h = row.querySelector('hk-qb');
    if (h) { const p = h.parentElement; if (p.style.visibility !== 'hidden') p.style.visibility = 'hidden'; qLabel(h); return; }
    if (QMISS.get(row) > Date.now() - 2000) return;   /* a row without Axiom's button: looked again only every 2 s (the search reads layout) */
    if (!rowAddr(row)) { QMISS.set(row, Date.now()); return; }   /* not a Solana coin */
    const pill = HOST === 'gmgn' ? gmPill(row) : axPill(row); if (!pill) { QMISS.set(row, Date.now()); return; }
    const txt = [...pill.querySelectorAll('*')].reverse().find(x => QAMT.test((x.textContent || '').trim())) || pill;
    h = document.createElement('hk-qb'); h.dataset.hv = VER;
    h.style.cssText = 'all:initial;position:absolute;inset:0;display:block;visibility:visible;z-index:2';
    const sr = h.attachShadow({ mode: 'closed' });
    /* 3.13.4 (owner: "hurts the eyes, make it neat like on GMGN"): a big block (GMGN, Terminal, Axiom's new Pulse cards) = dark card with a thin
       blue edge and the amount bottom-right; only a small pill keeps the solid blue */
    /* 3.13.5 (owner: "empty spaces, make it neater"): the amount sits centred in the free part of the card, under the host's own numbers
       (V / MC / F / TX drawn over the block), a little larger, instead of a lone label in the bottom corner */
    /* 3.13.6 (owner: "not neat at all, make it beautiful"): one right-aligned column, like the host's own lines: V / MC, F / NB / TX, then our
       buy chip on the same right edge, the same gap under the last line as between the host's lines. The chip (logo + amount in a rounded
       frame) says "button"; the whole card still buys. */
    /* 3.13.7 (owner: "it's empty; F / NB / TX in a column; the amount neater, no frame"): Axiom's F / NB / TX line is stacked into a column
       (pulseStack below), so the card's numbers fill its height; our amount sits plain (logo + amount, no frame) in the bottom-right corner,
       on the same right edge as the numbers and as far from the bottom as they are from the right */
    const pr = pill.getBoundingClientRect(), big = pr.height > 40;
    let rIn = 10;
    if (big) { const R = []; for (const x of row.querySelectorAll('*')) {
      if (x.children.length || pill.contains(x) || !(x.textContent || '').trim()) continue;
      const b = x.getBoundingClientRect(); if (b.width && b.left >= pr.left - 1 && b.right <= pr.right + 1 && b.top >= pr.top - 1 && b.bottom <= pr.bottom + 1) R.push(pr.right - b.right); }
      if (R.length) rIn = Math.max(6, Math.min(...R)); }
    /* 3.13.10 (owner showed GMGN's own card: "see how neat, do the same"): a quiet card (barely lighter than the page, a faint edge), the
       amount in buy green with a small mark, nothing else */
    sr.innerHTML = QCSS + (big ? '<style>button{background:rgba(255,255,255,.025);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);color:#2FD28A;align-items:flex-end;justify-content:flex-end;gap:5px;'
      + 'padding:0 ' + Math.round(rIn) + 'px ' + Math.round(Math.max(8, rIn)) + 'px 0;font:600 13px/1 HakiGeist,Geist,system-ui,sans-serif;font-variant-numeric:tabular-nums}'
      + 'button:hover{background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(47,210,138,.35)}.qm{width:14px;height:14px;border-radius:3px;box-shadow:none}</style>' : '')
      + '<button type="button">' + QM + '<span></span></button>';
    h._b = sr.querySelector('button'); h._t = sr.querySelector('span');
    h.style.setProperty('--fs', (parseFloat(getComputedStyle(txt).fontSize) || 12) + 'px');
    h.style.setProperty('--rd', parseFloat(getComputedStyle(pill).borderTopLeftRadius) > 0 ? getComputedStyle(pill).borderTopLeftRadius : '6px');
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick'])
      h.addEventListener(t, e => { e.stopPropagation(); e.preventDefault(); if (t === 'click' && e.isTrusted) qBuy(h); });   /* 3.21.4 security: only a real mouse click buys (a page script's .click() / dispatchEvent is not trusted) */
    h._b.addEventListener('mouseenter', () => { const a = rowAddr(rowOf(h)); if (a) warm(a, qAmtOf(h.parentElement), true); });
    if (getComputedStyle(pill).position === 'static') pill.style.position = 'relative';
    pill.style.visibility = 'hidden'; pill.appendChild(h); qLabel(h);
  }
  function qUnmount() { for (const h of document.querySelectorAll('hk-qb')) { const p = h.parentElement; h.remove(); if (p) p.style.visibility = ''; } }
  async function qBuy(h) {
    const row = rowOf(h), a = rowAddr(row); if (!a || h._busy || !new RegExp('^' + B58 + '$').test(a)) return;
    if (PAPER) {   /* 3.23.0: a quick buy in a list is a paper buy too */
      const amt = qAmtOf(h.parentElement); h._busy = true; h._b.disabled = true; h._t.textContent = 'Paper…';
      const r = await send('paperTrade', { side: 'buy', a, isMint: true, v: amt }); h._b.disabled = false; h._t.textContent = r && !r.err ? 'Paper ✓' : 'Failed';
      if (!r || r.err) status('Paper quick buy: ' + ((r && r.err) || 'failed'), 'bad'); else { status('Paper buy ' + amt + ' SOL · play money, nothing sent', 'ok'); window.hkSound('buy'); }
      if (P.hidden) P.hidden = false; setTimeout(() => { h._busy = false; h._v = null; if (h.isConnected) qLabel(h); }, 1600); return;
    }
    const amt = qAmtOf(h.parentElement), t0 = Date.now(); h._busy = true; h._b.disabled = true; h._t.textContent = 'Buying…';
    const r = await send('trade', { side: 'buy', a, sol: amt, key: uid(), isMint: true });
    h._b.disabled = false; h._t.textContent = r.err ? 'Failed' : r.sent === false ? (r.sim_err ? 'Sim failed' : 'Simulated') : 'Sent';
    h._b.title = r.err || '';
    if (r.err) status('Quick buy: ' + r.err, 'bad');
    else if (r.sent === false) status('Quick buy, test mode: ' + (r.sim_err ? simWhy(r.sim_err) : 'simulated OK, nothing sent'), r.sim_err ? 'bad' : 'ok');
    if (P.hidden) P.hidden = false;   /* on Pulse (no token page) the panel opens to show the result */
    setTimeout(() => { h._busy = false; h._v = null; if (h.isConnected) qLabel(h); }, 1600);
    if (r.sig && r.sent) sent(r, 'Quick buy ' + amt + ' SOL', t0);
  }
  /* rows come and go (virtual list, live updates): a light scan, at most every 250 ms after the page changed, mounts the new ones */
  let qOn = false, qT = 0;
  const qScan = () => {
    qT = 0; if (!alive()) return; const on = !!(C && C.pulse && C.wallet);
    const stack = document.getElementById('hk-pulse-stack');
    if (!on) { if (qOn) { qOn = false; qUnmount(); } if (stack) stack.remove(); return; }
    qOn = true;
    /* 3.13.7 (owner): Axiom Pulse cards, F / NB / TX as a column under V / MC (Axiom's own small-screen layout), so the card is not half empty */
    if (HOST === 'axiom' && !stack) { const st = document.createElement('style'); st.id = 'hk-pulse-stack';
      st.textContent = '[data-pulse-token-address] div[class*="z-20"][class*="sm:flex-row"]{flex-direction:column!important;align-items:flex-end!important;gap:4px!important}';
      (document.head || document.documentElement).appendChild(st); }
    for (const row of document.querySelectorAll('[' + ROWA + ']')) { try { qMount(row); } catch (_) {} }
  };
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 400 }) : setTimeout(f, 250));   /* 3.20.0: in the page's idle time */
  new MutationObserver(() => { if (!qT) qT = idle(qScan) || 1; }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (!qT && !document.hidden) qT = idle(qScan) || 1; }, 2000);   /* settings changed, or a re-render that only touched attributes */

  /* 3.9.0 Multi launch button in Axiom's coin header (the empty stretch right of the stats): new pump.fun coins with this coin's name,
     ticker and picture from the launch wallet in Settings. One click launches (owner 1118: no confirm step). */
  /* 3.9.1 (owner: "neater, the colour is unpleasant, drop x5"): a quiet outline chip in the header's own tones, like its other controls */
  const MCSS = '<style>:host{all:initial}button{all:unset;box-sizing:border-box;height:32px;padding:0 12px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;'
    + 'background:transparent;color:#C8CBD3;border:1px solid rgba(255,255,255,.12);font:500 13px/1 HakiGeist,Geist,system-ui,sans-serif;border-radius:8px;cursor:pointer;'
    + 'transition:background-color .12s,border-color .12s,color .12s}button:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2);color:#fff}'
    + 'button:active{transform:scale(.98)}button:focus-visible{outline:2px solid rgba(255,255,255,.55);outline-offset:1px}'
    + 'button.arm{color:#F5A524;border-color:rgba(245,165,36,.45);background:rgba(245,165,36,.08)}button[disabled]{opacity:.6;cursor:default}'
    + '.qm{width:16px;height:16px;border-radius:4px;flex:none;display:block;opacity:.9}button[hidden]{display:none}button.og.self .qm,button.og.wait .qm{opacity:.45}'
    + 'button.og.wait{color:#6C7079}button.og.self{color:#6C7079;border-color:rgba(255,255,255,.08)}button.og.self:hover{color:#A1A5AD}</style>';
  let ML = null, mlArm = 0; const VER = chrome.runtime.getManifest().version;
  function mlHeader() {   /* the coin header row: 5 levels above its "ATH" label; our spot = its empty flex-grow child */
    const ath = [...document.querySelectorAll('span,div')].find(e => !e.children.length && (e.textContent || '').trim() === 'ATH' && e.getBoundingClientRect().top < 160);
    let row = ath; for (let i = 0; i < 5 && row; i++) row = row.parentElement;
    if (!row) return null;
    return [...row.children].find(c => !(c.textContent || '').trim() && getComputedStyle(c).flexGrow === '1' && c.getBoundingClientRect().width > 200) || null;
  }
  async function mlCount() { try { const { spamN = 5 } = await chrome.storage.local.get({ spamN: 5 }); return Math.max(1, Math.min(10, +spamN || 5)); } catch (_) { return 5; } }
  async function mlLabel() { if (!ML || ML._busy) return; const n = await mlCount(); ML._t.textContent = mlArm ? 'Confirm ' + n + ' coins' : 'Multi'; ML._b.title = 'Launch ' + n + " new pump.fun coins with this coin's name, ticker and picture from your launch wallet (Settings > Wallets)."; ML._b.classList.toggle('arm', !!mlArm); }
  let mlMiss = 0, mlNext = 0, mlA = null;
  function mlMount() {
    if (!alive()) { if (ML) ML.remove(); return; }   /* the extension was updated: this copy steps aside for the new one */
    if (!A || !isMintPage() || !C) { if (ML && ML.isConnected) ML.remove(); return; }
    if (ML && ML.isConnected) { ML._b.hidden = !C.wallet; if (ML._oa !== A) ogLook(); mlMiss = 0; return; }
    /* 3.20.0: looking for the header reads every span / div: after 10 misses on this coin, only every 4 s */
    if (mlA !== A) { mlA = A; mlMiss = 0; mlNext = 0; }
    if (Date.now() < mlNext) return; if (++mlMiss > 10) mlNext = Date.now() + 4000;
    const old = [...document.querySelectorAll('hk-ml')].filter(e => e !== ML);   /* buttons of an older copy (until the page reloads) */
    if (!document.getElementById('hk-ml-css-' + VER)) { for (const x of document.querySelectorAll('style[id^="hk-ml-css"]')) x.remove(); const st = document.createElement('style'); st.id = 'hk-ml-css-' + VER; st.textContent = 'hk-ml:not([data-hv="' + VER + '"]),hk-qb:not([data-hv="' + VER + '"]){display:none!important}'; document.documentElement.appendChild(st); }
    const spot = old.length ? old[0].parentElement : mlHeader(); if (!spot) return;
    ML = document.createElement('hk-ml'); ML.dataset.hv = VER; ML.style.cssText = 'all:initial;display:inline-flex;align-items:center;height:100%;padding-left:16px;margin-right:auto;gap:12px';   /* 3.9.8: gap inline (all:initial overrode :host{gap}) */
    const sr = ML.attachShadow({ mode: 'closed' }); sr.innerHTML = MCSS + '<button type="button" class="m">' + QM + '<span></span></button><button type="button" class="og wait">' + QM + '<span>OG</span></button>';
    ML._b = sr.querySelector('.m'); ML._t = sr.querySelector('.m span'); ML._og = sr.querySelector('.og'); ML._b.hidden = !C.wallet;
    ML._b.title = "Launch new pump.fun coins with this coin's name, ticker and picture from your launch wallet (Settings > Wallets)";
    /* each button has its own click listener INSIDE the shadow root (3.9.5: from the host, a closed root hides which button was hit,
       so 3.9.4 sent an OG click to Multi); the host only keeps the page from seeing the events */
    ML._b.addEventListener('click', e => { e.preventDefault(); if (e.isTrusted) mlClick(); });
    ML._og.addEventListener('click', e => { e.preventDefault(); if (e.isTrusted) ogGo(e.ctrlKey || e.metaKey); });
    ML._og.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); ogGo(true); } });
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick']) ML.addEventListener(t, e => e.stopPropagation());
    spot.prepend(ML); mlLabel(); ogLook();
  }
  async function mlClick() {
    if (!ML || ML._busy || !A) return;
    ML._busy = true;   /* 3.9.3 (owner): one click launches, no confirm step */ ML._b.disabled = true; ML._b.classList.remove('arm'); ML._t.textContent = 'Launching…';
    const r = await send('launch', { a: A, isMint: isMintPage() });
    ML._busy = false; ML._b.disabled = false;
    if (P.hidden) P.hidden = false;
    if (r.err) { status('Multi: ' + r.err, 'bad'); ML._t.textContent = 'Failed'; }
    else if (r.sent === false) { status('Multi, test mode: ' + (r.sim_err ? 'simulation failed ' + JSON.stringify(r.sim_err).slice(0, 60) : 'simulated OK, nothing sent'), r.sim_err ? 'bad' : 'ok'); ML._t.textContent = 'Simulated'; }
    else {
      const ok = r.list.filter(x => !x.err);
      status('Multi: ' + ok.length + ' of ' + r.n + ' ' + r.meta.symbol + ' coins sent from ' + r.wallet + (ok.length ? ' · ' + ok.map(x => x.mint.slice(0, 4) + '…' + x.mint.slice(-4)).join(', ') : '') + (ok.length < r.n ? ' · ' + (r.list.find(x => x.err) || {}).err : ''), ok.length ? 'ok' : 'bad');
      ML._t.textContent = ok.length ? 'Sent ' + ok.length : 'Failed';
    }
    setTimeout(mlLabel, 2500);
  }
  /* 3.9.4 OG button (owner 1118): the first coin ever made with this coin's name, looked up as soon as the page opens; a click goes there
     (Ctrl / middle click: new tab). On the OG itself the button is dim and says so. */
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 3600 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  const usd = v => v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v) + '';
  /* 3.9.7: one lookup as the coin opens (~1-2 s, at once for another copy of a name already looked up); the click uses its answer */
  async function ogLook(fresh) {
    if (!ML) return; const a = A, b = ML._og; ML._oa = a; ML._or = null;
    b.className = 'og wait'; b.title = 'Looking for the first coin with this name…';
    ML._od = send('og', { a, isMint: isMintPage(), fresh: !!fresh });
    const r = await ML._od;
    if (!ML || ML._oa !== a) return;
    ogShow(r, b);
    if (r && r.refining) {   /* 3.12.11: the full answer (similar pictures) replaces the quick one when it is in */
      ML._fd = send('og', { a, isMint: isMintPage(), full: true });
      const f = await ML._fd; ML._fd = null;
      if (ML && ML._oa === a && f && !f.err) ogShow(f, b);
    }
  }
  function ogShow(r, b) {
    ML._or = r; b.className = 'og';
    const how = ' Checked ' + r.n + ' coin' + (r.n === 1 ? '' : 's') + ' with this name' + (r.pair ? ' in this pair' + (r.nAll > r.n ? ' (' + r.nAll + ' in all pairs)' : '') : '') + (r.full === false ? ' (a search limit was hit, may be incomplete)' : '') + '.'
      + (r.pic ? ' Picture: ' + r.pic + '.' : '') + (r.any ? ' The very first with this name in any pair: ' + r.any.name + ', ' + ago(r.any.t) + ' ago.' : '');   /* 3.12.5: OG = the first of the same pair; 3.12.6: and the same picture */
    if (r.err) { b.title = 'OG not found: ' + r.err + '. Click to try again.'; return; }
    if (r.self) { b.classList.add('self'); b.title = 'This coin is the OG: the first one named "' + r.name + '"' + (r.pair ? ' in this pair' : '') + '.' + how; return; }
    const o = r.og; b.title = 'Open the OG: ' + o.name + ' (' + o.sym + '), made ' + ago(o.t) + ' ago' + (r.me.t ? ' (' + ago(Date.now() - (r.me.t - o.t)) + ' before this one)' : '') + (o.mc ? ', MC $' + usd(o.mc) : '') + '.' + how;
  }
  async function ogGo(tab) {
    if (!ML) return;
    if (!ML._or && ML._od) { const a = ML._oa; await ML._od; if (!ML || ML._oa !== a) return; }   /* only a click in the first second waits */
    if (ML._fd) { const a = ML._oa; await Promise.race([ML._fd, new Promise(z => setTimeout(z, 1500))]); if (!ML || ML._oa !== a) return; }   /* 3.12.11: a click during the refine waits for it, at most 1.5 s */
    const r = ML._or;
    if (!r) return;
    if (r.err) { ogLook(true); return; }
    if (P.hidden) P.hidden = false;
    if (r.self) { status('OG: this coin is the first one named "' + r.name + '"' + (r.pair ? ' in this pair' : ''), 'ok'); return; }
    const u = location.origin + '/token/' + r.og.a;
    if (tab) window.open(u, '_blank', 'noopener'); else location.assign(u);
  }
  if (HOST === 'axiom') setInterval(() => { try { mlMount(); } catch (_) {} }, 700);   /* 3.13.0: Axiom's header only for now */

  /* Axiom's own windows (image viewer, dialogs, menus over the whole page) cover the page: the panel steps aside while one is open
     and comes back when it closes. A window = a fixed element over most of the screen that was not part of the page when it loaded. */
  const BASE = new WeakSet(); let covered = false, baseAt = 0, qPath = location.pathname;
  const bigFixed = el => {
    for (let e = el, i = 0; e && e !== document.body && e !== document.documentElement && i < 30; e = e.parentElement, i++) {
      const cs = getComputedStyle(e); if (cs.position !== 'fixed') continue;
      if (!(+cs.zIndex >= 10)) return null;   /* windows sit on a z-index; a page frame (z-index auto / low) is not one */
      const r = e.getBoundingClientRect(); return r.width >= innerWidth * 0.8 && r.height >= innerHeight * 0.8 ? e : null;
    }
    return null;
  };
  const PTS = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
  const topFixed = () => PTS.map(([x, y]) => { const el = document.elementsFromPoint(innerWidth * x, innerHeight * y).find(e => e !== host); return el ? bigFixed(el) : null; });
  function cover() {
    if (document.hidden) return;
    const F = topFixed();
    if (Date.now() < baseAt) { F.forEach(f => f && BASE.add(f)); return; }   /* the page's own full-screen frame, learnt while it loads */
    const on = F.filter(f => f && !BASE.has(f)).length >= 3;
    if (on !== covered) { covered = on; host.style.visibility = on ? 'hidden' : ''; }
  }
  let covT = 0;
  function route() {
    if (location.pathname !== qPath) { qPath = location.pathname; baseAt = Date.now() + 1500; covT = 0; pathAt = Date.now(); }
    /* 3.20.0 (owner: "smooth"): reading the page's layout 3 times a second made the host stutter; now once a second, between frames */
    if (Date.now() - covT > 1000) { covT = Date.now(); requestAnimationFrame(cover); }
    const a = pageAddr(); if (a === A) return; A = a; last = null;
    if (A && isMintPage() && !isBsc(A)) send('og', { a: A, isMint: true }).catch(() => {});
    if (C) { build(); paintSet(); refreshBal(); }   /* 3.14.1: SOL / BNB mode follows the coin */   /* 3.12.9: the OG lookup starts as the coin opens, before the button is there */
    for (const k of ['.pb', '.ps', '.ph']) $(k).textContent = '0'; $('.pn').textContent = '+0'; $('.pn').className = 'pn'; $('.pp').textContent = '+0%'; $('.pp').className = 'pp num';
    $('.pos').textContent = 'No position'; $('.rs').classList.add('off'); $('.init').disabled = true; status('');
    P.hidden = !A; watchNow();
    $('.cth').value = ''; $('.cpost').disabled = false; cMode(false); cStat(''); clearTimeout(cT); if (A) cT = setTimeout(cCheck, 600);   /* 3.14.3: Callout posts to pump.fun: every host, BSC coins too */
  }
  async function init() {
    C = await send('cfg'); if (!C || C.err) return;
    document.documentElement.appendChild(host); build(); showUpd(C.upd);
    const st = await chrome.storage.local.get({ at: null, min: false, cShut2: false, aShut: true, ext: false, sellMode: 'pct', sellSol: SSOL, sellSol2: SSOL2, pwid: 0, pkh: 0 }); EXT = !!st.ext;
    if (+st.pwid >= PWMIN && +st.pwid <= PWMAX) P.style.width = +st.pwid + 'px';   /* 3.20.2: the size you pulled it to */
    if (+st.pkh >= KHMIN && +st.pkh <= KHMAX) { KH = +st.pkh; P.style.setProperty('--kh', KH + 'px'); }
    SM = st.sellMode === 'sol' ? 'sol' : 'pct'; SSOL = st.sellSol; SSOL2 = st.sellSol2; build();
    $('.smode').onclick = () => { SM = SM === 'sol' ? 'pct' : 'sol'; chrome.storage.local.set({ sellMode: SM }); build(); };
    $('.sa').classList.toggle('shut', st.aShut !== false); $('.atg').setAttribute('aria-expanded', String(st.aShut === false));
    if (st.cShut2) { $('.sc').classList.add('shut'); $('.ctg').setAttribute('aria-expanded', 'false'); }
    if (st.min) { P.classList.add('min'); $('.mn').innerHTML = I.max; }
    P.hidden = false; const put = () => place(...(st.at || [innerWidth - 322 * Z - 16, innerHeight - (P.offsetHeight || 360) * Z - 48])); put(); P.hidden = true;
    new ResizeObserver(() => { const r = P.getBoundingClientRect(); if (r.width) place(r.left, r.top); }).observe(P);
    if (!C.wallet) status('Open HAKI Strike (toolbar icon) and add your wallet.', 'bad');
    baseAt = Date.now() + 1500; connect(); route(); setInterval(route, 300);
    refreshBal(); setInterval(() => { if (A && !busy && !document.hidden) refreshBal(); }, 30000);
    addEventListener('resize', () => { const r = P.getBoundingClientRect(); place(r.left, r.top); });
    chrome.storage.onChanged.addListener(async (ch, area) => { if (area !== 'local' || ch.at || ch.pwid || ch.pkh || ch.paper || ch.iid || ch.tping2 || ch.ext || ch.sellMode || ch.sellSol || ch.sellSol2 || ch.min || ch.led || ch.cShut2 || ch.pfCalled || ch.sellExact) return; C = await send('cfg'); build(); });
  }
  init();
})();
