import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

const HEIGHT = {
  sm: 'h-9',
  md: 'h-10',
} as const

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  /** Alto del campo. Es una prop y no una clase: `className="h-9"` no ganaría a la altura base */
  size?: keyof typeof HEIGHT
  /** Contenido decorativo dentro del campo, a la izquierda (p. ej. "$") */
  prefix?: ReactNode
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Input({ prefix, invalid = false, size = 'md', className = '', ref, ...rest }: InputProps) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${HEIGHT[size]} w-full rounded-lg border bg-background px-3 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? 'border-error' : 'border-outline-variant'} ${prefix ? 'pl-8' : ''} ${className}`}
      {...rest}
    />
  )

  if (!prefix) return input

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-outline">
        {prefix}
      </span>
      {input}
    </div>
  )
}
