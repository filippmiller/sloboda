// Main forum page with thread listing and filters
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, TrendingUp, Clock, Award, Flame } from 'lucide-react';
import { ThreadList } from '@/components/forum/ThreadList';
import Button from '@/components/ui/Button';
import { useForumStore } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const SORT_KEYS = ['hot', 'recent', 'top', 'controversial'] as const;
const SORT_ICONS = {
  hot: Flame,
  recent: Clock,
  top: Award,
  controversial: TrendingUp
} as const;

export default function Forum() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { sortBy, setSortBy } = useForumStore();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">{t('forum.title')}</h1>
          <p className="text-gray-400">
            {t('forum.subtitle')}
          </p>
        </div>

        {user && (
          <Link to="/forum/create">
            <Button>
              <Plus size={18} className="mr-2" />
              {t('forum.newThread')}
            </Button>
          </Link>
        )}
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800 pb-2">
        {SORT_KEYS.map((value) => {
          const Icon = SORT_ICONS[value];
          return (
            <button
              key={value}
              onClick={() => setSortBy(value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors',
                sortBy === value
                  ? 'bg-[#c23616] text-white'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
              )}
            >
              <Icon size={16} />
              {t(`forum.sort.${value}`)}
            </button>
          );
        })}
      </div>

      {/* Thread list */}
      <ThreadList />

      {/* Login prompt for guests */}
      {!user && (
        <div className="mt-8 p-6 bg-white/5 border border-gray-800 rounded-lg text-center">
          <h3 className="text-xl font-bold mb-2">{t('forum.guestPrompt.title')}</h3>
          <p className="text-gray-400 mb-4">
            {t('forum.guestPrompt.description')}
          </p>
          <Button variant="secondary">
            <Link to="/login">{t('forum.guestPrompt.loginButton')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
