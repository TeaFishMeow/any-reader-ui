import { applyPromptTemplateDefaults as applyReferencePromptTemplateDefaults } from './defaults'
import type { PromptTemplate } from '../domain'

export const CUSTOM_ASK_TEMPLATE_ID = 'template-custom-ask'
export const NOTE_TEMPLATE_ID = 'template-note'

const noteTemplate: PromptTemplate = {
  id: NOTE_TEMPLATE_ID,
  title: '笔记',
  body: '记录笔记。',
  color: '#eab308',
  order: 0,
  isBuiltIn: true,
  isEnabled: true,
  scope: 'global'
}

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
  let next = applyReferencePromptTemplateDefaults(templates)
  for (const fixed of [customAskTemplate, noteTemplate]) {
    const existing = next.find((template) => template.id === fixed.id)
    next = existing
      ? next.map((template) => template.id === fixed.id ? { ...fixed, order: template.order, isEnabled: template.isEnabled } : template)
      : [{ ...fixed, order: Math.min(0, ...next.map((template) => template.order)) - 1 }, ...next]
  }
  return next
}

export function isCustomAskTemplate(template: Pick<PromptTemplate, 'id'>) {
  return template.id === CUSTOM_ASK_TEMPLATE_ID
}

export function isNoteTemplate(template: Pick<PromptTemplate, 'id'>) {
  return template.id === NOTE_TEMPLATE_ID
}
