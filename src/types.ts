import type { PendingAskSession } from './domain'

export type IconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronUp'
  | 'chevronDown'
  | 'maximize'
  | 'close'
  | 'trash'
  | 'settings'
  | 'folder'
  | 'file'
  | 'star'
  | 'save'
  | 'keyboard'
  | 'plus'
  | 'minus'
  | 'drag'
  | 'send'

export type ModalName = 'settings' | null
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export type ResizeFrame = { x: number; y: number; w: number; h: number }

export interface AskMenuState {
  session: PendingAskSession
  hoveredTemplateId: string | null
}

export interface MenuState {
  kind: 'model' | 'settings'
  x: number
  y: number
}
