import { Check } from 'lucide-react'

interface StepIndicatorProps {
  steps: string[]
  currentStep: number
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {steps.map((label, i) => {
        const isComplete = i < currentStep
        const isCurrent = i === currentStep

        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                  transition-all duration-300
                  ${isComplete
                    ? 'bg-accent text-white'
                    : isCurrent
                      ? 'bg-accent/20 text-accent border-2 border-accent'
                      : 'bg-bg-elevated text-text-muted border border-border'
                  }
                `}
              >
                {isComplete ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`
                  text-[10px] mt-1 whitespace-nowrap
                  ${isCurrent ? 'text-accent font-medium' : 'text-text-muted'}
                `}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`
                  w-8 md:w-12 h-0.5 mx-1 mt-[-12px] rounded-full transition-colors duration-300
                  ${i < currentStep ? 'bg-accent' : 'bg-border'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
