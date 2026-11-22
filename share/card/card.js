/* HAKI share card (static/theme/share/v9/card/share-card.html); the script lives in this file because extension pages run no inline
   script. unit=bnb shows the coin's chain (SOL) instead of a fixed 'BNB'. */

/* ---------------- data ----------------
 CARD = { ticker, name, logo:'url|data-uri'|'' , chain:'BNB',
   pnlUsd, pnlPct, pnlBnb, boughtUsd, soldUsd, holdUsd, held:'14m',
   ch:{tf, from, to, bars:[[t,o,h,l,c]], vol:[[t,usd,buyDom]], vcap, marks:[{t,side,n,bnb,v,w}], style} (v16: exact live chart, from hkCardChart()),
   chart:[price,…] (any length ≥ 8), trades:[{i:index into chart, side:'b'|'s'}]   (old line chart, used only when ch is missing),
   user:{name, x, avatar}, ref:'INVITE', brandX:'…', brandSite:'…', tagline:'lock in.' }
 Sources (last wins): built-in EXAMPLE sample → window.CARD → ?data=<json> → single ?field=… params.
 Params: layout=a|b|c (default a) · state=auto|profit|loss (auto = sign of pnlUsd) */
const Q = new URLSearchParams(location.search);
function rng(seed){ let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function series(kind){
  const r = rng(kind === 'loss' ? 7 : 3), out = []; let p = 1;
  for (let i = 0; i < 120; i++) {
    let target;
    if (kind === 'loss') {
      target = i < 18 ? 1 + i * 0.02 : i < 30 ? 1.36 + (i - 18) * 0.11 : i < 34 ? 2.68 - (i - 30) * 0.05 :
               2.48 * Math.exp(-(i - 34) / 34) + 0.55;
    } else {
      target = i < 24 ? 1 : i < 46 ? 1 + Math.pow((i - 24) / 22, 2.2) * 3.9 : i < 50 ? 4.9 - (i - 46) * 0.02 :
               1.6 + 3.2 * Math.exp(-(i - 50) / 9);
    }
    p = p + (target - p) * 0.55 + (r() - 0.5) * target * (i > 22 && i < 60 ? 0.16 : 0.07);
    out.push(+Math.max(p, 0.2).toFixed(4));
  }
  return out;
}
const SAMPLES = {
  profit: { ticker:'KENBUN', name:'Kenbunshoku', logo:'', chain:'BNB',
    pnlUsd:228.66, pnlPct:124.1, pnlBnb:0.2935, boughtUsd:184.20, soldUsd:412.86, holdUsd:0, held:'14m',
    chart: series('profit'), trades:[{i:23,side:'b'},{i:43,side:'s'},{i:47,side:'s'},{i:53,side:'s'}] },
  loss: { ticker:'FALCON', name:'Band of the Hawk', logo:'', chain:'BNB',
    pnlUsd:-88.60, pnlPct:-35.4, pnlBnb:-0.1137, boughtUsd:250.00, soldUsd:161.40, holdUsd:0, held:'2h 41m',
    chart: series('loss'), trades:[{i:31,side:'b'},{i:62,side:'s'},{i:88,side:'s'}] },
};
const COMMON = { user:{ name:'Example', x:'example', avatar:'' }, ref:'EXAMPLE', brandX:'haki', brandSite:'hakitrade.com', tagline:'lock in.' };
/* kind=1d: the day card. rows = that day's closed trades {t:'HH:MM', ticker, pct, bnb, usd?}; usd falls back to bnb x (pnlUsd/pnlBnb).
   wins / losses / count default to the rows. range = 'Today' | weekday, date = 'Tue 6 Oct 2026'. pnlPct = day PnL / BNB spent that day. */
const KIND = Q.get('kind') === '1d' ? '1d' : 'coin';
const SAMPLES1D = {
  profit: { range:'Today', date:'Tue 6 Oct 2026', chain:'BNB', pnlUsd:168.40, pnlBnb:0.2163, pnlPct:38.6,
    rows:[{t:'09:12',ticker:'ONIBI',pct:-18.4,bnb:-0.0092},{t:'11:41',ticker:'KENBUN',pct:248.3,bnb:0.1240},{t:'13:05',ticker:'MOCHI',pct:-6.2,bnb:-0.0031},
          {t:'14:58',ticker:'HAOSHOKU',pct:61.7,bnb:0.0617},{t:'16:20',ticker:'KAIDO',pct:22.9,bnb:0.0229},{t:'17:47',ticker:'ZORO',pct:4.1,bnb:0.0204}] },
  loss: { range:'Today', date:'Mon 5 Oct 2026', chain:'BNB', pnlUsd:-61.90, pnlBnb:-0.0795, pnlPct:-21.4,
    rows:[{t:'10:03',ticker:'MOCHI',pct:-37.6,bnb:-0.0188},{t:'12:26',ticker:'SENSE',pct:12.4,bnb:0.0062},{t:'15:14',ticker:'GEAR5',pct:-44.0,bnb:-0.0440},
          {t:'19:52',ticker:'BUSOSHOKU',pct:-23.8,bnb:-0.0238},{t:'22:31',ticker:'ONIBI',pct:6.0,bnb:0.0009}] },
};
let C; const _mk = () => Object.assign({}, COMMON, (KIND === '1d' ? SAMPLES1D : SAMPLES)[Q.get('state') === 'loss' ? 'loss' : 'profit'], window.CARD || {});
/* share-fix (10-10): card data comes from the parent page by key (?dk=), not the URL: chart series + B/S fills went past aiohttp's
   8190-byte request line. Same-origin parent keeps window.__hkCardData[dk] = JSON string. ?data= still read for old links. */
const _dk = () => { const k = Q.get('dk'); if (!k) return ''; try { const m = window.parent !== window && window.parent.__hkCardData; return (m && m[k]) || ''; } catch (e) { return ''; } };
const _data = () => { const j = _dk() || Q.get('data'); if (j) try { Object.assign(C, JSON.parse(j)); } catch (e) {}
for (const [k, v] of Q) if (!['layout', 'state', 'data', 'dk', 'art', 'bg', 'accent', 't', 'solid', 'unit', 'hide', 'media', 'mtype', 'bare', 'v', 'kind', 'flip'].includes(k)) C[k] = isNaN(+v) || v === '' ? v : +v; };
const LAYOUT = (Q.get('layout') || 'a').toUpperCase();
/* art: guts ('lock in.', Berserk panel supplied by the user) | flow ('flowstate.', Phaeton by Goltzius 1588, public domain).
   Every art file is exported at exactly its on-card size x2, so Chrome never resamples the ink/engraving. */
const ARTS = {
  guts: { tag:'lock in.', A:['assets/guts-1156.png','right:38px;bottom:0;height:578px'], B:['assets/guts-1520.png','left:-46px;top:-6px;height:760px'], C:['assets/guts-1120.png','right:44px;bottom:0;height:560px'],
          chartA:[330, 206] },
  flow: { tag:'flowstate.', A:['assets/flow-1120.png','right:-30px;top:92px;height:560px'], B:['assets/flow-1520.png','left:-150px;top:-96px;height:760px'], C:['assets/flow-1120.png','right:-30px;top:92px;height:560px'],
          chartA:[380, 98] },
};
/* layout-A variant set (public-domain engravings, Goltzius). ch = chart box [left, top, w, h]; tag sits right-aligned to the chart's end */
Object.assign(ARTS, {
  icarus:   { tag:'ascend.',   sans:1, A:['assets/icarus-1000.png',   'right:-36px;top:104px;height:500px'], ch:[420, 334, 300, 206] },
  tantalus: { tag:'no fear.',  sans:1, A:['assets/tantalus-1160.png', 'right:24px;top:72px;height:580px'],  ch:[420, 334, 320, 206] },
  hercules: { tag:'patience.', sans:1, A:['assets/hercules-1180.png', 'right:64px;top:92px;height:590px'],  ch:[420, 334, 350, 206] },
});
ARTS.rose = { tag:'', A:['',''], ch:[639, 542, 497, 54] };
/* v14 full-bleed arts. bleed = [file, img style (card px), scrim background]. Files are 2400x1350 masters (art/), so at the
   card's 2x export they are drawn 1:1 (height 675 css px = 1350 device px): no resampling. */
const SCRIM = (solid, clear, bot, top = .55, band = 0, bband = 0) => [
  band ? `linear-gradient(180deg,rgba(0,0,0,${top}) 0,rgba(0,0,0,${top}) ${band - 60}px,rgba(0,0,0,${(top * .8).toFixed(2)}) ${band - 30}px,rgba(0,0,0,${(top * .5).toFixed(2)}) ${band}px,rgba(0,0,0,${(top * .24).toFixed(2)}) ${band + 36}px,rgba(0,0,0,${(top * .07).toFixed(2)}) ${band + 76}px,rgba(0,0,0,0) ${band + 110}px)`
       : `linear-gradient(180deg,rgba(0,0,0,${top}) 0,rgba(0,0,0,${(top * .5).toFixed(2)}) 70px,rgba(0,0,0,0) 150px)`,
  bband ? `linear-gradient(0deg,rgba(0,0,0,${bot}) 0,rgba(0,0,0,${bot}) ${bband}px,rgba(0,0,0,${(bot * .8).toFixed(2)}) ${bband + 28}px,rgba(0,0,0,${(bot * .45).toFixed(2)}) ${bband + 56}px,rgba(0,0,0,${(bot * .15).toFixed(2)}) ${bband + 84}px,rgba(0,0,0,0) ${bband + 110}px)`
         : `linear-gradient(0deg,rgba(0,0,0,${bot}) 0,rgba(0,0,0,${(bot * .82).toFixed(2)}) 70px,rgba(0,0,0,${(bot * .5).toFixed(2)}) 135px,rgba(0,0,0,${(bot * .2).toFixed(2)}) 185px,rgba(0,0,0,0) 225px)`,
  `linear-gradient(90deg,#000 0,#000 ${solid}px,rgba(0,0,0,.86) ${solid + (clear - solid) * .2}px,rgba(0,0,0,.6) ${solid + (clear - solid) * .42}px,rgba(0,0,0,.3) ${solid + (clear - solid) * .66}px,rgba(0,0,0,.1) ${solid + (clear - solid) * .86}px,rgba(0,0,0,0) ${clear}px)`].join(',');
Object.assign(ARTS, {
  sniper: { tag:'one shot.', sans:1, A:['',''], bleed:['assets/sniper-2400.webp', 'left:520px;top:0;height:675px', SCRIM(528, 668, .9)] },
  grave:  { tag:'endure.',   sans:1, A:['',''], bleed:['assets/guts-2400.webp',   'left:250px;top:0;height:675px', SCRIM(548, 728, .85, .72)] },
});
/* v16 full-bleed arts. flip = mirrored master (art/<k>-m-2400). The chart is NOT per art: every art uses the one SLOT below. */
Object.assign(ARTS, {
  soldier: { tag:'cold.',  sans:1, A:['',''], bleed:['assets/soldier-2400.webp', 'left:230px;top:0;height:675px', SCRIM(548, 712, .88, .6)] },
  knight:  { tag:'rest.',  sans:1, A:['',''], bleed:['assets/knight-m-2400.webp', 'left:150px;top:0;height:675px', SCRIM(548, 716, .86, .6)] },
  berserk: { tag:'no mercy.', sans:1, A:['',''], bleed:['assets/berserk-2400.webp', 'left:220px;top:0;height:675px', SCRIM(540, 720, .85, .6)] },   /* 3.20.3: owner's picture */
  castle:  { tag:'march.', sans:1, A:['',''], bleed:['assets/castle-m-2400.webp', 'left:0;top:0;height:675px', SCRIM(560, 740, .92, .92)] },
});
/* preview only: ?flip=0 shows the un-mirrored shift (knight / castle) */
if (Q.get('flip') === '0') { ARTS.knight.bleed = ['assets/knight-2400.webp', 'left:470px;top:0;height:675px', SCRIM(548, 716, .86, .6)]; ARTS.castle.bleed = ['assets/castle-2400.webp', 'left:620px;top:0;height:675px', SCRIM(640, 770, .92, .92)]; }
ARTS.upload = { tag:'', A:['',''], ch:[639, 542, 497, 54] };
const SLOT = [420, 334, 330, 206];   // v16: the one chart box (= 'lock in.')
const PNLC2 = (() => { try { return localStorage.getItem('hk_pnlc2_off') !== '1'; } catch (e) { return true; } })();
const SLOT2 = [64, 470, 476, 112];   // pnlc2 v2 (owner: "the chart looks like it never moved", a reference terminal's for comparison): big, over the art's side
const C2G = PNLC2 && KIND !== '1d' && LAYOUT === 'A';
/* pnlc2 v2 (owner: "looks like 2 separate pictures, they must melt together"): a full-bleed art no longer stops at a black block. The empty
   part left of the art is filled by the same art mirrored at its edge (the texture runs on with no seam) and one soft dark wash from the
   left carries the text, instead of a solid black column with a short fade. */
const SCRIM2 = 'linear-gradient(90deg,rgba(0,0,0,.86) 0,rgba(0,0,0,.8) 300px,rgba(0,0,0,.58) 520px,rgba(0,0,0,.26) 700px,rgba(0,0,0,.08) 860px,rgba(0,0,0,0) 980px),linear-gradient(180deg,rgba(0,0,0,.55) 0,rgba(0,0,0,0) 160px),linear-gradient(0deg,rgba(0,0,0,.72) 0,rgba(0,0,0,0) 210px)';
const bleed2 = b => { const L = +((/left:(-?\d+)px/.exec(b[1]) || [])[1] || 0);
  /* the mirrored fill is blurred + dimmed (texture and colour only: no ghost figure under the text) and the art's own left 160 px fade into it */
  const fe = 'mask-image:linear-gradient(90deg,transparent 0,#000 160px);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 160px)';
  return (L > 0 ? `<img class="bleed" src="${b[0]}" style="left:${L - 1200}px;top:-40px;height:755px;width:1350px;transform:scaleX(-1);filter:blur(22px) brightness(.62)" alt="">` : '')
    + `<img class="bleed" src="${b[0]}" style="${b[1]};${L > 0 ? fe : ''}" alt=""><div class="scrim" style="background:${SCRIM2}"></div>`; };
for (const k of ['icarus', 'tantalus', 'hercules']) delete ARTS[k].ch;
const UNIT = Q.get('unit') === 'bnb' ? 'bnb' : 'usd', HIDE = Q.get('hide') === '1';
const ARTK = ARTS[Q.get('art')] ? Q.get('art') : 'guts', ART = ARTS[ARTK];
/* Day cards: rose is a video window on the coin card. The PR painted the poster full-bleed because the loop file is not in the repo;
   on live rose-loop-792.mp4 exists and the GIF export composites the loop into the 497×360 window, so a full-bleed poster made the GIF
   stamp a video box over the poster. pnlcal-fix1: full-bleed poster only when the card is asked for it (?rosebleed=1). */
if (KIND === '1d' && ARTK === 'rose' && !Q.get('media') && Q.get('rosebleed') === '1') ART.bleed = ['media/rose-loop-poster.jpg', 'right:0;top:0;height:675px;width:820px;object-fit:cover;object-position:68% center', SCRIM(500, 740, .9, .5)];
if (!('tagline' in (window.CARD || {})) && !Q.has('tagline')) COMMON.tagline = '';   /* 3.20.4 (owner): no caption on the art (cold. / no mercy. ...) on any card */
C = _mk(); _data();
const STATE = Q.get('state') === 'loss' || (Q.get('state') !== 'profit' && C.pnlUsd < 0) ? 'loss' : 'profit';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sgn = v => v < 0 ? '−' : v > 0 ? '+' : '';   /* gc1020 A3-21: zero gets no sign (was '+$0.00 / +0.0%') */
const usd = v => { const a = Math.abs(v); return '$' + (a >= 1e6 ? (a/1e6).toFixed(2)+'M' : a >= 1e4 ? (a/1e3).toFixed(1)+'K' : a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})); };
const pct = v => sgn(v) + Math.abs(v).toLocaleString('en-US',{maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 1, minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 1}) + '%';
const bnb = v => Math.abs(v) >= 1 ? Math.abs(v).toFixed(3) : Math.abs(v).toPrecision(3).replace(/0+$/,'').replace(/\.$/,'');
const ico = C.logo ? `<img src="${esc(C.logo)}" alt="">` : `<span>${esc(String(C.ticker||'?').replace(/^\$/,'')[0]||'?')}</span>`;
const av = C.user?.avatar ? `<img src="${esc(C.user.avatar)}" alt="">` : esc((C.user?.name||'?')[0]);
const X = '<svg><use href="#x"/></svg>', WEB = '<svg><use href="#web"/></svg>';

/* production: brand links / identity / invite code render only when set (window.HK_SHARE_V9 config); never placeholder text */
const _hl = [C.brandX ? `<span>${X}${esc(C.brandX)}</span>` : '', C.brandSite ? `<span>${WEB}${esc(C.brandSite)}</span>` : ''].filter(Boolean);
/* brand26 (1028): the new Logotype (logo-1028b: the original Logotype primary inlined) unless localStorage hk_brand26_off = 1 (then the old lockup below, exactly) */
const B26 = (() => { try { return localStorage.getItem('hk_brand26_off') !== '1' } catch (e) { return true } })();
const LOGO26 = `<img class="hd-logo b26" src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjc3IiBoZWlnaHQ9IjExMyIgdmlld0JveD0iMCAwIDI3NyAxMTMiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0xMDEuMzg2IDMzLjczM0wxMDEuNDQgMzMuNzk1QzEwMC4wOTIgMzQuNTY5MyA5OC44MTA1IDM1LjQ2MjcgOTcuNDgxNSAzNi4yNTYxQzkzLjk2ODYgMzguMzQyOSA5MC40MjQ0IDQwLjM3NTUgODYuODQ5NCA0Mi4zNTMyQzc1LjMwNyA0OC43MzExIDYzLjQ3OTggNTQuNTUyIDUxLjcxNjQgNjAuNTA1M0MzOC40ODQ3IDY3LjI1NzcgMjUuMjE4NiA3My45NDMxIDExLjkxODggODAuNTYxMkwxMS44NjE4IDgwLjUyMzRDMTEuOTU1NCA4MC4zNiAxOS44MTI5IDc0Ljg5NDIgMjAuNzIxOSA3NC4yMzc2QzI1LjM5MDMgNzAuODQxMyAzMC4xMDc5IDY3LjUxMzMgMzQuODczMSA2NC4yNTM3QzQwLjkyNjcgNjAuMTQ0NSA0Ny4xMDU1IDU2LjM2MDIgNTMuNzI2IDUzLjIxMDhDNTcuOTM1NiA1MS4xODcxIDYyLjU0OTIgNDkuNTc4IDY2Ljg4MjIgNDcuODEyQzc4LjM0NDggNDMuMTQwNiA5MC4xNTI2IDM4LjkzMjQgMTAxLjM4NiAzMy43MzNaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNzguNzM0MiA0OS45MzlDNzkuMzM4NSA1OS42NjczIDc0Ljk1NzYgNjguNDU5OCA2Ny4yNjE5IDc0LjUwODhDNjcuMzYwMyA3NC4yODAzIDY3Ljg0OTggNzMuNzc5IDY4LjAzNjkgNzMuNTc1NEM2OS4xNzA3IDcyLjMzNzEgNjkuOTk4MSA3MC45NyA3MC44MjcxIDY5LjUxOTRDNzMuNjE5OCA2NC43MzU5IDc0LjI5NzIgNTcuNzY0OCA3MS45MjIzIDUyLjcyNTVDNzMuMjk1NiA1Mi4wNDczIDc0LjY1NjEgNTEuMzQ0MyA3Ni4wMDQ0IDUwLjYxNzFDNzYuNzA5MiA1My40MzMgNzYuNzQ4OCA1NS4zNTIyIDc2LjU1NjggNTguMjExMUM3Ny45MDg3IDU0LjgxNDMgNzguMjMxMyA1My4zNjU5IDc4LjczNDIgNDkuOTM5WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTM5LjMxMzEgNjkuMjkwOUMzOS40MzAzIDY5LjM4MjYgMzkuNjk4NSA2OS44NzY1IDM5Ljc4ODMgNzAuMDMzNEM0MC41NTI5IDcxLjM2MjYgNDEuMzQxNCA3Mi4zNDE4IDQyLjQxNjkgNzMuNDE1MkM0NS4zODMyIDc2LjM2ODIgNDkuMjk1MiA3OC4xODU4IDUzLjQ2ODcgNzguNTUxOUM1NC42NDA1IDc4LjY2NTQgNTYuMTA4MiA3OC42MzI0IDU3LjMwOTggNzguNjMzMkM1NS42NDEzIDc5LjExMzYgNTMuODQ0NSA3OS4yMjMgNTIuMTE1OSA3OS4yNjE2QzUxLjIwMDkgNzkuMjY4OSA1MC4yODYgNzkuMjM1MSA0OS4zNzQgNzkuMTYyN0M0My4zNiA3OC42NjU0IDM4LjAzMjEgNzYuNjQ0MiAzNC4wNTczIDcxLjk1OTZDMzUuNjYxNSA3MS4yNDc1IDM3LjcyMDEgNzAuMTE3IDM5LjMxMzEgNjkuMjkwOVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik02NS41MjA4IDU2LjA0NDhDNjYuMzc1OSA1Ny42NDUgNjYuODYwNyA1OS40NzIxIDY2Ljg2MDcgNjEuNDEyMkM2Ni44NjA3IDY3LjcyMjQgNjEuNzMzOCA3Mi44Mzc5IDU1LjQwOTQgNzIuODM3OUM1MC44NyA3Mi44Mzc5IDQ2Ljk0NzcgNzAuMjAyNiA0NS4wOTUgNjYuMzgxN0M0Ni45NjUgNjUuNDMyMSA0OC44MzQ0IDY0LjQ4MTIgNTAuNzAzMSA2My41Mjg5QzUxLjUxMjIgNjUuMzE3MiA1My4zMTUxIDY2LjU2MTggNTUuNDA5NCA2Ni41NjE4QzU4LjI1OTggNjYuNTYxOCA2MC41NzA1IDY0LjI1NjIgNjAuNTcwNSA2MS40MTIyQzYwLjU3MDUgNjAuNDkwNyA2MC4zMjc3IDU5LjYyNTggNTkuOTAyNyA1OC44Nzc1QzYxLjc3NjEgNTcuOTM0NCA2My42NDkyIDU2Ljk5MDkgNjUuNTIwOCA1Ni4wNDQ4WiIgZmlsbD0iI0Y2MDAwMCIvPgo8cGF0aCBkPSJNNTMuNzQ0NiAwLjA1MDc1NTRDNTQuMjc0NCAtMC4wMTM3MjQzIDU1LjA2MDggLTAuMDA0NzI3ODYgNTUuNTk3IDAuMDEyNzI0MkM2MS43MjM1IDAuMjEyMTY1IDY3LjA1ODkgNC4zNTQ5MSA2OS4wNDQzIDEwLjA5NDFDNjkuNjM3IDExLjgwNzkgNjkuODA1NiAxMy4xODE3IDY5Ljk4NTQgMTQuOTc5N0M4MC42NjkgMTguNDU4MSA4OS4xNTkxIDI0Ljg1OTUgOTUuNjA4MSAzNC4wMjE5Qzk0LjM0NjggMzQuNTc5OCA5Mi41MDc0IDM1LjI3OTYgOTEuMTk4NSAzNS43NTkyQzg0LjQzNzQgMjYuNjY4MSA3Ni40ODQ0IDIxLjEwOTIgNjUuNDg0NyAxOC4yNTEzQzY2LjUxODUgMTEuNzc1OSA2My4zIDUuOTQ1MjIgNTYuNjggNC4zOTYwNUM1Mi44NTMyIDMuNjQwMjcgNDguNDg0NyA1LjExMDAzIDQ2LjA0OTIgOC4xNzcwMUM0NC42NTQyIDkuOTM4MzMgNDQuMDIyNCAxMi4xODI3IDQ0LjI5NDEgMTQuNDExMUM0NC43NjQ1IDE4LjExOTIgNDcuMzc4OSAyMC45NTY2IDUxLjQ0MyAyMC41OTQ3QzUzLjY5MTggMjAuMzk0NCA1NS44OTk0IDE4LjM5NTggNTUuOTQwMiAxNi4yODk4QzU2LjAyODIgMTQuNTIzIDU0LjU3NTQgMTIuOTkzMyA1Mi43OTkyIDEyLjk5MzNDNTEuNDU0NSAxMi45OTMzIDUwLjMwNjkgMTMuODM1NSA0OS44NTcyIDE1LjAyQzQ4Ljg1NzcgMTIuNzUyNSA1MS4xNTAxIDEwLjQwMjIgNTMuMjY1NiAxMC4xMDU2QzU2LjU2OTUgOS42NDI1IDU5LjMzOTYgMTIuMTEwMSA1OS43NDQ1IDE1LjMwOTNDNjAuMDA0MiAxNy4zNzQzIDU5LjQyMTEgMTkuNDU3IDU4LjEyNTIgMjEuMDg4MUM1Ni41ODE3IDIzLjA0NjEgNTQuMTQwNSAyNC4yODQ2IDUxLjY3NjUgMjQuNTU1NEM0OC45NzU0IDI0Ljg2ODIgNDYuMjYzMSAyNC4wNzE5IDQ0LjE2MjIgMjIuMzQ5M0M0MS43MjcgMjAuMzkyNCA0MC4zNTk0IDE3LjYyNjIgNDAuMDU3MyAxNC41Mzk0QzM5Ljc1NzMgMTEuMjQwNiA0MC43ODIxIDcuOTU3OCA0Mi45MDY0IDUuNDEyMzdDNDUuNjU1MyAyLjA3NzY2IDQ5LjUxMTYgMC40NjcyMDYgNTMuNzQ0NiAwLjA1MDc1NTRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNOTkuOTIxOSA3Mi4wNjY3QzEwMi4xNjkgNzEuODg5NSAxMDQuNDE5IDcyLjM5NjYgMTA2LjM3MiA3My41MjFDMTA5LjMxIDc1LjIwNTkgMTExLjQ2OSA3Ny45NzM5IDExMi4zODQgODEuMjI5NEMxMTMuMzc0IDg0LjgxNzIgMTEyLjk2MSA4OC40NDI5IDExMS4xMTMgOTEuNjg0N0MxMDkuMTI0IDk1LjEyNjkgMTA1Ljg2NSA5Ny42NTQyIDEwMi4wMzEgOTguNzI3NkM5Ny43ODU4IDk5Ljg3MjUgOTMuODIyMSA5OS4yNjgzIDkwLjAxMjYgOTcuMDg3Qzg5LjcxNDIgOTcuNDIyNSA4OS40NDggOTcuNjg3MiA4OS4xMzM1IDk4LjAwMDJDNzkuNzQzNCAxMDcuMzQgNjcuMzEyMyAxMTMuMTkyIDUzLjkyNTUgMTEyLjk5NUM0NC4xNDAyIDExMi44NTEgMzUuMzMzNiAxMDkuNzI2IDI3LjI4NDEgMTA0LjEzMUMyNS4zMjk1IDEwMi43NzMgMjMuMjI3MSAxMDEuMTI2IDIxLjQ2NTMgOTkuNDM1NEMyMi42MDEzIDk4LjU4MTkgMjMuNTgxOSA5Ny41MzM2IDI0LjM1NzEgOTYuMzQwMUMyOS41OTg4IDEwMS4xMTIgMzYuMDg3IDEwNS4wOTIgNDIuOTU1NiAxMDYuOTQ1QzQ4LjIwMTYgMTA4LjQ1OSA1My4yNDczIDEwOS4wMzIgNTguNzA4NSAxMDguNDQzQzcwLjYzMzIgMTA3LjE1OCA4Mi4wMzM4IDEwMC41MTQgODkuNTI4NyA5MS4yNTk4QzkxLjcxOSA5My4zMDgzIDkzLjcwODQgOTQuNjMzNiA5Ni44MTE1IDk0Ljk3MzlDOTkuNjkyMSA5NS4yODQ1IDEwMi41NzggOTQuNDM5NyAxMDQuODMyIDkyLjYyNDVDMTA2Ljk1NCA5MC45NDI4IDEwOC4zMTQgODguNDg0NyAxMDguNjEgODUuNzk3M0MxMDguODU2IDgzLjM2NDEgMTA4LjExMSA4MC45MzQxIDEwNi41NDUgNzkuMDUzNkMxMDUuMjU3IDc3LjQ4NDYgMTAzLjM5OCA3Ni4zNTY0IDEwMS4zNTMgNzYuMTY2N0M5OS40Njc5IDc1Ljk4MjkgOTcuNTg4MiA3Ni41NjQxIDk2LjEzNjYgNzcuNzc5OUM5My41ODcxIDc5LjkzNzkgOTMuMjY3NyA4NC4wOTI5IDk2LjE2MzggODUuNjA4N0M5OC45MDM1IDg3LjMwNzMgMTAyLjM4IDgzLjgyMjQgMTAwLjM1NCA4MS4wODEyQzEwMS42NjMgODEuMzk1NyAxMDIuODM3IDgyLjY3NDQgMTAyLjk0OCA4NC4xMjUxQzEwMy4zNyA4OS42NzM4IDk2LjU3NjEgOTEuMjU1IDkyLjkzNTkgODguMDExNkM5MS4yOTQ4IDg2LjU1MDQgOTAuMzg2IDg0Ljc4MTggOTAuMTk0OCA4Mi42MjQ2Qzg5LjY4NjggNzYuODgyIDk0LjQxMjQgNzIuNDg5MyA5OS45MjE5IDcyLjA2NjdaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzYuNjcwMiAxNi40MjgyQzM2Ljg4NCAxNy43NzY3IDM3LjMyMTYgMTkuMDUwOCAzNy45NDM2IDIwLjIxMThDMjcuOTY2NCAyNC42NDU2IDIwLjIyMTcgMzEuNTYyNSAxNS41MDczIDQxLjUzNzRDMTEuMjYwOSA1MC41OTgzIDEwLjMzMjEgNjAuODU3NyAxMi44ODI2IDcwLjUzMTJDMTMuMzg4OSA3Mi40NzI4IDEzLjk2NzkgNzMuODI2OCAxNC42MjIzIDc1LjY0NjlDMTEuMDA0IDc2LjkwNDQgNy4zNjA1MiA3OC4wNTQyIDUuMjM5MTMgODIuMjc4NkM0LjEzMzM2IDg0LjQ5NDUgMy44NTI2MyA4Ny4xMjczIDQuNjU3OTMgODkuNDg0OUM1LjQzNzkyIDkxLjgwNyA3LjEyMDA1IDkzLjcxODggOS4zMjY0MiA5NC43OTEzQzE0LjI2NjYgOTcuMTc4NiAyMC45NzcxIDkzLjIxNTggMTkuMjYwOCA4Ny40MjFDMTguODIxNiA4NS45Mzc5IDE3LjMyMjIgODQuNjUyMSAxNS43MzkgODQuNjUyMUMxMi42ODc5IDg0LjY1MjEgMTEuNTAyNiA4OC42OTk5IDEzLjk2NDggOTAuMzgxNEMxMi45MjY3IDkwLjYxODEgMTEuNzg5IDkwLjI3ODMgMTEuMDA0IDg5LjU3NDFDOC45MzM3NSA4Ny43MjE5IDkuNjEwMjUgODQuNjg0MyAxMS4zMjcyIDgyLjgzMjFDMTQuODI4NSA3OS40NTM1IDIwLjg2MjkgODEuMTM3NiAyMi42NjkgODUuNTE0N0MyNC44NTg4IDkwLjgyMjggMjIuMTU1IDk2LjI5ODQgMTcuMDE1MSA5OC41MTI3QzE0LjE1MzMgOTkuNzU0MiAxMC45MTA3IDk5Ljc5MDQgOC4wMjE2NCA5OC42MTQxQzQuODUzNTcgOTcuMzM3MSAyLjI5NDQyIDk0LjY3NTQgMC45ODU4MjMgOTEuNTQyMkMtMC4zNDY3OTcgODguMjgwMiAtMC4zMjc2NzkgODQuNjI0IDEuMDM5MDYgODEuMzc2NUMyLjUwMTUyIDc3Ljg5NDEgNS4yODM4NyA3NS4xMzAzIDguNzc5ODcgNzMuNjg2MUM1LjU4OTk1IDYyLjY1NjkgNi4yMTE5NCA1MS41NjYzIDEwLjg3NDEgNDEuMDU2N0MxNS45MjE3IDI5LjgwMjcgMjUuMTc5NSAyMC45NjM4IDM2LjY3MDIgMTYuNDI4MloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik05OC4zMzE4IDM4LjcwOEM5OC4zNzI5IDM4LjcwOTUgOTguNDYzMiAzOC43NDc2IDk4LjUwNzUgMzguNzYzNEM5OS4zMjYxIDQwLjEwMjcgMTAwLjUzMyA0My4wNDQgMTAxLjA2IDQ0LjQ4MTRDMTA0LjAzMiA1Mi4zOTIxIDEwNC44NDEgNjAuOTQ0NyAxMDMuNDA5IDY5LjI2MjVDMTAyLjYwNyA2OS4wOTUzIDEwMS43NzUgNjkuMDA3MyAxMDAuOTIyIDY5LjAwNzNDMTAwLjAxNCA2OS4wMDczIDk5LjEyOTQgNjkuMTA3MyA5OC4yNzg0IDY5LjI5NjRDMTAwLjA4IDYwLjAzNzUgOTguODExNyA0OS4yMjY5IDk0LjE3NzggNDAuOTY5MkM5NS40ODI2IDQwLjIwMDYgOTYuOTg4MyAzOS40MTY0IDk4LjMzMTggMzguNzA4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTI4LjgxOTYgNzQuODA4NUMzMC4xMjIxIDc3LjQwMTUgMzEuNzk1NCA3OS43NzY4IDMzLjc3MDIgODEuODY1NEMzOS4yMjExIDg4LjEyMDYgNDkuMTQ1NCA5NS4yODg4IDY1LjYyODQgOTQuMjQ3M0M2Mi4zNzgyIDk1LjI2NiA1OC45MTk2IDk1LjgxNTQgNTUuMzMyNSA5NS44MTU0QzQxLjkwMzkgOTUuODE1NCAzMC4yNzY5IDg4LjExOTIgMjQuNjQwMiA3Ni45MDY1QzI2LjAzMzcgNzYuMjA4IDI3LjQyNjggNzUuNTA4NiAyOC44MTk2IDc0LjgwODVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNODUuNzUgNDUuNzEwOUM4OC4yNCA1MC40NTM3IDg5LjY0ODYgNTUuODUwOSA4OS42NDg2IDYxLjU3NjJDODkuNjQ4NiA2OS4yMzExIDg3LjEzMDcgNzYuMjk5MSA4Mi44NzY0IDgyLjAwMTFDNzguMDM2NyA4OC4wMjM1IDY0LjcyNzcgOTYuMDE5IDUxLjYyMTIgOTAuOTE4N0M1Mi44MzY5IDkxLjA3MDIgNTQuMDc1NiA5MS4xNDg2IDU1LjMzMjUgOTEuMTQ4NkM3MS43MDE1IDkxLjE0ODYgODQuOTcxMiA3Ny45MDg1IDg0Ljk3MTMgNjEuNTc2MkM4NC45NzEzIDU2LjY1MzMgODMuNzY1MSA1Mi4wMTE2IDgxLjYzMjUgNDcuOTI4NUM4My4wMDgxIDQ3LjE5NTggODQuMzgwOSA0Ni40NTY4IDg1Ljc1IDQ1LjcxMDlaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzIuNTA2NyAzNi4wMDkzQzIzLjU2NTUgNDUuNzY2NCAyNC40Njk1IDYwLjU5NjEgMjYuMjI4MyA2Ny4zMTk3QzI0Ljg1NjUgNjguMjg4IDIzLjQ4ODggNjkuMjYyMyAyMi4xMjUyIDcwLjI0MjFDMjEuNDAxNyA2Ny40NzQzIDIxLjAxNjQgNjQuNTcwMSAyMS4wMTY0IDYxLjU3NjJDMjEuMDE2NCA1MS40MTA5IDI1LjQ1NjMgNDIuMjgwMiAzMi41MDY3IDM2LjAwOTNaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjcuMjM3NCA1Mi4xMzE2QzMwLjIxNTggMjkuNDE4NCA1NC40NzY1IDI1LjExNTEgNjcuODI4OSAyOS42Nzc5QzczLjE3MjQgMzEuNzYzNiA3Ny44NjM4IDM1LjE0NzQgODEuNTEzNSAzOS40NDA1Qzc5Ljk2NzYgNDAuMDQ3MSA3OC40MTgzIDQwLjY1MTUgNzYuODY2NiA0MS4yNTcyQzcxLjQ2NCAzNS41NTkgNjMuODE0NSAzMi4wMDM4IDU1LjMzMjUgMzIuMDAzOEM0Mi4yNzM1IDMyLjAwMzggMzEuMTg3MSA0MC40MzA2IDI3LjIzNzQgNTIuMTMxNloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMzEuOTM4IDgyLjU1ODVWNDEuNzg0N0gxMzcuMDM5VjU5LjYyMzJIMTc0LjQ0MlY0MS43ODQ3SDE3OS41NDJWODIuNTU4NUgxNzQuNDQyVjYzLjg3MDVIMTM3LjAzOVY4Mi41NTg1SDEzMS45MzhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjAyLjg2MSA4My4xNDI1QzE5OS4xOTYgODMuMTQyNSAxOTYuMTY3IDgyLjk0NzggMTkzLjc3NiA4Mi41NTg1QzE5MS40MDMgODIuMTg2OCAxODkuNjMyIDgxLjM1NTEgMTg4LjQ2MyA4MC4wNjMyQzE4Ny4zMTIgNzguNzcxMyAxODYuNzM3IDc2Ljc2MjcgMTg2LjczNyA3NC4wMzc0QzE4Ni43MzcgNzEuMjU5IDE4Ny4yNzcgNjkuMjIzOCAxODguMzU3IDY3LjkzMTlDMTg5LjQ1NSA2Ni42MjI0IDE5MS4xODIgNjUuNzcyOSAxOTMuNTM3IDY1LjM4MzZDMTk1LjkxIDY0Ljk5NDIgMTk5LjAxOCA2NC43OTk2IDIwMi44NjEgNjQuNzk5NkMyMDUuOTc4IDY0Ljc5OTYgMjA4LjU5MSA2NC44NzA0IDIxMC42OTggNjUuMDExOUMyMTIuODA2IDY1LjE1MzUgMjE0LjY5MiA2NS40MDEzIDIxNi4zNTYgNjUuNzU1MkMyMTYuMzIxIDYzLjQwMTUgMjE2LjE2MiA2MS41NTIyIDIxNS44NzggNjAuMjA3MkMyMTUuNTk1IDU4Ljg0NDUgMjE1LjA2MyA1Ny44MzU4IDIxNC4yODQgNTcuMTgxQzIxMy41MDUgNTYuNTI2MiAyMTIuMzYzIDU2LjExMDQgMjEwLjg1NyA1NS45MzM0QzIwOS4zNyA1NS43Mzg3IDIwNy4zODYgNTUuNjQxNCAyMDQuOTA3IDU1LjY0MTRDMjAyLjA3MyA1NS42NDE0IDE5OS44NTEgNTUuNzAzMyAxOTguMjM5IDU1LjgyNzJDMTk2LjY0NSA1NS45NTExIDE5NS40ODUgNTYuMTcyMyAxOTQuNzU5IDU2LjQ5MDhDMTk0LjAzMyA1Ni44MDk0IDE5My41NzMgNTcuMjY5NSAxOTMuMzc4IDU3Ljg3MTJDMTkzLjIwMSA1OC40NzI5IDE5My4xMTIgNTkuMjUxNiAxOTMuMTEyIDYwLjIwNzJIMTg4LjAxMkMxODguMDEyIDU4LjI5NTkgMTg4LjI2OSA1Ni43NTYzIDE4OC43ODIgNTUuNTg4M0MxODkuMzEzIDU0LjQyMDMgMTkwLjIwOCA1My41MzU1IDE5MS40NjUgNTIuOTMzOEMxOTIuNzIzIDUyLjMzMjEgMTk0LjQ0IDUxLjkyNSAxOTYuNjE5IDUxLjcxMjdDMTk4LjgxNSA1MS41MDAzIDIwMS41NzcgNTEuMzk0MSAyMDQuOTA3IDUxLjM5NDFDMjA4LjQ4NCA1MS4zOTQxIDIxMS4zNjIgNTEuNjI0MiAyMTMuNTQgNTIuMDg0M0MyMTUuNzM2IDUyLjU0NDQgMjE3LjQwMSA1My4zNzYyIDIxOC41MzUgNTQuNTc5NkMyMTkuNjg2IDU1Ljc2NTMgMjIwLjQ1NiA1Ny40Mjg4IDIyMC44NDYgNTkuNTcwMUMyMjEuMjUzIDYxLjcxMTUgMjIxLjQ1NyA2NC40NzIyIDIyMS40NTcgNjcuODUyM1Y4Mi41NTg1SDIxNi4zNTZWODAuNDYxNEMyMTUuNzU0IDgxLjA5ODUgMjE0LjkyMiA4MS42MTE3IDIxMy44NTkgODIuMDAxQzIxMi43OTcgODIuMzkwNCAyMTEuMzggODIuNjczNSAyMDkuNjA5IDgyLjg1MDVDMjA3Ljg1NiA4My4wNDUyIDIwNS42MDYgODMuMTQyNSAyMDIuODYxIDgzLjE0MjVaTTIwMi44NjEgNzkuMDAxNEMyMDUuODkgNzkuMDAxNCAyMDguMzA3IDc4Ljk2NiAyMTAuMTE0IDc4Ljg5NTJDMjExLjkyIDc4LjgyNDQgMjEzLjI2NiA3OC42Mjk4IDIxNC4xNTEgNzguMzExMkMyMTUuMDU1IDc3Ljk5MjcgMjE1LjY0OCA3Ny40Nzk1IDIxNS45MzEgNzYuNzcxNkMyMTYuMjE1IDc2LjA2MzcgMjE2LjM1NiA3NS4wNzI3IDIxNi4zNTYgNzMuNzk4NVY2OS4wOTk5TDIwMi44NjEgNjguOTQwN0MyMDAuNDcxIDY4LjkwNTMgMTk4LjU0IDY4Ljk0MDcgMTk3LjA3IDY5LjA0NjhDMTk1LjYxOCA2OS4xMzUzIDE5NC41MTEgNjkuMzQ3NyAxOTMuNzUgNjkuNjgzOUMxOTIuOTg4IDcwLjAwMjUgMTkyLjQ3NSA3MC41MTU3IDE5Mi4yMDkgNzEuMjIzNkMxOTEuOTYxIDcxLjkxMzggMTkxLjgzNyA3Mi44NTE3IDE5MS44MzcgNzQuMDM3NEMxOTEuODM3IDc1LjE4NzcgMTkxLjk2MSA3Ni4wOTkxIDE5Mi4yMDkgNzYuNzcxNkMxOTIuNDc1IDc3LjQ0NDEgMTkyLjk4OCA3Ny45Mzk2IDE5My43NSA3OC4yNTgxQzE5NC41MTEgNzguNTc2NyAxOTUuNjE4IDc4Ljc4MDIgMTk3LjA3IDc4Ljg2ODdDMTk4LjU0IDc4Ljk1NzEgMjAwLjQ3MSA3OS4wMDE0IDIwMi44NjEgNzkuMDAxNFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yMjguMzEgODIuNTU4NVY0MS43ODQ3SDIzMy40MTFWNjUuMzMwNUwyNTMuNzMzIDUxLjk3ODFIMjYxLjQ2M0wyMzkuODY2IDY2LjMzOTJMMjYyLjMxMyA4Mi41NTg1SDI1NC43MTZMMjMzLjQxMSA2Ni44NzAxVjgyLjU1ODVIMjI4LjMxWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTI2Ni42NzQgODIuNTU4NVY1MS45NzgxSDI3MS43NzRWODIuNTU4NUgyNjYuNjc0Wk0yNjYuNjc0IDQ2Ljg4MTRWNDEuNzg0N0gyNzEuNzc0VjQ2Ljg4MTRIMjY2LjY3NFoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=" alt="Haki">`;
const header = (B26 ? LOGO26 : `<img class="hd-logo" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9Ii0xIDcgMjUyIDgwIj48ZGVmcz48ZmlsdGVyIGlkPSJpbmt3IiB4PSItMTAlIiB5PSItMTAlIiB3aWR0aD0iMTIwJSIgaGVpZ2h0PSIxMjAlIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC42IiBudW1PY3RhdmVzPSIyIiBzZWVkPSIxMSIgcmVzdWx0PSJuIi8+PGZlRGlzcGxhY2VtZW50TWFwIGluPSJTb3VyY2VHcmFwaGljIiBpbjI9Im4iIHNjYWxlPSIwLjkiIHhDaGFubmVsU2VsZWN0b3I9IlIiIHlDaGFubmVsU2VsZWN0b3I9IkciLz48L2ZpbHRlcj48L2RlZnM+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNi4zMSAtMC40Mykgc2NhbGUoMC45MjM4KSI+PGRlZnM+PGZpbHRlciBpZD0iaW5rIiB4PSItMTAlIiB5PSItMTAlIiB3aWR0aD0iMTIwJSIgaGVpZ2h0PSIxMjAlIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC41IiBudW1PY3RhdmVzPSIyIiBzZWVkPSI5IiByZXN1bHQ9Im4iLz48ZmVEaXNwbGFjZW1lbnRNYXAgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0ibiIgc2NhbGU9IjEuMyIgeENoYW5uZWxTZWxlY3Rvcj0iUiIgeUNoYW5uZWxTZWxlY3Rvcj0iRyIvPjwvZmlsdGVyPjwvZGVmcz48ZyBmaWx0ZXI9InVybCgjaW5rKSI+PHBhdGggZD0iTTM4LjcgMzYuNCBMNDAgMzYuMTkgTDQxLjE2IDM2LjY1IEw0Mi4zNyAzNi45MSBMNDMuNzMgMzYuODYgTDQ0Ljc1IDM3LjY4IEw0NS45NiAzOC4wNyBMNDcgMzguNzcgTDQ4LjI2IDM5LjE2IEw0OS4zNiAzOS44MiBMNTAuMDkgNDAuOTIgTDUxLjMyIDQxLjQ1IEw1Mi4wMSA0Mi41NiBMNTIuNzkgNDMuNTYgTDUzLjg5IDQ0LjMgTDU0LjUxIDQ1LjQyIEw1NC45NyA0Ni42NCBMNTUuNjggNDcuNjcgTDU1Ljg3IDQ4Ljk4IEw1Ni4yNCA1MC4xNyBMNTYuNDkgNTEuMzkgTDU2LjQ5IDUxLjM5IEw1NS41MyA1MC40OCBMNTUgNDkuNDIgTDU0LjI5IDQ4LjQ2IEw1My41MyA0Ny41NSBMNTIuNjUgNDYuNzQgTDUxLjk4IDQ1LjggTDUxLjQ4IDQ0LjcxIEw1MC41NSA0My45OCBMNDkuMzMgNDMuNTggTDQ4Ljg4IDQyLjM3IEw0Ny44MSA0MS44NSBMNDYuNzkgNDEuMzEgTDQ1LjkyIDQwLjU0IEw0NS4xNSAzOS41NSBMNDQuMDcgMzkuMDkgTDQyLjkxIDM4LjgzIEw0MS45MSAzOC4xOSBMNDAuODcgMzcuNiBMMzkuNzkgMzcuMDIgTDM4LjcgMzYuNFoiIGZpbGw9IiNlMDEyMmUiLz48cGF0aCBkPSJNNTcuNDUgNTQuOTEgTDU3LjkgNTYuMDMgTDU4LjM3IDU3LjE4IEw1OC44NCA1OC4zNiBMNTguODcgNTkuNTkgTDU4Ljg3IDYwLjgxIEw1OC45MSA2Mi4wNSBMNTguODkgNjMuMjkgTDU4LjcxIDY0LjUxIEw1OC40NiA2NS43MyBMNTguMzcgNjYuOTkgTDU4LjA2IDY4LjIgTDU3LjUgNjkuMzMgTDU2Ljc5IDcwLjM3IEw1Ni40MyA3MS41OCBMNTUuNDkgNzIuNDcgTDU1LjA3IDczLjY2IEw1NC4xIDc0LjQ4IEw1My4xMiA3NS4yNiBMNTIuMzEgNzYuMTYgTDUxLjEyIDc2LjY3IEw1MS4xMiA3Ni42NyBMNTEuNzQgNzUuNjUgTDUyLjM5IDc0LjY4IEw1Mi44NiA3My41OSBMNTMuMjggNzIuNDkgTDU0LjAzIDcxLjYyIEw1NC4yOCA3MC40NyBMNTQuNjcgNjkuNDEgTDU1LjE3IDY4LjQgTDU1LjQyIDY3LjMgTDU1LjcyIDY2LjIzIEw1Ni4xNSA2NS4xOSBMNTYuMzYgNjQuMDggTDU2Ljk0IDYzLjAzIEw1Ni43OCA2MS44NyBMNTYuOSA2MC43NSBMNTYuODggNTkuNjIgTDU3LjA5IDU4LjQ4IEw1Ny40IDU3LjI5IEw1Ny4yNSA1Ni4xNCBMNTcuNDUgNTQuOTFaIiBmaWxsPSIjZTAxMjJlIi8+PHBhdGggZD0iTTUzLjM0IDI4LjQ5IEw1NC43IDI4Ljc0IEw1NS42MSAyOS42OSBMNTYuNzcgMzAuMjkgTDU3Ljc5IDMxLjA3IEw1OS4yMiAzMS40IEw2MC4xOCAzMi4zIEw2MC43NyAzMy41NyBMNjEuODkgMzQuMyBMNjIuOSAzNS4xNCBMNjMuNSAzNi4zNSBMNjQuNTUgMzcuMTkgTDY1LjE2IDM4LjM2IEw2NS41OSAzOS42NCBMNjYuMzQgNDAuNyBMNjcuMDQgNDEuNzkgTDY3Ljg1IDQyLjg0IEw2OC4zNCA0NC4wNSBMNjguNTQgNDUuMzggTDY5LjA0IDQ2LjU3IEw2OS4xNSA0Ny45IEw2OS4xNSA0Ny45IEw2OC4zNCA0Ni44NCBMNjcuNzQgNDUuNzIgTDY3LjA2IDQ0LjY1IEw2Ni40IDQzLjU3IEw2NS42NSA0Mi41NiBMNjQuOTcgNDEuNTEgTDY0LjM1IDQwLjQ0IEw2My44NCAzOS4yOCBMNjIuODUgMzguNDUgTDYyLjEzIDM3LjQ1IEw2MS40IDM2LjQ0IEw2MC4yMiAzNS44MyBMNTkuNzQgMzQuNTggTDU4Ljc1IDMzLjgyIEw1Ny45NSAzMi44NCBMNTcgMzIuMDQgTDU2LjAxIDMxLjI4IEw1NS4xNCAzMC4zNSBMNTQuMjYgMjkuNDEgTDUzLjM0IDI4LjQ5WiIgZmlsbD0iI2UwMTIyZSIvPjxwYXRoIGQ9Ik02OS44NyA1MS43NyBMNzAuODMgNTIuODQgTDcxLjI0IDU0LjA1IEw3MS41OCA1NS4yNyBMNzEuNzYgNTYuNTMgTDcxLjYzIDU3LjgxIEw3MS42NSA1OS4wNyBMNzEuODcgNjAuMzMgTDcyLjAxIDYxLjYxIEw3MS44MiA2Mi44NyBMNzIuMDEgNjQuMTcgTDcxLjUxIDY1LjM5IEw3MS4zNyA2Ni42NSBMNzAuOTMgNjcuODYgTDcwLjY1IDY5LjA5IEw3MC4xOCA3MC4yNyBMNzAuMDcgNzEuNTYgTDY5LjI3IDcyLjYyIEw2OC42NiA3My43MyBMNjguMzkgNzQuOTcgTDY3LjYxIDc1Ljk5IEw2Ny42MSA3NS45OSBMNjcuNjUgNzQuNjUgTDY3LjkyIDczLjQzIEw2OC4zIDcyLjI3IEw2OC42NCA3MS4xIEw2OC45MSA2OS45MSBMNjkuMjYgNjguNzUgTDY5LjE1IDY3LjQ4IEw2OS41IDY2LjMyIEw2OS44NiA2NS4xNSBMNjkuNTUgNjMuOSBMNjkuNzggNjIuNzIgTDY5LjY3IDYxLjUxIEw3MC4zMSA2MC4zMiBMNzAuMzMgNTkuMSBMNzAuMzIgNTcuODkgTDcwLjEyIDU2LjY4IEw3MC4xMSA1NS40NiBMNzAuMjQgNTQuMiBMNzAuMDUgNTIuOTkgTDY5Ljg3IDUxLjc3WiIgZmlsbD0iI2UwMTIyZSIvPjxwYXRoIGQ9Ik03Mi4xOCAyNy45NyBMNzIuOTkgMjguNTMgTDc0LjAzIDI4LjkzIEw3NC42MSAyOS42OSBMNzUuMDcgMzAuNTQgTDc1LjY3IDMxLjI5IEw3Ni4zMSAzMi4wMiBMNzYuOSAzMi43OCBMNzcuMzUgMzMuNjMgTDc3LjgxIDM0LjQ4IEw3OC4yNyAzNS4zMiBMNzguODYgMzYuMSBMNzkuMjkgMzYuOTYgTDc5LjQ3IDM3Ljk0IEw3OS43NiAzOC44NiBMODAuNDIgMzkuNjIgTDgwLjYyIDQwLjU3IEw4MC43NiA0MS41NSBMODAuODYgNDIuNTMgTDgxLjMxIDQzLjM3IEw4MS4zNyA0NC4zNSBMODEuMzcgNDQuMzUgTDgwLjgyIDQzLjU0IEw4MC4yOSA0Mi43NCBMNzkuOTEgNDEuODggTDc5LjYzIDQwLjk4IEw3OS40OSA0MC4wMiBMNzguNjEgMzkuMzkgTDc4LjI0IDM4LjU0IEw3OC4wOSAzNy41NyBMNzcuMjIgMzYuOTcgTDc2Ljk4IDM2LjA0IEw3Ni42NiAzNS4xNSBMNzUuOTUgMzQuNDkgTDc1Ljg2IDMzLjQ0IEw3NS40NCAzMi41OSBMNzQuODkgMzEuODMgTDc0LjE1IDMxLjIgTDczLjk5IDMwLjE2IEw3My40MSAyOS40MSBMNzIuNjUgMjguOCBMNzIuMTggMjcuOTdaIiBmaWxsPSIjZTAxMjJlIi8+PHBhdGggZD0iTTgzLjM2IDUxLjYgTDgzLjY4IDUyLjM5IEw4My44NCA1My4yIEw4NC40MSA1My45NyBMODQuMzYgNTQuODIgTDg0LjM3IDU1LjY2IEw4NC4xMyA1Ni41MiBMODQuNDYgNTcuMzMgTDg0LjQzIDU4LjE3IEw4NC41NiA1OSBMODUuMDMgNTkuODMgTDg0Ljg5IDYwLjY3IEw4NC43NCA2MS41MSBMODQuNTEgNjIuMzQgTDg0LjQ1IDYzLjE4IEw4NC42NiA2NC4wMyBMODQuMzkgNjQuODUgTDg0LjAzIDY1LjY1IEw4NC4xMiA2Ni41IEw4My42NSA2Ny4yOCBMODMuMzQgNjguMDcgTDgzLjM0IDY4LjA3IEw4My4yIDY3LjIxIEw4My4zNyA2Ni40IEw4My4yMiA2NS41NiBMODMuMjMgNjQuNzQgTDgzLjYyIDYzLjk1IEw4My4zIDYzLjEgTDgyLjkyIDYyLjI3IEw4My42MSA2MS40OCBMODMuMTggNjAuNjUgTDgzLjM0IDU5Ljg0IEw4My4yMyA1OS4wMiBMODMuMTMgNTguMjEgTDgzLjMxIDU3LjM5IEw4My4wOSA1Ni41OSBMODMuMTIgNTUuNzcgTDgzLjMyIDU0LjkzIEw4My4zMyA1NC4xIEw4My4xOCA1My4yOSBMODMuMjggNTIuNDUgTDgzLjM2IDUxLjZaIiBmaWxsPSIjZTAxMjJlIi8+PHBhdGggZD0iTS02LjEgNTYuMTggTC02LjMxIDU2LjY1IEwtNi42OSA1Ni42NCBMLTYuODMgNTYuMTggTC02Ljc5IDU1LjcgTC02LjE4IDU1LjgyWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik0zOS43IDkwLjA3IEwzOS40NiA5MC4yMyBMMzkuMjUgOTAuMjUgTDM5LjAyIDkwLjA3IEwzOS4yMiA4OS43NiBMMzkuNDggODkuODdaIiBmaWxsPSIjZmYyYTQ0Ii8+PHBhdGggZD0iTTM5LjIyIDEwLjUzIEwzOS4xOCAxMC44NiBMMzguNjEgMTAuODcgTDM4LjU2IDEwLjUzIEwzOC43NiAxMC4yNyBMMzkuMDkgMTAuMTNaIiBmaWxsPSIjZmYyYTQ0Ii8+PHBhdGggZD0iTS0yLjUxIDU4LjY3IEwtMy4xMSA1OS4xMSBMLTMuNyA1OS4yMyBMLTQuMDQgNTguNjcgTC0zLjc5IDU4LjAyIEwtMi45OCA1OC4yWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik03NC41MyAzNy4xMSBMNzQuMzYgMzcuNDYgTDc0LjAzIDM3LjY0IEw3My41OCAzNy4xMSBMNzMuOTIgMzYuODIgTDc0LjUxIDM2LjY3WiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik03MS45OCA3My4wNSBMNzEuNTEgNzMuODQgTDcwLjc5IDczLjc5IEw3MC4zNCA3My4wNSBMNzAuOTUgNzIuMzQgTDcxLjY5IDcyLjM5WiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik03OC40MiA1MC44NyBMNzguMiA1MS4zNyBMNzcuNzQgNTEuMzggTDc3LjM5IDUwLjg3IEw3Ny43IDUwLjYyIEw3OC4yMSA1MC42M1oiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNOC42IDQyLjU0IEw4LjAxIDQzLjMzIEw3LjM4IDQzLjA4IEw3LjMzIDQyLjU0IEw3LjQ5IDQxLjk3IEw4LjI3IDQxLjgzWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik0yMC4zIDUzLjYxIEwxOS45NyA1NC4xIEwxOS4yMyA1NC4zNCBMMTguNzkgNTMuNjEgTDE5LjM3IDUzLjIgTDE5LjgzIDUzLjE2WiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik04OC44OCAzNS42MyBMODguODcgMzUuOTIgTDg4LjU0IDM1Ljg2IEw4OC41MSAzNS42MyBMODguNTQgMzUuNDUgTDg4Ljc5IDM1LjM5WiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik01Ni41MiA4NS40OSBMNTYuNDcgODUuODQgTDU2LjIgODUuODUgTDU2LjAzIDg1LjQ5IEw1Ni4xNyA4NS4yMyBMNTYuNDUgODUuM1oiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNTAuNDMgOTMuMDMgTDUwLjAyIDkzLjUzIEw0OS4xNCA5My41NSBMNDkuMDcgOTMuMDMgTDQ5LjI1IDkyLjI2IEw0OS45IDkyLjM5WiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik0yNC42MyAyMy4xNSBMMjQuMzIgMjMuMzYgTDI0LjAxIDIzLjM3IEwyMy43OSAyMy4xNSBMMjQuMDEgMjIuOTEgTDI0LjQgMjIuNzhaIiBmaWxsPSIjZmYyYTQ0Ii8+PHBhdGggZD0iTTE3Ljg1IDE4Ljk2IEwxNy43NyAxOS4xIEwxNy41OCAxOS4xNSBMMTcuNDEgMTguOTYgTDE3LjU3IDE4Ljg0IEwxNy43NCAxOC43NFoiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNMzkuOTkgNTAuNjIgTDM3LjIzIDM4LjM2IEw0My43OCAzMy43MyBMNDEuNTEgMTYuNjUgTDM5LjQgMzEuMTMgTDMwLjM1IDM0Ljk0IEwzMi4wOSA1MS44NFoiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNDAuMjQgNTcuMyBMNTguOTggNDkuNTUgTDQ1LjQgNDMuODggTDQyLjY0IDUxLjk1IEwzNy42IDQ5LjIxIEwzNy4xOCA0Ny4zNloiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNDIuMDQgNDIuOTQgTDQyLjIyIDQzLjIzIEw2MS44NSA5LjEyIEwyOS45NSA0Ny4xNiBMMzkuNCA1MC42M1oiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNTAuMTkgMzMuODYgTDQ3LjcxIDMyLjggTDQ5LjY0IDE3Ljg5IEw0NS4xMSAzMy44MSBMNDguMTUgMzYuN1oiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNDAuMjggNTguMTEgTDU1LjY0IDU4LjcxIEw0NS44IDQ4LjI2IEw2MC4yMyA0MC4wNyBMNzAuNjQgMjUuOTggTDU4LjQ2IDM3LjYxIEwzNC4xNCA0NS42NSBMMzcuNTggNDkuODkgTDQwLjg5IDQ5LjYzWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik00My40NSA2Mi4yNyBMNjIuMTMgNTYuMTEgTDcwLjQ1IDQ1LjU2IEw3OS43OCA0Ny4yMSBMOTMuMTUgMzUuNTcgTDc5LjE5IDQzLjEzIEw2OC4zNCAzNy45NiBMNTguMTIgNDkuMzUgTDQxLjA0IDUwLjUxWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik02NC4xNiA0OS4wOSBMNzAuMjUgNDUuNjkgTDc0LjcgMzEuNzEgTDY4LjA3IDQzLjUyIEw2Mi40NyA0NS4yNVoiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNDQuMSA2My40NyBMNjcuODMgNTQuODggTDY4LjcyIDYyLjQgTDg5LjggNTUuMjkgTDcyLjg0IDU2LjYgTDcxLjk0IDQ4LjkzIEw0MS42OSA1My43N1oiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNDMuNDIgNjYuOTIgTDYyLjg0IDYzLjU5IEw2My41MiA2MS4xOCBMNzAuNjIgNjEuNDggTDcxLjQ5IDU0LjU0IEw0Mi40MSA1NS41M1oiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNjMuNjYgNjIuOTMgTDYzLjc2IDY4LjU4IEw5NS43OSA2NS4wOSBMNzAuMDIgNjIuNDkgTDcwLjMyIDYzLjIyWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik02NS44NCA2NS43OCBMNzAuNzUgNjEuMzYgTDgxLjk0IDU3LjE5IEw2OS43IDU5LjEyIEw2My41OSA2Mi42NloiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNMzkuNTIgNjYuODggTDUyLjc1IDc2LjE3IEw2Mi45NSA3My41MiBMNzAuMjEgNzkuMzQgTDc2LjI5IDc4LjExIEw3MC43NyA3Ny45IEw2NC40IDY4Ljg2IEw1NC4wNCA3MC45NCBMNDQuNzUgNjAuODJaIiBmaWxsPSIjZmYyYTQ0Ii8+PHBhdGggZD0iTTM5LjM2IDY5LjEgTDQ2LjU5IDcxLjg2IEw1Ny4xMSA4Mi42IEw2MS45MSA4Mi43NCBMNTguMDcgODEuMTEgTDUwLjU5IDY2Ljk0IEw0Mi4yMiA2Mi43MVoiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNMjQgNjIuNTIgTDEyLjQ5IDY2LjkyIEwxMS43MSA3MC43MiBMMTMuNiA2OC4yMSBMMjUuMDcgNjYuNThaIiBmaWxsPSIjZmYyYTQ0Ii8+PHBhdGggZD0iTTIzLjAxIDU1Ljk3IEwyMC41OSA1Ny40MyBMMTEuMiA1NS40NyBMMjAuNTQgNjAuNjYgTDI0LjM5IDU5Ljk0WiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik0yOC44IDUxLjIgTDIyLjU1IDQyLjQzIEwxNy41NyA0MS44MiBMMjEuMzkgNDMuODcgTDI1LjEyIDUzLjIyWiIgZmlsbD0iI2ZmMmE0NCIvPjxwYXRoIGQ9Ik0zOC4wMiA1MC45MyBMMzUuNTEgMzcuNTEgTDQyLjY4IDMzLjA4IEw0MS41MSAxNi42NSBMNDAuNDkgMzEuNzggTDMyLjA3IDM1LjggTDM0LjA2IDUxLjU0WiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik0zOS40NCA1NC43MiBMNTMuNCA0OS40NiBMNDQuMDIgNDcuOTEgTDQzLjE4IDQ5LjMgTDM3Ljk3IDQ5Ljk0WiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik00MS4zOCA0NC44NiBMMzkuMTUgNDQuMjEgTDYxLjg1IDkuMTIgTDMzLjAyIDQ2LjE4IEw0MC4wNiA0OC43MVoiIGZpbGw9IiMwNzAzMDQiLz48cGF0aCBkPSJNNDkuNjMgMzQuNjQgTDQ3IDMzLjA3IEw0OS42NCAxNy44OSBMNDUuODMgMzMuNTMgTDQ4LjcxIDM1LjkyWiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik00MC40MyA1NS45OSBMNTEuMTIgNTYuNTEgTDQyLjg5IDQ3LjYxIEw1OS43OCAzOS40NSBMNzAuNjQgMjUuOTggTDU4LjkgMzguMjIgTDM3LjA1IDQ2LjMgTDQyLjA5IDUyLjEgTDQwLjc0IDUxLjc1WiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik00Mi44NSA1OS4zMyBMNjEuMTIgNTQuNDIgTDY5LjkyIDQzLjY2IEw3OS42MyA0Ni4xOSBMOTMuMTUgMzUuNTcgTDc5LjM0IDQ0LjE1IEw2OC44NyAzOS44NiBMNTkuMTIgNTEuMDQgTDQxLjY0IDUzLjQ1WiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik02My42OSA0OC4wNCBMNjkuNjUgNDUuMDkgTDc0LjcgMzEuNzEgTDY4LjY3IDQ0LjEyIEw2Mi45NCA0Ni4zWiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik00My41IDYxLjA1IEw2OC44NSA1My40IEw2OS43NSA2MC45NSBMODkuOCA1NS4yOSBMNzEuODEgNTguMDUgTDcwLjkxIDUwLjQyIEw0Mi4yOSA1Ni4xOVoiIGZpbGw9IiMwNzAzMDQiLz48cGF0aCBkPSJNNDMuMTYgNjMuOTYgTDY1LjEzIDYxLjIgTDY3LjA3IDYxLjMzIEw2OS4yIDU2Ljk0IEw0Mi42NyA1OC40OFoiIGZpbGw9IiMwNzAzMDQiLz48cGF0aCBkPSJNNjUuMzMgNjMuMDEgTDY1LjMyIDY3LjA2IEw5NS43OSA2NS4wOSBMNjguNDUgNjQuMDEgTDY4LjY2IDYzLjE1WiIgZmlsbD0iIzA3MDMwNCIvPjxwYXRoIGQ9Ik02NS4yMiA2NC45MiBMNzAuNDYgNjAuNzUgTDgxLjk0IDU3LjE5IEw2OS45OSA1OS43NCBMNjQuMjEgNjMuNTFaIiBmaWxsPSIjMDcwMzA0Ii8+PHBhdGggZD0iTTQwLjgzIDY1LjM2IEw1My4wNyA3NC44NyBMNjMuMzEgNzIuMzYgTDcwLjM1IDc4Ljk4IEw3Ni4yOSA3OC4xMSBMNzAuNjMgNzguMjYgTDY0LjAzIDcwLjAyIEw1My43MiA3Mi4yNSBMNDMuNDQgNjIuMzNaIiBmaWxsPSIjMDcwMzA0Ii8+PHBhdGggZD0iTTQwLjA3IDY3LjUgTDQ3LjU5IDcwLjYzIEw1Ny4zNSA4Mi4yMyBMNjEuOTEgODIuNzQgTDU3LjgzIDgxLjQ4IEw0OS41OSA2OC4xNyBMNDEuNSA2NC4zMVoiIGZpbGw9IiMwNzAzMDQiLz48cGF0aCBkPSJNMjQuMyA2My42NCBMMTIuNzkgNjcuMjcgTDExLjcxIDcwLjcyIEwxMy4zIDY3Ljg2IEwyNC43OCA2NS40NloiIGZpbGw9IiMwNzAzMDQiLz48cGF0aCBkPSJNMjMuMzkgNTcuMDYgTDIwLjU3IDU4LjMyIEwxMS4yIDU1LjQ3IEwyMC41NSA1OS43NyBMMjQuMDEgNTguODVaIiBmaWxsPSIjMDcwMzA0Ii8+PHBhdGggZD0iTTI3Ljc5IDUxLjc1IEwyMi4yMyA0Mi44MyBMMTcuNTcgNDEuODIgTDIxLjcxIDQzLjQ3IEwyNi4xMyA1Mi42N1oiIGZpbGw9IiMwNzAzMDQiLz48cGF0aCBkPSJNNTEuNTkgNjAgTDUxLjMxIDYyLjE5IEw1MC42NCA2NC4yNyBMNDkuODYgNjYuMjggTDQ4Ljk0IDY4LjIyIEw0OC4zNSA3MC40MiBMNDYuODYgNzIuMDcgTDQ0Ljg5IDczLjE3IEw0My4xIDc0LjM0IEw0MS4zOSA3NS43IEwzOS4yOCA3Ni4yNCBMMzcuMzQgNzcuNTEgTDM1LjEyIDc3Ljg3IEwzMi44OSA3Ny43IEwzMC42NCA3Ny42MSBMMjguNDUgNzcuMDcgTDI2LjQxIDc2LjEzIEwyNC40IDc1LjEyIEwyMyA3My4yOSBMMjEuMTYgNzIuMDYgTDE5Ljc3IDcwLjM0IEwxOS4xIDY4LjE5IEwxNy45NiA2Ni4zNSBMMTcuMDEgNjQuMzYgTDE2Ljc5IDYyLjE3IEwxNi45OSA2MCBMMTYuMDYgNTcuNzMgTDE3LjQxIDU1Ljc0IEwxNy45NCA1My42NCBMMTguMjcgNTEuMzUgTDIwLjI1IDUwLjAxIEwyMC44OSA0Ny42OCBMMjMuMDEgNDYuNzEgTDI0LjY5IDQ1LjM0IEwyNi42NSA0NC4zOCBMMjguNiA0My4zOSBMMzAuODQgNDMuNDQgTDMyLjg5IDQyLjQxIEwzNS4wOCA0Mi44MiBMMzcuMjYgNDIuOSBMMzkuNDUgNDMuMjIgTDQxLjUyIDQ0LjAyIEw0My41NyA0NC45MiBMNDQuODggNDYuODUgTDQ2Ljg0IDQ3Ljk1IEw0Ny45MyA0OS44OCBMNDkuMjcgNTEuNiBMNTAuMDkgNTMuNjMgTDUwLjY5IDU1LjcxIEw1MS42IDU3Ljc4IEw1MS42OCA2MCBMNDguNjkgNjAgTDQ4LjIzIDU4LjIgTDQ4LjMxIDU2LjMyIEw0Ny42OSA1NC41OCBMNDcuMSA1Mi44IEw0NiA1MS4yOCBMNDQuNTkgNTAuMDYgTDQzLjYzIDQ4LjM3IEw0MS43NiA0Ny43NyBMNDAuMjUgNDYuNzIgTDM4LjQ3IDQ2LjIzIEwzNi43NiA0NS41NCBMMzQuOTQgNDUuMDggTDMzLjEgNDUuNjMgTDMxLjE2IDQ1LjEyIEwyOS40IDQ1Ljg0IEwyNy42OCA0Ni41NyBMMjUuOTYgNDcuMzQgTDI0LjU1IDQ4LjU3IEwyMy42NyA1MC4zIEwyMS42NSA1MS4wMyBMMjEuNDIgNTMuMDggTDIwLjEzIDU0LjUxIEwxOS40NCA1Ni4yNiBMMTkuOTEgNTguMjIgTDE4LjkyIDYwIEwxOS4yMiA2MS44NyBMMTkuODMgNjMuNjQgTDIwLjEgNjUuNSBMMjAuNzkgNjcuMjYgTDIyLjExIDY4LjY0IEwyMy4zNSA3MCBMMjQuNDIgNzEuNTcgTDI2LjQ1IDcxLjkgTDI3LjggNzMuMTggTDI5LjU3IDczLjY0IEwzMS4zNSA3My44NyBMMzMuMDkgNzQuNDYgTDM0LjkgNzQuMyBMMzYuNjcgNzQgTDM4LjczIDc0LjU1IEw0MC4zMiA3My40NCBMNDIuMTYgNzIuODYgTDQzLjYgNzEuNjEgTDQ0LjY3IDcwLjAyIEw0NS44MSA2OC41OCBMNDcuMjcgNjcuMyBMNDguMDcgNjUuNTcgTDQ4LjYzIDYzLjc2IEw0OC42IDYxLjg0IEw0OC43NiA2MFoiIGZpbGw9IiNmZjJhNDQiLz48cGF0aCBkPSJNNDguOTQgNTkuODkgTDQ5LjExIDYyIEw0OC4zMSA2NC4yMiBMNDcuNzcgNjYuNTYgTDQ2LjYyIDY4LjQ1IEw0NS4xOCA3MC4xMSBMNDMuODkgNzEuMDkgTDQxLjg5IDcyLjk5IEw0MC40IDczLjY0IEwzOC4zIDc0LjQ0IEwzNi4zIDc1LjA3IEwzMy45MyA3NS4xIEwzMi4wMiA3NC43OCBMMjkuODUgNzQuNDMgTDI3Ljk1IDczLjkzIEwyNS45MSA3Mi40OSBMMjMuOTggNzEuMzUgTDIyLjU2IDY5Ljg5IEwyMS4yNCA2Ny45MyBMMjAuNDYgNjYuMDkgTDE5LjQxIDYzLjkzIEwxOS4yIDYyLjMzIEwxOC43OSA1OS43OSBMMTguOSA1Ny43NiBMMTkuNzIgNTUuNjUgTDIwLjQzIDUzLjk4IEwyMS42NyA1MS43MiBMMjIuNTYgNTAuMTIgTDI0LjAyIDQ4LjYzIEwyNi4wMiA0Ny4yOSBMMjcuNTYgNDYuNTkgTDI5Ljk1IDQ1LjU5IEwzMS45NiA0NC45NSBMMzQuMTkgNDUuMjcgTDM2LjM0IDQ1LjIzIEwzOC40MSA0NS44MSBMNDAuMjIgNDYuMzYgTDQyLjE0IDQ3LjQxIEw0My45NyA0OC44NCBMNDUuNTEgNTAuMTUgTDQ2Ljg2IDUyLjA4IEw0Ny41MiA1My44NSBMNDguNTUgNTUuNjUgTDQ4LjgzIDU3Ljg1WiIgZmlsbD0iIzA3MDMwNCIvPjwvZz48L2c+PGcgZmlsdGVyPSJ1cmwoI2lua3cpIj48cGF0aCBkPSJNMTExLjExIDIxLjIyIEwxMjMuNzcgMTkuNCBMMTIzLjcyIDQzLjg4IEwxMzQuMDggNDAuNDcgTDEzNC45IDE4LjEzIEwxNDcuMzYgMTUuNjUgTDE0Ni4xNyA4MC43NyBMMTM0LjU0IDc5LjU3IEwxMzQuMDYgNTEuNzUgTDEyMy4zIDU1Ljg3IEwxMjMuNzQgNzkuMTkgTDExMS44NyA4MC42N1oiIGZpbGw9IiNmMmVjZTQiLz48cGF0aCBkPSJNMTUyLjExIDgwLjY2IEwxNjQuNTUgMTcuODMgTDE3OC4yNCAxNS43NCBMMTkxLjQzIDgxLjM0IEwxNzguMzEgNzkuOTIgTDE3MS42NCA0MC4xNiBMMTY0LjEzIDc5LjlaIiBmaWxsPSIjZjJlY2U0Ii8+PHBhdGggZD0iTTE5NS4xNyAyMC40MiBMMjA3Ljg1IDE3LjgyIEwyMDcuMzggNDQuNyBMMjE5LjE4IDE3LjYxIEwyMzIuMzIgMTYuNTkgTDIxNi4wNSA0Ny42NiBMMjMyLjg1IDgwLjgzIEwyMjAuMjkgNzkuNDggTDIwOC44MyA1Ni45OCBMMjA3LjY4IDU4LjYgTDIwNy45MyA3OS4wNyBMMTk1LjcyIDgxLjMxWiIgZmlsbD0iI2YyZWNlNCIvPjxwYXRoIGQ9Ik0yMzYuNTcgMTkuNzYgTDI0OS4zOCAxNy4wNyBMMjQ4Ljc2IDgwLjU5IEwyMzcuMTEgNzkuOTFaIiBmaWxsPSIjZjJlY2U0Ii8+PHBhdGggZD0iTTE1MCA2NiBMMTcwLjUgNTQgTDE2OC4zIDU5LjggTDE5NC41IDUyIEwxNzMuOCA2NyBMMTc2IDYxLjZaIiBmaWxsPSIjZmYyYTQ0IiBzdHJva2U9IiNmZjJhNDQiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWpvaW49Im1pdGVyIi8+PHBhdGggZD0iTTE1NS40MyA2NC42NyBMMTcwLjUxIDU4LjggTDE3MS4xOSA2MS45NCBMMTg5LjAzIDU1LjA5IEwxODguOTcgNTQuOTEgTDE3Mi40MSA1OS44NiBMMTcxLjg5IDU2LjQgTDE1NC41NyA2Mi4zM1oiIGZpbGw9IiMwNzAzMDQiLz48L2c+PC9zdmc+" alt="HAKI">`) +
  (_hl.length ? `<div class="hd-links">${_hl.join('<i></i>')}</div>` : '');
/* gc1020 A3-21: the subtitle joins only the parts that exist (no leading ' · BNB' when the coin name is missing) */
const tok = `<div class="tok"><div class="ico">${ico}</div><div><div class="tk fit" data-fit="30,18" data-ellipsis="1">${esc(String(C.ticker).replace(/^\$/,''))}</div>
  <div class="tk-sub">${[C.name, C.chain].filter(Boolean).map(esc).join(' · ')}</div></div></div>`;
const bnbL = v => Math.abs(v) >= 100 ? Math.abs(v).toFixed(1) : Math.abs(v) >= 1 ? Math.abs(v).toFixed(3) : Math.abs(v).toFixed(4);
/* 3.12.19 (owner 1120: the gradient bars after the number "look cheap, everything sits crooked"): a SOL amount gets the Solana mark the way the
   trade panel shows it, a small round badge BEFORE the number, centred on the digits; other chains keep the unit word after it */
const SOLM = '<span class="sb"><svg viewBox="0 0 398 312" aria-hidden="true"><path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z"/><path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z"/><path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z"/></svg></span>';
/* the badge goes on the headline amounts (the big number and the line under it); the ledger and the day rows show plain numbers in SOL
   (one mark per card, the columns keep their width) */
const UV = (num, wrap, head) => C.chain === 'SOL' ? (head ? `<span class="sv" aria-label="SOL">${SOLM}${num}</span>` : num) : `${num}${wrap(esc(C.chain || 'BNB'))}`;
const money = (u, b) => UNIT === 'bnb' && b != null ? `${UV(bnbL(b), x => `<small>${x}</small>`)}` : usd(u);
const hero = (mx, mn) => `<div class="big fit" data-fit="${mx},${mn}">${HIDE ? pct(C.pnlPct) : UNIT === 'bnb' ? `${UV(sgn(C.pnlBnb) + bnbL(C.pnlBnb), x => `<span class="u">${x}</span>`, 1)}` : sgn(C.pnlUsd) + usd(C.pnlUsd)}</div>`;
const sec = HIDE ? `<div class="sec priv">${KIND === '1d' ? 'Return on the day' : 'Return on entry'} · amounts hidden</div>` : UNIT === 'bnb' ? `<div class="sec"><span>${pct(C.pnlPct)}</span><i></i><span>${sgn(C.pnlUsd)}${usd(C.pnlUsd)}</span></div>` : `<div class="sec"><span>${pct(C.pnlPct)}</span><i></i><span>${UV(sgn(C.pnlBnb) + bnb(C.pnlBnb), x => `<span class="u">${x}</span>`, 1)}</span></div>`;
const LV = (u, b, k = '') => HIDE ? `<div class="v mask">••••••</div>` : `<div class="v${k && Math.abs(u || b || 0) > 1e-9 ? ' ' + k : ''}">${money(u, b)}</div>`;
const _wn = C.user?.name, _wx = C.user?.x, _wa = C.user?.avatar;
const who = !(_wn || _wx || C.ref) ? '' : `<div class="who">${_wn || _wa ? `<div class="av">${av}</div>` : ''}${_wn ? `<span class="n">${esc(_wn)}</span>` : ''}
  ${_wx ? `<span class="h">${X}${esc(_wx)}</span>` : ''}${C.ref ? `${_wn || _wx ? '<i></i>' : ''}<span class="ref">Invite code<b>${esc(C.ref)}</b></span>` : ''}</div>`;
const AL = ART[LAYOUT] || ART.A;
/* ---- kind=1d pieces ---- */
const tok1d = `<div class="tok">${C.badgeDay ? `<div class="ico day md"><b>${esc(C.badge || '')}</b><span>${esc(C.badgeDay)}</span></div>` : `<div class="ico day"><span${String(C.badge || '').length > 2 ? ' style="font-size:12px"' : ''}>${esc(C.badge || '')}</span></div>`}<div><div class="tk fit" data-fit="34,20">${esc(C.range || '')}</div>
  <div class="tk-sub">${esc(C.date || '')}${C.badgeDay || !C.chain ? '' : ' · ' + esc(C.chain)}</div></div></div>`;
function day1v34() {
  const R = C.rows || [], rate = C.pnlBnb ? C.pnlUsd / C.pnlBnb : 0, cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : 'mut';
  const mon = (u, b, sg) => HIDE ? '••••' : UNIT === 'bnb' || u == null ? `${UV((sg && Math.abs(b) > 1e-9 ? sgn(b) : '') + bnbL(b), x => `<small style="font-size:11px;margin-left:5px;color:var(--fg-4)">${x}</small>`)}` : `${sg && Math.abs(u) > 0.004 ? sgn(u) : ''}${usd(u)}`;
  const shown = [...R].sort((a, b) => Math.abs(b.bnb) - Math.abs(a.bnb)).slice(0, R.length > 5 ? 4 : 5), more = R.length - shown.length;
  const amt = r => { if (HIDE) return `<div class="am mask">••••</div>`; const u = r.usd ?? (rate ? r.bnb * rate : null);
    if (r.open) return `<div class="am mut">open</div>`;
    const flat = Math.abs(r.bnb) < 1e-9;
    return UNIT === 'bnb' || u == null ? `<div class="am ${cls(r.bnb)}">${UV((flat ? '' : sgn(r.bnb)) + bnbL(r.bnb), x => `<small>${x}</small>`)}</div>` : `<div class="am ${cls(u)}">${flat ? '' : sgn(u)}${usd(u)}</div>`; };
  return `<div class="ledger d1 v34"><div class="d1s"><span><i>Profit</i><b class="${C.profitBnb > 0 ? 'up' : ''}">${mon(C.profitUsd, C.profitBnb, 1)}</b></span><span><i>Loss</i><b class="${C.lossBnb < 0 ? 'dn' : ''}">${mon(C.lossUsd, C.lossBnb, 1)}</b></span><span><i>TXs</i><b><span class="up">${C.buys}</span><em>/</em><span class="dn">${C.sells}</span></b></span></div>
    ${shown.map(r => `<div class="tm">${esc(r.t || '')}</div><div class="tk1">${esc(String(r.ticker || '').replace(/^\$/, ''))}</div>${amt(r)}<div class="pc ${r.open || Math.abs(+r.pct) < 0.05 ? 'mut' : cls(r.pct)}">${r.open ? '' : (Math.abs(+r.pct) < 0.05 ? '0.0%' : pct(r.pct))}</div>`).join('')}${more > 0 ? `<div class="more">+${more} more coin${more === 1 ? '' : 's'}</div>` : ''}</div>`;
}
function day1() {
  if (C.buys != null) return day1v34();
  const R = C.rows || [], rate = C.pnlBnb ? C.pnlUsd / C.pnlBnb : 0;
  const wins = C.wins ?? R.filter(r => r.pct > 0).length, losses = C.losses ?? R.filter(r => r.pct < 0).length, n = C.tradesCount ?? R.length;
  const wr = wins + losses ? Math.round(wins / (wins + losses) * 100) : 0;
  const shown = R.length > 4 ? [...R].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4).sort((a, b) => a.t < b.t ? -1 : 1) : R;
  const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : 'mut';
  const amt = r => { if (HIDE) return `<div class="am mask">••••</div>`;
    const u = r.usd ?? (rate ? r.bnb * rate : null);
    return UNIT === 'bnb' || u == null ? `<div class="am ${cls(r.bnb)}">${UV(sgn(r.bnb) + bnbL(r.bnb), x => `<small>${x}</small>`)}</div>` : `<div class="am ${cls(u)}">${sgn(u)}${usd(u)}</div>`; };
  return `<div class="ledger d1"><div class="hd l"><span class="lbl">Trades</span><span>${n}</span></div><div class="hd r"><span class="up">${wins}W</span><span class="dn">${losses}L</span><i></i><span class="lbl">Win rate</span><span>${wr}%</span></div>
    ${shown.map(r => `<div class="tm">${esc(r.t || '')}</div><div class="tk1">${esc(String(r.ticker || '').replace(/^\$/, ''))}</div>${amt(r)}<div class="pc ${cls(r.pct)}">${pct(r.pct)}</div>`).join('')}</div>`;
}   // variant arts are designed for layout A
const MEDIA = Q.get('media') || (ARTK === 'rose' ? 'media/rose-loop-792.mp4' : ''), MVID = Q.get('mtype') ? Q.get('mtype') === 'video' : /\.(mp4|webm|mov)(\?|$)/i.test(MEDIA);
const MEL = !MEDIA ? '' : MVID ? `<video src="${esc(MEDIA)}" poster="${ARTK === 'rose' ? 'media/rose-loop-poster.jpg' : ''}" autoplay muted loop playsinline></video>` : `<img src="${esc(MEDIA)}" alt="">`;
const GUTS = ART.bleed && C2G ? bleed2(ART.bleed) : ART.bleed ? `<img class="bleed" src="${ART.bleed[0]}" style="${ART.bleed[1]}" alt=""><div class="scrim" style="background:${ART.bleed[2]}"></div>` : (ARTK === 'rose' || ARTK === 'upload') ? `<div class="win${Q.get('solid') ? ' solid' : ''}">${MEL}</div>` : `<img class="guts" src="${AL[0]}" style="${AL[1]}" alt="">`;

/* chart: polyline + B/S markers. `split` = draw line and markers as two svgs so the line can sit behind the art */
/* v16: with C.ch (hkCardChart from the coin page) the line is the live chart's own bar series: close of every bar buildBars()
   returns for the window, index-spaced exactly like the coin chart (empty periods have no bar), and each B/S dot sits at the
   exact bar of the fill and at the fill's own market cap / price (marks[].v). Without C.ch: the old 120-point C.chart / C.trades. */
function lineData() {
  const ch = C.ch;
  if (ch && ch.bars && ch.bars.length >= 2) {
    const ix = new Map(ch.bars.map((b, i) => [b[0], i]));
    return { d: ch.bars.map(b => b[4]), trades: (ch.marks || []).filter(m => ix.has(m.t)).map(m => ({ i: ix.get(m.t), side: m.side, v: m.v, n: m.n, bnb: m.bnb || 0 })) };
  }
  return { d: C.chart || [], trades: C.trades || [] };
}
/* shmk-1028 (owner: "buy sell ложатся как будто неправильно"): B/S tags on the exact trade point.
   Root cause of the old placement: the line's vertex at bar i is that bar's CLOSE, but the tag's dot sat at x = bar i (the close's x)
   and y = the fill's own MC/price. A memecoin buy prints below the close of its bar (the buys after it lift the close) and a sell
   above it, so every B dot sat under the line (and visually left of where the line reaches that MC), every S dot over it, and the
   stems pointed at empty space. The fill's raw MC was also used unclamped (bars are drift/quote-corrected, fills are not), so a
   stray print stretched the y range of the whole line.
   Now: the fill is a point ON the curve: x = its time inside its bar (between the previous close and this close, the segment that
   is that bar's time on an index-spaced chart), y = its own value kept inside its bar's low..high (> 15% off -> bar close, like the
   live chart's bubbles), and the line passes through it (extra vertex). Buys hang just below, sells sit just above, with a short stem
   to that point; same-side tags closer than a tag width fold into one ("B ×3", a dot stays on every fill), any remaining overlap
   stacks away from the line. Kill switch: localStorage hk_shmk_off='1' = the old placement exactly. */
const SHMK = (() => { try { return localStorage.getItem('hk_shmk_off') !== '1'; } catch (e) { return true; } })();
/* shmk:begin (pure: tests/share_markers.test.js evaluates this block) */
function shmkData(C) {
  const ch = C.ch;
  if (ch && ch.bars && ch.bars.length >= 2) {
    const ix = new Map(ch.bars.map((b, i) => [b[0], i])), tf = +ch.tf || 0;
    return { d: ch.bars.map(b => b[4]), rng: ch.bars.map(b => [Math.min(b[3], b[4]), Math.max(b[2], b[4])]),
      trades: (ch.marks || []).filter(m => ix.has(m.t)).map(m => ({ i: ix.get(m.t), side: m.side, v: m.v, n: m.n || 1, bnb: m.bnb || 0,
        f: tf > 0 && +m.ts > 0 ? (m.ts - m.t) / tf : null })) };
  }
  return { d: C.chart || [], rng: null, trades: (C.trades || []).map(t => ({ ...t, f: null })) };
}
function shmkLayout(d, rng, trades, w, h, o = {}) {
  const n = d.length, pad = o.pad ?? 0.08, S = o.tag ?? 18, off = o.off ?? 22, gap = 4;
  /* 1. anchors: fractional index u (time inside the bar) + value v on the curve's own scale */
  const A = trades.filter(t => t && t.i >= 0 && t.i < n && (t.side === 'b' || t.side === 's')).map((t, k) => {
    const c = d[t.i]; let v = +t.v > 0 ? +t.v : c;
    if (rng && rng[t.i]) { const [lo, hi] = rng[t.i]; v = v > hi * 1.15 || v < lo / 1.15 ? c : Math.min(hi, Math.max(lo, v)); }
    const f = t.f == null || !(t.i > 0) || !isFinite(t.f) ? 1 : Math.min(1, Math.max(0, t.f));
    return { side: t.side, i: t.i, u: t.i - 1 + f, f, v, n: Math.max(1, +t.n || 1), bnb: +t.bnb || 0, k };
  });
  /* 2. the line: bar closes + one vertex per anchor (at the same u: a fill at f=1 comes before the close, f<1 after the previous one) */
  const P = d.map((v, i) => ({ u: i, v, o: 1 })).concat(A.map(a => ({ u: a.u, v: a.v, o: a.f >= 1 ? 0 : 2, k: a.k })));
  P.sort((p, q) => p.u - q.u || p.o - q.o || (p.k ?? 0) - (q.k ?? 0));
  const vs = P.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const X = u => (u / (n - 1)) * w, Y = v => h - ((v - lo) / (hi - lo || 1)) * h * (1 - pad * 2) - h * pad;
  const pts = P.map(p => [X(p.u), Y(p.v)]);
  for (const a of A) { a.x = X(a.u); a.y = Y(a.v); }
  /* 3. tags: same side, tags would touch -> one group (stem to the biggest fill, dot on every fill, count = fills) */
  const tw = c => c > 1 ? S + 6 + 5.6 * String(c).length : S;
  const G = [];
  /* o.solo (pnlc2): every fill is its own marker, nothing folds into "B ×3" */
  if (o.solo) for (const a of [...A].sort((p, q) => p.x - q.x || p.k - q.k)) G.push({ side: a.side, a, m: [a], cnt: 1, x0: a.x });
  else for (const a of [...A].sort((p, q) => p.x - q.x || p.k - q.k)) {
    const g = G.find(g => g.side === a.side && a.x - g.x0 < S + 2);   // window from the group's first fill (never chains across the chart)
    if (g) { g.m.push(a); g.cnt += a.n; if (a.bnb > g.a.bnb) g.a = a; } else G.push({ side: a.side, a, m: [a], cnt: a.n, x0: a.x });
  }
  /* same-side tags that would still touch (the stem goes to the biggest fill, so a group's tag can reach its neighbour) fold too,
     instead of stacking into a long stem */
  for (let ch = !o.solo; ch;) { ch = false;
    for (let i = 0; i < G.length && !ch; i++) for (let j = i + 1; j < G.length && !ch; j++) { const p = G[i], q = G[j];
      if (p.side !== q.side || Math.abs(p.a.x - q.a.x) >= (tw(p.cnt) + tw(q.cnt)) / 2 + 2 || Math.abs(p.a.y - q.a.y) >= S + 2) continue;
      p.m.push(...q.m); p.cnt += q.cnt; if (q.a.bnb > p.a.bnb) p.a = q.a; G.splice(j, 1); ch = true; } }
  const used = [], out = [];
  if (o.solo) {   /* each fill gets its dot; a B / S tag where it has room (biggest fills first), a crowded fill keeps only its dot */
    for (const g of [...G].sort((p, q) => q.a.bnb - p.a.bnb || p.a.x - q.a.x)) { const b = g.side === 'b', x = g.a.x, y = g.a.y;
      let ty = b ? y + off : y - off; const free = t => t - S / 2 >= (o.ymin ?? -1e9) && t + S / 2 <= (o.ymax ?? 1e9) && !used.some(r => Math.abs(r.x - x) < S + 3 && Math.abs(r.y - t) < S + 3);
      if (o.one && used.some(r => r.s === g.side && Math.abs(r.x - x) < 1)) ty = NaN;   // one tag per point and side: no stacks
      else if (!free(ty) && o.one) ty = NaN;   // no room on its own point: the fill keeps its dot
      else if (!free(ty)) { const t2 = b ? ty + S + gap : ty - S - gap; ty = free(t2) ? t2 : NaN; }
      const tag = isFinite(ty); if (tag) used.push({ x, y: ty, w: S, s: g.side });
      out.push({ side: g.side, x, y, ty: tag ? ty : y, w: S, cnt: 1, tag, dots: [{ x, y }] });
    }
    out.sort((p, q) => (p.tag ? 1 : 0) - (q.tag ? 1 : 0));   // dot-only fills under the tagged ones
    return { pts, marks: out, X, Y, lo, hi, anchors: A };
  }
  for (const g of G) { const b = g.side === 'b', x = g.a.x, y = g.a.y, W = tw(g.cnt);
    let ty = b ? y + off : y - off;
    for (let k = 0; k < 40; k++) { const hit = used.find(r => Math.abs(r.x - x) < (r.w + W) / 2 + 2 && Math.abs(r.y - ty) < S + 2); if (!hit) break;
      ty = b ? hit.y + S + gap : hit.y - S - gap; }
    used.push({ x, y: ty, w: W });
    out.push({ side: g.side, x, y, ty, w: W, cnt: g.cnt, dots: g.m.map(a => ({ x: a.x, y: a.y })) });
  }
  return { pts, marks: out, X, Y, lo, hi, anchors: A };
}
/* shmk:end */
/* pnlc2 v2: opt.ds = K points. Bars fold into K steps (last close of each step, its low / high), every fill moves onto its step's point:
   a few straight legs with real swings instead of hundreds of 1 px wiggles (which read as a flat line at card size) */
function shmkDs(x, K) {
  const n = x.d.length; if (!(K >= 2) || n <= K) return x;
  const d = [], rng = [], j = i => Math.min(K - 1, Math.floor(i * K / n));
  for (let i = 0; i < n; i++) { const k = j(i), r = x.rng ? x.rng[i] : [x.d[i], x.d[i]]; d[k] = x.d[i];
    rng[k] = rng[k] ? [Math.min(rng[k][0], r[0]), Math.max(rng[k][1], r[1])] : [r[0], r[1]]; }
  return { d, rng, trades: x.trades.map(t => ({ ...t, i: j(t.i), v: 0, f: null })) };
}
function chart2(w, h, opt = {}) {
  const { d, rng, trades } = shmkDs(shmkData(C), opt.ds), n = d.length; if (n < 2) return ['', ''];
  const S = opt.tag ?? 18, L = shmkLayout(d, rng, trades, w, h, { pad: opt.pad ?? 0.08, tag: S, off: opt.off ?? 22, solo: !!opt.solo, one: !!opt.one, ymin: opt.ymin, ymax: opt.ymax });
  const pts = L.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const fb = L.marks.find(m => m.side === 'b'), by = (fb ? fb.y : L.Y(d[0])).toFixed(1);
  const base = opt.base ? `<line class="base" x1="0" x2="${w}" y1="${by}" y2="${by}"/>` : '';
  const halo = opt.halo ? `<defs><filter id="hkhalo" x="-5%" y="-25%" width="110%" height="150%"><feGaussianBlur stdDeviation="4"/></filter></defs><polyline points="${pts}" fill="none" stroke="#000" stroke-opacity=".85" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" filter="url(#hkhalo)"/>` : '';
  const area = opt.area ? `<defs><linearGradient id="hkar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><polygon class="area" fill="url(#hkar)" points="${L.pts[0][0].toFixed(1)},${h} ${pts} ${L.pts[L.pts.length - 1][0].toFixed(1)},${h}"/>` : '';
  /* pnlc2 v3 (owner: "not orderly, make it neater"): the chart sits on the card's grid - top = the PnL figure's top, floor = the stats
     line's bottom rule, right edge = the 64 px margin - and its floor is that same hairline running on from the stats */
  const axis = opt.axis ? `<line x1="-64" x2="${w}" y1="${h + 10}" y2="${h + 10}" stroke="rgba(255,255,255,.16)" stroke-width="1"/>` : '';
  const line = `${axis}${halo}${area}${base}<polyline class="ln" points="${pts}" style="${opt.lineStyle||''}"/>`;
  const f1 = v => +v.toFixed(2);
  const mk = L.marks.map(m => { const b = m.side === 'b', x = f1(m.x), y = f1(m.y), ty = f1(m.ty), W = m.w;
    const col = b ? 'var(--up)' : 'var(--accent)', fg = b ? '#03130c' : '#fff';
    const tagOnly = opt.off === 0;   // pnlc2 v2: the tag sits on the point itself, so no dot over (or under) another fill's tag
    if (m.tag === false) return `<g class="mk" data-side="${m.side}" data-n="1"><circle cx="${x}" cy="${y}" r="3.6" fill="${col}" stroke="#000" stroke-width="2"/></g>`;
    const hl = opt.halo ? `<rect x="${f1(x - W/2 - 5)}" y="${f1(ty - S/2 - 5)}" width="${W + 10}" height="${S + 10}" rx="6" fill="#000" fill-opacity=".55" filter="url(#hkhalo2)"/>` : '';
    const y2 = f1(ty + (b ? -S/2 : S/2)), stem = Math.abs(y2 - y) > 0.5 ? `<line class="stem" x1="${x}" x2="${x}" y1="${y}" y2="${y2}" stroke="${col}"/>` : '';
    return `<g class="mk" data-side="${m.side}" data-n="${m.cnt}">${hl}${stem}
      ${tagOnly ? '' : m.dots.map(o => `<circle cx="${f1(o.x)}" cy="${f1(o.y)}" r="3.6" fill="${col}" stroke="#000" stroke-width="2"/>`).join('')}
      <rect x="${f1(x - W/2)}" y="${f1(ty - S/2)}" width="${f1(W)}" height="${S}" rx="2" fill="${col}" stroke="#000" stroke-width="2" paint-order="stroke"/>
      <text x="${x}" y="${f1(ty + 0.5)}" fill="${fg}">${b ? 'B' : 'S'}${m.cnt > 1 ? `<tspan dx="1" font-size="9">×${m.cnt}</tspan>` : ''}</text></g>`;
  }).join('');
  const box = `viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"`, mdefs = opt.halo ? '<defs><filter id="hkhalo2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>' : '';
  return opt.split ? [`<svg class="ch" ${box}>${line}</svg>`, `<svg class="ch" ${box}>${mdefs}${mk}</svg>`] : [`<svg class="ch" ${box}>${line}${mk}</svg>`, ''];
}
function chart(w, h, opt = {}) {
  if (SHMK) return chart2(w, h, opt);
  const { d, trades } = lineData(), n = d.length; if (n < 2) return ['', ''];
  const vs = d.concat(trades.map(t => t.v).filter(v => v > 0));
  const lo = Math.min(...vs), hi = Math.max(...vs), pad = opt.pad ?? 0.08;
  const X = i => (i / (n - 1)) * w, Y = v => h - ((v - lo) / (hi - lo || 1)) * h * (1 - pad * 2) - h * pad;
  const pts = d.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  const PY = t => Y(t.v > 0 ? t.v : d[t.i]);   // marker price: the fill's own value when known, else the bar close
  const fb = trades.find(t => t.side === 'b'), by = (fb ? PY(fb) : Y(d[0])).toFixed(1);
  const base = opt.base ? `<line class="base" x1="0" x2="${w}" y1="${by}" y2="${by}"/>` : '';
  const halo = opt.halo ? `<defs><filter id="hkhalo" x="-5%" y="-25%" width="110%" height="150%"><feGaussianBlur stdDeviation="4"/></filter></defs><polyline points="${pts}" fill="none" stroke="#000" stroke-opacity=".85" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" filter="url(#hkhalo)"/>` : '';
  const line = `${halo}${base}<polyline class="ln" points="${pts}" style="${opt.lineStyle||''}"/>`;
  const S = opt.tag ?? 18, off = opt.off ?? 22;
  const used = [], tags = [];
  /* real series (C.ch): same-side fill groups within 4/120 of the width fold into one marker (the merge fromPage() applies to the
     old 120-point chart). Like the coin page's bubbles, the marker sits on the biggest group (bnb) and the others fold into it.
     Old data: one tag per trade, unchanged. */
  const MG = C.ch && C.ch.bars ? w * 4 / 120 : -1;
  for (const t of (MG > 0 ? [...trades].sort((a, b) => a.i - b.i) : trades)) { const L = tags.find(g => g.side === t.side && Math.abs(X(g.last) - X(t.i)) <= MG);
    if (L) { L.last = t.i; if ((t.bnb || 0) > (L.t.bnb || 0)) { L.t = t; L.dots = [t]; } } else tags.push({ side: t.side, i: t.i, last: t.i, t, dots: [t] }); }
  const dot = (t, col) => `<circle cx="${X(t.i)}" cy="${PY(t)}" r="3.6" fill="${col}" stroke="#000" stroke-width="2"/>`;
  const mk = tags.map(g => { const t = g.t;
    const x = X(t.i), y = PY(t), b = t.side === 'b';
    const col = b ? 'var(--up)' : 'var(--accent)', fg = b ? '#03130c' : '#fff';
    let ty = b ? y + off : y - off;                 // buys hang below the line, sells sit above
    for (const u of used) if (Math.abs(u.x - x) < S + 3 && Math.abs(u.y - ty) < S + 3) ty = b ? u.y + S + 4 : u.y - S - 4;
    used.push({x, y: ty});
    const hl = opt.halo ? `<rect x="${x - S/2 - 5}" y="${ty - S/2 - 5}" width="${S + 10}" height="${S + 10}" rx="6" fill="#000" fill-opacity=".55" filter="url(#hkhalo2)"/>` : '';
    return `<g class="mk">${hl}<line class="stem" x1="${x}" x2="${x}" y1="${y}" y2="${ty + (b ? -S/2 : S/2)}" stroke="${col}"/>
      ${g.dots.map(o => dot(o, col)).join('')}
      <rect x="${x - S/2}" y="${ty - S/2}" width="${S}" height="${S}" rx="2" fill="${col}" stroke="#000" stroke-width="2" paint-order="stroke"/>
      <text x="${x}" y="${ty + 0.5}" fill="${fg}">${b ? 'B' : 'S'}</text></g>`;
  }).join('');
  const box = `viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"`, mdefs = opt.halo ? '<defs><filter id="hkhalo2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>' : '';
  return opt.split ? [`<svg class="ch" ${box}>${line}</svg>`, `<svg class="ch" ${box}>${mdefs}${mk}</svg>`] : [`<svg class="ch" ${box}>${line}${mk}</svg>`, ''];
}

let html = '';
if (LAYOUT === 'A') {
  /* ONE slot for every art = the 'lock in.' chart box (left 420, top 334, 330x206). Only the window arts (thorns / upload), whose
     video window covers that box, keep their strip under the window (ART.ch). */
  const C2 = C2G;
  const CH = C2 ? SLOT2 : ART.ch || SLOT, cw = CH[2], chh = CH[3];
  let [ln, mk] = C2 ? chart(cw, chh, { split: true, pad: 0.1, off: 0, tag: 16, solo: true, one: true, ds: 28, halo: true, ymin: -18, ymax: 124, lineStyle: 'stroke-width:2.5', area: true })   // tags sit on the line's own points
                    : chart(cw, chh, { split: true, pad: 0.1, base: true, off: 20, halo: !!ART.bleed });
  const st = `style="left:${CH[0]}px;top:${CH[1]}px;width:${CH[2]}px;height:${CH[3]}px"`;
  ln = ln.replace('<svg class="ch"', `<svg class="ch" ${st}`); mk = mk.replace('<svg class="ch"', `<svg class="ch" ${st}`);
  /* soft local scrim under the slot (full-bleed arts only): keeps the thin line readable where the art reaches into the slot */
  /* full-bleed arts: no box, no band. The line and tags carry their own soft dark halo, so they read on any art without covering it */
  const tagSt = '';
  /* share-gas (user OK 06:29 MT 10-10): Gas row under Holding = the coin's buy + sell gas (Portfolio's per-coin figure), card unit; hidden with amounts */
  const gasL = b => b >= 0.01 ? bnbL(b) : b.toFixed(Math.min(9, 2 - Math.floor(Math.log10(b))));   /* gas: 3 significant digits (0.000257), not 0.0003 */
  const GAS = !HIDE && C.gasBnb != null && +C.gasBnb > 0, NR = 3 + (GAS ? 1 : 0) + (C.held && C.held !== '—' ? 1 : 0);
  /* friend-pnl-v1: with the Gas row, Bought / Sold / Holding are the gross legs (before gas) so the rows add up to the PnL:
     Sold + Holding - Bought - Gas = PnL. Without it (no gas data, amounts hidden) they stay gas-inclusive (Sold + Holding - Bought = PnL). */
  const GR = GAS && C.gross && typeof C.gross === 'object' ? C.gross : null;
  const ledger = KIND === '1d' ? day1() : `<div class="ledger${C2 ? ' st2' : NR >= 5 ? ' r5' : ''}">
    <div class="lbl">Bought</div>${GR ? LV(GR.boughtUsd, GR.boughtBnb, 'vb') : LV(C.boughtUsd, C.boughtBnb, 'vb')}
    <div class="lbl">Sold</div>${GR ? LV(GR.soldUsd, GR.soldBnb, 'vs') : LV(C.soldUsd, C.soldBnb, 'vs')}
    <div class="lbl">Holding</div>${GR ? LV(GR.holdUsd, GR.holdBnb) : LV(C.holdUsd, C.holdBnb)}
    ${GAS ? `<div class="lbl">Gas</div><div class="v vg">${UNIT === 'bnb' ? `${UV(gasL(+C.gasBnb), x => `<small>${x}</small>`)}` : usd(C.gasUsd)}</div>` : ''}
    ${C.held && C.held !== '—' ? `<div class="lbl">Held</div><div class="v">${esc(C.held)}</div>` : ''}
  </div>`;
  if (KIND === '1d') { ln = ''; mk = ''; }   // the day card spans several coins: no single-coin chart; its trade table fills the column
  const TOK = KIND === '1d' ? tok1d : tok;
  html = ART.bleed ? `${GUTS}${header}${ln}${mk}${TOK}${hero(112, 56)}${sec}${ledger}${who}` : `${header}${ln}${GUTS}${mk}${TOK}${hero(112, 56)}${sec}${ledger}${who}`;
  html += `${C.tagline ? `<div class="tag${ART.sans ? ' sans' : ''}" ${tagSt}>${esc(C.tagline)}</div>` : ''}`;
} else if (LAYOUT === 'B') {
  const [ch] = chart(526, 122, { pad: 0.1, base: true, off: 19, tag: 17 });
  html = `${header}
  <div class="pn p1">${tok}${hero(92, 50)}${sec}
    <div class="ks"><div><div class="lbl">Bought</div><div class="v">${usd(C.boughtUsd)}</div></div>
      <div><div class="lbl">Sold</div><div class="v">${usd(C.soldUsd)}</div></div>
      <div><div class="lbl">Holding</div><div class="v">${usd(C.holdUsd)}</div></div>
      ${C.held && C.held !== '—' ? `<div><div class="lbl">Held</div><div class="v">${esc(C.held)}</div></div>` : ''}</div></div>
  <div class="pn p2"><div class="lbl">Price · ${esc(String(C.ticker))}</div><div class="rng">B entry  ·  S exit</div>${ch}</div>
  <div class="pn p3">${GUTS}${C.tagline ? `<div class="cap">${esc(C.tagline)}</div>` : ''}</div>
  ${who.replace(/<i><\/i><span class="ref">[\s\S]*?<\/span>/, '')}${C.ref ? `<div class="refr"><span>Invite code<b>${esc(C.ref)}</b></span></div>` : ''}`;
} else {
  const [ch] = chart(600, 70, { pad: 0.1, off: 0, tag: 16 });
  html = `${header}${GUTS}${tok}${hero(ARTK === 'flow' ? 120 : 140, 64)}${sec}${who}
  ${C.tagline ? `<div class="tagl">${esc(C.tagline)}</div>` : ''}${ch}
  <div class="meta"><span><span class="lbl">Bought</span><span class="v">${usd(C.boughtUsd)}</span></span>
    <span><span class="lbl">Sold</span><span class="v">${usd(C.soldUsd)}</span></span>
    <span><span class="lbl">Holding</span><span class="v">${usd(C.holdUsd)}</span></span>
    ${C.held && C.held !== '—' ? `<span><span class="lbl">Held</span><span class="v">${esc(C.held)}</span></span>` : ''}</div>`;
}
const card = document.getElementById('card');
card.className = `card ${LAYOUT} ${STATE} ${ARTK}-art${ART.bleed ? ' bleed-art' : ''}${KIND === '1d' ? ' k1d' : ''}${HIDE ? ' priv' : ''}${Q.get('bare') ? ' bare' : ''}${Q.get('accent') === 'red' ? ' red' : ''}`;
if (Q.get('bg') === '0') document.documentElement.classList.add('clear');
card.innerHTML = html;

function fitAll(){
  document.querySelectorAll('[data-fit]').forEach(el => {
    const [mx, mn] = el.dataset.fit.split(',').map(Number);
    let s = mx; el.style.fontSize = s + 'px';
    while (el.scrollWidth > el.clientWidth + 0.5 && s > mn) { s -= 1; el.style.fontSize = s + 'px'; }
    if (el.dataset.ellipsis) el.style.textOverflow = 'ellipsis';
  });
}
fitAll();

/* count-up: hero $, % and BNB roll from 0 to the final value once, then hold. Fit is solved on the FINAL text first so
   the type size never jumps while counting. hkSet(t) is called per frame by the renderer; live, call hkPlay(). */
const CU = { delay: 0.30, dur: 1.35 };
const _ease = x => 1 - Math.pow(1 - x, 4);
const _bigEl = () => document.querySelector('.big'), _secEl = () => document.querySelector('.sec');
let _final = null;
window.hkSet = t => {
  if (HIDE || UNIT === 'bnb') return;
  if (!_final) _final = { big: _bigEl().textContent, sec: _secEl().innerHTML };
  const k = _ease(Math.min(1, Math.max(0, (t - CU.delay) / CU.dur)));
  if (k >= 1) { _bigEl().textContent = _final.big; _secEl().innerHTML = _final.sec; return; }
  const v = Math.round(C.pnlUsd * 100 * k) / 100, p = C.pnlPct * k, b = C.pnlBnb * k;
  _bigEl().textContent = `${sgn(C.pnlUsd)}${usd(v)}`;
  _secEl().innerHTML = `<span>${pct(C.pnlPct < 0 ? -Math.abs(p) : Math.abs(p))}</span><i></i><span>${UV(sgn(C.pnlBnb) + Math.abs(b).toFixed(3), x => `<span class="u">${x}</span>`, 1)}</span>`;
};
window.hkPlay = () => { const t0 = performance.now(); const f = n => { const t = (n - t0) / 1000; hkSet(t); if (t < CU.delay + CU.dur + .05) requestAnimationFrame(f); }; requestAnimationFrame(f); };
Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(()=>{}))]).then(() => { fitAll(); document.documentElement.dataset.ready = '1'; });
