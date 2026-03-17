import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { cors } from 'hono/cors';

const app = new Hono();

// --- Gateway Cache & Coalescing ---
const responseCache = new Map<string, { data: any, timestamp: number }>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 15000; // 15 seconds edge cache for rapid re-renders/bot swarms

app.use('*', cors({
    origin: (origin) => {
        if (!origin) return 'http://localhost:5173';
        if (
            origin === 'http://localhost:5173' ||
            origin === 'https://trustchain-sovereign-frontend.vercel.app' ||
            origin.endsWith('.vercel.app')
        ) {
            return origin;
        }
        return 'http://localhost:5173';
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
}));

app.get('/', (c) => {
    const info = getConnInfo(c);
    return c.json({
        status: 'GATEWAY ACTIVE',
        version: 'v3.1.0-SOVEREIGN-EDGE-HARDENED',
        ip: info.remote.address
    });
});

app.post('/api/verify', async (c) => {
    const body = await c.req.json();
    const address = body.address;
    const info = getConnInfo(c);
    const startTime = Date.now();

    if (!address) {
        return c.json({ error: 'Address required' }, 400);
    }

    // 1. Check Edge Cache
    const cached = responseCache.get(address);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return c.json({ 
            ...cached.data, 
            gateway: 'HIT', 
            latencyMs: Date.now() - startTime 
        });
    }

    // 2. Request Coalescing (Request deduplication at the edge)
    if (inFlightRequests.has(address)) {
        try {
            const data = await inFlightRequests.get(address);
            return c.json({ 
                ...data, 
                gateway: 'COALESCED', 
                latencyMs: Date.now() - startTime 
            });
        } catch (e) {
            // If the shared request failed, we'll try a fresh one below
        }
    }

    // 3. Forward to Ingestion Server
    const fetchPromise = (async () => {
        const response = await fetch('http://localhost:3001/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': info.remote.address || '',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData: any = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Backend Error');
        }

        const data: any = await response.json();
        
        // Update Cache
        responseCache.set(address, { data, timestamp: Date.now() });
        return data;
    })();

    inFlightRequests.set(address, fetchPromise);

    try {
        const data: any = await fetchPromise;
        return c.json({ 
            ...data, 
            gateway: 'MISS', 
            latencyMs: Date.now() - startTime 
        });
    } catch (error: any) {
        return c.json({ error: 'Gateway Error', details: error.message }, 500);
    } finally {
        // Cleanup in-flight map
        if (inFlightRequests.get(address) === fetchPromise) {
            inFlightRequests.delete(address);
        }
    }
});

const port = process.env.EDGE_PORT ? parseInt(process.env.EDGE_PORT) : 3002;
console.log(`🛡️ TrustChain Sovereign Edge Gateway Hardened (v3.1.0) Online on port ${port}`);

serve({
    fetch: app.fetch,
    port
});
