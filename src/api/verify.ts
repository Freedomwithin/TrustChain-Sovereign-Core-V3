import express from 'express';
import { PublicKey, SystemProgram, ComputeBudgetProgram, Connection, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { performance } from 'perf_hooks';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Setup basic requirements that match server.ts
dotenv.config();

const { Program, AnchorProvider, Wallet } = anchor;

// Need to define this properly for TS to accept import.meta in some configurations
// or just use typical commonjs workarounds for TS if needed
const require = createRequire(import.meta.url as string);
const __filename = fileURLToPath(import.meta.url as string);
const __dirname = path.dirname(__filename);
const IDL = require('../../idl/trustchain_notary.json');

// Imports from the existing project structure
// @ts-ignore
import { calculateGini, calculateHHI, calculateVoterWeight } from '../services/integrityEngine.js';
// FIXED: Use correct relative path to services directory (../services instead of ../../services)
// @ts-ignore
import { getFairScore, calculateTotalScore } from '../services/reputationEngine.js';
import { PRIORITY_FEE_CONFIG } from '../config/constants.js';

// The new gRPC-based data source
import { fetchWalletData } from '../services/solana.js';

// --- Replicate the exact setup logic from server.ts ---
let NOTARY_KEYPAIR: Keypair | null = null;
try {
    const secretString = process.env.NOTARY_SECRET || "";
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
} catch (e) {
    console.error("ERROR: Could not parse NOTARY_SECRET in verify API.");
}

const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
});

const PROGRAM_ID = new PublicKey(
    process.env.TRUSTCHAIN_PROGRAM_ID || "CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT"
);

const validateAddress = (address: string): boolean => {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
};

export const getVerificationData = async (address: string) => {
    // THIS IS THE KEY CHANGE - Use gRPC stream data instead of standard RPC polling
    // This will hydrate from standard RPC initially if needed, then use gRPC updates
    const data = await fetchWalletData(address);

    // Fallback behavior if gRPC hasn't seen this wallet yet
    if (data.transactions.length === 0 && data.positions.length === 0) {
        console.log(`Warning: No gRPC/RPC data available yet for ${address}`);
    }

    let gini = calculateGini(data.transactions);
    const hhi = calculateHHI(data.positions);

    // Apply n/(n-1) Gini correction
    const n = data.transactions.length;
    if (n > 1) {
        gini = gini * (n / (n - 1));
    }

    const giniScore = Math.min(Math.floor(gini * 10000), 65535);
    const hhiScore = Math.min(Math.floor(hhi * 10000), 65535);
    const txCount = data.signatures.length;

    // Status logic
    let status: string;
    if (txCount < 3 || data.transactions.length < 2) {
        status = 'PROBATIONARY';
    } else if (gini > 0.9) {
        status = 'SYBIL';
    } else if (gini < 0.3) {
        status = 'VERIFIED';
    } else {
        status = 'PROBATIONARY';
    }

    const statusNum = status === 'VERIFIED' ? 0 : status === 'PROBATIONARY' ? 1 : 2;

    // Weighted Logic Integration
    const fairScore = await getFairScore(address);
    // TrustChain Score: (1 - Gini) * 100
    let trustChainScore = Math.max(0, Math.round((1 - Math.min(gini, 1)) * 100));

    // Fix: If insufficient transaction data, set TrustChain Score to 0 (baseline)
    if (data.transactions.length < 2) {
        trustChainScore = 0;
    }

    const totalScore = calculateTotalScore(trustChainScore, fairScore);

    return {
        gini,
        hhi,
        giniScore,
        hhiScore,
        txCount,
        status,
        statusNum,
        fairScore,
        trustChainScore,
        totalScore
    };
};

export const verifyRouter = express.Router();

verifyRouter.post('/', async (req: any, res: any) => {
    const { address } = req.body;
    const start = performance.now();

    // Static response for pool IDs to prevent HUD errors
    if (address && typeof address === 'string' && (address.startsWith('pool_') || address.includes('sol-'))) {
        return res.json({
            status: 'VERIFIED',
            scores: {
                gini: 0.125
            }
        });
    }

    if (!validateAddress(address)) {
        return res.status(400).json({ status: 'INVALID_ADDRESS' });
    }

    if (!NOTARY_KEYPAIR) {
        return res.status(500).json({
            error: 'NOTARY_SECRET not configured',
            status: 'OFFLINE'
        });
    }

    try {
        const {
            gini,
            hhi,
            giniScore,
            hhiScore,
            txCount,
            status,
            statusNum,
            fairScore,
            trustChainScore,
            totalScore
        } = await getVerificationData(address);

        // On-chain notarization
        let signature: string | null = null;
        try {
            const wallet = new Wallet(NOTARY_KEYPAIR);
            const provider = new AnchorProvider(connection, wallet, {
                preflightCommitment: "confirmed"
            });
            const program = new Program(IDL, PROGRAM_ID, provider);

            const targetPubkey = new PublicKey(address);
            const [userIntegrityPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("notary"), targetPubkey.toBuffer()],
                PROGRAM_ID
            );

            signature = await program.methods
                .updateIntegrity(giniScore, hhiScore, statusNum)
                .accounts({
                    notaryAccount: userIntegrityPda,
                    notary: NOTARY_KEYPAIR.publicKey,
                    targetUser: targetPubkey,
                    systemProgram: SystemProgram.programId,
                })
                .preInstructions([
                    ComputeBudgetProgram.setComputeUnitPrice(PRIORITY_FEE_CONFIG)
                ])
                .signers([NOTARY_KEYPAIR])
                .rpc();

            console.log(`Notarized ${address}: ${signature}`);
        } catch (notaryErr: any) {
            // Don't fail the whole request if notarization fails
            console.warn(`Notarization skipped: ${notaryErr.message}`);
        }

        const end = performance.now();
        const weightMultiplier = calculateVoterWeight(totalScore, hhi);

        return res.json({
            status,
            scores: {
                gini,
                hhi,
                syncIndex: 0,
                totalScore,
                fairScore,
                trustChainScore
            },
            governance: {
                voterWeightMultiplier: weightMultiplier,
                isQualified: weightMultiplier > 0,
                tier: weightMultiplier >= 1.5 ? "Steward" : weightMultiplier >= 1.0 ? "Verified" : "Probationary"
            },
            txCount,
            signature,
            latencyMs: Math.round(end - start)
        });

    } catch (error: any) {
        console.error("Verification error:", error);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
