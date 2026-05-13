export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
