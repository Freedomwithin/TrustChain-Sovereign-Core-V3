const { Program, AnchorProvider, Wallet, web3 } = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

let _connection = null;
let _program = null;
let _wallet = null;

function getNotaryKeypair() {
  // 1. Check environment variable
  if (process.env.NOTARY_SECRET) {
    try {
      const parsed = JSON.parse(process.env.NOTARY_SECRET);
      if (Array.isArray(parsed)) {
        return Keypair.fromSecretKey(new Uint8Array(parsed));
      }
    } catch (e) {
      // Try hex
      const cleanHex = process.env.NOTARY_SECRET.replace(/^0x/, '');
      if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
        return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(cleanHex, 'hex')));
      }
    }
  }

  // 2. Check local Solana config
  const localConfigPath = path.join(os.homedir(), '.config/solana/id.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      const secretKey = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      return Keypair.fromSecretKey(new Uint8Array(secretKey));
    } catch (e) {
      console.warn("Failed to read local Solana keypair:", e.message);
    }
  }

  // 3. Check Sovereign Wallets-Testing
  const sovereignWalletPath = path.join(__dirname, '../../Wallets-Testing/demo-clean.json');
  if (fs.existsSync(sovereignWalletPath)) {
    try {
      const secretKey = JSON.parse(fs.readFileSync(sovereignWalletPath, 'utf8'));
      return Keypair.fromSecretKey(new Uint8Array(secretKey));
    } catch (e) {
      console.warn("Failed to read Sovereign demo wallet:", e.message);
    }
  }

  throw new Error("NOTARY_SECRET not set and no fallback keypairs found.");
}

function getProgram() {
  if (_program) return _program;

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.warn("SOLANA_RPC_URL not set.");
    return null;
  }

  if (!_connection) {
    _connection = new Connection(rpcUrl, "confirmed");
  }

  if (!_wallet) {
    try {
      _wallet = new Wallet(getNotaryKeypair());
    } catch (error) {
      console.warn("Failed to initialize wallet:", error.message);
      return null;
    }
  }

  // Load IDL dynamically
  const idlPath = path.join(__dirname, '../../target/idl/trustchain_notary.json');
  if (!fs.existsSync(idlPath)) {
    console.warn("IDL file not found at", idlPath);
    return null;
  }

  let idl;
  try {
    idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  } catch (error) {
    console.error("Failed to parse IDL:", error);
    return null;
  }

  const programId = new PublicKey(idl.address);
  const provider = new AnchorProvider(_connection, _wallet, { preflightCommitment: "confirmed" });
  _program = new Program(idl, programId, provider);
  return _program;
}

async function submitNotarization(address, status, gini, hhi) {
  if (process.env.MOCK_MODE === 'true') {
    console.log(`[MOCK] Notarizing ${address} with status ${status}`);
    return "mock-signature";
  }

  const program = getProgram();
  if (!program) {
    console.warn("Skipping notarization: Program not initialized (check RPC URL or IDL).");
    return;
  }

  // Status Mapping
  let statusVal;
  switch (status) {
    case 'VERIFIED':
      statusVal = 1;
      break;
    case 'PROBATIONARY':
      statusVal = 2;
      break;
    case 'SYBIL':
      statusVal = 3;
      break;
    default:
      console.error(`Invalid status '${status}' for notarization. Skipping.`);
      return;
  }

  try {
    const userKey = new PublicKey(address);
    const [userIntegrityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), userKey.toBuffer()],
      program.programId
    );

    // Scale scores to u16 (0.0000 to 1.0000 -> 0 to 10000)
    const giniScore = Math.floor(gini * 10000);
    const hhiScore = Math.floor(hhi * 10000);

    console.log(`Notarizing ${address}: Gini=${giniScore}, HHI=${hhiScore}, Status=${statusVal}`);

    // IDL args are snake_case now: gini_score, hhi_score
    const tx = await program.methods
      .updateIntegrity(giniScore, hhiScore, statusVal)
      .accounts({
        userIntegrity: userIntegrityPda,
        user: userKey,
        notary: _wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`Notarization successful. Tx: ${tx}`);
    return tx;
  } catch (error) {
    console.error(`Notarization failed for ${address}:`, error);
    throw error;
  }
}

module.exports = { submitNotarization };
