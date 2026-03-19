const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const IMAGE_FETCH_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS || 10000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
const TARGET_ASSET_BASE_URL = process.env.TARGET_ASSET_BASE_URL || '';
const INTERNAL_MEDIA_FETCH_BASE_URL = process.env.INTERNAL_MEDIA_FETCH_BASE_URL || '';

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').replace(/\/$/, '');
}

function maybeRewriteLoopbackMediaUrl(urlValue) {
    if (!INTERNAL_MEDIA_FETCH_BASE_URL) {
        return urlValue;
    }

    try {
        const parsed = new URL(urlValue);
        const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
        const isLoopback = loopbackHosts.has(String(parsed.hostname || '').toLowerCase());
        const isMediaPath = String(parsed.pathname || '').startsWith('/media/');

        if (!isLoopback || !isMediaPath) {
            return urlValue;
        }

        const internalBase = normalizeBaseUrl(INTERNAL_MEDIA_FETCH_BASE_URL);
        if (!internalBase) {
            return urlValue;
        }

        return `${internalBase}${parsed.pathname}${parsed.search || ''}`;
    } catch (error) {
        return urlValue;
    }
}

function resolveImageUrl(imageUrl, req) {
    const value = String(imageUrl || '').trim();

    if (!value) {
        throw new Error('imageUrl is required');
    }

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    if (value.startsWith('/media/') || value.startsWith('media/')) {
        const baseFromEnv = normalizeBaseUrl(TARGET_ASSET_BASE_URL);
        const baseFromReq = req ? `${req.protocol}://${req.get('host')}` : '';
        const base = baseFromEnv || normalizeBaseUrl(baseFromReq);
        const normalizedPath = value.startsWith('/') ? value : `/${value}`;

        if (!base) {
            throw new Error('Cannot resolve relative media URL without TARGET_ASSET_BASE_URL');
        }

        return `${base}${normalizedPath}`;
    }

    return value;
}

function parseBase64Image(base64Input) {
    const input = String(base64Input || '').trim();
    if (!input) {
        throw new Error('imageBase64 is required');
    }

    const match = input.match(/^data:(.+?);base64,(.+)$/);

    if (match) {
        return {
            mimeType: match[1],
            buffer: Buffer.from(match[2], 'base64')
        };
    }

    return {
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(input, 'base64')
    };
}

function extensionFromMimeType(mimeType = '') {
    const normalized = String(mimeType).toLowerCase();

    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';

    return 'bin';
}

function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function fetchImageBuffer(imageUrl, req) {
    const resolvedUrl = maybeRewriteLoopbackMediaUrl(resolveImageUrl(imageUrl, req));

    const response = await axios.get(resolvedUrl, {
        responseType: 'arraybuffer',
        timeout: IMAGE_FETCH_TIMEOUT_MS,
        maxContentLength: 20 * 1024 * 1024
    });

    const mimeType = response.headers['content-type'] || 'application/octet-stream';
    return {
        resolvedUrl,
        mimeType,
        buffer: Buffer.from(response.data)
    };
}

async function computeImageHashFromUrl(imageUrl, req) {
    const { resolvedUrl, buffer } = await fetchImageBuffer(imageUrl, req);

    return {
        resolvedUrl,
        imageHash: hashBuffer(buffer)
    };
}

async function saveUploadedImage({ buffer, mimeType, req }) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const extension = extensionFromMimeType(mimeType);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const absolutePath = path.join(UPLOAD_DIR, uniqueName);

    await fs.writeFile(absolutePath, buffer);

    const mediaPath = `/media/${uniqueName}`;
    const baseFromEnv = normalizeBaseUrl(process.env.PUBLIC_MEDIA_BASE_URL || TARGET_ASSET_BASE_URL);
    const baseFromReq = req ? `${req.protocol}://${req.get('host')}` : '';
    const base = baseFromEnv || normalizeBaseUrl(baseFromReq);

    return {
        mediaPath,
        imageUrl: base ? `${base}${mediaPath}` : mediaPath,
        imageHash: hashBuffer(buffer),
        size: buffer.length
    };
}

module.exports = {
    parseBase64Image,
    fetchImageBuffer,
    computeImageHashFromUrl,
    saveUploadedImage,
    resolveImageUrl,
    hashBuffer,
    UPLOAD_DIR
};