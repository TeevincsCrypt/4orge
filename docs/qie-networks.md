# QIE networks

| | QIE Testnet | QIE Mainnet |
|---|---|---|
| Chain ID | **1983** (`0x7bf`) | **1990** (`0x7c6`) |
| RPC | `https://rpc1testnet.qie.digital` | `https://rpc1mainnet.qie.digital` |
| Explorer | https://testnet.qie.digital | https://mainnet.qie.digital |
| Currency | QIE (18 decimals) | QIE (18 decimals) |
| Faucet | https://www.qie.digital/faucet | — |
| Deployments in 4ORGE | Enabled (default network) | **Locked** |

These values come from the 4ORGE specification and match public QIE listings: the hackathon announcement points to `testnet.qie.digital` and the faucet, and community/oracle documentation lists chain IDs 1983 and 1990. Some QIE documentation also mentions additional mainnet RPC hosts (for example `rpc5mainnet.qie.digital`). You can use any of them as a custom RPC.

## How 4ORGE validates networks

Configuration can drift, so 4ORGE never trusts the numbers above blindly:

- The **Network** page and the top-bar indicator call `eth_chainId` and `eth_blockNumber` on the configured RPC from the 4ORGE server and show the result and latency.
- Every Runbook's `network.check` step **fails** if the RPC reports a different chain ID. Custom RPC URLs must still report the right chain ID.
- The wallet step compares the wallet's `eth_chainId` with the target network and offers one-click switching (`wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain`). The transaction is also built with the target chain, so viem refuses to send if the wallet is on another network.
- The receipt check rejects transactions whose `chainId` differs from the target.

## Mainnet

Mainnet is shown for read-only checks, but **deployments are locked**. The server owner must set `FORGE_ENABLE_MAINNET_DEPLOYMENTS=true` deliberately to unlock them. Even then, every Mainnet deployment must:
- include a `human.confirm` step (the Runbook validator rejects it otherwise);
- be confirmed by typing **MAINNET**, which the server enforces;
- be signed in the operator's wallet.

4ORGE never broadcasts anything on its own. Mainnet RPC endpoints (`rpc1mainnet`, `rpc5mainnet`) must report chain ID 1990 before they are used.

## Explorer verification

The explorer is probed at runtime with `GET /api/v2/config/backend-version`. If it answers like **Blockscout**, 4ORGE submits the exact Standard JSON input it compiled (`/api/v2/smart-contracts/{address}/verification/via/standard-input`) and polls until the explorer reports `is_verified`. If the explorer exposes no compatible API, the deployment's verification status is **unsupported**. 4ORGE never reports a verification the explorer didn't confirm.

QIE Mainnet's explorer (mainnet.qie.digital) supports this API: the first Mainnet deployment made with 4ORGE, AtlasGovernor at `0x8b9e799f6bb4b9b120de4293f8482c6112fac366`, is verified there.

## Custom RPC

On the Network page, enter an `https://` URL (plain `http://` is allowed only for `localhost`). URLs containing credentials are rejected. Leave the field empty to return to the default.

## Local Hardhat network (development)

For rehearsals, `npm run chain` starts a local EVM (chain 31337, funded test accounts). Start 4ORGE with `FORGE_ENABLE_LOCAL_CHAIN=true` to show it. The test account keys printed by Hardhat are public. Never use them on a real network.
