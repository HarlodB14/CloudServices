'use strict';

const axios = require('axios');
const axiosRetry = require('axios-retry');
const { makeBreaker } = require('./circuitBreaker');

// ---------------------------------------------------------------------------
// Retry configuration
// Only retry on network errors (connection refused, DNS failure, etc.).
// We intentionally do NOT retry on HTTP 4xx/5xx to avoid duplicate side-effects
// for non-idempotent operations (POST/PUT/DELETE).
// ---------------------------------------------------------------------------
const retryFn = axiosRetry.default || axiosRetry;
retryFn(axios, {
    retries: parseInt(process.env.CB_RETRIES || '2', 10),
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) => axiosRetry.isNetworkError(err),
    onRetry: (retryCount, err, config) =>
        console.warn(`[RETRY #${retryCount}] ${config.url} — ${err.message}`),
});

// ---------------------------------------------------------------------------
// Core HTTP callable — this is the function wrapped by opossum.
// validateStatus: () => true  ensures axios never throws on 4xx/5xx so that
// opossum only counts genuine network errors as failures.
// ---------------------------------------------------------------------------
async function callService({ method, url, data, headers }) {
    const response = await axios({
        method,
        url,
        data,
        headers,
        validateStatus: () => true,
    });
    return response;
}

// ---------------------------------------------------------------------------
// Fallback factory — returned when a circuit is OPEN.
// Produces a response object shaped like an axios response so cbProxy
// can treat it uniformly.
// ---------------------------------------------------------------------------
function makeFallback(serviceName) {
    return () => ({
        status: 503,
        data: {
            error: 'Service Unavailable',
            message: `${serviceName} is temporarily unavailable. The circuit breaker is open — please try again shortly.`,
            circuit: 'open',
        },
    });
}

// ---------------------------------------------------------------------------
// One circuit breaker per downstream service
// ---------------------------------------------------------------------------
const targetBreaker = makeBreaker(callService, 'target-service');
const registerBreaker = makeBreaker(callService, 'register-service');
const scoreBreaker = makeBreaker(callService, 'score-service');
const authBreaker = makeBreaker(callService, 'auth-service');

targetBreaker.fallback(makeFallback('Target Service'));
registerBreaker.fallback(makeFallback('Register Service'));
scoreBreaker.fallback(makeFallback('Score Service'));
authBreaker.fallback(makeFallback('Auth Service'));

// ---------------------------------------------------------------------------
// Header builder
// Reads the authenticated user from req.user (populated by verifyTokenFromHeader)
// and forwards identity + internal secret headers to the downstream service.
// Safe to call even when req.user is absent (public routes).
// ---------------------------------------------------------------------------
function buildHeaders(req) {
    const headers = { 'Content-Type': 'application/json' };

    const user = req.user || {};
    const userId = user.userId || user.id;
    const email = user.email || user.userEmail;
    const name = user.name || user.userName;
    const roles = user.roles || user.userRoles || [];
    const perms = user.permissions || user.userPermissions || [];

    if (userId) headers['X-User-Id'] = userId;
    if (email) headers['X-User-Email'] = email;
    if (name) headers['X-User-Name'] = name;
    headers['X-User-Roles'] = roles.join(',');
    headers['X-User-Permissions'] = perms.join(',');

    const secret = String(process.env.INTERNAL_SERVICE_SECRET || '').trim();
    if (secret) headers['X-Internal-Auth'] = secret;

    return headers;
}

// ---------------------------------------------------------------------------
// cbProxy — Express middleware factory
//
// Usage:
//   app.get('/api/targets', cbProxy(targetBreaker, req => `${URLS.target}/targets`));
//
// The buildUrl function receives the full req object so it can read
// req.params, req.query, etc.
//
// The circuit breaker's fallback (503 + circuit:open) is returned transparently
// without throwing, so normal error handling in the caller still works.
// ---------------------------------------------------------------------------
function cbProxy(breaker, buildUrl) {
    return async(req, res) => {
        try {
            const url = buildUrl(req);
            // Only attach a body for methods that carry one
            const data = req.body && Object.keys(req.body).length > 0 ? req.body : undefined;

            const result = await breaker.fire({
                method: req.method.toLowerCase(),
                url,
                data,
                headers: buildHeaders(req),
            });

            return res.status(result.status).json(result.data);
        } catch (err) {
            // Reaches here only if the fallback itself throws (should not happen)
            console.error(`[CB] Unhandled error: ${err.message}`);
            return res.status(503).json({ error: 'Service unavailable', message: err.message });
        }
    };
}

// ---------------------------------------------------------------------------
// Service base URLs (same as existing gateway env config)
// ---------------------------------------------------------------------------
const URLS = {
    target: process.env.TARGET_SERVICE_URL || 'http://target-service:3002',
    register: process.env.REGISTER_SERVICE_URL || 'http://register-service:3003',
    score: process.env.SCORE_SERVICE_URL || 'http://score-service:3004',
    auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
};

module.exports = {
    targetBreaker,
    registerBreaker,
    scoreBreaker,
    authBreaker,
    cbProxy,
    buildHeaders,
    URLS,
};