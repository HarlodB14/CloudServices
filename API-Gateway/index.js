require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const PORT = process.env.PORT || 3000;




app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

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