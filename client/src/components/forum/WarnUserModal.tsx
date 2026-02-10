// Modal for issuing warnings to users
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import axios from 'axios';
import { toast } from 'sonner';

interface WarnUserModalProps {
  userId: number;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WarnUserModal({
  userId,
  userName,
  isOpen,
  onClose,
  onSuccess
}: WarnUserModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error(t('forum.moderation.warnModal.reasonRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`/api/moderation/users/${userId}/warn`, {
        reason: reason.trim()
      });

      toast.success(t('forum.moderation.toasts.warningIssued', { name: userName }));
      onSuccess?.();
      onClose();
      setReason('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('forum.moderation.toasts.failedToWarn'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose} title={t('forum.moderation.warnModal.title', { name: userName })}>
      <div className="space-y-4">
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-500">
          {t('forum.moderation.warnModal.notice')}
        </div>

        <div>
          <label htmlFor="warn-reason" className="block text-sm font-medium mb-2">
            {t('forum.moderation.warnModal.reasonLabel')} <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="warn-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('forum.moderation.warnModal.reasonPlaceholder')}
            rows={4}
            disabled={isSubmitting}
            className="resize-none"
          />
          <p className="text-sm text-gray-500 mt-1">
            {t('forum.moderation.warnModal.reasonHelp')}
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || isSubmitting}
            loading={isSubmitting}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {t('forum.moderation.warnModal.submitButton')}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('forum.moderation.warnModal.cancelButton')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
