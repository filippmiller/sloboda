const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

let s3Client = null;

function getConfig() {
    return {
        endpoint: process.env.S3_ENDPOINT,
        accessKey: process.env.S3_ACCESS_KEY,
        secretKey: process.env.S3_SECRET_KEY,
        bucket: process.env.S3_BUCKET || 'sloboda-avatars',
        region: process.env.S3_REGION || 'us-east-1',
        publicUrl: process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT
    };
}

function isConfigured() {
    const { endpoint, accessKey, secretKey } = getConfig();
    return !!(endpoint && accessKey && secretKey);
}

function getClient() {
    if (s3Client) return s3Client;

    const config = getConfig();
    if (!isConfigured()) {
        throw new Error('S3 storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY environment variables.');
    }

    s3Client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey
        },
        forcePathStyle: true // Required for MinIO
    });

    return s3Client;
}

function getPublicUrl(key) {
    const config = getConfig();
    const base = config.publicUrl.replace(/\/$/, '');
    return `${base}/${config.bucket}/${key}`;
}

async function uploadFile(buffer, key, contentType) {
    const client = getClient();
    const config = getConfig();

    await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read'
    }));

    return {
        url: getPublicUrl(key),
        key
    };
}

async function deleteFile(key) {
    const client = getClient();
    const config = getConfig();

    await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key
    }));
}

function generateAvatarKey(originalFilename) {
    const ext = path.extname(originalFilename).toLowerCase() || '.jpg';
    return `avatars/${crypto.randomUUID()}${ext}`;
}

function extractKeyFromUrl(url) {
    const config = getConfig();
    const base = `${config.publicUrl.replace(/\/$/, '')}/${config.bucket}/`;
    if (url.startsWith(base)) {
        return url.substring(base.length);
    }
    // Fallback: extract everything after the bucket name
    const bucketPath = `/${config.bucket}/`;
    const idx = url.indexOf(bucketPath);
    if (idx !== -1) {
        return url.substring(idx + bucketPath.length);
    }
    return null;
}

async function healthCheck() {
    if (!isConfigured()) {
        return { status: 'not_configured', bucket: null };
    }

    try {
        const client = getClient();
        const config = getConfig();
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        return { status: 'healthy', bucket: config.bucket };
    } catch (err) {
        return { status: 'error', error: err.message };
    }
}

module.exports = {
    isConfigured,
    uploadFile,
    deleteFile,
    getPublicUrl,
    generateAvatarKey,
    extractKeyFromUrl,
    healthCheck
};
