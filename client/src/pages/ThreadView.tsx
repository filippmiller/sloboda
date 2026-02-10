// Single thread view with nested comments
import { useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { Comment } from '@/components/forum/Comment';
import { CommentForm } from '@/components/forum/CommentForm';
import { VoteButtons } from '@/components/forum/VoteButtons';
import { ModActions } from '@/components/forum/ModActions';
import Button from '@/components/ui/Button';
import { useForumStore } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';

export default function ThreadView() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentThread,
    comments,
    threadsLoading,
    commentsLoading,
    threadsError,
    userRole,
    fetchThread,
    fetchUserRole,
    voteThread,
    createComment,
    updateComment,
    deleteComment,
    voteComment
  } = useForumStore();

  const threadId = parseInt(id || '0');

  useEffect(() => {
    if (threadId) {
      fetchThread(threadId);
    }
  }, [threadId, fetchThread]);

  useEffect(() => {
    if (user) {
      fetchUserRole();
    }
  }, [user, fetchUserRole]);

  // Check if user is moderator or super moderator
  const isModerator = userRole && (userRole.level >= 3); // moderator level or higher

  // Build nested comment tree
  const commentTree = useMemo(() => {
    if (!comments.length) return [];

    const commentMap = new Map();
    const rootComments: any[] = [];

    // First pass: create map
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: build tree
    comments.forEach(comment => {
      const node = commentMap.get(comment.id);
      if (comment.parent_comment_id === null) {
        rootComments.push(node);
      } else {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies.push(node);
        }
      }
    });

    return rootComments;
  }, [comments]);

  // Render comment tree recursively
  const renderComment = (comment: any) => {
    return (
      <Comment
        key={comment.id}
        id={comment.id}
        body={comment.body}
        threadId={threadId}
        parentCommentId={comment.parent_comment_id}
        authorId={comment.author_id}
        authorName={comment.author_name}
        voteCount={comment.vote_count}
        userVote={comment.user_vote}
        depth={comment.depth}
        createdAt={comment.created_at}
        isDeleted={comment.is_deleted}
        currentUserId={user?.id ? Number(user.id) : undefined}
        onVote={(value) => voteComment(comment.id, value)}
        onReply={async (body) => { await createComment(threadId, body, comment.id) }}
        onEdit={async (body) => { await updateComment(comment.id, body) }}
        onDelete={() => deleteComment(comment.id)}
      >
        {comment.replies?.length > 0 && (
          <div className="space-y-2">
            {comment.replies.map(renderComment)}
          </div>
        )}
      </Comment>
    );
  };

  if (threadsLoading || commentsLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (threadsError || !currentThread) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400 mb-4">
          {threadsError || t('forum.threadView.threadNotFound')}
        </div>
        <Button variant="ghost" onClick={() => navigate('/forum')}>
          <ArrowLeft size={18} className="mr-2" />
          {t('forum.threadView.backToForum')}
        </Button>
      </div>
    );
  }

  const isLocked = currentThread.is_locked;
  const deletedText = t('forum.threadCard.deleted');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <Button variant="ghost" className="mb-4" onClick={() => navigate('/forum')}>
        <ArrowLeft size={18} className="mr-2" />
        {t('forum.threadView.backToForum')}
      </Button>

      {/* Moderator actions */}
      {isModerator && currentThread && (
        <ModActions
          threadId={currentThread.id}
          isPinned={currentThread.is_pinned}
          isLocked={currentThread.is_locked}
          authorId={currentThread.author_id}
          onUpdate={() => fetchThread(threadId)}
          className="mb-4"
        />
      )}

      {/* Thread */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6 mb-6">
        <div className="flex gap-4">
          <VoteButtons
            type="thread"
            voteCount={currentThread.vote_count}
            userVote={currentThread.user_vote}
            onVote={(value) => voteThread(currentThread.id, value)}
            size="md"
          />

          <div className="flex-1 min-w-0">
            {/* Metadata */}
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
              {currentThread.category_name && (
                <>
                  <Link
                    to={`/forum?category=${currentThread.category_id}`}
                    className="font-bold text-[#c23616] hover:underline"
                  >
                    {currentThread.category_name}
                  </Link>
                  <span>•</span>
                </>
              )}
              <span>
                {t('forum.threadCard.postedBy', { author: currentThread.is_deleted ? deletedText : currentThread.author_name })}
              </span>
              <span>•</span>
              <span title={new Date(currentThread.created_at).toLocaleString()}>
                {formatDistanceToNow(new Date(currentThread.created_at), { addSuffix: true, locale: dateLocale })}
              </span>
              {isLocked && (
                <>
                  <span>•</span>
                  <Lock size={14} className="text-yellow-500" />
                  <span className="text-yellow-500">{t('forum.threadCard.locked')}</span>
                </>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold mb-4">
              {currentThread.is_deleted ? deletedText : currentThread.title}
            </h1>

            {/* Body */}
            {currentThread.body && !currentThread.is_deleted && (
              <div className="text-gray-200 whitespace-pre-wrap mb-4">
                {currentThread.body}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>{t('forum.threadView.stats.comments', { count: currentThread.comment_count })}</span>
              <span>•</span>
              <span>{t('forum.threadView.stats.views', { count: currentThread.view_count })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comment form (top-level) */}
      {user && !isLocked ? (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-3">{t('forum.threadView.addComment')}</h2>
          <CommentForm
            threadId={threadId}
            onSubmit={async (body) => { await createComment(threadId, body, undefined) }}
            placeholder={t('forum.threadView.commentPlaceholder')}
          />
        </div>
      ) : isLocked ? (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-500">
          <Lock size={18} className="inline mr-2" />
          {t('forum.threadView.lockedMessage')}
        </div>
      ) : (
        <div className="mb-6 p-4 bg-white/5 border border-gray-800 rounded-lg text-center">
          <p className="text-gray-400 mb-2">{t('forum.threadView.loginToComment')}</p>
          <Button variant="secondary" size="sm">
            <Link to="/login">{t('forum.guestPrompt.loginButton')}</Link>
          </Button>
        </div>
      )}

      {/* Comments */}
      <div>
        <h2 className="text-xl font-bold mb-4">
          {t('forum.threadView.commentsTitle', { count: currentThread.comment_count })}
        </h2>

        {commentTree.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {t('forum.threadView.noComments')}
          </div>
        ) : (
          <div className="space-y-2">
            {commentTree.map(renderComment)}
          </div>
        )}
      </div>
    </div>
  );
}
