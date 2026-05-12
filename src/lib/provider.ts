import type { AppConfig, ModelInfo, QARecord } from '../types/domain'
import { getApiUrl, useBackendLlmProxy } from './env'
import { makeSummary, sleep } from './text'

export interface ProviderRequest {
  config: AppConfig
  qaRecord: QARecord
  signal?: AbortSignal
  onModelInfo?: (modelInfo: ModelInfo) => void
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError')
  }
}

function waitWithAbort(ms: number, signal?: AbortSignal) {
  if (!signal) {
    return sleep(ms)
  }

  return new Promise<void>((resolve, reject) => {
    const handle = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      window.clearTimeout(handle)
      reject(new DOMException('The operation was aborted', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    throwIfAborted(signal)
  })
}

export async function* streamAnswer({ config, qaRecord, signal, onModelInfo }: ProviderRequest) {
  const settings = config.provider
  const shouldUseBackendProxy = useBackendLlmProxy()
  throwIfAborted(signal)

  if (shouldUseBackendProxy) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    const { getSupabaseAccessToken } = await import('./auth')
    const accessToken = await getSupabaseAccessToken()
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch(getApiUrl('/api/v1/llm/answer'), {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        qaRecord,
        provider: {
          model: settings.model,
          temperature: settings.temperature
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (errorText) {
        try {
          const payload = JSON.parse(errorText) as { error?: string }
          throw new Error(payload.error?.trim() || `Backend proxy returned ${response.status}`)
        } catch {
          throw new Error(errorText.trim() || `Backend proxy returned ${response.status}`)
        }
      }

      throw new Error(`Backend proxy returned ${response.status}`)
    }

    const data = (await response.json()) as {
      content?: string
      modelDisplayName?: string
      modelId?: string
      model?: string
      cost?: number
      creditBalance?: number
      permanentBalance?: number
      dailyQuota?: number
      dailyUsed?: number
      dailyRemaining?: number
      quotaDate?: string | null
      subscription?: ModelInfo['subscription']
    }

    const content = normalizeProviderAnswerMarkdown(data.content)
    if (!content) {
      throw new Error('Backend proxy returned an empty answer')
    }

    onModelInfo?.(
      buildModelInfo(config, {
        displayName: data.modelDisplayName?.trim() || data.model?.trim() || settings.model || 'server-managed',
        model: data.model?.trim() || settings.model || 'server-managed',
        modelId: data.modelId?.trim() || settings.model || undefined,
        cost: typeof data.cost === 'number' && Number.isFinite(data.cost) ? data.cost : undefined,
        remainingCredits:
          typeof data.creditBalance === 'number' && Number.isFinite(data.creditBalance) ? data.creditBalance : undefined,
        permanentBalance:
          typeof data.permanentBalance === 'number' && Number.isFinite(data.permanentBalance) ? data.permanentBalance : undefined,
        dailyQuota: typeof data.dailyQuota === 'number' && Number.isFinite(data.dailyQuota) ? data.dailyQuota : undefined,
        dailyUsed: typeof data.dailyUsed === 'number' && Number.isFinite(data.dailyUsed) ? data.dailyUsed : undefined,
        dailyRemaining:
          typeof data.dailyRemaining === 'number' && Number.isFinite(data.dailyRemaining) ? data.dailyRemaining : undefined,
        quotaDate: data.quotaDate ?? undefined,
        subscription: data.subscription
      })
    )

    for (const chunk of chunkText(content, 48)) {
      await waitWithAbort(18, signal)
      throwIfAborted(signal)
      yield chunk
    }
    return
  }

  onModelInfo?.(buildModelInfo(config))
  const demoAnswer = buildDemoAnswer(qaRecord)
  for (const chunk of chunkText(demoAnswer, 36)) {
    await waitWithAbort(24, signal)
    throwIfAborted(signal)
    yield chunk
  }
}

export function buildModelInfo(
  config: AppConfig,
  overrides?: Partial<ModelInfo> & {
    model?: string
  }
) {
  const shouldUseBackendProxy = useBackendLlmProxy()
  const providerName = shouldUseBackendProxy ? 'Backend Proxy' : 'Demo Answer'

  return {
    provider: providerName,
    displayName: overrides?.displayName,
    model: overrides?.model ?? (shouldUseBackendProxy ? config.provider.model || 'server-managed' : config.provider.model || 'anyreader-demo'),
    temperature: overrides?.temperature ?? config.provider.temperature,
    modelId: overrides?.modelId ?? (shouldUseBackendProxy ? config.provider.model || undefined : undefined),
    cost: overrides?.cost,
    remainingCredits: overrides?.remainingCredits,
    permanentBalance: overrides?.permanentBalance,
    dailyQuota: overrides?.dailyQuota,
    dailyUsed: overrides?.dailyUsed,
    dailyRemaining: overrides?.dailyRemaining,
    quotaDate: overrides?.quotaDate,
    subscription: overrides?.subscription
  }
}

export function summarizeAnswer(answerMarkdown: string) {
  return makeSummary(answerMarkdown)
}

function chunkText(input: string, step: number) {
  const chunks: string[] = []
  for (let index = 0; index < input.length; index += step) {
    chunks.push(input.slice(index, index + step))
  }
  return chunks
}

function normalizeProviderAnswerMarkdown(input: string | undefined) {
  const trimmed = input?.trim() ?? ''
  if (!trimmed) {
    return ''
  }

  const withoutThinkBlocks = trimmed
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:thinking|reasoning)[^\n]*\n[\s\S]*?```/gi, '')
    .trim()

  return withoutThinkBlocks || trimmed
}

function buildDemoAnswer(qaRecord: QARecord) {
  const templateHint = qaRecord.customPromptTitle ?? labelForPromptIntent(qaRecord.promptIntent)
  const selected = qaRecord.selectedText.trim()
  const context = qaRecord.readingContextSnapshot.trim()

  return `## ${templateHint}

### 这段文本在说什么
选中的内容是：
> ${selected || '（未捕获到选中文本）'}

### 结合上下文的解释

当前上下文模式是 **${labelForContextMode(qaRecord.readingContextMode)}**。这意味着这里更适合做局部解释，而不是泛泛总结。阅读时可以按这个顺序理解：
1. 先确认当前对象是什么。
2. 再确认它在这一段里被做了什么操作。
3. 最后判断这一步在整条论证链里的作用。

### 建议的理解方式

- 如果你在问“变量是什么意思”，先区分它是自变量、参数还是中间量。
- 如果你在问“这一步为什么成立”，优先回看用了哪个定义或哪个前置结论。
- 如果你在问“定理如何映射到当前文本”，把定理中的抽象符号逐个替换成当前段落里的对象。

### 当前上下文摘录
${context ? `> ${context.slice(0, 260).replace(/\n+/g, '\n> ')}${context.length > 260 ? '…' : ''}` : '未找到上下文摘录。'}
`
}

function labelForPromptIntent(intent: QARecord['promptIntent']) {
  switch (intent) {
    case 'symbol_meaning':
      return '变量含义'
    case 'step_justification':
      return '步骤依据'
    case 'theorem_mapping':
      return '定理映射'
    case 'intuition':
      return '直觉解释'
    case 'summary':
      return '怎么使用'
    case 'compare':
      return '比较'
    case 'custom':
    default:
      return '问题'
  }
}

function labelForContextMode(mode: QARecord['readingContextMode']) {
  switch (mode) {
    case 'paragraph':
      return '当前段落'
    case 'section':
      return '当前小节'
    case 'directory':
      return '当前目录'
    case 'viewport-range':
      return '当前屏幕附近'
    case 'manual-selection':
      return '手动选区'
    case 'widget-local':
      return '右栏 Widget'
    case 'sidebar-node':
      return '左栏节点'
  }
}
