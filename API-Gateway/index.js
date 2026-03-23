require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { verifyTokenFromHeader, requireParticipant, requireTargetOwner, requireAdmin, requirePermission } = require('@photo-prestige/auth-utils');
const { targetBreaker, registerBreaker, scoreBreaker, authBreaker, cbProxy, URLS } = require('./src/serviceClients');
const swaggerSpec = require('./src/swaggerSpec');

const app = express();

// Parse JSON bodies so cbProxy can read req.body.
// Multipart routes (/api/uploads) are unaffected — express.json() only
// processes application/json content-type.
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// ============================================================
// API DOCUMENTATION (OpenAPI + Swagger UI)
// ============================================================
app.get('/openapi.json', (req, res) => {
    res.status(200).json(swaggerSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: 'Photo Prestige API Docs'
}));

// ============================================================
// Health check
// ============================================================
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Gateway healthy', timestamp: new Date() });
});

// ============================================================
// AUTH SERVICE  (circuit-breaker protected)
// req.originalUrl preserves the full /auth/* path + query string.
// ============================================================
app.use('/auth', cbProxy(authBreaker, req => `${URLS.auth}${req.originalUrl}`));

// ============================================================
// MEDIA PROXY  (streaming proxy — not suitable for axios)
// ============================================================
app.use('/media', createProxyMiddleware({
    target: URLS.target,
    changeOrigin: true,
    pathRewrite: (path) => `/media${path}`,
    on: {
        error(err, req, res) {
            console.error('[MEDIA] Proxy error:', err.message);
            res.status(502).json({ error: 'Media service error', message: err.message });
        }
    }
}));

// ============================================================
// PUBLIC TARGET ROUTES  (circuit-breaker, no auth required)
// ============================================================
app.get('/api/targets', cbProxy(targetBreaker, req => {
    const qs = new URLSearchParams(req.query).toString();
    return `${URLS.target}/targets${qs ? '?' + qs : ''}`;
}));

app.get('/api/targets/:id', cbProxy(targetBreaker, req =>
    `${URLS.target}/targets/${req.params.id}`
));

// ============================================================
// JWT VERIFICATION — all /api/* routes below require a valid token
// ============================================================
app.use('/api', verifyTokenFromHeader());

// ============================================================
// UPLOAD  (streaming proxy — handles multipart/form-data)
// ============================================================
app.post('/api/uploads',
    requirePermission('upload:submission'),
    createProxyMiddleware({
        target: URLS.target,
        changeOrigin: true,
        pathRewrite: { '^/api/uploads': '/uploads' },
        on: {
            proxyReq: forwardUserHeaders,
            error(err, req, res) {
                console.error('[UPLOADS] Proxy error:', err.message);
                res.status(502).json({ error: 'Upload service error', message: err.message });
            }
        }
    })
);

// ============================================================
// TARGET SERVICE — protected routes (circuit-breaker)
// ============================================================

// Create target
app.post('/api/targets',
    requireTargetOwner,
    cbProxy(targetBreaker, () => `${URLS.target}/targets`)
);

// Edit target
app.put('/api/targets/:id',
    requireTargetOwner,
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}`)
);

// Delete target
app.delete('/api/targets/:id',
    requireTargetOwner,
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}`)
);

// Owner deletes a participant's submission on their target
app.delete('/api/targets/:id/submissions/:submissionId',
    requireTargetOwner,
    cbProxy(targetBreaker, req =>
        `${URLS.target}/targets/${req.params.id}/submissions/${req.params.submissionId}`
    )
);

// Submit photo
app.post('/api/targets/:id/submit',
    requireParticipant,
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}/submit`)
);

// View own submission
app.get('/api/targets/:id/my-submission',
    requirePermission('view:own_submission'),
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}/my-submission`)
);

// Delete own submission
app.delete('/api/targets/:id/my-submission',
    requirePermission('delete:own_submission'),
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}/my-submission`)
);

// Rate target (thumbs up/down)
app.post('/api/targets/:id/rate',
    requireParticipant,
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}/rate`)
);

// View all scores for an owned target
app.get('/api/targets/:id/scores',
    requirePermission('view:target_scores'),
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}/scores`)
);

// Finalize target
app.post('/api/targets/:id/finalize',
    requirePermission('manage:target_deadline'),
    cbProxy(targetBreaker, req => `${URLS.target}/targets/${req.params.id}/finalize`)
);

// ============================================================
// SCORE SERVICE — leaderboard (circuit-breaker)
// ============================================================
app.get('/api/scores/targets/:targetId/leaderboard',
    requirePermission('view:target_scores'),
    cbProxy(scoreBreaker, req =>
        `${URLS.score}/scores/targets/${req.params.targetId}/leaderboard`
    )
);

// ============================================================
// REGISTER SERVICE — enrollment (circuit-breaker)
// ============================================================

// Enroll in target
app.post('/api/register/:targetId',
    requireParticipant,
    cbProxy(registerBreaker, req => `${URLS.register}/register/target/${req.params.targetId}`)
);

// Withdraw from target
app.delete('/api/register/:targetId',
    requireParticipant,
    cbProxy(registerBreaker, req => `${URLS.register}/register/target/${req.params.targetId}`)
);

// Check enrollment status
app.get('/api/register/:targetId/my-enrollment',
    requireParticipant,
    cbProxy(registerBreaker, req =>
        `${URLS.register}/register/target/${req.params.targetId}/my-enrollment`
    )
);

// ============================================================
// Global error handler
// ============================================================
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
║   Circuit breakers: ENABLED            ║
╚════════════════════════════════════════╝
    `);
});

// ============================================================
// Helpers
// ============================================================

/** Re-attach parsed body + forward identity & internal-secret headers for proxy routes. */
function forwardUserHeaders(proxyReq, req) {
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

    const internalSecret = String(process.env.INTERNAL_SERVICE_SECRET || '').trim();
    if (internalSecret) proxyReq.setHeader('X-Internal-Auth', internalSecret);

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const shouldRewriteBody = Boolean(req.body) &&
        Object.keys(req.body).length > 0 &&
        contentType.includes('application/json');

    if (shouldRewriteBody) {
        fixRequestBody(proxyReq, req);
    }
}