#!/bin/bash
# TrustChain Sovereign: Institutional Demo Sequence (V2 - Split Repo)
cd "$(dirname "$0")"

BACKEND_DIR=$(cd ".." && pwd)
SCRIPTS_DIR=$(pwd)

export PATH="/home/freedomwithin/.local/share/solana/install/active_release/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v25.6.0 > /dev/null

alert_user() {
    paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || echo -e "\a"
}

DEMO_WALLET="GAZDwoHW6x4QCaWXizhckqta6v7nFYEFg2aULTk52k7b"
BACKEND_URL="https://trustchain-sovereign-backend.vercel.app"

# --- 1. START BUFFER ---
echo "🎥 Starting Demo in 10 seconds..."
alert_user
sleep 10

# --- 2. AIRDROP ---
echo "🛰️  Step 1: Pinging Ledger (Initial Airdrop)..."
solana airdrop 1.5 $DEMO_WALLET --url devnet > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Airdrop successful"
else
    echo "⚠️  Airdrop failed (faucet may be rate limited) - continuing..."
fi
alert_user
sleep 10

# --- 3. HYDRATION ---
echo "🛡️  Step 2: Simulating Behavioral Cluster (Whale vs. Dust)..."
# Pass the DEMO_WALLET as an argument to the script
node "$SCRIPTS_DIR/hydrate.cjs" "$DEMO_WALLET"
alert_user
sleep 10

# --- 4. NOTARIZATION (via live backend) ---
echo "🏛️  Step 3: Notarizing Integrity Scores via Sentinel..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/verify" \
    -H "Content-Type: application/json" \
    -d "{\"address\": \"$DEMO_WALLET\"}")

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null)
echo ""
echo "🔐 Notary Status: $STATUS"
alert_user

echo "----------------------------------------------------"
echo "✨ Demo Sequence Complete. Results Locked on Devnet."
echo "   Frontend: https://trustchain-sovereign-frontend.vercel.app"
echo "   Backend:  $BACKEND_URL"
echo "----------------------------------------------------"

exec $SHELL
