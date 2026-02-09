// Modal for banning users
import { useState } from 'react';
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

const BAN_DURATIONS = [
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
  { label: 'Permanent', hours: null }
];

export function BanUserModal({
  userId,
  userName,
  isOpen,
  onClose,
  onSuccess
}: BanUserModalProps) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<number | null>(24);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Ban reason is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`/api/moderation/users/${userId}/ban`, {
        reason: reason.trim(),
        duration_hours: duration
      });

      toast.success(`${userName} has been banned`);
      onSuccess?.();
      onClose();
      setReason('');
      setDuration(24);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to ban user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose} title={`Ban User: ${userName}`}>
      <div className="space-y-4">
        {/* Duration selector */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Ban Duration <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {BAN_DURATIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setDuration(option.hours)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  duration === option.hours
                    ? 'bg-[#c23616] border-[#c23616] text-white'
                    : 'bg-[#0a0a0a] border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label htmlFor="ban-reason" className="block text-sm font-medium mb-2">
            Reason <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this user is being banned..."
            rows={4}
            disabled={isSubmitting}
            className="resize-none"
          />
          <p className="text-sm text-gray-500 mt-1">
            This will be visible to the user and other moderators
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
            Ban User
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
