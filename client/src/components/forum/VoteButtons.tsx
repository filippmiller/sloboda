// Adapted from Reddit-Clone UpvoteBar component
// Source: https://github.com/DurgeshPatil24/Reddit-Clone

import { ArrowUp, ArrowDown } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface VoteButtonsProps {
  type: 'thread' | 'comment';
  voteCount: number;
  userVote: 1 | -1 | 0 | null;
  onVote: (value: 1 | -1 | 0) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function VoteButtons({
  type,
  voteCount,
  userVote,
  onVote,
  size = 'md',
  disabled = false
}: VoteButtonsProps) {
  const iconSize = size === 'sm' ? 16 : 20;
  const upvoteColor = '#c23616'; // SLOBODA accent
  const downvoteColor = '#4a69bd';

  const handleUpvote = () => {
    if (disabled) return;

    // Toggle logic: if already upvoted, remove vote; otherwise upvote
    if (userVote === 1) {
      onVote(0);
    } else {
      onVote(1);
    }
  };

  const handleDownvote = () => {
    if (disabled) return;

    // Toggle logic: if already downvoted, remove vote; otherwise downvote
    if (userVote === -1) {
      onVote(0);
    } else {
      onVote(-1);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 mr-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleUpvote}
        disabled={disabled}
        className={cn(
          'h-8 w-8 p-0 hover:bg-transparent',
          userVote === 1 && 'text-[#c23616]'
        )}
        aria-label="Upvote"
      >
        <ArrowUp
          size={iconSize}
          className={cn(
            'transition-colors',
            userVote === 1 ? 'fill-current' : 'hover:text-[#c23616]'
          )}
        />
      </Button>

      <span
        className={cn(
          'text-sm font-bold tabular-nums',
          userVote === 1 && 'text-[#c23616]',
          userVote === -1 && 'text-[#4a69bd]',
          userVote === 0 && 'text-gray-400'
        )}
      >
        {voteCount}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownvote}
        disabled={disabled}
        className={cn(
          'h-8 w-8 p-0 hover:bg-transparent',
          userVote === -1 && 'text-[#4a69bd]'
        )}
        aria-label="Downvote"
      >
        <ArrowDown
          size={iconSize}
          className={cn(
            'transition-colors',
            userVote === -1 ? 'fill-current' : 'hover:text-[#4a69bd]'
          )}
        />
      </Button>
    </div>
  );
}
