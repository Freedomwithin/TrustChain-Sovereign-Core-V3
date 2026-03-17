# TrustChain Sovereign Backend (v3.1.0-HARDENED) 🛡️💎

The high-performance, gRPC-powered verification engine for the TrustChain ecosystem. Optimized for Vercel Serverless and bot-swarm resilience.

## 🚀 Key Features
- **V3.1 Hardened Architecture:** Engineered for Vercel Edge performance.
- **Vercel Edge Caching:** Leverages `Cache-Control: s-maxage=15` for global deduplication and ultra-low latency.
- **Request Coalescing:** Eliminates redundant upstream calls during high-concurrency "bot swarms."
- **Yellowstone gRPC Integration:** Real-time data acquisition for Gini/HHI behavioral analysis.
- **TS-Native IDL:** On-chain program interaction logic embedded in the source for runtime stability.
- **Vercel-Native Routing:** Built using the `api/` directory pattern for zero-config serverless deployment.

## 🏗️ Deployment (Vercel-Native)
This backend is optimized for the **Vercel API Directory Pattern**.
- **Entry Point:** `api/index.ts` (Wraps `server.ts`).
- **Build Settings:** Manual "Build Command" and "Output Directory" should be **disabled** in the Vercel Dashboard.
- **Routing:** Handled via `vercel.json` rewrites to the `/api` directory.

## 🧬 Agentic Swarm Integration
- **Tier 1 (Architect):** Strategic orchestration.
- **Execution (Jules):** Handling project-wide testing and Git-linked tasks.
- **Hardening:** Current build verified for $n/(n-1)$ Gini math and Pool ID bypasses.

---
*Architect's Note: Our Sentinel is now live, hardened, and ready for the CyreneAI showcase.* 💋💖
