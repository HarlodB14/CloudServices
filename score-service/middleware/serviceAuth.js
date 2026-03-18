function requireServiceKey(req, res, next) {
    const expected = process.env.SCORE_SERVICE_API_KEY;

    if (!expected) {
        return next();
    }

    const provided = req.headers['x-service-key'];
    if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Invalid service authentication key' });
    }

    next();
}

module.exports = { requireServiceKey };