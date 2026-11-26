-- Sloboda Core Platform Migration (2026-11-26)
-- Forward migration: idempotent schema creation for Membership/Applications,
-- Governance & Voting Core (1p1v, capital, dual-consent, secret ballots),
-- and Integer-Kopeck Conservation Ledger & Construction Panel.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. Membership fields on users (free membership decoupled from capital)
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status VARCHAR(24) NOT NULL DEFAULT 'observer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_admitted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot';

-- 2. Specialist Applications & Portfolio
CREATE TABLE IF NOT EXISTS member_applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot',
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    city VARCHAR(120),
    primary_domain VARCHAR(16) NOT NULL DEFAULT 'GEN',
    skills TEXT,
    motivation TEXT,
    trial_task_title VARCHAR(255),
    trial_task_url TEXT,
    claim_token_hash VARCHAR(64),
    claim_token_used_at TIMESTAMP,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    version INTEGER NOT NULL DEFAULT 1,
    reviewer_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    review_note TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_applications_user_settlement
    ON member_applications(user_id, settlement_id);

CREATE TABLE IF NOT EXISTS portfolio_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    application_id INTEGER NOT NULL REFERENCES member_applications(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    domain_code VARCHAR(16) NOT NULL DEFAULT 'GEN',
    summary TEXT,
    artifact_url TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Governance & Voting Core
CREATE TABLE IF NOT EXISTS governance_proposals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vote_type VARCHAR(24) NOT NULL CHECK (vote_type IN ('council_election', 'capital_vote', 'dual_consent')),
    scope_level VARCHAR(24) NOT NULL DEFAULT 'local' CHECK (scope_level IN ('local', 'general')),
    settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot',
    authoritative_engine VARCHAR(24) NOT NULL DEFAULT 'native_named' CHECK (authoritative_engine IN ('native_named', 'native_secret', 'loomio', 'belenios')),
    secret_ballot BOOLEAN NOT NULL DEFAULT FALSE,
    share_class VARCHAR(32),
    terms_version VARCHAR(32) DEFAULT 'v1',
    seats_count INTEGER NOT NULL DEFAULT 1,
    options JSONB NOT NULL,
    abstain_option_index INTEGER,
    status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'cancelled')),
    quorum_members_pct INTEGER NOT NULL DEFAULT 50,
    quorum_capital_pct INTEGER NOT NULL DEFAULT 50,
    roster_hash VARCHAR(64),
    protocol_hash VARCHAR(64),
    protocol_json JSONB,
    adopted BOOLEAN,
    winning_option_index INTEGER,
    external_election_fingerprint VARCHAR(128),
    created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    opened_at TIMESTAMP,
    closes_at TIMESTAMP,
    closed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS governance_voter_snapshots (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    voter_label VARCHAR(200) NOT NULL,
    can_vote_member BOOLEAN NOT NULL DEFAULT FALSE,
    member_weight INTEGER NOT NULL DEFAULT 0,
    can_vote_capital BOOLEAN NOT NULL DEFAULT FALSE,
    capital_weight_kopecks BIGINT NOT NULL DEFAULT 0,
    share_class VARCHAR(32),
    terms_version VARCHAR(32),
    UNIQUE(proposal_id, user_id)
);

-- Named ballots (used when secret_ballot = FALSE)
CREATE TABLE IF NOT EXISTS governance_ballots (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES governance_voter_snapshots(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    chamber VARCHAR(16) NOT NULL CHECK (chamber IN ('member', 'capital')),
    option_index INTEGER NOT NULL,
    weight_applied BIGINT NOT NULL CHECK (weight_applied > 0),
    cast_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, user_id, chamber)
);

-- Secret ballot separation: participation receipt has NO option_index; secret ballot has NO user_id
CREATE TABLE IF NOT EXISTS governance_voter_receipts (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    chamber VARCHAR(16) NOT NULL CHECK (chamber IN ('member', 'capital')),
    cast_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, user_id, chamber)
);

CREATE TABLE IF NOT EXISTS governance_secret_ballots (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
    chamber VARCHAR(16) NOT NULL CHECK (chamber IN ('member', 'capital')),
    option_index INTEGER NOT NULL,
    weight_applied BIGINT NOT NULL CHECK (weight_applied > 0),
    ballot_hash VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS council_delegations (
    id SERIAL PRIMARY KEY,
    settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot',
    delegate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    elected_via_proposal_id INTEGER REFERENCES governance_proposals(id) ON DELETE RESTRICT,
    level VARCHAR(24) NOT NULL CHECK (level IN ('local_council', 'general_council')),
    seat_label VARCHAR(120),
    authorizing_local_council_id INTEGER REFERENCES council_delegations(id) ON DELETE RESTRICT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    term_starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    term_ends_at TIMESTAMP
);

-- 4. Integer-Kopeck Conservation Ledger & Construction Panel
CREATE TABLE IF NOT EXISTS contributions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot',
    purpose VARCHAR(64) NOT NULL DEFAULT 'general',
    contributor_name VARCHAR(200) NOT NULL,
    received_kopecks BIGINT NOT NULL CHECK (received_kopecks > 0),
    available_kopecks BIGINT NOT NULL CHECK (available_kopecks >= 0),
    reserved_kopecks BIGINT NOT NULL DEFAULT 0 CHECK (reserved_kopecks >= 0),
    paid_kopecks BIGINT NOT NULL DEFAULT 0 CHECK (paid_kopecks >= 0),
    refunded_kopecks BIGINT NOT NULL DEFAULT 0 CHECK (refunded_kopecks >= 0),
    CONSTRAINT chk_contribution_conservation CHECK (
        received_kopecks = available_kopecks + reserved_kopecks + paid_kopecks + refunded_kopecks
    ),
    share_class VARCHAR(32),
    terms_version VARCHAR(32) DEFAULT 'v1',
    legal_right_type VARCHAR(32) NOT NULL DEFAULT 'observer_trace' CHECK (
        legal_right_type IN ('observer_trace', 'cooperative_share', 'direct_fraction')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'unallocated',
    ledger_mode VARCHAR(24) NOT NULL DEFAULT 'verified_receipt',
    payment_ref VARCHAR(120),
    idempotency_key VARCHAR(128) UNIQUE,
    note TEXT,
    verified_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS construction_milestones (
    id SERIAL PRIMARY KEY,
    settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot',
    code VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(48) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    planned_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
    actual_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
    budget_kopecks BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'delayed')),
    photo_url TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(settlement_id, code)
);

CREATE TABLE IF NOT EXISTS ledger_expenses (
    id SERIAL PRIMARY KEY,
    settlement_id VARCHAR(64) NOT NULL DEFAULT 'sloboda-pilot',
    purpose VARCHAR(64) NOT NULL DEFAULT 'general',
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks > 0),
    milestone_id INTEGER REFERENCES construction_milestones(id) ON DELETE RESTRICT,
    asset_name VARCHAR(255),
    asset_location VARCHAR(255),
    receipt_url TEXT,
    photo_url TEXT,
    allocation_rule VARCHAR(32) NOT NULL DEFAULT 'fifo' CHECK (allocation_rule IN ('fifo', 'proportional', 'explicit')),
    status VARCHAR(24) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'paid', 'disputed', 'cancelled')),
    idempotency_key VARCHAR(128) UNIQUE,
    approved_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_allocations (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER NOT NULL REFERENCES ledger_expenses(id) ON DELETE RESTRICT,
    contribution_id INTEGER NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT,
    amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks > 0),
    allocation_rule VARCHAR(32) NOT NULL,
    financing_share_label VARCHAR(160),
    legal_right_type VARCHAR(32) NOT NULL DEFAULT 'observer_trace',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_postings (
    id SERIAL PRIMARY KEY,
    posting_type VARCHAR(24) NOT NULL CHECK (posting_type IN ('receipt', 'reserve', 'pay', 'release', 'refund', 'dispute', 'resolve')),
    contribution_id INTEGER REFERENCES contributions(id) ON DELETE RESTRICT,
    expense_id INTEGER REFERENCES ledger_expenses(id) ON DELETE RESTRICT,
    amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks > 0),
    actor_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version)
VALUES ('2026-11-26-sloboda-core')
ON CONFLICT (version) DO NOTHING;
