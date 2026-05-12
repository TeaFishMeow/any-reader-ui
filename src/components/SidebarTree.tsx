import { useMemo } from 'react'
import { buildDocumentContextBlock } from '../lib/app-helpers'
import type { AskSelection, DocumentNode, RepoMeta, SidebarNode } from '../types/domain'

interface SidebarTreeProps {
  repo: RepoMeta
  nodes: SidebarNode[]
  documents: DocumentNode[]
  collapsedFolderIds: string[]
  currentDocumentId: string
  onOpenDocument: (documentId: string) => void
  onToggleFolder: (folderId: string) => void
  onAsk: (selection: AskSelection) => void
}

export function SidebarTree({
  repo,
  nodes,
  documents,
  collapsedFolderIds,
  currentDocumentId,
  onOpenDocument,
  onToggleFolder,
  onAsk
}: SidebarTreeProps) {
  const collapsedIdSet = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds])
  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, SidebarNode[]>()
    for (const node of nodes) {
      if (!node.parentId) {
        continue
      }
      map.set(node.parentId, [...(map.get(node.parentId) ?? []), node])
    }
    return map
  }, [nodes])

  function collectDescendantDocuments(nodeId: string): DocumentNode[] {
    const collected: DocumentNode[] = []
    const queue = [...(childrenByParent.get(nodeId) ?? [])]

    while (queue.length > 0) {
      const node = queue.shift()
      if (!node) {
        continue
      }

      if (node.type === 'document') {
        const document = documentMap.get(node.documentId ?? node.id)
        if (document) {
          collected.push(document)
        }
        continue
      }

      queue.push(...(childrenByParent.get(node.id) ?? []))
    }

    return collected
  }

  function buildNodeSurfaceText(node: SidebarNode) {
    if (node.type === 'repo') {
      return documents.map((document) => buildDocumentContextBlock(document)).join('\n\n')
    }

    if (node.type === 'document') {
      return documentMap.get(node.documentId ?? node.id)?.contentPlainText ?? node.label
    }

    return collectDescendantDocuments(node.id)
      .map((document) => buildDocumentContextBlock(document))
      .join('\n\n')
  }

  function openContextMenu(event: React.MouseEvent, node: SidebarNode) {
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
        surfaceText: buildNodeSurfaceText(node)
      },
      surfaceTitle: node.label,
      menuPoint: {
        x: event.clientX,
        y: event.clientY
      }
    })
  }

  function renderNode(node: SidebarNode) {
    const children = childrenByParent.get(node.id) ?? []
    const isFolder = node.type === 'folder'
    const isExpandable = children.length > 0
    const isCollapsed = isExpandable && collapsedIdSet.has(node.id)
    const isDocumentActive = node.type === 'document' && (node.documentId ?? node.id) === currentDocumentId

    return (
      <li key={node.id}>
        <button
          className={`tree-item ${isDocumentActive ? 'active' : ''} ${isExpandable ? 'folder-item' : ''}`}
          onClick={() => {
            if (node.type === 'document') {
              onOpenDocument(node.documentId ?? node.id)
              return
            }
            if (isExpandable) {
              onToggleFolder(node.id)
            }
          }}
          onContextMenu={(event) => openContextMenu(event, node)}
          aria-expanded={isExpandable ? !isCollapsed : undefined}
        >
          {isExpandable ? (
            <span
              className={`tree-disclosure ${isCollapsed ? 'collapsed' : ''}`}
              aria-hidden="true"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleFolder(node.id)
              }}
            >
              <svg className="tree-disclosure-icon" viewBox="0 0 12 12" focusable="false" aria-hidden="true">
                <path d="M3 4.5 6 7.5 9 4.5" />
              </svg>
            </span>
          ) : (
            <span className="tree-disclosure spacer" aria-hidden="true" />
          )}
          <span className="tree-item-label" title={node.label}>
            {node.label}
          </span>
        </button>
        {isExpandable && !isCollapsed ? <ul className="tree-list">{children.map(renderNode)}</ul> : null}
      </li>
    )
  }

  return (
    <div className="tree-wrap">
      <ul className="tree-list">{(childrenByParent.get(repo.id) ?? []).map(renderNode)}</ul>
    </div>
  )
}
