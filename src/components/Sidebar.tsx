import { useMemo } from 'react'
import type { AskAction, DocumentNode, RepoMeta, SidebarNode } from '../../src_original_reference/types/domain'
import { Icon } from './Icon'

export function Sidebar({
  repo,
  nodes,
  documents,
  currentDocumentId,
  collapsedIds,
  onToggle,
  onOpen,
  onAsk
}: {
  repo: RepoMeta
  nodes: SidebarNode[]
  documents: DocumentNode[]
  currentDocumentId: string
  collapsedIds: string[]
  onToggle: (nodeId: string) => void
  onOpen: (documentId: string) => void
  onAsk: (action: AskAction) => void
}) {
  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds])
  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const childrenMap = useMemo(() => {
    const map = new Map<string, SidebarNode[]>()
    nodes.forEach((node) => {
      if (!node.parentId) return
      map.set(node.parentId, [...(map.get(node.parentId) ?? []), node])
    })
    return map
  }, [nodes])

  const collectText = (node: SidebarNode): string => {
    if (node.type === 'document') return documentMap.get(node.documentId ?? node.id)?.contentPlainText ?? node.label
    const queue = [...(childrenMap.get(node.id) ?? [])]
    const parts: string[] = []
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (item.type === 'document') {
        const document = documentMap.get(item.documentId ?? item.id)
        if (document) parts.push(`# ${document.title}\n${document.contentPlainText}`)
      } else {
        queue.push(...(childrenMap.get(item.id) ?? []))
      }
    }
    return parts.join('\n\n')
  }

  const openNodeMenu = (event: React.MouseEvent, node: SidebarNode) => {
    event.preventDefault()
    onAsk({
      surface: 'sidebar',
      target: {
        sidebarNodeId: node.id,
        sidebarNodeType: node.type,
        sidebarLabel: node.label
      },
      selection: {
        text: node.label,
        kind: 'node-label',
        surfaceText: collectText(node)
      },
      surfaceTitle: node.label,
      menuPoint: { x: event.clientX, y: event.clientY }
    })
  }

  const renderNode = (node: SidebarNode, depth = 0) => {
    const children = childrenMap.get(node.id) ?? []
    const expandable = children.length > 0
    const collapsed = collapsedSet.has(node.id)
    const active = node.type === 'document' && (node.documentId ?? node.id) === currentDocumentId
    return (
      <li key={node.id}>
        <button
          className={`tree-item${active ? ' is-active' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          type="button"
          onClick={() => node.type === 'document' ? onOpen(node.documentId ?? node.id) : expandable ? onToggle(node.id) : undefined}
          onContextMenu={(event) => openNodeMenu(event, node)}
        >
          <Icon name={node.type === 'document' ? 'file' : 'folder'} />
          <span>{node.label}</span>
        </button>
        {expandable && !collapsed ? <ul>{children.map((child) => renderNode(child, depth + 1))}</ul> : null}
      </li>
    )
  }

  return <ul className="tree-list">{(childrenMap.get(repo.id) ?? []).map((node) => renderNode(node))}</ul>
}
