import { useTranslation } from 'react-i18next'
import Input from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Input'
import TagInput from '@/components/profile/TagInput'
import Card from '@/components/ui/Card'

interface AboutYouData {
  bio: string
  profession: string
  skills: string[]
  interests: string[]
  hobbies: string[]
}

interface StepAboutYouProps {
  data: AboutYouData
  onChange: (partial: Partial<AboutYouData>) => void
}

export default function StepAboutYou({ data, onChange }: StepAboutYouProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-semibold font-display text-text">
            {t('onboarding.step3Title')}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {t('onboarding.step3Subtitle')}
          </p>
        </div>

        <Textarea
          label={t('onboarding.bioLabel')}
          placeholder={t('onboarding.bioPlaceholder')}
          value={data.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
          rows={3}
        />

        <Input
          label={t('onboarding.professionLabel')}
          placeholder={t('onboarding.professionPlaceholder')}
          value={data.profession}
          onChange={(e) => onChange({ profession: e.target.value })}
        />

        <TagInput
          label={t('onboarding.skillsLabel')}
          placeholder={t('onboarding.skillsPlaceholder')}
          value={data.skills}
          onChange={(tags) => onChange({ skills: tags })}
        />

        <TagInput
          label={t('onboarding.interestsLabel')}
          placeholder={t('onboarding.interestsPlaceholder')}
          value={data.interests}
          onChange={(tags) => onChange({ interests: tags })}
        />

        <TagInput
          label={t('onboarding.hobbiesLabel')}
          placeholder={t('onboarding.hobbiesPlaceholder')}
          value={data.hobbies}
          onChange={(tags) => onChange({ hobbies: tags })}
        />
      </div>
    </Card>
  )
}
