#!/bin/bash
# TrustChain Sovereign: Institutional Demo Sequence (Judge Edition)
cd "$(dirname "$0")"

# Load local environment if it exists
if [ -f ../.env ]; then
    export $(grep -v '^#' ../.env | xargs)
fi

# Use the wallet from .env or fallback to the Demo wallet
DEMO_WALLET=${TARGET_WALLET_ADDRESS:-"GAZDwoHW6x4QCaWXizhckqta6v7nFYEFg2aULTk52k7b"}
# Point to local backend by default for "Clone & Run" auditors
BACKEND_URL=${VITE_API_BASE_URL:-"http://localhost:3001"}

echo "🎥 Starting TrustChain Demo for Wallet: $DEMO_WALLET"
sleep 3

# --- 1. AIRDROP ---
echo "🛰️  Step 1: Pinging Ledger (Initial Airdrop)..."
solana airdrop 1 $DEMO_WALLET --url devnet > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Airdrop successful"
else
    echo "⚠️  Airdrop skipped (Rate limited or already funded)"
fi

# --- 2. HYDRATION ---
echo "🛡️  Step 2: Simulating Behavioral Cluster..."
# Ensure node path is relative to the script directory
node "./hydrate.cjs" "$DEMO_WALLET"
sleep 5

# --- 3. NOTARIZATION ---
echo "🏛️  Step 3: Notarizing Integrity Scores via Sentinel..."
# Shifted to dynamic BACKEND_URL
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/verify" \
    -H "Content-Type: application/json" \
    -d "{\"address\": \"$DEMO_WALLET\"}")

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

echo "----------------------------------------------------"
echo "✨ Demo Sequence Complete."
echo "   Target Wallet: $DEMO_WALLET"
echo "   Backend Target: $BACKEND_URL"
echo "----------------------------------------------------"