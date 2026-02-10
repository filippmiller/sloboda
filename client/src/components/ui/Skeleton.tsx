interface SkeletonProps {
  variant?: 'line' | 'circle' | 'card' | 'text-block'
  width?: string
  height?: string
  className?: string
}

export default function Skeleton({
  variant = 'line',
  width,
  height,
  className = '',
}: SkeletonProps) {
  const baseClasses =
    'bg-gradient-to-r from-bg-elevated via-border/40 to-bg-elevated bg-[length:200%_100%] animate-shimmer rounded'

  const variantClasses: Record<string, string> = {
    line: 'h-4 w-full rounded-md',
    circle: 'w-10 h-10 rounded-full',
    card: 'h-32 w-full rounded-xl',
    'text-block': 'h-20 w-full rounded-lg',
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-6 space-y-3">
      <Skeleton variant="line" className="w-1/4 h-3" />
      <Skeleton variant="line" className="w-3/4 h-5" />
      <Skeleton variant="line" className="w-full h-4" />
      <Skeleton variant="line" className="w-1/2 h-3" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex gap-4">
        <Skeleton className="w-1/4 h-4" />
        <Skeleton className="w-1/3 h-4" />
        <Skeleton className="w-1/5 h-4" />
        <Skeleton className="w-1/6 h-4" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 border-b border-border flex gap-4 last:border-b-0">
          <Skeleton className="w-1/4 h-3" />
          <Skeleton className="w-1/3 h-3" />
          <Skeleton className="w-1/5 h-3" />
          <Skeleton className="w-1/6 h-3" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ items = 4 }: { items?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonList({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="bg-bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-start gap-3">
            <Skeleton variant="circle" className="w-10 h-10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-3/4 h-4" />
              <Skeleton className="w-full h-3" />
              <Skeleton className="w-2/3 h-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
