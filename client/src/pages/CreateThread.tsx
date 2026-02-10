// Create new thread page
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import { useForumStore } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';

export default function CreateThread() {
  const { t } = useTranslation();
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
      setError(t('forum.createThread.titleRequired'));
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
      setError(err.response?.data?.error || t('forum.createThread.error'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <Button variant="ghost" className="mb-4" onClick={() => navigate('/forum')}>
        <ArrowLeft size={18} className="mr-2" />
        {t('forum.createThread.backToForum')}
      </Button>

      {/* Form */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-6">{t('forum.createThread.title')}</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('forum.createThread.threadType')}</label>
            <div className="flex gap-2">
              {(['discussion', 'question', 'announcement'] as const).map((typeKey) => (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setType(typeKey)}
                  className={`px-4 py-2 rounded-lg border transition-colors capitalize ${
                    type === typeKey
                      ? 'bg-[#c23616] border-[#c23616] text-white'
                      : 'bg-[#0a0a0a] border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {t(`forum.createThread.types.${typeKey}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              {t('forum.createThread.titleLabel')} <span className="text-red-500">*</span>
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('forum.createThread.titlePlaceholder')}
              maxLength={500}
              disabled={isSubmitting}
              autoFocus
            />
            <p className="text-sm text-gray-500 mt-1">
              {t('forum.createThread.titleCounter', { count: title.length })}
            </p>
          </div>

          {/* Body */}
          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-2">
              {t('forum.createThread.bodyLabel')}
            </label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('forum.createThread.bodyPlaceholder')}
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
              {t('forum.createThread.submitButton')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/forum')}
              disabled={isSubmitting}
            >
              {t('forum.createThread.cancelButton')}
            </Button>
          </div>
        </form>
      </div>

      {/* Guidelines */}
      <div className="mt-6 p-4 bg-white/5 border border-gray-800 rounded-lg">
        <h3 className="font-bold mb-2">{t('forum.createThread.guidelines.title')}</h3>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>{t('forum.createThread.guidelines.respectful')}</li>
          <li>{t('forum.createThread.guidelines.onTopic')}</li>
          <li>{t('forum.createThread.guidelines.searchFirst')}</li>
          <li>{t('forum.createThread.guidelines.clearTitles')}</li>
        </ul>
      </div>
    </div>
  );
}
