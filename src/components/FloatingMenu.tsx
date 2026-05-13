import { useEffect, useRef } from 'react'
import type { AppConfig, LlmAccessState } from '../../src_original_reference/types/domain'
import type { MenuState } from '../types'
import { Icon } from './Icon'

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
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const models = llmAccess?.models ?? []
  return (
    <div ref={ref} className="floating-menu" style={{ left: state.x, top: state.y }}>
      {state.kind === 'model' ? (
        models.length ? models.map((model) => (
          <button key={model.id} type="button" onClick={() => { onSelectModel(model.id); onClose() }}>
            <Icon name="spark" />
            <span>{model.displayName || model.model}</span>
          </button>
        )) : (
          <button type="button">
            <Icon name="spark" />
            <span>{config.provider.model}</span>
          </button>
        )
      ) : (
        <button type="button" onClick={() => { onOpenSettings(); onClose() }}>
          <Icon name="settings" />
          <span>Settings</span>
        </button>
      )}
    </div>
  )
}
