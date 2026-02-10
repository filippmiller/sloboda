/**
 * Parse video URLs and extract embed information.
 * Supports YouTube, Vimeo, and RuTube.
 */

const VIDEO_PATTERNS = [
    // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
    {
        provider: 'youtube',
        patterns: [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
        ],
        embedUrl: (id) => `https://www.youtube.com/embed/${id}`,
        thumbnailUrl: (id) => `https://img.youtube.com/vi/${id}/mqdefault.jpg`
    },
    // Vimeo: vimeo.com/ID, player.vimeo.com/video/ID
    {
        provider: 'vimeo',
        patterns: [
            /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/
        ],
        embedUrl: (id) => `https://player.vimeo.com/video/${id}`,
        thumbnailUrl: () => null
    },
    // RuTube: rutube.ru/video/ID
    {
        provider: 'rutube',
        patterns: [
            /rutube\.ru\/video\/([a-f0-9]{32})/
        ],
        embedUrl: (id) => `https://rutube.ru/play/embed/${id}`,
        thumbnailUrl: () => null
    }
];

function parseVideoUrl(url) {
    if (!url || typeof url !== 'string') return null;

    const trimmed = url.trim();

    for (const config of VIDEO_PATTERNS) {
        for (const pattern of config.patterns) {
            const match = trimmed.match(pattern);
            if (match) {
                const videoId = match[1];
                return {
                    provider: config.provider,
                    videoId,
                    embedUrl: config.embedUrl(videoId),
                    thumbnailUrl: config.thumbnailUrl(videoId),
                    originalUrl: trimmed
                };
            }
        }
    }

    return null;
}

function isVideoUrl(url) {
    return parseVideoUrl(url) !== null;
}

module.exports = { parseVideoUrl, isVideoUrl };
