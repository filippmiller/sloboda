// Adapted from Reddit-Clone Comment component
// Source: https://github.com/DurgeshPatil24/Reddit-Clone

import { useState } from 'react';
import { MessageSquare, Edit2, Trash2 } from 'lucide-react';
import { VoteButtons } from './VoteButtons';
import { CommentForm } from './CommentForm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface CommentProps {
  id: number;
  body: string;
  threadId: number;
  parentCommentId?: number | null;
  authorId: number;
  authorName: string;
  voteCount: number;
  userVote: 1 | -1 | 0 | null;
  depth: number;
  createdAt: string;
  isDeleted?: boolean;
  currentUserId?: number;
  onVote: (value: 1 | -1 | 0) => void;
  onReply: (body: string) => Promise<void>;
  onEdit?: (body: string) => Promise<void>;
  onDelete?: () => void;
  children?: React.ReactNode;
}

export function Comment({
  id,
  body,
  threadId,
  parentCommentId,
  authorId,
  authorName,
  voteCount,
  userVote,
  depth,
  createdAt,
  isDeleted = false,
  currentUserId,
  onVote,
  onReply,
  onEdit,
  onDelete,
  children
}: CommentProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);

  const isAuthor = currentUserId === authorId;
  const deletedText = '[deleted]';

  const handleReply = async (replyBody: string) => {
    await onReply(replyBody);
    setShowReplyForm(false);
  };

  const handleEdit = async () => {
    if (!onEdit || !editBody.trim()) return;
    await onEdit(editBody.trim());
    setIsEditing(false);
  };

  // Indent nested comments (max 6 levels)
  const indentLevel = Math.min(depth, 6);
  const marginLeft = indentLevel > 0 ? `${indentLevel * 1.5}rem` : '0';

  return (
    <div style={{ marginLeft }} className="mb-3">
      <Card className="p-3">
        <div className="flex gap-3">
          <VoteButtons
            type="comment"
            voteCount={voteCount}
            userVote={userVote}
            onVote={onVote}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            {/* Metadata */}
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
              <span className="font-medium text-gray-300">
                {isDeleted ? deletedText : authorName}
              </span>
              <span>•</span>
              <span title={new Date(createdAt).toLocaleString()}>
                {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
              </span>
            </div>

            {/* Body */}
            {isEditing && onEdit ? (
              <div className="mb-3 space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full p-2 bg-[#1a1a1a] border border-gray-700 rounded resize-none"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleEdit}
                    disabled={!editBody.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setEditBody(body);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={cn(
                'text-gray-200 mb-2 whitespace-pre-wrap',
                isDeleted && 'italic text-gray-500'
              )}>
                {isDeleted ? deletedText : body}
              </div>
            )}

            {/* Actions */}
            {!isDeleted && (
              <div className="flex items-center gap-4 text-sm">
                <button
                  onClick={() => setShowReplyForm(!showReplyForm)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-gray-400 hover:bg-white/5 hover:text-gray-300 transition-colors"
                >
                  <MessageSquare size={14} />
                  Reply
                </button>

                {isAuthor && !isEditing && onEdit && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-gray-400 hover:bg-white/5 hover:text-gray-300 transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                )}

                {isAuthor && onDelete && (
                  <button
                    onClick={onDelete}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-gray-400 hover:bg-white/5 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>
            )}

            {/* Reply form */}
            {showReplyForm && (
              <div className="mt-3">
                <CommentForm
                  threadId={threadId}
                  parentCommentId={id}
                  onSubmit={handleReply}
                  onCancel={() => setShowReplyForm(false)}
                  placeholder={`Reply to ${authorName}...`}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Nested replies */}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
