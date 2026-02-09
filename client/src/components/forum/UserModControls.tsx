// Moderation controls for user profiles and content
import { useState } from 'react';
import { AlertTriangle, Ban } from 'lucide-react';
import Button from '@/components/ui/Button';
import { BanUserModal } from './BanUserModal';
import { WarnUserModal } from './WarnUserModal';

interface UserModControlsProps {
  userId: number;
  userName: string;
  onAction?: () => void;
}

export function UserModControls({ userId, userName, onAction }: UserModControlsProps) {
  const [showBanModal, setShowBanModal] = useState(false);
  const [showWarnModal, setShowWarnModal] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowWarnModal(true)}
          className="text-yellow-500 hover:text-yellow-400"
        >
          <AlertTriangle size={14} />
          Warn
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowBanModal(true)}
          className="text-red-500 hover:text-red-400"
        >
          <Ban size={14} />
          Ban
        </Button>
      </div>

      <WarnUserModal
        userId={userId}
        userName={userName}
        isOpen={showWarnModal}
        onClose={() => setShowWarnModal(false)}
        onSuccess={onAction}
      />

      <BanUserModal
        userId={userId}
        userName={userName}
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
        onSuccess={onAction}
      />
    </>
  );
}
