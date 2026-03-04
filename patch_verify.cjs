const fs = require('fs');
let code = fs.readFileSync('src/api/verify.ts', 'utf8');

const targetStr = `    // Static response for pool IDs to prevent HUD errors
    if (address && typeof address === 'string' && address.startsWith('pool_')) {`;

const replaceStr = `    // Static response for pool IDs to prevent HUD errors
    if (address && typeof address === 'string' && (address.startsWith('pool_') || address.includes('sol-'))) {`;

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('src/api/verify.ts', code);
