import axios from 'axios'

export interface SettlementDomain {
  code: string
  name: string
}

export const SETTLEMENT_DOMAINS: readonly SettlementDomain[] = [
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
]

export function getDomainLabel(code: string): string {
  const found = SETTLEMENT_DOMAINS.find((d) => d.code === code)
  return found ? `${found.code} — ${found.name}` : code
}

export type MembershipStatus = 'observer' | 'applicant' | 'accepted' | 'suspended'
export type ApplicationStatus =
  | 'pending'
  | 'in_review'
  | 'accepted'
  | 'revision_requested'
  | 'rejected'

export interface MembershipInfo {
  id: number
  email: string
  name: string
  membership_status: MembershipStatus
  membership_admitted_at: string | null
  settlement_id: string
}

export interface MemberApplication {
  id: number
  user_id: number | null
  settlement_id: string
  full_name: string
  email: string
  city: string | null
  primary_domain: string
  skills: string | null
  motivation: string | null
  trial_task_title: string | null
  trial_task_url: string | null
  status: ApplicationStatus
  version: number
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface PortfolioItem {
  id: number
  user_id: number | null
  application_id: number
  title: string
  domain_code: string
  summary: string | null
  artifact_url: string | null
  verified: boolean
  created_at: string
}

export interface MyApplicationResponse {
  success: boolean
  application: MemberApplication | null
  portfolio: PortfolioItem[]
  membership: MembershipInfo | null
}

export type VoteType = 'council_election' | 'capital_vote' | 'dual_consent'
export type ProposalStatus = 'draft' | 'open' | 'closed'
export type VoteChamber = 'member' | 'capital'

export interface VoterEligibility {
  can_vote_member: boolean
  member_weight: number
  can_vote_capital: boolean
  capital_weight_kopecks: string
}

export interface ChamberOutcome {
  chamber: VoteChamber
  eligible_weight: string
  turnout_weight: string
  abstain_weight: string
  quorum_pct: number
  quorum_met: boolean
  passed: boolean
  winning_option_index: number | null
  reason: string
  option_totals: string[]
}

export interface ProposalProtocol {
  proposal_id: number
  title: string
  vote_type: VoteType
  settlement_id: string
  secret_ballot: boolean
  roster_hash: string | null
  outcome: {
    adopted: boolean
    winning_option_index: number | null
    reason: string
    majority_rule?: string
    quorum_rule?: string
    mandate_auto_issued?: boolean
    secrecy_boundary?: string
    chambers: {
      member?: ChamberOutcome
      capital?: ChamberOutcome
    }
  }
  closed_at: string
}

export interface GovernanceProposal {
  id: number
  title: string
  description: string | null
  vote_type: VoteType
  scope_level: string
  settlement_id: string
  authoritative_engine: string
  secret_ballot: boolean
  share_class: string | null
  terms_version: string | null
  seats_count: number
  options: string[]
  abstain_option_index: number | null
  status: ProposalStatus
  quorum_members_pct: number
  quorum_capital_pct: number
  roster_hash: string | null
  protocol_hash: string | null
  protocol_json: ProposalProtocol | null
  adopted: boolean | null
  winning_option_index: number | null
  opened_at: string | null
  closes_at: string | null
  closed_at: string | null
  created_at: string
  my_eligibility?: VoterEligibility | null
}

export interface MoneyValue {
  kopecks: number | null
  kopecks_str: string
  rubles_str: string
}

export type LegalRightType = 'observer_trace' | 'cooperative_share' | 'direct_fraction'

export interface ExpenseAllocation {
  allocation_id: number
  expense_id: number
  expense_title: string
  expense_category: string
  expense_total: MoneyValue
  allocated: MoneyValue
  allocation_rule: string
  financing_share_label: string
  legal_right_type: LegalRightType | string
  asset_name: string | null
  asset_location: string | null
  receipt_url: string | null
  photo_url: string | null
  expense_status: string
  paid_at: string | null
}

export interface LedgerContribution {
  id: number
  user_id: number | null
  settlement_id: string
  purpose: string
  contributor_name: string
  received: MoneyValue
  available: MoneyValue
  reserved: MoneyValue
  paid: MoneyValue
  refunded: MoneyValue
  share_class: string | null
  terms_version: string
  legal_right_type: LegalRightType | string
  status: string
  ledger_mode: string
  payment_ref: string | null
  note: string | null
  created_at: string
  allocations: ExpenseAllocation[]
}

export interface MyLedgerData {
  totals: {
    received: MoneyValue
    available: MoneyValue
    reserved: MoneyValue
    paid: MoneyValue
    refunded: MoneyValue
  }
  contributions: LedgerContribution[]
}

export interface ConstructionMilestone {
  id: number
  settlement_id: string
  code: string
  title: string
  category: string
  unit: string
  planned_qty: number
  actual_qty: number
  budget: MoneyValue
  spent: MoneyValue
  status: string
  photo_url: string | null
  updated_at: string
}

export interface AdminApplicationItem extends MemberApplication {
  portfolio?: PortfolioItem[]
}

export interface PublicLedgerExpenseSummary {
  id: number
  title: string
  category: string
  amount: MoneyValue
  asset_name: string | null
  asset_location: string | null
  photo_url: string | null
  status: string
  paid_at: string | null
}

export interface PublicLedgerSummary {
  settlement_id: string
  totals: {
    received: MoneyValue
    available: MoneyValue
    reserved: MoneyValue
    paid: MoneyValue
    refunded: MoneyValue
    contributions_count: number
  }
  milestones: ConstructionMilestone[]
  recent_expenses: PublicLedgerExpenseSummary[]
}

export interface AdminLedgerExpense {
  id: number
  settlement_id: string
  purpose: string
  title: string
  category: string
  amount: MoneyValue
  milestone_id: number | null
  asset_name: string | null
  asset_location: string | null
  receipt_url: string | null
  photo_url: string | null
  allocation_rule: string
  status: string
  financial_status?: string
  dispute_status?: string
  version?: number
  paid_at: string | null
  created_at: string
  allocation_ledger_modes?: string[]
  allocations?: Array<{
    id: number
    contribution_id: number
    amount: MoneyValue
    allocation_rule: string
    financing_share_label: string
    legal_right_type: string
  }>
}

export interface LedgerModeTotals {
  received: MoneyValue
  available?: MoneyValue
  reserved?: MoneyValue
  paid?: MoneyValue
  refunded?: MoneyValue
  contributions_count: number
}

export interface AdminLedgerSummary {
  settlement_id: string
  settlements?: string[]
  totals: {
    received: MoneyValue
    available: MoneyValue
    reserved: MoneyValue
    paid: MoneyValue
    refunded: MoneyValue
    contributions_count: number
  }
  by_ledger_mode?: Record<string, LedgerModeTotals>
  milestones?: ConstructionMilestone[]
  recent_expenses?: PublicLedgerExpenseSummary[]
}

/** Validates same-origin relative redirect paths (must start with '/' and not '//' or normalized '/api', no backslashes, '..' traversal, or control chars) */
export function getSafeRedirectPath(
  raw: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!raw) return fallback
  const trimmed = raw.trim()
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    /%2f|%5c|%00/i.test(trimmed)
  ) {
    return fallback
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return fallback
    }
  }
  try {
    const parsed = new URL(trimmed, 'http://sloboda.local')
    if (parsed.origin !== 'http://sloboda.local') return fallback
    const rawPath = trimmed.split(/[?#]/)[0]
    if (rawPath.split('/').some((seg) => seg === '..')) return fallback
    const decodedPath = decodeURIComponent(parsed.pathname)
    if (
      /^\/api(\/|$)/i.test(parsed.pathname) ||
      /^\/api(\/|$)/i.test(decodedPath) ||
      decodedPath.includes('\\') ||
      decodedPath.split('/').some((seg) => seg === '..')
    ) {
      return fallback
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

/** Converts a positive decimal ruble string (up to 2 decimal places) to an integer kopeck string */
export function rublesToKopecksString(input: string): string | null {
  const normalized = input.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [rubStr, kopStr = ''] = normalized.split('.')
  const kopecks = BigInt(rubStr) * 100n + BigInt(kopStr.padEnd(2, '0'))
  if (kopecks <= 0n) return null
  return kopecks.toString()
}

/** Validates user-supplied URLs so only http(s) or site-relative paths are rendered as links */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (trimmed.startsWith('/')) return trimmed
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}

export function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    if (typeof data?.error === 'string' && data.error.trim().length > 0) {
      return data.error
    }
    if (typeof data?.message === 'string' && data.message.trim().length > 0) {
      return data.message
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}

export function formatKopeckStringToRubles(kopecksStr: string): string {
  try {
    const bi = BigInt(kopecksStr)
    const neg = bi < 0n
    const abs = neg ? -bi : bi
    const rub = abs / 100n
    const kop = abs % 100n
    return `${neg ? '-' : ''}${rub.toLocaleString('ru-RU')}.${kop.toString().padStart(2, '0')} ₽`
  } catch {
    return `${kopecksStr} коп.`
  }
}
