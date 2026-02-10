// Adapted from Reddit-Clone Post component
// Source: https://github.com/DurgeshPatil24/Reddit-Clone

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Edit2, Trash2, Pin, Lock } from 'lucide-react';
import { VoteButtons } from './VoteButtons';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';

interface ThreadCardProps {
  id: number;
  title: string;
  body?: string;
  type: string;
  authorId: number;
  authorName: string;
  categoryId?: number;
  categoryName?: string;
  voteCount: number;
  userVote: 1 | -1 | 0 | null;
  commentCount: number;
  viewCount: number;
  isPinned?: boolean;
  isLocked?: boolean;
  isDeleted?: boolean;
  createdAt: string;
  currentUserId?: number;
  onVote: (value: 1 | -1 | 0) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

export function ThreadCard({
  id,
  title,
  body,
  type,
  authorId,
  authorName,
  categoryId,
  categoryName,
  voteCount,
  userVote,
  commentCount,
  viewCount,
  isPinned = false,
  isLocked = false,
  isDeleted = false,
  createdAt,
  currentUserId,
  onVote,
  onEdit,
  onDelete,
  compact = false
}: ThreadCardProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [isEditing, setIsEditing] = useState(false);
  const isAuthor = currentUserId === authorId;
  const isTextPost = type === 'discussion';
  const deletedText = t('forum.threadCard.deleted');

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <VoteButtons
          type="thread"
          voteCount={voteCount}
          userVote={userVote}
          onVote={onVote}
          size="md"
        />

        <div className="flex-1 min-w-0">
          {/* Metadata */}
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            {categoryName && (
              <>
                <Link
                  to={`/forum/category/${categoryId}`}
                  className="font-bold hover:underline text-[#c23616]"
                >
                  {categoryName}
                </Link>
                <span>•</span>
              </>
            )}
            <span>{t('forum.threadCard.postedBy', { author: isDeleted ? deletedText : authorName })}</span>
            <span>•</span>
            <span title={new Date(createdAt).toLocaleString()}>
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: dateLocale })}
            </span>
            {isPinned && (
              <>
                <span>•</span>
                <Pin size={14} className="text-[#c23616]" />
              </>
            )}
            {isLocked && (
              <>
                <span>•</span>
                <Lock size={14} className="text-gray-500" />
              </>
            )}
          </div>

          {/* Title */}
          <Link
            to={`/forum/thread/${id}`}
            className="block mb-2"
          >
            <h3 className="text-xl font-medium hover:text-[#c23616] transition-colors">
              {isDeleted ? deletedText : title}
            </h3>
          </Link>

          {/* Body (if text post and not compact) */}
          {isTextPost && body && !compact && !isDeleted && (
            <div className="text-gray-300 mb-3 line-clamp-3">
              {body}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link
              to={`/forum/thread/${id}`}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-colors"
            >
              <MessageSquare size={16} />
              <span>{t('forum.threadCard.comment', { count: commentCount })}</span>
            </Link>

            {viewCount > 0 && (
              <span className="px-2 py-1">
                {t('forum.threadCard.view', { count: viewCount })}
              </span>
            )}
          </div>
        </div>

        {/* Edit/Delete buttons (author only) */}
        {isAuthor && !isDeleted && (
          <div className="flex gap-2 items-start">
            {isTextPost && onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="h-8 w-8"
              >
                <Edit2 size={16} />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-8 w-8 text-red-500 hover:text-red-400"
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
