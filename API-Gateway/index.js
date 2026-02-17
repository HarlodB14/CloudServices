require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(express.json());

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const PORT = process.env.PORT || 8080;

console.log('Auth Service URL:', AUTH_SERVICE_URL);

// Health
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.use(
    '/auth',
    createProxyMiddleware({
        target: AUTH_SERVICE_URL,
        changeOrigin: true,
    })
);

// Root
app.get('/', (req, res) => {
    res.send('API Gateway is running');
});

app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});