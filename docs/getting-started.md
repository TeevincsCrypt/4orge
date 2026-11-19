# Getting started

This guide takes you from zero to a contract deployed on **QIE Testnet**. No programming experience is required to follow it.

## 1. Install and start 4ORGE

You need **Node.js 22.12 or newer** from [nodejs.org](https://nodejs.org). Open a terminal (Terminal on macOS, PowerShell on Windows) and run these one at a time:

```bash
git clone https://github.com/TeevincsCrypt/4orge.git
cd 4orge
npm install
npm run dev
```

Open **http://localhost:3000** in your browser. The sidebar shows **Local mode**: your data is stored in the `.forge-data` folder on this computer.

## 2. Prepare a wallet

1. Install [MetaMask](https://metamask.io) or [Rabby](https://rabby.io) in your browser and create a wallet. **Write down your recovery phrase on paper and never type it into any website, including 4ORGE.**
2. Click **Connect wallet** in the top bar of 4ORGE and pick your wallet.
3. Open the **Network** page and click **Add / switch wallet to QIE Testnet**. Your wallet asks for permission to add the network.
4. Get free test QIE from the [QIE faucet](https://www.qie.digital/faucet) for the address shown in the wallet menu.

## 3. Create a project

**Projects → New project.** Choose one of:

- **Template**: *Counter* is the simplest. *OpenZeppelin ERC-20* shows dependency handling.
- **GitHub**: paste `owner/repository` to import a public repository.
- **Upload folder**: select the root folder of an existing Hardhat or Foundry project.

4ORGE lists the detected contracts, compiler version, tests and dependencies on the project's **Overview** tab.

## 4. Compile and test

- **Build tab → Compile.** 4ORGE downloads the exact Solidity compiler version (verified by checksum), compiles, and shows errors, warnings and the resulting contracts.
- **Tests tab → Run tests.** Your Hardhat tests run in an isolated sandbox. Each test is listed with its result; failures show the error message.
- No tests yet? On the **Contracts** tab, click **Generate test** to create a starter Solidity test.

## 5. Deploy

Click **Deploy** (or **Start deployment** in the sidebar):

1. Choose the contract and fill in the constructor arguments. They are checked against the contract's ABI as you type.
2. Keep **QIE Testnet** selected.
3. Click **Create Runbook & start**.

The execution page shows each step live. 4ORGE checks the network's chain ID, compiles, runs tests, checks your arguments and estimates gas. Then it **pauses for your review**. Confirm, then click **Sign & deploy with wallet**. Your wallet shows the transaction. Approve it there.

4ORGE then waits for the real transaction receipt, checks it against the chain, records the deployment and tries to verify the source on the explorer. You get a contract address with an explorer link and a downloadable report.

## 6. Run it again

The deployment you just ran was saved as a **Runbook**. Open **Runbooks** to edit the steps, change arguments or the network, export it as YAML/JSON, and run it again with one click.

## Troubleshooting

| Message | What to do |
|---|---|
| *RPC unreachable* | Your internet connection, or the QIE RPC is down. Try a custom RPC on the Network page. |
| *RPC reports chain ID X, expected Y* | The RPC URL belongs to a different network. 4ORGE refuses to continue, for your safety. |
| *Your wallet is on a different network* | Click **Switch wallet to QIE Testnet**. |
| *does not have enough QIE to pay for gas* | Get test QIE from the faucet. |
| *You rejected the request in your wallet* | Nothing was sent. Click **Retry** on the wallet step. |
| *Tests did not pass. Deployment is blocked.* | Fix the failing tests (see the Tests tab), or mark the test step as optional in the Runbook editor. |
