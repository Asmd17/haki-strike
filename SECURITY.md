# Security

HAKI Strike trades from your own wallets. This page explains where your keys live, what leaves your computer, and how to check it yourself in the code.

## Your keys never leave your browser

- **No HAKI server in your trades.** There is no HAKI account and no login. Trades go from your browser straight to the network; no HAKI server could store or see a key. The only HAKI server is a small stats service (see "Anonymous stats" below), and it never receives anything about your wallets.
- **Sealed with your password.** When you add a wallet, its private key is encrypted with AES-256-GCM. The encryption key comes from your password through PBKDF2-SHA256 with 600,000 rounds and a random salt for each wallet. Only this sealed copy is stored, in `chrome.storage.local` (see `core.js`: `seal` and `unseal`).
- **Unlocked keys stay inside the extension.** After you unlock, the keys are kept in `chrome.storage.session`, which is set to trusted extension pages only (`bg.js`: `setAccessLevel('TRUSTED_CONTEXTS')`). Websites and the panel's page script cannot read it. It is cleared when Chrome closes or when you press Lock.
- **"Stay unlocked on this PC"** keeps an encrypted copy so you do not type the password after a restart. That copy is protected by a key tied to this browser profile, not by your password, so anyone who uses your Windows account can trade. Leave it off on shared computers.
- **Signing happens on your PC.** Solana transactions are signed with Ed25519 through the browser's WebCrypto. BSC transactions use secp256k1 with deterministic nonces (RFC 6979). Only the signed transaction is sent to the network, never the key.

## What a website can and cannot do

The panel runs on axiom.trade, gmgn.ai and trade.padre.gg. These sites are treated as untrusted:

- Adding, removing or unlocking wallets, and moving SOL between them, only works from the extension's own settings page. Requests from a website page are refused (`bg.js`: the `fromPopup` check).
- Websites cannot message the extension. There is no `externally_connectable`.
- Trade buttons react only to real clicks and key presses (`isTrusted`). A script on the page cannot press them.
- Every buy is capped by **Max per trade**, which you set separately for SOL and for BNB.
- Consolidate, Split and fee claims only send to your own unlocked wallets.

## What every transaction may contain

- **pump.fun and PumpSwap trades** are built by the extension itself. Fee and creator accounts are read from the chain and enforced by the programs.
- **Jupiter routes** are checked before signing. Only these steps are allowed: compute budget, creating your own token accounts, the Jupiter v6 swap, wrapping and unwrapping your own wSOL, and a tip to a known Helius Sender or Jito tip account. Anything else is refused and nothing is signed, including a transfer to another address, an approval or a change of owner (`core.js`: `vetRoute`).
- **Slippage:** an automatic retry after a price move never goes above 50% slippage. On BSC, "auto" gas is capped at 10 gwei.

## Where the extension connects

- **Solana:** solana-rpc.publicnode.com, or your own RPC if you set one.
- **Sending:** Helius Sender (sender.helius-rpc.com and its regional servers) and the Jito block engine.
- **Routes and prices:** Jupiter (lite-api.jup.ag / api.jup.ag), DexScreener, GeckoTerminal.
- **BSC:** public BSC nodes, plus private relays (48 Club, BlockRazor, bloXroute, PancakeSwap, Merkle, Jetbldr) so trades skip the public mempool.
- **Coin pictures:** IPFS gateways and pump.fun.

None of these ever receive a private key.

## Anonymous stats and reports

So we can count users and fix bugs, the extension talks to one HAKI service (`haki-strike-api.strike-api.workers.dev`, a Cloudflare Worker; its full source is in `server/`). It receives only:

- a random install ID made by the extension (not linked to you, your wallets or your browser account);
- the version, the site (Axiom, GMGN or Terminal) and the chain (SOL or BNB);
- error texts, with every address, signature and number removed before they leave your PC (`bg.js`: `scrubT`);
- reports you choose to send from Settings → Report a problem. These include your text, your settings (presets, hotkey mode, number of wallets) and the last error texts.

It never receives a wallet address, key, balance, amount or trade. You can turn the automatic part off: Settings → Report a problem → Anonymous stats. Trading does not depend on this service; if it is down, nothing waits for it.

## Check the installed version yourself

1. Open `chrome://extensions`, turn on Developer mode, and find HAKI Strike's ID.
2. Its files are in your Chrome profile folder under `Extensions/<ID>/<version>/`.
3. Compare them with this repository at the matching version tag. Extension code is plain JavaScript and is not obfuscated.

## Reporting a problem

Please report security issues privately via GitHub's "Report a vulnerability" button (Security tab of this repository), not in a public issue.
