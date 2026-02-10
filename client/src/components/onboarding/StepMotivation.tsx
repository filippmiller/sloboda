import { useTranslation } from 'react-i18next'
import { Textarea } from '@/components/ui/Input'
import Card from '@/components/ui/Card'

interface MotivationData {
  motivation: string
  participationInterest: string
}

interface StepMotivationProps {
  data: MotivationData
  onChange: (partial: Partial<MotivationData>) => void
}

export default function StepMotivation({ data, onChange }: StepMotivationProps) {
  const { t } = useTranslation()

  const participationOptions = [
    { value: 'relocate', label: t('onboarding.participationRelocate') },
    { value: 'invest', label: t('onboarding.participationInvest') },
    { value: 'remote', label: t('onboarding.participationRemote') },
    { value: 'visit', label: t('onboarding.participationVisit') },
    { value: 'other', label: t('onboarding.participationOther') },
  ]

  return (
    <Card>
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-semibold font-display text-text">
            {t('onboarding.step4Title')}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {t('onboarding.step4Subtitle')}
          </p>
        </div>

        <div className="bg-bg-elevated border border-border rounded-lg p-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('onboarding.whyImportant')}
          </p>
        </div>

        <Textarea
          label={t('onboarding.motivationLabel')}
          placeholder={t('onboarding.motivationPlaceholder')}
          value={data.motivation}
          onChange={(e) => onChange({ motivation: e.target.value })}
          rows={4}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-secondary">
            {t('onboarding.participationLabel')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {participationOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ participationInterest: opt.value })}
                className={`
                  px-4 py-2.5 rounded-lg text-sm text-left
                  border transition-all duration-200
                  ${data.participationInterest === opt.value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-bg-card text-text-secondary hover:border-border-hover hover:text-text'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
