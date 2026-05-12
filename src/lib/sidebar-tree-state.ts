import type { SidebarNode } from '../types/domain'

function collectExpandableNodeIds(nodes: SidebarNode[]) {
  return new Set(
    nodes
      .filter((node) => node.type === 'folder' || node.childrenIds.length > 0)
      .map((node) => node.id)
  )
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export function normalizeCollapsedSidebarFolderIds(collapsedFolderIds: string[] | undefined, nodes: SidebarNode[]) {
  if (!Array.isArray(collapsedFolderIds) || collapsedFolderIds.length === 0) {
    return []
  }

  const availableFolderIds = collectExpandableNodeIds(nodes)
  const seen = new Set<string>()
  const next: string[] = []

  for (const folderId of collapsedFolderIds) {
    if (!availableFolderIds.has(folderId) || seen.has(folderId)) {
      continue
    }

    seen.add(folderId)
    next.push(folderId)
  }

  return next
}

export function toggleCollapsedSidebarFolderId(
  collapsedFolderIds: string[] | undefined,
  folderId: string,
  nodes: SidebarNode[]
) {
  const normalized = normalizeCollapsedSidebarFolderIds(collapsedFolderIds, nodes)
  if (!collectExpandableNodeIds(nodes).has(folderId)) {
    return normalized
  }

  return normalized.includes(folderId)
    ? normalized.filter((candidate) => candidate !== folderId)
    : [...normalized, folderId]
}
