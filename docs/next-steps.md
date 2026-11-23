# Next step: first real QIE deployment

> **Faucet down? Use the Mainnet route below.** It's the same flow on QIE Mainnet, with real (small) QIE and extra safeguards.

# Route A — QIE Testnet

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

---

# Route B — QIE Mainnet (when no test QIE is available)

Mainnet deployments spend **real QIE**, and contracts are **permanent and public**. 4ORGE adds safeguards on Mainnet:
- every deployment must include a human review step;
- you must type **MAINNET** before the wallet prompt (the server enforces it);
- "real funds" warnings appear in the wizard and at the wallet step.

1. **Use a fresh wallet account with only a little QIE.** Create a new account in MetaMask or Rabby just for deployments, and send it a small amount of QIE (a few QIE is plenty for the Counter contract). Never use your main holdings wallet.
2. **Unlock Mainnet on Railway:** Variables → add `FORGE_ENABLE_MAINNET_DEPLOYMENTS=true` → **Deploy**. Mainnet stays locked unless this is set.
3. **Check the network:** **Network → Check** on QIE Mainnet. ✅ "Chain ID 1990 verified". If it fails, send Claude the per-endpoint list.
4. **Check your balance:** connect the deployment wallet, select **QIE Mainnet** in the top bar, and open the wallet menu. It shows your live QIE balance.
5. **Deploy:** on the Counter project, click **Deploy**, enter `7`, select **QIE Mainnet** → **Create Runbook & start**.
6. **Review:** check everything, type **MAINNET**, then click continue.
7. **Sign:** in your wallet, confirm the network is QIE Mainnet and the fee is small, then approve.
8. **Result:** ✅ "Counter deployed and confirmed on QIE Mainnet", with a link to mainnet.qie.digital. Send Claude the screenshot and contract address (section 6 above).
9. **Afterwards (optional):** remove `FORGE_ENABLE_MAINNET_DEPLOYMENTS` on Railway to lock Mainnet again until you need it.

## If something goes wrong

| What you see | What to do |
|---|---|
| "does not have enough QIE to pay for gas" | The wallet has no QIE on that network, or another account is active. Check the balance in the 4ORGE wallet menu. |
| "Deployments to QIE Mainnet are locked" | `FORGE_ENABLE_MAINNET_DEPLOYMENTS=true` is not set on Railway, or Railway hasn't redeployed yet. |
| "Type MAINNET to confirm" | The Mainnet safety check. Type the word exactly, in capitals. |
| "Your wallet is on a different network" | Click **Switch wallet to QIE Testnet**. |
| "You rejected the request in your wallet" | Nothing was sent. Click **Retry** on the wallet step. |
| Check network fails | Open **Network** → **Check** and send Claude the per-endpoint list (✓/✗ with reasons). |
| Deployment reverts with "invalid opcode" | Project → **Settings** → **EVM version** = `paris` → Save, then start the deployment again. |
| "Not confirmed within 300 s" | The transaction may still be mined. Click **Retry** on that step; it keeps waiting and never sends a second transaction. |
| Verification says *unsupported* | That's fine: QIE's explorer doesn't offer automatic verification. Just tell Claude. |

## Optional, any time
- **GitHub sign-in:** enable the GitHub provider in Supabase (see the deployment guide), then try **Continue with GitHub**.
- **Private repository import:** needs its own GitHub OAuth app (see the deployment guide).
