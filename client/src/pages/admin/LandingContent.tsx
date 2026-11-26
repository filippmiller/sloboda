import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import adminApi from '@/services/adminApi';
import { Save, RotateCw, Eye, Plus, Trash2, Edit2 } from 'lucide-react';

interface BookmarkBannerContent {
  enabled: boolean;
  text: string;
}

interface HeroContent {
  badge: string;
  title: string;
  text: string;
  answer: string;
}

interface RealityCard {
  type: string;
  title: string;
  question?: string;
  answer?: string;
  warning?: string;
  content?: string;
  cta?: string;
}

interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
  avatar: string;
}

interface FeatureItem {
  number: string | number;
  title: string;
  description: string;
}

interface DonationAmountItem {
  amount: number;
  description: string;
  popular: boolean;
}

type LandingContentValue =
  | BookmarkBannerContent
  | HeroContent
  | RealityCard[]
  | TestimonialItem[]
  | FeatureItem[]
  | DonationAmountItem[]
  | Record<string, unknown>;

interface LandingSection {
  section: string;
  content: LandingContentValue;
  updated_at: string;
  updated_by_email?: string;
}

export default function LandingContent() {
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<LandingContentValue | null>(null);

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      setLoading(true);
      const response = await adminApi.get('/admin/landing-content');
      setSections(response.data);
    } catch (error: unknown) {
      console.error('Error fetching sections:', error);
      toast.error('Ошибка загрузки контента');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (section: LandingSection) => {
    setEditingSection(section.section);
    setEditContent(section.content);
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setEditContent(null);
  };

  const saveSection = async (sectionName: string) => {
    try {
      setSaving(true);
      await adminApi.patch(`/admin/landing-content/${sectionName}`, {
        content: editContent
      });
      toast.success('Секция сохранена');
      setEditingSection(null);
      setEditContent(null);
      fetchSections();
    } catch (error: unknown) {
      console.error('Error saving section:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const renderEditor = (section: LandingSection) => {
    const { section: name, content } = section;

    switch (name) {
      case 'bookmark_banner':
        return renderBookmarkBannerEditor(content as BookmarkBannerContent);
      case 'hero':
        return renderHeroEditor(content as HeroContent);
      case 'reality_cards':
        return renderRealityCardsEditor(content as RealityCard[]);
      case 'testimonials':
        return renderTestimonialsEditor(content as TestimonialItem[]);
      case 'features':
        return renderFeaturesEditor(content as FeatureItem[]);
      case 'donation_amounts':
        return renderDonationAmountsEditor(content as DonationAmountItem[]);
      default:
        return <pre className="text-sm">{JSON.stringify(content, null, 2)}</pre>;
    }
  };

  const renderBookmarkBannerEditor = (content: BookmarkBannerContent) => {
    const draft = (editContent as BookmarkBannerContent | null) ?? content;
    return (
      <div className="space-y-4">
        <div>
          <label className="block mb-2 font-medium">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setEditContent({ ...draft, enabled: e.target.checked })}
              className="mr-2"
            />
            Включен
          </label>
        </div>
        <div>
          <label className="block mb-2 font-medium">Текст</label>
          <textarea
            value={draft.text}
            onChange={(e) => setEditContent({ ...draft, text: e.target.value })}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded"
            rows={3}
          />
        </div>
      </div>
    );
  };

  const renderHeroEditor = (content: HeroContent) => {
    const draft = (editContent as HeroContent | null) ?? content;
    return (
      <div className="space-y-4">
        <div>
          <label className="block mb-2 font-medium">Бейдж</label>
          <input
            type="text"
            value={draft.badge}
            onChange={(e) => setEditContent({ ...draft, badge: e.target.value })}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded"
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">Заголовок (можно использовать HTML)</label>
          <textarea
            value={draft.title}
            onChange={(e) => setEditContent({ ...draft, title: e.target.value })}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded"
            rows={2}
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">Текст (можно использовать HTML)</label>
          <textarea
            value={draft.text}
            onChange={(e) => setEditContent({ ...draft, text: e.target.value })}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded"
            rows={4}
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">Ответ (можно использовать HTML)</label>
          <textarea
            value={draft.answer}
            onChange={(e) => setEditContent({ ...draft, answer: e.target.value })}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded"
            rows={2}
          />
        </div>
      </div>
    );
  };

  const renderRealityCardsEditor = (content: RealityCard[]) => {
    const cards = (editContent ?? content) as RealityCard[];

    // Guard: Ensure cards is an array
    if (!Array.isArray(cards)) {
      return <div className="text-red-500">Error: Content is not an array</div>;
    }

    const updateCard = (index: number, field: keyof RealityCard, value: string) => {
      const newCards = [...cards];
      newCards[index] = { ...newCards[index], [field]: value };
      setEditContent(newCards);
    };

    return (
      <div className="space-y-6">
        {cards.map((card, index) => (
          <div key={index} className="p-4 bg-gray-800 rounded border border-gray-700">
            <h4 className="font-bold mb-3">Карточка {index + 1} ({card.type})</h4>
            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-sm">Заголовок</label>
                <input
                  type="text"
                  value={card.title}
                  onChange={(e) => updateCard(index, 'title', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                />
              </div>
              {card.question && (
                <div>
                  <label className="block mb-1 text-sm">Вопрос</label>
                  <textarea
                    value={card.question}
                    onChange={(e) => updateCard(index, 'question', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                    rows={2}
                  />
                </div>
              )}
              {card.answer && (
                <div>
                  <label className="block mb-1 text-sm">Ответ</label>
                  <textarea
                    value={card.answer}
                    onChange={(e) => updateCard(index, 'answer', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                    rows={2}
                  />
                </div>
              )}
              {card.warning && (
                <div>
                  <label className="block mb-1 text-sm">Предупреждение</label>
                  <input
                    type="text"
                    value={card.warning}
                    onChange={(e) => updateCard(index, 'warning', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  />
                </div>
              )}
              {card.content && (
                <div>
                  <label className="block mb-1 text-sm">Контент</label>
                  <textarea
                    value={card.content}
                    onChange={(e) => updateCard(index, 'content', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                    rows={3}
                  />
                </div>
              )}
              {card.cta && (
                <div>
                  <label className="block mb-1 text-sm">CTA текст</label>
                  <input
                    type="text"
                    value={card.cta}
                    onChange={(e) => updateCard(index, 'cta', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTestimonialsEditor = (content: TestimonialItem[]) => {
    const testimonials = (editContent ?? content) as TestimonialItem[];

    // Guard: Ensure testimonials is an array
    if (!Array.isArray(testimonials)) {
      return <div className="text-red-500">Error: Content is not an array</div>;
    }

    const updateTestimonial = (index: number, field: keyof TestimonialItem, value: string) => {
      const newTestimonials = [...testimonials];
      newTestimonials[index] = { ...newTestimonials[index], [field]: value };
      setEditContent(newTestimonials);
    };

    const addTestimonial = () => {
      setEditContent([...testimonials, { quote: '', name: '', role: '', avatar: '' }]);
    };

    const removeTestimonial = (index: number) => {
      const newTestimonials = testimonials.filter((_, i) => i !== index);
      setEditContent(newTestimonials);
    };

    return (
      <div className="space-y-4">
        {testimonials.map((testimonial, index) => (
          <div key={index} className="p-4 bg-gray-800 rounded border border-gray-700">
            <div className="flex justify-between mb-3">
              <h4 className="font-bold">Отзыв {index + 1}</h4>
              <button
                onClick={() => removeTestimonial(index)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-sm">Цитата</label>
                <textarea
                  value={testimonial.quote}
                  onChange={(e) => updateTestimonial(index, 'quote', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block mb-1 text-sm">Имя</label>
                  <input
                    type="text"
                    value={testimonial.name}
                    onChange={(e) => updateTestimonial(index, 'name', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm">Роль</label>
                  <input
                    type="text"
                    value={testimonial.role}
                    onChange={(e) => updateTestimonial(index, 'role', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm">Аватар</label>
                  <input
                    type="text"
                    value={testimonial.avatar}
                    onChange={(e) => updateTestimonial(index, 'avatar', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addTestimonial}
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Добавить отзыв
        </button>
      </div>
    );
  };

  const renderFeaturesEditor = (content: FeatureItem[]) => {
    const features = (editContent ?? content) as FeatureItem[];

    // Guard: Ensure features is an array
    if (!Array.isArray(features)) {
      return <div className="text-red-500">Error: Content is not an array</div>;
    }

    const updateFeature = (index: number, field: keyof FeatureItem, value: string) => {
      const newFeatures = [...features];
      newFeatures[index] = { ...newFeatures[index], [field]: value };
      setEditContent(newFeatures);
    };

    return (
      <div className="space-y-4">
        {features.map((feature, index) => (
          <div key={index} className="p-4 bg-gray-800 rounded border border-gray-700">
            <h4 className="font-bold mb-3">Feature {feature.number}</h4>
            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-sm">Заголовок</label>
                <input
                  type="text"
                  value={feature.title}
                  onChange={(e) => updateFeature(index, 'title', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">Описание</label>
                <textarea
                  value={feature.description}
                  onChange={(e) => updateFeature(index, 'description', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  rows={3}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderDonationAmountsEditor = (content: DonationAmountItem[]) => {
    const amounts = (editContent ?? content) as DonationAmountItem[];

    // Guard: Ensure amounts is an array
    if (!Array.isArray(amounts)) {
      return <div className="text-red-500">Error: Content is not an array</div>;
    }

    const updateAmount = <K extends keyof DonationAmountItem>(
      index: number,
      field: K,
      value: DonationAmountItem[K]
    ) => {
      const newAmounts = [...amounts];
      newAmounts[index] = { ...newAmounts[index], [field]: value };
      setEditContent(newAmounts);
    };

    const addAmount = () => {
      setEditContent([...amounts, { amount: 1000, description: '', popular: false }]);
    };

    const removeAmount = (index: number) => {
      const newAmounts = amounts.filter((_, i) => i !== index);
      setEditContent(newAmounts);
    };

    return (
      <div className="space-y-4">
        {amounts.map((item, index) => (
          <div key={index} className="p-4 bg-gray-800 rounded border border-gray-700">
            <div className="flex justify-between mb-3">
              <h4 className="font-bold">Сумма {index + 1}</h4>
              <button
                onClick={() => removeAmount(index)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 text-sm">Сумма (₽)</label>
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateAmount(index, 'amount', parseInt(e.target.value))}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm">
                    <input
                      type="checkbox"
                      checked={item.popular}
                      onChange={(e) => updateAmount(index, 'popular', e.target.checked)}
                      className="mr-2"
                    />
                    Популярно
                  </label>
                </div>
              </div>
              <div>
                <label className="block mb-1 text-sm">Описание</label>
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateAmount(index, 'description', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                />
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addAmount}
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Добавить сумму
        </button>
      </div>
    );
  };

  const getSectionTitle = (section: string) => {
    const titles: Record<string, string> = {
      bookmark_banner: '⭐ Баннер закладок',
      hero: '🎯 Герой (Hero)',
      reality_cards: '⚠️ Карточки реальности',
      testimonials: '💬 Отзывы',
      features: '✨ Функции (как это работает)',
      donation_amounts: '💰 Суммы пожертвований'
    };
    return titles[section] || section;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RotateCw className="animate-spin" size={32} />
      </div>
    );
  }

  // Guard: Ensure sections is an array
  if (!Array.isArray(sections)) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-700 rounded p-4">
          <h2 className="text-xl font-bold text-red-400 mb-2">Ошибка загрузки данных</h2>
          <p className="text-gray-300">Не удалось загрузить список секций. Попробуйте обновить страницу.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
          >
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Управление главной страницей</h1>
        <p className="text-gray-400">
          Редактируйте контент всех секций лендинга. Изменения отображаются сразу.
        </p>
      </div>

      <div className="mb-4 p-4 bg-blue-900/20 border border-blue-700 rounded">
        <div className="flex items-start gap-3">
          <Eye size={20} className="text-blue-400 mt-0.5" />
          <div>
            <p className="font-medium text-blue-300">Предпросмотр изменений</p>
            <p className="text-sm text-gray-400 mt-1">
              После сохранения откройте <a href="/" target="_blank" className="text-blue-400 hover:underline">главную страницу</a> в новой вкладке для проверки.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.section} className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <div className="p-4 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{getSectionTitle(section.section)}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Обновлено: {new Date(section.updated_at).toLocaleString('ru-RU')}
                  {section.updated_by_email && ` | ${section.updated_by_email}`}
                </p>
              </div>
              <div className="flex gap-2">
                {editingSection === section.section ? (
                  <>
                    <button
                      onClick={cancelEditing}
                      disabled={saving}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-2"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => saveSection(section.section)}
                      disabled={saving}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded flex items-center gap-2"
                    >
                      {saving ? <RotateCw size={16} className="animate-spin" /> : <Save size={16} />}
                      Сохранить
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startEditing(section)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center gap-2"
                  >
                    <Edit2 size={16} />
                    Редактировать
                  </button>
                )}
              </div>
            </div>

            <div className="p-6">
              {editingSection === section.section ? (
                renderEditor(section)
              ) : (
                <div className="text-sm text-gray-400">
                  {JSON.stringify(section.content, null, 2).length > 500
                    ? JSON.stringify(section.content, null, 2).substring(0, 500) + '...'
                    : JSON.stringify(section.content, null, 2)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
