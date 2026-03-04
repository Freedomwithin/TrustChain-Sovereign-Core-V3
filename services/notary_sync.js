import * as path from "path";
import * as fs from "fs";
import dotenv from "dotenv";
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";
import * as anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet } = anchor;
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Resolve Environment
const envPaths = [
    path.resolve(__dirname, "../.env.local"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env")
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`📡 [SENTINEL] Environment Loaded: ${path.basename(envPath)}`);
        break;
    }
}

// 2. Alignment: Import the Forge-Generated IDL
// Ensure this path matches where you saved the trustchain_notary.json
const IDL = require('../idl/trustchain_notary.json');

// 3. Logic Imports
import { calculateGini, calculateHHI } from './integrityEngine.js';
import { fetchWithRetry } from '../utils/rpc.js';

// 4. Resolve Notary Identity (The Signer/Authority)
const secretString = process.env.NOTARY_SECRET || "";
let NOTARY_KEYPAIR;
try {
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
} catch (e) {
    console.error("❌ ERROR: Could not parse NOTARY_SECRET. Check your .env.");
    process.exit(1);
}

// 5. Connection & Aligned IDs
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

// Use the New Sovereign Program ID
const PROGRAM_ID = new PublicKey(
    process.env.SOLANA_PROGRAM_ID || "CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT"
);

// Targeted Wallet for Integrity Analysis
const TARGET_WALLET = new PublicKey(
    process.env.TARGET_WALLET_ADDRESS || "JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg"
);

const fetchWalletData = async (address) => {
    const pubKey = new PublicKey(address);
    const signatures = await fetchWithRetry(() => connection.getSignaturesForAddress(pubKey, { limit: 15 }));
    const transactions = [];
    const positions = [];

    console.log(`🔍 Sentinel scanning ${signatures.length} txs for ${address}...`);

    for (const sigInfo of signatures) {
        try {
            await new Promise(r => setTimeout(r, 200));
            const tx = await fetchWithRetry(() => connection.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 }));
            if (!tx || !tx.meta) continue;

            const accountIndex = tx.transaction.message.accountKeys.findIndex(key => key.pubkey.toBase58() === address);
            if (accountIndex !== -1) {
                const amount = Math.abs((tx.meta.preBalances[accountIndex] || 0) - (tx.meta.postBalances[accountIndex] || 0));
                transactions.push({ amount });
                positions.push({ value: amount });
            }
        } catch (err) { continue; }
    }
    return { transactions, positions };
};

/**
 * Main Execution: Notarize Behavioral Integrity On-Chain
 */
async function syncNotary() {
    try {
        console.log(`🏛️ Notary: ${NOTARY_KEYPAIR.publicKey.toBase58()}`);
        console.log(`🎯 Target: ${TARGET_WALLET.toBase58()}`);

        const rawData = await fetchWalletData(TARGET_WALLET.toBase58());
        const gini = calculateGini(rawData.transactions);
        const hhi = calculateHHI(rawData.positions);

        const giniScore = Math.min(Math.floor(gini * 10000), 65535);
        const hhiScore = Math.min(Math.floor(hhi * 10000), 65535);
        const status = gini > 0.9 ? 2 : (gini < 0.3 ? 0 : 1);

        console.log(`📊 Integrity -> Gini: ${gini.toFixed(4)}, HHI: ${hhi.toFixed(4)}`);

        const wallet = new Wallet(NOTARY_KEYPAIR);
        const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
        const program = new Program(IDL, PROGRAM_ID, provider);

        // PDA ALIGNMENT: Seed must be "notary" per lib.rs
        const [userIntegrityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("notary"), TARGET_WALLET.toBuffer()],
            PROGRAM_ID
        );

        console.log(`🔐 PDA Derivation: ${userIntegrityPda.toBase58()}`);

        // INSTRUCTION ALIGNMENT: Account names match UpdateIntegrity struct
        const tx = await program.methods
            .updateIntegrity(giniScore, hhiScore, status)
            .accounts({
                notaryAccount: userIntegrityPda,
                notary: NOTARY_KEYPAIR.publicKey,
                targetUser: TARGET_WALLET,
                systemProgram: SystemProgram.programId,
            })
            .signers([NOTARY_KEYPAIR])
            .rpc();

        console.log(`✅ NOTARIZED: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (error) {
        console.error("❌ Notarization Failed:", error);
        process.exit(1);
    }
}

syncNotary();