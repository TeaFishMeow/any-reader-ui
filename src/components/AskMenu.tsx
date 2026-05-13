import { useEffect, useRef } from 'react'
import { clamp } from '../../src_original_reference/lib/text'
import type { PromptTemplate } from '../../src_original_reference/types/domain'
import type { AskMenuState } from '../types'

export function AskMenu({
  state,
  templates,
  onHover,
  onPick,
  onClose
}: {
  state: AskMenuState
  templates: PromptTemplate[]
  onHover: (templateId: string) => void
  onPick: (template: PromptTemplate) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="ask-menu"
      style={{
        left: clamp(state.session.action.menuPoint.x, 12, window.innerWidth - 340),
        top: clamp(state.session.action.menuPoint.y, 12, window.innerHeight - 260)
      }}
    >
      {templates.map((template) => (
        <button
          key={template.id}
          className={template.id === state.hoveredTemplateId ? 'is-hovered' : ''}
          type="button"
          onMouseEnter={() => onHover(template.id)}
          onFocus={() => onHover(template.id)}
          onClick={() => onPick(template)}
        >
          <span style={{ color: template.color }}>{template.title}</span>
          <small>{template.body}</small>
        </button>
      ))}
    </div>
  )
}
