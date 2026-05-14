import { clamp } from '../../src_original_reference/lib/text'

export function selectionMenuPosition(point: { x: number; y: number }) {
  return {
    left: clamp(point.x, 12, window.innerWidth - 340),
    top: clamp(point.y, 12, window.innerHeight - 260)
  }
}
