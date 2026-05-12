import type { ChangeEvent } from 'react'
import { useI18n, type UiLocalePreference } from '../i18n/useI18n'
import './LocaleSwitcher.css'

interface LocaleSwitcherProps {
  className?: string
  variant?: 'header' | 'field'
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

export function LocaleSwitcher({ className, variant = 'header' }: LocaleSwitcherProps) {
  const { locale, localePreference, setLocalePreference, t } = useI18n()
  const title =
    localePreference === 'system'
      ? `${t('locale.option.system')} (${t(`locale.option.${locale}`)})`
      : undefined
  const headerLabel = locale === 'zh-CN' ? 'ZH' : 'EN'

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setLocalePreference(event.target.value as UiLocalePreference)
  }

  function handleToggle() {
    setLocalePreference(locale === 'zh-CN' ? 'en-US' : 'zh-CN')
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        className={joinClassNames('locale-switcher', 'locale-switcher--header-button', className)}
        aria-label={`${t('locale.label')}: ${t(`locale.option.${locale}`)}`}
        title={title ?? t(`locale.option.${locale}`)}
        onClick={handleToggle}
      >
        {headerLabel}
      </button>
    )
  }

  return (
    <label className={joinClassNames('locale-switcher', 'locale-switcher--field', className)}>
      <span className="locale-switcher__label">{t('locale.label')}</span>
      <select value={localePreference} aria-label={t('locale.label')} title={title} onChange={handleChange}>
        <option value="system">{t('locale.option.system')}</option>
        <option value="zh-CN">{t('locale.option.zh-CN')}</option>
        <option value="en-US">{t('locale.option.en-US')}</option>
      </select>
    </label>
  )
}
