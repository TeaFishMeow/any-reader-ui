import { useEffect, useRef } from 'react'
import type { AppConfig, LlmAccessState } from '../../src_original_reference/types/domain'
import { useI18n } from '../i18n'
import { selectionMenuPosition } from '../lib/menuPosition'
import type { MenuState } from '../types'
export function FloatingMenu({
  state,
  config,
  llmAccess,
  onClose,
  onOpenSettings,
  onSelectModel
}: {
  state: MenuState
  config: AppConfig
  llmAccess: LlmAccessState | null
  onClose: () => void
  onOpenSettings: () => void
  onSelectModel: (modelId: string) => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const models = llmAccess?.models.length ? llmAccess.models : [
    { id: 'gpt-4.1-mini', displayName: 'gpt-4.1-mini', model: 'gpt-4.1-mini', cost: 1, isDefault: true },
    { id: 'gpt-4.1', displayName: 'gpt-4.1', model: 'gpt-4.1', cost: 3, isDefault: false },
    { id: 'o4-mini', displayName: 'o4-mini', model: 'o4-mini', cost: 2, isDefault: false },
    { id: 'o3', displayName: 'o3', model: 'o3', cost: 6, isDefault: false }
  ]
  return (
    <div ref={ref} className="floating-menu" style={selectionMenuPosition(state)}>
      {state.kind === 'model' ? (
        <>
          <div className="floating-menu-row floating-menu-heading">{t('menu.modelSelect')}</div>
          {models.map((model) => (
            <button
              key={model.id}
              className={model.id === config.provider.model ? 'is-active' : ''}
              type="button"
              onClick={() => { onSelectModel(model.id); onClose() }}
            >
              <span>{model.displayName || model.model}</span>
              <small>{model.cost}</small>
            </button>
          ))}
          <a className="floating-menu-row floating-menu-subscription" href="/subscription">{t('menu.manageSubscription')}</a>
        </>
      ) : (
        <button type="button" onClick={() => { onOpenSettings(); onClose() }}>
          <span>{t('common.settings')}</span>
        </button>
      )}
    </div>
  )
}
