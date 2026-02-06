import { useEffect, useState } from 'react'
import adminApi from '@/services/adminApi'
import { useAdminStore } from '@/stores/adminStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'
import {
  Loader2,
  Save,
  Lock,
} from 'lucide-react'
import type { Setting } from '@/types'

interface SettingConfig {
  key: string
  label: string
  description: string
  group: string
  type: 'text' | 'email' | 'boolean'
}

const SETTING_SCHEMA: SettingConfig[] = [
  { key: 'site_name', label: 'Название сайта', description: 'Основное название проекта', group: 'Сайт', type: 'text' },
  { key: 'contact_email', label: 'Контактный email', description: 'Email для связи', group: 'Сайт', type: 'email' },
  { key: 'auto_welcome_email', label: 'Автоматическое приветствие', description: 'Отправлять welcome email при регистрации', group: 'Email', type: 'boolean' },
  { key: 'notify_on_registration', label: 'Уведомления о заявках', description: 'Отправлять уведомление админам при новой заявке', group: 'Email', type: 'boolean' },
]

export default function Settings() {
  const admin = useAdminStore((s) => s.admin)
  const isSuperAdmin = admin?.role === 'super_admin'

  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await adminApi.get('/settings')
        const data: Setting[] | Record<string, string> = res.data.data

        // Handle both array and object formats
        if (Array.isArray(data)) {
          const map: Record<string, string> = {}
          for (const s of data) {
            map[s.key] = s.value
          }
          setSettings(map)
        } else {
          setSettings(data ?? {})
        }
      } catch {
        toast.error('Ошибка загрузки настроек')
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSave = async () => {
    if (!isSuperAdmin) {
      toast.error('Только super_admin может изменять настройки')
      return
    }

    setSaving(true)
    try {
      await adminApi.patch('/settings', settings)
      toast.success('Настройки сохранены')
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const groups = [...new Set(SETTING_SCHEMA.map((s) => s.group))]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Настройки</h1>
        {!isSuperAdmin && (
          <span className="flex items-center gap-1 text-sm text-text-muted">
            <Lock size={14} />
            Только для чтения
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <Card key={group} padding="md">
            <h2 className="text-sm font-semibold font-display text-text mb-4">{group}</h2>

            <div className="flex flex-col gap-4">
              {SETTING_SCHEMA
                .filter((s) => s.group === group)
                .map((schema) => (
                  <div key={schema.key} className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text-secondary">
                      {schema.label}
                    </label>
                    <p className="text-xs text-text-muted">{schema.description}</p>

                    {schema.type === 'boolean' ? (
                      <label className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          checked={settings[schema.key] === 'true'}
                          onChange={(e) => updateSetting(schema.key, e.target.checked ? 'true' : 'false')}
                          disabled={!isSuperAdmin}
                          className="w-4 h-4 rounded border-border bg-bg-card text-accent
                            focus:ring-accent/30 disabled:opacity-50"
                        />
                        <span className="text-sm text-text">
                          {settings[schema.key] === 'true' ? 'Включено' : 'Выключено'}
                        </span>
                      </label>
                    ) : (
                      <input
                        type={schema.type}
                        value={settings[schema.key] ?? ''}
                        onChange={(e) => updateSetting(schema.key, e.target.value)}
                        disabled={!isSuperAdmin}
                        className="w-full px-3 py-2 rounded-lg bg-bg border border-border
                          text-text text-sm placeholder:text-text-muted
                          focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                          disabled:opacity-50 disabled:cursor-not-allowed
                          transition-colors"
                      />
                    )}
                  </div>
                ))}
            </div>
          </Card>
        ))}

        {isSuperAdmin && (
          <div className="flex justify-end">
            <Button loading={saving} onClick={handleSave}>
              <Save size={16} />
              Сохранить настройки
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
