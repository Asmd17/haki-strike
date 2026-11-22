/* HAKI Strike, BSC (1122, owner: "now BSC", the HAKI terminal's routes moved into the extension). Everything an EVM trade needs, with no
   library: keccak-256, secp256k1 (public key, RFC 6979 signatures with low-s and the recovery bit), RLP, ABI encoding / decoding, legacy
   (EIP-155) transactions. Loaded by bg.js (importScripts) and by the tests (node). Checked against ethers 6 (tests/evm_vectors). */
'use strict';
const EVM = (() => {
  /* ---------- bytes ---------- */
  const hexToBytes = h => { h = String(h).replace(/^0x/, ''); if (h.length % 2) h = '0' + h; const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
  const bytesToHex = b => '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const concat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const utf8 = s => new TextEncoder().encode(s);
  const bnToBytes = (n, len) => { n = BigInt(n); let h = n.toString(16); if (h.length % 2) h = '0' + h; let b = n === 0n ? new Uint8Array(0) : hexToBytes(h); if (len != null) { const o = new Uint8Array(len); o.set(b, len - b.length); b = o; } return b; };
  const bytesToBn = b => b.length ? BigInt('0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('')) : 0n;

  /* ---------- keccak-256 (Keccak-f[1600], 64-bit lanes as two 32-bit halves) ---------- */
  const RC = [1, 0, 32898, 0, 32906, 2147483648, 2147516416, 2147483648, 32907, 0, 2147483649, 0, 2147516545, 2147483648, 32777, 2147483648, 138, 0, 136, 0, 2147516425, 0,
    2147483658, 0, 2147516555, 0, 139, 2147483648, 32905, 2147483648, 32771, 2147483648, 32770, 2147483648, 128, 2147483648, 32778, 0, 2147483658, 2147483648, 2147516545,
    2147483648, 32896, 2147483648, 2147483649, 0, 2147516424, 2147483648];
  function f1600(s) {
    for (let n = 0; n < 48; n += 2) {
      const c0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40], c1 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41], c2 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42], c3 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43],
        c4 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44], c5 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45], c6 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46], c7 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47],
        c8 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48], c9 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];
      let h = c8 ^ ((c2 << 1) | (c3 >>> 31)), l = c9 ^ ((c3 << 1) | (c2 >>> 31));
      s[0] ^= h; s[1] ^= l; s[10] ^= h; s[11] ^= l; s[20] ^= h; s[21] ^= l; s[30] ^= h; s[31] ^= l; s[40] ^= h; s[41] ^= l;
      h = c0 ^ ((c4 << 1) | (c5 >>> 31)); l = c1 ^ ((c5 << 1) | (c4 >>> 31));
      s[2] ^= h; s[3] ^= l; s[12] ^= h; s[13] ^= l; s[22] ^= h; s[23] ^= l; s[32] ^= h; s[33] ^= l; s[42] ^= h; s[43] ^= l;
      h = c2 ^ ((c6 << 1) | (c7 >>> 31)); l = c3 ^ ((c7 << 1) | (c6 >>> 31));
      s[4] ^= h; s[5] ^= l; s[14] ^= h; s[15] ^= l; s[24] ^= h; s[25] ^= l; s[34] ^= h; s[35] ^= l; s[44] ^= h; s[45] ^= l;
      h = c4 ^ ((c8 << 1) | (c9 >>> 31)); l = c5 ^ ((c9 << 1) | (c8 >>> 31));
      s[6] ^= h; s[7] ^= l; s[16] ^= h; s[17] ^= l; s[26] ^= h; s[27] ^= l; s[36] ^= h; s[37] ^= l; s[46] ^= h; s[47] ^= l;
      h = c6 ^ ((c0 << 1) | (c1 >>> 31)); l = c7 ^ ((c1 << 1) | (c0 >>> 31));
      s[8] ^= h; s[9] ^= l; s[18] ^= h; s[19] ^= l; s[28] ^= h; s[29] ^= l; s[38] ^= h; s[39] ^= l; s[48] ^= h; s[49] ^= l;
      const b0 = s[0], b1 = s[1], b32 = (s[11] << 4) | (s[10] >>> 28), b33 = (s[10] << 4) | (s[11] >>> 28), b14 = (s[20] << 3) | (s[21] >>> 29), b15 = (s[21] << 3) | (s[20] >>> 29),
        b46 = (s[31] << 9) | (s[30] >>> 23), b47 = (s[30] << 9) | (s[31] >>> 23), b28 = (s[40] << 18) | (s[41] >>> 14), b29 = (s[41] << 18) | (s[40] >>> 14),
        b20 = (s[2] << 1) | (s[3] >>> 31), b21 = (s[3] << 1) | (s[2] >>> 31), b2 = (s[13] << 12) | (s[12] >>> 20), b3 = (s[12] << 12) | (s[13] >>> 20),
        b34 = (s[22] << 10) | (s[23] >>> 22), b35 = (s[23] << 10) | (s[22] >>> 22), b16 = (s[33] << 13) | (s[32] >>> 19), b17 = (s[32] << 13) | (s[33] >>> 19),
        b48 = (s[42] << 2) | (s[43] >>> 30), b49 = (s[43] << 2) | (s[42] >>> 30), b40 = (s[5] << 30) | (s[4] >>> 2), b41 = (s[4] << 30) | (s[5] >>> 2),
        b22 = (s[14] << 6) | (s[15] >>> 26), b23 = (s[15] << 6) | (s[14] >>> 26), b4 = (s[25] << 11) | (s[24] >>> 21), b5 = (s[24] << 11) | (s[25] >>> 21),
        b36 = (s[34] << 15) | (s[35] >>> 17), b37 = (s[35] << 15) | (s[34] >>> 17), b18 = (s[45] << 29) | (s[44] >>> 3), b19 = (s[44] << 29) | (s[45] >>> 3),
        b10 = (s[6] << 28) | (s[7] >>> 4), b11 = (s[7] << 28) | (s[6] >>> 4), b42 = (s[17] << 23) | (s[16] >>> 9), b43 = (s[16] << 23) | (s[17] >>> 9),
        b24 = (s[26] << 25) | (s[27] >>> 7), b25 = (s[27] << 25) | (s[26] >>> 7), b6 = (s[36] << 21) | (s[37] >>> 11), b7 = (s[37] << 21) | (s[36] >>> 11),
        b38 = (s[47] << 24) | (s[46] >>> 8), b39 = (s[46] << 24) | (s[47] >>> 8), b30 = (s[8] << 27) | (s[9] >>> 5), b31 = (s[9] << 27) | (s[8] >>> 5),
        b12 = (s[18] << 20) | (s[19] >>> 12), b13 = (s[19] << 20) | (s[18] >>> 12), b44 = (s[29] << 7) | (s[28] >>> 25), b45 = (s[28] << 7) | (s[29] >>> 25),
        b26 = (s[38] << 8) | (s[39] >>> 24), b27 = (s[39] << 8) | (s[38] >>> 24), b8 = (s[48] << 14) | (s[49] >>> 18), b9 = (s[49] << 14) | (s[48] >>> 18);
      s[0] = b0 ^ (~b2 & b4); s[1] = b1 ^ (~b3 & b5); s[10] = b10 ^ (~b12 & b14); s[11] = b11 ^ (~b13 & b15); s[20] = b20 ^ (~b22 & b24); s[21] = b21 ^ (~b23 & b25);
      s[30] = b30 ^ (~b32 & b34); s[31] = b31 ^ (~b33 & b35); s[40] = b40 ^ (~b42 & b44); s[41] = b41 ^ (~b43 & b45);
      s[2] = b2 ^ (~b4 & b6); s[3] = b3 ^ (~b5 & b7); s[12] = b12 ^ (~b14 & b16); s[13] = b13 ^ (~b15 & b17); s[22] = b22 ^ (~b24 & b26); s[23] = b23 ^ (~b25 & b27);
      s[32] = b32 ^ (~b34 & b36); s[33] = b33 ^ (~b35 & b37); s[42] = b42 ^ (~b44 & b46); s[43] = b43 ^ (~b45 & b47);
      s[4] = b4 ^ (~b6 & b8); s[5] = b5 ^ (~b7 & b9); s[14] = b14 ^ (~b16 & b18); s[15] = b15 ^ (~b17 & b19); s[24] = b24 ^ (~b26 & b28); s[25] = b25 ^ (~b27 & b29);
      s[34] = b34 ^ (~b36 & b38); s[35] = b35 ^ (~b37 & b39); s[44] = b44 ^ (~b46 & b48); s[45] = b45 ^ (~b47 & b49);
      s[6] = b6 ^ (~b8 & b0); s[7] = b7 ^ (~b9 & b1); s[16] = b16 ^ (~b18 & b10); s[17] = b17 ^ (~b19 & b11); s[26] = b26 ^ (~b28 & b20); s[27] = b27 ^ (~b29 & b21);
      s[36] = b36 ^ (~b38 & b30); s[37] = b37 ^ (~b39 & b31); s[46] = b46 ^ (~b48 & b40); s[47] = b47 ^ (~b49 & b41);
      s[8] = b8 ^ (~b0 & b2); s[9] = b9 ^ (~b1 & b3); s[18] = b18 ^ (~b10 & b12); s[19] = b19 ^ (~b11 & b13); s[28] = b28 ^ (~b20 & b22); s[29] = b29 ^ (~b21 & b23);
      s[38] = b38 ^ (~b30 & b32); s[39] = b39 ^ (~b31 & b33); s[48] = b48 ^ (~b40 & b42); s[49] = b49 ^ (~b41 & b43);
      s[0] ^= RC[n]; s[1] ^= RC[n + 1];
    }
  }
  function keccak256(data) {
    if (typeof data === 'string') data = data.startsWith('0x') ? hexToBytes(data) : utf8(data);
    const rate = 136, s = new Int32Array(50), q = Math.floor(data.length / rate) * rate;
    const absorb = (blk, off) => { for (let i = 0; i < rate / 4; i++) { const j = off + i * 4; s[i] ^= blk[j] | (blk[j + 1] << 8) | (blk[j + 2] << 16) | (blk[j + 3] << 24); } f1600(s); };
    for (let off = 0; off < q; off += rate) absorb(data, off);
    const last = new Uint8Array(rate); last.set(data.subarray(q)); last[data.length - q] ^= 0x01; last[rate - 1] ^= 0x80; absorb(last, 0);
    const out = new Uint8Array(32); for (let i = 0; i < 8; i++) { const w = s[i]; out[i * 4] = w & 255; out[i * 4 + 1] = (w >>> 8) & 255; out[i * 4 + 2] = (w >>> 16) & 255; out[i * 4 + 3] = (w >>> 24) & 255; }
    return out;
  }

  /* ---------- secp256k1 ---------- */
  const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
  const inv = (a, m = P) => { let [x, y, u, v] = [mod(a, m), m, 1n, 0n]; while (x !== 0n) { const q = y / x; [x, y] = [y - q * x, x]; [u, v] = [v - q * u, u]; } return mod(v, m); };
  /* Jacobian points [X, Y, Z]; the point at infinity has Z = 0 */
  function jDouble([X, Y, Z]) {
    if (Y === 0n || Z === 0n) return [0n, 1n, 0n];
    const A = mod(X * X), B = mod(Y * Y), C = mod(B * B), D = mod(2n * (mod((X + B) * (X + B)) - A - C)), E = mod(3n * A), F = mod(E * E);
    const X3 = mod(F - 2n * D), Y3 = mod(E * (D - X3) - 8n * C), Z3 = mod(2n * Y * Z); return [X3, Y3, Z3];
  }
  function jAdd(p, q) {
    if (p[2] === 0n) return q; if (q[2] === 0n) return p;
    const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q, Z1Z1 = mod(Z1 * Z1), Z2Z2 = mod(Z2 * Z2), U1 = mod(X1 * Z2Z2), U2 = mod(X2 * Z1Z1), S1 = mod(Y1 * Z2 * Z2Z2), S2 = mod(Y2 * Z1 * Z1Z1);
    if (U1 === U2) return S1 === S2 ? jDouble(p) : [0n, 1n, 0n];
    const H = mod(U2 - U1), I = mod(4n * H * H), J = mod(H * I), r = mod(2n * (S2 - S1)), V = mod(U1 * I);
    const X3 = mod(r * r - J - 2n * V), Y3 = mod(r * (V - X3) - 2n * S1 * J), Z3 = mod(((Z1 + Z2) * (Z1 + Z2) - Z1Z1 - Z2Z2) * H); return [X3, Y3, Z3];
  }
  const toAffine = ([X, Y, Z]) => { if (Z === 0n) return null; const zi = inv(Z), zi2 = mod(zi * zi); return [mod(X * zi2), mod(Y * zi2 * zi)]; };
  function mulG(k) { let R = [0n, 1n, 0n], Q = [GX, GY, 1n]; while (k > 0n) { if (k & 1n) R = jAdd(R, Q); Q = jDouble(Q); k >>= 1n; } return toAffine(R); }
  const privOk = d => d > 0n && d < N;
  function pubOf(priv) { const d = typeof priv === 'bigint' ? priv : bytesToBn(priv instanceof Uint8Array ? priv : hexToBytes(priv)); if (!privOk(d)) throw new Error('bad private key'); return mulG(d); }
  function addressOf(priv) { const [x, y] = pubOf(priv); return checksum(bytesToHex(keccak256(concat(bnToBytes(x, 32), bnToBytes(y, 32))).subarray(12))); }
  function checksum(a) { const h = String(a).toLowerCase().replace(/^0x/, ''), k = bytesToHex(keccak256(utf8(h))).slice(2); let o = '0x'; for (let i = 0; i < 40; i++) o += parseInt(k[i], 16) >= 8 ? h[i].toUpperCase() : h[i]; return o; }
  /* RFC 6979 deterministic k (HMAC-SHA256 through WebCrypto, so async) */
  async function hmac(key, ...msg) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, concat(...msg))); }
  async function sign(hash32, priv) {
    const d = bytesToBn(priv), x = bnToBytes(d, 32), h1 = bnToBytes(mod(bytesToBn(hash32), N), 32), e = bytesToBn(hash32);
    let V = new Uint8Array(32).fill(1), K = new Uint8Array(32);
    K = await hmac(K, V, Uint8Array.of(0), x, h1); V = await hmac(K, V); K = await hmac(K, V, Uint8Array.of(1), x, h1); V = await hmac(K, V);
    for (;;) {
      V = await hmac(K, V); const k = bytesToBn(V);
      if (k > 0n && k < N) {
        const R = mulG(k), r = mod(R[0], N);
        if (r !== 0n) { let s = mod(inv(k, N) * (e + r * d), N); let rec = (R[1] & 1n ? 1 : 0) | (R[0] >= N ? 2 : 0);
          if (s > N / 2n) { s = N - s; rec ^= 1; }   /* low-s (EIP-2) */
          if (s !== 0n) return { r, s, v: rec }; }
      }
      K = await hmac(K, V, Uint8Array.of(0)); V = await hmac(K, V);
    }
  }

  /* ---------- RLP ---------- */
  function rlp(x) {
    if (Array.isArray(x)) { const body = concat(...x.map(rlp)); return concat(rlpLen(body.length, 0xc0), body); }
    let b = x instanceof Uint8Array ? x : typeof x === 'bigint' || typeof x === 'number' ? bnToBytes(x) : hexToBytes(x);
    if (b.length === 1 && b[0] < 0x80) return b;
    return concat(rlpLen(b.length, 0x80), b);
  }
  function rlpLen(n, off) { if (n < 56) return Uint8Array.of(off + n); const l = bnToBytes(n); return concat(Uint8Array.of(off + 55 + l.length), l); }

  /* ---------- legacy transaction, EIP-155 (BSC: chain 56) ---------- */
  async function signTx(tx, priv) {
    const f = [BigInt(tx.nonce), BigInt(tx.gasPrice), BigInt(tx.gasLimit), tx.to ? hexToBytes(tx.to) : new Uint8Array(0), BigInt(tx.value || 0), tx.data ? hexToBytes(tx.data) : new Uint8Array(0)];
    const chainId = BigInt(tx.chainId || 56), h = keccak256(rlp([...f, chainId, 0n, 0n]));
    const sg = await sign(h, priv instanceof Uint8Array ? priv : hexToBytes(priv));
    const raw = rlp([...f, chainId * 2n + 35n + BigInt(sg.v & 1), sg.r, sg.s]);
    return { raw: bytesToHex(raw), hash: bytesToHex(keccak256(raw)) };
  }

  /* ---------- ABI ---------- */
  function splitTypes(s) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; } if (cur) out.push(cur); return out; }
  const isDyn = t => t === 'bytes' || t === 'string' || /\[\]$/.test(t) || (t.startsWith('(') && splitTypes(t.slice(1, -1)).some(isDyn));
  const word = v => bnToBytes(BigInt.asUintN(256, BigInt(v)), 32);
  function encOne(t, v) {
    if (/\[\]$/.test(t)) { const it = t.slice(0, -2); return concat(word(v.length), encTuple(v.map(() => it), v)); }
    if (t.startsWith('(')) return encTuple(splitTypes(t.slice(1, -1)), v);
    if (t === 'address') return word(BigInt(v));
    if (t === 'bool') return word(v ? 1 : 0);
    if (t === 'bytes' || t === 'string') { const b = t === 'string' ? utf8(v) : (v instanceof Uint8Array ? v : hexToBytes(v || '0x')); const pad = new Uint8Array(Math.ceil(b.length / 32) * 32); pad.set(b); return concat(word(b.length), pad); }
    if (/^bytes\d+$/.test(t)) { const b = v instanceof Uint8Array ? v : hexToBytes(v); const o = new Uint8Array(32); o.set(b); return o; }
    if (/^u?int\d*$/.test(t)) return word(v);
    throw new Error('abi type ' + t);
  }
  function encTuple(types, vals) {
    const heads = [], tails = []; let tailLen = 0; const headLen = types.length * 32;
    types.forEach((t, i) => { const e = encOne(t, vals[i]); if (isDyn(t)) { heads.push(word(headLen + tailLen)); tails.push(e); tailLen += e.length; } else heads.push(e); });
    return concat(...heads, ...tails);
  }
  const selector = sig => keccak256(utf8(sig)).subarray(0, 4);
  function call(sig, vals) { const m = sig.match(/^[^(]+\((.*)\)$/); return bytesToHex(concat(selector(sig), encTuple(splitTypes(m[1]), vals || []))); }
  /* decoding the few result shapes we read: static words, address, bool, uint256[] */
  function decode(types, hex) {
    const b = hexToBytes(hex), w = i => b.subarray(i, i + 32), out = []; let i = 0;
    for (const t of types) {
      if (t === 'uint256[]' || t === 'address[]') { const off = Number(bytesToBn(w(i))), n = Number(bytesToBn(w(off))); const a = []; for (let k = 0; k < n; k++) { const x = bytesToBn(w(off + 32 + k * 32)); a.push(t === 'address[]' ? '0x' + x.toString(16).padStart(40, '0') : x); } out.push(a); }
      else if (t === 'address') out.push('0x' + bytesToBn(w(i)).toString(16).padStart(40, '0'));
      else if (t === 'bool') out.push(bytesToBn(w(i)) !== 0n);
      else out.push(bytesToBn(w(i)));
      i += 32;
    }
    return out;
  }

  return { hexToBytes, bytesToHex, concat, bnToBytes, bytesToBn, keccak256, pubOf, addressOf, checksum, sign, rlp, signTx, call, decode, selector, N };
})();
if (typeof module !== 'undefined') module.exports = EVM;
