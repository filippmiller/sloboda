// Modal for banning users
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import axios from 'axios';
import { toast } from 'sonner';

interface BanUserModalProps {
  userId: number;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BanUserModal({
  userId,
  userName,
  isOpen,
  onClose,
  onSuccess
}: BanUserModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<number | null>(24);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const BAN_DURATIONS = [
    { labelKey: '1day', hours: 24 },
    { labelKey: '3days', hours: 72 },
    { labelKey: '7days', hours: 168 },
    { labelKey: '30days', hours: 720 },
    { labelKey: 'permanent', hours: null }
  ] as const;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error(t('forum.moderation.banModal.reasonRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`/api/moderation/users/${userId}/ban`, {
        reason: reason.trim(),
        duration_hours: duration
      });

      toast.success(t('forum.moderation.toasts.userBanned', { name: userName }));
      onSuccess?.();
      onClose();
      setReason('');
      setDuration(24);
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('forum.moderation.toasts.failedToBan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose} title={t('forum.moderation.banModal.title', { name: userName })}>
      <div className="space-y-4">
        {/* Duration selector */}
        <div>
          <label className="block text-sm font-medium mb-2">
            {t('forum.moderation.banModal.durationLabel')} <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {BAN_DURATIONS.map((option) => (
              <button
                key={option.labelKey}
                type="button"
                onClick={() => setDuration(option.hours)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  duration === option.hours
                    ? 'bg-[#c23616] border-[#c23616] text-white'
                    : 'bg-[#0a0a0a] border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {t(`forum.moderation.banModal.durations.${option.labelKey}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label htmlFor="ban-reason" className="block text-sm font-medium mb-2">
            {t('forum.moderation.banModal.reasonLabel')} <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('forum.moderation.banModal.reasonPlaceholder')}
            rows={4}
            disabled={isSubmitting}
            className="resize-none"
          />
          <p className="text-sm text-gray-500 mt-1">
            {t('forum.moderation.banModal.reasonHelp')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || isSubmitting}
            loading={isSubmitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {t('forum.moderation.banModal.submitButton')}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('forum.moderation.banModal.cancelButton')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
