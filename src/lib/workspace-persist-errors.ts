export function shouldAutoRetryWorkspacePersist(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    if (error.status === 408 || error.status === 425 || error.status === 429) {
      return true
    }

    if (error.status >= 500) {
      return true
    }

    return false
  }

  return true
}

export function resolveWorkspacePersistRetryDelayMs(error: unknown, fallbackMs = 0) {
  const normalizedFallbackMs = Number.isFinite(fallbackMs) && fallbackMs > 0 ? fallbackMs : 0
  if (!error || typeof error !== 'object') {
    return normalizedFallbackMs
  }

  const retryAfterMs =
    'retryAfterMs' in error && typeof error.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs)
      ? error.retryAfterMs
      : 'details' in error &&
          error.details &&
          typeof error.details === 'object' &&
          'retryAfterMs' in error.details &&
          typeof error.details.retryAfterMs === 'number' &&
          Number.isFinite(error.details.retryAfterMs)
        ? error.details.retryAfterMs
        : null

  if (retryAfterMs === null || retryAfterMs <= 0) {
    return normalizedFallbackMs
  }

  return Math.max(normalizedFallbackMs, retryAfterMs)
}
