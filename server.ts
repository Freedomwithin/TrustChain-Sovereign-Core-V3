import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { performance } from "perf_hooks";
import * as anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet } = anchor;
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IDL = require('./idl/trustchain_notary.json');

// @ts-ignore
import { calculateGini, calculateHHI, calculateVoterWeight } from './integrityEngine.js';
import { getFairScore, calculateTotalScore } from './services/reputationEngine.js';
// @ts-ignore
import { fetchWithRetry } from './utils/rpc.js';
import { PRIORITY_FEE_CONFIG } from './src/config/constants.js';

// ---- Environment ----
// Prioritize .env.local over .env to support local overrides
const envFiles = [".env.local", ".env"];
for (const file of envFiles) {
    const envPath = path.resolve(__dirname, file);
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}
// Ensure standard .env from CWD is loaded if not already covered
dotenv.config();

// ---- Notary Keypair ----
let NOTARY_KEYPAIR: Keypair | null = null;
try {
    const secretString = process.env.NOTARY_SECRET || "";
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
} catch (e) {
    console.error("ERROR: Could not parse NOTARY_SECRET.");
}

// ---- Connection ----
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
console.log(`[TrustChain] Connecting to RPC: ${rpcUrl}`);
const connection = new Connection(rpcUrl, "confirmed");

const PROGRAM_ID = new PublicKey(
    process.env.SOLANA_PROGRAM_ID || "CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT"
);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const validateAddress = (address: string) => {
    if (!address || typeof address !== 'string') return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

const fetchWalletData = async (address: string) => {
    const pubKey = new PublicKey(address);
    // Reduce limit to 15 to improve performance and avoid rate limits
    const signatures = await fetchWithRetry(() =>
        connection.getSignaturesForAddress(pubKey, { limit: 15 })
    );
    const transactions: any[] = [];
    const positions: any[] = [];

    const processSignature = async (sigInfo: any) => {
        try {
            const tx = await fetchWithRetry(() =>
                connection.getParsedTransaction(sigInfo.signature, {
                    maxSupportedTransactionVersion: 0
                })
            );
            if (!tx || !tx.meta) return;

            const accountIndex = tx.transaction.message.accountKeys.findIndex(
                (key: any) => key.pubkey.toBase58() === address
            );
            if (accountIndex !== -1) {
                const amount = Math.abs(
                    (tx.meta.preBalances[accountIndex] || 0) -
                    (tx.meta.postBalances[accountIndex] || 0)
                );
                if (amount > 0) {
                    transactions.push(amount);
                    positions.push(amount);
                }
            }
        } catch (err) {
            console.warn(`Failed to fetch tx ${sigInfo.signature}:`, err);
        }
    };

    const CONCURRENCY_LIMIT = 3;
    for (let i = 0; i < signatures.length; i += CONCURRENCY_LIMIT) {
        const batch = signatures.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map(processSignature));
        if (i + CONCURRENCY_LIMIT < signatures.length) {
            await delay(200);
        }
    }

    return { transactions, positions, signatures };
};

export const getVerificationData = async (address: string) => {
    const data = await fetchWalletData(address);
    const gini = calculateGini(data.transactions);
    const hhi = calculateHHI(data.positions);

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

// ---- Express App ----
const app = express();

app.use(cors({
    origin: [
        process.env.CORS_ORIGIN || '',
        'https://trustchain-sovereign-frontend.vercel.app',
        /\.vercel\.app$/,
        'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Routes ----

app.get('/', (req: any, res: any) => {
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    }
    return res.json({
        status: 'SENTINEL ACTIVE',
        notary: NOTARY_KEYPAIR?.publicKey.toBase58() || 'NOT CONFIGURED',
        rpc: rpcUrl,
        program: PROGRAM_ID.toBase58()
    });
});

// Pool integrity — static data + live notary balance
// Polls every 5 minutes from frontend, not on every request
app.get('/api/pool/:id/integrity', async (req: any, res: any) => {
    const poolId = req.params.id;
    try {
        const baseData: Record<string, any> = {
            'SOL-USDC': { giniScore: 0.15, topHolders: 12, totalLiquidity: 5000000 },
            'JUP-SOL': { giniScore: 0.22, topHolders: 8, totalLiquidity: 1200000 },
            'RAY-SOL': { giniScore: 0.35, topHolders: 5, totalLiquidity: 300000 }
        };

        const notaryAddr = NOTARY_KEYPAIR?.publicKey.toBase58()
            || process.env.NOTARY_PUBLIC_KEY
            || 'FBbjMhKtg1iyy83CeHaieqEFqw586i3WYG4zCcnXr7tc';

        const balance = await connection.getBalance(new PublicKey(notaryAddr));
        const solBalance = balance / 1e9;

        return res.json({
            ...(baseData[poolId] || baseData['SOL-USDC']),
            notaryBalance: solBalance,
            status: solBalance >= 0.05 ? 'ONLINE' : 'LOW_FUNDS',
            lastSync: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch pool state' });
    }
});

// Read-only verification check
app.get('/api/verify/:wallet', async (req: any, res: any) => {
    const { wallet } = req.params;
    const start = performance.now();

    if (!validateAddress(wallet)) {
        return res.status(400).json({ status: 'INVALID_ADDRESS' });
    }

    try {
        const {
            gini,
            hhi,
            txCount,
            status,
            fairScore,
            trustChainScore,
            totalScore
        } = await getVerificationData(wallet);

        const end = performance.now();
        const weightMultiplier = calculateVoterWeight(totalScore, hhi);

        return res.json({
            wallet,
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
            signature: null,
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

// Wallet verification + on-chain notarization
app.post('/api/verify', async (req: any, res: any) => {
    const { address } = req.body;
    const start = performance.now();

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

export default app;