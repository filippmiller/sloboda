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

const R2_REQUIRED_COLUMNS = [
    { table: 'ledger_expenses', column: 'financial_status' },
    { table: 'ledger_expenses', column: 'dispute_status' },
    { table: 'governance_proposals', column: 'legacy_r1_unsupported' },
    { table: 'governance_proposals', column: 'legacy_r1_disposition' },
];

async function getColumnSet(client, tableName) {
    const res = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );
    return new Set(res.rows.map((r) => r.column_name));
}

async function inspectCoreSchemaState(client) {
    const allTrackedTables = [...CORE_R1_TABLES, 'sloboda_core_gates', 'schema_migrations'];
    const tblRes = await client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name = ANY($1::text[])`,
        [allTrackedTables]
    );
    const presentSet = new Set(tblRes.rows.map((r) => r.table_name));

    const presentCoreTables = CORE_R1_TABLES.filter((t) => presentSet.has(t));
    const missingCoreTables = CORE_R1_TABLES.filter((t) => !presentSet.has(t));
    const hasGatesTable = presentSet.has('sloboda_core_gates');
    const hasSchemaMigrationsTable = presentSet.has('schema_migrations');

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

    const expenseCols = presentSet.has('ledger_expenses')
        ? await getColumnSet(client, 'ledger_expenses')
        : new Set();
    const proposalCols = presentSet.has('governance_proposals')
        ? await getColumnSet(client, 'governance_proposals')
        : new Set();

    const missingR2Columns = [];
    for (const reqCol of R2_REQUIRED_COLUMNS) {
        const cols = reqCol.table === 'ledger_expenses' ? expenseCols : proposalCols;
        if (!cols.has(reqCol.column)) {
            missingR2Columns.push(`${reqCol.table}.${reqCol.column}`);
        }
    }
    const hasAllR2Columns = missingR2Columns.length === 0;
    const hasAnyR2Columns = missingR2Columns.length < R2_REQUIRED_COLUMNS.length;

    const reasons = [];
    let schemaState = 'PARTIAL_OR_INCONSISTENT';

    if (presentCoreTables.length === 0 && !hasGatesTable && appliedCoreMigrations.length === 0) {
        schemaState = 'NOT_INSTALLED';
    } else if (missingCoreTables.length > 0) {
        reasons.push(`missing_core_tables:${missingCoreTables.join(',')}`);
    } else if (hasM1 && !hasM2 && !hasM3 && !hasM4) {
        if (hasGatesTable) reasons.push('unexpected_sloboda_core_gates_on_r1');
        if (hasAnyR2Columns) reasons.push('unexpected_r2_columns_on_r1');
        if (reasons.length === 0) schemaState = 'INSTALLED_R1';
    } else if (hasM1 && hasM2 && !hasM3 && !hasM4) {
        if (hasGatesTable) reasons.push('unexpected_sloboda_core_gates_on_r2');
        if (!hasAllR2Columns) reasons.push(`missing_r2_columns:${missingR2Columns.join(',')}`);
        if (reasons.length === 0) schemaState = 'INSTALLED_R2';
    } else if (hasM1 && hasM2 && hasM3 && !hasM4) {
        if (!hasGatesTable) reasons.push('missing_sloboda_core_gates_on_r3');
        if (!hasAllR2Columns) reasons.push(`missing_r2_columns:${missingR2Columns.join(',')}`);
        if (reasons.length === 0) schemaState = 'INSTALLED_R3';
    } else if (hasM1 && hasM2 && hasM3 && hasM4) {
        if (!hasGatesTable) reasons.push('missing_sloboda_core_gates_on_r4');
        if (!hasAllR2Columns) reasons.push(`missing_r2_columns:${missingR2Columns.join(',')}`);
        if (reasons.length === 0) schemaState = 'INSTALLED_R4';
    } else {
        reasons.push(`inconsistent_core_migration_markers:${appliedCoreMigrations.join(',') || 'none'}`);
    }

    return {
        schema_state: schemaState,
        present_tables: hasGatesTable ? [...presentCoreTables, 'sloboda_core_gates'] : presentCoreTables,
        missing_tables: missingCoreTables,
        has_gates_table: hasGatesTable,
        missing_columns: missingR2Columns,
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
