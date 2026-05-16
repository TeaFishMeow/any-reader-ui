import type { CanvasState, CanvasViewportSize } from '../domain'
import { clamp, createId } from './text'

export const MIN_WIDGET_WIDTH = 260
export const MIN_WIDGET_HEIGHT = 220
export const DEFAULT_WIDGET_WIDTH = 480
export const DEFAULT_WIDGET_HEIGHT = 600
export const MIN_CANVAS_ZOOM = 0.6
export const MAX_CANVAS_ZOOM = 1.7

const CANVAS_WIDGET_PADDING = 28

export function clampWidgetSize(size: { w: number; h: number }) {
  return {
    w: Math.max(MIN_WIDGET_WIDTH, Math.round(size.w || DEFAULT_WIDGET_WIDTH)),
    h: Math.max(MIN_WIDGET_HEIGHT, Math.round(size.h || DEFAULT_WIDGET_HEIGHT))
  }
}

export function normalizeCanvasViewport(viewport: CanvasState['viewport']): CanvasState['viewport'] {
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: clamp(Number.isFinite(viewport.zoom) ? viewport.zoom : 1, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
  }
}

function visibleCanvasRect(canvas: CanvasState, viewportSize: CanvasViewportSize) {
  const viewport = normalizeCanvasViewport(canvas.viewport)
  return {
    left: -viewport.x / viewport.zoom,
    top: -viewport.y / viewport.zoom,
    width: Math.max(1, viewportSize.width / viewport.zoom),
    height: Math.max(1, viewportSize.height / viewport.zoom)
  }
}

function clampWidgetPosition(
  position: { x: number; y: number },
  size: { w: number; h: number },
  visibleRect: { left: number; top: number; width: number; height: number }
) {
  const maxX = visibleRect.left + visibleRect.width - size.w - CANVAS_WIDGET_PADDING
  const maxY = visibleRect.top + visibleRect.height - size.h - CANVAS_WIDGET_PADDING
  const minX = visibleRect.left + CANVAS_WIDGET_PADDING
  const minY = visibleRect.top + CANVAS_WIDGET_PADDING

  return {
    x: Math.round(size.w >= visibleRect.width - CANVAS_WIDGET_PADDING * 2 ? minX : clamp(position.x, minX, maxX)),
    y: Math.round(size.h >= visibleRect.height - CANVAS_WIDGET_PADDING * 2 ? minY : clamp(position.y, minY, maxY))
  }
}

function canPlaceWidget(
  position: { x: number; y: number },
  size: { w: number; h: number },
  visibleRect: { left: number; top: number; width: number; height: number }
) {
  return (
    position.x >= visibleRect.left + CANVAS_WIDGET_PADDING &&
    position.y >= visibleRect.top + CANVAS_WIDGET_PADDING &&
    position.x + size.w <= visibleRect.left + visibleRect.width - CANVAS_WIDGET_PADDING &&
    position.y + size.h <= visibleRect.top + visibleRect.height - CANVAS_WIDGET_PADDING
  )
}

export function nextWidgetFrame(canvas: CanvasState, viewportSize: CanvasViewportSize) {
  const nextZIndex = Math.max(0, ...canvas.widgetStates.map((widget) => widget.zIndex)) + 1
  const offset = canvas.widgetStates.length % 8
  const size = clampWidgetSize({ w: DEFAULT_WIDGET_WIDTH, h: DEFAULT_WIDGET_HEIGHT })
  const visibleRect = visibleCanvasRect(canvas, viewportSize)
  const selectedWidget = canvas.selection?.widgetId
    ? canvas.widgetStates.find((widget) => widget.id === canvas.selection?.widgetId) ?? null
    : null
  const selectedSize = selectedWidget ? clampWidgetSize(selectedWidget.size) : null
  const gap = 24
  const contextualPosition =
    selectedWidget && selectedSize
      ? [
          { x: selectedWidget.position.x + gap, y: selectedWidget.position.y + selectedSize.h + gap },
          { x: selectedWidget.position.x + gap, y: selectedWidget.position.y - size.h - gap },
          { x: selectedWidget.position.x + selectedSize.w + gap, y: selectedWidget.position.y + gap },
          { x: selectedWidget.position.x - size.w - gap, y: selectedWidget.position.y + gap }
        ].find((position) => canPlaceWidget(position, size, visibleRect)) ?? null
      : null
  const proposedPosition = contextualPosition ?? {
    x: visibleRect.left + visibleRect.width * 0.5 - size.w / 2 + offset * 18,
    y: visibleRect.top + visibleRect.height * 0.45 - size.h / 2 + offset * 16
  }

  return {
    id: createId('widget'),
    position: clampWidgetPosition(proposedPosition, size, visibleRect),
    size,
    zIndex: nextZIndex,
    isCollapsed: false
  }
}
