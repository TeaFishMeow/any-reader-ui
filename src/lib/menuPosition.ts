import { clamp } from './text'

export function selectionMenuPosition(point: { x: number; y: number }) {
  const margin = 12
  const gap = 8
  const alignRight = point.x > window.innerWidth / 2
  const openUp = point.y > window.innerHeight / 2

  return {
    left: clamp(point.x + (alignRight ? -gap : gap), margin, window.innerWidth - margin),
    top: clamp(point.y + (openUp ? -gap : gap), margin, window.innerHeight - margin),
    transform: `${alignRight ? 'translateX(-100%)' : ''}${openUp ? ' translateY(-100%)' : ''}`.trim()
  }
}
