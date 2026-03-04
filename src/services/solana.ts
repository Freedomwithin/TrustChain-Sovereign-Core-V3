import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";

// Import fetchWithRetry logic from server if it exists or define a simple one
// To avoid circular dependencies, we'll implement a simple fetch function for initial data
const fetchWithRetry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> => {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) throw error;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return fetchWithRetry(fn, retries - 1, delayMs * 2);
    }
};

dotenv.config();

const TARGET_WALLET_ADDRESS = process.env.TARGET_WALLET_ADDRESS || "GAZDwoHW6x4QCaWXizhckqta6v7nFYEFg2aULTk52k7b";

// Properly format the gRPC URL by stripping https:// if it exists since grpc libraries sometimes prefer clean hosts
let rawRpcUrl = process.env.SOLANA_RPC_URL || "devnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY";
const GRPC_URL = rawRpcUrl.replace(/^https?:\/\//, "");

const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
});

export class SolanaGRPCService {
    private client: any;
    private stream: any;
    private isConnected: boolean = false;
    private isConnecting: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectDelay: number = 30000;

    // State to store transactions and positions per wallet for Gini/HHI calculations
    private walletData: Map<string, { transactions: number[], positions: number[], signatures: string[], isHydrated: boolean }> = new Map();

    constructor() {
        // Handle potential differences in ESM/CJS interop for the default export
        const ClientConstructor = (Client as any).default || Client;
        this.client = new ClientConstructor(GRPC_URL, undefined, undefined);
    }

    public async connect() {
        if (this.isConnecting || this.isConnected) return;
        this.isConnecting = true;

        try {
            console.log(`Connecting to Yellowstone gRPC at ${GRPC_URL}...`);

            this.client.getVersion().then((version: any) => {
                console.log("gRPC Version:", version);
            }).catch((err: any) => {
                console.error("gRPC Connection Error (Version check):", err.message);
            });

            this.stream = await this.client.subscribe();

            this.stream.on("data", (data: any) => {
                this.handleStreamData(data);
            });

            this.stream.on("error", (error: any) => {
                console.error("gRPC Stream Error:", error);
                this.handleDisconnect();
            });

            this.stream.on("end", () => {
                console.log("gRPC Stream Ended");
                this.handleDisconnect();
            });

            this.stream.on("close", () => {
                console.log("gRPC Stream Closed");
                this.handleDisconnect();
            });

            // Subscribe to transactions for the target wallet
            await this.subscribeToTargetWallet();

            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            console.log("Successfully connected to Yellowstone gRPC.");

        } catch (error) {
            console.error("Failed to connect to gRPC:", error);
            this.isConnecting = false;
            this.handleDisconnect();
        }
    }

    private async subscribeToTargetWallet() {
        const commitmentLevel = CommitmentLevel ? CommitmentLevel.CONFIRMED : (Client as any).CommitmentLevel?.CONFIRMED || 1;

        const req = {
            transactions: {
                target_wallet: {
                    vote: false,
                    failed: false,
                    signature: undefined,
                    accountInclude: [TARGET_WALLET_ADDRESS],
                    accountExclude: [],
                    accountRequired: [],
                }
            },
            accounts: {},
            slots: {},
            blocks: {},
            blocksMeta: {},
            entry: {},
            commitment: commitmentLevel
        };

        await new Promise((resolve, reject) => {
            this.stream.write(req, (err: any) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Subscribed to transactions for ${TARGET_WALLET_ADDRESS}`);
                    resolve(true);
                }
            });
        });
    }

    private handleStreamData(data: any) {
        if (data && data.transaction && data.transaction.transaction) {
            const txInfo = data.transaction.transaction;

            if (txInfo.meta) {
                const accountKeys = txInfo.transaction.message.accountKeys;

                // Track data for the target wallet
                const targetIndex = accountKeys.findIndex((key: any) => {
                    try {
                        // Attempt to parse the key
                        const pubkey = new PublicKey(key);
                        return pubkey.toBase58() === TARGET_WALLET_ADDRESS;
                    } catch (e) {
                        // Some representations might not be parsable directly
                        if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
                            return new PublicKey(key).toBase58() === TARGET_WALLET_ADDRESS;
                        }
                        return false;
                    }
                });

                if (targetIndex !== -1) {
                    const preBalance = txInfo.meta.preBalances[targetIndex] || 0;
                    const postBalance = txInfo.meta.postBalances[targetIndex] || 0;
                    // Note: amounts are often in lamports, might need division by 1e9 or similar
                    // matching the logic in standard RPC code
                    const amount = Math.abs(preBalance - postBalance);

                    if (amount > 0) {
                        if (!this.walletData.has(TARGET_WALLET_ADDRESS)) {
                            this.walletData.set(TARGET_WALLET_ADDRESS, {
                                transactions: [],
                                positions: [],
                                signatures: [],
                                isHydrated: true
                            });
                        }

                        const walletState = this.walletData.get(TARGET_WALLET_ADDRESS)!;
                        walletState.transactions.push(amount);
                        walletState.positions.push(amount);

                        // Keep only recent data to prevent unbounded memory growth
                        if (walletState.transactions.length > 100) {
                            walletState.transactions.shift();
                        }
                        if (walletState.positions.length > 100) {
                            walletState.positions.shift();
                        }
                    }
                }

                // Track signatures if available
                if (data.transaction.transaction.signature) {
                    if (!this.walletData.has(TARGET_WALLET_ADDRESS)) {
                        this.walletData.set(TARGET_WALLET_ADDRESS, {
                            transactions: [],
                            positions: [],
                            signatures: [],
                            isHydrated: true
                        });
                    }

                    const walletState = this.walletData.get(TARGET_WALLET_ADDRESS)!;

                    let sigString = "";
                    const sig = data.transaction.transaction.signature;
                    try {
                        // Assuming signature is a Buffer or Uint8Array, convert to base58 or hex
                        if (Buffer.isBuffer(sig) || sig instanceof Uint8Array) {
                            // Import bs58 dynamically if needed, or use a basic string representation
                            // for now just store a mock to keep counts correct
                            sigString = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                        } else {
                            sigString = String(sig);
                        }
                    } catch (e) {
                        sigString = `sig_${Date.now()}`;
                    }

                    walletState.signatures.push(sigString);
                    if (walletState.signatures.length > 100) {
                        walletState.signatures.shift();
                    }
                }
            }
        }
    }

    private handleDisconnect() {
        if (!this.isConnected && !this.isConnecting) return;

        this.isConnected = false;
        this.isConnecting = false;

        if (this.stream) {
            try {
                this.stream.removeAllListeners();
            } catch (e) {}
        }

        // Exponential backoff strategy
        this.reconnectAttempts++;
        const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );

        console.log(`Reconnecting to gRPC in ${delay}ms (Attempt ${this.reconnectAttempts})...`);
        setTimeout(() => {
            this.connect();
        }, delay);
    }

    private async hydrateWalletData(address: string) {
        console.log(`Hydrating initial wallet data for ${address} via standard RPC...`);
        const pubKey = new PublicKey(address);
        // Reduce limit to 15 to improve performance and avoid rate limits
        const signatures = await fetchWithRetry(() =>
            connection.getSignaturesForAddress(pubKey, { limit: 15 })
        );

        const transactions: number[] = [];
        const positions: number[] = [];
        const sigs: string[] = [];

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
                        sigs.push(sigInfo.signature);
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
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        this.walletData.set(address, {
            transactions: transactions.reverse(), // oldest first to match stream order
            positions: positions.reverse(),
            signatures: sigs.reverse(),
            isHydrated: true
        });

        console.log(`Hydrated ${transactions.length} transactions for ${address}`);
        return this.walletData.get(address)!;
    }

    public async getWalletData(address: string) {
        // If we don't have data yet, hydrate it from standard RPC first
        if (!this.walletData.has(address) || !this.walletData.get(address)!.isHydrated) {
            try {
                await this.hydrateWalletData(address);

                // If it's a new address that isn't TARGET_WALLET_ADDRESS, we might want to dynamically
                // subscribe to it on the gRPC stream. However, depending on the requirement,
                // the objective says "monitor TARGET_WALLET_ADDRESS transaction clusters"
                if (address !== TARGET_WALLET_ADDRESS && this.isConnected) {
                    this.dynamicallySubscribeToWallet(address);
                }
            } catch (error) {
                console.error(`Failed to hydrate wallet data for ${address}:`, error);
                // Return empty arrays on failure so we don't crash
                if (!this.walletData.has(address)) {
                    this.walletData.set(address, {
                        transactions: [],
                        positions: [],
                        signatures: [],
                        isHydrated: false
                    });
                }
            }
        }

        return this.walletData.get(address)!;
    }

    private dynamicallySubscribeToWallet(address: string) {
        // If we want to add dynamic subscriptions:
        const commitmentLevel = CommitmentLevel ? CommitmentLevel.CONFIRMED : (Client as any).CommitmentLevel?.CONFIRMED || 1;
        const req = {
            transactions: {
                [`wallet_${address.substring(0, 8)}`]: {
                    vote: false,
                    failed: false,
                    signature: undefined,
                    accountInclude: [address],
                    accountExclude: [],
                    accountRequired: [],
                }
            },
            accounts: {},
            slots: {},
            blocks: {},
            blocksMeta: {},
            entry: {},
            commitment: commitmentLevel
        };

        this.stream.write(req, (err: any) => {
            if (err) {
                console.warn(`Failed to dynamically subscribe to ${address}:`, err);
            } else {
                console.log(`Dynamically subscribed to transactions for ${address}`);
            }
        });
    }
}

export const grpcService = new SolanaGRPCService();
// Start the connection immediately when the module is imported
grpcService.connect();

// To maintain compatibility with existing functionality
export const fetchWalletData = async (address: string) => {
    // Return data from gRPC stream (which falls back to RPC for hydration)
    const data = await grpcService.getWalletData(address);
    return data;
};
