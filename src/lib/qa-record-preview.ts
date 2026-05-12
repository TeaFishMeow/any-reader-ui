import { useEffect, useState } from 'react'
import type { QARecord } from '../types/domain'
import { makeSummary } from './text'

export function isActiveAnswerStatus(status: QARecord['answerStatus']) {
  return status === 'pending' || status === 'streaming'
}

export function formatElapsedMs(elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return null
  }

  if (elapsedMs < 60_000) {
    return `${(elapsedMs / 1000).toFixed(1)}s`
  }

  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function resolveElapsedMs(record: QARecord | null, now: number) {
  if (!record) {
    return null
  }

  if (typeof record.timing.durationMs === 'number' && Number.isFinite(record.timing.durationMs)) {
    return record.timing.durationMs
  }

  const requestedAt = Date.parse(record.timing.requestedAt)
  if (!Number.isFinite(requestedAt)) {
    return null
  }

  const completedAt = record.timing.completedAt ? Date.parse(record.timing.completedAt) : Number.NaN
  if (Number.isFinite(completedAt)) {
    return Math.max(0, completedAt - requestedAt)
  }

  return Math.max(0, now - requestedAt)
}

export function useQaRecordElapsedLabel(record: QARecord | null) {
  const isLive = record ? isActiveAnswerStatus(record.answerStatus) : false
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (!isLive) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 100)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isLive, record?.id, record?.timing.requestedAt, record?.timing.completedAt, record?.timing.durationMs])

  const elapsedMs = resolveElapsedMs(record, now)
  return elapsedMs === null ? null : formatElapsedMs(elapsedMs)
}

export function getQaRecordAnswerPreviewMarkdown(
  record: QARecord | null,
  elapsedLabel?: string | null,
  labels?: {
    answerPending?: string
  }
) {
  const answerMarkdown = record?.answerMarkdown?.trim() ?? ''
  if (answerMarkdown) {
    return answerMarkdown
  }

  if (record && isActiveAnswerStatus(record.answerStatus)) {
    return elapsedLabel ? `...(${elapsedLabel})` : '...'
  }

  return labels?.answerPending ?? '(answer pending)'
}

export function getQaRecordAnswerPreviewText(
  record: QARecord | null,
  elapsedLabel?: string | null,
  limit = 220,
  labels?: {
    answerPending?: string
  }
) {
  return makeSummary(getQaRecordAnswerPreviewMarkdown(record, elapsedLabel, labels), limit)
}
