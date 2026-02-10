// Moderator action buttons for threads
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, Lock, Unlock, AlertTriangle, Ban, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import axios from 'axios';
import { toast } from 'sonner';

interface ModActionsProps {
  threadId: number;
  isPinned: boolean;
  isLocked: boolean;
  authorId: number;
  onUpdate: () => void;
  className?: string;
}

export function ModActions({
  threadId,
  isPinned,
  isLocked,
  authorId,
  onUpdate,
  className
}: ModActionsProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePin = async () => {
    setIsProcessing(true);
    try {
      await axios.post(`/api/moderation/threads/${threadId}/pin`, {
        is_pinned: !isPinned
      });
      toast.success(isPinned ? t('forum.moderation.toasts.threadUnpinned') : t('forum.moderation.toasts.threadPinned'));
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('forum.moderation.toasts.failedToUpdate'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLock = async () => {
    setIsProcessing(true);
    try {
      await axios.post(`/api/moderation/threads/${threadId}/lock`, {
        is_locked: !isLocked
      });
      toast.success(isLocked ? t('forum.moderation.toasts.threadUnlocked') : t('forum.moderation.toasts.threadLocked'));
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('forum.moderation.toasts.failedToUpdate'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-yellow-500">
          <AlertTriangle size={16} />
          <span className="font-medium">{t('forum.moderation.title')}</span>
        </div>

        <div className="flex gap-2 ml-auto">
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePin}
            disabled={isProcessing}
            className="text-yellow-500 hover:text-yellow-400"
          >
            <Pin size={14} className={isPinned ? 'fill-current' : ''} />
            {isPinned ? t('forum.moderation.unpin') : t('forum.moderation.pin')}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleLock}
            disabled={isProcessing}
            className="text-yellow-500 hover:text-yellow-400"
          >
            {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
            {isLocked ? t('forum.moderation.unlock') : t('forum.moderation.lock')}
          </Button>
        </div>
      </div>
    </div>
  );
}
