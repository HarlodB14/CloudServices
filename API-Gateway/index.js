require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { verifyToken, requireParticipant, requireTargetOwner, requireAdmin, requirePermission } = require('./middleware/photoPrestigeAuth');

const app = express();
app.use(express.json());

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://target-service:3002';
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Gateway healthy', timestamp: new Date() });
});

/**
 * ============================================
 * AUTH SERVICE ROUTES (Public - No Token Required)
 * ============================================
 */
app.use('/auth', createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/auth': '/auth' },
    timeout: 5000,
    proxyTimeout: 5000,
    onProxyReq(proxyReq, req, res) {
        console.log(`[AUTH] ${req.method} ${req.originalUrl}`);
    },
    onError(err, req, res) {
        console.error('[AUTH] Proxy error:', err.message);
        res.status(502).json({
            error: 'Authentication Service Unavailable',
            message: err.message
        });
    }
}));

/**
 * ============================================
 * PUBLIC TARGET ROUTES (No auth required)
 * ============================================
 */
const publicTargetsProxy = createProxyMiddleware({
    target: TARGET_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/targets': '/targets' },
    onProxyReq(proxyReq, req, res) {
        console.log(`[TARGETS-PUBLIC] Proxying ${req.method} ${req.path} -> ${TARGET_SERVICE_URL}/targets${req.path}`);
    },
    onError(err, req, res) {
        console.error('[PROXY ERROR]', err.message);
        res.status(502).json({ error: 'Target service error', message: err.message });
    }
});

app.get('/api/targets', publicTargetsProxy);
app.get('/api/targets/:id', publicTargetsProxy);

/**
 * ============================================
 * PROTECTED ROUTES (Token required after this point)
 * ============================================
 */
app.use('/api', verifyToken);

/**
 * ============================================
 * PROTECTED TARGET SERVICE ROUTES
 * ============================================
 */

// Create target (requires target_owner role)
app.post('/api/targets',
    requireTargetOwner,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        onProxyReq: forwardUserHeaders
    })
);

// Edit target (requires ownership + target_owner role)
app.put('/api/targets/:id',
    requireTargetOwner,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        onProxyReq: forwardUserHeaders
    })
);

// Delete target (requires ownership + target_owner role)
app.delete('/api/targets/:id',
    requireTargetOwner,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        onProxyReq: forwardUserHeaders
    })
);

// Error handler
app.use((err, req, res, next) => {
    console.error('Gateway error:', err);
    res.status(500).json({
        error: 'Gateway Error',
        message: err.message
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║   Photo Prestige API Gateway           ║
║   Running on port ${PORT}                  ║
╚════════════════════════════════════════╝
    `);
});

function forwardUserHeaders(proxyReq, req) {
    proxyReq.setHeader('X-User-Id', req.user.userId);
    proxyReq.setHeader('X-User-Email', req.user.email);
    proxyReq.setHeader('X-User-Roles', req.user.roles.join(','));
}