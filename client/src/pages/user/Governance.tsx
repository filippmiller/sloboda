import { useState, useEffect } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  EyeOff,
  FileText,
  Hash,
  Lock,
  Scale,
  Users,
  Vote,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/services/api'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import {
  extractApiError,
  formatKopeckStringToRubles,
  type ChamberOutcome,
  type GovernanceProposal,
  type ProposalStatus,
  type VoteChamber,
  type VoteType,
} from '@/types/core'

const VOTE_TYPE_META: Record<
  VoteType,
  { label: string; badge: string; variant: 'info' | 'warning' | 'success' }
> = {
  council_election: {
    label: 'Выборы совета',
    badge: '1p1v (1 чел. = 1 голос)',
    variant: 'info',
  },
  capital_vote: {
    label: 'Имущественное голосование',
    badge: 'weighted (по доле капитала)',
    variant: 'warning',
  },
  dual_consent: {
    label: 'Двухпалатное согласие',
    badge: 'two-chamber (участники + капитал)',
    variant: 'success',
  },
}

const STATUS_META: Record<
  ProposalStatus,
  { label: string; variant: 'default' | 'success' | 'info' }
> = {
  draft: { label: 'Черновик', variant: 'default' },
  open: { label: 'Открыто', variant: 'success' },
  closed: { label: 'Завершено', variant: 'info' },
}

const OUTCOME_REASON_LABELS: Record<string, string> = {
  passed: 'Принято',
  adopted: 'Принято двумя палатами',
  quorum_not_met: 'Не набран кворум',
  no_affirmative_votes: 'Нет голосов «за» (только воздержавшиеся)',
  tie: 'Равенство голосов (ничья)',
  no_majority: 'Нет строгого большинства (>50%)',
  empty_chamber: 'В палате нет избирателей',
  both_chambers_failed: 'Обе палаты не набрали большинство/кворум',
  chamber_winner_mismatch: 'Палаты выбрали разные варианты',
}

const ENGINE_LABELS: Record<string, string> = {
  native_named: 'Нативное открытое',
  native_secret: 'Нативное тайное',
}

const MAJORITY_RULE_LABELS: Record<string, string> = {
  strict_majority_of_non_abstain_cast_weight:
    'Строгое большинство (>50%) от голосов без учёта воздержавшихся',
}

const QUORUM_RULE_LABELS: Record<string, string> = {
  turnout_including_abstain_pct_of_eligible:
    'Явка (включая воздержавшихся) в % от замороженного списка правомочных',
}

const SECRET_BALLOT_BOUNDARY_NOTE =
  'Индивидуальный выбор скрыт от других участников и не публикуется в протоколе; сервер проверяет допуск при приёме голоса (защита от оператора сервера/БД и деанонимизации при единогласном/единичном голосовании не заявляется).'

function shortenHash(hash: string | null): string {
  if (!hash) return '—'
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function formatWeight(chamber: VoteChamber, rawWeight: string): string {
  if (chamber === 'capital') {
    return formatKopeckStringToRubles(rawWeight)
  }
  return `${rawWeight} гол.`
}

interface VoteSelection {
  optionIndex: number | null
  chamber: VoteChamber
}

interface ChamberReceipt {
  chamber: VoteChamber
  secret: boolean
  ballotHash?: string
}

export default function Governance() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<GovernanceProposal[]>([])
  const [selections, setSelections] = useState<Record<number, VoteSelection>>({})
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [receipts, setReceipts] = useState<Record<number, ChamberReceipt[]>>({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await api.get<{ success: boolean; proposals: GovernanceProposal[] }>(
          '/governance/proposals',
        )
        const baseList = res.data.proposals ?? []

        // PG-mode list endpoint omits per-user snapshot eligibility; enrich open and closed proposals via detail endpoint
        const enriched = await Promise.all(
          baseList.map(async (p) => {
            if ((p.status === 'open' || p.status === 'closed') && p.my_eligibility === null) {
              try {
                const detailRes = await api.get<{
                  success: boolean
                  proposal: GovernanceProposal
                }>(`/governance/proposals/${p.id}`)
                return detailRes.data.proposal ?? p
              } catch {
                return { ...p, my_eligibility: undefined }
              }
            }
            return p
          }),
        )

        if (cancelled) return
        setProposals(enriched)

        const initialSelections: Record<number, VoteSelection> = {}
        for (const p of enriched) {
          const defaultChamber: VoteChamber = p.my_eligibility?.can_vote_member
            ? 'member'
            : p.my_eligibility?.can_vote_capital
              ? 'capital'
              : p.vote_type === 'capital_vote'
                ? 'capital'
                : 'member'
          initialSelections[p.id] = {
            optionIndex: null,
            chamber: defaultChamber,
          }
        }
        setSelections(initialSelections)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(extractApiError(err, 'Не удалось загрузить голосования'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const updateSelection = (proposalId: number, patch: Partial<VoteSelection>) => {
    setSelections((prev) => {
      const current = prev[proposalId] ?? { optionIndex: null, chamber: 'member' }
      return {
        ...prev,
        [proposalId]: { ...current, ...patch },
      }
    })
  }

  const handleVote = async (proposal: GovernanceProposal) => {
    const sel = selections[proposal.id]
    if (!sel || sel.optionIndex === null) {
      toast.error('Выберите вариант голосования')
      return
    }

    setSubmittingId(proposal.id)
    try {
      const res = await api.post<{
        success: boolean
        recorded: boolean
        secret: boolean
        chamber: VoteChamber
        weight_applied: string
        ballot_hash?: string
      }>(`/governance/proposals/${proposal.id}/vote`, {
        option_index: sel.optionIndex,
        chamber: sel.chamber,
      })

      setReceipts((prev) => ({
        ...prev,
        [proposal.id]: [
          ...(prev[proposal.id] ?? []).filter((r) => r.chamber !== res.data.chamber),
          {
            chamber: res.data.chamber,
            secret: res.data.secret,
            ballotHash: res.data.ballot_hash,
          },
        ],
      }))

      toast.success(
        res.data.secret
          ? `Тайный голос учтён в палате «${res.data.chamber === 'member' ? 'Участники' : 'Капитал'}»`
          : `Голос учтён в палате «${res.data.chamber === 'member' ? 'Участники' : 'Капитал'}»`,
      )
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Не удалось отправить голос'))
    } finally {
      setSubmittingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display mb-2">Голосования и советы</h1>
        <p className="text-text-secondary text-sm">
          Двухконтурное управление: палата участников (1 человек = 1 голос) и палата капитала с
          криптографически проверяемым списком избирателей и протоколом.
        </p>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {proposals.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <Vote size={36} className="text-text-muted" />
            <p className="text-text-secondary text-sm">Пока нет активных или завершённых голосований.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {proposals.map((proposal) => {
            const voteMeta = VOTE_TYPE_META[proposal.vote_type] ?? {
              label: proposal.vote_type,
              badge: proposal.vote_type,
              variant: 'default' as const,
            }
            const statusMeta = STATUS_META[proposal.status] ?? {
              label: proposal.status,
              variant: 'default' as const,
            }
            const elig = proposal.my_eligibility
            const canVoteMember = Boolean(elig?.can_vote_member && elig.member_weight > 0)
            const canVoteCapital = Boolean(
              elig?.can_vote_capital && BigInt(elig.capital_weight_kopecks || '0') > 0n,
            )
            const isEligible = canVoteMember || canVoteCapital
            const sel = selections[proposal.id] ?? {
              optionIndex: null,
              chamber: canVoteMember ? 'member' : 'capital',
            }
            const proposalReceipts = receipts[proposal.id] ?? []

            return (
              <Card key={proposal.id} className="space-y-5">
                {/* Title + Badges */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusMeta.variant} dot pulse={proposal.status === 'open'}>
                      {statusMeta.label}
                    </Badge>
                    <Badge variant={voteMeta.variant}>
                      <Scale size={12} /> {voteMeta.label} · {voteMeta.badge}
                    </Badge>
                    {proposal.secret_ballot ? (
                      <Badge variant="warning">
                        <EyeOff size={12} /> Тайное голосование
                      </Badge>
                    ) : (
                      <Badge variant="default">Открытое голосование</Badge>
                    )}
                    {proposal.share_class && (
                      <Badge variant="default">Класс пая: {proposal.share_class}</Badge>
                    )}
                  </div>

                  <h2 className="text-lg font-semibold font-display text-text">
                    #{proposal.id} {proposal.title}
                  </h2>

                  {proposal.description && (
                    <p className="text-sm text-text-secondary whitespace-pre-line">
                      {proposal.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted pt-1">
                    <span className="inline-flex items-center gap-1" title={proposal.roster_hash ?? undefined}>
                      <Hash size={12} />
                      Список избирателей: <code className="text-text-secondary">{shortenHash(proposal.roster_hash)}</code>
                    </span>
                    {proposal.closes_at && (
                      <span>
                        Дедлайн: {new Date(proposal.closes_at).toLocaleString('ru-RU')}
                      </span>
                    )}
                    <span>
                      Движок:{' '}
                      {ENGINE_LABELS[proposal.authoritative_engine] ??
                        proposal.authoritative_engine}
                    </span>
                  </div>

                  {proposal.secret_ballot && (
                    <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-text-secondary flex items-start gap-2">
                      <EyeOff size={14} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>{SECRET_BALLOT_BOUNDARY_NOTE}</span>
                    </div>
                  )}
                </div>

                {/* Caller Eligibility */}
                <div className="p-3 rounded-lg bg-bg-elevated/70 border border-border text-xs space-y-1">
                  <div className="font-medium text-text flex items-center gap-1.5">
                    <Users size={14} className="text-accent" />
                    Ваше право голоса:
                  </div>
                  {elig ? (
                    <div className="space-y-1">
                      {proposal.status === 'closed' && (
                        <p className="text-text font-medium">
                          Вы были в замороженном списке избирателей
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3 text-text-secondary">
                        <span>
                          Палата участников:{' '}
                          {canVoteMember ? (
                            <strong className="text-green">
                              {proposal.status === 'closed' ? 'Был допуск' : 'Доступна'} (
                              {elig.member_weight} голос)
                            </strong>
                          ) : (
                            <span>{proposal.status === 'closed' ? 'допуска не было' : 'нет допуска'}</span>
                          )}
                        </span>
                        <span>·</span>
                        <span>
                          Палата капитала:{' '}
                          {canVoteCapital ? (
                            <strong className="text-green">
                              {proposal.status === 'closed' ? 'Был допуск' : 'Доступна'} (
                              {formatKopeckStringToRubles(elig.capital_weight_kopecks)})
                            </strong>
                          ) : (
                            <span>{proposal.status === 'closed' ? 'доли не было' : 'нет доли'}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ) : elig === undefined ? (
                    <p className="text-text-muted">Данные о личном допуске не загружены</p>
                  ) : (
                    <p className="text-text-muted">
                      {proposal.status === 'draft'
                        ? 'Список избирателей будет зафиксирован при открытии голосования.'
                        : proposal.status === 'closed'
                          ? 'Вы не входили в замороженный список этого голосования'
                          : 'Вы не включены в замороженный список избирателей этого голосования.'}
                    </p>
                  )}
                </div>

                {/* Open Proposal Voting UI */}
                {proposal.status === 'open' && (
                  <div className="space-y-4">
                    {isEligible ? (
                      <>
                        {/* Chamber selection */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-text-secondary">Палата голосования:</p>
                          <div className="flex flex-wrap gap-2">
                            {canVoteMember && (
                              <button
                                type="button"
                                onClick={() => updateSelection(proposal.id, { chamber: 'member' })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  sel.chamber === 'member'
                                    ? 'bg-accent/15 border-accent text-accent'
                                    : 'bg-bg-elevated border-border text-text-secondary hover:text-text'
                                }`}
                              >
                                Палата участников ({elig?.member_weight ?? 1} голос)
                              </button>
                            )}
                            {canVoteCapital && (
                              <button
                                type="button"
                                onClick={() => updateSelection(proposal.id, { chamber: 'capital' })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  sel.chamber === 'capital'
                                    ? 'bg-accent/15 border-accent text-accent'
                                    : 'bg-bg-elevated border-border text-text-secondary hover:text-text'
                                }`}
                              >
                                Палата капитала ({formatKopeckStringToRubles(elig?.capital_weight_kopecks ?? '0')})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-text-secondary">Варианты ответа:</p>
                          <div className="space-y-2">
                            {proposal.options.map((opt, idx) => {
                              const isAbstain = proposal.abstain_option_index === idx
                              const checked = sel.optionIndex === idx
                              return (
                                <label
                                  key={idx}
                                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    checked
                                      ? 'bg-accent/10 border-accent text-text'
                                      : 'bg-bg-elevated/40 border-border text-text-secondary hover:border-border-hover hover:text-text'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`proposal-${proposal.id}-option`}
                                    checked={checked}
                                    onChange={() =>
                                      updateSelection(proposal.id, { optionIndex: idx })
                                    }
                                    className="accent-[var(--color-accent)]"
                                  />
                                  <span className="text-sm font-medium flex-1">{opt}</span>
                                  {isAbstain && (
                                    <Badge variant="default">Воздержаться</Badge>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {proposalReceipts.length > 0 && (
                          <div className="space-y-1.5">
                            {proposalReceipts.map((r) => (
                              <div
                                key={r.chamber}
                                className="p-2.5 rounded-lg bg-green/10 border border-green/20 text-xs text-green flex items-center justify-between gap-2 flex-wrap"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <CheckCircle2 size={14} />
                                  Голос учтён ({r.chamber === 'member' ? 'Участники' : 'Капитал'})
                                </span>
                                {r.ballotHash && (
                                  <code className="text-[11px]" title={r.ballotHash}>
                                    Квитанция: {shortenHash(r.ballotHash)}
                                  </code>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          {proposal.secret_ballot && (
                            <span className="text-xs text-text-muted inline-flex items-center gap-1">
                              <Lock size={12} />
                              В тайном голосовании выбор нельзя изменить после отправки.
                            </span>
                          )}
                          <Button
                            type="button"
                            onClick={() => handleVote(proposal)}
                            loading={submittingId === proposal.id}
                            disabled={sel.optionIndex === null}
                            className="ml-auto"
                          >
                            Проголосовать
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-text-muted">Варианты голосования:</p>
                        <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                          {(Array.isArray(proposal.options) ? proposal.options : []).map((opt, idx) => (
                            <li key={idx}>{opt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Closed Proposal Verdict & Protocol */}
                {proposal.status === 'closed' && (
                  <div className="pt-4 border-t border-border space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {proposal.adopted ? (
                          <Badge variant="success">
                            <CheckCircle2 size={13} /> Решение принято (adopted: true)
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <XCircle size={13} /> Не принято (adopted: false)
                          </Badge>
                        )}
                        {proposal.winning_option_index !== null &&
                          proposal.options[proposal.winning_option_index] && (
                            <span className="text-sm font-medium text-text">
                              Победитель: «{proposal.options[proposal.winning_option_index]}»
                            </span>
                          )}
                      </div>

                      {proposal.protocol_hash && (
                        <span
                          className="text-xs text-text-muted inline-flex items-center gap-1"
                          title={proposal.protocol_hash}
                        >
                          <FileText size={12} />
                          Протокол: <code>{shortenHash(proposal.protocol_hash)}</code>
                        </span>
                      )}
                    </div>

                    {proposal.protocol_json?.outcome && (
                      <div className="space-y-3">
                        <div className="space-y-1 text-xs text-text-secondary">
                          <p>
                            Основание:{' '}
                            <span className="text-text font-medium">
                              {OUTCOME_REASON_LABELS[proposal.protocol_json.outcome.reason] ??
                                proposal.protocol_json.outcome.reason}
                            </span>
                          </p>
                          {proposal.protocol_json.outcome.majority_rule && (
                            <p>
                              Правило большинства:{' '}
                              <span className="text-text">
                                {MAJORITY_RULE_LABELS[
                                  proposal.protocol_json.outcome.majority_rule
                                ] ?? proposal.protocol_json.outcome.majority_rule}
                              </span>
                            </p>
                          )}
                          {proposal.protocol_json.outcome.quorum_rule && (
                            <p>
                              Правило кворума:{' '}
                              <span className="text-text">
                                {QUORUM_RULE_LABELS[proposal.protocol_json.outcome.quorum_rule] ??
                                  proposal.protocol_json.outcome.quorum_rule}
                              </span>
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(['member', 'capital'] as const).map((chamberKey) => {
                            const chamberData: ChamberOutcome | undefined =
                              proposal.protocol_json?.outcome.chambers?.[chamberKey]
                            if (!chamberData) return null
                            return (
                              <div
                                key={chamberKey}
                                className="p-3.5 rounded-lg bg-bg-elevated/60 border border-border space-y-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-text">
                                    {chamberKey === 'member'
                                      ? 'Палата участников (1p1v)'
                                      : 'Палата капитала (weighted)'}
                                  </span>
                                  <Badge variant={chamberData.passed ? 'success' : 'danger'}>
                                    {chamberData.passed ? 'Прошла' : 'Не прошла'}
                                  </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
                                  <div>
                                    Явка:{' '}
                                    <span className="text-text">
                                      {formatWeight(chamberKey, chamberData.turnout_weight)}
                                    </span>
                                  </div>
                                  <div>
                                    Всего правомочных:{' '}
                                    <span className="text-text">
                                      {formatWeight(chamberKey, chamberData.eligible_weight)}
                                    </span>
                                  </div>
                                  <div>
                                    Кворум ({chamberData.quorum_pct}%):{' '}
                                    <span
                                      className={
                                        chamberData.quorum_met ? 'text-green' : 'text-red-400'
                                      }
                                    >
                                      {chamberData.quorum_met ? 'Выполнен' : 'Не выполнен'}
                                    </span>
                                  </div>
                                  <div>
                                    Воздержались:{' '}
                                    <span className="text-text">
                                      {formatWeight(chamberKey, chamberData.abstain_weight)}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1 pt-2 border-t border-border/60">
                                  {proposal.options.map((optLabel, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-xs gap-2"
                                    >
                                      <span
                                        className={
                                          chamberData.winning_option_index === idx
                                            ? 'text-green font-medium truncate'
                                            : 'text-text-secondary truncate'
                                        }
                                      >
                                        {optLabel}
                                      </span>
                                      <span className="font-mono text-text shrink-0">
                                        {formatWeight(
                                          chamberKey,
                                          chamberData.option_totals[idx] ?? '0',
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
