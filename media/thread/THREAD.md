# 4ORGE launch thread

Eight posts. Attach `media/thread/out/post-N.png` to post N. Every post is under 280 characters (X counts each link as 23).

## Post 1/7

Image: `post-1.png`

```text
Shipping a smart contract shouldn't take 9 tools and a spreadsheet.

Meet 4ORGE: one workspace to create, compile, test, deploy and track Solidity contracts on QIE Blockchain.

Your wallet signs. 4ORGE checks everything else. 🧵👇
```

## Post 2/7

Image: `post-2.png`

```text
The usual way: a Solidity toolchain, compiler versions, npm installs, a test runner, RPC config, wallet setup, deploy scripts, explorer tabs, verification forms and a spreadsheet of addresses.

Every step manual. Every step easy to get wrong.

4ORGE puts it all in one place.
```

## Post 3/7

Image: `post-3.png`

```text
Bring any project:
→ start from a template
→ upload a Hardhat or Foundry folder
→ import a GitHub repo

4ORGE finds your contracts, compiler settings, tests and dependencies by reading config files. It never runs them: imported code is treated as untrusted.
```

## Post 4/7

Image: `post-4.png`

```text
Real compilation. Real tests.

• Official Solidity compiler builds, checksum-verified before use
• Libraries like OpenZeppelin fetched safely, no install scripts run
• Hardhat 3 test suites in an isolated sandbox, including Foundry-style forge-std tests
```

## Post 5/7

Image: `post-5.png`

```text
Deployments run as Runbooks: reusable workflows built only from approved steps.

Validate → check network → compile → test → check args → prepare tx → your review → wallet signs → receipt validated → recorded → verified → report

Retry any step. A sent tx is never sent twice.
```

## Post 6/7

Image: `post-6.png`

```text
Safety is the point.

• 4ORGE never sees your keys: your wallet signs every deployment
• Success is recorded only after the receipt is checked on-chain: sender, creation code, status, deployed bytecode
• QIE Mainnet is locked by default and needs a typed MAINNET confirmation
```

## Post 7/7

Image: `post-7.png`

```text
Built for QIE:
• QIE Testnet (1983) and Mainnet (1990), chain ID verified live
• RPC fallbacks and clear network diagnostics
• One-click network switching in MetaMask or Rabby
• Every deployment tracked with explorer links

Open source. Built for QIE Blockchain Hackathon 3.0.
```

## Post 8 (last post)

Image: `post-8.png`

```text
That's 4ORGE. 🔨

Try it → https://4orge-production.up.railway.app
Code → https://github.com/TeevincsCrypt/4orge

Tell us what you'd want it to do next 👇
```

---

# Update post: first QIE Mainnet deployment

Image: `mainnet-update.png` (render with `node media/thread/capture.js update.html mainnet-update`)

```text
4ORGE is live on QIE Mainnet ✅

Our first real contract, AtlasGovernor, went end to end through 4ORGE:
imported from GitHub → compiled → tested → reviewed → signed in our wallet → checked on-chain → source verified on QIE's explorer.

See it on-chain 👇
https://mainnet.qie.digital/address/0x8b9e799f6bb4b9b120de4293f8482c6112fac366?tab=contract
```
