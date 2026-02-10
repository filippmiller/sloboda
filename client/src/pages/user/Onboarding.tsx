import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { ROUTES } from '@/config/routes'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import Button from '@/components/ui/Button'
import StepIndicator from '@/components/onboarding/StepIndicator'
import StepAvatar from '@/components/onboarding/StepAvatar'
import StepPersonalInfo from '@/components/onboarding/StepPersonalInfo'
import StepAboutYou from '@/components/onboarding/StepAboutYou'
import StepMotivation from '@/components/onboarding/StepMotivation'

interface OnboardingData {
  // Step 1
  avatarFile: File | null
  avatarPreview: string | null
  // Step 2
  countryCode: string
  city: string
  region: string
  birthYear: string
  gender: string
  // Step 3
  bio: string
  profession: string
  skills: string[]
  interests: string[]
  hobbies: string[]
  // Step 4
  motivation: string
  participationInterest: string
}

const initialData: OnboardingData = {
  avatarFile: null,
  avatarPreview: null,
  countryCode: '',
  city: '',
  region: '',
  birthYear: '',
  gender: '',
  bio: '',
  profession: '',
  skills: [],
  interests: [],
  hobbies: [],
  motivation: '',
  participationInterest: '',
}

export default function Onboarding() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>(initialData)
  const [submitting, setSubmitting] = useState(false)
  const [direction, setDirection] = useState(1)

  const TOTAL_STEPS = 4
  const stepLabels = [
    t('onboarding.step1Title'),
    t('onboarding.step2Title'),
    t('onboarding.step3Title'),
    t('onboarding.step4Title'),
  ]

  const update = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setDirection(1)
      setStep(step + 1)
    }
  }

  const goBack = () => {
    if (step > 0) {
      setDirection(-1)
      setStep(step - 1)
    }
  }

  const handleSkip = async () => {
    setSubmitting(true)
    try {
      await api.post('/user/onboarding/complete')
      await checkAuth()
      navigate(ROUTES.DASHBOARD, { replace: true })
    } catch {
      toast.error(t('common.errors.unknownError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinish = async () => {
    setSubmitting(true)
    try {
      // Step 1: Upload avatar if selected
      if (data.avatarFile) {
        const formData = new FormData()
        formData.append('avatar', data.avatarFile)
        await api.post('/user/profile/avatar', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      // Step 2: Save extended profile
      await api.put('/user/profile/extended', {
        countryCode: data.countryCode || undefined,
        city: data.city || undefined,
        region: data.region || undefined,
        birthYear: data.birthYear ? parseInt(data.birthYear) : undefined,
        gender: data.gender || undefined,
        bio: data.bio || undefined,
        profession: data.profession || undefined,
        skills: data.skills.length > 0 ? data.skills : undefined,
        interests: data.interests.length > 0 ? data.interests : undefined,
        hobbies: data.hobbies.length > 0 ? data.hobbies : undefined,
        motivation: data.motivation || undefined,
        participationInterest: data.participationInterest || undefined,
      })

      // Step 3: Mark onboarding complete
      await api.post('/user/onboarding/complete')

      // Refresh auth state
      await checkAuth()

      toast.success(t('onboarding.successTitle'))
      navigate(ROUTES.DASHBOARD, { replace: true })
    } catch {
      toast.error(t('common.errors.unknownError'))
    } finally {
      setSubmitting(false)
    }
  }

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold font-display text-text">
          {t('onboarding.title')}
        </h2>
        <p className="text-sm text-text-secondary max-w-lg mx-auto">
          {t('onboarding.subtitle')}
        </p>
      </div>

      <StepIndicator steps={stepLabels} currentStep={step} />

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
          {step === 0 && (
            <StepAvatar
              avatarPreview={data.avatarPreview}
              onFileSelect={(file) => {
                const reader = new FileReader()
                reader.onload = (e) => update({
                  avatarFile: file,
                  avatarPreview: e.target?.result as string,
                })
                reader.readAsDataURL(file)
              }}
              onRemove={() => update({ avatarFile: null, avatarPreview: null })}
            />
          )}

          {step === 1 && (
            <StepPersonalInfo
              data={{
                countryCode: data.countryCode,
                city: data.city,
                region: data.region,
                birthYear: data.birthYear,
                gender: data.gender,
              }}
              onChange={(partial) => update(partial)}
            />
          )}

          {step === 2 && (
            <StepAboutYou
              data={{
                bio: data.bio,
                profession: data.profession,
                skills: data.skills,
                interests: data.interests,
                hobbies: data.hobbies,
              }}
              onChange={(partial) => update(partial)}
            />
          )}

          {step === 3 && (
            <StepMotivation
              data={{
                motivation: data.motivation,
                participationInterest: data.participationInterest,
              }}
              onChange={(partial) => update(partial)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {step > 0 ? (
            <Button variant="ghost" onClick={goBack} disabled={submitting}>
              <ArrowLeft size={16} />
              {t('onboarding.backButton')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
              {t('onboarding.skipButton')}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
              {t('onboarding.skipButton')}
            </Button>
          )}

          {step < TOTAL_STEPS - 1 ? (
            <Button onClick={goNext} disabled={submitting}>
              {t('onboarding.nextButton')}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={handleFinish} loading={submitting}>
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              {t('onboarding.finishButton')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
