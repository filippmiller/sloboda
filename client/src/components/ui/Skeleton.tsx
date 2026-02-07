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
