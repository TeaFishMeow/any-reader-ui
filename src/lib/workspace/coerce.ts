export type JsonRecord = Record<string, unknown>

export function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value)
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

export function asOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}
