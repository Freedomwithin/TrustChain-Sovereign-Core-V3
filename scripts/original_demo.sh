#!/bin/bash
# test for vercel
# TrustChain Sovereign: Institutional Demo Sequence
cd "$(dirname "$0")"

# --- 1. SET THE BASE DIRECTORY (Institutional Grounding) ---
# This ensures we always know where the backend root is
BACKEND_DIR=$(cd ".." && pwd)
SCRIPTS_DIR=$(pwd)

# --- 2. SET THE PATHS ---
export PATH="/home/freedomwithin/.local/share/solana/install/active_release/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v25.6.0 > /dev/null

alert_user() {
    paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || echo -e "\a"
}

# --- 3. START BUFFER ---
echo "🎥 Starting Demo in 10 seconds..."
alert_user
sleep 10

# --- 4. THE "WAKE UP" ---
echo "🛰️  Step 1: Pinging Ledger (Initial Airdrop)..."
solana airdrop 1.5 JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg --url devnet > /dev/null 2>&1
alert_user
sleep 10

# --- 5. THE HYDRATION ---
echo "🛡️  Step 2: Simulating Behavioral Cluster (Whale vs. Dust)..."
# Run from the scripts directory
node "$SCRIPTS_DIR/hydrate.js"
alert_user 
sleep 10 

# --- 6. FINAL NOTARY STEP ---
echo "🏛️  Step 3: Notarizing Integrity Scores to PDA..."
# We run from the root, but target the backend workspace explicitly.
# Yarn 4 will ensure the backend's local environment is loaded.
yarn workspace trustchain-backend tsx services/notary_sync.ts

alert_user # Final ding: Verified state ready.

echo "----------------------------------------------------"
echo "✨ Demo Sequence Complete. Results Locked on Devnet."
echo "----------------------------------------------------"

exec $SHELL