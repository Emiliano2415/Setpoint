import type { Ref, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  ref?: Ref<HTMLSelectElement>
}

export function Select({ invalid = false, className = '', children, ref, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`h-10 w-full appearance-none rounded-lg border bg-background px-3 pr-9 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? 'border-error' : 'border-outline-variant'} ${className}`}
        {...rest}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline">
        <ChevronDown size={16} />
      </span>
    </div>
  )
}
