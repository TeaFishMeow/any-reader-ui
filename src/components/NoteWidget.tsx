import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AppConfig, QARecord, WidgetState } from '../domain'
import { useI18n } from '../i18n'
import type { ResizeFrame } from '../types'
import { IconButton } from './Icon'
import { resizeFrame, WindowFrame } from './WindowFrame'

export function NoteWidget({
  widget,
  record,
  config,
  onFocus,
  onFrameChange,
  onToggle,
  onClose,
  onDelete,
  onChange
}: {
  widget: WidgetState
  record: QARecord
  config: AppConfig
  onFocus: () => void
  onFrameChange: (frame: ResizeFrame) => void
  onToggle: () => void
  onClose: () => void
  onDelete: () => void
  onChange: (text: string, persist?: boolean) => void
}) {
  const { t } = useI18n()
  const title = config.templates.find((template) => template.id === record.promptTemplateId)?.title ?? t('window.note')
  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button,textarea')) return
    onFocus()
    event.preventDefault()
    event.stopPropagation()
    const start = { x: event.clientX, y: event.clientY, ox: widget.position.x, oy: widget.position.y }
    const move = (moveEvent: PointerEvent) => onFrameChange({
      x: start.ox + moveEvent.clientX - start.x,
      y: start.oy + moveEvent.clientY - start.y,
      w: widget.size.w,
      h: widget.size.h
    })
    const done = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
  }

  return (
    <WindowFrame
      className="note-window"
      title={title}
      collapsed={widget.isCollapsed}
      style={{ left: widget.position.x, top: widget.position.y, width: widget.size.w, height: widget.isCollapsed ? undefined : widget.size.h, zIndex: widget.zIndex }}
      onMouseDown={onFocus}
      onTitlePointerDown={drag}
      onResize={(handle, dx, dy) => onFrameChange(resizeFrame(handle, { x: widget.position.x, y: widget.position.y, w: widget.size.w, h: widget.size.h }, dx, dy))}
      actions={
        <>
          <IconButton icon={widget.isCollapsed ? 'chevronDown' : 'chevronUp'} label={t('common.collapse')} active={widget.isCollapsed} onClick={onToggle} />
          <IconButton icon="trash" label={t('common.delete')} danger onClick={onDelete} />
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </>
      }
    >
      <textarea
        className="note-editor"
        value={record.answerMarkdown}
        placeholder={t('qa.notePlaceholder')}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(event.target.value, true)}
      />
    </WindowFrame>
  )
}
