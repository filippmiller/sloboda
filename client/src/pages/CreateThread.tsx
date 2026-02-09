// Create new thread page
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import { useForumStore } from '@/store/forumStore';
import { useAuthStore } from '@/store/authStore';

export default function CreateThread() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createThread } = useForumStore();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'discussion' | 'question' | 'announcement'>('discussion');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not logged in
  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const thread = await createThread({
        title: title.trim(),
        body: body.trim() || undefined,
        type
      });

      // Navigate to the new thread
      navigate(`/forum/thread/${thread.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create thread');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <Button variant="ghost" className="mb-4" onClick={() => navigate('/forum')}>
        <ArrowLeft size={18} className="mr-2" />
        Back to Forum
      </Button>

      {/* Form */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-6">Create New Thread</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Thread Type</label>
            <div className="flex gap-2">
              {(['discussion', 'question', 'announcement'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-2 rounded-lg border transition-colors capitalize ${
                    type === t
                      ? 'bg-[#c23616] border-[#c23616] text-white'
                      : 'bg-[#0a0a0a] border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What would you like to discuss?"
              maxLength={500}
              disabled={isSubmitting}
              autoFocus
            />
            <p className="text-sm text-gray-500 mt-1">
              {title.length}/500 characters
            </p>
          </div>

          {/* Body */}
          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-2">
              Body (optional)
            </label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add more details..."
              rows={8}
              disabled={isSubmitting}
              className="resize-none"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              loading={isSubmitting}
            >
              Create Thread
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/forum')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>

      {/* Guidelines */}
      <div className="mt-6 p-4 bg-white/5 border border-gray-800 rounded-lg">
        <h3 className="font-bold mb-2">Community Guidelines</h3>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>Be respectful and constructive</li>
          <li>Stay on topic and provide context</li>
          <li>Search before posting to avoid duplicates</li>
          <li>Use clear, descriptive titles</li>
        </ul>
      </div>
    </div>
  );
}
