import type { AppConfig } from '../../src_original_reference/types/domain'

export type ShortcutAction = keyof AppConfig['shortcuts'] | 'toggleTheme'

const toggleThemeKey = 'anyreader.shortcut.toggleTheme'
const defaultShortcuts: Record<ShortcutAction, string> = {
  toggleLeft: '[',
  toggleRight: ']',
  openContext: 'Ctrl+Shift+S',
  toggleTheme: 'Ctrl+Shift+L'
}

function keyName(key: string) {
  const lower = key.toLowerCase()
  if (lower === ' ') return 'Space'
  if (lower === 'escape') return 'Esc'
  return key.length === 1 ? key.toUpperCase() : key
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>) {
  const key = keyName(event.key)
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return ''
  return [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Meta',
    key
  ].filter(Boolean).join('+')
}

export function shortcutValue(config: AppConfig, action: ShortcutAction) {
  if (action === 'toggleTheme') return localStorage.getItem(toggleThemeKey) || defaultShortcuts.toggleTheme
  return config.shortcuts[action] || defaultShortcuts[action]
}

export function setShortcut(config: AppConfig, action: ShortcutAction, value: string): AppConfig {
  if (action === 'toggleTheme') {
    localStorage.setItem(toggleThemeKey, value)
    return { ...config }
  }
  return { ...config, shortcuts: { ...config.shortcuts, [action]: value } }
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut.toLowerCase().split('+').filter(Boolean)
  const key = parts.pop()
  if (!key) return false
  return (
    keyName(event.key).toLowerCase() === key &&
    event.ctrlKey === parts.includes('ctrl') &&
    event.altKey === parts.includes('alt') &&
    event.shiftKey === parts.includes('shift') &&
    event.metaKey === parts.includes('meta')
  )
}
