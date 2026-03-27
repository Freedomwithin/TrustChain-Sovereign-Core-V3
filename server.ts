import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { fileURLToPath } from 'url';

// ---- Path Resolution for ESM ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Environment Loading ----
// Prioritize .env.local for local development/HUD port overrides
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
    const envPath = path.resolve(__dirname, file);
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}
dotenv.config();

// ---- VERCEL DETECTION ----
const IS_VERCEL = process.env.VERCEL === '1';

// ---- V3 Service Imports ----
// Note: Using .ts extensions for compatibility with node --experimental-strip-types
import { verifyRouter } from './src/api/verify.js';

// ---- Notary Initialization ----
let NOTARY_KEYPAIR: Keypair | null = null;
try {
    const secretString = process.env.NOTARY_SECRET || '';
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
} catch (e) {
    console.warn('[TrustChain] NOTARY_SECRET missing or invalid. Running in Read-Only Mode.');
}

// ---- Connection Health ----
const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(rpcUrl, 'confirmed');

// ---- Express Setup ----
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: [
        'http://localhost:5173', // Vite HUD local
        'https://trustchain-sovereign-frontend.vercel.app',
        'https://www.trustchainsovereign.com',
        /\.vercel\.app$/
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

app.use(express.json());

// ---- Unified V3 Handshake ----
// This router handles Yellowstone gRPC, /(n-1)$ Math, and Pool ID Bypasses
app.use('/api/verify', verifyRouter);

// ---- Legacy Health Checks ----
app.get('/', (req, res) => {
    res.json({
        status: 'SENTINEL ACTIVE',
        version: 'v3.1.0-SOVEREIGN-V-NATIVE',
        notary: NOTARY_KEYPAIR?.publicKey.toBase58() || 'READ_ONLY',
        rpc: rpcUrl,
        vercel: IS_VERCEL
    });
});

if (!IS_VERCEL) {
    app.listen(PORT, () => {
        console.log('
🛡️  TrustChain Sovereign Sentinel Online');
        console.log('📡 Port: ' + PORT);
        console.log('🔗 RPC:  ' + rpcUrl);
        console.log('🚀 gRPC: ' + (process.env.SOLANA_GRPC_URL || 'Using fallback') + '
');
    });
}

export default app;