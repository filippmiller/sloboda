import { useEffect, useState, useMemo } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import { toast } from 'sonner'
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Map,
  Home,
  Factory,
  Zap,
  Droplets,
  Sprout,
  Beef,
  Warehouse,
  Truck,
  GraduationCap,
  HeartPulse,
  Users,
  Recycle,
  Flame,
  Wifi,
  Coins,
  Scale,
  Building2,
  Milestone,
  ShieldAlert,
  Network,
  Search,
  FileText,
  Layers,
  Hash,
  type LucideIcon,
} from 'lucide-react'

// Icon mapping
const ICON_MAP: Record<string, LucideIcon> = {
  map: Map,
  home: Home,
  factory: Factory,
  zap: Zap,
  droplets: Droplets,
  sprout: Sprout,
  beef: Beef,
  warehouse: Warehouse,
  truck: Truck,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  users: Users,
  recycle: Recycle,
  flame: Flame,
  wifi: Wifi,
  coins: Coins,
  scale: Scale,
  'building-2': Building2,
  milestone: Milestone,
  'shield-alert': ShieldAlert,
  network: Network,
}

const CATEGORY_COLORS: Record<string, string> = {
  infrastructure: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  construction: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  agriculture: 'bg-green-500/10 text-green-400 border-green-500/20',
  social: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  safety: 'bg-red-500/10 text-red-400 border-red-500/20',
  management: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  planning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

const CATEGORY_DOT_COLORS: Record<string, string> = {
  infrastructure: 'bg-blue-400',
  construction: 'bg-orange-400',
  agriculture: 'bg-green-400',
  social: 'bg-purple-400',
  safety: 'bg-red-400',
  management: 'bg-cyan-400',
  planning: 'bg-amber-400',
}

interface DomainSection {
  title: string
  subsections: string[]
}

interface Domain {
  code: string
  num: number
  name: string
  icon: string
  category: string
  lineCount: number
  version: string
  date: string
  status: string
  scale: string
  experts: string[]
  expertCount: number
  sections: DomainSection[]
  sectionCount: number
  subsectionCount: number
  artifactCount: number
  artifactTypes: {
    plan: number
    calc: number
    spec: number
    method: number
    research: number
  }
}

interface CatalogStats {
  domainCount: number
  totalLines: number
  totalSections: number
  totalSubsections: number
  totalArtifacts: number
  categories: Record<string, string>
}

interface CatalogData {
  domains: Domain[]
  stats: CatalogStats
}

function DepthBar({ lineCount, maxLines }: { lineCount: number; maxLines: number }) {
  const pct = Math.min((lineCount / maxLines) * 100, 100)
  let color = 'bg-red-500'
  if (pct > 70) color = 'bg-green-500'
  else if (pct > 40) color = 'bg-yellow-500'

  return (
    <div className="w-full h-1.5 bg-bg-elevated rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-lg bg-accent/10">
        <Icon size={20} className="text-accent" />
      </div>
      <div>
        <p className="text-2xl font-bold text-text font-display">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  )
}

function DomainCard({
  domain,
  maxLines,
  expanded,
  onToggle,
  categoryLabel,
}: {
  domain: Domain
  maxLines: number
  expanded: boolean
  onToggle: () => void
  categoryLabel: string
}) {
  const Icon = ICON_MAP[domain.icon] || BookOpen
  const catColor = CATEGORY_COLORS[domain.category] || 'bg-bg-elevated text-text-muted'
  const dotColor = CATEGORY_DOT_COLORS[domain.category] || 'bg-text-muted'

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-accent/30">
      {/* Header - clickable */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start gap-4 text-left group"
      >
        {/* Number + Icon */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <span className="text-xs font-mono text-text-muted w-5 text-right">{domain.num}.</span>
          <div className={`p-2 rounded-lg ${catColor} border`}>
            <Icon size={18} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text truncate group-hover:text-accent transition-colors">
              {domain.name}
            </h3>
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-mono font-bold text-text-muted bg-bg-elevated rounded">
              {domain.code}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-text-muted mb-2">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              {categoryLabel}
            </span>
            <span>{domain.lineCount.toLocaleString()} строк</span>
            <span>{domain.sectionCount} разд.</span>
            <span>{domain.subsectionCount} подразд.</span>
            {domain.expertCount > 0 && <span>{domain.expertCount} экспертов</span>}
          </div>

          <DepthBar lineCount={domain.lineCount} maxLines={maxLines} />
        </div>

        {/* Expand arrow */}
        <div className="flex-shrink-0 pt-1">
          {expanded ? (
            <ChevronDown size={16} className="text-text-muted" />
          ) : (
            <ChevronRight size={16} className="text-text-muted" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border bg-bg/50 px-5 py-4">
          {/* Meta row */}
          <div className="flex flex-wrap gap-4 mb-4 text-xs text-text-muted">
            <span>Версия: <strong className="text-text">{domain.version}</strong></span>
            <span>Дата: <strong className="text-text">{domain.date}</strong></span>
            <span>Статус: <strong className="text-text">{domain.status}</strong></span>
          </div>

          {/* Experts */}
          {domain.experts.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-text-muted mb-1.5">Экспертная панель:</p>
              <div className="flex flex-wrap gap-1.5">
                {domain.experts.map((expert, i) => (
                  <span key={i} className="px-2 py-0.5 text-[11px] bg-bg-elevated text-text-secondary rounded-md border border-border">
                    {expert}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Artifact counts */}
          {domain.artifactCount > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-text-muted mb-1.5">Артефакты ({domain.artifactCount}):</p>
              <div className="flex flex-wrap gap-2">
                {domain.artifactTypes.plan > 0 && (
                  <span className="px-2 py-0.5 text-[11px] bg-blue-500/10 text-blue-400 rounded-md">
                    Планы/Чертежи: {domain.artifactTypes.plan}
                  </span>
                )}
                {domain.artifactTypes.calc > 0 && (
                  <span className="px-2 py-0.5 text-[11px] bg-green-500/10 text-green-400 rounded-md">
                    Расчёты: {domain.artifactTypes.calc}
                  </span>
                )}
                {domain.artifactTypes.spec > 0 && (
                  <span className="px-2 py-0.5 text-[11px] bg-yellow-500/10 text-yellow-400 rounded-md">
                    Спецификации: {domain.artifactTypes.spec}
                  </span>
                )}
                {domain.artifactTypes.method > 0 && (
                  <span className="px-2 py-0.5 text-[11px] bg-purple-500/10 text-purple-400 rounded-md">
                    Методики: {domain.artifactTypes.method}
                  </span>
                )}
                {domain.artifactTypes.research > 0 && (
                  <span className="px-2 py-0.5 text-[11px] bg-cyan-500/10 text-cyan-400 rounded-md">
                    Исследования: {domain.artifactTypes.research}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sections tree */}
          {domain.sections.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-muted mb-2">Структура:</p>
              <div className="space-y-1">
                {domain.sections.map((section, i) => (
                  <div key={i}>
                    <div className="flex items-start gap-2 py-1">
                      <Layers size={12} className="text-accent mt-0.5 flex-shrink-0" />
                      <span className="text-xs font-medium text-text">{section.title}</span>
                    </div>
                    {section.subsections.length > 0 && (
                      <div className="ml-5 pl-3 border-l border-border/50 space-y-0.5">
                        {section.subsections.map((sub, j) => (
                          <div key={j} className="flex items-start gap-2 py-0.5">
                            <Hash size={10} className="text-text-muted mt-0.5 flex-shrink-0" />
                            <span className="text-[11px] text-text-secondary">{sub}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DomainCatalog() {
  const [data, setData] = useState<CatalogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await adminApi.get('/admin/domains')
        setData(res.data.data)
      } catch {
        toast.error('Ошибка загрузки каталога доменов')
      } finally {
        setLoading(false)
      }
    }
    fetchCatalog()
  }, [])

  const toggleDomain = (code: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const expandAll = () => {
    if (!data) return
    setExpandedDomains(new Set(data.domains.map(d => d.code)))
  }

  const collapseAll = () => {
    setExpandedDomains(new Set())
  }

  const filteredDomains = useMemo(() => {
    if (!data) return []
    let domains = data.domains
    if (categoryFilter) {
      domains = domains.filter(d => d.category === categoryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      domains = domains.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        d.sections.some(s =>
          s.title.toLowerCase().includes(q) ||
          s.subsections.some(sub => sub.toLowerCase().includes(q))
        )
      )
    }
    return domains
  }, [data, categoryFilter, search])

  const maxLines = useMemo(() => {
    if (!data) return 2500
    return Math.max(...data.domains.map(d => d.lineCount))
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-text-muted">
        Не удалось загрузить каталог
      </div>
    )
  }

  const { stats } = data

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text tracking-tight">
          Каталог доменов знаний
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Полная база знаний для строительства автономного поселения на 200-500 домов
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Доменов" value={stats.domainCount} icon={BookOpen} />
        <StatCard label="Строк документации" value={stats.totalLines.toLocaleString()} icon={FileText} />
        <StatCard label="Разделов" value={stats.totalSections} icon={Layers} />
        <StatCard label="Подразделов" value={stats.totalSubsections} icon={Hash} />
        <StatCard label="Артефактов" value={stats.totalArtifacts} icon={FileText} />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Поиск по доменам, разделам, подразделам..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                !categoryFilter
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-bg text-text-muted border-border hover:text-text hover:border-accent/20'
              }`}
            >
              Все
            </button>
            {Object.entries(stats.categories).map(([key, label]) => {
              const dotColor = CATEGORY_DOT_COLORS[key] || 'bg-text-muted'
              return (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(categoryFilter === key ? null : key)}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                    categoryFilter === key
                      ? 'bg-accent/10 text-accent border-accent/30'
                      : 'bg-bg text-text-muted border-border hover:text-text hover:border-accent/20'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Expand/collapse buttons */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          <button
            onClick={expandAll}
            className="text-xs text-text-muted hover:text-accent transition-colors"
          >
            Развернуть все
          </button>
          <span className="text-text-muted">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-text-muted hover:text-accent transition-colors"
          >
            Свернуть все
          </button>
          <span className="text-text-muted ml-auto text-xs">
            {filteredDomains.length} из {stats.domainCount} доменов
          </span>
        </div>
      </Card>

      {/* Domain list */}
      <div className="space-y-2">
        {filteredDomains.map(domain => (
          <DomainCard
            key={domain.code}
            domain={domain}
            maxLines={maxLines}
            expanded={expandedDomains.has(domain.code)}
            onToggle={() => toggleDomain(domain.code)}
            categoryLabel={stats.categories[domain.category] || domain.category}
          />
        ))}
      </div>

      {filteredDomains.length === 0 && (
        <div className="text-center py-12 text-text-muted text-sm">
          Домены не найдены по заданным фильтрам
        </div>
      )}
    </div>
  )
}
