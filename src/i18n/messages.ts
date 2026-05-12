import type { PromptTemplate, QARecord, ReadingContextMode } from '../types/domain'
import { extraMessages } from './extra-messages'

export type UiLocale = 'zh-CN' | 'en-US'
export type UiLocalePreference = UiLocale | 'system'
export type TranslateParams = Record<string, string | number | null | undefined>
export type TranslateFn = (key: string, params?: TranslateParams) => string

export const DEFAULT_UI_LOCALE: UiLocale = 'zh-CN'
export const UI_LOCALE_STORAGE_KEY = 'anyreader.ui.locale'

const messages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'locale.label': '界面语言',
    'locale.option.zh-CN': '简体中文',
    'locale.option.en-US': 'English',
    'shared.nav.reader': '阅读器',
    'shared.nav.libraries': '书库',
    'shared.nav.admin': '管理台',
    'shared.unknown': '未知',
    'shared.unknownUser': '未知用户',
    'shared.unknownTime': '未知时间',
    'shared.notAvailableYet': '暂不可用。',
    'shared.customAsk': '自定义提问',
    'shared.contextMode.paragraph': '当前段落',
    'shared.contextMode.section': '当前小节',
    'shared.contextMode.directory': '当前目录',
    'shared.contextMode.viewport-range': '当前屏幕附近',
    'shared.contextMode.manual-selection': '手动选区',
    'shared.contextMode.widget-local': '当前 Widget',
    'shared.contextMode.sidebar-node': '左栏节点',
    'shared.requestState.idle': '待机',
    'shared.requestState.editing': '等待输入',
    'shared.requestState.pending': '已发送，等待首 token',
    'shared.requestState.streaming': '流式回答中',
    'shared.requestState.done': '已完成',
    'shared.requestState.error': '请求失败',
    'shared.answerStatus.pending': '待发送',
    'shared.answerStatus.streaming': '生成中',
    'shared.answerStatus.done': '已完成',
    'shared.answerStatus.error': '失败',
    'shared.answerStatus.aborted': '草稿',
    'shared.visibility.private': '私有',
    'shared.visibility.invite_only': '受邀可见',
    'shared.role.owner': '所有者',
    'shared.role.admin': '管理员',
    'shared.role.editor': '编辑',
    'shared.role.viewer': '只读',
    'shared.role.member': '成员',
    'shared.ticketSeverity.low': '低',
    'shared.ticketSeverity.medium': '中',
    'shared.ticketSeverity.high': '高',
    'shared.ticketStatus.open': '打开',
    'shared.ticketStatus.accepted': '已接受',
    'shared.ticketStatus.rejected': '已拒绝',
    'shared.ticketStatus.fixed': '已修复',
    'shared.ticketStatus.closed': '已关闭',
    'shared.importStatus.queued': '排队中',
    'shared.importStatus.running': '运行中',
    'shared.importStatus.succeeded': '成功',
    'shared.importStatus.failed': '失败',
    'shared.importStatus.canceled': '已取消',
    'shared.revisionState.published': '已发布',
    'shared.revisionState.draftOnly': '仅草稿',
    'shared.action.continue': '继续',
    'shared.action.backToSignIn': '返回登录',
    'shared.action.signOut': '退出登录',
    'shared.action.reload': '重新加载',
    'shared.action.addTemplate': '新增模板',
    'shared.action.submit': '提交',
    'shared.action.remove': '移除',
    'shared.action.publish': '发布',
    'shared.action.save': '保存',
    'shared.action.delete': '删除',
    'shared.action.close': '关闭',
    'shared.action.expand': '展开',
    'shared.action.collapse': '收起',
    'app.loading.title': '正在装载阅读工作台',
    'app.loading.body': '正在同步仓库来源、Markdown 文档、提示词模板、右栏画布与本地索引。',
    'app.error.kicker': '启动错误',
    'app.error.title': 'AnyReader 无法启动',
    'app.error.bodyMissingState': '缺少工作区状态文件。',
    'app.header.source.demo': '演示仓库',
    'app.header.source.remote': '云端书库',
    'app.header.source.mounted': 'Obsidian 直挂',
    'app.header.tagline': '把定位、复制、上下文拼接这些体力活交给系统。',
    'app.header.templates': '提示词',
    'app.header.context': '上下文',
    'app.header.settings': '设置',
    'app.context.nextAsk.title': '下一次提问上下文',
    'app.context.nextAsk.note': '这里可以一起调整阅读上下文和默认学习提示。其中上下文模式仍只影响接下来的一次提问，学习提示会保存为后续默认值。',
    'app.context.currentAsk.title': '当前提问上下文',
    'app.context.currentAsk.note': '这里只修改这一次待发送提问的上下文和学习提示，不会改全局默认值。',
    'app.context.currentWidgetAsk.note': '这里只修改这个 custom ask widget 的本次提问上下文和学习提示，不会改全局默认值。',
    'app.a11y.expandLeftSidebar': '展开左侧栏',
    'app.a11y.expandRightSidebar': '展开右侧栏',
    'app.a11y.resizeLeftSidebar': '调整左侧栏宽度',
    'app.a11y.resizeRightSidebar': '调整右侧栏宽度',
    'app.workspaceError.sessionInvalid': '当前会话已失效，请重新登录。',
    'app.workspaceError.noReadableLibraries': '当前账号还没有可读书库，请联系管理员授予访问权限。',
    'app.workspaceError.failedToLoad': '读取工作区失败。',
    'chrome.askMenu.customAsk': '自定义提问',
    'chrome.askMenu.previewLabel': '提示词预览',
    'chrome.askMenu.templateFallback': '模板',
    'chrome.askMenu.previewFallback': '选择一个模板以预览它的提示词。',
    'chrome.askMenu.selectedText': '选中文本',
    'chrome.askMenu.contextMode': '上下文模式',
    'chrome.groupChooser.title': '同一锚点上的回答',
    'chrome.templateSettings.title': '模板设置',
    'chrome.templateSettings.addTemplate': '新增模板',
    'chrome.templateSettings.newTemplateTitle': '新模板',
    'chrome.templateSettings.newTemplateBody': '解释选中文本与当前问题和上下文的关系。',
    'chrome.templateSettings.editBodyHint': '点击编辑提示词正文。',
    'chrome.templateSettings.enabled': '启用',
    'chrome.templateSettings.chooseColor': '为 {title} 选择颜色',
    'chrome.templateSettings.dragToReorder': '拖动以调整排序',
    'chrome.templateSettings.delete': '删除 {title}',
    'chrome.contextSettings.contextMode': '上下文模式',
    'chrome.contextSettings.viewportBlocks': '视野块数',
    'chrome.contextSettings.blocks': '{count} 个块',
    'chrome.contextSettings.learningPrompt': '学习提示',
    'chrome.contextSettings.learningPromptPlaceholder': '描述助手应该优先遵循的学习目标或解释风格。',
    'chrome.contextSettings.selectedText': '选中文本',
    'chrome.contextSettings.contextPreview': '上下文预览',
    'chrome.workspaceSettings.title': '工作区设置',
    'chrome.workspaceSettings.section.repository': '仓库',
    'chrome.workspaceSettings.section.llmAccess': 'LLM 访问',
    'chrome.workspaceSettings.section.account': '账号',
    'chrome.workspaceSettings.activeMode': '当前模式',
    'chrome.workspaceSettings.libraryBinding': '书库绑定',
    'chrome.workspaceSettings.sourceLabel': '来源标签',
    'chrome.workspaceSettings.mode.remote': '远端书库 API',
    'chrome.workspaceSettings.mode.mounted': '挂载的 Obsidian 仓库',
    'chrome.workspaceSettings.mode.demo': '演示仓库',
    'chrome.workspaceSettings.notBoundYet': '尚未绑定',
    'chrome.workspaceSettings.sourceLabelFallback': '远端工作区',
    'chrome.workspaceSettings.remoteWorkspaceNote': '当前 Web 部署通过后端 API 读取仓库数据。桌面端专属的本地仓库挂载在这里不可用。',
    'chrome.workspaceSettings.reloadWorkspace': '重新加载工作区',
    'chrome.workspaceSettings.llmAccessNote': '所有 Web 请求都通过 `/api/v1/llm/answer` 发送。浏览器端不会暴露 provider base URL 或 API key。',
    'chrome.workspaceSettings.status': '状态',
    'chrome.workspaceSettings.email': '邮箱',
    'chrome.workspaceSettings.statusSignedIn': '已登录',
    'chrome.modal.kicker': '设置',
    'chrome.modal.close': '关闭弹窗',
    'canvas.action.showDetails': '显示详情',
    'canvas.action.hideDetails': '隐藏详情',
    'canvas.action.deleteRecord': '删除记录',
    'canvas.action.closeWidget': '关闭 Widget',
    'canvas.action.expandWidget': '展开 Widget',
    'canvas.action.collapseWidget': '收起 Widget',
    'canvas.action.resizeWidget': '调整 Widget 大小',
    'canvas.label.details': '详情',
    'canvas.label.selectedText': '选中文本',
    'canvas.label.contextPreview': '上下文预览',
    'canvas.label.question': '问题',
    'canvas.label.answer': '回答',
    'canvas.label.questionPending': '（问题待生成）',
    'canvas.label.answerPending': '（回答待生成）',
    'canvas.label.templateAsk': '模板提问',
    'canvas.title.ask': '提问',
    'canvas.title.qaRecord': '问答记录',
    'canvas.title.askDetails': '提问详情',
    'canvas.title.answerPreview': '回答预览',
    'canvas.title.detailsSuffix': '详情',
    'canvas.button.adjustAskContext': '调整本次提问上下文',
    'canvas.button.submit': '提交',
    'canvas.placeholder.prompt': '在这里输入你的问题。',
    'canvas.empty.recordMissing': '这条记录不存在或已被删除。',
    'auth.brand': '十二问 AnyReader',
    'auth.destination.reader': '阅读工作区',
    'auth.destination.libraries': '书库门户',
    'auth.destination.admin': '管理工作区',
    'auth.session.configRequired': '需要配置',
    'auth.session.restoring': '恢复会话中',
    'auth.session.ready': '会话就绪',
    'auth.session.awaitingSignIn': '等待登录',
    'auth.error.missingSupabaseEnv': '缺少 `VITE_SUPABASE_URL` 或 `VITE_SUPABASE_ANON_KEY`。',
    'auth.error.notConfigured': '前端环境尚未配置 Supabase Auth。',
    'auth.error.restoreFailed': '恢复 Supabase 会话失败。',
    'auth.error.initializeFailed': '初始化 Supabase 会话失败。',
    'auth.login.formError.missingEmail': '请输入用于接收 magic link 的邮箱地址。',
    'auth.login.formError.sendFailed': '发送登录链接失败。',
    'auth.login.formError.signOutFailed': '退出登录失败。',
    'auth.login.eyebrow': '认证',
    'auth.login.title.required': '请先登录。',
    'auth.login.title.default': '使用 Supabase magic link 登录。',
    'auth.login.lead.required': '这个路由受到保护。请先登录，浏览器随后会把你带回 {destination}。',
    'auth.login.lead.default': '使用邮箱恢复阅读器、书库门户和管理台的安全会话。',
    'auth.login.returnAfterSignIn': '登录后返回',
    'auth.login.sessionState': '会话状态',
    'auth.login.sessionBody.signedIn': '当前设备上的会话已经激活。',
    'auth.login.sessionBody.loading': '浏览器正在检查已保存的凭据和回调 token。',
    'auth.login.sessionBody.misconfigured': '这个部署缺少前端认证环境变量。',
    'auth.login.sessionBody.signedOut': '一次性邮件链接会完成整个登录流程。',
    'auth.login.misconfigured.title': '前端认证尚未配置。',
    'auth.login.misconfigured.caption': '在使用托管登录流程之前，请先在前端环境中设置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。',
    'auth.login.loading.title': '正在恢复会话',
    'auth.login.loading.caption': '浏览器会先检查本地会话存储和回调 token，再渲染受保护路由。',
    'auth.login.loading.emptyTitle': '正在检查已保存凭据',
    'auth.login.loading.emptyBody': '通常会很快完成。',
    'auth.login.signedIn.title': '你已经登录。',
    'auth.login.signedIn.caption': '可以直接进入目标页面，或退出当前会话后切换账号。',
    'auth.login.signedIn.activeAccount': '当前账号',
    'auth.login.signedIn.ready': '{destination} 已就绪。',
    'auth.login.emailMagicLink.title': '邮箱 magic link',
    'auth.login.emailMagicLink.caption': '输入接收登录链接的邮箱。回调完成后，浏览器会返回到 `{path}`。',
    'auth.login.email': '邮箱',
    'auth.login.emailPlaceholder': 'reader@example.com',
    'auth.login.sendMagicLink': '发送 Magic Link',
    'auth.login.sending': '发送中...',
    'auth.login.sent': '登录链接已发送到 {email}。请在当前设备上打开邮件，完成回调流程。',
    'auth.login.flow.title': 'Magic Link 流程',
    'auth.login.flow.caption': '让登录页只做一件事，把会话接力交给回调页。',
    'auth.login.flow.step1': '提交你的邮箱地址。',
    'auth.login.flow.step2': '在当前设备上打开一次性登录邮件。',
    'auth.login.flow.step3': '自动返回请求的工作区。',
    'auth.callback.eyebrow': '认证回调',
    'auth.callback.title.signedIn': '登录完成，正在跳转。',
    'auth.callback.title.other': '正在完成登录会话。',
    'auth.callback.lead.loading': '应用正在从登录链接中恢复 Supabase 会话。',
    'auth.callback.lead.signedIn': '会话已激活，浏览器正在带你返回目标页面。',
    'auth.callback.lead.other': '这次回调没有产生有效会话，需要重新发起登录流程。',
    'auth.callback.returnTarget': '返回目标',
    'auth.callback.returnTargetBody': '认证成功后，浏览器会重新打开这个路由。',
    'auth.callback.state': '回调状态',
    'auth.callback.state.ready': '会话就绪',
    'auth.callback.state.processing': '处理中',
    'auth.callback.state.retry': '需要重试',
    'auth.callback.noErrors': '当前没有上报回调错误。',
    'auth.callback.sessionRestored.title': '会话已恢复',
    'auth.callback.sessionRestored.caption': '浏览器已经可以继续进入目标页面。',
    'auth.callback.retry.title': '需要重新尝试登录',
    'auth.callback.retry.caption': '回到登录页，为这个路由请求一条新的 magic link。',
    'auth.callback.whatNext.title': '接下来会发生什么',
    'auth.callback.whatNext.caption': '回调处理与主登录卡片分离，方便在失败时快速恢复。',
    'auth.callback.whatNext.step1': 'Supabase 将会话 token 返回给浏览器。',
    'auth.callback.whatNext.step2': '应用恢复会话并校验目标路由。',
    'auth.callback.whatNext.step3': '浏览器跳转到请求的工作区。'
  },
  'en-US': {
    'locale.label': 'UI language',
    'locale.option.zh-CN': 'Simplified Chinese',
    'locale.option.en-US': 'English',
    'shared.nav.reader': 'Reader',
    'shared.nav.libraries': 'Libraries',
    'shared.nav.admin': 'Admin',
    'shared.unknown': 'Unknown',
    'shared.unknownUser': 'Unknown user',
    'shared.unknownTime': 'Unknown time',
    'shared.notAvailableYet': 'Not available yet.',
    'shared.customAsk': 'Custom Ask',
    'shared.contextMode.paragraph': 'Current paragraph',
    'shared.contextMode.section': 'Current section',
    'shared.contextMode.directory': 'Current directory',
    'shared.contextMode.viewport-range': 'Near current viewport',
    'shared.contextMode.manual-selection': 'Manual selection',
    'shared.contextMode.widget-local': 'Current widget',
    'shared.contextMode.sidebar-node': 'Sidebar node',
    'shared.requestState.idle': 'Idle',
    'shared.requestState.editing': 'Awaiting input',
    'shared.requestState.pending': 'Sent, waiting for first token',
    'shared.requestState.streaming': 'Streaming answer',
    'shared.requestState.done': 'Completed',
    'shared.requestState.error': 'Request failed',
    'shared.answerStatus.pending': 'Pending',
    'shared.answerStatus.streaming': 'Streaming',
    'shared.answerStatus.done': 'Done',
    'shared.answerStatus.error': 'Failed',
    'shared.answerStatus.aborted': 'Draft',
    'shared.visibility.private': 'Private',
    'shared.visibility.invite_only': 'Invite Only',
    'shared.role.owner': 'Owner',
    'shared.role.admin': 'Admin',
    'shared.role.editor': 'Editor',
    'shared.role.viewer': 'Viewer',
    'shared.role.member': 'Member',
    'shared.ticketSeverity.low': 'Low',
    'shared.ticketSeverity.medium': 'Medium',
    'shared.ticketSeverity.high': 'High',
    'shared.ticketStatus.open': 'Open',
    'shared.ticketStatus.accepted': 'Accepted',
    'shared.ticketStatus.rejected': 'Rejected',
    'shared.ticketStatus.fixed': 'Fixed',
    'shared.ticketStatus.closed': 'Closed',
    'shared.importStatus.queued': 'Queued',
    'shared.importStatus.running': 'Running',
    'shared.importStatus.succeeded': 'Succeeded',
    'shared.importStatus.failed': 'Failed',
    'shared.importStatus.canceled': 'Canceled',
    'shared.revisionState.published': 'Published',
    'shared.revisionState.draftOnly': 'Draft only',
    'shared.action.continue': 'Continue',
    'shared.action.backToSignIn': 'Back to Sign In',
    'shared.action.signOut': 'Sign Out',
    'shared.action.reload': 'Reload',
    'shared.action.addTemplate': 'Add Template',
    'shared.action.submit': 'Submit',
    'shared.action.remove': 'Remove',
    'shared.action.publish': 'Publish',
    'shared.action.save': 'Save',
    'shared.action.delete': 'Delete',
    'shared.action.close': 'Close',
    'shared.action.expand': 'Expand',
    'shared.action.collapse': 'Collapse',
    'app.loading.title': 'Loading the reading workspace',
    'app.loading.body': 'Syncing repository sources, Markdown documents, prompt templates, the right-side canvas, and the local index.',
    'app.error.kicker': 'Startup Error',
    'app.error.title': 'AnyReader could not start',
    'app.error.bodyMissingState': 'The workspace state file is missing.',
    'app.header.source.demo': 'Demo repository',
    'app.header.source.remote': 'Cloud library',
    'app.header.source.mounted': 'Mounted Obsidian vault',
    'app.header.tagline': 'Let the system handle the locating, copying, and context stitching work.',
    'app.header.templates': 'Prompts',
    'app.header.context': 'Context',
    'app.header.settings': 'Settings',
    'app.context.nextAsk.title': 'Next Ask Context',
    'app.context.nextAsk.note': 'Adjust the reading context and default learning prompt together here. The context mode still affects only the next ask, while the learning prompt is saved as the default for future asks.',
    'app.context.currentAsk.title': 'Current Ask Context',
    'app.context.currentAsk.note': 'This changes the context and learning prompt only for the ask that is about to be sent. It does not update the global defaults.',
    'app.context.currentWidgetAsk.note': 'This changes the context and learning prompt only for this custom ask widget. It does not update the global defaults.',
    'app.a11y.expandLeftSidebar': 'Expand left sidebar',
    'app.a11y.expandRightSidebar': 'Expand right sidebar',
    'app.a11y.resizeLeftSidebar': 'Resize left sidebar',
    'app.a11y.resizeRightSidebar': 'Resize right sidebar',
    'app.workspaceError.sessionInvalid': 'Your session is no longer valid. Sign in again to continue.',
    'app.workspaceError.noReadableLibraries': 'No readable libraries are available for this account yet. Ask an administrator to grant access.',
    'app.workspaceError.failedToLoad': 'Failed to load the workspace.',
    'chrome.askMenu.customAsk': 'Custom Ask',
    'chrome.askMenu.previewLabel': 'Prompt Preview',
    'chrome.askMenu.templateFallback': 'Template',
    'chrome.askMenu.previewFallback': 'Choose a template to preview its prompt.',
    'chrome.askMenu.selectedText': 'Selected Text',
    'chrome.askMenu.contextMode': 'Context Mode',
    'chrome.groupChooser.title': 'Answers On This Anchor',
    'chrome.templateSettings.title': 'Template Settings',
    'chrome.templateSettings.addTemplate': 'Add Template',
    'chrome.templateSettings.newTemplateTitle': 'New Template',
    'chrome.templateSettings.newTemplateBody': 'Explain how the selected text relates to the current question and context.',
    'chrome.templateSettings.editBodyHint': 'Click to edit the prompt body.',
    'chrome.templateSettings.enabled': 'Enabled',
    'chrome.templateSettings.chooseColor': 'Choose color for {title}',
    'chrome.templateSettings.dragToReorder': 'Drag to reorder',
    'chrome.templateSettings.delete': 'Delete {title}',
    'chrome.contextSettings.contextMode': 'Context Mode',
    'chrome.contextSettings.viewportBlocks': 'Viewport Blocks',
    'chrome.contextSettings.blocks': '{count} blocks',
    'chrome.contextSettings.learningPrompt': 'Learning Prompt',
    'chrome.contextSettings.learningPromptPlaceholder': 'Describe the learning goal or explanation style the assistant should prioritize.',
    'chrome.contextSettings.selectedText': 'Selected Text',
    'chrome.contextSettings.contextPreview': 'Context Preview',
    'chrome.workspaceSettings.title': 'Workspace Settings',
    'chrome.workspaceSettings.section.repository': 'Repository',
    'chrome.workspaceSettings.section.llmAccess': 'LLM Access',
    'chrome.workspaceSettings.section.account': 'Account',
    'chrome.workspaceSettings.activeMode': 'Active Mode',
    'chrome.workspaceSettings.libraryBinding': 'Library Binding',
    'chrome.workspaceSettings.sourceLabel': 'Source Label',
    'chrome.workspaceSettings.mode.remote': 'Remote Library API',
    'chrome.workspaceSettings.mode.mounted': 'Mounted Obsidian Vault',
    'chrome.workspaceSettings.mode.demo': 'Demo Repository',
    'chrome.workspaceSettings.notBoundYet': 'Not bound yet',
    'chrome.workspaceSettings.sourceLabelFallback': 'Remote workspace',
    'chrome.workspaceSettings.remoteWorkspaceNote': 'This web deployment reads repository data from backend APIs. Desktop-only vault mounting is intentionally unavailable here.',
    'chrome.workspaceSettings.reloadWorkspace': 'Reload Workspace',
    'chrome.workspaceSettings.llmAccessNote': 'All web requests go through `/api/v1/llm/answer`. The browser never exposes provider base URLs or API keys.',
    'chrome.workspaceSettings.status': 'Status',
    'chrome.workspaceSettings.email': 'Email',
    'chrome.workspaceSettings.statusSignedIn': 'Signed In',
    'chrome.modal.kicker': 'Settings',
    'chrome.modal.close': 'Close modal',
    'canvas.action.showDetails': 'Show details',
    'canvas.action.hideDetails': 'Hide details',
    'canvas.action.deleteRecord': 'Delete record',
    'canvas.action.closeWidget': 'Close widget',
    'canvas.action.expandWidget': 'Expand widget',
    'canvas.action.collapseWidget': 'Collapse widget',
    'canvas.action.resizeWidget': 'Resize widget',
    'canvas.label.details': 'Details',
    'canvas.label.selectedText': 'Selected text',
    'canvas.label.contextPreview': 'Context preview',
    'canvas.label.question': 'Question',
    'canvas.label.answer': 'Answer',
    'canvas.label.questionPending': '(question pending)',
    'canvas.label.answerPending': '(answer pending)',
    'canvas.label.templateAsk': 'Template ask',
    'canvas.title.ask': 'Ask',
    'canvas.title.qaRecord': 'QA record',
    'canvas.title.askDetails': 'Ask details',
    'canvas.title.answerPreview': 'Answer preview',
    'canvas.title.detailsSuffix': 'details',
    'canvas.button.adjustAskContext': 'Adjust this ask context',
    'canvas.button.submit': 'Submit',
    'canvas.placeholder.prompt': 'Type your prompt here.',
    'canvas.empty.recordMissing': 'The record is missing or has been deleted.',
    'auth.brand': '十二问 AnyReader',
    'auth.destination.reader': 'Reader workspace',
    'auth.destination.libraries': 'Library portal',
    'auth.destination.admin': 'Admin workspace',
    'auth.session.configRequired': 'Configuration required',
    'auth.session.restoring': 'Restoring session',
    'auth.session.ready': 'Session ready',
    'auth.session.awaitingSignIn': 'Awaiting sign-in',
    'auth.error.missingSupabaseEnv': 'Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`.',
    'auth.error.notConfigured': 'Supabase Auth is not configured in the frontend environment.',
    'auth.error.restoreFailed': 'Failed to restore the Supabase session.',
    'auth.error.initializeFailed': 'Failed to initialize the Supabase session.',
    'auth.login.formError.missingEmail': 'Enter the email address that should receive the magic link.',
    'auth.login.formError.sendFailed': 'Failed to send the sign-in link.',
    'auth.login.formError.signOutFailed': 'Failed to sign out.',
    'auth.login.eyebrow': 'Authentication',
    'auth.login.title.required': 'Sign in to continue.',
    'auth.login.title.default': 'Sign in with a Supabase magic link.',
    'auth.login.lead.required': 'This route is protected. Sign in first and the browser will return you to the {destination}.',
    'auth.login.lead.default': 'Use your email to restore a secure session for the reader, the library portal, and the admin console.',
    'auth.login.returnAfterSignIn': 'Return after sign-in',
    'auth.login.sessionState': 'Session state',
    'auth.login.sessionBody.signedIn': 'Your session is already active on this device.',
    'auth.login.sessionBody.loading': 'The browser is checking stored credentials and callback tokens.',
    'auth.login.sessionBody.misconfigured': 'Frontend auth variables are missing from this deployment.',
    'auth.login.sessionBody.signedOut': 'A one-time email link will finish the login flow.',
    'auth.login.misconfigured.title': 'Frontend auth is not configured.',
    'auth.login.misconfigured.caption': 'Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment before using the hosted login flow.',
    'auth.login.loading.title': 'Restoring session',
    'auth.login.loading.caption': 'The browser is checking local session storage and any auth callback tokens before rendering protected routes.',
    'auth.login.loading.emptyTitle': 'Checking saved credentials',
    'auth.login.loading.emptyBody': 'This usually completes in a moment.',
    'auth.login.signedIn.title': 'You are already signed in.',
    'auth.login.signedIn.caption': 'Continue directly into the requested surface or end this session and switch accounts.',
    'auth.login.signedIn.activeAccount': 'Active account',
    'auth.login.signedIn.ready': '{destination} is ready.',
    'auth.login.emailMagicLink.title': 'Email magic link',
    'auth.login.emailMagicLink.caption': 'Enter the address that should receive the sign-in link. After the callback, the browser will return to `{path}`.',
    'auth.login.email': 'Email',
    'auth.login.emailPlaceholder': 'reader@example.com',
    'auth.login.sendMagicLink': 'Send Magic Link',
    'auth.login.sending': 'Sending...',
    'auth.login.sent': 'The sign-in link was sent to {email}. Open the email on this device to finish the callback flow.',
    'auth.login.flow.title': 'Magic link flow',
    'auth.login.flow.caption': 'Keep the login surface focused on a single task and let the callback complete the session hand-off.',
    'auth.login.flow.step1': 'Submit your email address.',
    'auth.login.flow.step2': 'Open the one-time sign-in email on this device.',
    'auth.login.flow.step3': 'Return to the requested workspace automatically.',
    'auth.callback.eyebrow': 'Auth Callback',
    'auth.callback.title.signedIn': 'Sign-in complete. Redirecting now.',
    'auth.callback.title.other': 'Completing your sign-in session.',
    'auth.callback.lead.loading': 'The application is restoring the Supabase session from the sign-in link.',
    'auth.callback.lead.signedIn': 'Your session is active. The browser is returning you to the requested page.',
    'auth.callback.lead.other': 'The callback did not produce an active session, so the sign-in flow needs to restart.',
    'auth.callback.returnTarget': 'Return target',
    'auth.callback.returnTargetBody': 'This is the route the browser will reopen after auth succeeds.',
    'auth.callback.state': 'Callback state',
    'auth.callback.state.ready': 'Session ready',
    'auth.callback.state.processing': 'Processing',
    'auth.callback.state.retry': 'Needs retry',
    'auth.callback.noErrors': 'No callback errors have been reported.',
    'auth.callback.sessionRestored.title': 'Session restored',
    'auth.callback.sessionRestored.caption': 'The browser is ready to continue into the requested page.',
    'auth.callback.retry.title': 'Sign-in needs another attempt',
    'auth.callback.retry.caption': 'Return to the login page to request a fresh magic link for this route.',
    'auth.callback.whatNext.title': 'What happens next',
    'auth.callback.whatNext.caption': 'Callback handling stays separate from the main login card so failures are easy to recover from.',
    'auth.callback.whatNext.step1': 'Supabase returns a session token to the browser.',
    'auth.callback.whatNext.step2': 'The app restores the session and validates the route target.',
    'auth.callback.whatNext.step3': 'The browser redirects to the requested workspace.'
  }
}

export function isUiLocale(value: string): value is UiLocale {
  return value === 'zh-CN' || value === 'en-US'
}

export function isUiLocalePreference(value: string): value is UiLocalePreference {
  return value === 'system' || isUiLocale(value)
}

export function normalizeUiLocale(value?: string | null): UiLocale {
  if (!value) {
    return DEFAULT_UI_LOCALE
  }

  if (isUiLocale(value)) {
    return value
  }

  const normalized = value.toLowerCase()
  if (normalized.startsWith('zh')) {
    return 'zh-CN'
  }
  if (normalized.startsWith('en')) {
    return 'en-US'
  }

  return DEFAULT_UI_LOCALE
}

export function translateMessage(locale: UiLocale, key: string, params?: TranslateParams) {
  const template =
    extraMessages[locale]?.[key] ??
    messages[locale][key] ??
    extraMessages[DEFAULT_UI_LOCALE]?.[key] ??
    messages[DEFAULT_UI_LOCALE][key] ??
    key
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function contextModeLabelKey(mode: ReadingContextMode) {
  switch (mode) {
    case 'paragraph':
      return 'shared.contextMode.paragraph'
    case 'section':
      return 'shared.contextMode.section'
    case 'directory':
      return 'shared.contextMode.directory'
    case 'viewport-range':
      return 'shared.contextMode.viewport-range'
    case 'manual-selection':
      return 'shared.contextMode.manual-selection'
    case 'widget-local':
      return 'shared.contextMode.widget-local'
    case 'sidebar-node':
      return 'shared.contextMode.sidebar-node'
  }
}

export function requestStateLabelKey(state: 'idle' | 'editing' | 'pending' | 'streaming' | 'done' | 'error') {
  return `shared.requestState.${state}`
}

export function answerStatusLabelKey(status: QARecord['answerStatus']) {
  return `shared.answerStatus.${status}`
}

export function visibilityLabelKey(visibility: 'private' | 'invite_only' | 'public') {
  return `shared.visibility.${visibility}`
}

export function roleLabelKey(role: 'owner' | 'admin' | 'editor' | 'viewer' | 'member') {
  return `shared.role.${role}`
}

export function ticketSeverityLabelKey(severity: 'low' | 'medium' | 'high') {
  return `shared.ticketSeverity.${severity}`
}

export function ticketStatusLabelKey(status: 'open' | 'accepted' | 'rejected' | 'fixed' | 'closed') {
  return `shared.ticketStatus.${status}`
}

export function importStatusLabelKey(status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled') {
  return `shared.importStatus.${status}`
}

export function revisionStateLabelKey(state: 'published' | 'draftOnly') {
  return `shared.revisionState.${state}`
}

export function revisionWorkflowStatusLabelKey(
  status: 'draft' | 'importing' | 'ready' | 'published' | 'failed' | 'archived'
) {
  return `admin.revisionStatus.${status}`
}

export function resolveQaRecordDisplayTitle(args: {
  record: QARecord | null
  templates: PromptTemplate[]
  t: TranslateFn
  fallbackKey: string
}) {
  const { record, templates, t, fallbackKey } = args
  if (!record) {
    return t(fallbackKey)
  }

  if (record.promptIntent === 'custom' || record.customPromptBody) {
    return t('shared.customAsk')
  }

  const templateTitle = templates.find((template) => template.id === record.promptTemplateId)?.title
  return templateTitle ?? record.questionText ?? t(fallbackKey)
}

export function localizeKnownUiErrorMessage(message: string | null | undefined, t: TranslateFn) {
  if (!message) {
    return message ?? null
  }

  switch (message) {
    case 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY':
      return t('auth.error.missingSupabaseEnv')
    case 'Supabase Auth is not configured in the frontend environment':
      return t('auth.error.notConfigured')
    case 'Failed to restore the Supabase session':
      return t('auth.error.restoreFailed')
    case 'Failed to initialize the Supabase session':
      return t('auth.error.initializeFailed')
    case 'Self-service signup is not allowed for this email address. Ask an administrator to pre-approve the account.':
      return t('auth.error.signupPreapprovalRequired')
    default:
      break
  }

  return message
}
