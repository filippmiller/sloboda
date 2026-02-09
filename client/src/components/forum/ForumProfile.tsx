// Forum-specific profile section showing role and reputation
import { useEffect, useState } from 'react';
import { RoleBadge } from './RoleBadge';
import { RoleProgress } from './RoleProgress';
import { ReputationCard } from './ReputationCard';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

interface ForumProfileProps {
  userId?: number; // If omitted, shows current user
}

export function ForumProfile({ userId }: ForumProfileProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleData, setRoleData] = useState<any>(null);
  const [reputationData, setReputationData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch user role and progress
        const roleEndpoint = userId
          ? `/api/roles/user/${userId}`
          : '/api/roles/user/me';
        const roleResponse = await axios.get(roleEndpoint);
        setRoleData(roleResponse.data);

        // Fetch reputation stats (would need to create this endpoint)
        // For now, using mock data
        setReputationData({
          total_points: roleResponse.data.reputation || 0,
          threads_created: 0,
          comments_made: 0,
          upvotes_received: 0,
          best_answers: 0,
          helpful_votes: 0
        });
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load forum profile');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (!roleData) return null;

  return (
    <div className="space-y-6">
      {/* Current role badge */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">Forum Status</h2>
        <RoleBadge
          role={roleData.role}
          level={roleData.level}
          size="lg"
        />
      </div>

      {/* Role progression */}
      {roleData.progress && (
        <RoleProgress
          currentRole={roleData.role}
          currentLevel={roleData.level}
          nextRole={roleData.nextRole}
          nextLevel={roleData.nextLevel}
          progress={roleData.progress}
          canPromote={roleData.canPromote}
        />
      )}

      {/* Reputation stats */}
      {reputationData && (
        <ReputationCard stats={reputationData} />
      )}
    </div>
  );
}
