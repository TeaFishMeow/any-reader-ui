import { useRef, useState } from 'react'
import { MAIN_CANVAS_ID } from '../../src_original_reference/lib/defaults'
import { sortTemplates } from '../../src_original_reference/lib/app-helpers'
import { markdownToPlainText } from '../../src_original_reference/lib/text'
import type { AppConfig, AskAction, DocumentNode, QARecord, WidgetState } from '../../src_original_reference/types/domain'
import type { ResizeFrame } from '../types'
import { displayAnswerMarkdown, markdownBlocks, selectionAction } from '../lib/markdown'
import { DetailWindow } from './DetailWindow'
import { IconButton } from './Icon'
import { resizeFrame, WindowFrame } from './WindowFrame'

export function QaWidget({
  widget,
  record,
  documents,
  config,
  onFocus,
  onFrameChange,
  onToggle,
  onClose,
  onDelete,
  onAsk
}: {
  widget: WidgetState
  record: QARecord | null
  documents: DocumentNode[]
  config: AppConfig
  onFocus: () => void
  onFrameChange: (frame: ResizeFrame) => void
  onToggle: () => void
  onClose: () => void
  onDelete: () => void
  onAsk: (action: AskAction) => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const drag = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button,input,textarea,.window-body')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const sx = event.clientX
    const sy = event.clientY
    const ox = widget.position.x
    const oy = widget.position.y
    const move = (moveEvent: PointerEvent) =>
      onFrameChange({
        x: ox + moveEvent.clientX - sx,
        y: oy + moveEvent.clientY - sy,
        w: widget.size.w,
        h: widget.size.h
      })
    const done = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
  }
  const sourceDocument = record?.sourceDocumentId ? documents.find((document) => document.id === record.sourceDocumentId) : null
  const answerText = displayAnswerMarkdown(record?.answerMarkdown || (record?.answerStatus === 'pending' ? '等待回答...' : ''))
  const title = record
    ? sortTemplates(config.templates).find((template) => template.id === record.promptTemplateId)?.title || record.customPromptTitle || '问答'
    : '问答'
  const surfaceText = record ? markdownToPlainText(answerText) : ''

  return (
    <WindowFrame
      className="qa-window"
      title={title}
      collapsed={widget.isCollapsed}
      style={{
        left: widget.position.x,
        top: widget.position.y,
        width: widget.size.w,
        height: widget.isCollapsed ? undefined : widget.size.h,
        zIndex: widget.zIndex
      }}
      onResize={(handle, dx, dy) =>
        onFrameChange(resizeFrame(handle, {
          x: widget.position.x,
          y: widget.position.y,
          w: widget.size.w,
          h: widget.size.h
        }, dx, dy))
      }
      actions={
        <>
          <IconButton icon={widget.isCollapsed ? 'chevronDown' : 'chevronUp'} label="收起" active={widget.isCollapsed} onClick={onToggle} />
          <IconButton icon="trash" label="删除" danger onClick={onDelete} />
          <IconButton icon="close" label="关闭" onClick={onClose} />
        </>
      }
      onMouseDown={onFocus}
    >
      <div ref={ref} className="qa-inner" onPointerDown={drag}>
        <DetailWindow
          open={detailsOpen}
          selectedText={record?.selectedText ?? ''}
          context={record?.readingContextSnapshot ?? ''}
          onToggle={() => setDetailsOpen((value) => !value)}
        />
        <div className="question-text">{record?.questionText}</div>
        <article
          className="markdown-body"
          style={{ fontSize: config.rendering.widgetFontPx }}
          onMouseUp={(event) => {
            const action = record ? selectionAction({
              eventPoint: { x: event.clientX, y: event.clientY + 8 },
              surface: 'widget',
              target: { widgetId: widget.id },
              sourceQaRecordId: record.id,
              surfaceTitle: title,
              surfaceText
            }) : null
            if (action) onAsk(action)
          }}
        >
          {markdownBlocks(answerText, sourceDocument?.path)}
        </article>
      </div>
    </WindowFrame>
  )
}
