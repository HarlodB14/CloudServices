require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { verifyToken, requireRole } = require('./middleware/photoPrestigeAuth');

const app = express();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const PORT = process.env.PORT || 3000;




app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Protected routes - REQUIRE VALID JWT
app.use('/api', verifyToken); // Verify token for all /api routes

// Example: Admin-only routes
app.use('/api/admin', requireRole(['admin']), createProxyMiddleware({
    target: process.env.ADMIN_SERVICE_URL || 'http://admin-service:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/admin': '/' },
    onProxyReq(proxyReq, req, res) {
        // Forward user info to microservice
        proxyReq.setHeader('X-User-Id', req.user.userId);
        proxyReq.setHeader('X-User-Roles', req.user.roles.join(','));
        console.log(`[PROXY-ADMIN] ${req.method} ${req.originalUrl}`);
    }
}));

// Example: User profile routes (authenticated users only)
app.use('/api/profile', requireRole(['user', 'admin']), createProxyMiddleware({
    target: process.env.USER_SERVICE_URL || 'http://user-service:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/profile': '/' },
    onProxyReq(proxyReq, req, res) {
        proxyReq.setHeader('X-User-Id', req.user.userId);
        proxyReq.setHeader('X-User-Roles', req.user.roles.join(','));
        console.log(`[PROXY-USER] ${req.method} ${req.originalUrl}`);
    }
}));

app.use('/auth', createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^': '/auth', // prepend /auth to the stripped path
    },
    timeout: 5000,
    proxyTimeout: 5000,
    onProxyReq(proxyReq, req, res) {
        console.log(`[PROXY] ${req.method} ${req.originalUrl} → ${AUTH_SERVICE_URL}${req.originalUrl}`);
    },
    onError(err, req, res) {
        console.error('Proxy error:', err.message);
        res.status(502).json({
            error: 'Bad Gateway',
            message: err.message
        });
    }
}));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gateway running on port ${PORT}`);
});