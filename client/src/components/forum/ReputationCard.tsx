// Display user reputation statistics
import Card from '@/components/ui/Card';
import { TrendingUp, MessageSquare, FileText, ThumbsUp, Award } from 'lucide-react';

interface ReputationStats {
  total_points: number;
  threads_created: number;
  comments_made: number;
  upvotes_received: number;
  best_answers: number;
  helpful_votes: number;
}

interface ReputationCardProps {
  stats: ReputationStats;
}

export function ReputationCard({ stats }: ReputationCardProps) {
  const metrics = [
    {
      label: 'Total Reputation',
      value: stats.total_points,
      icon: TrendingUp,
      color: 'text-[#c23616]'
    },
    {
      label: 'Threads Created',
      value: stats.threads_created,
      icon: FileText,
      color: 'text-blue-400'
    },
    {
      label: 'Comments',
      value: stats.comments_made,
      icon: MessageSquare,
      color: 'text-purple-400'
    },
    {
      label: 'Upvotes Received',
      value: stats.upvotes_received,
      icon: ThumbsUp,
      color: 'text-green-400'
    },
    {
      label: 'Best Answers',
      value: stats.best_answers || 0,
      icon: Award,
      color: 'text-yellow-400'
    }
  ];

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Award size={20} className="text-[#c23616]" />
        Reputation
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="p-4 bg-white/5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={metric.color} />
                <span className="text-sm text-gray-400">{metric.label}</span>
              </div>
              <div className="text-2xl font-bold">{metric.value.toLocaleString()}</div>
            </div>
          );
        })}
      </div>

      {/* Points breakdown info */}
      <div className="mt-4 p-3 bg-white/5 rounded-lg border border-gray-800">
        <p className="text-xs text-gray-400">
          <span className="font-medium">How to earn reputation:</span> Create quality threads (+5),
          post helpful comments (+2), receive upvotes (+1), and engage with the community.
        </p>
      </div>
    </Card>
  );
}
