// Moderator action buttons for threads
import { useState } from 'react';
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
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePin = async () => {
    setIsProcessing(true);
    try {
      await axios.post(`/api/moderation/threads/${threadId}/pin`, {
        is_pinned: !isPinned
      });
      toast.success(isPinned ? 'Thread unpinned' : 'Thread pinned');
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update thread');
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
      toast.success(isLocked ? 'Thread unlocked' : 'Thread locked');
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update thread');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-yellow-500">
          <AlertTriangle size={16} />
          <span className="font-medium">Moderator Actions</span>
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
            {isPinned ? 'Unpin' : 'Pin'}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleLock}
            disabled={isProcessing}
            className="text-yellow-500 hover:text-yellow-400"
          >
            {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
            {isLocked ? 'Unlock' : 'Lock'}
          </Button>
        </div>
      </div>
    </div>
  );
}
