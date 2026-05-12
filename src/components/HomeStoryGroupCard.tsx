import { useState } from 'react'
import type { UiLocale } from '../i18n/useI18n'

interface StoryEntry {
  id: string
  label: string
  title: string
  body: string
}

interface StoryGroup {
  rangeLabel: string
  entries: StoryEntry[]
}

interface HomeStoryGroupCardProps {
  group: StoryGroup
  locale: UiLocale
  nextLabel: string
}

function extractWhyNotName(title: string, locale: UiLocale) {
  const pattern = locale === 'zh-CN' ? /^为什么不用\s*(.+?)？$/ : /^Why not\s+(.+?)\?$/
  return pattern.exec(title)?.[1] ?? null
}

function formatAccumulatedTitle(entries: StoryEntry[], entryIndex: number, locale: UiLocale) {
  const entry = entries[entryIndex]
  if (!entry) {
    return ''
  }

  if (entries[0]?.id !== '10') {
    return entry.title
  }

  const names = entries.slice(0, entryIndex + 1).map((item) => extractWhyNotName(item.title, locale))
  if (names.some((name) => name === null)) {
    return entry.title
  }

  const separator = locale === 'zh-CN' ? '、' : ', '
  const prefix = locale === 'zh-CN' ? '为什么不用 ' : 'Why not '
  const suffix = locale === 'zh-CN' ? '？' : '?'

  return `${prefix}${names.join(separator)}${suffix}`
}

function progressDotClass(entryIndex: number, visibleCount: number) {
  if (entryIndex === visibleCount - 1) {
    return 'page-shell__home-story-progress-dot is-current'
  }

  if (entryIndex < visibleCount - 1) {
    return 'page-shell__home-story-progress-dot is-revealed'
  }

  return 'page-shell__home-story-progress-dot'
}

export function HomeStoryGroupCard({ group, locale, nextLabel }: HomeStoryGroupCardProps) {
  const [visibleCount, setVisibleCount] = useState(1)
  const visibleEntries = group.entries.slice(0, visibleCount)
  const currentEntry = visibleEntries[visibleEntries.length - 1] ?? group.entries[0]
  const canAdvance = visibleCount < group.entries.length
  const nextEntry = canAdvance ? group.entries[visibleCount] : null

  function handleAdvance() {
    setVisibleCount((current) => Math.min(current + 1, group.entries.length))
  }

  if (!currentEntry) {
    return null
  }

  return (
    <article className="page-shell__home-story-step">
      <div className="page-shell__home-story-range" aria-hidden="true">
        {group.rangeLabel}
      </div>
      <div className="page-shell__home-story-card">
        <div className="page-shell__home-story-card-head">
          <div className="page-shell__home-story-item-line">
            <span className="page-shell__home-story-current">{currentEntry.label}</span>
            <h3 className="page-shell__home-story-question">
              {formatAccumulatedTitle(group.entries, visibleEntries.length - 1, locale)}
            </h3>
          </div>
          {canAdvance && nextEntry ? (
            <button
              className="page-shell__home-story-next"
              type="button"
              onClick={handleAdvance}
              aria-label={`${nextLabel} ${nextEntry.label}`}
            >
              <span className="page-shell__home-story-next-text">{nextLabel}</span>
              <span className="page-shell__home-story-next-icon" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="page-shell__home-story-responses">
          {visibleEntries.map((entry, entryIndex) => (
            <p
              className={
                entryIndex === visibleEntries.length - 1
                  ? 'page-shell__home-story-response is-current'
                  : 'page-shell__home-story-response'
              }
              key={entry.id}
            >
              {entry.body}
            </p>
          ))}
        </div>

        <div className="page-shell__home-story-progress" aria-hidden="true">
          {group.entries.map((entry, entryIndex) => (
            <span className={progressDotClass(entryIndex, visibleCount)} key={entry.id} />
          ))}
        </div>
      </div>
    </article>
  )
}
