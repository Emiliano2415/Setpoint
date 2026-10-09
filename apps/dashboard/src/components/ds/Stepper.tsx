import { Fragment } from 'react'

interface StepperProps {
  steps: string[]
  /** Índice del paso actual (base 0) */
  current: number
}

const CIRCLE = {
  done: 'border-primary bg-primary text-on-primary',
  current: 'border-primary text-primary',
  pending: 'border-outline-variant text-outline',
} as const

const LABEL = {
  done: 'text-xs text-on-surface-variant',
  current: 'text-xs font-medium text-on-surface',
  pending: 'text-xs text-outline',
} as const

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'pending'
        const step = (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium tabular-nums ${CIRCLE[state]}`}
            >
              {index + 1}
            </span>
            <span className={LABEL[state]}>{label}</span>
          </li>
        )
        if (index === steps.length - 1) return step
        return (
          <Fragment key={`${label}-sep`}>
            {step}
            <li aria-hidden="true">
              <span className="block h-px w-6 bg-outline-variant" />
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
