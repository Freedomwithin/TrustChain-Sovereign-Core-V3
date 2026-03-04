# Authority-First Technical Brief

## Overview
This document outlines the **TrustChain-Sovereign** backend architecture, specifically focusing on the **Notary Identity** as a **Decentralized Behavioral Auditor**. This implementation targets the **Realms "Authority-First" bounty ($1,000)** by establishing a reputation layer for DAO governance based on verifiable off-chain behavior.

## Notary Identity
The Notary Identity (`JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg`) acts as a trusted behavioral oracle. It analyzes wallet activity off-chain to compute integrity scores and notarizes these scores to on-chain Program Derived Addresses (PDAs).

## Notarization Process
The backend service (Notary) performs the following steps:
1.  **Data Collection**: Fetches transaction history and token holdings for a target wallet.
2.  **Integrity Analysis**:
    -   **Gini Coefficient**: Measures wealth inequality within the wallet's transaction graph (0.0 = perfect equality, 1.0 = total inequality). High Gini scores indicate extractive or bot-like behavior.
    -   **Herfindahl-Hirschman Index (HHI)**: Measures token concentration (0.0 = decentralized, 1.0 = monopoly). High HHI scores indicate whale dominance.
3.  **On-Chain Notarization**:
    -   The calculated Gini and HHI scores are normalized to a `u16` range (0-65535).
    -   The Notary signs a transaction to update the target wallet's integrity PDA.
    -   **PDA Derivation**: `["notary", target_wallet_public_key]`
    -   **Program ID**: `CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT`

## Governance Impact
The notarized scores directly influence DAO governance power:
-   **Gini Score**: Determines if a wallet is flagged as "Sybil" or "Verified".
-   **HHI Score**: Determines if a wallet is penalized for excessive concentration (Whale penalty).
-   **Voter Weight**: Wallets with high integrity scores receive a multiplier on their voting power (up to 1.5x), while low scores or high concentration result in penalties (0.1x).

This "Authority-First" approach ensures that governance power is distributed based on proven behavioral integrity, not just token holdings.
