import { useTranslation } from 'react-i18next'
import AvatarUpload from '@/components/profile/AvatarUpload'
import Card from '@/components/ui/Card'

interface StepAvatarProps {
  avatarPreview: string | null
  onFileSelect: (file: File) => void
  onRemove: () => void
}

export default function StepAvatar({ avatarPreview, onFileSelect, onRemove }: StepAvatarProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <div className="flex flex-col items-center py-4 space-y-4">
        <h2 className="text-lg font-semibold font-display text-text">
          {t('onboarding.step1Title')}
        </h2>
        <p className="text-sm text-text-secondary text-center max-w-md">
          {t('onboarding.step1Subtitle')}
        </p>

        <AvatarUpload
          currentUrl={avatarPreview}
          onUpload={async (file) => { onFileSelect(file) }}
          onRemove={async () => { onRemove() }}
          size="lg"
        />
      </div>
    </Card>
  )
}
