import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

const nativeSelectionBridgeNodeNames = new Set(['inlineMath', 'blockMath', 'image'])

export function collectNativeSelectionBridgeNodePositions(doc: ProseMirrorNode, from: number, to: number) {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  if (start === end) {
    return [] as number[]
  }

  const positions: number[] = []
  doc.nodesBetween(start, end, (node, pos) => {
    if (!nativeSelectionBridgeNodeNames.has(node.type.name)) {
      return true
    }

    const nodeStart = pos
    const nodeEnd = pos + node.nodeSize
    if (start < nodeEnd && end > nodeStart) {
      positions.push(pos)
    }

    return true
  })

  return positions
}
