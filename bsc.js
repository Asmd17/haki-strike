/* HAKI Strike, BSC trading (1122, owner: "we already have it all in our terminal"): the HAKI terminal's routes, quotes and senders moved into
   the extension (full_trade.py build / _qcalls / _qparse, config contracts + gas_limits + send_private). Signs with the user's own BSC key
   (evm.js), no server. Routes: four.meme bonding curve (TokenManager2, BNB-quoted), Flap portal (BNB-quoted), PancakeSwap V2 and V3 (WBNB pairs).
   Sends to the private relays at once (MEV-protected, as HAKI's default), the public nodes only for reads. */
'use strict';
const BSC = (() => {
  const E = typeof EVM !== 'undefined' ? EVM : require('./evm.js');
  const ZERO = '0x0000000000000000000000000000000000000000';
  const C = {   /* HAKI config.example.json contracts */
    TM2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b', HELPER: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034', FLAP: '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', V2R: '0x10ED43C718714eb63d5aA57B78B54704E256024E', V2F: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    V3F: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', SR: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', V3Q: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997' };
  const GAS = { four_x_buy: 1300000, four_x_sell: 1200000, four_buy: 650000, four_sell: 450000, flap_buy: 1000000, flap_sell: 1000000, v2_buy: 600000, v2_sell: 800000, v3_buy: 600000, v3_sell: 700000, approve: 90000 };
  const READ = ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://rpc.48.club'];
  const SEND = ['https://rpc.48.club', 'https://puissant-builder.48.club', 'https://bsc.blockrazor.xyz', 'https://ger-bscscutum.blockrazor.xyz', 'https://bsc.rpc.blxrbdn.com',
    'https://bscrpc.pancakeswap.finance', 'https://bsc.merkle.io', 'https://rpc.bsc.jetbldr.xyz'];
  const ROUTES = ['four', 'four_x', 'flap', 'pancake_v2', 'pancake_v2q', 'pancake_v3'];
  const MAXU = (1n << 256n) - 1n, low = a => String(a).toLowerCase();

  /* ---------- RPC ---------- */
  let RI = 0;
  async function rpc(method, params, urls) {
    const L = urls || READ; let err;
    for (let i = 0; i < L.length; i++) {
      const u = L[(RI + i) % L.length];
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        if (r.status === 429 || r.status >= 500) { err = new Error(u + ' ' + r.status); continue; }
        const j = await r.json(); if (j.error) { const e = new Error(j.error.message || JSON.stringify(j.error)); e.rpc = true; throw e; }
        if (!urls) RI = (RI + i) % L.length; return j.result;
      } catch (e) { if (e.rpc) throw e; err = e; }
    }
    throw err || new Error('BSC node unreachable');
  }
  async function batch(calls) {   /* [[method, params]] -> results (errors as null), one request */
    for (let i = 0; i < READ.length; i++) {
      const u = READ[(RI + i) % READ.length];
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calls.map(([m, p], k) => ({ jsonrpc: '2.0', id: k, method: m, params: p }))) });
        if (!r.ok) continue; const j = await r.json(); if (!Array.isArray(j)) continue;
        const out = new Array(calls.length).fill(null); for (const x of j) if (x && x.id != null) out[x.id] = x.error ? null : x.result; return out;
      } catch (_) {}
    }
    return Promise.all(calls.map(([m, p]) => rpc(m, p).catch(() => null)));
  }
  const ec = (to, data) => ['eth_call', [{ to, data }, 'latest']];
  const words = h => { h = String(h || '').replace(/^0x/, ''); const o = []; for (let i = 0; i + 64 <= h.length; i += 64) o.push(BigInt('0x' + h.substr(i, 64))); return o; };
  const wAddr = w => '0x' + w.toString(16).padStart(40, '0');

  /* ---------- the coin: which venue trades it ---------- */
  const RC = new Map();   /* token -> {route, ...} for 20 s */
  async function route(token, fresh) {
    const a = low(token), c = RC.get(a); if (c && !fresh && Date.now() - c.t < 20000) return c;
    const fees = [100, 500, 2500, 10000];
    const R = await batch([
      ec(C.HELPER, E.call('getTokenInfo(address)', [a])), ec(C.FLAP, E.call('getTokenV5(address)', [a])), ec(C.V2F, E.call('getPair(address,address)', [a, C.WBNB])),
      ...fees.map(f => ec(C.V3F, E.call('getPool(address,address,uint24)', [a, C.WBNB, f]))), ec(a, E.call('decimals()', [])), ec(a, E.call('totalSupply()', [])), ec(a, E.call('symbol()', []))]);
    const dec = R[7] ? Number(words(R[7])[0]) : 18, supply = R[8] ? words(R[8])[0] : 0n;
    let out = null, coinQuote = null;
    const four = words(R[0]);
    if (four.length >= 12 && four[1] !== 0n) {
      const quote = wAddr(four[2]); if (quote !== ZERO) coinQuote = quote;
      /* 3.14.2: a four.meme coin quoted in another token (USDT, USD1, ...) is bought / sold for BNB through four.meme's Helper3 (buyWithEth /
         sellForEth, HAKI 'four_x'); its curve price is in that token */
      if (!four[11]) out = quote === ZERO ? { route: 'four', venue: 'four.meme', price: Number(four[3]) / 1e18, progress: four[10] ? Number(four[9]) / Number(four[10]) : 0 }
        : { route: 'four_x', venue: 'four.meme', quote, progress: four[10] ? Number(four[9]) / Number(four[10]) : 0 };
    }
    const flap = words(R[1]);
    if (flap.length >= 11 && wAddr(flap[9]) !== ZERO && !coinQuote) coinQuote = wAddr(flap[9]);
    if (!out && flap.length >= 11 && (flap[0] === 1n || flap[0] === 2n || flap[0] === 3n)) {
      out = wAddr(flap[9]) === ZERO ? { route: 'flap', venue: 'Flap', price: Number(flap[3]) / 1e18, progress: flap[8] ? Number(flap[2]) / Number(flap[8]) : 0 } : { route: 'unsupported', why: 'Flap coin still on its curve, quoted in another token: not yet' };
    }
    if (!out) {   /* PancakeSwap: the deeper of the V2 pair and the V3 pools, by the WBNB they hold */
      const pools = []; const pair = R[2] && wAddr(words(R[2])[0]);
      if (pair && pair !== ZERO) pools.push({ route: 'pancake_v2', pool: pair });
      fees.forEach((f, i) => { const p = R[3 + i] && wAddr(words(R[3 + i])[0]); if (p && p !== ZERO) pools.push({ route: 'pancake_v3', pool: p, fee: f }); });
      if (pools.length) {
        const B = await batch(pools.map(p => ec(C.WBNB, E.call('balanceOf(address)', [p.pool]))));
        pools.forEach((p, i) => { p.wbnb = B[i] ? words(B[i])[0] : 0n; });
        pools.sort((x, y) => (y.wbnb > x.wbnb ? 1 : y.wbnb < x.wbnb ? -1 : 0));
        if (pools[0].wbnb > 10n ** 17n) out = Object.assign({ venue: pools[0].route === 'pancake_v2' ? 'PancakeSwap V2' : 'PancakeSwap V3' }, pools[0]);   /* >= 0.1 BNB in it */
      }
      /* 3.14.2 (owner 1122, MengLan: a Flap coin paired with FXIon on PancakeSwap): no real BNB pool -> PancakeSwap V2 through the coin's own
         quote token (or USDT / USD1): BNB -> quote -> coin and back (HAKI 'pancake_v2q') */
      if (!out) {
        const Q = [...new Set([coinQuote, '0x55d398326f99059ff775485246999027b3197955', '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d'].filter(Boolean).map(low))];
        const P2 = await batch(Q.flatMap(q => [ec(C.V2F, E.call('getPair(address,address)', [a, q])), ec(C.V2F, E.call('getPair(address,address)', [q, C.WBNB]))]));
        const cand = Q.map((q, i) => ({ q, p1: P2[2 * i] && wAddr(words(P2[2 * i])[0]), p2: P2[2 * i + 1] && wAddr(words(P2[2 * i + 1])[0]) })).filter(x => x.p1 && x.p1 !== ZERO && x.p2 && x.p2 !== ZERO);
        if (cand.length) {
          const B = await batch(cand.map(x => ec(x.q, E.call('balanceOf(address)', [x.p1]))));
          cand.forEach((x, i) => { x.liq = B[i] ? words(B[i])[0] : 0n; }); cand.sort((x, y) => (y.liq > x.liq ? 1 : y.liq < x.liq ? -1 : 0));
          if (cand[0].liq > 0n) { const S = await rpc('eth_call', [{ to: cand[0].q, data: E.call('symbol()', []) }, 'latest']).catch(() => '');
            let qs = ''; try { const n = Number(BigInt('0x' + S.slice(66, 130))); qs = new TextDecoder().decode(E.hexToBytes('0x' + S.slice(130, 130 + n * 2))); } catch (_) {}
            out = { route: 'pancake_v2q', venue: 'PancakeSwap V2 via ' + (qs || 'its pair token'), quote: cand[0].q, pool: cand[0].p1 }; }
        }
      }
    }
    if (!out) out = { route: 'none', why: 'no BNB market found for this coin' };
    let sym = ''; try { const w = String(R[9] || ''); if (w.length > 130) { const n = Number(BigInt('0x' + w.slice(66, 130))); sym = new TextDecoder().decode(E.hexToBytes('0x' + w.slice(130, 130 + n * 2))); } } catch (_) {}
    Object.assign(out, { t: Date.now(), token: a, dec, supply, sym }); RC.set(a, out); return out;
  }

  /* ---------- quotes (HAKI _qcalls / _qparse) ---------- */
  function quoteCall(r, side, amt) {
    const a = r.token;
    if (r.route === 'four') return side === 'buy' ? ec(C.HELPER, E.call('tryBuy(address,uint256,uint256)', [a, 0, amt])) : ec(C.HELPER, E.call('trySell(address,uint256)', [a, amt]));
    if (r.route === 'flap') return ec(C.FLAP, E.call('quoteExactInput((address,address,uint256))', [side === 'buy' ? [ZERO, a, amt] : [a, ZERO, amt]]));
    if (r.route === 'pancake_v2') return ec(C.V2R, E.call('getAmountsOut(uint256,address[])', [amt, side === 'buy' ? [C.WBNB, a] : [a, C.WBNB]]));
    if (r.route === 'pancake_v2q') return ec(C.V2R, E.call('getAmountsOut(uint256,address[])', [amt, side === 'buy' ? [C.WBNB, r.quote, a] : [a, r.quote, C.WBNB]]));
    if (r.route === 'pancake_v3') return ec(C.V3Q, E.call('quoteExactInputSingle((address,address,uint256,uint24,uint160))', [[side === 'buy' ? C.WBNB : a, side === 'buy' ? a : C.WBNB, amt, r.fee, 0]]));
    return null;
  }
  function quoteParse(r, side, res) {
    const w = words(res); if (!w.length) return 0n;
    if (r.route === 'four') return side === 'buy' ? w[2] : (w[2] > w[3] ? w[2] - w[3] : 0n);
    if (r.route === 'pancake_v2' || r.route === 'pancake_v2q') return w[w.length - 1];
    return w[0];
  }
  async function quote(r, side, amt, urls) {
    if (r.route === 'four_x') {   /* BNB -> quote on PancakeSwap V2, then the curve (Helper3 tryBuy / trySell); sells the other way */
      if (side === 'buy') { const q = await rpc('eth_call', [{ to: C.V2R, data: E.call('getAmountsOut(uint256,address[])', [amt, [C.WBNB, r.quote]]) }, 'latest'], urls), qw = words(q); const qa = qw[qw.length - 1] || 0n;
        const t = words(await rpc('eth_call', [{ to: C.HELPER, data: E.call('tryBuy(address,uint256,uint256)', [r.token, 0, qa]) }, 'latest'], urls)); return t[2] || 0n; }
      const t = words(await rpc('eth_call', [{ to: C.HELPER, data: E.call('trySell(address,uint256)', [r.token, amt]) }, 'latest'], urls)), qa = t.length > 3 && t[2] > t[3] ? t[2] - t[3] : 0n; if (!qa) return 0n;
      const q = words(await rpc('eth_call', [{ to: C.V2R, data: E.call('getAmountsOut(uint256,address[])', [qa, [r.quote, C.WBNB]]) }, 'latest'], urls)); return q[q.length - 1] || 0n;
    }
    const c = quoteCall(r, side, amt); if (!c) throw new Error(r.why || 'no route'); return quoteParse(r, side, await rpc(c[0], c[1], urls));
  }
  /* 3.26.1 security (audit 1122): the minimum a trade accepts is set from the quote. One lying node could quote low and so lower that
     minimum (room for a sandwich). The quote is asked of two different nodes and the HIGHER one is used (the stricter minimum); when
     they differ by more than 3 % a third node decides (the middle one of three). */
  const from = i => [READ[i % READ.length], ...READ.filter((_, j) => j !== i % READ.length)];
  async function quoteSafe(r, side, amt) {
    if (READ.length < 2) return quote(r, side, amt);
    const [q1, q2] = await Promise.all([quote(r, side, amt, from(RI)).catch(() => null), quote(r, side, amt, from(RI + 1)).catch(() => null)]);
    const L = [q1, q2].filter(x => x != null && x > 0n); if (!L.length) return quote(r, side, amt); if (L.length === 1) return L[0];
    const hi = L[0] > L[1] ? L[0] : L[1], lo = L[0] > L[1] ? L[1] : L[0];
    if (hi - lo > hi * 3n / 100n) { const q3 = await quote(r, side, amt, from(RI + 2)).catch(() => null); if (q3 != null && q3 > 0n) { const s = [lo, hi, q3].sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return s[1]; } }
    return hi;
  }

  /* ---------- the transaction (HAKI build) ---------- */
  function build(r, side, amt, minOut, me) {
    const a = r.token, dl = Math.floor(Date.now() / 1000) + 90;
    if (side === 'buy') {
      if (r.route === 'four') return { to: C.TM2, value: amt, data: E.call('buyTokenAMAP(address,uint256,uint256)', [a, amt, minOut]), gk: 'four_buy' };
      if (r.route === 'flap') return { to: C.FLAP, value: amt, data: E.call('swapExactInput((address,address,uint256,uint256,bytes))', [[ZERO, a, amt, minOut, '0x']]), gk: 'flap_buy' };
      if (r.route === 'pancake_v2') return { to: C.V2R, value: amt, data: E.call('swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)', [minOut, [C.WBNB, a], me, dl]), gk: 'v2_buy' };
      if (r.route === 'pancake_v2q') return { to: C.V2R, value: amt, data: E.call('swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)', [minOut, [C.WBNB, r.quote, a], me, dl]), gk: 'v2_buy' };
      if (r.route === 'four_x') return { to: C.HELPER, value: amt, data: E.call('buyWithEth(uint256,address,address,uint256,uint256)', [0, a, me, amt, minOut]), gk: 'four_x_buy' };
      if (r.route === 'pancake_v3') { const inner = E.call('exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))', [[C.WBNB, a, r.fee, me, amt, minOut, 0]]);
        return { to: C.SR, value: amt, data: E.call('multicall(uint256,bytes[])', [dl, [inner]]), gk: 'v3_buy' }; }
    } else {
      if (r.route === 'four') { amt = amt / 10n ** 9n * 10n ** 9n;   /* four.meme takes gwei-granular amounts ('GW' revert) */
        return { to: C.TM2, value: 0n, data: E.call('sellToken(uint256,address,uint256,uint256,uint256,address)', [0, a, amt, minOut, 0, ZERO]), gk: 'four_sell', spender: C.TM2, amt }; }
      if (r.route === 'flap') return { to: C.FLAP, value: 0n, data: E.call('swapExactInput((address,address,uint256,uint256,bytes))', [[a, ZERO, amt, minOut, '0x']]), gk: 'flap_sell', spender: C.FLAP, amt };
      if (r.route === 'pancake_v2') return { to: C.V2R, value: 0n, data: E.call('swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)', [amt, minOut, [a, C.WBNB], me, dl]), gk: 'v2_sell', spender: C.V2R, amt };
      if (r.route === 'pancake_v2q') return { to: C.V2R, value: 0n, data: E.call('swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)', [amt, minOut, [a, r.quote, C.WBNB], me, dl]), gk: 'v2_sell', spender: C.V2R, amt };
      if (r.route === 'four_x') { amt = amt / 10n ** 9n * 10n ** 9n;   /* Helper3 sells to the quote on the curve, then swaps it to BNB; it pulls the tokens through TokenManager2's allowance */
        return { to: C.HELPER, value: 0n, data: E.call('sellForEth(uint256,address,uint256,uint256,uint256,address)', [0, a, amt, minOut, 0, ZERO]), gk: 'four_x_sell', spender: C.TM2, amt }; }
      if (r.route === 'pancake_v3') { const i1 = E.call('exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))', [[a, C.WBNB, r.fee, '0x0000000000000000000000000000000000000002', amt, minOut, 0]]);
        const i2 = E.call('unwrapWETH9(uint256,address)', [minOut, me]);
        return { to: C.SR, value: 0n, data: E.call('multicall(uint256,bytes[])', [dl, [i1, i2]]), gk: 'v3_sell', spender: C.SR, amt }; }
    }
    throw new Error(r.why || 'this coin has no supported BNB market');
  }

  /* ---------- sending ---------- */
  const NONCE = new Map();   /* address -> next nonce we hand out (pending count from the node, then counted up locally for 30 s) */
  async function nonceOf(me) {
    const c = NONCE.get(me), n = BigInt(await rpc('eth_getTransactionCount', [me, 'pending']));
    const next = c && Date.now() - c.t < 30000 && c.n > n ? c.n : n; NONCE.set(me, { n: next + 1n, t: Date.now() }); return next;
  }
  function nonceBack(me, n) { const c = NONCE.get(me); if (c && c.n === n + 1n) NONCE.set(me, { n, t: c.t }); }
  async function gasPrice(gwei) {
    if (gwei > 0) return BigInt(Math.round(gwei * 1e9));
    const g = BigInt(await rpc('eth_gasPrice', [])); const floor = 50000000n, cap = 10000000000n;   /* BSC's floor 0.05 gwei; 3.21.5: a lying node can not set more than 10 gwei */
    return g > cap ? cap : g > floor ? g : floor;
  }
  async function sendRaw(raw) {   /* every private relay at once; ok when one took it */
    const one = u => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [raw] }) })
      .then(r => r.json()).then(j => { const e = j.error && (j.error.message || JSON.stringify(j.error)); if (e && !/already known|already imported|already exist/i.test(e)) throw new Error(e); return new URL(u).host; });
    const L = SEND.map(one);
    return new Promise((res, rej) => { let left = L.length; const errs = [];
      for (const p of L) p.then(h => res(h), e => { errs.push(String(e.message || e).slice(0, 80)); if (!--left) rej(new Error('no relay took it: ' + errs.slice(0, 3).join('; '))); }); });
  }
  async function signSend(tx, key, me, n, gp) {
    const s = await E.signTx({ nonce: n, gasPrice: gp, gasLimit: GAS[tx.gk] || 600000, to: tx.to, value: tx.value || 0n, data: tx.data, chainId: 56 }, key);
    const via = await sendRaw(s.raw); return { hash: s.hash, via };
  }
  async function allowance(token, me, spender) { return words(await rpc('eth_call', [{ to: token, data: E.call('allowance(address,address)', [me, spender]) }, 'latest']))[0] || 0n; }
  async function balanceOf(token, me) { return words(await rpc('eth_call', [{ to: token, data: E.call('balanceOf(address)', [me]) }, 'latest']))[0] || 0n; }
  async function bnb(me) { return BigInt(await rpc('eth_getBalance', [me, 'latest'])); }

  /* o: {side, token, bnb (buy) | pct (sell), slip %, gwei (0 = the network's), live} -> {hash, via, route, out, min} */
  /* 3.29.31 (owner 1126 "очень долго покупает": "sent in 1296 ms"): the node reads of a trade ran one after another (quote, balance, nonce;
     ~150 ms each, 350-900 ms on a cold connection). Now gas price, balance, allowance and nonce are asked at once with the quote, and the
     relays' connections are kept warm while a BNB coin is open (warm, called by position) */
  const spenderOf = r => r.route === 'four' || r.route === 'four_x' ? C.TM2 : r.route === 'flap' ? C.FLAP : r.route === 'pancake_v2' || r.route === 'pancake_v2q' ? C.V2R : r.route === 'pancake_v3' ? C.SR : null;
  let warmT = 0;
  /* 3.29.33 (owner 1126 "бнб покупки и продажи очень медленные"): the quote is asked of TWO nodes (security, 3.26.1) and the panel's
     polling kept only one of them warm: the other paid a new connection (350-900 ms) on every click. Every read node is kept warm too. */
  function warm() { if (Date.now() - warmT < 15000) return; warmT = Date.now();
    for (const u of SEND) fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }).catch(() => {});
    for (const u of READ) fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' }).catch(() => {}); }
  async function trade(o, key, me) {
    const T0 = Date.now(), r = await route(o.token); if (!ROUTES.includes(r.route)) throw new Error(r.why || 'no BNB market for this coin');
    const slip = Math.max(0.1, Math.min(100, +o.slip || 15)) / 100, buy = o.side === 'buy', live = o.live !== false, sp = buy ? null : spenderOf(r);
    const gpP = gasPrice(+o.gwei || 0), haveP = buy ? bnb(me) : null, alP = sp && live ? allowance(r.token, me, sp) : null, nP = live ? nonceOf(me) : null;
    for (const p of [gpP, haveP, alP, nP]) if (p) p.catch(() => {});
    let held = null, used = false;   /* held: a nonce taken and not sent yet (handed back when the trade stops); used: nP's nonce went out */
    try {
      let amt;
      if (buy) { amt = BigInt(Math.round(+o.bnb * 1e18)); if (!(amt > 0n)) throw new Error('amount must be above 0'); }
      else { const bal = await balanceOf(r.token, me); const pct = Math.max(0, Math.min(100, +o.pct || 0)); amt = pct >= 100 ? bal : bal * BigInt(Math.round(pct * 100)) / 10000n; if (!(amt > 0n)) throw new Error('you hold none of this token'); }
      const [est, gp] = await Promise.all([quoteSafe(r, o.side, !buy && (r.route === 'four' || r.route === 'four_x') ? amt / 10n ** 9n * 10n ** 9n : amt), gpP]);
      if (!(est > 0n)) throw new Error('no quote for this trade: not sent');   /* HAKI minout_guard: never trade with no minimum */
      const min = slip >= 1 ? 1n : est * BigInt(Math.round((1 - slip) * 10000)) / 10000n;
      const tx = build(r, o.side, amt, min > 0n ? min : 1n, me);
      if (buy) { const have = await haveP; const need = amt + gp * BigInt(GAS[tx.gk]); if (have < need) throw new Error('not enough BNB: ' + (Number(have) / 1e18).toFixed(4) + ', this needs about ' + (Number(need) / 1e18).toFixed(4)); }
      if (!live) {
        const sim = await rpc('eth_estimateGas', [{ from: me, to: tx.to, value: '0x' + tx.value.toString(16), data: tx.data }]).then(g => ({ ok: true, gas: Number(BigInt(g)) }), e => ({ ok: false, err: String(e.message).slice(0, 160) }));
        return { sent: false, route: r.route, venue: r.venue, out: est.toString(), min: min.toString(), sim };
      }
      const out = { route: r.route, venue: r.venue, out: est.toString(), min: min.toString(), dec: r.dec, tq: Date.now() - T0 };   /* 3.29.33: ms to the quote */
      let n = await nP; held = n;
      if (tx.spender && (await alP) < tx.amt) {   /* first sell on this venue: approve, then the sell right behind it */
        out.approve = await signSend({ to: r.token, value: 0n, data: E.call('approve(address,uint256)', [tx.spender, MAXU]), gk: 'approve' }, key, me, n, gp);
        held = null; used = true; n = await nonceOf(me); held = n;
      }
      Object.assign(out, await signSend(tx, key, me, n, gp)); held = null; used = true;
      if (buy) preApprove(r, key, me, gp).catch(() => {});   /* so the first sell needs no approval */
      return out;
    } catch (e) { if (held != null) nonceBack(me, held); else if (nP && !used) { const k = await nP.catch(() => null); if (k != null) nonceBack(me, k); } throw e; }
  }
  /* 3.29.31: buys this wallet made on a coin that the panel never booked (3.14.0-3.29.30: the 'confirmed' reply carried a BigInt Chrome can
     not pass, so no buy was ever booked): the coin's Transfer logs to your address over the last ~4.5 h (publicnode: under 10,000 blocks a
     query), each one's transaction sent by your wallet with BNB = a buy of that much BNB. Sells are not rebuilt (their BNB comes back inside
     the call): when there was one, nothing is filled in. */
  async function buysOf(token, me) {
    const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad = '0x' + low(me).slice(2).padStart(64, '0'), U = ['https://bsc-rpc.publicnode.com'], hx = v => '0x' + v.toString(16);
    const top = parseInt(await rpc('eth_blockNumber', [], U), 16), ins = new Set(); let sells = 0;
    for (let k = 0; k < 4; k++) { const hi = top - k * 9000, lo = hi - 8999;
      const [a, b] = await Promise.all([rpc('eth_getLogs', [{ address: token, fromBlock: hx(lo), toBlock: hx(hi), topics: [T, null, pad] }], U), rpc('eth_getLogs', [{ address: token, fromBlock: hx(lo), toBlock: hx(hi), topics: [T, pad] }], U)]);
      for (const l of a || []) ins.add(l.transactionHash); sells += (b || []).length; }
    if (sells) return { sells, nb: 0, in: 0 };
    let bin = 0, nb = 0;
    for (const h of ins) { const t = await rpc('eth_getTransactionByHash', [h]).catch(() => null); if (t && low(t.from) === low(me) && BigInt(t.value || 0) > 0n) { bin += Number(BigInt(t.value)) / 1e18; nb++; } }
    return { in: bin, nb, sells: 0 };
  }
  async function preApprove(r, key, me, gp) {
    const spender = r.route === 'four' || r.route === 'four_x' ? C.TM2 : r.route === 'pancake_v2q' ? C.V2R : r.route === 'flap' ? C.FLAP : r.route === 'pancake_v2' ? C.V2R : r.route === 'pancake_v3' ? C.SR : null; if (!spender) return;
    await new Promise(s => setTimeout(s, 4000));
    if ((await allowance(r.token, me, spender)) > MAXU / 2n) return;
    const n = await nonceOf(me);
    try { await signSend({ to: r.token, value: 0n, data: E.call('approve(address,uint256)', [spender, MAXU]), gk: 'approve' }, key, me, n, gp); } catch (e) { nonceBack(me, n); }
  }
  async function receipt(hash) { const r = await rpc('eth_getTransactionReceipt', [hash]); return r ? { st: r.status === '0x1' ? 'confirmed' : 'failed', block: parseInt(r.blockNumber, 16), gas: Number(BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || 0)) / 1e18 } : { st: 'pending' }; }   /* 3.29.31: gas in BNB as a number (a BigInt can not travel to the page: the panel never heard 'confirmed') */

  /* ---------- the position: tokens held, their BNB value now (a small sell quote scaled up: the price, not the price impact), market cap ---------- */
  async function position(token, me) {
    warm(); const r = await route(token), raw = await balanceOf(r.token, me);
    let px = 0;   /* BNB per whole token */
    try {
      if (r.route === 'four' || r.route === 'flap') px = r.price || 0;
      if (!px && ROUTES.includes(r.route)) { const unit = 10n ** BigInt(r.dec), probe = raw > 0n ? raw / 50n || raw : unit; const out = await quote(r, 'sell', r.route === 'four' || r.route === 'four_x' ? probe / 10n ** 9n * 10n ** 9n || 10n ** 9n : probe); px = Number(out) / 1e18 / (Number(probe) / 10 ** r.dec); }
    } catch (_) {}
    const ui = Number(raw) / 10 ** r.dec;
    return { token: r.token, route: r.route, venue: r.venue, why: r.why, sym: r.sym, dec: r.dec, raw: raw.toString(), ui, value_bnb: ui * px, mc_bnb: px * Number(r.supply) / 10 ** r.dec, price: px };
  }

  return { C, GAS, ROUTES, rpc, batch, route, quote, quoteSafe, build, trade, receipt, position, balanceOf, bnb, sendRaw, allowance, buysOf };
})();
if (typeof module !== 'undefined') module.exports = BSC;
