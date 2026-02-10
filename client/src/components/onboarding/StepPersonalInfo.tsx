import { useTranslation } from 'react-i18next'
import CountrySelect from '@/components/profile/CountrySelect'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'

interface PersonalInfoData {
  countryCode: string
  city: string
  region: string
  birthYear: string
  gender: string
}

interface StepPersonalInfoProps {
  data: PersonalInfoData
  onChange: (partial: Partial<PersonalInfoData>) => void
}

export default function StepPersonalInfo({ data, onChange }: StepPersonalInfoProps) {
  const { t } = useTranslation()

  const genderOptions = [
    { value: 'male', label: t('onboarding.genderMale') },
    { value: 'female', label: t('onboarding.genderFemale') },
    { value: 'other', label: t('onboarding.genderOther') },
    { value: 'prefer_not_to_say', label: t('onboarding.genderPreferNot') },
  ]

  return (
    <Card>
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-semibold font-display text-text">
            {t('onboarding.step2Title')}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {t('onboarding.step2Subtitle')}
          </p>
        </div>

        <CountrySelect
          label={t('onboarding.countryLabel')}
          placeholder={t('onboarding.countryPlaceholder')}
          value={data.countryCode}
          onChange={(code) => onChange({ countryCode: code })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('onboarding.cityLabel')}
            placeholder={t('onboarding.cityPlaceholder')}
            value={data.city}
            onChange={(e) => onChange({ city: e.target.value })}
          />
          <Input
            label={t('onboarding.regionLabel')}
            placeholder={t('onboarding.regionPlaceholder')}
            value={data.region}
            onChange={(e) => onChange({ region: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('onboarding.birthYearLabel')}
            placeholder={t('onboarding.birthYearPlaceholder')}
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={data.birthYear}
            onChange={(e) => onChange({ birthYear: e.target.value })}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('onboarding.genderLabel')}
            </label>
            <select
              value={data.gender}
              onChange={(e) => onChange({ gender: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-glow)] transition-all duration-200 appearance-none"
            >
              <option value="">{t('onboarding.genderPreferNot')}</option>
              {genderOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Card>
  )
}
