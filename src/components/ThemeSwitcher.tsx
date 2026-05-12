import type { ChangeEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useTheme, type UiThemePreference } from '../theme/useTheme'
import './ThemeSwitcher.css'

interface ThemeSwitcherProps {
  className?: string
  variant?: 'header' | 'field'
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

function LightThemeIcon() {
  return (
    <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 1.75v2.5M10 15.75v2.5M4.17 4.17l1.77 1.77M14.06 14.06l1.77 1.77M1.75 10h2.5M15.75 10h2.5M4.17 15.83l1.77-1.77M14.06 5.94l1.77-1.77" />
    </svg>
  )
}

function DarkThemeIcon() {
  return (
    <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
      <path d="M14.7 13.9A6.5 6.5 0 0 1 8.1 5.3a.55.55 0 0 0-.86-.58A7.9 7.9 0 1 0 15.28 12.76a.55.55 0 0 0-.58-.86Z" />
    </svg>
  )
}

export function ThemeSwitcher({ className, variant = 'header' }: ThemeSwitcherProps) {
  const { t } = useI18n()
  const { theme, themePreference, setThemePreference } = useTheme()
  const currentLabel = t(`theme.option.${theme}`)
  const title = themePreference === 'system' ? `${t('theme.option.system')} (${currentLabel})` : currentLabel
  const actionLabel = t(theme === 'dark' ? 'theme.action.switchToLight' : 'theme.action.switchToDark')

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setThemePreference(event.target.value as UiThemePreference)
  }

  function handleToggle() {
    setThemePreference(theme === 'dark' ? 'light' : 'dark')
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        className={joinClassNames('theme-switcher', 'theme-switcher--header-button', className)}
        aria-label={`${t('theme.label')}: ${currentLabel}. ${actionLabel}`}
        title={title}
        onClick={handleToggle}
      >
        <span className="theme-switcher__icon" aria-hidden="true">
          {theme === 'dark' ? <DarkThemeIcon /> : <LightThemeIcon />}
        </span>
      </button>
    )
  }

  return (
    <label className={joinClassNames('theme-switcher', 'theme-switcher--field', className)}>
      <span className="theme-switcher__label">{t('theme.label')}</span>
      <select value={themePreference} aria-label={t('theme.label')} title={title} onChange={handleChange}>
        <option value="system">{t('theme.option.system')}</option>
        <option value="light">{t('theme.option.light')}</option>
        <option value="dark">{t('theme.option.dark')}</option>
      </select>
    </label>
  )
}
