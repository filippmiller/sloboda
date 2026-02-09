// Main forum page with thread listing and filters
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, TrendingUp, Clock, Award, Flame } from 'lucide-react';
import { ThreadList } from '@/components/forum/ThreadList';
import { Button } from '@/components/ui/Button';
import { useForumStore } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const SORT_OPTIONS = [
  { value: 'hot', label: 'Hot', icon: Flame },
  { value: 'recent', label: 'Recent', icon: Clock },
  { value: 'top', label: 'Top', icon: Award },
  { value: 'controversial', label: 'Controversial', icon: TrendingUp }
] as const;

export default function Forum() {
  const { user } = useAuthStore();
  const { sortBy, setSortBy } = useForumStore();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Community Forum</h1>
          <p className="text-gray-400">
            Discuss ideas, share knowledge, and connect with the SLOBODA community
          </p>
        </div>

        {user && (
          <Button asChild>
            <Link to="/forum/create">
              <Plus size={18} className="mr-2" />
              New Thread
            </Link>
          </Button>
        )}
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800 pb-2">
        {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
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
            {label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <ThreadList />

      {/* Login prompt for guests */}
      {!user && (
        <div className="mt-8 p-6 bg-white/5 border border-gray-800 rounded-lg text-center">
          <h3 className="text-xl font-bold mb-2">Join the Discussion</h3>
          <p className="text-gray-400 mb-4">
            Create an account to post threads, comment, and vote
          </p>
          <Button asChild variant="outline">
            <Link to="/login">Log In</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
