import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  Edit3,
  Trash2,
  Send,
  FileText,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
} from 'lucide-react'
import type { EmailTemplate, EmailCampaign } from '@/types'

type ActiveTab = 'campaigns' | 'templates'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  sending: 'Отправка',
  sent: 'Отправлено',
  failed: 'Ошибка',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-500/20 text-yellow-400',
  sending: 'bg-blue-500/20 text-blue-400',
  sent: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
}

export default function Campaigns() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('campaigns')
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null)

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '' })
  const [templateSaving, setTemplateSaving] = useState(false)
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null)

  // Campaigns state
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [campaignForm, setCampaignForm] = useState({
    subject: '',
    body: '',
    templateId: '',
    statusFilter: '',
  })
  const [campaignSending, setCampaignSending] = useState(false)

  // Check email config
  useEffect(() => {
    adminApi.get('/email/status')
      .then(res => setEmailConfigured(res.data.configured))
      .catch(() => setEmailConfigured(false))
  }, [])

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const res = await adminApi.get('/templates')
      setTemplates(res.data.data ?? [])
    } catch {
      toast.error('Ошибка загрузки шаблонов')
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    try {
      const res = await adminApi.get('/campaigns')
      setCampaigns(res.data.data ?? [])
    } catch {
      toast.error('Ошибка загрузки кампаний')
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
    fetchCampaigns()
  }, [fetchTemplates, fetchCampaigns])

  // Template CRUD
  const openCreateTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm({ name: '', subject: '', body: '' })
    setTemplateModalOpen(true)
  }

  const openEditTemplate = (t: EmailTemplate) => {
    setEditingTemplate(t)
    setTemplateForm({ name: t.name, subject: t.subject, body: t.body })
    setTemplateModalOpen(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) {
      toast.error('Заполните все поля')
      return
    }
    setTemplateSaving(true)
    try {
      if (editingTemplate) {
        await adminApi.put(`/templates/${editingTemplate.id}`, templateForm)
        toast.success('Шаблон обновлён')
      } else {
        await adminApi.post('/templates', templateForm)
        toast.success('Шаблон создан')
      }
      setTemplateModalOpen(false)
      fetchTemplates()
    } catch {
      toast.error('Ошибка сохранения шаблона')
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return
    try {
      await adminApi.delete(`/templates/${deleteTemplateId}`)
      toast.success('Шаблон удалён')
      setDeleteTemplateId(null)
      fetchTemplates()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  // Campaign create & send
  const openCreateCampaign = () => {
    setCampaignForm({ subject: '', body: '', templateId: '', statusFilter: '' })
    setCampaignModalOpen(true)
  }

  const handleTemplateSelect = (templateId: string) => {
    setCampaignForm(prev => ({ ...prev, templateId }))
    if (templateId) {
      const t = templates.find(t => t.id === parseInt(templateId))
      if (t) {
        setCampaignForm(prev => ({ ...prev, subject: t.subject, body: t.body }))
      }
    }
  }

  const handleSendCampaign = async () => {
    if (!campaignForm.subject.trim() || !campaignForm.body.trim()) {
      toast.error('Заполните тему и текст')
      return
    }

    setCampaignSending(true)
    try {
      const payload: Record<string, unknown> = {
        subject: campaignForm.subject,
        body: campaignForm.body,
        templateId: campaignForm.templateId ? parseInt(campaignForm.templateId) : undefined,
      }
      if (campaignForm.statusFilter) {
        payload.filters = { status: campaignForm.statusFilter }
      }

      const res = await adminApi.post('/campaigns', payload)
      toast.success(`Кампания создана. Получателей: ${res.data.recipientCount}`)
      setCampaignModalOpen(false)
      fetchCampaigns()
    } catch {
      toast.error('Ошибка отправки кампании')
    } finally {
      setCampaignSending(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Рассылки</h1>
        {activeTab === 'templates' ? (
          <Button size="sm" onClick={openCreateTemplate}>
            <Plus size={16} />
            Новый шаблон
          </Button>
        ) : (
          <Button size="sm" onClick={openCreateCampaign} disabled={emailConfigured === false}>
            <Send size={16} />
            Новая кампания
          </Button>
        )}
      </div>

      {/* Email config warning */}
      {emailConfigured === false && (
        <Card className="mb-4 border-yellow-500/30">
          <div className="flex items-center gap-3 text-yellow-400">
            <AlertTriangle size={18} />
            <div>
              <p className="text-sm font-medium">Email не настроен</p>
              <p className="text-xs text-text-muted">
                Установите переменную RESEND_API_KEY для отправки писем.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-bg-card border border-border rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
            ${activeTab === 'campaigns' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text'}`}
        >
          <Mail size={14} className="inline mr-1.5" />
          Кампании
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
            ${activeTab === 'templates' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text'}`}
        >
          <FileText size={14} className="inline mr-1.5" />
          Шаблоны
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <Card padding="none">
          {campaignsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">
              Кампаний пока нет
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-text-secondary font-medium">Тема</th>
                    <th className="text-left p-3 text-text-secondary font-medium">Статус</th>
                    <th className="text-left p-3 text-text-secondary font-medium">Получателей</th>
                    <th className="text-left p-3 text-text-secondary font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                      <td className="p-3 font-medium max-w-xs truncate">{c.subject}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? ''}`}>
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="p-3 text-text-secondary">
                        <Users size={14} className="inline mr-1" />
                        {c.recipient_count}
                      </td>
                      <td className="p-3 text-text-muted">
                        {new Date(c.created_at).toLocaleDateString('ru-RU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <Card padding="none">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">
              Шаблонов пока нет
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-text-secondary font-medium">Название</th>
                    <th className="text-left p-3 text-text-secondary font-medium">Тема письма</th>
                    <th className="text-left p-3 text-text-secondary font-medium">Дата</th>
                    <th className="text-left p-3 text-text-secondary font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                      <td className="p-3 font-medium">{t.name}</td>
                      <td className="p-3 text-text-secondary max-w-xs truncate">{t.subject}</td>
                      <td className="p-3 text-text-muted">
                        {new Date(t.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditTemplate(t)}
                            className="p-1.5 rounded text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTemplateId(t.id)}
                            className="p-1.5 rounded text-text-secondary hover:text-red-400 hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Template Editor Modal */}
      <Modal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        title={editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон'}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название шаблона"
            value={templateForm.name}
            onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Например: Приветствие"
          />
          <Input
            label="Тема письма"
            value={templateForm.subject}
            onChange={e => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
            placeholder="Тема email сообщения"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Текст письма
            </label>
            <textarea
              value={templateForm.body}
              onChange={e => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
              placeholder="Текст письма... Используйте {{name}}, {{email}} для персонализации."
              rows={8}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm placeholder:text-text-muted resize-none
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            <p className="text-xs text-text-muted">
              Переменные: {'{{name}}'}, {'{{email}}'}, {'{{location}}'}, {'{{motivation}}'}
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setTemplateModalOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" loading={templateSaving} onClick={handleSaveTemplate}>
              {editingTemplate ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Template Confirmation */}
      <Modal
        open={deleteTemplateId !== null}
        onOpenChange={() => setDeleteTemplateId(null)}
        title="Удалить шаблон?"
        description="Это действие нельзя отменить."
      >
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setDeleteTemplateId(null)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" onClick={handleDeleteTemplate}>
            Удалить
          </Button>
        </div>
      </Modal>

      {/* Campaign Creator Modal */}
      <Modal
        open={campaignModalOpen}
        onOpenChange={setCampaignModalOpen}
        title="Новая кампания"
        description="Отправить массовое email сообщение"
      >
        <div className="flex flex-col gap-4">
          {/* Template selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Шаблон (необязательно)</label>
            <select
              value={campaignForm.templateId}
              onChange={e => handleTemplateSelect(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Без шаблона</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Recipient filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Получатели</label>
            <select
              value={campaignForm.statusFilter}
              onChange={e => setCampaignForm(prev => ({ ...prev, statusFilter: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Все заявки</option>
              <option value="new">Только новые</option>
              <option value="contacted">Связались</option>
              <option value="qualified">Подходящие</option>
              <option value="converted">Принятые</option>
            </select>
          </div>

          <Input
            label="Тема письма"
            value={campaignForm.subject}
            onChange={e => setCampaignForm(prev => ({ ...prev, subject: e.target.value }))}
            placeholder="Тема"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Текст письма</label>
            <textarea
              value={campaignForm.body}
              onChange={e => setCampaignForm(prev => ({ ...prev, body: e.target.value }))}
              placeholder="Текст сообщения..."
              rows={8}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm placeholder:text-text-muted resize-none
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setCampaignModalOpen(false)}>
              Отмена
            </Button>
            <Button
              size="sm"
              loading={campaignSending}
              onClick={handleSendCampaign}
              disabled={emailConfigured === false}
            >
              <Send size={14} />
              Отправить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
