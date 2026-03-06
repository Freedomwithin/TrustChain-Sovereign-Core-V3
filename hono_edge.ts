import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { cors } from 'hono/cors';

const app = new Hono();

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
        version: 'v3.0.0-SOVEREIGN-EDGE',
        ip: info.remote.address
    });
});

app.post('/api/verify', async (c) => {
    // Forward the request to the ingestion server running on port 3001
    const body = await c.req.json();
    const info = getConnInfo(c);

    try {
        const response = await fetch('http://localhost:3001/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': info.remote.address || '',
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return c.json(data, response.status as any);
    } catch (error: any) {
        return c.json({ error: 'Gateway Error', details: error.message }, 500 as any);
    }
});

const port = process.env.EDGE_PORT ? parseInt(process.env.EDGE_PORT) : 3002;
console.log(`🛡️ TrustChain Sovereign Edge Gateway Online on port ${port}`);

serve({
    fetch: app.fetch,
    port
});
