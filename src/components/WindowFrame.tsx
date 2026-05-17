import type { CSSProperties, MouseEventHandler, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { ResizeFrame, ResizeHandle } from '../types'

export function resizeFrame(handle: ResizeHandle, frame: ResizeFrame, dx: number, dy: number, minW = 260, minH = 220) {
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')
  const nextW = Math.max(minW, frame.w + (east ? dx : 0) - (west ? dx : 0))
  const nextH = Math.max(minH, frame.h + (south ? dy : 0) - (north ? dy : 0))
  return {
    x: west ? frame.x + frame.w - nextW : frame.x,
    y: north ? frame.y + frame.h - nextH : frame.y,
    w: nextW,
    h: nextH
  }
}

function ResizeHandles({
  handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
  onResize
}: {
  handles?: ResizeHandle[]
  onResize: (handle: ResizeHandle, dx: number, dy: number) => void
}) {
  const { t } = useI18n()
  return (
    <>
      {handles.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`resize-handle resize-handle-${handle}`}
          aria-label={t('common.resizeWindow')}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            const startX = event.clientX
            const startY = event.clientY
            const move = (moveEvent: PointerEvent) => onResize(handle, moveEvent.clientX - startX, moveEvent.clientY - startY)
            const done = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', done)
              window.removeEventListener('pointercancel', done)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', done)
            window.addEventListener('pointercancel', done)
          }}
        />
      ))}
    </>
  )
}

export function WindowFrame({
  title,
  actions,
  className = '',
  collapsed,
  style,
  onMouseDown,
  onCollapsedBlankClick,
  onTitlePointerDown,
  onResize,
  resizeHandles,
  resizeWhenCollapsed,
  footer,
  footerClassName = '',
  children
}: {
  title?: ReactNode
  actions: ReactNode
  className?: string
  collapsed?: boolean
  style?: CSSProperties
  onMouseDown?: MouseEventHandler<HTMLElement>
  onCollapsedBlankClick?: () => void
  onTitlePointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  onResize?: (handle: ResizeHandle, dx: number, dy: number) => void
  resizeHandles?: ResizeHandle[]
  resizeWhenCollapsed?: boolean
  footer?: ReactNode
  footerClassName?: string
  children: ReactNode
}) {
  const { t } = useI18n()
  const collapsedBlank = collapsed && onCollapsedBlankClick
  return (
    <section className={`window-frame ${className}${collapsed ? ' is-collapsed' : ''}${footer ? ' has-footer' : ''}${collapsedBlank ? ' has-collapsed-blank' : ''}`} style={style} onMouseDown={onMouseDown}>
      <header className="window-titlebar" data-window-drag="true" onPointerDown={onTitlePointerDown}>
        <div className="window-title">{title}</div>
        <div className="window-actions">{actions}</div>
      </header>
      {collapsedBlank ? <button className="window-collapsed-blank" type="button" aria-label={t('common.expand')} onClick={onCollapsedBlankClick} /> : !collapsed || footer ? <div className="window-body">{!collapsed ? children : null}</div> : null}
      {footer ? <footer className={`window-footer ${footerClassName}`}>{footer}</footer> : null}
      {onResize && (!collapsed || resizeWhenCollapsed) ? <ResizeHandles handles={resizeHandles} onResize={onResize} /> : null}
    </section>
  )
}
