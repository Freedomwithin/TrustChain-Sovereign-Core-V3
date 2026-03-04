const fs = require('fs');
let code = fs.readFileSync('src/services/solana.ts', 'utf8');

const targetStr = `// Properly format the gRPC URL by stripping https:// if it exists since grpc libraries sometimes prefer clean hosts
let rawRpcUrl = process.env.SOLANA_RPC_URL || "devnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY";
const GRPC_URL = rawRpcUrl.replace(/^https?:\\/\\//, "");`;

const replaceStr = `// Properly format the gRPC URL by reading directly from SOLANA_GRPC_URL
const GRPC_URL = process.env.SOLANA_GRPC_URL || "devnet.helius-rpc.com:443";`;

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('src/services/solana.ts', code);
