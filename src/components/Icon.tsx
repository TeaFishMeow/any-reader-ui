import type { IconName } from '../types'

function iconPath(name: IconName) {
  switch (name) {
    case 'chevronLeft':
      return 'M10.5 3.5 6 8l4.5 4.5'
    case 'chevronRight':
      return 'M5.5 3.5 10 8l-4.5 4.5'
    case 'chevronUp':
      return 'M3.5 10.5 8 6l4.5 4.5'
    case 'chevronDown':
      return 'M3.5 5.5 8 10l4.5-4.5'
    case 'maximize':
      return 'M4 4h8v8H4z'
    case 'close':
      return 'M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5'
    case 'trash':
      return 'M3.5 4.5h9M6.5 2.75h3M5 4.5v7.25c0 .4.35.75.75.75h4.5c.4 0 .75-.35.75-.75V4.5M6.75 6.5v4M9.25 6.5v4'
    case 'settings':
      return 'M6.9 2.25h2.2l.35 1.55c.38.14.73.35 1.04.61l1.51-.48 1.1 1.9-1.17 1.07c.04.2.07.4.07.6s-.03.4-.07.6l1.17 1.07-1.1 1.9-1.51-.48c-.31.26-.66.47-1.04.61l-.35 1.55H6.9l-.35-1.55a4.2 4.2 0 0 1-1.04-.61L4 11.07l-1.1-1.9L4.07 8.1A3.2 3.2 0 0 1 4 7.5c0-.2.03-.4.07-.6L2.9 5.83 4 3.93l1.51.48c.31-.26.66-.47 1.04-.61zM8 5.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z'
    case 'folder':
      return 'M2 4.5h4.25l1 1.5H14v6.5H2z'
    case 'file':
      return 'M4 2.5h5.25L12 5.25v8.25H4zM9.25 2.5v3h3'
    case 'star':
      return 'M8 2.5 9.2 6.8 13.5 8 9.2 9.2 8 13.5 6.8 9.2 2.5 8 6.8 6.8z'
    case 'save':
      return 'M3 2.5h8.5L13 4v9.5H3zM5 2.5v4h5v-4M5 13.5v-4h6v4'
    case 'keyboard':
      return 'M2.5 4.5h11v7h-11zM4.5 7h1M7 7h1M9.5 7h1M4.5 9.5h7'
    case 'plus':
      return 'M8 3.5v9M3.5 8h9'
    case 'minus':
      return 'M3.5 8h9'
    case 'drag':
      return 'M5.5 4.5h.01M10.5 4.5h.01M5.5 8h.01M10.5 8h.01M5.5 11.5h.01M10.5 11.5h.01'
    case 'send':
      return 'M2.5 8h10M12.5 8 8.5 4M12.5 8l-4 4'
  }
}

export function Icon({ name }: { name: IconName }) {
  if (name === 'star') {
    return (
      <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true" className="solid-icon">
        <path d="M8 2.6c.28 0 .52.18.61.45l1.07 3.26 3.27 1.08a.64.64 0 0 1 0 1.22L9.68 9.69l-1.07 3.26a.64.64 0 0 1-1.22 0L6.31 9.69 3.05 8.61a.64.64 0 0 1 0-1.22l3.26-1.08 1.08-3.26A.64.64 0 0 1 8 2.6z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path d={iconPath(name)} />
    </svg>
  )
}

export function IconButton({
  icon,
  label,
  active,
  danger,
  onClick
}: {
  icon: IconName
  label: string
  active?: boolean
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={`icon-button${active ? ' is-active' : ''}${danger ? ' danger' : ''}`}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Logo() {
  return (
    <span className="logo">
      <strong>AnyReader</strong>
    </span>
  )
}
