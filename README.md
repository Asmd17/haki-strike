# HAKI Strike

A fast trading panel for memecoins on **Axiom**, **GMGN** and **Terminal** (Padre), on Solana and BSC. It is a Chrome extension: no HAKI account, no HAKI server, and no fee on your trades.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/mndiolingcbiehkfhododihmbggbedpm)

## Why the code is public

The extension holds your wallets, so you should be able to see what it does with them. This repository is the extension's full source, so anyone can review it.

- Your private keys are encrypted with your password and never leave your browser.
- Trades are signed on your own PC. Only the signed transaction goes to the network.
- No HAKI server sits between you and the chain. The only HAKI service is an anonymous stats counter, and it never gets wallet data. Its code is in `server/`.

See [SECURITY.md](SECURITY.md) for exactly how it works and where to check each point in the code.

## What it does

- **Instant buy and sell** from a panel that sits on the site. The trade is prepared while you hover, so the click only signs and sends.
- **0% HAKI fee.** You pay only the network fee and the tip you choose. The tip goes to the block, not to us.
- **Many wallets:** trade with several wallets at once, plus Consolidate and Split.
- **Auto sell:** Safe 2x, take profit, stop loss and trailing stop.
- **Paper trading:** practise with play money at live prices, on the same panel. Nothing is signed or sent.
- **Sell by % or by SOL amount.**
- **Your own hotkeys:** a key alone, or with Space, Ctrl, Alt or Shift.
- **Quick buy** right from the lists on Axiom, GMGN and Terminal.
- **PnL cards** to share.
- **pump.fun cashback, creator fees** and empty token accounts, claimed back in one click.

## Code map

- `manifest.json`: permissions and the sites the panel runs on.
- `bg.js`: the background worker. Wallets (sealed or unlocked), trade requests, transfers between your own wallets, settings.
- `core.js`: the Solana engine. Transaction layout, signing, pump.fun and PumpSwap, Jupiter routes, sending.
- `bsc.js`, `evm.js`: BSC routes (four.meme, Flap, PancakeSwap), plus keccak, secp256k1 and RLP.
- `content.js`, `early.js`: the panel on the page, quick buy and hotkeys.
- `popup.html`, `popup.js`: the settings window.
- `share/`: the PnL card.
- `server/`: the anonymous stats and reports service (Cloudflare Worker).

## License

Source-available, **not open source**. You may read and review the code and use the official extension. You may not copy it, modify it, or ship anything built from it. See [LICENSE](LICENSE).
