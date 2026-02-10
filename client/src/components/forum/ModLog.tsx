// Moderation log display
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Shield } from 'lucide-react';
import Card from '@/components/ui/Card';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';

interface ModAction {
  id: number;
  moderator_id: number;
  moderator_name: string;
  action_type: string;
  target_user_id?: number;
  target_user_name?: string;
  target_thread_id?: number;
  target_comment_id?: number;
  reason?: string;
  duration_hours?: number;
  created_at: string;
}

interface ModLogProps {
  limit?: number;
  userId?: number;
  threadId?: number;
}

export function ModLog({ limit = 50, userId, threadId }: ModLogProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [actions, setActions] = useState<ModAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActions = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        if (userId) params.append('user_id', userId.toString());
        if (threadId) params.append('thread_id', threadId.toString());

        const response = await axios.get(`/api/moderation/actions?${params}`);
        setActions(response.data.actions || []);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load moderation log');
      } finally {
        setLoading(false);
      }
    };

    fetchActions();
  }, [limit, userId, threadId]);

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-400">
        {t('forum.modLog.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        {t('forum.modLog.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <Card key={action.id} className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Shield size={16} className="text-yellow-500" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="font-medium text-yellow-500">
                  {action.moderator_name}
                </span>
                <span className="text-gray-400">
                  {t(`forum.modLog.actions.${action.action_type}`, { defaultValue: action.action_type })}
                </span>
                {action.target_user_name && (
                  <>
                    <span className="text-gray-600">&rarr;</span>
                    <span className="font-medium text-gray-300">
                      {action.target_user_name}
                    </span>
                  </>
                )}
              </div>

              {action.reason && (
                <p className="text-sm text-gray-400 mb-1">
                  <span className="font-medium">{t('forum.modLog.reason')}</span> {action.reason}
                </p>
              )}

              {action.duration_hours && (
                <p className="text-sm text-gray-400 mb-1">
                  <span className="font-medium">{t('forum.modLog.duration')}</span>{' '}
                  {action.duration_hours === null
                    ? t('forum.modLog.permanent')
                    : t('forum.modLog.hoursUnit', { count: action.duration_hours })}
                </p>
              )}

              <div className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(action.created_at), { addSuffix: true, locale: dateLocale })}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
