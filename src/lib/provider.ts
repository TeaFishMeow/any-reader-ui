import type { AppConfig, ModelInfo, QARecord } from '../domain'
import { DEMO_MODEL_ID, DEMO_PROVIDER_NAME, buildDemoAnswer } from '../services/mock/demoAnswer'
import { getApiUrl, useBackendLlmProxy } from './env'
import { sleep } from './text'

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
  const providerName = shouldUseBackendProxy ? 'Backend Proxy' : DEMO_PROVIDER_NAME

  return {
    provider: providerName,
    displayName: overrides?.displayName,
    model: overrides?.model ?? (shouldUseBackendProxy ? config.provider.model || 'server-managed' : config.provider.model || DEMO_MODEL_ID),
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
