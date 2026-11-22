# Next step: QIE Testnet test

**Status:** 4ORGE is deployed on Railway with Supabase sign-in, and its server can reach QIE Testnet. Everything is ready for the first real deployment.

**The only thing missing is test QIE in your wallet.** Claim it from the faucet, then follow this checklist on your hosted site.

---

## 0. Claim test QIE
1. Open **https://www.qie.digital/faucet** and request test QIE for your wallet address. Copy the address from MetaMask or Rabby, or from 4ORGE's wallet menu.
2. If the faucet says it is unavailable, try again later, or ask in QIE's hackathon or community channels (linked from hackathon.qie.digital). A teammate who already has test QIE can also send you some.
3. A small amount is enough: deploying the Counter contract costs a tiny fraction of 1 QIE.

## 1. Check the network
- Open **Network** in the sidebar → **Check** on QIE Testnet.
- ✅ Expected: "Chain ID 1983 verified · block …" and at least one ✓ in the endpoint list.

## 2. Prepare your wallet
- Click **Connect wallet** (top right) and pick MetaMask or Rabby.
- On the **Network** page, click **Add / switch wallet to QIE Testnet** and approve in your wallet.
- ✅ Expected: your wallet shows your test QIE balance on QIE Testnet.

## 3. Create, compile and test
- **Projects → New project → Counter (starter) → Create project.**
- **Build** tab → **Compile**. ✅ "Compiled without errors or warnings".
- **Tests** tab → **Run tests**. ✅ The Solidity tests pass. The hosted server runs Solidity tests only; that's intentional.

## 4. Deploy
1. Click **Deploy** on the project.
2. Enter a starting number, e.g. `7`, and keep **QIE Testnet** selected.
3. Click **Create Runbook & start** and watch the steps run.
4. At **Review before signing**, check the contract, network (chain 1983), your address and the cost, then click **I have reviewed this — continue to wallet**.
5. Click **Sign & deploy with wallet** and **approve** in your wallet.
6. Wait for "Wait for confirmation" to turn green. This usually takes seconds to a minute.

✅ Expected: a green banner, **"Counter deployed and confirmed on QIE Testnet"**, with the contract address.

## 5. Check the result
- Click the **explorer link** next to the address. The contract should appear on testnet.qie.digital.
- Note what step 12, **"Verify source on explorer"**, says: *verified*, *unsupported* or *failed*, plus the message.
- Open **Deployments**. The deployment is listed as **Confirmed**.
- Download the **report** at the bottom of the execution page.

## 6. Send these to Claude
- A screenshot of the finished execution page, including step 12.
- The contract address, or the explorer page.
- Any error message, word for word.

Claude will then record the real Testnet deployment in the README, fix anything that came up, and update the screenshots for your hackathon submission.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "does not have enough QIE to pay for gas" | The faucet tokens haven't arrived yet, or the wallet is on another account. Check the balance in your wallet. |
| "Your wallet is on a different network" | Click **Switch wallet to QIE Testnet**. |
| "You rejected the request in your wallet" | Nothing was sent. Click **Retry** on the wallet step. |
| Check network fails | Open **Network** → **Check** and send Claude the per-endpoint list (✓/✗ with reasons). |
| Deployment reverts with "invalid opcode" | Project → **Settings** → **EVM version** = `paris` → Save, then start the deployment again. |
| "Not confirmed within 300 s" | The transaction may still be mined. Click **Retry** on that step; it keeps waiting and never sends a second transaction. |
| Verification says *unsupported* | That's fine: QIE's explorer doesn't offer automatic verification. Just tell Claude. |

## Optional, any time
- **GitHub sign-in:** enable the GitHub provider in Supabase (see the deployment guide), then try **Continue with GitHub**.
- **Private repository import:** needs its own GitHub OAuth app (see the deployment guide).
