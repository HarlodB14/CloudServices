require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { verifyTokenFromHeader, requireParticipant, requireTargetOwner, requireAdmin, requirePermission } = require('@photo-prestige/auth-utils');

const app = express();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://target-service:3002';
const REGISTER_SERVICE_URL = process.env.REGISTER_SERVICE_URL || 'http://register-service:3003';
const SCORE_SERVICE_URL = process.env.SCORE_SERVICE_URL || 'http://score-service:3004';
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
    pathRewrite: (path) => `/auth${path}`,
    timeout: 5000,
    proxyTimeout: 5000,
    on: {
        proxyReq(proxyReq, req) {
            fixRequestBody(proxyReq, req);
            console.log(`[AUTH] ${req.method} ${req.originalUrl}`);
        },
        error(err, req, res) {
            console.error('[AUTH] Proxy error:', err.message);
            res.status(502).json({
                error: 'Authentication Service Unavailable',
                message: err.message
            });
        }
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
    on: {
        proxyReq(proxyReq, req) {
            console.log(`[TARGETS-PUBLIC] Proxying ${req.method} ${req.path} -> ${TARGET_SERVICE_URL}/targets${req.path}`);
        },
        error(err, req, res) {
            console.error('[PROXY ERROR]', err.message);
            res.status(502).json({ error: 'Target service error', message: err.message });
        }
    }
});

app.get('/api/targets', publicTargetsProxy);
app.get('/api/targets/:id', publicTargetsProxy);

/**
 * ============================================
 * PROTECTED ROUTES (Token required after this point)
 * ============================================
 */
app.use('/api', verifyTokenFromHeader());

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
        on: { proxyReq: forwardUserHeaders }
    })
);

// Edit target (requires ownership + target_owner role)
app.put('/api/targets/:id',
    requireTargetOwner,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Delete target (requires ownership + target_owner role)
app.delete('/api/targets/:id',
    requireTargetOwner,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Submit photo to target (requires participant permission)
app.post('/api/targets/:id/submit',
    requireParticipant,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// View own submission for target
app.get('/api/targets/:id/my-submission',
    requirePermission('view:own_submission'),
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Delete own submission for target
app.delete('/api/targets/:id/my-submission',
    requirePermission('delete:own_submission'),
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Rate target (thumbs up/down)
app.post('/api/targets/:id/rate',
    requireParticipant,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// View all scores for owned target
app.get('/api/targets/:id/scores',
    requirePermission('view:target_scores'),
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Finalize target and determine winner (owner/admin)
app.post('/api/targets/:id/finalize',
    requirePermission('manage:target_deadline'),
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Read leaderboard directly from score service
app.get('/api/scores/targets/:targetId/leaderboard',
    requirePermission('view:target_scores'),
    createProxyMiddleware({
        target: SCORE_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/scores': '/scores' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Register for target (requires participant)
app.post('/api/register/:targetId',
    requireParticipant,
    createProxyMiddleware({
        target: REGISTER_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/register': '/register/target' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Withdraw from target (requires participant)
app.delete('/api/register/:targetId',
    requireParticipant,
    createProxyMiddleware({
        target: REGISTER_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/register': '/register/target' },
        on: { proxyReq: forwardUserHeaders }
    })
);

// Check my enrollment for target
app.get('/api/register/:targetId/my-enrollment',
    requireParticipant,
    createProxyMiddleware({
        target: REGISTER_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/register': '/register/target' },
        on: { proxyReq: forwardUserHeaders }
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
    fixRequestBody(proxyReq, req);
    const userId = (req.user && req.user.userId) || (req.user && req.user.id);
    const email = (req.user && req.user.email) || (req.user && req.user.userEmail);
    const name = (req.user && req.user.name) || (req.user && req.user.userName);
    const roles = (req.user && req.user.roles) || (req.user && req.user.userRoles) || [];
    const permissions = (req.user && req.user.permissions) || (req.user && req.user.userPermissions) || [];

    if (userId) proxyReq.setHeader('X-User-Id', userId);
    if (email) proxyReq.setHeader('X-User-Email', email);
    if (name) proxyReq.setHeader('X-User-Name', name);
    proxyReq.setHeader('X-User-Roles', roles.join(','));
    proxyReq.setHeader('X-User-Permissions', permissions.join(','));
}