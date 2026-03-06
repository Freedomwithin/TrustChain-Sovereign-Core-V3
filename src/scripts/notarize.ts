import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const IDL = require('../../idl/trustchain_notary.json');

async function main() {
    try {
        // 1. Dependency Check / Setup
        const { Program, AnchorProvider, Wallet } = anchor;

        // 2. Load identity from ./notary.json
        const notaryJsonPath = path.resolve(process.cwd(), 'notary.json');
        if (!fs.existsSync(notaryJsonPath)) {
            console.error("❌ ERROR: Could not find ./notary.json");
            process.exit(1);
        }
        const notarySecret = JSON.parse(fs.readFileSync(notaryJsonPath, 'utf-8'));
        if (!Array.isArray(notarySecret) || notarySecret.length !== 64 || !notarySecret.every(Number.isInteger)) {
            console.error("❌ ERROR: notary.json must contain a valid 64-integer array representing the secret key.");
            process.exit(1);
        }
        const notaryKeypair = Keypair.fromSecretKey(new Uint8Array(notarySecret));

        // 3. RPC setup using Mainnet-Beta Helius URL from .env
        const rpcUrl = process.env.SOLANA_RPC_URL;
        if (!rpcUrl) {
            console.error("❌ ERROR: SOLANA_RPC_URL is not set in .env");
            process.exit(1);
        }
        const connection = new Connection(rpcUrl, "confirmed");

        // 4. Target Program Setup
        const PROGRAM_ID = new PublicKey("CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT");

        const wallet = new Wallet(notaryKeypair);
        const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
        const program = new Program(IDL, PROGRAM_ID, provider);

        // 5. Calculate "integrity" PDA for notary
        const [integrityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("integrity"), notaryKeypair.publicKey.toBuffer()],
            PROGRAM_ID
        );

        console.log(`🏛️ Notary PublicKey: ${notaryKeypair.publicKey.toBase58()}`);
        console.log(`🔐 Integrity PDA: ${integrityPda.toBase58()}`);

        const targetUserStr = process.env.TARGET_WALLET_ADDRESS;
        if (!targetUserStr) {
            console.error("❌ ERROR: TARGET_WALLET_ADDRESS is not set in .env");
            process.exit(1);
        }
        const targetUser = new PublicKey(targetUserStr);

        console.log(`🚀 Sending initialization transaction...`);

        // Execute Transaction
        const tx = await program.methods
            .updateIntegrity(0, 0, 0)
            .accounts({
                notaryAccount: integrityPda,
                notary: notaryKeypair.publicKey,
                targetUser: targetUser,
                systemProgram: SystemProgram.programId,
            })
            .signers([notaryKeypair])
            .rpc();

        console.log(`✅ Success! Transaction Signature: ${tx}`);
    } catch (error: any) {
        // 6. Graceful skip for "Account already exists" error
        if (error instanceof anchor.AnchorError) {
            if (error.error.errorCode.code === "AccountAlreadyInitialized" || error.error.errorCode.number === 0) {
                console.log(`⚠️ Graceful Skip: Notary integrity account already exists (AnchorError).`);
                return;
            }
        } else {
            const errorString = error.toString();
            if (
                errorString.includes("already in use") ||
                errorString.includes("Account already exists") ||
                errorString.includes("custom program error: 0x0")
            ) {
                console.log(`⚠️ Graceful Skip: Notary integrity account already exists.`);
                return;
            }
        }

        console.error("❌ Unexpected Error:", error);
        process.exit(1);
    }
}

main();
