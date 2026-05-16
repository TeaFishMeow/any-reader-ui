import { makeSummary } from '../../src_original_reference/lib/text'
import { useI18n } from '../i18n'
import { renderInlineMath } from '../lib/markdown'
import { IconButton } from './Icon'
import { WindowFrame } from './WindowFrame'

export function DetailWindow({
  open,
  selectedText,
  context,
  onToggle
}: {
  open: boolean
  selectedText: string
  context: string
  onToggle: () => void
}) {
  const { t } = useI18n()
  return (
    <WindowFrame
      className="detail-window"
      title={t('common.details')}
      collapsed={!open}
      actions={<IconButton icon={open ? 'chevronUp' : 'chevronDown'} label={t('common.collapse')} active={!open} onClick={onToggle} />}
    >
      <div className="detail-body">
        <div>
          <span>{t('common.selected')}</span>
          <p>{renderInlineMath(selectedText, 'detail-selected')}</p>
        </div>
        <div>
          <span>{t('common.context')}</span>
          <p>{renderInlineMath(makeSummary(context, 360), 'detail-context')}</p>
        </div>
      </div>
    </WindowFrame>
  )
}
