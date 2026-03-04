import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// 1. Resolve ESM/CJS compatibility for JSON imports
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Fix 'dotenv' default export error for strict ESM
import * as dotenv from 'dotenv';
dotenv.config();

// 3. Import IDL using the bridged 'require'
// Ensure this path points to your actual JSON IDL file
const IDL = require('../idl/trustchain_notary.json');

import {
    ComputeBudgetProgram,
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";
import * as anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet } = anchor;

// @ts-ignore (Assuming these are in your services/ folder)
import { calculateGini, calculateHHI } from './integrityEngine.js';
// @ts-ignore (Assuming this is in your utils/ folder)
import { fetchWithRetry } from '../utils/rpc.js';
import { PRIORITY_FEE_CONFIG } from '../src/config/constants.js';

// 4. Resolve Environment (The Sentinel loading logic)
const envPaths = [
    path.resolve(__dirname, "../.env.local"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env")
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`📡 [SENTINEL] Environment Loaded: ${path.basename(envPath)}`);
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.warn("⚠️ WARNING: No .env found. Falling back to hardcoded defaults.");
}

// 5. Resolve Notary Identity (The Signer)
const secretString = process.env.NOTARY_SECRET || "";
let NOTARY_KEYPAIR: Keypair;
try {
    // Clean potential array formatting from .env
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
} catch (e) {
    console.error("❌ ERROR: Could not parse NOTARY_SECRET. Ensure your private key array is in .env");
    process.exit(1);
}

// 6. Connection & Global IDs
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

const PROGRAM_ID = new PublicKey(
    process.env.SOLANA_PROGRAM_ID || "CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT"
);

const TARGET_WALLET = new PublicKey(
    process.env.TARGET_WALLET_ADDRESS || "JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg"
);

const fetchWalletData = async (address: string) => {
    const pubKey = new PublicKey(address);
    // Fetch signatures to analyze behavior
    const signatures = await fetchWithRetry(() => connection.getSignaturesForAddress(pubKey, { limit: 15 }));
    const transactions: any[] = [];
    const positions: any[] = [];

    console.log(`🔍 Analyzing ${signatures.length} transactions for ${address}...`);

    for (const sigInfo of signatures) {
        try {
            await new Promise(r => setTimeout(r, 200)); // Rate limiting
            const tx = await fetchWithRetry(() => connection.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 }));
            if (!tx || !tx.meta) continue;

            const accountIndex = tx.transaction.message.accountKeys.findIndex((key: any) => key.pubkey.toBase58() === address);
            if (accountIndex !== -1) {
                const amount = Math.abs((tx.meta.preBalances[accountIndex] || 0) - (tx.meta.postBalances[accountIndex] || 0));
                transactions.push({ amount });
                positions.push({ value: amount });
            }
        } catch (err) { continue; }
    }
    return { transactions, positions };
};

async function syncNotary() {
    try {
        console.log(`🏛️ Notary Signer: ${NOTARY_KEYPAIR.publicKey.toBase58()}`);
        console.log(`🎯 Target Wallet: ${TARGET_WALLET.toBase58()}`);
        console.log(`🆔 Program ID: ${PROGRAM_ID.toBase58()}`);

        // 1. Run Integrity Engine Analysis
        const rawData = await fetchWalletData(TARGET_WALLET.toBase58());
        const gini = calculateGini(rawData.transactions);
        const hhi = calculateHHI(rawData.positions);

        // Convert to u16 format for on-chain storage
        const giniScore = Math.min(Math.floor(gini * 10000), 65535);
        const hhiScore = Math.min(Math.floor(hhi * 10000), 65535);

        // Status Logic: 0=Safe, 1=Suspicious, 2=High-Risk
        const status = gini > 0.9 ? 2 : (gini < 0.3 ? 0 : 1);

        console.log(`📊 Scores -> Gini: ${gini.toFixed(4)} (${giniScore}), HHI: ${hhi.toFixed(4)} (${hhiScore})`);

        // 2. Setup Anchor Program Connection
        const wallet = new Wallet(NOTARY_KEYPAIR);
        const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
        const program = new Program(IDL, PROGRAM_ID, provider);

        // 3. Derive the PDA (Program Derived Address)
        const [userIntegrityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("notary"), TARGET_WALLET.toBuffer()],
            PROGRAM_ID
        );

        console.log(`🔐 PDA Address: ${userIntegrityPda.toBase58()}`);

        // 4. Execute On-Chain Notarization
        const tx = await program.methods
            .updateIntegrity(giniScore, hhiScore, status)
            .accounts({
                notaryAccount: userIntegrityPda,
                notary: NOTARY_KEYPAIR.publicKey,
                targetUser: TARGET_WALLET,
                systemProgram: SystemProgram.programId,
            })
            .preInstructions([
                ComputeBudgetProgram.setComputeUnitPrice(PRIORITY_FEE_CONFIG)
            ])
            .signers([NOTARY_KEYPAIR])
            .rpc();

        console.log(`✅ NOTARIZED! Transaction: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (error) {
        console.error("❌ Sync Failed:", error);
        process.exit(1);
    }
}

// Run the Sync
syncNotary();