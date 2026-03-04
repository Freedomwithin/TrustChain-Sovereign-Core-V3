const fs = require('fs');
let code = fs.readFileSync('src/api/verify.ts', 'utf8');

const targetStr = `    const gini = calculateGini(data.transactions);
    const hhi = calculateHHI(data.positions);

    const giniScore = Math.min(Math.floor(gini * 10000), 65535);`;

const replaceStr = `    let gini = calculateGini(data.transactions);
    const hhi = calculateHHI(data.positions);

    // Apply n/(n-1) Gini correction
    const n = data.transactions.length;
    if (n > 1) {
        gini = gini * (n / (n - 1));
    }

    const giniScore = Math.min(Math.floor(gini * 10000), 65535);`;

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('src/api/verify.ts', code);
