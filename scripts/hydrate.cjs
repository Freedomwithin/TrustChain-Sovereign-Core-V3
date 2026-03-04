const { Connection, Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const path = require('path');

async function sendVaried() {
    // FIX: Load .env from the root folder (one level up from /scripts)
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
    
    const secretString = process.env.NOTARY_SECRET;
    // Provide a helpful error that refers back to the QUICKSTART guide
    if (!secretString || secretString === "[]") {
        throw new Error("❌ ERROR: NOTARY_SECRET is missing. Please add a Devnet Keypair array to your .env to hydrate behavioral data.");
    }

    // Use Helius Devnet RPC from .env or fallback to public
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    
    // Use Target from demo_v2.sh argument OR .env OR fallback
    const targetAddress = process.argv[2] || process.env.TARGET_WALLET_ADDRESS || "GAZDwoHW6x4QCaWXizhckqta6v7nFYEFg2aULTk52k7b";
    const target = new PublicKey(targetAddress);

    const secretKey = Uint8Array.from(secretString.replace(/[\[\]\s]/g, '').split(',').map(Number));
    const mainWallet = Keypair.fromSecretKey(secretKey);

    // 2. Varied amounts to trigger Gini Variance
    const amounts = [0.08, 0.03, 0.15]; 
    console.log(`📡 Sending behavioral patterns to ${targetAddress}...`);

    for (let i = 0; i < amounts.length; i++) {
        const { blockhash } = await connection.getLatestBlockhash();
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: mainWallet.publicKey,
                toPubkey: target,
                lamports: Math.floor(amounts[i] * LAMPORTS_PER_SOL),
            })
        );

        const signature = await connection.sendTransaction(transaction, [mainWallet]);
        await connection.confirmTransaction(signature);
        console.log(`[${i+1}/3] ✅ Pattern ${i+1} Set: ${amounts[i]} SOL`);
        
        await new Promise(r => setTimeout(r, 2000)); 
    }
    console.log("\n✨ Distribution established. The Gini Engine now has data variance.");
}

sendVaried().catch(console.error);
