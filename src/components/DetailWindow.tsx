import { makeSummary } from '../../src_original_reference/lib/text'
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
          <p>{selectedText}</p>
        </div>
        <div>
          <span>上下文</span>
          <p>{makeSummary(context, 360)}</p>
        </div>
      </div>
    </WindowFrame>
  )
}
