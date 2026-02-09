// Display user role badge with appropriate styling
import { Shield, Star, Award, Zap, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleBadgeProps {
  role: string;
  level: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const ROLE_CONFIG = {
  new_user: {
    label: 'New User',
    color: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    icon: Zap
  },
  member: {
    label: 'Member',
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    icon: Star
  },
  senior_member: {
    label: 'Senior Member',
    color: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    icon: Award
  },
  moderator: {
    label: 'Moderator',
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    icon: Shield
  },
  super_moderator: {
    label: 'Super Moderator',
    color: 'text-[#c23616] bg-[#c23616]/10 border-[#c23616]/20',
    icon: Crown
  }
};

export function RoleBadge({
  role,
  level,
  size = 'sm',
  showIcon = true,
  className
}: RoleBadgeProps) {
  const config = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.new_user;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5'
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        config.color,
        sizeClasses[size],
        className
      )}
      title={`Level ${level}`}
    >
      {showIcon && <Icon size={iconSizes[size]} />}
      {config.label}
    </span>
  );
}
