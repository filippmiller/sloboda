const multer = require('multer');

const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const avatarUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP images are allowed for avatars'), false);
        }
    },
    limits: {
        fileSize: AVATAR_MAX_SIZE
    }
});

module.exports = { avatarUpload };
