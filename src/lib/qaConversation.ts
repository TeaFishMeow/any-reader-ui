import type { QARecord } from '../domain'

export type QaMessage = {
  role: 'user' | 'assistant'
  markdown: string
}

const userMarker = '<!--anyreader-chat:user-->'
const assistantMarker = '<!--anyreader-chat:assistant-->'
const markerPattern = /<!--anyreader-chat:(user|assistant)-->/g

export function appendFollowUp(answerMarkdown: string, question: string) {
  const previous = answerMarkdown.trimEnd()
  return `${previous}${previous ? '\n\n' : ''}${userMarker}\n${question.trim()}\n${assistantMarker}\n`
}

export function readableConversation(answerMarkdown: string) {
  return answerMarkdown.replace(/<!--anyreader-chat:(user|assistant)-->/g, '').trim()
}

export function qaMessages(record: QARecord, pendingText: string) {
  const messages: QaMessage[] = record.questionText.trim()
    ? [{ role: 'user', markdown: record.questionText }]
    : []
  const active = record.answerStatus === 'pending' || record.answerStatus === 'streaming'
  let role: QaMessage['role'] = 'assistant'
  let cursor = 0
  let match: RegExpExecArray | null
  markerPattern.lastIndex = 0

  const add = (end: number) => {
    const markdown = record.answerMarkdown.slice(cursor, end).trim()
    if (markdown || (active && role === 'assistant' && end === record.answerMarkdown.length)) {
      messages.push({ role, markdown: markdown || pendingText })
    }
  }

  while ((match = markerPattern.exec(record.answerMarkdown))) {
    add(match.index)
    role = match[1] === 'user' ? 'user' : 'assistant'
    cursor = markerPattern.lastIndex
  }
  add(record.answerMarkdown.length)

  return messages
}
