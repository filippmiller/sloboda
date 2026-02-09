// Thread list with sorting and filtering
import { useEffect } from 'react';
import { ThreadCard } from './ThreadCard';
import { useForumStore } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';
import { Loader2 } from 'lucide-react';

interface ThreadListProps {
  categoryId?: number;
}

export function ThreadList({ categoryId }: ThreadListProps) {
  const { user } = useAuthStore();
  const {
    threads,
    threadsLoading,
    threadsError,
    sortBy,
    fetchThreads,
    voteThread,
    deleteThread
  } = useForumStore();

  useEffect(() => {
    fetchThreads({ category: categoryId, sort: sortBy });
  }, [categoryId, sortBy, fetchThreads]);

  if (threadsLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (threadsError) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
        {threadsError}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No threads yet. Be the first to create one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        <ThreadCard
          key={thread.id}
          id={thread.id}
          title={thread.title}
          body={thread.body}
          type={thread.type}
          authorId={thread.author_id}
          authorName={thread.author_name}
          categoryId={thread.category_id}
          categoryName={thread.category_name}
          voteCount={thread.vote_count}
          userVote={thread.user_vote}
          commentCount={thread.comment_count}
          viewCount={thread.view_count}
          isPinned={thread.is_pinned}
          isLocked={thread.is_locked}
          isDeleted={thread.is_deleted}
          createdAt={thread.created_at}
          currentUserId={user?.id ? Number(user.id) : undefined}
          onVote={(value) => voteThread(thread.id, value)}
          onDelete={() => deleteThread(thread.id, 'Deleted by author')}
          compact={false}
        />
      ))}
    </div>
  );
}
