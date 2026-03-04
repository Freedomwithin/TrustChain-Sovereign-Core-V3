#!/bin/bash
# TrustChain Sovereign: Institutional Demo Sequence (V2.3 - Weighted Distribution)
cd "$(dirname "$0")"

BACKEND_DIR=$(cd ".." && pwd)
SCRIPTS_DIR=$(pwd)

# Ensure NVM is available
export PATH="/home/freedomwithin/.local/share/solana/install/active_release/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v25.6.0 > /dev/null

alert_user() {
    paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || echo -e "\a"
}

# --- 1. ARGUMENT PARSING ---
if [ -z "$1" ]; then
    echo "❌ ERROR: You must provide a target wallet address as the first argument."
    echo "Usage: ./demo_v2.3.sh <WALLET_ADDRESS>"
    exit 1
fi
DEMO_WALLET="$1"

BACKEND_URL="https://trustchain-sovereign-backend.vercel.app"

# --- 2. START BUFFER ---
echo "🎥 Starting Demo v2.3 for Wallet: $DEMO_WALLET"
alert_user
sleep 3

# --- 3. HYDRATION (Weighted Distribution) ---
echo "🛡️  Step 1: Simulating Organic Funding (Weighted Distribution)..."
# Use weighted_distribution.cjs instead of hydrate.cjs
node "$SCRIPTS_DIR/weighted_distribution.cjs" "$DEMO_WALLET"
if [ $? -ne 0 ]; then
    echo "❌ Weighted distribution failed."
    exit 1
fi
alert_user
sleep 5

# --- 4. NOTARIZATION (via live backend) ---
echo "🏛️  Step 2: Notarizing Integrity Scores & Checking Steward Status..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/verify" \
    -H "Content-Type: application/json" \
    -d "{\"address\": \"$DEMO_WALLET\"}")

# Pretty print response
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

# Extract status and tier
STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('status','UNKNOWN'))" 2>/dev/null)
TIER=$(echo "$RESPONSE" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('governance',{}).get('tier','UNKNOWN'))" 2>/dev/null)
SCORE=$(echo "$RESPONSE" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('scores',{}).get('totalScore',0))" 2>/dev/null)

echo ""
echo "🔐 Notary Status: $STATUS"
echo "🌟 Governance Tier: $TIER"
echo "💯 Total Score: $SCORE"

if [ "$TIER" == "Steward" ]; then
    echo "✅ SUCCESS: Wallet verified as Steward."
else
    echo "⚠️  WARNING: Wallet achieved tier '$TIER', expected 'Steward'."
fi

alert_user

echo "----------------------------------------------------"
echo "✨ Demo Sequence Complete."
echo "----------------------------------------------------"

exec $SHELL
