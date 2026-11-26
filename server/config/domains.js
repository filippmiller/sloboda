/**
 * Unified 21 Settlement Engineering Domains Catalog
 * Mirrors docs/05-SETTLEMENT-DOMAINS.md and docs/domains/*
 */
const SETTLEMENT_DOMAINS = [
    { code: 'GEN', name: 'Общие принципы и стратегия' },
    { code: 'DOM', name: 'Жильё и домостроение' },
    { code: 'EKO', name: 'Экология и продовольствие' },
    { code: 'ENR', name: 'Энергетика и тепло' },
    { code: 'VOD', name: 'Водоснабжение и водоотведение' },
    { code: 'MED', name: 'Медицина и здоровье' },
    { code: 'OBR', name: 'Образование и развитие' },
    { code: 'NOR', name: 'Право, уставы и нормативы' },
    { code: 'ETA', name: 'Этапы и календарный план' },
    { code: 'HRP', name: 'Хранение и переработка' },
    { code: 'ITS', name: 'ИТ, связь и автоматизация' },
    { code: 'POZ', name: 'Пожарная и общая безопасность' },
    { code: 'PRO', name: 'Производство и мастерские' },
    { code: 'RAS', name: 'Растениеводство и сады' },
    { code: 'RSK', name: 'Риски и устойчивость' },
    { code: 'SET', name: 'Сеть поселений и обмен' },
    { code: 'SOC', name: 'Сообщество и социальная среда' },
    { code: 'TRL', name: 'Транспорт и логистика' },
    { code: 'UPR', name: 'Управление и экономика' },
    { code: 'ZHV', name: 'Животноводство и корма' },
    { code: 'OTH', name: 'Прочие инженерные задачи' },
];

const VALID_DOMAIN_CODES = new Set(SETTLEMENT_DOMAINS.map((d) => d.code));

module.exports = {
    SETTLEMENT_DOMAINS,
    VALID_DOMAIN_CODES,
};
