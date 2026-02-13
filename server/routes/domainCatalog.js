const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DOMAINS_DIR = path.join(__dirname, '..', '..', 'docs', 'domains');
const MASTER_INDEX = path.join(__dirname, '..', '..', 'docs', '05-SETTLEMENT-DOMAINS.md');

// Domain metadata (order, names, icons, categories)
const DOMAIN_META = [
    { code: 'GEN', num: 1, name: 'Территория и генеральный план', icon: 'map', category: 'infrastructure' },
    { code: 'DOM', num: 2, name: 'Жилищное строительство и домокомплекты', icon: 'home', category: 'construction' },
    { code: 'PRO', num: 3, name: 'Промышленная зона и производство', icon: 'factory', category: 'construction' },
    { code: 'ENR', num: 4, name: 'Энергетика и отопление', icon: 'zap', category: 'infrastructure' },
    { code: 'VOD', num: 5, name: 'Водоснабжение и канализация', icon: 'droplets', category: 'infrastructure' },
    { code: 'RAS', num: 6, name: 'Сельское хозяйство: растениеводство', icon: 'sprout', category: 'agriculture' },
    { code: 'ZHV', num: 7, name: 'Сельское хозяйство: животноводство', icon: 'beef', category: 'agriculture' },
    { code: 'HRP', num: 8, name: 'Хранение и переработка продуктов', icon: 'warehouse', category: 'agriculture' },
    { code: 'TRL', num: 9, name: 'Транспорт, дороги и логистика', icon: 'truck', category: 'infrastructure' },
    { code: 'OBR', num: 10, name: 'Образование и воспитание', icon: 'graduation-cap', category: 'social' },
    { code: 'MED', num: 11, name: 'Здравоохранение и медицина', icon: 'heart-pulse', category: 'social' },
    { code: 'SOC', num: 12, name: 'Социальная инфраструктура и досуг', icon: 'users', category: 'social' },
    { code: 'OTH', num: 13, name: 'Управление отходами и переработка', icon: 'recycle', category: 'infrastructure' },
    { code: 'POZ', num: 14, name: 'Пожарная безопасность и ЧС', icon: 'flame', category: 'safety' },
    { code: 'ITS', num: 15, name: 'IT, связь и документооборот', icon: 'wifi', category: 'management' },
    { code: 'EKO', num: 16, name: 'Экономика и финансовое планирование', icon: 'coins', category: 'management' },
    { code: 'NOR', num: 17, name: 'Нормативно-правовая база', icon: 'scale', category: 'management' },
    { code: 'UPR', num: 18, name: 'Управление поселением и кадры', icon: 'building-2', category: 'management' },
    { code: 'ETA', num: 19, name: 'Этапность строительства (дорожная карта)', icon: 'milestone', category: 'planning' },
    { code: 'RSK', num: 20, name: 'Управление рисками', icon: 'shield-alert', category: 'planning' },
    { code: 'SET', num: 21, name: 'Сеть поселений: межпоселковое взаимодействие', icon: 'network', category: 'planning' },
];

const CATEGORY_LABELS = {
    infrastructure: 'Инфраструктура',
    construction: 'Строительство',
    agriculture: 'Сельское хозяйство',
    social: 'Социальная сфера',
    safety: 'Безопасность',
    management: 'Управление',
    planning: 'Планирование',
};

/**
 * Parse a domain README.md and extract structure
 */
function parseDomainReadme(code) {
    const filePath = path.join(DOMAINS_DIR, code, 'README.md');
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Extract metadata from header
    let version = '1.0';
    let date = '';
    let status = '';
    let scale = '';

    for (let i = 0; i < Math.min(15, lines.length); i++) {
        const line = lines[i];
        if (line.startsWith('**Версия**:')) version = line.replace('**Версия**:', '').trim();
        if (line.startsWith('**Дата**:')) date = line.replace('**Дата**:', '').trim();
        if (line.startsWith('**Статус**:')) status = line.replace('**Статус**:', '').trim();
        if (line.startsWith('**Масштаб**:') || line.startsWith('**Базовый масштаб**:')) {
            scale = line.replace(/\*\*(Масштаб|Базовый масштаб)\*\*:/, '').trim();
        }
    }

    // Extract experts from table
    const experts = [];
    let inExpertTable = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('УЧАСТНИКИ') || line.includes('МЕТОДОЛОГИЯ') || line.includes('ПАНЕЛЬ ЭКСПЕРТОВ')) {
            inExpertTable = true;
            continue;
        }
        if (inExpertTable && line.startsWith('|') && !line.includes('---') && !line.includes('Роль') && !line.includes('Специалист') && !line.includes('#')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 2) {
                const name = cells.find(c => c.startsWith('**'))?.replace(/\*\*/g, '') || cells[1]?.replace(/\*\*/g, '');
                if (name && name.length > 1) experts.push(name);
            }
        }
        if (inExpertTable && line.startsWith('---')) {
            if (experts.length > 0) inExpertTable = false;
        }
    }

    // Extract sections (## headers) and subsections (### headers)
    const sections = [];
    let currentSection = null;

    for (const line of lines) {
        // Top-level sections (## but not # or ###)
        if (/^## /.test(line) && !/^### /.test(line)) {
            const title = line.replace(/^## /, '').trim();
            // Skip meta sections and iteration headings
            if (title === 'УЧАСТНИКИ МОЗГОВОГО ШТУРМА' || title === 'МЕТОДОЛОГИЯ' ||
                title === 'ОГЛАВЛЕНИЕ' || title === 'СОДЕРЖАНИЕ' ||
                title === 'ПАНЕЛЬ ЭКСПЕРТОВ' || title === 'УЧАСТНИКИ ЭКСПЕРТНОЙ ПРОРАБОТКИ' ||
                title === 'РЕЗУЛЬТАТЫ МОЗГОВОГО ШТУРМА' || title === 'КЛЮЧЕВЫЕ ДОПУЩЕНИЯ' ||
                /^ИТЕРАЦИЯ \d/i.test(title)) continue;

            currentSection = {
                title,
                subsections: [],
            };
            sections.push(currentSection);
        }
        // Subsections (### headers)
        if (/^### /.test(line) && currentSection) {
            const subtitle = line.replace(/^### /, '').trim();
            // Skip iteration headings in detailed docs
            if (/^Итерация \d/.test(subtitle)) continue;
            currentSection.subsections.push(subtitle);
        }
    }

    // Count artifacts
    let artifactCount = 0;
    const artifactTypes = { plan: 0, calc: 0, spec: 0, method: 0, research: 0 };
    for (const line of lines) {
        if (line.includes('📐')) { artifactCount++; artifactTypes.plan++; }
        if (line.includes('📊')) { artifactCount++; artifactTypes.calc++; }
        if (line.includes('📋')) { artifactCount++; artifactTypes.spec++; }
        if (line.includes('📖')) { artifactCount++; artifactTypes.method++; }
        if (line.includes('🔍')) { artifactCount++; artifactTypes.research++; }
    }

    return {
        code,
        version,
        date,
        status,
        scale,
        lineCount,
        experts: experts.slice(0, 5),
        expertCount: Math.max(experts.length, 5),
        sections,
        sectionCount: sections.length,
        subsectionCount: sections.reduce((sum, s) => sum + s.subsections.length, 0),
        artifactCount,
        artifactTypes,
    };
}

/**
 * GET /api/admin/domains
 * Returns all domains with structure
 */
router.get('/domains', requireAuth, (req, res) => {
    try {
        const domains = DOMAIN_META.map(meta => {
            const parsed = parseDomainReadme(meta.code);
            return {
                ...meta,
                ...(parsed || {
                    lineCount: 0,
                    version: '-',
                    date: '-',
                    status: 'Не создан',
                    scale: '-',
                    experts: [],
                    expertCount: 0,
                    sections: [],
                    sectionCount: 0,
                    subsectionCount: 0,
                    artifactCount: 0,
                    artifactTypes: { plan: 0, calc: 0, spec: 0, method: 0, research: 0 },
                }),
            };
        });

        const totalLines = domains.reduce((sum, d) => sum + d.lineCount, 0);
        const totalSections = domains.reduce((sum, d) => sum + d.sectionCount, 0);
        const totalSubsections = domains.reduce((sum, d) => sum + d.subsectionCount, 0);
        const totalArtifacts = domains.reduce((sum, d) => sum + d.artifactCount, 0);

        res.json({
            success: true,
            data: {
                domains,
                stats: {
                    domainCount: domains.length,
                    totalLines,
                    totalSections,
                    totalSubsections,
                    totalArtifacts,
                    categories: CATEGORY_LABELS,
                },
            },
        });
    } catch (error) {
        console.error('Domain catalog error:', error);
        res.status(500).json({ success: false, error: 'Failed to load domain catalog' });
    }
});

/**
 * GET /api/admin/domains/:code
 * Returns full content of a single domain as markdown
 */
router.get('/domains/:code', requireAuth, (req, res) => {
    const { code } = req.params;
    const meta = DOMAIN_META.find(d => d.code === code.toUpperCase());
    if (!meta) return res.status(404).json({ success: false, error: 'Domain not found' });

    const filePath = path.join(DOMAINS_DIR, meta.code, 'README.md');
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Domain file not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseDomainReadme(meta.code);

    res.json({
        success: true,
        data: {
            ...meta,
            ...parsed,
            content,
        },
    });
});

module.exports = { router, DOMAIN_META, CATEGORY_LABELS };
