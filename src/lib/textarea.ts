export function fitTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  const maxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight) || 0
  textarea.style.height = 'auto'
  textarea.style.height = `${maxHeight ? Math.min(textarea.scrollHeight, maxHeight) : textarea.scrollHeight}px`
  textarea.style.overflowY = maxHeight && textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}
