const { Connection, Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const path = require('path');
const fs = require('fs');

async function sendVaried() {
    // 1. Load .env and check keys
    const envPath = path.resolve(process.cwd(), '.env');
    const config = require('dotenv').config({ path: envPath });
    
    console.log("📂 System Check: Looking for .env at", envPath);
    console.log("🔑 Keys detected in .env:", Object.keys(process.env).filter(k => k.includes('NOTARY') || k.includes('SOLANA')));

    const secretString = process.env.NOTARY_SECRET;
    
    if (!secretString) {
        throw new Error(`❌ ERROR: NOTARY_SECRET is missing. Found keys: ${Object.keys(config.parsed || {}).join(', ')}`);
    }

    // 2. Setup Connection
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const target = new PublicKey("2XZ4miE9hkxq24oycRhBNgoSepRDEk8QdmnHo1QSz3q8");

    // Parse Notary Keypair
    const secretKey = Uint8Array.from(secretString.replace(/[\[\]\s]/g, '').split(',').map(Number));
    const mainWallet = Keypair.fromSecretKey(secretKey);

    // 3. Varied amounts for Gini Coefficient calculation
    const amounts = [0.07, 0.02, 0.12]; 
    console.log(`📡 Sending varied patterns from ${mainWallet.publicKey.toBase58()}...`);

    for (let i = 0; i < amounts.length; i++) {
        const { blockhash } = await connection.getLatestBlockhash();
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: mainWallet.publicKey,
                toPubkey: target,
                lamports: Math.floor(amounts[i] * LAMPORTS_PER_SOL),
            })
        );

        try {
            const signature = await connection.sendTransaction(transaction, [mainWallet]);
            await connection.confirmTransaction(signature);
            console.log(`[${i+1}/3] ✅ Sent ${amounts[i]} SOL: ${signature}`);
        } catch (err) {
            console.error(`❌ TX ${i+1} Failed:`, err.message);
        }
        
        await new Promise(r => setTimeout(r, 2000)); 
    }
    console.log("\n✨ Behavioral patterns established. Wait 60s for indexing.");
}

sendVaried().catch(console.error);