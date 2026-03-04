/**
 * TrustChain Integrity Engine - Sentinel V2.1
 * Logic: Gini Coefficient + HHI Concentration
 */

export const calculateGini = (transactions) => {
    if (!transactions || transactions.length < 3) return 0;

    const values = transactions.map(tx => Math.abs(tx.amount)).sort((a, b) => a - b);
    const n = values.length;
    let sumDiff = 0;
    let sumValue = 0;

    for (let i = 0; i < n; i++) {
        sumValue += values[i];
        for (let j = 0; j < n; j++) {
            sumDiff += Math.abs(values[i] - values[j]);
        }
    }

    if (sumValue === 0) return 0;
    const rawGini = sumDiff / (2 * Math.pow(n, 2) * (sumValue / n));
    return Math.min(Math.max(rawGini * (n / (n - 1)), 0), 1);
};

export const calculateHHI = (positions) => {
    if (!positions || positions.length === 0) return 0;
    const total = positions.reduce((sum, p) => sum + p.value, 0);
    if (total === 0) return 0;
    return positions.reduce((hhi, p) => hhi + Math.pow((p.value / total) * 100, 2), 0) / 10000;
};