const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types
const ALLOWED_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
];

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const uniqueName = `${crypto.randomUUID()}${ext}`;
        cb(null, uniqueName);
    }
});

function fileFilter(req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: jpeg, jpg, png, webp, gif, pdf, doc, docx, txt`), false);
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE
    }
});

function assertImageMagic(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(12);
        fs.readSync(fd, buf, 0, 12, 0);
        fs.closeSync(fd);
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        const isGif = buf.slice(0, 3).toString('ascii') === 'GIF';
        const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
        return isJpeg || isPng || isGif || isWebp;
    } catch (err) {
        return false;
    }
}

module.exports = {
    upload,
    UPLOAD_DIR,
    assertImageMagic
};
