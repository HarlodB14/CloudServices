/**
 * Photo Prestige API Gateway
 * 
 * Routes structure:
 * - /auth/* - Authentication endpoints (public)
 * - /api/targets/* - Target management (requires target_owner role)
 * - /api/submissions/* - Competition submissions (requires participant role)
 * - /api/scores/* - Score viewing (requires permissions)
 * - /api/admin/* - Admin endpoints (requires admin role)
 */

require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const {
    verifyToken,
    requireParticipant,
    requireTargetOwner,
    requireAdmin,
    requirePermission
} = require('./middleware/photoPrestigeAuth');

const app = express();
app.use(express.json());

// Service URLs from environment or defaults
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://target-service:3002';
const SUBMISSION_SERVICE_URL = process.env.SUBMISSION_SERVICE_URL || 'http://submission-service:3003';
const SCORE_SERVICE_URL = process.env.SCORE_SERVICE_URL || 'http://score-service:3004';
const MAIL_SERVICE_URL = process.env.MAIL_SERVICE_URL || 'http://mail-service:3005';
const CLOCK_SERVICE_URL = process.env.CLOCK_SERVICE_URL || 'http://clock-service:3006';

const PORT = process.env.PORT || 3000;

/**
 * Health check endpoint
 */
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
 * TARGET SERVICE ROUTES
 * ============================================
 */

// List targets (public - no auth required)
app.get('/api/targets', createProxyMiddleware({
    target: TARGET_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/targets': '/targets' },
    onProxyReq(proxyReq, req, res) {
        console.log(`[TARGETS-PUBLIC] GET /targets`);
    }
}));

// View specific target (public - no auth required)
app.get('/api/targets/:id', createProxyMiddleware({
    target: TARGET_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/targets': '/targets' },
    onProxyReq(proxyReq, req, res) {
        console.log(`[TARGETS-PUBLIC] GET /targets/:id`);
    }
}));

// Create target (requires target_owner role)
app.post('/api/targets',
    verifyToken,
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
    verifyToken,
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
    verifyToken,
    requireTargetOwner,
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        onProxyReq: forwardUserHeaders
    })
);

// View target scores (requires target_owner role)
app.get('/api/targets/:id/scores',
    verifyToken,
    requirePermission('view:target_scores'),
    createProxyMiddleware({
        target: TARGET_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets': '/targets' },
        onProxyReq: forwardUserHeaders
    })
);

/**
 * ============================================
 * SUBMISSION SERVICE ROUTES
 * ============================================
 */

// Upload submission (requires participant role)
app.post('/api/targets/:id/submit',
    verifyToken,
    requireParticipant,
    createProxyMiddleware({
        target: SUBMISSION_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/targets/(.+)/submit': '/submit' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            proxyReq.setHeader('X-Target-Id', req.params.id);
            console.log(`[SUBMISSIONS] ${req.user.email} submitting to target :${req.params.id}`);
        }
    })
);

// View own submissions (requires authentication)
app.get('/api/submissions',
    verifyToken,
    requirePermission('view:own_submission'),
    createProxyMiddleware({
        target: SUBMISSION_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/submissions': '/submissions' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            console.log(`[SUBMISSIONS] ${req.user.email} viewing own submissions`);
        }
    })
);

// Delete own submission (requires authentication)
app.delete('/api/submissions/:id',
    verifyToken,
    requirePermission('delete:own_submission'),
    createProxyMiddleware({
        target: SUBMISSION_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/submissions': '/submissions' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            console.log(`[SUBMISSIONS] ${req.user.email} deleting submission :${req.params.id}`);
        }
    })
);

/**
 * ============================================
 * SCORE SERVICE ROUTES
 * ============================================
 */

// View scores for target (target owner or admin only)
app.get('/api/scores/targets/:id',
    verifyToken,
    requirePermission('view:target_scores'),
    createProxyMiddleware({
        target: SCORE_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/scores': '/scores' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            proxyReq.setHeader('X-User-Roles', req.user.roles.join(','));
            console.log(`[SCORES] ${req.user.email} viewing scores for target :${req.params.id}`);
        }
    })
);

// View own scores (authenticated users only)
app.get('/api/scores/user/:userId',
    verifyToken,
    createProxyMiddleware({
        target: SCORE_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/scores': '/scores' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            console.log(`[SCORES] ${req.user.email} viewing user scores`);
        }
    })
);

/**
 * ============================================
 * ADMIN ROUTES
 * ============================================
 */
app.use('/api/admin', verifyToken, requireAdmin);

app.post('/api/admin/assign-role',
    createProxyMiddleware({
        target: AUTH_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/admin': '/auth/admin' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            console.log(`[ADMIN] ${req.user.email} assigning role`);
        }
    })
);

app.post('/api/admin/assign-permissions',
    createProxyMiddleware({
        target: AUTH_SERVICE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/admin': '/auth/admin' },
        onProxyReq(proxyReq, req, res) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Email', req.user.email);
            console.log(`[ADMIN] ${req.user.email} assigning permissions`);
        }
    })
);

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
    console.error('Gateway error:', err);
    res.status(500).json({
        error: 'Gateway Error',
        message: err.message
    });
});

/**
 * Start gateway
 */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║   Photo Prestige API Gateway           ║
║   Running on port ${PORT}                  ║
╚════════════════════════════════════════╝

Available Endpoints:
  Auth:        /auth/*
  Targets:     /api/targets/*
  Submissions: /api/submissions/*
  Scores:      /api/scores/*
  Admin:       /api/admin/*

Auth Services URL: ${AUTH_SERVICE_URL}
Target Service:   ${TARGET_SERVICE_URL}
    `);
});

/* helper for all target‑service proxies */
function forwardUserHeaders(proxyReq, req) {
    proxyReq.setHeader('X-User-Id', req.user.userId);
    proxyReq.setHeader('X-User-Email', req.user.email);
    proxyReq.setHeader('X-User-Roles', req.user.roles.join(','));
}