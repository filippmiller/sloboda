const multer = require('multer');

const FILE_MAX_SIZE = 20 * 1024 * 1024; // 20MB

const ALLOWED_FILE_TYPES = [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed'
];

const fileUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} is not allowed`), false);
        }
    },
    limits: {
        fileSize: FILE_MAX_SIZE
    }
});

module.exports = { fileUpload, FILE_MAX_SIZE, ALLOWED_FILE_TYPES };
