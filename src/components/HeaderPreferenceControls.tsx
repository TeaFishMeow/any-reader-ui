import type { HTMLAttributes } from 'react'
import { LocaleSwitcher } from './LocaleSwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'

interface HeaderPreferenceControlsProps extends HTMLAttributes<HTMLDivElement> {}

export function HeaderPreferenceControls({ className, ...props }: HeaderPreferenceControlsProps) {
  const resolvedClassName = ['header-preference-controls', className].filter(Boolean).join(' ')

  return (
    <div className={resolvedClassName} {...props}>
      <ThemeSwitcher />
      <LocaleSwitcher />
    </div>
  )
}
