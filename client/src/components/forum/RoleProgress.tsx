// Display progress toward next role tier
import { useTranslation } from 'react-i18next';
import Card from '@/components/ui/Card';
import { RoleBadge } from './RoleBadge';
import { TrendingUp, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressMetric {
  current: number;
  required: number;
  percentage: number;
}

interface RoleProgressProps {
  currentRole: string;
  currentLevel: number;
  nextRole?: string;
  nextLevel?: number;
  progress?: {
    days?: ProgressMetric;
    total_points?: ProgressMetric;
    comments_made?: ProgressMetric;
    threads_created?: ProgressMetric;
    upvotes_received?: ProgressMetric;
  };
  canPromote?: boolean;
}

export function RoleProgress({
  currentRole,
  currentLevel,
  nextRole,
  nextLevel,
  progress,
  canPromote = true
}: RoleProgressProps) {
  const { t } = useTranslation();

  // If no next role, user is at max tier
  if (!nextRole || !canPromote) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 size={24} className="text-green-500" />
          <div>
            <h3 className="text-lg font-bold">{t('forum.roleProgress.maxRankTitle')}</h3>
            <p className="text-sm text-gray-400">
              {t('forum.roleProgress.maxRankDescription')}
            </p>
          </div>
        </div>
        <RoleBadge role={currentRole} level={currentLevel} size="lg" />
      </Card>
    );
  }

  // Calculate overall progress (average of all metrics)
  const metrics = progress ? Object.values(progress) : [];
  const overallProgress = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.percentage, 0) / metrics.length
    : 0;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <TrendingUp size={20} className="text-[#c23616]" />
        <h3 className="text-lg font-bold">{t('forum.roleProgress.title')}</h3>
      </div>

      {/* Current and next role */}
      <div className="flex items-center gap-4 mb-6">
        <RoleBadge role={currentRole} level={currentLevel} size="md" />
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#c23616] to-purple-500 transition-all duration-500"
            style={{ width: `${Math.min(overallProgress, 100)}%` }}
          />
        </div>
        <RoleBadge role={nextRole} level={nextLevel || 0} size="md" />
      </div>

      {/* Progress metrics */}
      {progress && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-400 mb-2">
            {t('forum.roleProgress.requirementsFor', { role: nextRole.replace('_', ' ') })}
          </p>

          {progress.days && (
            <ProgressBar
              label={t('forum.roleProgress.accountAge')}
              current={progress.days.current}
              required={progress.days.required}
              percentage={progress.days.percentage}
              unit={t('forum.roleProgress.daysUnit')}
            />
          )}

          {progress.total_points && (
            <ProgressBar
              label={t('forum.roleProgress.reputationPoints')}
              current={progress.total_points.current}
              required={progress.total_points.required}
              percentage={progress.total_points.percentage}
              unit={t('forum.roleProgress.pointsUnit')}
            />
          )}

          {progress.comments_made && (
            <ProgressBar
              label={t('forum.roleProgress.commentsLabel')}
              current={progress.comments_made.current}
              required={progress.comments_made.required}
              percentage={progress.comments_made.percentage}
            />
          )}

          {progress.threads_created && (
            <ProgressBar
              label={t('forum.roleProgress.threadsCreatedLabel')}
              current={progress.threads_created.current}
              required={progress.threads_created.required}
              percentage={progress.threads_created.percentage}
            />
          )}

          {progress.upvotes_received && (
            <ProgressBar
              label={t('forum.roleProgress.upvotesReceivedLabel')}
              current={progress.upvotes_received.current}
              required={progress.upvotes_received.required}
              percentage={progress.upvotes_received.percentage}
            />
          )}
        </div>
      )}

      {overallProgress >= 100 && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
          {t('forum.roleProgress.promotionReady')}
        </div>
      )}
    </Card>
  );
}

function ProgressBar({
  label,
  current,
  required,
  percentage,
  unit = ''
}: {
  label: string;
  current: number;
  required: number;
  percentage: number;
  unit?: string;
}) {
  const isComplete = percentage >= 100;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className={cn('font-medium', isComplete && 'text-green-400')}>
          {label}
        </span>
        <span className="text-gray-400">
          {current} / {required} {unit}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-500',
            isComplete
              ? 'bg-green-500'
              : 'bg-gradient-to-r from-[#c23616] to-purple-500'
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
