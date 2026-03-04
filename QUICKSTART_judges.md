# TrustChain-Sovereign: Quick-Start Demo Guide

**For Fairathon / Grant Judges — Estimated Time: ~5 minutes**

**Live Frontend:** [trustchain-sovereign-frontend.vercel.app](https://trustchain-sovereign-frontend.vercel.app)  
**Live Backend:** [trustchain-sovereign-backend.vercel.app](https://trustchain-sovereign-backend.vercel.app)  
**Demo Video:** [Watch on Vimeo](https://vimeo.com/1167869054)

---

### Step 1 — Initialize Environment
Ensure your local Solana environment is set to Devnet. While the demo natively tracks the GAZD...2k7b identity to show established high-integrity scores, you may use any Devnet wallet. The Notary Bridge and behavioral scoring will operate against whatever transaction history is available for the connected wallet.

**Note on Installation:** To resolve Sovereign-specific polyfill dependencies, please install using:
npm install --legacy-peer-deps

### Step 2 — Behavioral Hydration

Run the demo script to simulate a high-integrity transaction cluster (Whale vs. Dust behavioral patterns):

```bash
bash scripts/demo_v2.sh
```

This script populates the scoring engine with contrasting behavioral profiles so the Gini/HHI engine and Temporal Sentinel can be observed firing in real time.

### Step 3 — Verify Notarization

Observe the terminal output. You should see confirmation that the integrity score has been notarized to the `JCq7...` Notary Bridge on-chain:

```
✅ Notarized <wallet_address>: <transaction_signature>
```

This confirms a cryptographically verifiable link between the wallet's behavioral history and its governance standing has been written to the Solana ledger.

### Step 4 — Governance Impact

Visit the **[Live Frontend](https://trustchain-sovereign-frontend.vercel.app)**, connect your wallet, and click **"Simulate Vote."** The system will fetch your `voterWeightMultiplier` from the Anchor Notary PDA and apply it to your token balance in real time — for example, a Steward-tier wallet will display a `1.5x` effective voting power multiplier.

---

**What You're Seeing**  
TrustChain is not a dashboard — it is an active governance layer. The reputation score earned through on-chain behavioral integrity directly weights your voting power in Solana DAO protocols. This is the Sybil Gap closed.

---

*Built by Jonathon | Freedomwithin — [X / Twitter @TrustChainDev](https://x.com/TrustChainDev/)*
