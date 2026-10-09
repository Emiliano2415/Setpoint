import type { Ref, TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ invalid = false, className = '', ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? 'border-error' : 'border-outline-variant'} ${className}`}
      {...rest}
    />
  )
}
