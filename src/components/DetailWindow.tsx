import { makeSummary } from '../../src_original_reference/lib/text'
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
  return (
    <WindowFrame
      className="detail-window"
      title="详情"
      collapsed={!open}
      actions={<IconButton icon={open ? 'chevronUp' : 'chevronDown'} label="收起" active={!open} onClick={onToggle} />}
    >
      <div className="detail-body">
        <div>
          <span>选中</span>
          <p>{renderInlineMath(selectedText, 'detail-selected')}</p>
        </div>
        <div>
          <span>上下文</span>
          <p>{renderInlineMath(makeSummary(context, 360), 'detail-context')}</p>
        </div>
      </div>
    </WindowFrame>
  )
}
