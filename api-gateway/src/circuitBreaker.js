'use strict';

const CircuitBreaker = require('opossum');

/**
 * Default circuit-breaker options — all tuneable via environment variables.
 *
 *  CB_TIMEOUT            ms before a single call is considered timed-out  (default 5000)
 *  CB_ERROR_THRESHOLD    % of failures needed to OPEN the circuit          (default 50)
 *  CB_RESET_TIMEOUT      ms to wait before moving to HALF-OPEN             (default 10000)
 *  CB_VOLUME_THRESHOLD   minimum calls in a rolling window before %        (default 5)
 */
const defaults = {
    timeout: parseInt(process.env.CB_TIMEOUT || '5000', 10),
    errorThresholdPercentage: parseInt(process.env.CB_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT || '10000', 10),
    volumeThreshold: parseInt(process.env.CB_VOLUME_THRESHOLD || '5', 10),
};

/**
 * Create a named CircuitBreaker wrapping an async function.
 * Logs all lifecycle state transitions so they are visible in Docker logs.
 *
 * States:
 *  CLOSED    — normal operation
 *  OPEN      — failures exceeded threshold; calls are rejected immediately
 *  HALF-OPEN — one probe call is allowed; success → CLOSED, failure → OPEN again
 *
 * @param {Function} asyncFn   The async function to protect.
 * @param {string}   name      Human-readable name for logging.
 * @param {object}   overrides Optional per-breaker option overrides.
 * @returns {CircuitBreaker}
 */
function makeBreaker(asyncFn, name, overrides = {}) {
    const options = {...defaults, ...overrides, name };
    const breaker = new CircuitBreaker(asyncFn, options);

    breaker.on('open', () => console.warn(`[CB:${name}] ⚡ OPEN     — threshold reached, calls are being rejected`));
    breaker.on('halfOpen', () => console.log(`[CB:${name}] 🔄 HALF-OPEN — probing with the next request`));
    breaker.on('close', () => console.log(`[CB:${name}] ✅ CLOSED   — service recovered, normal traffic resumed`));
    breaker.on('timeout', () => console.warn(`[CB:${name}] ⏱  Timed out after ${options.timeout}ms`));
    breaker.on('reject', () => console.warn(`[CB:${name}] ✋ Rejected  — circuit is OPEN`));
    breaker.on('failure', (err) => console.error(`[CB:${name}] ✘  Failure  — ${err.message}`));
    breaker.on('success', () => console.log(`[CB:${name}] ✔  Success`));

    return breaker;
}

module.exports = { makeBreaker, defaults };