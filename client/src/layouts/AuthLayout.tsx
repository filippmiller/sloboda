import { Outlet } from 'react-router-dom'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

export default function AuthLayout() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
          style={{
            background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
            top: '-10%',
            right: '-10%',
            animation: 'glow-pulse 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-10 blur-[100px]"
          style={{
            background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
            bottom: '-5%',
            left: '-5%',
            animation: 'glow-pulse 6s ease-in-out infinite 2s',
          }}
        />
      </div>

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h1 className="text-3xl font-bold font-display text-text tracking-[0.15em]">
            SLOBODA
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            {t('common.brand.tagline')}
          </p>
        </motion.div>
        <motion.div
          className="bg-bg-card/60 backdrop-blur-lg border border-white/[0.06] rounded-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_24px_var(--color-accent-soft)]"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Outlet />
        </motion.div>
      </motion.div>
    </div>
  )
}
