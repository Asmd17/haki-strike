/* HAKI Share PnL for the Axiom panel: HAKI's share card (card/share-card.html, the same template as HAKI's Share PnL) with this coin's
   trade from the panel's ledger. Read-only: nothing is sent anywhere. Download / Copy = a PNG 2400x1350 drawn here (SVG foreignObject,
   the same way HAKI does it); Share to X opens the post window with the text and copies the image to paste into it.
   The card data is put in chrome.storage.session 'share' by the background worker (op 'share') before this window opens. */
(() => {
  const ARTS = [{ k: 'berserk', cap: 'no mercy.' }, { k: 'soldier', cap: 'cold.' }, { k: 'sniper', cap: 'one shot.' }, { k: 'knight', cap: 'rest.' }, { k: 'castle', cap: 'march.' }];
  const CARD = 'card/share-card.html', TH = 'thumbs/';
  const LS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
  const SV = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const I = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    cp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    xl: '<svg viewBox="0 0 24 24"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.57L16.67 19.2z"/></svg>'
  };
  const okArt = k => ARTS.some(x => x.k === k);
  const ST = { d: null, fav: LS('hk_ax_fav', 'berserk'), art: null, unit: LS('hk_ax_unit', 'usd'), hide: LS('hk_ax_hide', '0') === '1', busy: false };
  if (!okArt(ST.fav)) ST.fav = 'soldier';
  ST.art = okArt(LS('hk_ax_art', '')) ? LS('hk_ax_art', '') : ST.fav;
  if (ST.unit !== 'usd' && ST.unit !== 'bnb') ST.unit = 'usd';
  const $ = s => document.querySelector(s), fr = $('#s9Fr');
  const EMBED = new URLSearchParams(location.search).has('embed');   /* shown over the Axiom page by the panel (not a window of its own) */
  if (EMBED) document.documentElement.classList.add('embed');
  else setTimeout(() => {   /* 3.21.2 (owner: a black strip under the card): the window takes the card's size */
    try { const b = document.querySelector('.s9').getBoundingClientRect(); chrome.windows.getCurrent(w => { if (!w) return;
      chrome.windows.update(w.id, { width: Math.ceil(b.width + 24) + (w.width - innerWidth), height: Math.ceil(b.height + 24) + (w.height - innerHeight) }); }); } catch (_) {}
  }, 200);
  const close = () => { if (EMBED) parent.postMessage({ hakiShare: 'close' }, '*'); else window.close(); };

  function src() {
    const d = ST.d, q = new URLSearchParams({ layout: 'a', art: ST.art, state: d.pnlBnb < 0 ? 'loss' : 'profit', unit: ST.unit, hide: ST.hide ? '1' : '0' });
    if (d.kind === '1d') q.set('kind', '1d');   /* 3.12.15: a period (today / 7 days / all time) */
    /* the card reads its data from this (same-origin) page by key, not from the URL */
    const j = JSON.stringify(d); let h = 2166136261; for (let i = 0; i < j.length; i++) h = Math.imul(h ^ j.charCodeAt(i), 16777619);
    const k = (h >>> 0).toString(36) + j.length.toString(36); window.__hkCardData = { [k]: j }; q.set('dk', k);
    return CARD + '?' + q.toString();
  }
  function render() {
    const d = ST.d;
    if (d.kind === '1d') { $('#s9Coin').innerHTML = `<span class="s9lg">${esc(d.badge || '')}</span>${esc(d.range || d.ticker)}<i>${esc(d.date || '')}</i>`; $('#s9St').textContent = (d.sells || 0) + ' sells · ' + (d.buys || 0) + ' buys'; }
    else {
    $('#s9Coin').innerHTML = `<span class="s9lg">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : esc((d.ticker || '?')[0])}</span>${esc(d.ticker)}<i>${esc(d.a.slice(0, 6) + '…' + d.a.slice(-4))}</i>`;
      $('#s9St').textContent = d.open ? 'Open position' : 'Closed position';
    }
    const s = src(); if (fr.getAttribute('src') !== s) fr.setAttribute('src', s);
    const favCap = (ARTS.find(x => x.k === ST.fav) || ARTS[0]).cap;
    $('#s9Ah').textContent = `Saved favourite: ${favCap}  ·  star a tile to make it the default`;
    $('#s9Arts').innerHTML = ARTS.map(x => `<button class="s9tile ${ST.art === x.k ? 's9on' : ''}" data-s9a="${x.k}" title="${esc(x.cap)}">
      <span class="s9im"><img src="${TH}${x.k}.jpg" alt=""><span class="s9fv ${ST.fav === x.k ? 's9on' : ''}" data-s9f="${x.k}" title="${ST.fav === x.k ? 'Saved favourite' : 'Save as favourite'}">${I.star}</span></span>
      <span class="s9cap">${esc(x.cap)}</span></button>`).join('');
    document.querySelectorAll('[data-s9u]').forEach(b => b.classList.toggle('s9on', b.dataset.s9u === ST.unit));
    $('[data-s9=hide]').classList.toggle('s9on', ST.hide);
  }
  function toast(t, ms) { const e = $('#s9Toast'); e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => { e.hidden = true; }, ms || 2600); }

  /* ---- export: PNG 2400x1350 of the live preview ---- */
  const DU = {};
  const dataURL = u => DU[u] || (DU[u] = fetch(u).then(r => r.ok ? r.blob() : null).then(b => !b || !b.size ? '' : new Promise(res => {
    const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(''); f.readAsDataURL(b); })).catch(() => '').then(x => { if (!x) delete DU[u]; return x; }));
  function frameReady() {
    const t0 = Date.now();
    return new Promise((res, rej) => (function w() { let d = null; try { d = fr.contentDocument; } catch (_) {}
      if (d && d.documentElement && d.documentElement.dataset.ready === '1' && d.URL === fr.src) return res(d);
      if (Date.now() - t0 > 12000) return rej(new Error('card not ready')); setTimeout(w, 50); })());
  }
  async function raster(scale) {
    const d = await frameReady(), W = 1200, H = 675, root = d.documentElement.cloneNode(true);
    root.querySelectorAll('script,video').forEach(e => e.remove());
    for (const im of root.querySelectorAll('img')) { const s0 = im.getAttribute('src') || ''; if (!s0 || s0.startsWith('data:')) continue;
      const x = await dataURL(new URL(s0, d.baseURI).href); if (x) im.setAttribute('src', x); else im.remove(); }
    const xml = new XMLSerializer().serializeToString(root);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xml}</foreignObject></svg>`;
    const im = new Image(); im.width = W; im.height = H; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await im.decode(); await new Promise(r => setTimeout(r, 80));
    const cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
    return cv;
  }
  const pngBlob = () => raster(2).then(cv => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/png')));
  const pad2 = n => String(n).padStart(2, '0');
  const fname = () => { const t = new Date(); return `haki-pnl-${String(ST.d.ticker || 'coin').replace(/[^\w-]+/g, '') || 'coin'}-${t.getFullYear()}${pad2(t.getMonth() + 1)}${pad2(t.getDate())}.png`; };
  function save(b, name) { const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 8000); return name; }
  async function download(quiet) {
    if (ST.busy) return false; ST.busy = true; const btn = $('#s9Dl'); btn.disabled = true;
    try { const n = save(await pngBlob(), fname()); if (!quiet) toast('PNG saved · ' + n, 2400); return n; }
    catch (e) { toast('Card render failed, try again', 2600); return false; }
    finally { ST.busy = false; btn.disabled = false; }
  }
  const sgS = v => v > 0 ? '+' : v < 0 ? '−' : '';
  const usdS = v => '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const solS = v => Math.abs(v) >= 1 ? Math.abs(v).toFixed(3) : Math.abs(v).toFixed(4);
  function xText() {
    const d = ST.d, p = +d.pnlPct || 0, pc = `${sgS(p)}${Math.abs(p).toFixed(1)}%`, sym = String(d.ticker || '').replace(/^\$/, '');
    if (d.kind === '1d') { const per = d.k === 'today' ? 'today' : d.k === 'week' ? 'this week' : 'so far';
      if (ST.hide) return `${pc} ${per} — observed on Haki hakitrade.com`;
      return `${d.pnlBnb >= 0 ? 'Banked' : 'Took'} ${ST.unit === 'bnb' || d.pnlUsd == null ? `${sgS(d.pnlBnb)}${solS(d.pnlBnb)} SOL` : `${sgS(d.pnlUsd)}${usdS(d.pnlUsd)}`} (${pc}) ${per} — observed on Haki https://hakitrade.com`; }
    if (ST.hide) return `${pc} on $${sym} — observed on Haki hakitrade.com`;
    const m = ST.unit === 'bnb' || d.pnlUsd == null ? `${sgS(d.pnlBnb)}${solS(d.pnlBnb)} SOL` : `${sgS(d.pnlUsd)}${usdS(d.pnlUsd)}`;
    return `${d.pnlBnb >= 0 ? 'Banked' : 'Took'} ${m} (${pc}) on $${sym} — observed on Haki https://hakitrade.com`;
  }
  const canClip = () => window.isSecureContext && navigator.clipboard && window.ClipboardItem;
  function copyImg() {
    if (!canClip()) { toast('Copy is blocked here · downloading the PNG', 3200); download(true); return; }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]).then(() => toast('Card copied', 2200),
      () => download(true).then(n => n && toast('Copy blocked by the browser · ' + n + ' downloaded', 3600)));
  }
  function shareX() {
    window.open('https://x.com/intent/post?text=' + encodeURIComponent(xText()), '_blank', 'noopener');
    if (!canClip()) { download(true).then(n => n && toast('Post opened · PNG downloaded, attach it to the post', 3600)); return; }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]).then(() => toast('Post opened · card copied, paste it into the post', 3600),
      () => download(true).then(n => n && toast('Post opened · PNG downloaded, attach it to the post', 3600)));
  }

  document.addEventListener('click', e => {
    const t = e.target; let b;
    if ((b = t.closest('[data-s9f]'))) { e.preventDefault(); e.stopPropagation(); ST.fav = b.dataset.s9f; SV('hk_ax_fav', ST.fav); return render(); }
    if ((b = t.closest('[data-s9a]'))) { ST.art = b.dataset.s9a; SV('hk_ax_art', ST.art); return render(); }
    if ((b = t.closest('[data-s9u]'))) { ST.unit = b.dataset.s9u; SV('hk_ax_unit', ST.unit); return render(); }
    if (!(b = t.closest('[data-s9]'))) return;
    const k = b.dataset.s9;
    if (k === 'close') return close();
    if (k === 'hide') { ST.hide = !ST.hide; SV('hk_ax_hide', ST.hide ? '1' : '0'); return render(); }
    if (k === 'dl') return download();
    if (k === 'copy') return copyImg();
    if (k === 'x') return shareX();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('.s9-x').innerHTML = I.x;
  $('[data-s9=copy]').innerHTML = `${I.cp}Copy`;
  $('#s9Dl').innerHTML = `${I.dl}Download<span class="s9fx">PNG</span>`;
  $('#s9X').innerHTML = `${I.xl}Share to X`;

  window.hkAxShare = { png: () => pngBlob(), text: () => xText() };   /* for checks from the devtools console */
  (async () => {
    let d = null;
    try { d = window.__hkMock || ((await chrome.storage.session.get({ share: null })).share); } catch (_) {}
    const show = x => { ST.d = x; document.title = 'Share PnL · ' + (x.ticker || 'HAKI'); render(); };
    if (EMBED) {   /* preloaded hidden: the panel says when to show (the data was just written) */
      addEventListener('message', async e => { if (e.source !== parent || !e.data || e.data.hakiShare !== 'open') return;
        const x = (await chrome.storage.session.get({ share: null })).share; if (x && x.a) show(x); });
    }
    if (!d || !d.a) { if (!EMBED) document.body.innerHTML = '<div class="err">Open Share PnL from the HAKI Strike panel on a coin page.</div>'; }
    else show(d);
    /* Share pressed again (maybe on another coin) while this window is open: show the new data */
    try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'session' && ch.share && ch.share.newValue && ch.share.newValue.a) show(ch.share.newValue); }); } catch (_) {}
  })();
})();
