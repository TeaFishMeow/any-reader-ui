import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MAIN_CANVAS_ID } from '../lib/defaults'
import { sortTemplates } from '../lib/app-helpers'
import { markdownToPlainText } from '../lib/text'
import type { AppConfig, AskAction, QARecord, WidgetState } from '../domain'
import { useI18n } from '../i18n'
import type { ResizeFrame } from '../types'
import { shouldSubmitAsk } from '../lib/askInput'
import { displayAnswerMarkdown, markedRecordIdFromTarget, markdownBlocks, renderInlineMath, selectionAction, type MarkdownHighlight } from '../lib/markdown'
import { qaMessages, type QaMessage } from '../lib/qaConversation'
import { fitTextarea } from '../lib/textarea'
import { DetailWindow } from './DetailWindow'
import { Icon, IconButton } from './Icon'
import { resizeFrame, WindowFrame } from './WindowFrame'

const EMPTY_HIGHLIGHTS: MarkdownHighlight[] = []
const normalizeMarkdownText = (text: string) => markdownToPlainText(text).replace(/\s+/g, '')

export function QaWidget({
  widget,
  record,
  highlights,
  config,
  onFocus,
  onFrameChange,
  onToggle,
  onClose,
  onDelete,
  onAsk,
  onContinue,
  onOpenRecord
}: {
  widget: WidgetState
  record: QARecord | null
  highlights: MarkdownHighlight[]
  config: AppConfig
  onFocus: () => void
  onFrameChange: (frame: ResizeFrame) => void
  onToggle: () => void
  onClose: () => void
  onDelete: () => void
  onAsk: (action: AskAction) => void
  onContinue: (question: string) => void
  onOpenRecord: (recordId: string) => void
}) {
  const { t } = useI18n()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const questionRef = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => fitTextarea(questionRef.current), [question])
  const drag = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button,input,textarea')) return
    onFocus()
    event.preventDefault()
    event.stopPropagation()
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
      window.removeEventListener('pointercancel', done)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
  }
  const title = record
    ? sortTemplates(config.templates).find((template) => template.id === record.promptTemplateId)?.title || t('window.qa')
    : t('window.qa')
  const pendingAnswer = t('common.pendingAnswer')
  const messages = useMemo(() => record ? qaMessages(record, pendingAnswer) : [], [record, pendingAnswer])
  const canContinue = !!record && record.answerStatus !== 'pending' && record.answerStatus !== 'streaming'
  const isEmptyCustomAsk = !!record && !record.questionText.trim() && !record.answerMarkdown.trim()
  useEffect(() => {
    if (isEmptyCustomAsk) setDetailsOpen(true)
  }, [isEmptyCustomAsk, record?.id])
  const messageHighlights = useMemo(() => messages.map((message) => {
    if (message.role !== 'assistant') return EMPTY_HIGHLIGHTS
    const text = normalizeMarkdownText(message.markdown)
    return highlights.filter((highlight) => {
      const quote = highlight.quote ? normalizeMarkdownText(highlight.quote) : ''
      if (!quote || highlight.anchorFrom === undefined || highlight.anchorTo === undefined) return true
      return text.slice(highlight.anchorFrom, highlight.anchorTo) === quote || text.includes(quote)
    })
  }), [messages, highlights])
  const submitFollowUp = (event: React.FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!canContinue || !text) return
    setQuestion('')
    onContinue(text)
  }

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
      onTitlePointerDown={drag}
      actions={
        <>
          <IconButton icon={widget.isCollapsed ? 'chevronDown' : 'chevronUp'} label={t('common.collapse')} active={widget.isCollapsed} onClick={onToggle} />
          <IconButton icon="trash" label={t('common.delete')} danger onClick={onDelete} />
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </>
      }
      onMouseDown={onFocus}
    >
      <div className="qa-inner">
        <div className="qa-thread" style={{ fontSize: config.rendering.widgetFontPx }}>
          <DetailWindow
            open={detailsOpen}
            selectedText={record?.selectedText ?? ''}
            context={record?.readingContextSnapshot ?? ''}
            onToggle={() => setDetailsOpen((value) => !value)}
          />
          {messages.map((message, index) => message.role === 'user' ? (
            <div className="qa-question" key={`user-${index}`}>
              {renderInlineMath(message.markdown, `qa-question-${widget.id}-${index}`)}
            </div>
          ) : (
            <article
              className="qa-answer reader-body markdown-body"
              key={`assistant-${index}`}
              onClick={(event) => {
                const recordId = markedRecordIdFromTarget(event.target)
                if (!recordId) return
                event.preventDefault()
                event.stopPropagation()
                onOpenRecord(recordId)
              }}
              onMouseUp={(event) => {
                const action = record ? selectionAction({
                  eventPoint: { x: event.clientX, y: event.clientY + 8 },
                  surface: 'widget',
                  target: { widgetId: widget.id },
                  sourceQaRecordId: record.id,
                  surfaceTitle: title,
                  surfaceText: markdownToPlainText(message.markdown)
                }) : null
                if (action) onAsk(action)
              }}
            >
              {markdownBlocks(displayAnswerMarkdown(message.markdown), undefined, messageHighlights[index] ?? EMPTY_HIGHLIGHTS)}
            </article>
          ))}
        </div>
        <form className="qa-composer" onSubmit={submitFollowUp}>
          <textarea
            ref={questionRef}
            rows={1}
            value={question}
            placeholder={isEmptyCustomAsk ? t('qa.customAskPlaceholder') : t('qa.followUpPlaceholder')}
            disabled={!canContinue}
            onChange={(event) => setQuestion(event.target.value)}
            onInput={(event) => fitTextarea(event.currentTarget)}
            onKeyDown={(event) => {
              if (!event.shiftKey && shouldSubmitAsk(event.nativeEvent)) submitFollowUp(event)
            }}
          />
          <button type="submit" title={t('qa.send')} aria-label={t('qa.send')} disabled={!canContinue || !question.trim()}>
            <Icon name="send" />
          </button>
        </form>
      </div>
    </WindowFrame>
  )
}
