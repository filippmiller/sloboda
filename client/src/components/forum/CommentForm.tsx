// Adapted from Reddit-Clone WriteCommentBox component
// Source: https://github.com/DurgeshPatil24/Reddit-Clone

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface CommentFormProps {
  threadId: number;
  parentCommentId?: number | null;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function CommentForm({
  threadId,
  parentCommentId,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus = false,
  className
}: CommentFormProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedPlaceholder = placeholder ?? t('forum.threadView.commentPlaceholder');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!body.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(body.trim());
      setBody('');
      if (onCancel) onCancel();
    } catch (err: any) {
      setError(err.response?.data?.error || t('forum.comment.failedToPost'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReply = !!parentCommentId;

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-3', className)}>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={resolvedPlaceholder}
        rows={isReply ? 3 : 5}
        autoFocus={autoFocus}
        disabled={isSubmitting}
        className="resize-none"
      />

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!body.trim() || isSubmitting}
          loading={isSubmitting}
        >
          {isReply ? t('forum.commentForm.reply') : t('forum.commentForm.comment')}
        </Button>

        {isReply && onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('forum.commentForm.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
