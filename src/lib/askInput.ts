export type AskSubmitShortcut = 'enter' | 'ctrl-enter'

const askSubmitShortcutKey = 'anyreader.ask.submitShortcut'

export function askSubmitShortcut(): AskSubmitShortcut {
  return localStorage.getItem(askSubmitShortcutKey) === 'ctrl-enter' ? 'ctrl-enter' : 'enter'
}

export function setAskSubmitShortcut(value: AskSubmitShortcut) {
  localStorage.setItem(askSubmitShortcutKey, value)
}

export function shouldSubmitAsk(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>) {
  if (event.key !== 'Enter') return false
  return askSubmitShortcut() === 'ctrl-enter' ? event.ctrlKey || event.metaKey : true
}
