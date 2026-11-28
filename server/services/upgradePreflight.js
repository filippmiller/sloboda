/**
 * Sloboda Core Upgrade Preflight & DB-Wide Financial Reconciliation
 * Runs read-only schema classification and integrity checks across all Sloboda Core
 * tables in schema `public`. Works on clean exact-master (NOT_INSTALLED), partial/inconsistent
 * schemas (PARTIAL_OR_INCONSISTENT, fail-closed), and coherent R1/R2/R3/R4 schemas.
 */

const CORE_R1_TABLES = [
    'member_applications',
    'portfolio_items',
    'governance_proposals',
    'governance_voter_snapshots',
    'governance_ballots',
    'governance_voter_receipts',
    'governance_secret_ballots',
    'council_delegations',
    'contributions',
    'construction_milestones',
    'ledger_expenses',
    'expense_allocations',
    'ledger_postings',
];

const CORE_MIGRATION_VERSIONS = [
    '2026-11-26-sloboda-core',
    '2026-11-26-sloboda-core-r2',
    '2026-11-26-sloboda-core-r3',
    '2026-11-26-sloboda-core-r4',
];

/**
 * Complete versioned column contracts derived from R1-R4 migrations and runtime SQL callers.
 * typeMatch: canonical PG format_type(atttypid, atttypmod) prefix/exact matcher:
 *  - 'text_like': text | character varying(...)
 *  - 'integer': integer
 *  - 'bigint': bigint
 *  - 'boolean': boolean
 *  - 'jsonb': jsonb
 *  - 'numeric': numeric(...)
 *  - 'timestamp_any': timestamp without time zone | timestamp with time zone
 *  - 'timestamptz': timestamp with time zone (strictly distinguishes from timestamp without time zone)
 */
const R1_REQUIRED_COLUMNS = [
    // users (core membership extensions)
    { table: 'users', column: 'membership_status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'users', column: 'membership_admitted_at', type: 'timestamp_any', notNull: false },
    { table: 'users', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    // member_applications (all runtime-read/written fields including skills & motivation)
    { table: 'member_applications', column: 'id', type: 'integer', notNull: true },
    { table: 'member_applications', column: 'user_id', type: 'integer', notNull: false },
    { table: 'member_applications', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'member_applications', column: 'full_name', type: 'varchar_min', minLen: 200, notNull: true },
    { table: 'member_applications', column: 'email', type: 'varchar_min', minLen: 255, notNull: true },
    { table: 'member_applications', column: 'city', type: 'varchar_min', minLen: 120, notNull: false },
    { table: 'member_applications', column: 'primary_domain', type: 'varchar_min', minLen: 16, notNull: true },
    { table: 'member_applications', column: 'skills', type: 'text', notNull: false },
    { table: 'member_applications', column: 'motivation', type: 'text', notNull: false },
    { table: 'member_applications', column: 'trial_task_title', type: 'varchar_min', minLen: 255, notNull: false },
    { table: 'member_applications', column: 'trial_task_url', type: 'text', notNull: false },
    { table: 'member_applications', column: 'claim_token_hash', type: 'varchar_min', minLen: 64, notNull: false },
    { table: 'member_applications', column: 'claim_token_used_at', type: 'timestamp_any', notNull: false },
    { table: 'member_applications', column: 'status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'member_applications', column: 'version', type: 'integer', notNull: true },
    { table: 'member_applications', column: 'reviewer_id', type: 'integer', notNull: false },
    { table: 'member_applications', column: 'review_note', type: 'text', notNull: false },
    { table: 'member_applications', column: 'reviewed_at', type: 'timestamp_any', notNull: false },
    { table: 'member_applications', column: 'created_at', type: 'timestamp_any', notNull: true },
    { table: 'member_applications', column: 'updated_at', type: 'timestamp_any', notNull: true },
    // portfolio_items
    { table: 'portfolio_items', column: 'id', type: 'integer', notNull: true },
    { table: 'portfolio_items', column: 'user_id', type: 'integer', notNull: false },
    { table: 'portfolio_items', column: 'application_id', type: 'integer', notNull: true },
    { table: 'portfolio_items', column: 'title', type: 'varchar_min', minLen: 255, notNull: true },
    { table: 'portfolio_items', column: 'domain_code', type: 'varchar_min', minLen: 16, notNull: true },
    { table: 'portfolio_items', column: 'summary', type: 'text', notNull: false },
    { table: 'portfolio_items', column: 'artifact_url', type: 'text', notNull: false },
    { table: 'portfolio_items', column: 'verified', type: 'boolean', notNull: true },
    { table: 'portfolio_items', column: 'created_at', type: 'timestamp_any', notNull: true },
    // governance_proposals
    { table: 'governance_proposals', column: 'id', type: 'integer', notNull: true },
    { table: 'governance_proposals', column: 'title', type: 'varchar_min', minLen: 255, notNull: true },
    { table: 'governance_proposals', column: 'description', type: 'text', notNull: false },
    { table: 'governance_proposals', column: 'vote_type', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'governance_proposals', column: 'scope_level', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'governance_proposals', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'governance_proposals', column: 'authoritative_engine', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'governance_proposals', column: 'secret_ballot', type: 'boolean', notNull: true },
    { table: 'governance_proposals', column: 'seats_count', type: 'integer', notNull: true },
    { table: 'governance_proposals', column: 'options', type: 'jsonb', notNull: true },
    { table: 'governance_proposals', column: 'abstain_option_index', type: 'integer', notNull: false },
    { table: 'governance_proposals', column: 'status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'governance_proposals', column: 'quorum_members_pct', type: 'integer', notNull: true },
    { table: 'governance_proposals', column: 'quorum_capital_pct', type: 'integer', notNull: true },
    { table: 'governance_proposals', column: 'closes_at', type: 'timestamp_any', notNull: false },
    // governance_voter_snapshots
    { table: 'governance_voter_snapshots', column: 'id', type: 'integer', notNull: true },
    { table: 'governance_voter_snapshots', column: 'proposal_id', type: 'integer', notNull: true },
    { table: 'governance_voter_snapshots', column: 'user_id', type: 'integer', notNull: true },
    { table: 'governance_voter_snapshots', column: 'voter_label', type: 'varchar_min', minLen: 200, notNull: true },
    { table: 'governance_voter_snapshots', column: 'can_vote_member', type: 'boolean', notNull: true },
    { table: 'governance_voter_snapshots', column: 'member_weight', type: 'integer', notNull: true },
    { table: 'governance_voter_snapshots', column: 'can_vote_capital', type: 'boolean', notNull: true },
    { table: 'governance_voter_snapshots', column: 'capital_weight_kopecks', type: 'bigint', notNull: true },
    // governance_ballots
    { table: 'governance_ballots', column: 'id', type: 'integer', notNull: true },
    { table: 'governance_ballots', column: 'proposal_id', type: 'integer', notNull: true },
    { table: 'governance_ballots', column: 'snapshot_id', type: 'integer', notNull: true },
    { table: 'governance_ballots', column: 'user_id', type: 'integer', notNull: true },
    { table: 'governance_ballots', column: 'chamber', type: 'varchar_min', minLen: 16, notNull: true },
    { table: 'governance_ballots', column: 'option_index', type: 'integer', notNull: true },
    { table: 'governance_ballots', column: 'weight_applied', type: 'bigint', notNull: true },
    // governance_voter_receipts
    { table: 'governance_voter_receipts', column: 'id', type: 'integer', notNull: true },
    { table: 'governance_voter_receipts', column: 'proposal_id', type: 'integer', notNull: true },
    { table: 'governance_voter_receipts', column: 'user_id', type: 'integer', notNull: true },
    { table: 'governance_voter_receipts', column: 'chamber', type: 'varchar_min', minLen: 16, notNull: true },
    // governance_secret_ballots
    { table: 'governance_secret_ballots', column: 'id', type: 'integer', notNull: true },
    { table: 'governance_secret_ballots', column: 'proposal_id', type: 'integer', notNull: true },
    { table: 'governance_secret_ballots', column: 'chamber', type: 'varchar_min', minLen: 16, notNull: true },
    { table: 'governance_secret_ballots', column: 'option_index', type: 'integer', notNull: true },
    { table: 'governance_secret_ballots', column: 'weight_applied', type: 'bigint', notNull: true },
    { table: 'governance_secret_ballots', column: 'ballot_hash', type: 'varchar_min', minLen: 64, notNull: true },
    // council_delegations
    { table: 'council_delegations', column: 'id', type: 'integer', notNull: true },
    { table: 'council_delegations', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'council_delegations', column: 'delegate_user_id', type: 'integer', notNull: true },
    { table: 'council_delegations', column: 'level', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'council_delegations', column: 'active', type: 'boolean', notNull: true },
    // contributions
    { table: 'contributions', column: 'id', type: 'integer', notNull: true },
    { table: 'contributions', column: 'user_id', type: 'integer', notNull: false },
    { table: 'contributions', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'contributions', column: 'purpose', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'contributions', column: 'contributor_name', type: 'varchar_min', minLen: 200, notNull: true },
    { table: 'contributions', column: 'received_kopecks', type: 'bigint', notNull: true },
    { table: 'contributions', column: 'available_kopecks', type: 'bigint', notNull: true },
    { table: 'contributions', column: 'reserved_kopecks', type: 'bigint', notNull: true },
    { table: 'contributions', column: 'paid_kopecks', type: 'bigint', notNull: true },
    { table: 'contributions', column: 'refunded_kopecks', type: 'bigint', notNull: true },
    { table: 'contributions', column: 'share_class', type: 'varchar_min', minLen: 32, notNull: false },
    { table: 'contributions', column: 'terms_version', type: 'varchar_min', minLen: 32, notNull: false },
    { table: 'contributions', column: 'legal_right_type', type: 'varchar_min', minLen: 32, notNull: true },
    { table: 'contributions', column: 'status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'contributions', column: 'ledger_mode', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'contributions', column: 'payment_ref', type: 'varchar_min', minLen: 120, notNull: false },
    { table: 'contributions', column: 'idempotency_key', type: 'varchar_min', minLen: 128, notNull: false },
    { table: 'contributions', column: 'note', type: 'text', notNull: false },
    { table: 'contributions', column: 'verified_by', type: 'integer', notNull: false },
    { table: 'contributions', column: 'created_at', type: 'timestamp_any', notNull: true },
    // construction_milestones
    { table: 'construction_milestones', column: 'id', type: 'integer', notNull: true },
    { table: 'construction_milestones', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'construction_milestones', column: 'code', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'construction_milestones', column: 'title', type: 'varchar_min', minLen: 255, notNull: true },
    { table: 'construction_milestones', column: 'category', type: 'varchar_min', minLen: 48, notNull: true },
    { table: 'construction_milestones', column: 'unit', type: 'varchar_min', minLen: 32, notNull: true },
    { table: 'construction_milestones', column: 'planned_qty', type: 'numeric', notNull: true },
    { table: 'construction_milestones', column: 'actual_qty', type: 'numeric', notNull: true },
    { table: 'construction_milestones', column: 'budget_kopecks', type: 'bigint', notNull: true },
    { table: 'construction_milestones', column: 'status', type: 'varchar_min', minLen: 24, notNull: true },
    // ledger_expenses
    { table: 'ledger_expenses', column: 'id', type: 'integer', notNull: true },
    { table: 'ledger_expenses', column: 'settlement_id', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'ledger_expenses', column: 'purpose', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'ledger_expenses', column: 'title', type: 'varchar_min', minLen: 255, notNull: true },
    { table: 'ledger_expenses', column: 'category', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'ledger_expenses', column: 'amount_kopecks', type: 'bigint', notNull: true },
    { table: 'ledger_expenses', column: 'milestone_id', type: 'integer', notNull: false },
    { table: 'ledger_expenses', column: 'asset_name', type: 'varchar_min', minLen: 255, notNull: false },
    { table: 'ledger_expenses', column: 'asset_location', type: 'varchar_min', minLen: 255, notNull: false },
    { table: 'ledger_expenses', column: 'receipt_url', type: 'text', notNull: false },
    { table: 'ledger_expenses', column: 'photo_url', type: 'text', notNull: false },
    { table: 'ledger_expenses', column: 'allocation_rule', type: 'varchar_min', minLen: 32, notNull: true },
    { table: 'ledger_expenses', column: 'status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'ledger_expenses', column: 'idempotency_key', type: 'varchar_min', minLen: 128, notNull: false },
    { table: 'ledger_expenses', column: 'approved_by', type: 'integer', notNull: false },
    { table: 'ledger_expenses', column: 'paid_at', type: 'timestamp_any', notNull: false },
    { table: 'ledger_expenses', column: 'created_at', type: 'timestamp_any', notNull: true },
    // expense_allocations
    { table: 'expense_allocations', column: 'id', type: 'integer', notNull: true },
    { table: 'expense_allocations', column: 'expense_id', type: 'integer', notNull: true },
    { table: 'expense_allocations', column: 'contribution_id', type: 'integer', notNull: true },
    { table: 'expense_allocations', column: 'amount_kopecks', type: 'bigint', notNull: true },
    { table: 'expense_allocations', column: 'allocation_rule', type: 'varchar_min', minLen: 32, notNull: true },
    { table: 'expense_allocations', column: 'financing_share_label', type: 'varchar_min', minLen: 160, notNull: false },
    { table: 'expense_allocations', column: 'legal_right_type', type: 'varchar_min', minLen: 32, notNull: true },
    { table: 'expense_allocations', column: 'created_at', type: 'timestamp_any', notNull: true },
    // ledger_postings
    { table: 'ledger_postings', column: 'id', type: 'integer', notNull: true },
    { table: 'ledger_postings', column: 'posting_type', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'ledger_postings', column: 'contribution_id', type: 'integer', notNull: false },
    { table: 'ledger_postings', column: 'expense_id', type: 'integer', notNull: false },
    { table: 'ledger_postings', column: 'amount_kopecks', type: 'bigint', notNull: true },
    { table: 'ledger_postings', column: 'actor_admin_id', type: 'integer', notNull: false },
    { table: 'ledger_postings', column: 'note', type: 'text', notNull: false },
    { table: 'ledger_postings', column: 'created_at', type: 'timestamp_any', notNull: true },
];

const R2_REQUIRED_COLUMNS = [
    { table: 'contributions', column: 'request_fingerprint', type: 'varchar_min', minLen: 64, notNull: false },
    { table: 'ledger_expenses', column: 'request_fingerprint', type: 'varchar_min', minLen: 64, notNull: false },
    { table: 'ledger_expenses', column: 'financial_status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'ledger_expenses', column: 'dispute_status', type: 'varchar_min', minLen: 24, notNull: true },
    { table: 'ledger_expenses', column: 'version', type: 'integer', notNull: true },
    { table: 'governance_proposals', column: 'legacy_r1_unsupported', type: 'boolean', notNull: true },
    { table: 'governance_proposals', column: 'legacy_r1_disposition', type: 'varchar_min', minLen: 64, notNull: false },
    { table: 'governance_proposals', column: 'closes_at', type: 'timestamptz', notNull: false },
];

const R3_REQUIRED_COLUMNS = [
    { table: 'sloboda_core_gates', column: 'gate_key', type: 'varchar_min', minLen: 64, notNull: true },
    { table: 'sloboda_core_gates', column: 'is_blocked', type: 'boolean', notNull: true },
    { table: 'sloboda_core_gates', column: 'report_json', type: 'jsonb', notNull: true },
    { table: 'sloboda_core_gates', column: 'checked_at', type: 'timestamptz', notNull: true },
];

const R1_UNIQUE_CONTRACTS = [
    {
        id: 'contributions_idempotency_key_unique',
        table: 'contributions',
        columns: ['idempotency_key'],
        predicateKind: 'none',
        allowMultipleNulls: true,
        conflictArbiter: false,
    },
    {
        id: 'ledger_expenses_idempotency_key_unique',
        table: 'ledger_expenses',
        columns: ['idempotency_key'],
        predicateKind: 'none',
        allowMultipleNulls: true,
        conflictArbiter: false,
    },
    {
        id: 'construction_milestones_settlement_code_unique',
        table: 'construction_milestones',
        columns: ['settlement_id', 'code'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: true,
    },
    {
        id: 'governance_voter_snapshots_proposal_user_unique',
        table: 'governance_voter_snapshots',
        columns: ['proposal_id', 'user_id'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: false,
    },
    {
        id: 'governance_ballots_proposal_user_chamber_unique',
        table: 'governance_ballots',
        columns: ['proposal_id', 'user_id', 'chamber'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: true,
    },
    {
        id: 'governance_voter_receipts_proposal_user_chamber_unique',
        table: 'governance_voter_receipts',
        columns: ['proposal_id', 'user_id', 'chamber'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: false,
    },
];

const R2_UNIQUE_CONTRACTS = [
    {
        id: 'uq_member_applications_claim_token_hash',
        table: 'member_applications',
        columns: ['claim_token_hash'],
        predicateKind: 'claim_token_not_null',
        allowMultipleNulls: true,
        conflictArbiter: false,
    },
    {
        id: 'uq_member_applications_one_active_per_user_settlement',
        table: 'member_applications',
        columns: ['user_id', 'settlement_id'],
        predicateKind: 'active_member_application',
        allowMultipleNulls: false,
        conflictArbiter: false,
    },
    {
        id: 'uq_expense_allocations_expense_contribution',
        table: 'expense_allocations',
        columns: ['expense_id', 'contribution_id'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: false,
    },
    {
        id: 'uq_construction_milestones_settlement_id',
        table: 'construction_milestones',
        columns: ['settlement_id', 'id'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: false,
    },
];

const R3_UNIQUE_CONTRACTS = [
    {
        id: 'sloboda_core_gates_pkey',
        table: 'sloboda_core_gates',
        columns: ['gate_key'],
        predicateKind: 'none',
        allowMultipleNulls: false,
        conflictArbiter: true,
    },
];

const REQUIRED_ACTIVE_APPLICATION_STATUSES = [
    'accepted',
    'in_review',
    'pending',
    'revision_requested',
];

function matchesColumnType(formattedType, reqCol) {
    const t = String(formattedType || '').trim().toLowerCase();
    const expectedKind = reqCol.type;
    if (expectedKind === 'text') {
        return t === 'text' || t === 'character varying';
    }
    if (expectedKind === 'varchar_min') {
        if (t === 'text' || t === 'character varying') return true;
        const m = t.match(/^character varying\((\d+)\)$/);
        return Boolean(m && Number(m[1]) >= Number(reqCol.minLen || 1));
    }
    if (expectedKind === 'text_like') {
        return t === 'text' || t === 'character varying' || /^character varying\(\d+\)$/.test(t);
    }
    if (expectedKind === 'integer') return t === 'integer';
    if (expectedKind === 'bigint') return t === 'bigint';
    if (expectedKind === 'boolean') return t === 'boolean';
    if (expectedKind === 'jsonb') return t === 'jsonb';
    if (expectedKind === 'numeric') return t === 'numeric' || /^numeric\(\d+(?:,\d+)?\)$/.test(t);
    if (expectedKind === 'timestamp_any') {
        return t === 'timestamp without time zone' || t === 'timestamp with time zone';
    }
    if (expectedKind === 'timestamptz') {
        return t === 'timestamp with time zone';
    }
    return false;
}

function stripBalancedOuterParens(expr) {
    let s = String(expr || '').trim();
    while (s.startsWith('(') && s.endsWith(')')) {
        let depth = 0;
        let wrapsWhole = true;
        let inQuote = false;
        for (let i = 0; i < s.length; i += 1) {
            const ch = s[i];
            if (ch === "'") {
                if (inQuote && s[i + 1] === "'") {
                    i += 1;
                    continue;
                }
                inQuote = !inQuote;
                continue;
            }
            if (inQuote) continue;
            if (ch === '(') depth += 1;
            else if (ch === ')') {
                depth -= 1;
                if (depth === 0 && i < s.length - 1) {
                    wrapsWhole = false;
                    break;
                }
            }
        }
        if (!wrapsWhole) break;
        s = s.slice(1, -1).trim();
    }
    return s;
}

function splitTopLevelLogical(expr, keyword) {
    const s = stripBalancedOuterParens(expr);
    const parts = [];
    let depth = 0;
    let inQuote = false;
    let start = 0;
    const upper = s.toUpperCase();
    const token = ` ${keyword.toUpperCase()} `;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === "'") {
            if (inQuote && s[i + 1] === "'") {
                i += 1;
                continue;
            }
            inQuote = !inQuote;
            continue;
        }
        if (inQuote) continue;
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        else if (depth === 0 && upper.startsWith(token, i)) {
            parts.push(s.slice(start, i).trim());
            i += token.length - 1;
            start = i + 1;
        }
    }
    parts.push(s.slice(start).trim());
    return parts.map(stripBalancedOuterParens);
}

function collapseWsOutsideQuotes(expr) {
    let out = '';
    let inQuote = false;
    let prevSpace = false;
    const s = String(expr || '');
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === "'") {
            if (inQuote && s[i + 1] === "'") {
                out += "''";
                i += 1;
                prevSpace = false;
                continue;
            }
            inQuote = !inQuote;
            out += ch;
            prevSpace = false;
            continue;
        }
        if (inQuote) {
            out += ch;
            continue;
        }
        if (/\s/.test(ch)) {
            if (!prevSpace) {
                out += ' ';
                prevSpace = true;
            }
        } else {
            out += ch;
            prevSpace = false;
        }
    }
    return out.trim();
}

function matchesClaimTokenPredicate(predicateExpr) {
    if (predicateExpr === null || predicateExpr === undefined || String(predicateExpr).trim() === '') {
        return true;
    }
    const norm = stripBalancedOuterParens(collapseWsOutsideQuotes(predicateExpr));
    return /^claim_token_hash\s+IS\s+NOT\s+NULL$/i.test(norm);
}

function matchesActiveApplicationPredicate(predicateExpr) {
    if (!predicateExpr || String(predicateExpr).trim() === '') {
        return false;
    }
    const norm = collapseWsOutsideQuotes(predicateExpr);
    // Reject any top-level OR that could weaken the active-status predicate
    if (splitTopLevelLogical(norm, 'OR').length > 1) {
        return false;
    }
    const conjuncts = splitTopLevelLogical(norm, 'AND');
    if (conjuncts.length !== 2) {
        return false;
    }
    let hasUserNotNull = false;
    let hasExactActiveStatus = false;
    for (const part of conjuncts) {
        if (/^user_id\s+IS\s+NOT\s+NULL$/i.test(part)) {
            hasUserNotNull = true;
            continue;
        }
        // Match PG canonical deparsed form:
        // ((status)::text = ANY ((ARRAY['pending'::character varying, ...])::text[]))
        // or status = ANY (ARRAY['pending', ...])
        const anyMatch = part.match(
            /^(?:\(status\)|status)(?:::text)?\s*=\s*ANY\s*\(([\s\S]+)\)$/i
        );
        if (anyMatch) {
            let rhs = stripBalancedOuterParens(anyMatch[1]);
            rhs = rhs.replace(/::text\[\]$/i, '').trim();
            rhs = stripBalancedOuterParens(rhs);
            const arrMatch = rhs.match(/^ARRAY\[([^\]]+)\]$/i);
            const rawItems = arrMatch ? arrMatch[1].split(',').map((item) => item.trim()) : null;
            const parsedStatuses = [];
            let allValidLiterals = Boolean(rawItems && rawItems.length > 0);
            for (const item of rawItems || []) {
                const m = item.match(/^'([^']*)'(?:::(?:character varying|text))?$/i);
                if (!m) {
                    allValidLiterals = false;
                    break;
                }
                parsedStatuses.push(m[1]);
            }
            if (allValidLiterals) {
                const sorted = [...new Set(parsedStatuses)].sort();
                if (
                    sorted.length === REQUIRED_ACTIVE_APPLICATION_STATUSES.length
                    && parsedStatuses.length === REQUIRED_ACTIVE_APPLICATION_STATUSES.length
                    && sorted.every((val, idx) => val === REQUIRED_ACTIVE_APPLICATION_STATUSES[idx])
                ) {
                    hasExactActiveStatus = true;
                }
            }
        }
    }
    return hasUserNotNull && hasExactActiveStatus;
}

function matchesSafeR4AbstainCheck(defExpr, convalidated) {
    if (convalidated !== true) return false;
    const raw = collapseWsOutsideQuotes(defExpr);
    if (/\bNOT\s+VALID\b/i.test(raw)) return false;
    const checkMatch = raw.match(/^CHECK\s*\(([\s\S]+)\)$/i);
    if (!checkMatch) return false;
    const body = stripBalancedOuterParens(checkMatch[1]);
    const disjuncts = splitTopLevelLogical(body, 'OR');
    if (disjuncts.length !== 3) {
        return false;
    }
    let hasLegacyBypass = false;
    let hasAbstainNull = false;
    let hasBoundedCase = false;

    for (const d of disjuncts) {
        if (/^legacy_r1_unsupported\s*=\s*true$/i.test(d)) {
            hasLegacyBypass = true;
            continue;
        }
        if (/^abstain_option_index\s+IS\s+NULL$/i.test(d)) {
            hasAbstainNull = true;
            continue;
        }
        const bounds = splitTopLevelLogical(d, 'AND');
        if (bounds.length === 2) {
            let hasLower = false;
            let hasUpper = false;
            for (const b of bounds) {
                if (/^abstain_option_index\s*>=\s*0$/i.test(b)) {
                    hasLower = true;
                    continue;
                }
                const upperMatch = b.match(
                    /^abstain_option_index\s*<\s*CASE\s+WHEN\s+([\s\S]+?)\s+THEN\s+jsonb_array_length\(options\)\s+ELSE\s+0\s+END$/i
                );
                if (upperMatch) {
                    const whenConds = splitTopLevelLogical(upperMatch[1], 'AND');
                    const hasOptNotNull = whenConds.some((c) => /^options\s+IS\s+NOT\s+NULL$/i.test(c));
                    const hasTypeArray = whenConds.some((c) => /^jsonb_typeof\(options\)\s*=\s*'array'(?:::text)?$/i.test(c));
                    if (whenConds.length === 2 && hasOptNotNull && hasTypeArray) {
                        hasUpper = true;
                    }
                }
            }
            if (hasLower && hasUpper) {
                hasBoundedCase = true;
            }
        }
    }
    return hasLegacyBypass && hasAbstainNull && hasBoundedCase;
}

function columnsEqual(actualCols, expectedCols) {
    if (!Array.isArray(actualCols) || actualCols.length !== expectedCols.length) {
        return false;
    }
    for (let i = 0; i < expectedCols.length; i += 1) {
        if (actualCols[i] !== expectedCols[i]) return false;
    }
    return true;
}

function columnsEqualUnordered(actualCols, expectedCols) {
    if (!Array.isArray(actualCols) || actualCols.length !== expectedCols.length) {
        return false;
    }
    const a = [...actualCols].sort();
    const b = [...expectedCols].sort();
    for (let i = 0; i < b.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function evaluateUniqueContracts(contracts, allIndexes) {
    const missing = [];
    const violations = [];
    for (const contract of contracts) {
        const sameTargetIndexes = allIndexes.filter((idx) => (
            idx.table_name === contract.table
            && idx.indisunique === true
            && columnsEqual(idx.key_columns, contract.columns)
        ));

        const predicateMatches = (idx) => {
            if (contract.predicateKind === 'none') {
                return idx.predicate_expr === null || idx.predicate_expr === '';
            }
            if (contract.predicateKind === 'claim_token_not_null') {
                return matchesClaimTokenPredicate(idx.predicate_expr);
            }
            if (contract.predicateKind === 'active_member_application') {
                return matchesActiveApplicationPredicate(idx.predicate_expr);
            }
            return false;
        };

        const enforcing = sameTargetIndexes.filter((idx) => (
            idx.indisvalid === true
            && idx.indisready === true
            && idx.indislive === true
            && idx.indimmediate === true
            && (!contract.allowMultipleNulls || idx.indnullsnotdistinct !== true)
            && predicateMatches(idx)
        ));

        // PostgreSQL infers ON CONFLICT arbiters without regard to column order and rejects
        // deferrable unique indexes, so check ALL same-column-set indexes regardless of order.
        const hasDeferrableArbiter = contract.conflictArbiter && allIndexes.some((idx) => (
            idx.table_name === contract.table
            && idx.indisunique === true
            && idx.indimmediate === false
            && columnsEqualUnordered(idx.key_columns, contract.columns)
            && predicateMatches(idx)
        ));

        // If multiple NULLs must be allowed (e.g. optional idempotency_key / claim_token_hash),
        // reject if ANY companion unique index (full or partial) on the same columns enforces NULLS NOT DISTINCT.
        const hasNullsNotDistinctCompanion = contract.allowMultipleNulls && sameTargetIndexes.some((idx) => (
            idx.indisvalid === true
            && idx.indisready === true
            && idx.indislive === true
            && idx.indnullsnotdistinct === true
        ));

        if (enforcing.length === 0) {
            missing.push(contract.id);
            violations.push(`missing_or_invalid_unique_contract:${contract.id}`);
        } else if (hasNullsNotDistinctCompanion) {
            missing.push(contract.id);
            violations.push(`nulls_not_distinct_companion_present:${contract.id}`);
        } else if (hasDeferrableArbiter) {
            missing.push(contract.id);
            violations.push(`deferrable_conflict_arbiter_present:${contract.id}`);
        }
    }
    return { missing, violations };
}

async function getColumnSet(client, tableName) {
    const res = await client.query(
        `SELECT a.attname AS column_name
         FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = $1
           AND c.relkind IN ('r', 'p')
           AND a.attnum > 0
           AND NOT a.attisdropped`,
        [tableName]
    );
    return new Set(res.rows.map((r) => r.column_name));
}

async function getTableColumnCatalog(client, tableNames) {
    const res = await client.query(
        `SELECT c.relname::text AS table_name,
                a.attname::text AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
                a.attnotnull AS not_null,
                (
                    a.attidentity <> ''
                    OR (
                        a.atthasdef
                        AND pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) ~* '^nextval\\('
                    )
                ) AS has_sequence_default
         FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p')
           AND c.relname = ANY($1::text[])
           AND a.attnum > 0
           AND NOT a.attisdropped`,
        [tableNames]
    );
    const catalog = new Map();
    for (const row of res.rows) {
        if (!catalog.has(row.table_name)) {
            catalog.set(row.table_name, new Map());
        }
        catalog.get(row.table_name).set(row.column_name, {
            formatted_type: row.formatted_type,
            not_null: row.not_null === true,
            has_default: row.has_sequence_default === true,
        });
    }
    return catalog;
}

function evaluateColumnContracts(contracts, columnCatalog) {
    const missing = [];
    const violations = [];
    for (const reqCol of contracts) {
        const tableCols = columnCatalog.get(reqCol.table);
        const info = tableCols ? tableCols.get(reqCol.column) : null;
        if (!info) {
            missing.push(`${reqCol.table}.${reqCol.column}`);
            continue;
        }
        if (!matchesColumnType(info.formatted_type, reqCol)) {
            violations.push(
                `column_type_mismatch:${reqCol.table}.${reqCol.column}:expected_${reqCol.type}:got_${info.formatted_type}`
            );
        }
        if (Boolean(info.not_null) !== Boolean(reqCol.notNull)) {
            violations.push(
                `column_nullable_mismatch:${reqCol.table}.${reqCol.column}:expected_${reqCol.notNull ? 'not_null' : 'nullable'}`
            );
        }
        if (reqCol.column === 'id' && reqCol.type === 'integer' && !info.has_default) {
            violations.push(`column_missing_id_default:${reqCol.table}.id`);
        }
    }
    return { missing, violations };
}

async function inspectCoreSchemaState(client) {
    const allTrackedTables = [...CORE_R1_TABLES, 'sloboda_core_gates', 'schema_migrations'];
    // Use pg_catalog.pg_class instead of information_schema.tables so tables without SELECT
    // privilege on the connected role are still discovered (never misclassified as NOT_INSTALLED),
    // and check relkind so views/foreign tables cannot spoof real core tables.
    const tblRes = await client.query(
        `SELECT c.relname AS table_name,
                c.relkind AS relkind,
                has_table_privilege(c.oid, 'SELECT') AS can_select
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = ANY($1::text[])`,
        [allTrackedTables]
    );
    const nonTableRelations = tblRes.rows
        .filter((r) => r.relkind !== 'r' && r.relkind !== 'p')
        .map((r) => `${r.table_name}:${r.relkind}`)
        .sort();
    const realTableRows = tblRes.rows.filter((r) => r.relkind === 'r' || r.relkind === 'p');
    const presentSet = new Set(realTableRows.map((r) => r.table_name));
    const unreadableTables = realTableRows
        .filter((r) => r.can_select !== true)
        .map((r) => r.table_name)
        .sort();

    const presentCoreTables = CORE_R1_TABLES.filter((t) => presentSet.has(t));
    const missingCoreTables = CORE_R1_TABLES.filter((t) => !presentSet.has(t));
    const hasGatesTable = presentSet.has('sloboda_core_gates');
    const hasSchemaMigrationsTable = presentSet.has('schema_migrations');

    if (unreadableTables.length > 0) {
        return {
            schema_state: 'PARTIAL_OR_INCONSISTENT',
            present_tables: hasGatesTable ? [...presentCoreTables, 'sloboda_core_gates'] : presentCoreTables,
            missing_tables: missingCoreTables,
            has_gates_table: hasGatesTable,
            missing_columns: [],
            missing_indexes: [],
            applied_core_migrations: [],
            reasons: [`insufficient_select_privilege:${unreadableTables.join(',')}`],
        };
    }

    if (nonTableRelations.length > 0) {
        return {
            schema_state: 'PARTIAL_OR_INCONSISTENT',
            present_tables: hasGatesTable ? [...presentCoreTables, 'sloboda_core_gates'] : presentCoreTables,
            missing_tables: missingCoreTables,
            has_gates_table: hasGatesTable,
            missing_columns: [],
            missing_indexes: [],
            applied_core_migrations: [],
            reasons: [`invalid_relation_kind:${nonTableRelations.join(',')}`],
        };
    }

    let appliedCoreMigrations = [];
    if (hasSchemaMigrationsTable) {
        const migRes = await client.query(
            `SELECT version
             FROM public.schema_migrations
             WHERE version = ANY($1::text[])
             ORDER BY version ASC`,
            [CORE_MIGRATION_VERSIONS]
        );
        appliedCoreMigrations = migRes.rows.map((r) => r.version);
    }
    const migSet = new Set(appliedCoreMigrations);
    const hasM1 = migSet.has('2026-11-26-sloboda-core');
    const hasM2 = migSet.has('2026-11-26-sloboda-core-r2');
    const hasM3 = migSet.has('2026-11-26-sloboda-core-r3');
    const hasM4 = migSet.has('2026-11-26-sloboda-core-r4');

    const tablesForColumnScan = ['users', ...presentCoreTables, ...(hasGatesTable ? ['sloboda_core_gates'] : [])];
    const columnCatalog = await getTableColumnCatalog(client, tablesForColumnScan);

    const r1ColEval = evaluateColumnContracts(R1_REQUIRED_COLUMNS, columnCatalog);
    const r2ColEval = evaluateColumnContracts(R2_REQUIRED_COLUMNS, columnCatalog);
    const r3ColEval = evaluateColumnContracts(R3_REQUIRED_COLUMNS, columnCatalog);

    const r2OnlyColumnNames = R2_REQUIRED_COLUMNS.filter((c) => c.column !== 'closes_at');
    const presentR2OnlyCols = r2OnlyColumnNames.filter((reqCol) => {
        const tableCols = columnCatalog.get(reqCol.table);
        return Boolean(tableCols && tableCols.has(reqCol.column));
    });
    const hasAnyR2Columns = presentR2OnlyCols.length > 0;

    // Fetch ALL indexes on tracked core tables (do not pre-filter flags in SQL so deferrable
    // conflict arbiters and invalid/non-live/nulls-not-distinct indexes are visible).
    const idxTables = [...presentCoreTables, ...(hasGatesTable ? ['sloboda_core_gates'] : [])];
    let allIndexes = [];
    if (idxTables.length > 0) {
        const idxRes = await client.query(
            `SELECT t.relname::text AS table_name,
                    ic.relname::text AS index_name,
                    i.indisunique,
                    i.indisvalid,
                    i.indisready,
                    i.indislive,
                    i.indimmediate,
                    i.indnullsnotdistinct,
                    pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicate_expr,
                    (
                        SELECT ARRAY_AGG(
                            CASE WHEN k.attnum = 0 THEN '__expr__'::text ELSE a.attname::text END
                            ORDER BY k.ord
                        )
                        FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                        LEFT JOIN pg_catalog.pg_attribute a
                          ON a.attrelid = i.indrelid
                         AND a.attnum = k.attnum
                         AND NOT a.attisdropped
                        WHERE k.ord <= i.indnkeyatts
                    ) AS key_columns
             FROM pg_catalog.pg_index i
             JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
             JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
             JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
             WHERE n.nspname = 'public'
               AND t.relkind IN ('r', 'p')
               AND ic.relkind = 'i'
               AND t.relname = ANY($1::text[])`,
            [idxTables]
        );
        allIndexes = idxRes.rows.map((r) => ({
            table_name: r.table_name,
            index_name: r.index_name,
            indisunique: r.indisunique === true,
            indisvalid: r.indisvalid === true,
            indisready: r.indisready === true,
            indislive: r.indislive === true,
            indimmediate: r.indimmediate === true,
            indnullsnotdistinct: r.indnullsnotdistinct === true,
            predicate_expr: r.predicate_expr === null || r.predicate_expr === undefined ? null : String(r.predicate_expr),
            key_columns: Array.isArray(r.key_columns) ? r.key_columns : [],
        }));
    }

    const r1IdxEval = evaluateUniqueContracts(R1_UNIQUE_CONTRACTS, allIndexes);
    const r2IdxEval = evaluateUniqueContracts(R2_UNIQUE_CONTRACTS, allIndexes);
    const r3IdxEval = evaluateUniqueContracts(R3_UNIQUE_CONTRACTS, allIndexes);

    let hasSafeR4AbstainConstraint = false;
    if (presentSet.has('governance_proposals')) {
        const conRes = await client.query(
            `SELECT c.convalidated AS convalidated,
                    pg_catalog.pg_get_constraintdef(c.oid) AS def
             FROM pg_catalog.pg_constraint c
             JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
             JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
             WHERE n.nspname = 'public'
               AND t.relname = 'governance_proposals'
               AND c.contype = 'c'
               AND c.conname = 'chk_governance_proposals_abstain_index'`
        );
        const row = conRes.rows[0];
        if (row) {
            hasSafeR4AbstainConstraint = matchesSafeR4AbstainCheck(row.def, row.convalidated);
        }
    }

    const reasons = [];
    let schemaState = 'PARTIAL_OR_INCONSISTENT';
    let effectiveMissingColumns = [...r1ColEval.missing];
    let effectiveMissingIndexes = [...r1IdxEval.missing];

    if (presentCoreTables.length === 0 && !hasGatesTable && appliedCoreMigrations.length === 0) {
        schemaState = 'NOT_INSTALLED';
        effectiveMissingColumns = [];
        effectiveMissingIndexes = [];
    } else if (missingCoreTables.length > 0) {
        reasons.push(`missing_core_tables:${missingCoreTables.join(',')}`);
    } else if (r1ColEval.missing.length > 0) {
        reasons.push(`missing_r1_columns:${r1ColEval.missing.join(',')}`);
    } else if (r1ColEval.violations.length > 0) {
        reasons.push(...r1ColEval.violations);
    } else if (r1IdxEval.missing.length > 0) {
        reasons.push(...r1IdxEval.violations);
    } else if (hasM1 && !hasM2 && !hasM3 && !hasM4) {
        if (hasGatesTable) reasons.push('unexpected_sloboda_core_gates_on_r1');
        if (hasAnyR2Columns) reasons.push('unexpected_r2_columns_on_r1');
        if (reasons.length === 0) schemaState = 'INSTALLED_R1';
    } else if (hasM1 && hasM2 && !hasM3 && !hasM4) {
        effectiveMissingColumns = [...r1ColEval.missing, ...r2ColEval.missing];
        effectiveMissingIndexes = [...r1IdxEval.missing, ...r2IdxEval.missing];
        if (hasGatesTable) reasons.push('unexpected_sloboda_core_gates_on_r2');
        if (r2ColEval.missing.length > 0) reasons.push(`missing_r2_columns:${r2ColEval.missing.join(',')}`);
        if (r2ColEval.violations.length > 0) reasons.push(...r2ColEval.violations);
        if (r2IdxEval.missing.length > 0) {
            reasons.push(`missing_r2_indexes:${r2IdxEval.missing.join(',')}`);
            reasons.push(...r2IdxEval.violations);
        }
        if (reasons.length === 0) schemaState = 'INSTALLED_R2';
    } else if (hasM1 && hasM2 && hasM3 && !hasM4) {
        effectiveMissingColumns = [...r1ColEval.missing, ...r2ColEval.missing, ...r3ColEval.missing];
        effectiveMissingIndexes = [...r1IdxEval.missing, ...r2IdxEval.missing, ...r3IdxEval.missing];
        if (!hasGatesTable) reasons.push('missing_sloboda_core_gates_on_r3');
        if (r2ColEval.missing.length > 0) reasons.push(`missing_r2_columns:${r2ColEval.missing.join(',')}`);
        if (r2ColEval.violations.length > 0) reasons.push(...r2ColEval.violations);
        if (r3ColEval.missing.length > 0) reasons.push(`missing_r3_columns:${r3ColEval.missing.join(',')}`);
        if (r3ColEval.violations.length > 0) reasons.push(...r3ColEval.violations);
        if (r2IdxEval.missing.length > 0) {
            reasons.push(`missing_r2_indexes:${r2IdxEval.missing.join(',')}`);
            reasons.push(...r2IdxEval.violations);
        }
        if (r3IdxEval.missing.length > 0) {
            reasons.push(...r3IdxEval.violations);
        }
        if (reasons.length === 0) schemaState = 'INSTALLED_R3';
    } else if (hasM1 && hasM2 && hasM3 && hasM4) {
        effectiveMissingColumns = [...r1ColEval.missing, ...r2ColEval.missing, ...r3ColEval.missing];
        effectiveMissingIndexes = [...r1IdxEval.missing, ...r2IdxEval.missing, ...r3IdxEval.missing];
        if (!hasGatesTable) reasons.push('missing_sloboda_core_gates_on_r4');
        if (r2ColEval.missing.length > 0) reasons.push(`missing_r2_columns:${r2ColEval.missing.join(',')}`);
        if (r2ColEval.violations.length > 0) reasons.push(...r2ColEval.violations);
        if (r3ColEval.missing.length > 0) reasons.push(`missing_r3_columns:${r3ColEval.missing.join(',')}`);
        if (r3ColEval.violations.length > 0) reasons.push(...r3ColEval.violations);
        if (r2IdxEval.missing.length > 0) {
            reasons.push(`missing_r2_indexes:${r2IdxEval.missing.join(',')}`);
            reasons.push(...r2IdxEval.violations);
        }
        if (r3IdxEval.missing.length > 0) {
            reasons.push(...r3IdxEval.violations);
        }
        if (!hasSafeR4AbstainConstraint) reasons.push('missing_r4_safe_abstain_constraint');
        if (reasons.length === 0) schemaState = 'INSTALLED_R4';
    } else {
        reasons.push(`inconsistent_core_migration_markers:${appliedCoreMigrations.join(',') || 'none'}`);
    }

    return {
        schema_state: schemaState,
        present_tables: hasGatesTable ? [...presentCoreTables, 'sloboda_core_gates'] : presentCoreTables,
        missing_tables: missingCoreTables,
        has_gates_table: hasGatesTable,
        missing_columns: effectiveMissingColumns,
        missing_indexes: effectiveMissingIndexes,
        applied_core_migrations: appliedCoreMigrations,
        reasons,
    };
}

async function runFinancialIntegrityCheck(client) {
    const checkedAt = new Date().toISOString();
    const discrepancies = [];

    const expenseCols = await getColumnSet(client, 'ledger_expenses');
    const hasFinancialStatus = expenseCols.has('financial_status');
    const hasDisputeStatus = expenseCols.has('dispute_status');

    const effFinExpr = hasFinancialStatus
        ? `le.financial_status`
        : `CASE
            WHEN le.status = 'paid' THEN 'paid'
            WHEN le.status = 'cancelled' THEN 'cancelled'
            WHEN le.status = 'reserved' THEN 'reserved'
            WHEN EXISTS (SELECT 1 FROM public.ledger_postings lp WHERE lp.expense_id = le.id AND lp.posting_type = 'pay') THEN 'paid'
            WHEN EXISTS (SELECT 1 FROM public.ledger_postings lp WHERE lp.expense_id = le.id AND lp.posting_type = 'release') THEN 'cancelled'
            ELSE 'reserved'
           END`;

    const statsRes = await client.query(`
        SELECT
            (SELECT COUNT(*)::int FROM public.contributions) AS contributions_count,
            (SELECT COUNT(*)::int FROM public.ledger_expenses) AS expenses_count,
            (SELECT COUNT(*)::int FROM public.expense_allocations) AS allocations_count,
            (SELECT COUNT(*)::int FROM public.ledger_postings) AS postings_count
    `);
    const stats = statsRes.rows[0] || {
        contributions_count: 0,
        expenses_count: 0,
        allocations_count: 0,
        postings_count: 0,
    };

    // 1. Contribution conservation & ledger_mode
    const contribBad = await client.query(`
        SELECT id, settlement_id, ledger_mode,
               received_kopecks::text, available_kopecks::text,
               reserved_kopecks::text, paid_kopecks::text, refunded_kopecks::text
        FROM public.contributions
        WHERE received_kopecks <= 0
           OR available_kopecks < 0
           OR reserved_kopecks < 0
           OR paid_kopecks < 0
           OR refunded_kopecks < 0
           OR received_kopecks <> available_kopecks + reserved_kopecks + paid_kopecks + refunded_kopecks
           OR ledger_mode IS NULL
           OR ledger_mode NOT IN ('verified_receipt', 'pledge', 'legacy_import')
        ORDER BY id ASC
    `);
    for (const row of contribBad.rows) {
        const badMode = !['verified_receipt', 'pledge', 'legacy_import'].includes(row.ledger_mode);
        if (badMode) {
            discrepancies.push({
                type: 'invalid_contribution_ledger_mode',
                contribution_id: row.id,
                settlement_id: row.settlement_id,
                ledger_mode: row.ledger_mode,
            });
        }
        const sumOk = (
            BigInt(row.received_kopecks) > 0n
            && BigInt(row.available_kopecks) >= 0n
            && BigInt(row.reserved_kopecks) >= 0n
            && BigInt(row.paid_kopecks) >= 0n
            && BigInt(row.refunded_kopecks) >= 0n
            && BigInt(row.received_kopecks) === (
                BigInt(row.available_kopecks)
                + BigInt(row.reserved_kopecks)
                + BigInt(row.paid_kopecks)
                + BigInt(row.refunded_kopecks)
            )
        );
        if (!sumOk) {
            discrepancies.push({
                type: 'contribution_conservation_mismatch',
                contribution_id: row.id,
                settlement_id: row.settlement_id,
                received_kopecks: row.received_kopecks,
                available_kopecks: row.available_kopecks,
                reserved_kopecks: row.reserved_kopecks,
                paid_kopecks: row.paid_kopecks,
                refunded_kopecks: row.refunded_kopecks,
            });
        }
    }

    // 2. Per contribution: reserved allocations sum == contributions.reserved_kopecks
    const reservedDiff = await client.query(`
        WITH resv_alloc AS (
            SELECT ea.contribution_id, COALESCE(SUM(ea.amount_kopecks), 0)::bigint AS alloc_sum
            FROM public.expense_allocations ea
            JOIN public.ledger_expenses le ON le.id = ea.expense_id
            WHERE (${effFinExpr}) = 'reserved'
            GROUP BY ea.contribution_id
        )
        SELECT c.id AS contribution_id,
               c.reserved_kopecks::text AS contribution_reserved_kopecks,
               COALESCE(ra.alloc_sum, 0)::text AS allocated_reserved_kopecks
        FROM public.contributions c
        LEFT JOIN resv_alloc ra ON ra.contribution_id = c.id
        WHERE c.reserved_kopecks <> COALESCE(ra.alloc_sum, 0)
        ORDER BY c.id ASC
    `);
    for (const row of reservedDiff.rows) {
        discrepancies.push({
            type: 'contribution_reserved_allocation_mismatch',
            contribution_id: row.contribution_id,
            contribution_reserved_kopecks: row.contribution_reserved_kopecks,
            allocated_reserved_kopecks: row.allocated_reserved_kopecks,
        });
    }

    // 3. Per contribution: paid allocations sum == contributions.paid_kopecks
    const paidDiff = await client.query(`
        WITH paid_alloc AS (
            SELECT ea.contribution_id, COALESCE(SUM(ea.amount_kopecks), 0)::bigint AS alloc_sum
            FROM public.expense_allocations ea
            JOIN public.ledger_expenses le ON le.id = ea.expense_id
            WHERE (${effFinExpr}) = 'paid'
            GROUP BY ea.contribution_id
        )
        SELECT c.id AS contribution_id,
               c.paid_kopecks::text AS contribution_paid_kopecks,
               COALESCE(pa.alloc_sum, 0)::text AS allocated_paid_kopecks
        FROM public.contributions c
        LEFT JOIN paid_alloc pa ON pa.contribution_id = c.id
        WHERE c.paid_kopecks <> COALESCE(pa.alloc_sum, 0)
        ORDER BY c.id ASC
    `);
    for (const row of paidDiff.rows) {
        discrepancies.push({
            type: 'contribution_paid_allocation_mismatch',
            contribution_id: row.contribution_id,
            contribution_paid_kopecks: row.contribution_paid_kopecks,
            allocated_paid_kopecks: row.allocated_paid_kopecks,
        });
    }

    // 4. Per (expense_id, contribution_id): at most 1 pay posting and at most 1 release posting
    const dupPostings = await client.query(`
        SELECT expense_id, contribution_id, posting_type, COUNT(*)::int AS cnt
        FROM public.ledger_postings
        WHERE posting_type IN ('pay', 'release')
          AND expense_id IS NOT NULL
          AND contribution_id IS NOT NULL
        GROUP BY expense_id, contribution_id, posting_type
        HAVING COUNT(*) > 1
        ORDER BY expense_id ASC, contribution_id ASC
    `);
    for (const row of dupPostings.rows) {
        discrepancies.push({
            type: 'duplicate_terminal_posting_per_allocation',
            expense_id: row.expense_id,
            contribution_id: row.contribution_id,
            posting_type: row.posting_type,
            count: row.cnt,
        });
    }

    // 5. Per expense: cannot have BOTH pay and release postings
    const conflictPostings = await client.query(`
        SELECT expense_id,
               COUNT(*) FILTER (WHERE posting_type = 'pay')::int AS pay_count,
               COUNT(*) FILTER (WHERE posting_type = 'release')::int AS release_count
        FROM public.ledger_postings
        WHERE expense_id IS NOT NULL
          AND posting_type IN ('pay', 'release')
        GROUP BY expense_id
        HAVING COUNT(*) FILTER (WHERE posting_type = 'pay') > 0
           AND COUNT(*) FILTER (WHERE posting_type = 'release') > 0
        ORDER BY expense_id ASC
    `);
    for (const row of conflictPostings.rows) {
        discrepancies.push({
            type: 'conflicting_pay_and_release_postings',
            expense_id: row.expense_id,
            pay_count: row.pay_count,
            release_count: row.release_count,
        });
    }

    // 6a. Per expense with financial_status IN ('reserved', 'paid'): sum(allocations) == expense.amount_kopecks
    const expAllocMismatch = await client.query(`
        SELECT le.id AS expense_id,
               (${effFinExpr}) AS effective_financial_status,
               le.amount_kopecks::text AS expense_amount_kopecks,
               COALESCE(SUM(ea.amount_kopecks), 0)::text AS allocations_sum_kopecks
        FROM public.ledger_expenses le
        LEFT JOIN public.expense_allocations ea ON ea.expense_id = le.id
        WHERE (${effFinExpr}) IN ('reserved', 'paid')
        GROUP BY le.id, (${effFinExpr}), le.amount_kopecks
        HAVING COALESCE(SUM(ea.amount_kopecks), 0) <> le.amount_kopecks
        ORDER BY le.id ASC
    `);
    for (const row of expAllocMismatch.rows) {
        discrepancies.push({
            type: 'expense_allocation_sum_mismatch',
            expense_id: row.expense_id,
            financial_status: row.effective_financial_status,
            expense_amount_kopecks: row.expense_amount_kopecks,
            allocations_sum_kopecks: row.allocations_sum_kopecks,
        });
    }

    // 6b. For financial_status = 'paid', every allocation has a matching pay posting with matching amount
    const paidAllocPostingMismatch = await client.query(`
        SELECT ea.expense_id,
               ea.contribution_id,
               ea.amount_kopecks::text AS alloc_amount_kopecks,
               COALESCE(SUM(lp.amount_kopecks), 0)::text AS pay_posting_amount_kopecks
        FROM public.expense_allocations ea
        JOIN public.ledger_expenses le ON le.id = ea.expense_id
        LEFT JOIN public.ledger_postings lp
          ON lp.expense_id = ea.expense_id
         AND lp.contribution_id = ea.contribution_id
         AND lp.posting_type = 'pay'
        WHERE (${effFinExpr}) = 'paid'
        GROUP BY ea.expense_id, ea.contribution_id, ea.amount_kopecks
        HAVING COALESCE(SUM(lp.amount_kopecks), 0) <> ea.amount_kopecks
        ORDER BY ea.expense_id ASC, ea.contribution_id ASC
    `);
    for (const row of paidAllocPostingMismatch.rows) {
        discrepancies.push({
            type: 'paid_allocation_missing_or_mismatched_pay_posting',
            expense_id: row.expense_id,
            contribution_id: row.contribution_id,
            alloc_amount_kopecks: row.alloc_amount_kopecks,
            pay_posting_amount_kopecks: row.pay_posting_amount_kopecks,
        });
    }

    // 7a. Per expense: status/financial_status/dispute_status match postings
    const statusCols = hasFinancialStatus && hasDisputeStatus
        ? `le.status, le.financial_status, le.dispute_status`
        : `le.status, (${effFinExpr}) AS financial_status, CASE WHEN le.status = 'disputed' THEN 'open' ELSE 'none' END AS dispute_status`;

    const expenseStateMismatch = await client.query(`
        WITH posting_flags AS (
            SELECT expense_id,
                   BOOL_OR(posting_type = 'pay') AS has_pay,
                   BOOL_OR(posting_type = 'release') AS has_release
            FROM public.ledger_postings
            WHERE expense_id IS NOT NULL AND posting_type IN ('pay', 'release')
            GROUP BY expense_id
        )
        SELECT le.id AS expense_id,
               ${statusCols},
               COALESCE(pf.has_pay, FALSE) AS has_pay,
               COALESCE(pf.has_release, FALSE) AS has_release
        FROM public.ledger_expenses le
        LEFT JOIN posting_flags pf ON pf.expense_id = le.id
        WHERE (
            (COALESCE(pf.has_pay, FALSE) AND NOT COALESCE(pf.has_release, FALSE) AND (${effFinExpr}) <> 'paid')
            OR (COALESCE(pf.has_release, FALSE) AND NOT COALESCE(pf.has_pay, FALSE) AND (${effFinExpr}) <> 'cancelled')
            OR (NOT COALESCE(pf.has_pay, FALSE) AND NOT COALESCE(pf.has_release, FALSE) AND (${effFinExpr}) <> 'reserved')
            ${hasFinancialStatus && hasDisputeStatus ? `
            OR NOT (
                (le.dispute_status = 'open' AND le.status = 'disputed')
                OR (le.dispute_status IN ('none', 'resolved') AND le.status = le.financial_status)
            )` : ''}
        )
        ORDER BY le.id ASC
    `);
    for (const row of expenseStateMismatch.rows) {
        discrepancies.push({
            type: 'expense_status_posting_mismatch',
            expense_id: row.expense_id,
            status: row.status,
            financial_status: row.financial_status,
            dispute_status: row.dispute_status,
            has_pay: row.has_pay,
            has_release: row.has_release,
        });
    }

    // 7b. Cross-settlement milestone mismatch
    const crossMilestone = await client.query(`
        SELECT le.id AS expense_id, le.settlement_id AS expense_settlement_id,
               le.milestone_id, cm.settlement_id AS milestone_settlement_id
        FROM public.ledger_expenses le
        LEFT JOIN public.construction_milestones cm ON cm.id = le.milestone_id
        WHERE le.milestone_id IS NOT NULL
          AND (cm.id IS NULL OR cm.settlement_id IS DISTINCT FROM le.settlement_id)
        ORDER BY le.id ASC
    `);
    for (const row of crossMilestone.rows) {
        discrepancies.push({
            type: 'expense_cross_settlement_milestone_mismatch',
            expense_id: row.expense_id,
            expense_settlement_id: row.expense_settlement_id,
            milestone_id: row.milestone_id,
            milestone_settlement_id: row.milestone_settlement_id,
        });
    }

    // 8a. Allocations funded by non-verified_receipt contributions
    const nonVerifiedAlloc = await client.query(`
        SELECT ea.id AS allocation_id,
               ea.expense_id,
               ea.contribution_id,
               ea.amount_kopecks::text AS amount_kopecks,
               c.ledger_mode
        FROM public.expense_allocations ea
        JOIN public.contributions c ON c.id = ea.contribution_id
        WHERE c.ledger_mode IS DISTINCT FROM 'verified_receipt'
        ORDER BY ea.expense_id ASC, ea.contribution_id ASC
    `);
    for (const row of nonVerifiedAlloc.rows) {
        discrepancies.push({
            type: 'NON_VERIFIED_ALLOCATION_FUNDING',
            allocation_id: row.allocation_id,
            expense_id: row.expense_id,
            contribution_id: row.contribution_id,
            amount_kopecks: row.amount_kopecks,
            ledger_mode: row.ledger_mode,
        });
    }

    // 8b. Expense postings (reserve/pay/release) without a matching expense_allocations row (including NULL expense_id/contribution_id)
    const orphanPostings = await client.query(`
        SELECT p.id AS posting_id,
               p.posting_type,
               p.expense_id,
               p.contribution_id,
               p.amount_kopecks::text AS amount_kopecks
        FROM public.ledger_postings p
        WHERE p.posting_type IN ('reserve', 'pay', 'release')
          AND (
              p.expense_id IS NULL
              OR p.contribution_id IS NULL
              OR NOT EXISTS (
                  SELECT 1 FROM public.expense_allocations ea
                  WHERE ea.expense_id = p.expense_id
                    AND ea.contribution_id = p.contribution_id
              )
          )
        ORDER BY p.id ASC
    `);
    for (const row of orphanPostings.rows) {
        discrepancies.push({
            type: 'ORPHAN_EXPENSE_POSTING',
            posting_id: row.posting_id,
            posting_type: row.posting_type,
            expense_id: row.expense_id,
            contribution_id: row.contribution_id,
            amount_kopecks: row.amount_kopecks,
        });
    }

    // 8c. Cancelled expenses: every allocation must have a matching release posting with matching amount
    const cancelledReleaseMismatch = await client.query(`
        SELECT ea.expense_id,
               ea.contribution_id,
               ea.amount_kopecks::text AS alloc_amount_kopecks,
               COALESCE(SUM(lp.amount_kopecks), 0)::text AS release_posting_amount_kopecks,
               COUNT(lp.id)::int AS release_posting_count
        FROM public.expense_allocations ea
        JOIN public.ledger_expenses le ON le.id = ea.expense_id
        LEFT JOIN public.ledger_postings lp
          ON lp.expense_id = ea.expense_id
         AND lp.contribution_id = ea.contribution_id
         AND lp.posting_type = 'release'
        WHERE (${effFinExpr}) = 'cancelled'
           OR le.status = 'cancelled'
        GROUP BY ea.expense_id, ea.contribution_id, ea.amount_kopecks
        HAVING COUNT(lp.id) <> 1
            OR COALESCE(SUM(lp.amount_kopecks), 0) <> ea.amount_kopecks
        ORDER BY ea.expense_id ASC, ea.contribution_id ASC
    `);
    for (const row of cancelledReleaseMismatch.rows) {
        discrepancies.push({
            type: 'MISSING_OR_MISMATCHED_RELEASE_POSTING',
            expense_id: row.expense_id,
            contribution_id: row.contribution_id,
            alloc_amount_kopecks: row.alloc_amount_kopecks,
            release_posting_amount_kopecks: row.release_posting_amount_kopecks,
            release_posting_count: row.release_posting_count,
        });
    }

    return {
        ok: discrepancies.length === 0,
        discrepancies,
        stats: {
            contributions_count: Number(stats.contributions_count || 0),
            expenses_count: Number(stats.expenses_count || 0),
            allocations_count: Number(stats.allocations_count || 0),
            postings_count: Number(stats.postings_count || 0),
        },
        checked_at: checkedAt,
    };
}

async function runGovernancePreflight(client) {
    const cols = await getColumnSet(client, 'governance_proposals');
    const hasLegacyCols = cols.has('legacy_r1_unsupported') && cols.has('legacy_r1_disposition');

    const badOptionsShapeExpr = `(options IS NULL OR jsonb_typeof(options) <> 'array')`;
    const badAbstainExpr = `(
        abstain_option_index IS NOT NULL
        AND (
            abstain_option_index < 0
            OR abstain_option_index >= CASE
                WHEN options IS NOT NULL AND jsonb_typeof(options) = 'array' THEN jsonb_array_length(options)
                ELSE 0
            END
        )
    )`;

    const unsupportedFilter = `
        ${hasLegacyCols ? 'legacy_r1_unsupported = TRUE OR ' : ''}
        seats_count IS DISTINCT FROM 1
        OR NOT (
            (authoritative_engine = 'native_secret' AND secret_ballot = TRUE)
            OR (authoritative_engine = 'native_named' AND secret_ballot = FALSE)
        )
        OR quorum_members_pct IS NULL OR quorum_members_pct < 1 OR quorum_members_pct > 100
        OR quorum_capital_pct IS NULL OR quorum_capital_pct < 1 OR quorum_capital_pct > 100
        OR ${badOptionsShapeExpr}
        OR ${badAbstainExpr}
    `;

    const dispositionExpr = hasLegacyCols
        ? `COALESCE(legacy_r1_disposition, CASE WHEN status IN ('closed', 'cancelled') THEN 'archived_historical_r1' ELSE 'frozen_requires_operator_disposition' END)`
        : `CASE WHEN status IN ('closed', 'cancelled') THEN 'archived_historical_r1' ELSE 'frozen_requires_operator_disposition' END`;

    const res = await client.query(`
        SELECT authoritative_engine,
               seats_count,
               status,
               ${dispositionExpr} AS legacy_r1_disposition,
               COUNT(*)::int AS count
        FROM public.governance_proposals
        WHERE ${unsupportedFilter}
        GROUP BY authoritative_engine, seats_count, status, ${dispositionExpr}
        ORDER BY authoritative_engine, seats_count, status
    `);

    const detailRes = await client.query(`
        SELECT id,
               title,
               status,
               authoritative_engine,
               secret_ballot,
               seats_count,
               quorum_members_pct,
               quorum_capital_pct,
               abstain_option_index,
               jsonb_typeof(options) AS options_type,
               CASE WHEN options IS NOT NULL AND jsonb_typeof(options) = 'array' THEN jsonb_array_length(options) ELSE NULL END AS options_length,
               ${hasLegacyCols ? 'legacy_r1_unsupported' : 'FALSE'} AS already_marked_legacy_r1_unsupported,
               ${dispositionExpr} AS legacy_r1_disposition,
               (seats_count IS DISTINCT FROM 1) AS bad_seats,
               (NOT (
                   (authoritative_engine = 'native_secret' AND secret_ballot = TRUE)
                   OR (authoritative_engine = 'native_named' AND secret_ballot = FALSE)
               )) AS bad_engine,
               (quorum_members_pct IS NULL OR quorum_members_pct < 1 OR quorum_members_pct > 100) AS bad_quorum_members,
               (quorum_capital_pct IS NULL OR quorum_capital_pct < 1 OR quorum_capital_pct > 100) AS bad_quorum_capital,
               ${badOptionsShapeExpr} AS bad_options_shape,
               ${badAbstainExpr} AS bad_abstain
        FROM public.governance_proposals
        WHERE ${unsupportedFilter}
        ORDER BY id ASC
    `);

    const inventory = res.rows.map((r) => ({
        authoritative_engine: r.authoritative_engine,
        seats_count: Number(r.seats_count),
        status: r.status,
        legacy_r1_disposition: r.legacy_r1_disposition,
        count: Number(r.count),
    }));

    const unsupportedProposals = detailRes.rows.map((r) => {
        const reasons = [];
        if (r.already_marked_legacy_r1_unsupported) reasons.push('already_marked_legacy_r1_unsupported');
        if (r.bad_seats) reasons.push('seats_count_not_one');
        if (r.bad_engine) reasons.push('engine_secret_ballot_mismatch');
        if (r.bad_quorum_members) reasons.push('invalid_quorum_members_pct');
        if (r.bad_quorum_capital) reasons.push('invalid_quorum_capital_pct');
        if (r.bad_options_shape) reasons.push('invalid_options_shape');
        if (r.bad_abstain) reasons.push('invalid_abstain_option_index');
        return {
            id: Number(r.id),
            title: r.title,
            status: r.status,
            authoritative_engine: r.authoritative_engine,
            seats_count: Number(r.seats_count),
            abstain_option_index: r.abstain_option_index === null ? null : Number(r.abstain_option_index),
            options_type: r.options_type,
            options_length: r.options_length === null ? null : Number(r.options_length),
            legacy_r1_disposition: r.legacy_r1_disposition,
            reasons,
        };
    });

    const legacyUnsupportedCount = inventory.reduce((sum, r) => sum + r.count, 0);

    return {
        ok: true,
        legacy_unsupported_count: legacyUnsupportedCount,
        inventory,
        unsupported_proposals: unsupportedProposals,
    };
}

async function runFullPreflight(client) {
    const checkedAt = new Date().toISOString();
    const schema = await inspectCoreSchemaState(client);

    if (schema.schema_state === 'NOT_INSTALLED') {
        return {
            schema,
            financial: {
                ok: true,
                skipped_reason: 'core_schema_not_installed',
                discrepancies: [],
                stats: {
                    contributions_count: 0,
                    expenses_count: 0,
                    allocations_count: 0,
                    postings_count: 0,
                },
                checked_at: checkedAt,
            },
            governance: {
                ok: true,
                skipped_reason: 'core_schema_not_installed',
                legacy_unsupported_count: 0,
                inventory: [],
                unsupported_proposals: [],
            },
            checked_at: checkedAt,
        };
    }

    if (schema.schema_state === 'PARTIAL_OR_INCONSISTENT') {
        return {
            schema,
            financial: {
                ok: false,
                discrepancies: [
                    {
                        type: 'PARTIAL_CORE_SCHEMA',
                        schema_state: schema.schema_state,
                        present_tables: schema.present_tables,
                        missing_tables: schema.missing_tables,
                        missing_columns: schema.missing_columns,
                        applied_core_migrations: schema.applied_core_migrations,
                        reasons: schema.reasons,
                    },
                ],
                stats: {
                    contributions_count: 0,
                    expenses_count: 0,
                    allocations_count: 0,
                    postings_count: 0,
                },
                checked_at: checkedAt,
            },
            governance: {
                ok: false,
                legacy_unsupported_count: 0,
                inventory: [],
                unsupported_proposals: [],
            },
            checked_at: checkedAt,
        };
    }

    const financial = await runFinancialIntegrityCheck(client);
    const governance = await runGovernancePreflight(client);
    return {
        schema,
        financial,
        governance,
        checked_at: financial.checked_at,
    };
}

async function persistLedgerGate(client, report) {
    const financial = report && report.financial ? report.financial : report;
    const isBlocked = !(financial && financial.ok === true);
    const payload = report && report.financial ? report : { financial };
    await client.query(
        `INSERT INTO public.sloboda_core_gates (gate_key, is_blocked, report_json, checked_at)
         VALUES ('ledger_integrity', $1, $2::jsonb, NOW())
         ON CONFLICT (gate_key) DO UPDATE SET
             is_blocked = EXCLUDED.is_blocked,
             report_json = EXCLUDED.report_json,
             checked_at = EXCLUDED.checked_at`,
        [isBlocked, JSON.stringify(payload)]
    );
    return {
        gate_key: 'ledger_integrity',
        is_blocked: isBlocked,
        report: payload,
    };
}

module.exports = {
    CORE_R1_TABLES,
    CORE_MIGRATION_VERSIONS,
    inspectCoreSchemaState,
    runFinancialIntegrityCheck,
    runGovernancePreflight,
    runFullPreflight,
    persistLedgerGate,
};
