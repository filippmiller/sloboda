/**
 * Sloboda Core Pure Domain Algorithms
 * Shared identically by PostgreSQL and in-memory test adapters:
 *  - Deterministic canonical JSON & SHA-256 hashing
 *  - Exact BigInt kopeck allocation (Hamilton / Largest-Remainder, FIFO, Explicit)
 *  - Governance chamber evaluation (1p1v, capital weighted, dual-consent, abstain)
 *  - External engine (Loomio / Belenios) reconciliation & tamper detection
 */
const crypto = require('crypto');

function canonicalize(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            if (value[key] !== undefined) {
                sorted[key] = canonicalize(value[key]);
            }
        }
        return sorted;
    }
    return value;
}

function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}

function sha256Hex(input) {
    const str = typeof input === 'string' ? input : canonicalJson(input);
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function toBigIntKopecks(val, fieldName = 'amount_kopecks') {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') {
        if (!Number.isInteger(val) || !Number.isSafeInteger(val)) {
            throw new Error(`Invalid integer for ${fieldName}; pass exact decimal string for large values`);
        }
        return BigInt(val);
    }
    if (typeof val === 'string' && /^-?\d+$/.test(val.trim())) {
        return BigInt(val.trim());
    }
    throw new Error(`Invalid kopeck value for ${fieldName}`);
}

function formatKopecks(bigVal) {
    const bi = BigInt(bigVal);
    const num = bi <= BigInt(Number.MAX_SAFE_INTEGER) && bi >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(bi)
        : null;
    return {
        kopecks: num,
        kopecks_str: bi.toString(),
        rubles_str: formatRublesString(bi),
    };
}

function formatRublesString(bi) {
    const neg = bi < 0n;
    const abs = neg ? -bi : bi;
    const rub = abs / 100n;
    const kop = abs % 100n;
    return `${neg ? '-' : ''}${rub.toString()}.${kop.toString().padStart(2, '0')}`;
}

/**
 * Exact BigInt Proportional Allocation using Hamilton (Largest Remainder) method.
 * Guarantees exact conservation: sum(allocations) === expenseKopecks,
 * and every allocation <= contributor.available_kopecks.
 * Example: 2n across [100n, 100n, 100n] -> [1n, 1n, 0n] (deterministic by id ASC).
 */
function allocateProportionalBigInt(expenseKopecks, contributors) {
    const target = toBigIntKopecks(expenseKopecks, 'expense_kopecks');
    if (target <= 0n) throw new Error('Expense amount must be positive');

    const sorted = contributors
        .map((c) => ({ ...c, avail: toBigIntKopecks(c.available_kopecks, 'available_kopecks') }))
        .filter((c) => c.avail > 0n)
        .sort((a, b) => a.id - b.id);

    const totalAvail = sorted.reduce((acc, c) => acc + c.avail, 0n);
    if (totalAvail < target) {
        const err = new Error(`Insufficient available funds: need ${target.toString()}, available ${totalAvail.toString()}`);
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
    }

    const parts = sorted.map((c) => {
        const numer = target * c.avail;
        const base = numer / totalAvail;
        const rem = numer % totalAvail;
        return {
            contribution: c,
            allocated: base,
            remainder: rem,
            cap: c.avail,
        };
    });

    let residual = target - parts.reduce((acc, p) => acc + p.allocated, 0n);

    // Distribute residual +1n kopeck by descending remainder, tie-break by contribution.id ASC
    const byRemainder = [...parts].sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder > a.remainder ? 1 : -1;
        return a.contribution.id - b.contribution.id;
    });

    let safety = 0;
    while (residual > 0n && safety < byRemainder.length * 2) {
        let progressed = false;
        for (const p of byRemainder) {
            if (residual === 0n) break;
            if (p.allocated < p.cap) {
                p.allocated += 1n;
                residual -= 1n;
                progressed = true;
            }
        }
        if (!progressed) break;
        safety++;
    }

    if (residual !== 0n) {
        throw new Error('Allocation invariant failure: residual kopecks could not be distributed');
    }

    return parts
        .filter((p) => p.allocated > 0n)
        .sort((a, b) => a.contribution.id - b.contribution.id)
        .map((p) => ({
            contribution_id: p.contribution.id,
            amount_kopecks: p.allocated,
            legal_right_type: p.contribution.legal_right_type || 'observer_trace',
        }));
}

/**
 * Exact BigInt FIFO Allocation ordered by (created_at ASC, id ASC).
 */
function allocateFifoBigInt(expenseKopecks, contributors) {
    const target = toBigIntKopecks(expenseKopecks, 'expense_kopecks');
    if (target <= 0n) throw new Error('Expense amount must be positive');

    const sorted = contributors
        .map((c) => ({ ...c, avail: toBigIntKopecks(c.available_kopecks, 'available_kopecks') }))
        .filter((c) => c.avail > 0n)
        .sort((a, b) => {
            const ta = new Date(a.created_at).getTime();
            const tb = new Date(b.created_at).getTime();
            if (ta !== tb) return ta - tb;
            return a.id - b.id;
        });

    let remaining = target;
    const allocations = [];
    for (const c of sorted) {
        if (remaining === 0n) break;
        const take = c.avail >= remaining ? remaining : c.avail;
        allocations.push({
            contribution_id: c.id,
            amount_kopecks: take,
            legal_right_type: c.legal_right_type || 'observer_trace',
        });
        remaining -= take;
    }

    if (remaining > 0n) {
        const err = new Error(`Insufficient available funds: short by ${remaining.toString()} kopecks`);
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
    }

    return allocations;
}

/**
 * Exact BigInt Explicit Allocation: merges duplicate contribution_id lines,
 * checks sum === expenseKopecks and each contribution has sufficient available_kopecks.
 */
function allocateExplicitBigInt(expenseKopecks, lines, contributorsById) {
    const target = toBigIntKopecks(expenseKopecks, 'expense_kopecks');
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error('Explicit allocation requires non-empty allocations array');
    }

    const merged = new Map();
    for (const line of lines) {
        const cid = Number(line.contribution_id);
        const amt = toBigIntKopecks(line.amount_kopecks, 'line.amount_kopecks');
        if (!Number.isInteger(cid) || cid <= 0 || amt <= 0n) {
            throw new Error('Each explicit allocation requires positive integer contribution_id and amount_kopecks');
        }
        merged.set(cid, (merged.get(cid) || 0n) + amt);
    }

    let total = 0n;
    const allocations = [];
    for (const cid of [...merged.keys()].sort((a, b) => a - b)) {
        const amt = merged.get(cid);
        const contrib = contributorsById.get(cid);
        if (!contrib) {
            const err = new Error(`Contribution ${cid} not found or ineligible`);
            err.code = 'CONTRIBUTION_NOT_FOUND';
            throw err;
        }
        const avail = toBigIntKopecks(contrib.available_kopecks, 'available_kopecks');
        if (amt > avail) {
            const err = new Error(`Contribution ${cid} has only ${avail.toString()} kopecks available, requested ${amt.toString()}`);
            err.code = 'INSUFFICIENT_FUNDS';
            throw err;
        }
        total += amt;
        allocations.push({
            contribution_id: cid,
            amount_kopecks: amt,
            legal_right_type: contrib.legal_right_type || 'observer_trace',
        });
    }

    if (total !== target) {
        const err = new Error(`Explicit allocation sum (${total.toString()}) must equal expense amount (${target.toString()})`);
        err.code = 'ALLOCATION_SUM_MISMATCH';
        throw err;
    }

    return allocations;
}

function buildFinancingShareLabel(allocKopecks, expenseKopecks, legalRightType) {
    const a = BigInt(allocKopecks);
    const e = BigInt(expenseKopecks);
    if (e > 0n && e % a === 0n) {
        const denom = e / a;
        if (legalRightType === 'direct_fraction') {
            return `Прямая доля 1/${denom.toString()} (финансирование 1/${denom.toString()})`;
        }
        if (legalRightType === 'cooperative_share') {
            return `Участие в финансировании 1/${denom.toString()} (право по правилам пая)`;
        }
        return `Отслеживание вклада: 1/${denom.toString()} финансирования (наблюдатель)`;
    }
    const pct = Number((a * 10000n) / (e > 0n ? e : 1n)) / 100;
    if (legalRightType === 'direct_fraction') {
        return `Прямая доля ${pct.toFixed(2)}%`;
    }
    if (legalRightType === 'cooperative_share') {
        return `Участие в финансировании ${pct.toFixed(2)}% (право по правилам пая)`;
    }
    return `Отслеживание вклада: ${pct.toFixed(2)}% финансирования (наблюдатель)`;
}

/**
 * Evaluate a single governance chamber against frozen snapshots and ballots.
 * - Counts explicit abstentions for turnout/quorum.
 * - Excludes abstentions from affirmative denominator.
 * - Winning option must strictly exceed 50% of non-abstaining weight (ties fail!).
 */
function evaluateChamber({ chamberName, eligibleWeight, quorumPct, optionsCount, abstainIndex, ballots }) {
    const eligible = BigInt(eligibleWeight);
    const optionTotals = Array.from({ length: optionsCount }, () => 0n);
    let turnoutWeight = 0n;
    let abstainWeight = 0n;

    for (const b of ballots) {
        const w = BigInt(b.weight_applied);
        if (b.option_index < 0 || b.option_index >= optionsCount) continue;
        optionTotals[b.option_index] += w;
        turnoutWeight += w;
        if (abstainIndex !== null && abstainIndex !== undefined && b.option_index === abstainIndex) {
            abstainWeight += w;
        }
    }

    if (eligible <= 0n) {
        return {
            chamber: chamberName,
            eligible_weight: '0',
            turnout_weight: '0',
            abstain_weight: '0',
            quorum_pct: quorumPct,
            quorum_met: false,
            passed: false,
            winning_option_index: null,
            reason: 'empty_chamber',
            option_totals: optionTotals.map((t) => t.toString()),
        };
    }

    const quorumMet = turnoutWeight * 100n >= eligible * BigInt(quorumPct);
    const nonAbstainWeight = turnoutWeight - abstainWeight;

    let bestIndex = null;
    let bestWeight = 0n;
    let tie = false;

    for (let i = 0; i < optionsCount; i++) {
        if (abstainIndex !== null && abstainIndex !== undefined && i === abstainIndex) continue;
        const w = optionTotals[i];
        if (w > bestWeight) {
            bestWeight = w;
            bestIndex = i;
            tie = false;
        } else if (w > 0n && w === bestWeight) {
            tie = true;
        }
    }

    // Strict >50% of non-abstaining weight (bestWeight * 2 > nonAbstainWeight)
    const strictMajority = !tie && bestIndex !== null && nonAbstainWeight > 0n && (bestWeight * 2n > nonAbstainWeight);
    const passed = quorumMet && strictMajority;

    let reason = 'passed';
    if (!quorumMet) reason = 'quorum_not_met';
    else if (nonAbstainWeight === 0n) reason = 'no_affirmative_votes';
    else if (tie) reason = 'tie';
    else if (!strictMajority) reason = 'no_majority';

    return {
        chamber: chamberName,
        eligible_weight: eligible.toString(),
        turnout_weight: turnoutWeight.toString(),
        abstain_weight: abstainWeight.toString(),
        quorum_pct: quorumPct,
        quorum_met: quorumMet,
        passed,
        winning_option_index: passed ? bestIndex : null,
        reason,
        option_totals: optionTotals.map((t) => t.toString()),
    };
}

/**
 * Evaluate full proposal outcome across required chamber(s).
 * For dual_consent: BOTH member and capital chambers must pass AND elect the EXACT SAME winning_option_index.
 */
function evaluateGovernanceOutcome(proposal, snapshots, ballots) {
    const options = Array.isArray(proposal.options) ? proposal.options : [];
    const optionsCount = options.length;
    const abstainIndex = proposal.abstain_option_index ?? null;

    const memberEligible = snapshots
        .filter((s) => s.can_vote_member)
        .reduce((acc, s) => acc + BigInt(s.member_weight || 0), 0n);
    const capitalEligible = snapshots
        .filter((s) => s.can_vote_capital)
        .reduce((acc, s) => acc + BigInt(s.capital_weight_kopecks || 0), 0n);

    const memberBallots = ballots.filter((b) => b.chamber === 'member');
    const capitalBallots = ballots.filter((b) => b.chamber === 'capital');

    if (proposal.vote_type === 'council_election') {
        const memberRes = evaluateChamber({
            chamberName: 'member',
            eligibleWeight: memberEligible,
            quorumPct: proposal.quorum_members_pct ?? 50,
            optionsCount,
            abstainIndex,
            ballots: memberBallots,
        });
        return {
            adopted: memberRes.passed,
            winning_option_index: memberRes.winning_option_index,
            reason: memberRes.reason,
            chambers: { member: memberRes },
        };
    }

    if (proposal.vote_type === 'capital_vote') {
        const capitalRes = evaluateChamber({
            chamberName: 'capital',
            eligibleWeight: capitalEligible,
            quorumPct: proposal.quorum_capital_pct ?? 50,
            optionsCount,
            abstainIndex,
            ballots: capitalBallots,
        });
        return {
            adopted: capitalRes.passed,
            winning_option_index: capitalRes.winning_option_index,
            reason: capitalRes.reason,
            chambers: { capital: capitalRes },
        };
    }

    // dual_consent: BOTH chambers must pass AND agree on the EXACT SAME option_index
    const memberRes = evaluateChamber({
        chamberName: 'member',
        eligibleWeight: memberEligible,
        quorumPct: proposal.quorum_members_pct ?? 50,
        optionsCount,
        abstainIndex,
        ballots: memberBallots,
    });
    const capitalRes = evaluateChamber({
        chamberName: 'capital',
        eligibleWeight: capitalEligible,
        quorumPct: proposal.quorum_capital_pct ?? 50,
        optionsCount,
        abstainIndex,
        ballots: capitalBallots,
    });

    const sameWinner =
        memberRes.passed &&
        capitalRes.passed &&
        memberRes.winning_option_index !== null &&
        memberRes.winning_option_index === capitalRes.winning_option_index;

    let reason = 'adopted';
    if (!memberRes.passed && !capitalRes.passed) reason = 'both_chambers_failed';
    else if (!memberRes.passed) reason = `member_chamber_${memberRes.reason}`;
    else if (!capitalRes.passed) reason = `capital_chamber_${capitalRes.reason}`;
    else if (!sameWinner) reason = 'chamber_winner_mismatch';

    return {
        adopted: sameWinner,
        winning_option_index: sameWinner ? memberRes.winning_option_index : null,
        reason,
        chambers: { member: memberRes, capital: capitalRes },
    };
}

/**
 * Reconcile external Loomio or Belenios export against frozen Sloboda voter snapshots.
 * Throws { code: 'RECONCILIATION_FAILED', status: 409 } on ANY discrepancy.
 */
function reconcileExternalTally(proposal, snapshots, payload) {
    const engine = payload.engine || proposal.authoritative_engine;
    const fail = (message) => {
        const err = new Error(message);
        err.code = 'RECONCILIATION_FAILED';
        err.status = 409;
        throw err;
    };

    if (payload.roster_hash && payload.roster_hash !== proposal.roster_hash) {
        fail(`Roster hash mismatch: expected ${proposal.roster_hash}, got ${payload.roster_hash}`);
    }

    if (engine === 'loomio') {
        if (!Array.isArray(payload.ballots)) {
            fail('Loomio reconciliation requires per-voter ballots array');
        }
        const chamber = payload.chamber || (proposal.vote_type === 'capital_vote' ? 'capital' : 'member');
        const snapByUser = new Map(snapshots.map((s) => [Number(s.user_id), s]));
        const seenUsers = new Set();
        const verifiedBallots = [];

        for (const item of payload.ballots) {
            const uid = Number(item.user_id);
            if (seenUsers.has(uid)) {
                fail(`Duplicate external ballot for user_id=${uid}`);
            }
            seenUsers.add(uid);

            const snap = snapByUser.get(uid);
            if (!snap) {
                fail(`Unknown voter in external tally: user_id=${uid} not in frozen snapshot`);
            }
            const expectedWeight = chamber === 'capital'
                ? BigInt(snap.capital_weight_kopecks || 0)
                : BigInt(snap.member_weight || 0);
            const eligible = chamber === 'capital' ? snap.can_vote_capital : snap.can_vote_member;
            if (!eligible || expectedWeight <= 0n) {
                fail(`Ineligible voter in external tally: user_id=${uid} cannot vote in chamber=${chamber}`);
            }
            const reportedWeight = toBigIntKopecks(item.weight, 'ballot.weight');
            if (reportedWeight !== expectedWeight) {
                fail(`Weight tampering detected for user_id=${uid}: frozen=${expectedWeight.toString()}, external=${reportedWeight.toString()}`);
            }
            const optIdx = Number(item.option_index);
            if (!Number.isInteger(optIdx) || optIdx < 0 || optIdx >= proposal.options.length) {
                fail(`Invalid option_index=${item.option_index} for user_id=${uid}`);
            }
            verifiedBallots.push({
                chamber,
                option_index: optIdx,
                weight_applied: expectedWeight.toString(),
            });
        }

        const recomputed = evaluateGovernanceOutcome(proposal, snapshots, verifiedBallots);
        return {
            verified: true,
            engine: 'loomio',
            ballots_verified: verifiedBallots.length,
            recomputed,
        };
    }

    if (engine === 'belenios') {
        if (!payload.election_fingerprint) {
            fail('Belenios reconciliation requires election_fingerprint');
        }
        if (proposal.external_election_fingerprint && payload.election_fingerprint !== proposal.external_election_fingerprint) {
            fail('Belenios election_fingerprint does not match frozen proposal');
        }
        if (!payload.roster_hash || payload.roster_hash !== proposal.roster_hash) {
            fail('Belenios reconciliation requires matching frozen roster_hash');
        }
        if (!Array.isArray(payload.option_counts) || payload.option_counts.length !== proposal.options.length) {
            fail('Belenios option_counts must match proposal options length');
        }
        const eligibleCount = snapshots.filter((s) => s.can_vote_member).length;
        const totalBallots = payload.option_counts.reduce((acc, n) => acc + Number(n), 0);
        if (totalBallots > eligibleCount || payload.option_counts.some((n) => !Number.isInteger(n) || n < 0)) {
            fail(`Belenios tally count (${totalBallots}) exceeds frozen eligible voters (${eligibleCount}) or contains invalid counts`);
        }

        const syntheticBallots = [];
        payload.option_counts.forEach((count, optIdx) => {
            if (count > 0) {
                syntheticBallots.push({
                    chamber: 'member',
                    option_index: optIdx,
                    weight_applied: String(count),
                });
            }
        });
        const recomputed = evaluateGovernanceOutcome(proposal, snapshots, syntheticBallots);
        return {
            verified: true,
            engine: 'belenios',
            election_fingerprint: payload.election_fingerprint,
            total_ballots: totalBallots,
            recomputed,
        };
    }

    fail(`Unsupported external engine: ${engine}`);
}

module.exports = {
    canonicalize,
    canonicalJson,
    sha256Hex,
    toBigIntKopecks,
    formatKopecks,
    formatRublesString,
    allocateProportionalBigInt,
    allocateFifoBigInt,
    allocateExplicitBigInt,
    buildFinancingShareLabel,
    evaluateChamber,
    evaluateGovernanceOutcome,
    reconcileExternalTally,
};
