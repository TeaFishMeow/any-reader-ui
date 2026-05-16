import { applyPromptTemplateDefaults as applyReferencePromptTemplateDefaults } from './defaults'
import type { PromptTemplate } from '../domain'

export const CUSTOM_ASK_TEMPLATE_ID = 'template-custom-ask'

const customAskTemplate: PromptTemplate = {
  id: CUSTOM_ASK_TEMPLATE_ID,
  title: '自定义提问',
  body: '在问答窗口输入自己的问题。',
  color: '#8a5a1f',
  order: 0,
  isBuiltIn: true,
  isEnabled: true,
  scope: 'global'
}

export function applyPromptTemplateDefaults(templates?: PromptTemplate[] | null) {
  const next = applyReferencePromptTemplateDefaults(templates)
  const existing = next.find((template) => template.id === CUSTOM_ASK_TEMPLATE_ID)
  if (existing) {
    return next.map((template) => template.id === CUSTOM_ASK_TEMPLATE_ID
      ? { ...customAskTemplate, order: template.order, isEnabled: template.isEnabled }
      : template)
  }
  return [{ ...customAskTemplate, order: Math.min(0, ...next.map((template) => template.order)) - 1 }, ...next]
}

export function isCustomAskTemplate(template: Pick<PromptTemplate, 'id'>) {
  return template.id === CUSTOM_ASK_TEMPLATE_ID
}
