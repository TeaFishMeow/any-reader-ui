import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Extension, mergeAttributes, Node } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { Editor, ReactNodeViewProps } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { MathfieldElement, validateLatex, type Selection as MathfieldSelection } from 'mathlive'
import { normalizeLatexForMathLive } from './math-latex-compat'
import { buildMathSelectionPath, getMathDisplayText, getMathPromptText, parseMathSelectionPath } from './math-selection'
import { resolveRichTextImageSrc } from './rich-text-markdown'
import type { MathSelectionMode } from '../types/domain'

export interface AnnotationLayout {
  key: string
  recordIds: string[]
  color: string
  markerType: 'underline' | 'bracket'
  from?: number
  to?: number
  mathNodeId?: string
  mathMode?: MathSelectionMode
  mathSelectionLatex?: string
  mathSelectionPath?: string
  mathSelectionFrom?: number
  mathSelectionTo?: number
}

export interface AnnotationHoverState {
  key: string
  point: { x: number; y: number }
}

export interface MathSelectionSnapshot {
  text: string
  anchorFrom: number
  anchorTo: number
  mathNodeId: string
  mathMode: MathSelectionMode
  mathSelectionLatex: string
  mathAnchorLatex: string
  mathDisplayText: string
  mathPromptText: string
  mathSelectionPath: string
  mathSelectionFrom: number
  mathSelectionTo: number
  mathAnchorVersion: 'mathlive-v1'
  menuPoint: { x: number; y: number }
}

export interface MathSelectionDebugEvent {
  type: 'pointerdown' | 'selection-change' | 'pointerup' | 'pointercancel' | 'blur' | 'commit'
  mathNodeId: string
  mathMode: MathSelectionMode
  nodePos: number | null
  docLookupPos: number | null
  rawRanges: Array<[number, number]>
  selectionLatex: string
  nullReason: 'missing-anchor' | 'empty-ranges' | 'empty-latex' | null
  pointerActive: boolean
  pendingCommit: boolean
  selectionRevision: number
  releaseSelectionRevision: number
  snapshot: MathSelectionSnapshot | null
}

export interface MathSelectionController {
  onSelectionChange: (next: MathSelectionSnapshot | null) => void
  onSelectionCommit?: (next: MathSelectionSnapshot | null) => void
  onDebugEvent?: (event: MathSelectionDebugEvent) => void
}

export interface AnnotationController {
  getLayouts: () => AnnotationLayout[]
  getHoveredKey: () => string | null
  onHoverChange: (next: AnnotationHoverState | null) => void
  onActivate: (recordIds: string[], point: { x: number; y: number }) => void
  isInteractionBlocked?: () => boolean
  subscribe?: (listener: () => void) => () => void
}

interface MathNodeExtensionOptions {
  annotationController?: AnnotationController
  mathSelectionController?: MathSelectionController
}

export interface RichTextExtensionArgs {
  documentPath?: string
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
  annotationController?: AnnotationController
  mathSelectionController?: MathSelectionController
}

interface MathNodeViewProps extends Omit<ReactNodeViewProps, 'extension'> {
  node: ReactNodeViewProps['node'] & {
    attrs: {
      latex?: string
      mathNodeId?: string
    }
  }
  extension: ReactNodeViewProps['extension'] & {
    options: MathNodeExtensionOptions
  }
}

interface MathAnnotationRect {
  left: number
  top: number
  width: number
  height: number
}

interface MathAnnotationOverlay {
  key: string
  color: string
  hovered: boolean
  kind: 'math-selection' | 'text-bridge'
  markerType: 'underline' | 'bracket'
  rects: MathAnnotationRect[]
}

interface MathfieldInternalAtom {
  id?: string
  parent?: { id?: string } | null
  parentBranch?: string | [number, number]
}

interface MathfieldInternalModel {
  getAtoms: (range: [number, number], options?: { includeChildren?: boolean }) => Iterable<MathfieldInternalAtom>
}

interface MathfieldInternalHandle {
  field: HTMLElement
  model: MathfieldInternalModel
}

interface MathDisplayParts {
  latex: string
  tagText: string | null
}

const mathRenderErrorCountCache = new Map<string, number>()

interface MathSelectionBuildResult {
  snapshot: MathSelectionSnapshot | null
  rawRanges: Array<[number, number]>
  selectionLatex: string
  nullReason: 'missing-anchor' | 'empty-ranges' | 'empty-latex' | null
}

const MATH_OVERLAY_INTERACTION_HEIGHT = 10
export const annotationPluginKey = new PluginKey<DecorationSet>('qa-annotations')
export const semanticBlockNodeName = 'semanticBlock'

export function buildRichTextExtensions(args: RichTextExtensionArgs) {
  const mathNodeOptions: MathNodeExtensionOptions = {
    annotationController: args.annotationController,
    mathSelectionController: args.mathSelectionController
  }
  const extensions = [
    StarterKit.configure({
      undoRedo: false
    }),
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      HTMLAttributes: {
        rel: 'noreferrer'
      }
    }),
    ResolvedImageExtension.configure({
      documentPath: args.documentPath,
      mountedVaultPath: args.mountedVaultPath,
      remoteLibraryId: args.remoteLibraryId,
      remoteRevisionId: args.remoteRevisionId
    }),
    Table.configure({
      resizable: false
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    InlineMathNode.configure(mathNodeOptions),
    BlockMathNode.configure(mathNodeOptions),
    SemanticBlockNode
  ]

  if (args.annotationController) {
    extensions.push(buildAnnotationExtension(args.annotationController))
  }

  return extensions
}

export function refreshAnnotationDecorations(editor: Editor | null) {
  if (!editor) {
    return
  }

  editor.view.dispatch(editor.state.tr.setMeta(annotationPluginKey, { refresh: true }))
}

export function findEnclosingSemanticBlockPath(doc: ProseMirrorNode, pos: number) {
  const resolved = doc.resolve(pos)
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth)
    if (node.type.name === semanticBlockNodeName) {
      const value = node.attrs.contentPath
      return typeof value === 'string' ? value : undefined
    }
  }

  return undefined
}

function buildAnnotationExtension(controller: AnnotationController) {
  return Extension.create({
    name: 'qaAnnotations',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: annotationPluginKey,
          state: {
            init: (_config, state) => buildAnnotationDecorations(state.doc, controller.getLayouts(), controller.getHoveredKey()),
            apply: (transaction, value, _oldState, newState) => {
              if (transaction.docChanged || transaction.getMeta(annotationPluginKey)?.refresh) {
                return buildAnnotationDecorations(newState.doc, controller.getLayouts(), controller.getHoveredKey())
              }

              return value
            }
          },
          props: {
            decorations(state) {
              return annotationPluginKey.getState(state)
            },
            handleDOMEvents: {
              mouseover: (_view, event) => {
                if (controller.isInteractionBlocked?.()) {
                  controller.onHoverChange(null)
                  return false
                }

                const markerElement = findHoverMarkerElement(event.target, controller)
                if (!markerElement) {
                  return false
                }

                const key = markerElement.getAttribute('data-annotation-key')
                if (!key) {
                  return false
                }

                const layout = controller.getLayouts().find((candidate) => candidate.key === key)
                if (!layout) {
                  return false
                }

                controller.onHoverChange({
                  key,
                  point: resolveHoverAnchorPoint({
                    markerElement,
                    layout,
                    pointer: {
                      x: event.clientX,
                      y: event.clientY
                    }
                  })
                })
                return false
              },
              mousemove: (_view, event) => {
                if (controller.isInteractionBlocked?.()) {
                  controller.onHoverChange(null)
                  return false
                }

                const markerElement = findHoverMarkerElement(event.target, controller)
                if (!markerElement) {
                  return false
                }

                const key = markerElement.getAttribute('data-annotation-key')
                if (!key) {
                  return false
                }

                const layout = controller.getLayouts().find((candidate) => candidate.key === key)
                if (!layout) {
                  return false
                }

                controller.onHoverChange({
                  key,
                  point: resolveHoverAnchorPoint({
                    markerElement,
                    layout,
                    pointer: {
                      x: event.clientX,
                      y: event.clientY
                    }
                  })
                })
                return false
              },
              mouseout: (_view, event) => {
                if (controller.isInteractionBlocked?.()) {
                  controller.onHoverChange(null)
                  return false
                }

                const markerElement = findHoverMarkerElement(event.target, controller)
                if (!markerElement) {
                  return false
                }

                const currentKey = markerElement.getAttribute('data-annotation-key')
                const relatedElement = findHoverMarkerElement(event.relatedTarget, controller)
                const relatedKey = relatedElement?.getAttribute('data-annotation-key')
                if (currentKey && currentKey === relatedKey) {
                  return false
                }

                controller.onHoverChange(null)
                return false
              },
              click: (_view, event) => {
                if (controller.isInteractionBlocked?.()) {
                  return false
                }

                const markerElement = findMarkerElement(event.target)
                if (!markerElement) {
                  return false
                }

                const key = markerElement.getAttribute('data-annotation-key')
                if (!key) {
                  return false
                }

                const layout = controller.getLayouts().find((candidate) => candidate.key === key)
                if (!layout) {
                  return false
                }

                event.preventDefault()
                controller.onActivate(layout.recordIds, {
                  x: event.clientX,
                  y: event.clientY
                })
                return true
              }
            }
          }
        })
      ]
    }
  })
}

function buildAnnotationDecorations(doc: ProseMirrorNode, layouts: AnnotationLayout[], hoveredKey: string | null) {
  const decorations: Decoration[] = []
  const docSize = doc.content.size

  const orderedLayouts = [...layouts].sort((left, right) => {
    const markerPriority = left.markerType === right.markerType ? 0 : left.markerType === 'underline' ? -1 : 1
    if (markerPriority !== 0) {
      return markerPriority
    }

    const leftFrom = left.from ?? Number.MAX_SAFE_INTEGER
    const rightFrom = right.from ?? Number.MAX_SAFE_INTEGER
    if (leftFrom !== rightFrom) {
      return leftFrom - rightFrom
    }

    const leftTo = left.to ?? -1
    const rightTo = right.to ?? -1
    return rightTo - leftTo
  })

  for (const layout of orderedLayouts) {
    if (layout.mathNodeId) {
      // Math annotations intentionally keep their own sub-expression overlay path inside MathLive.
      // They do not reuse the text markerType underline/bracket rendering branch below.
      continue
    }

    const from = clampPosition(layout.from, docSize)
    const to = clampPosition(layout.to, docSize)
    if (from === null || to === null || from >= to) {
      continue
    }

    const sharedAttributes = {
      nodeName: buildAnnotationRangeNodeName(layout),
      'data-annotation-key': layout.key,
      style: buildAnnotationStyle(layout.color)
    }
    const rangeClassNames = ['qa-annotation-range']
    if (layout.markerType === 'underline') {
      rangeClassNames.push('qa-annotation-underline')
    } else {
      rangeClassNames.push('qa-annotation-bracket-range')
    }
    if (hoveredKey === layout.key) {
      rangeClassNames.push('is-hovered')
    }

    decorations.push(
      Decoration.inline(
        from,
        to,
        {
          ...sharedAttributes,
          class: rangeClassNames.join(' ')
        },
        {
          inclusiveEnd: false,
          inclusiveStart: false
        }
      )
    )

    if (layout.markerType === 'bracket') {
      decorations.push(
        Decoration.widget(from, () => createBracketElement('left', layout), {
          key: `${layout.key}-left`,
          side: -1
        }),
        Decoration.widget(to, () => createBracketElement('right', layout), {
          key: `${layout.key}-right`,
          side: 1
        })
      )
    }
  }

  return DecorationSet.create(doc, decorations)
}

function buildAnnotationRangeNodeName(layout: AnnotationLayout) {
  const sanitizedKey = layout.key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `anyreader-annotation-${layout.markerType}-${sanitizedKey || 'marker'}`
}

function createBracketElement(side: 'left' | 'right', layout: AnnotationLayout) {
  const element = document.createElement('span')
  element.className = `qa-bracket-widget ${side}`
  element.setAttribute('data-annotation-key', layout.key)
  element.setAttribute('data-no-selection-menu', 'true')
  element.setAttribute('role', 'button')
  element.setAttribute('tabindex', '-1')
  element.setAttribute('contenteditable', 'false')
  element.draggable = false
  element.style.setProperty('--annotation-color', layout.color)
  element.style.setProperty('--annotation-highlight', hexToRgba(layout.color, 0.18))

  const arc = document.createElement('span')
  arc.className = 'qa-bracket-arc'
  arc.setAttribute('aria-hidden', 'true')
  element.appendChild(arc)

  const hitbox = document.createElement('span')
  hitbox.className = 'qa-bracket-hitbox'
  hitbox.setAttribute('aria-hidden', 'true')
  element.appendChild(hitbox)

  if (side === 'left' && layout.recordIds.length > 1) {
    const badge = document.createElement('span')
    badge.className = 'qa-bracket-badge'
    badge.textContent = String(layout.recordIds.length)
    element.appendChild(badge)
  }

  return element
}

function findMarkerElement(target: EventTarget | null) {
  return target instanceof HTMLElement ? target.closest<HTMLElement>('[data-annotation-key]') : null
}

function findHoverMarkerElement(target: EventTarget | null, controller: AnnotationController) {
  const markerElement = findMarkerElement(target)
  if (!markerElement) {
    return null
  }

  const key = markerElement.getAttribute('data-annotation-key')
  if (!key) {
    return null
  }

  const layout = controller.getLayouts().find((candidate) => candidate.key === key)
  if (!layout) {
    return null
  }

  if (layout.markerType !== 'bracket') {
    return markerElement
  }

  return markerElement.classList.contains('qa-bracket-widget') ? markerElement : null
}

function collectHoverAnchorRects(key: string, layout: AnnotationLayout) {
  const allElements = Array.from(document.querySelectorAll<HTMLElement>('[data-annotation-key]')).filter(
    (element) => element.getAttribute('data-annotation-key') === key
  )
  const preferredElements =
    layout.markerType === 'bracket'
      ? allElements.filter((element) => !element.classList.contains('qa-bracket-widget'))
      : allElements
  const sourceElements = preferredElements.length > 0 ? preferredElements : allElements
  const rects = sourceElements.flatMap((element) =>
    Array.from(element.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0)
  )

  return rects.length > 0 ? rects : sourceElements.map((element) => element.getBoundingClientRect())
}

function rectDistanceFromPoint(rect: DOMRect | DOMRectReadOnly, point: { x: number; y: number }) {
  const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
  const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0
  return dy * 10_000 + dx
}

function resolveHoverAnchorPoint(args: {
  markerElement: HTMLElement
  layout: AnnotationLayout
  pointer: { x: number; y: number }
}) {
  const rects = collectHoverAnchorRects(args.layout.key, args.layout)
  const fallbackRect = args.markerElement.getBoundingClientRect()
  const bestRect =
    rects.reduce<DOMRect | DOMRectReadOnly | null>((best, rect) => {
      if (!best) {
        return rect
      }

      return rectDistanceFromPoint(rect, args.pointer) < rectDistanceFromPoint(best, args.pointer) ? rect : best
    }, null) ?? fallbackRect

  return {
    x: args.pointer.x,
    y: bestRect.bottom
  }
}

function clampPosition(value: number | undefined, docSize: number) {
  if (value === undefined) {
    return null
  }

  return Math.max(0, Math.min(value, docSize))
}

function buildAnnotationStyle(color: string) {
  return `--annotation-color: ${color}; --annotation-highlight: ${hexToRgba(color, 0.18)};`
}

const InlineMathNode = Node.create<MathNodeExtensionOptions>({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  content: 'text*',
  selectable: false,
  addOptions() {
    return {
      annotationController: undefined,
      mathSelectionController: undefined
    }
  },
  addAttributes() {
    return {
      latex: {
        default: ''
      },
      mathNodeId: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [
      {
        tag: 'anyreader-inline-math',
        getAttrs: (element) => ({
          latex: element instanceof HTMLElement ? element.getAttribute('data-latex') ?? '' : '',
          mathNodeId: element instanceof HTMLElement ? element.getAttribute('data-math-node-id') ?? '' : ''
        })
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'anyreader-inline-math',
      mergeAttributes(HTMLAttributes, {
        'data-latex': HTMLAttributes.latex ?? '',
        'data-math-node-id': HTMLAttributes.mathNodeId ?? ''
      }),
      0
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView)
  }
})

const BlockMathNode = Node.create<MathNodeExtensionOptions>({
  name: 'blockMath',
  group: 'block',
  content: 'text*',
  code: true,
  selectable: false,
  addOptions() {
    return {
      annotationController: undefined,
      mathSelectionController: undefined
    }
  },
  addAttributes() {
    return {
      latex: {
        default: ''
      },
      mathNodeId: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [
      {
        tag: 'anyreader-block-math',
        getAttrs: (element) => ({
          latex: element instanceof HTMLElement ? element.getAttribute('data-latex') ?? '' : '',
          mathNodeId: element instanceof HTMLElement ? element.getAttribute('data-math-node-id') ?? '' : ''
        })
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'anyreader-block-math',
      mergeAttributes(HTMLAttributes, {
        'data-latex': HTMLAttributes.latex ?? '',
        'data-math-node-id': HTMLAttributes.mathNodeId ?? ''
      }),
      0
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView)
  }
})

const SemanticBlockNode = Node.create({
  name: semanticBlockNodeName,
  group: 'block',
  content: 'block+',
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      contentPath: {
        default: ''
      },
      title: {
        default: null
      }
    }
  },
  parseHTML() {
    return [
      {
        tag: 'anyreader-semantic-block',
        getAttrs: (element) => ({
          contentPath: element instanceof HTMLElement ? element.getAttribute('data-content-path') ?? '' : '',
          title: element instanceof HTMLElement ? element.getAttribute('data-title') : null
        })
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    const attributes = {
      'data-content-path': HTMLAttributes.contentPath ?? '',
      'data-title': HTMLAttributes.title ?? undefined
    }

    return ['anyreader-semantic-block', mergeAttributes(attributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(SemanticBlockView)
  }
})

const ResolvedImageExtension = Image.extend<{
  documentPath?: string
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
}>({
  addOptions() {
    return {
      ...this.parent?.(),
      documentPath: undefined,
      mountedVaultPath: undefined,
      remoteLibraryId: undefined,
      remoteRevisionId: undefined
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(RichTextImageView)
  }
})

function InlineMathView(props: MathNodeViewProps) {
  return <MathFieldNodeView {...props} mathMode="inline" />
}

function BlockMathView(props: MathNodeViewProps) {
  return <MathFieldNodeView {...props} mathMode="block" />
}

function MathFieldNodeView(props: MathNodeViewProps & { mathMode: MathSelectionMode }) {
  const fieldRef = useRef<MathfieldElement | null>(null)
  const frameRef = useRef<HTMLSpanElement | null>(null)
  const pointerPointRef = useRef<{ x: number; y: number } | null>(null)
  const pointerUpCleanupRef = useRef<(() => void) | null>(null)
  const pointerSelectionActiveRef = useRef(false)
  const liveSelectionSnapshotRef = useRef<MathSelectionSnapshot | null>(null)
  const lastNonNullSelectionSnapshotRef = useRef<MathSelectionSnapshot | null>(null)
  const releaseSelectionSnapshotRef = useRef<MathSelectionSnapshot | null>(null)
  const pendingSelectionCommitRef = useRef(false)
  const selectionCommitFrameRef = useRef<number | null>(null)
  const selectionRevisionRef = useRef(0)
  const releaseSelectionRevisionRef = useRef(0)
  const sawExplicitNullSelectionRef = useRef(false)
  const [annotationOverlays, setAnnotationOverlays] = useState<MathAnnotationOverlay[]>([])
  const [runtimeRenderErrorCount, setRuntimeRenderErrorCount] = useState(0)
  const latex = props.node.attrs.latex ?? ''
  const mathNodeId = props.node.attrs.mathNodeId ?? ''
  const mathDisplay = splitMathDisplayParts(latex)
  const renderLatex = normalizeLatexForMathLive(mathDisplay.latex)
  const preflightRenderErrorCount = countMathRenderErrors(renderLatex)
  const renderErrorCount = preflightRenderErrorCount > 0 ? preflightRenderErrorCount : runtimeRenderErrorCount
  const useRenderFallback = renderErrorCount > 0
  const blockTagText = props.mathMode === 'block' ? mathDisplay.tagText : null
  const annotationController = props.extension.options.annotationController
  const mathNodePos = resolveMathNodePosition(props.getPos) ?? findMathNodePositionById(props.editor.view.state.doc, mathNodeId)
  const wrapperAttributes = mergeDomAttributeSets(
    props.HTMLAttributes,
    collectMathNodeDecorationAttributes(props.decorations, mathNodePos, props.node.nodeSize)
  )
  const { class: wrapperDecorationClass, style: wrapperDecorationStyle, ...wrapperDomAttributes } = wrapperAttributes
  const wrapperClassName = mergeClassNames(
    `rich-text-math ${props.mathMode}${mathDisplay.tagText ? ' has-tag' : ''}${useRenderFallback ? ' has-render-fallback' : ''}`,
    wrapperDecorationClass
  )
  const wrapperStyle = parseInlineStyleAttribute(wrapperDecorationStyle)

  useEffect(() => {
    setRuntimeRenderErrorCount(0)
  }, [renderLatex])

  useEffect(() => {
    const field = fieldRef.current
    if (!field || preflightRenderErrorCount > 0) {
      return
    }

    field.readOnly = true
    field.defaultMode = props.mathMode === 'block' ? 'math' : 'inline-math'
    field.menuItems = []
    field.popoverPolicy = 'off'
    field.mathVirtualKeyboardPolicy = 'manual'
    try {
      if (field.getValue('latex-unstyled') !== renderLatex) {
        field.setValue(renderLatex)
      }
      setRuntimeRenderErrorCount(field.errors.length)
    } catch {
      setRuntimeRenderErrorCount(1)
    }
  }, [preflightRenderErrorCount, props.mathMode, renderLatex])

  useEffect(() => {
    const field = fieldRef.current
    const controller = props.extension.options.mathSelectionController
    if (!field || !controller) {
      return
    }

    const cancelSelectionCommitFrame = () => {
      if (selectionCommitFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionCommitFrameRef.current)
        selectionCommitFrameRef.current = null
      }
    }

    const readSelection = () =>
      buildMathSelectionSnapshot({
        field,
        editorView: props.editor.view,
        getPos: props.getPos,
        mathNodeId,
        mathMode: props.mathMode,
        menuPoint: pointerPointRef.current ?? resolveMathMenuPoint(field)
      })

    const emitDebugEvent = (
      type: MathSelectionDebugEvent['type'],
      snapshot: MathSelectionSnapshot | null = liveSelectionSnapshotRef.current
    ) => {
      const nodePos = resolveMathNodePosition(props.getPos)
      const docLookupPos = findMathNodePositionById(props.editor.view.state.doc, mathNodeId)
      const selectionAttempt = inspectMathSelectionSnapshot({
        field,
        editorView: props.editor.view,
        getPos: props.getPos,
        mathNodeId,
        mathMode: props.mathMode,
        menuPoint: pointerPointRef.current ?? resolveMathMenuPoint(field)
      })
      controller.onDebugEvent?.({
        type,
        mathNodeId,
        mathMode: props.mathMode,
        nodePos,
        docLookupPos,
        rawRanges: selectionAttempt.rawRanges,
        selectionLatex: selectionAttempt.selectionLatex,
        nullReason: selectionAttempt.nullReason,
        pointerActive: pointerSelectionActiveRef.current,
        pendingCommit: pendingSelectionCommitRef.current,
        selectionRevision: selectionRevisionRef.current,
        releaseSelectionRevision: releaseSelectionRevisionRef.current,
        snapshot
      })
    }

    const emitSelection = () => {
      const nextSelection = readSelection()
      selectionRevisionRef.current += 1
      liveSelectionSnapshotRef.current = nextSelection
      if (nextSelection) {
        lastNonNullSelectionSnapshotRef.current = nextSelection
        sawExplicitNullSelectionRef.current = false
      } else if (lastNonNullSelectionSnapshotRef.current) {
        sawExplicitNullSelectionRef.current = true
      }
      controller.onSelectionChange(nextSelection)
      emitDebugEvent('selection-change', nextSelection)
      return nextSelection
    }

    // MathLive may publish the final non-collapsed selection after pointerup,
    // so pointerup only flips us into a pending-commit state.
    const commitSelection = (nextSelection: MathSelectionSnapshot | null) => {
      pendingSelectionCommitRef.current = false
      cancelSelectionCommitFrame()
      liveSelectionSnapshotRef.current = nextSelection
      lastNonNullSelectionSnapshotRef.current = nextSelection
      releaseSelectionSnapshotRef.current = null
      controller.onSelectionChange(nextSelection)
      controller.onSelectionCommit?.(nextSelection)
      emitDebugEvent('commit', nextSelection)
    }

    const scheduleSelectionCommit = () => {
      cancelSelectionCommitFrame()
      const releaseRevision = releaseSelectionRevisionRef.current
      selectionCommitFrameRef.current = window.requestAnimationFrame(() => {
        selectionCommitFrameRef.current = window.requestAnimationFrame(() => {
          selectionCommitFrameRef.current = null
          if (!pendingSelectionCommitRef.current || selectionRevisionRef.current !== releaseRevision) {
            return
          }

          commitSelection(readSelection() ?? releaseSelectionSnapshotRef.current)
        })
      })
    }

    const handleSelectionChange = () => {
      const nextSelection = emitSelection()
      if (!pointerSelectionActiveRef.current && pendingSelectionCommitRef.current) {
        if (nextSelection) {
          commitSelection(nextSelection)
          return
        }

        releaseSelectionSnapshotRef.current = null
        releaseSelectionRevisionRef.current = selectionRevisionRef.current
        scheduleSelectionCommit()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      pointerPointRef.current = {
        x: event.clientX,
        y: event.clientY
      }
      pointerSelectionActiveRef.current = true
      liveSelectionSnapshotRef.current = null
      lastNonNullSelectionSnapshotRef.current = null
      releaseSelectionSnapshotRef.current = null
      pendingSelectionCommitRef.current = false
      sawExplicitNullSelectionRef.current = false
      cancelSelectionCommitFrame()
      emitDebugEvent('pointerdown', null)
      pointerUpCleanupRef.current?.()
      const handleWindowPointerUp = (nextEvent: PointerEvent) => {
        pointerPointRef.current = {
          x: nextEvent.clientX,
          y: nextEvent.clientY
        }
        const releaseSelection = readSelection()
        pointerSelectionActiveRef.current = false
        pendingSelectionCommitRef.current = true
        releaseSelectionRevisionRef.current = selectionRevisionRef.current
        liveSelectionSnapshotRef.current = releaseSelection
        if (releaseSelection) {
          lastNonNullSelectionSnapshotRef.current = releaseSelection
          sawExplicitNullSelectionRef.current = false
          releaseSelectionSnapshotRef.current = releaseSelection
        } else {
          releaseSelectionSnapshotRef.current = sawExplicitNullSelectionRef.current
            ? null
            : lastNonNullSelectionSnapshotRef.current
        }
        emitDebugEvent('pointerup', releaseSelectionSnapshotRef.current)
        scheduleSelectionCommit()
      }
      const handleWindowPointerCancel = () => {
        pointerSelectionActiveRef.current = false
        pendingSelectionCommitRef.current = false
        cancelSelectionCommitFrame()
        liveSelectionSnapshotRef.current = null
        lastNonNullSelectionSnapshotRef.current = null
        releaseSelectionSnapshotRef.current = null
        sawExplicitNullSelectionRef.current = false
        controller.onSelectionChange(null)
        emitDebugEvent('pointercancel', null)
      }
      window.addEventListener('pointerup', handleWindowPointerUp, {
        capture: true,
        once: true
      })
      window.addEventListener('pointercancel', handleWindowPointerCancel, {
        capture: true,
        once: true
      })
      pointerUpCleanupRef.current = () => {
        window.removeEventListener('pointerup', handleWindowPointerUp, true)
        window.removeEventListener('pointercancel', handleWindowPointerCancel, true)
      }
    }

    const handleBlur = () => {
      pointerSelectionActiveRef.current = false
      if (pendingSelectionCommitRef.current) {
        const blurSelection = readSelection()
        if (blurSelection) {
          liveSelectionSnapshotRef.current = blurSelection
          lastNonNullSelectionSnapshotRef.current = blurSelection
          releaseSelectionSnapshotRef.current = blurSelection
          sawExplicitNullSelectionRef.current = false
        }
        scheduleSelectionCommit()
        return
      }

      pendingSelectionCommitRef.current = false
      cancelSelectionCommitFrame()
      liveSelectionSnapshotRef.current = null
      lastNonNullSelectionSnapshotRef.current = null
      releaseSelectionSnapshotRef.current = null
      sawExplicitNullSelectionRef.current = false
      controller.onSelectionChange(null)
      emitDebugEvent('blur', null)
    }

    field.addEventListener('selection-change', handleSelectionChange)
    field.addEventListener('pointerdown', handlePointerDown)
    field.addEventListener('blur', handleBlur)

    return () => {
      pointerUpCleanupRef.current?.()
      pointerUpCleanupRef.current = null
      pointerSelectionActiveRef.current = false
      pendingSelectionCommitRef.current = false
      cancelSelectionCommitFrame()
      liveSelectionSnapshotRef.current = null
      lastNonNullSelectionSnapshotRef.current = null
      releaseSelectionSnapshotRef.current = null
      sawExplicitNullSelectionRef.current = false
      field.removeEventListener('selection-change', handleSelectionChange)
      field.removeEventListener('pointerdown', handlePointerDown)
      field.removeEventListener('blur', handleBlur)
      controller.onSelectionChange(null)
    }
  }, [mathNodeId, props.extension.options.mathSelectionController, props.getPos, props.mathMode])

  useEffect(() => {
    const field = fieldRef.current
    const controller = annotationController
    if (!field || !controller || !mathNodeId) {
      setAnnotationOverlays([])
      return
    }

    let frameId: number | null = null
    const settleTimeoutIds = new Set<number>()
    const scheduleSettleRefreshBurst = () => {
      for (const delay of [0, 32, 96, 192]) {
        const timeoutId = window.setTimeout(() => {
          settleTimeoutIds.delete(timeoutId)
          updateAnnotations()
        }, delay)
        settleTimeoutIds.add(timeoutId)
      }
    }
    const updateAnnotations = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        const currentMathNodePos = resolveMathNodeAnchorPosition({
          field,
          editorView: props.editor.view,
          getPos: props.getPos,
          mathNodeId
        })
        const next = buildMathAnnotationPresentation({
          field,
          hoveredKey: controller.getHoveredKey(),
          layouts: controller.getLayouts(),
          mathNodeId,
          mathNodePos: currentMathNodePos,
          mathNodeSize: props.node.nodeSize
        })
        setAnnotationOverlays(next.overlays)
      })
    }

    updateAnnotations()
    scheduleSettleRefreshBurst()
    const unsubscribe = controller.subscribe?.(updateAnnotations)
    const resizeObserver = new ResizeObserver(updateAnnotations)
    resizeObserver.observe(field)
    field.addEventListener('scroll', updateAnnotations)
    window.addEventListener('resize', updateAnnotations)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      for (const timeoutId of settleTimeoutIds) {
        window.clearTimeout(timeoutId)
      }
      settleTimeoutIds.clear()
      resizeObserver.disconnect()
      field.removeEventListener('scroll', updateAnnotations)
      window.removeEventListener('resize', updateAnnotations)
      unsubscribe?.()
    }
  }, [annotationController, latex, mathNodeId, mathNodePos, props.node.nodeSize])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const markerElement = findMarkerElement(event.target)
      if (!markerElement || !frame.contains(markerElement)) {
        return
      }

      props.extension.options.mathSelectionController?.onSelectionChange(null)
      event.preventDefault()
      event.stopPropagation()
    }

    frame.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      frame.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [props.extension.options.mathSelectionController])

  return (
    <NodeViewWrapper
      as={props.mathMode === 'block' ? 'div' : 'span'}
      {...wrapperDomAttributes}
      className={wrapperClassName}
      style={wrapperStyle}
      data-latex={latex}
      data-math-node-id={mathNodeId}
      data-math-render-mode={useRenderFallback ? 'fallback' : 'mathlive'}
      data-math-render-error-count={String(renderErrorCount)}
    >
      <NodeViewContent as={props.mathMode === 'block' ? ('div' as never) : ('span' as never)} className="rich-text-math-source-hidden" />
      {blockTagText ? (
        <span className={`qa-math-display-tag-spacer ${props.mathMode}`} aria-hidden="true">
          {blockTagText}
        </span>
      ) : null}
      <span ref={frameRef} className={`rich-text-math-frame ${props.mathMode}`}>
        {useRenderFallback ? (
          <span
            className={`rich-text-math-fallback ${props.mathMode}`}
            data-math-render-fallback="true"
            data-no-canvas-pan="true"
            translate="no"
          >
            {mathDisplay.latex}
          </span>
        ) : (
          <>
            {props.mathMode === 'block' ? (
              <math-field ref={fieldRef} className="rich-text-math-field block" data-no-canvas-pan="true" />
            ) : (
              <math-field ref={fieldRef} className="rich-text-math-field inline" data-no-canvas-pan="true" />
            )}
            <span className="qa-math-overlay-layer" aria-hidden="true">
              {annotationOverlays.map((overlay) =>
                overlay.kind === 'text-bridge' ? (
                  <span
                    key={overlay.key}
                    className={`qa-math-selection-overlay ${overlay.kind} marker-${overlay.markerType}${
                      overlay.hovered ? ' is-hovered' : ''
                    }`}
                    data-annotation-key={overlay.key}
                    data-no-selection-menu="true"
                    role="button"
                    tabIndex={-1}
                    contentEditable={false}
                    draggable={false}
                    style={buildAnnotationInlineStyle(overlay.color)}
                  />
                ) : (
                  overlay.rects.map((rect, index) => {
                    const interactionRect = buildMathOverlayInteractionRect(rect)
                    return (
                      <span
                        key={`${overlay.key}-${index}`}
                        className={`qa-math-selection-overlay ${overlay.kind}${overlay.hovered ? ' is-hovered' : ''}`}
                        data-annotation-key={overlay.key}
                        data-no-selection-menu="true"
                        role="button"
                        tabIndex={-1}
                        contentEditable={false}
                        draggable={false}
                        style={{
                          ...buildAnnotationInlineStyle(overlay.color),
                          left: `${interactionRect.left}px`,
                          top: `${interactionRect.top}px`,
                          width: `${interactionRect.width}px`,
                          height: `${interactionRect.height}px`
                        }}
                      />
                    )
                  })
                )
              )}
            </span>
          </>
        )}
      </span>
      {mathDisplay.tagText ? <span className={`qa-math-display-tag ${props.mathMode}`}>{mathDisplay.tagText}</span> : null}
    </NodeViewWrapper>
  )
}

function buildMathSelectionSnapshot(args: {
  field: MathfieldElement
  editorView?: EditorView
  getPos?: (() => number | undefined) | boolean
  mathNodeId: string
  mathMode: MathSelectionMode
  menuPoint: { x: number; y: number }
}): MathSelectionSnapshot | null {
  return inspectMathSelectionSnapshot(args).snapshot
}

function inspectMathSelectionSnapshot(args: {
  field: MathfieldElement
  editorView?: EditorView
  getPos?: (() => number | undefined) | boolean
  mathNodeId: string
  mathMode: MathSelectionMode
  menuPoint: { x: number; y: number }
}): MathSelectionBuildResult {
  const basePos = resolveMathNodeAnchorPosition(args)
  if (basePos === null || !args.mathNodeId) {
    return {
      snapshot: null,
      rawRanges: [],
      selectionLatex: '',
      nullReason: 'missing-anchor'
    }
  }

  const selection = args.field.selection
  const rawRanges = selection.ranges.map((range) => [range[0], range[1]] as [number, number])
  const normalizedRanges = rawRanges
    .map((range) => normalizeMathRange(range))
    .filter((range): range is [number, number] => Boolean(range))
  if (normalizedRanges.length === 0) {
    return {
      snapshot: null,
      rawRanges,
      selectionLatex: '',
      nullReason: 'empty-ranges'
    }
  }

  const selectionFrom = normalizedRanges[0][0]
  const selectionTo = normalizedRanges[normalizedRanges.length - 1][1]
  const selectionLatex = args.field.getValue(selection as MathfieldSelection, 'latex-unstyled').trim()
  const displayText = getMathDisplayText({
    kind: 'math',
    text: args.field.getValue(selection as MathfieldSelection, 'plain-text'),
    mathSelectionLatex: selectionLatex
  })
  const promptText = getMathPromptText({
    kind: 'math',
    mathSelectionLatex: selectionLatex
  })
  if (!selectionLatex) {
    return {
      snapshot: null,
      rawRanges,
      selectionLatex,
      nullReason: 'empty-latex'
    }
  }

  return {
    snapshot: {
      text: displayText || selectionLatex,
      anchorFrom: basePos + 1 + selectionFrom,
      anchorTo: basePos + 1 + selectionTo,
      mathNodeId: args.mathNodeId,
      mathMode: args.mathMode,
      mathSelectionLatex: selectionLatex,
      mathAnchorLatex: selectionLatex,
      mathDisplayText: displayText || selectionLatex,
      mathPromptText: promptText || selectionLatex,
      mathSelectionPath: buildMathSelectionPath(normalizedRanges),
      mathSelectionFrom: selectionFrom,
      mathSelectionTo: selectionTo,
      mathAnchorVersion: 'mathlive-v1',
      menuPoint: args.menuPoint
    },
    rawRanges,
    selectionLatex,
    nullReason: null
  }
}

function buildMathAnnotationPresentation(args: {
  field: MathfieldElement
  layouts: AnnotationLayout[]
  hoveredKey: string | null
  mathNodeId: string
  mathNodePos: number | null
  mathNodeSize: number
}) {
  const overlays: MathAnnotationOverlay[] = []

  for (const layout of args.layouts) {
    if (layout.mathNodeId === args.mathNodeId) {
      const rects = resolveMathAnnotationRects(args.field, layout)
      if (rects.length === 0) {
        continue
      }

      overlays.push({
        key: layout.key,
        color: layout.color,
        hovered: args.hoveredKey === layout.key,
        kind: 'math-selection',
        markerType: layout.markerType,
        rects
      })
      continue
    }

    if (!shouldRenderTextAnnotationAcrossMathNode(layout, args.mathNodePos, args.mathNodeSize)) {
      continue
    }

    overlays.push({
      key: layout.key,
      color: layout.color,
      hovered: args.hoveredKey === layout.key,
      kind: 'text-bridge',
      markerType: layout.markerType,
      rects: []
    })
  }

  return {
    overlays
  }
}

function resolveMathAnnotationRects(field: MathfieldElement, layout: AnnotationLayout) {
  const maxOffset = field.lastOffset
  const fallbackRange = normalizeMathRange([layout.mathSelectionFrom ?? 0, layout.mathSelectionTo ?? 0], maxOffset)
  const ranges = (layout.mathSelectionPath ? parseMathSelectionPath(layout.mathSelectionPath) : fallbackRange ? [fallbackRange] : [])
    .map((range) => normalizeMathRange(range, maxOffset))
    .filter((range): range is [number, number] => Boolean(range))
  if (ranges.length === 0) {
    return [] as MathAnnotationRect[]
  }

  const containerRect = field.getBoundingClientRect()
  if ((containerRect.width <= 0 && containerRect.height <= 0) || Number.isNaN(containerRect.left) || Number.isNaN(containerRect.top)) {
    return [] as MathAnnotationRect[]
  }

  const sampledRects: DOMRect[] = []
  for (const range of ranges) {
    const rangeRects = resolveMathRangeRects(field, range)
    if (rangeRects.length === 0) {
      continue
    }
    sampledRects.push(...rangeRects)
  }

  return mergeMathAnnotationRects(sampledRects, containerRect)
}

function mergeMathAnnotationRects(rects: DOMRect[], containerRect: DOMRect) {
  const uniqueRects = new Map<string, MathAnnotationRect>()

  for (const rect of rects) {
    const normalizedRect = {
      left: Math.max(0, rect.left - containerRect.left - 1),
      top: Math.max(0, rect.top - containerRect.top - 1),
      width: Math.max(2, rect.width + 2),
      height: Math.max(2, rect.height + 2)
    }
    const key = [
      Math.round(normalizedRect.left),
      Math.round(normalizedRect.top),
      Math.round(normalizedRect.width),
      Math.round(normalizedRect.height)
    ].join(':')
    uniqueRects.set(key, normalizedRect)
  }

  const sortedRects = [...uniqueRects.values()].sort((left, right) =>
    left.top === right.top ? left.left - right.left : left.top - right.top
  )
  const merged: MathAnnotationRect[] = []

  for (const rect of sortedRects) {
    const previous = merged[merged.length - 1]
    if (!previous) {
      merged.push(rect)
      continue
    }

    const sameLine = Math.abs(previous.top - rect.top) <= Math.max(4, Math.min(previous.height, rect.height) * 0.6)
    const overlaps = rect.left <= previous.left + previous.width + 6
    if (!sameLine || !overlaps) {
      merged.push(rect)
      continue
    }

    const nextLeft = Math.min(previous.left, rect.left)
    const nextTop = Math.min(previous.top, rect.top)
    const nextRight = Math.max(previous.left + previous.width, rect.left + rect.width)
    const nextBottom = Math.max(previous.top + previous.height, rect.top + rect.height)

    previous.left = nextLeft
    previous.top = nextTop
    previous.width = nextRight - nextLeft
    previous.height = nextBottom - nextTop
  }

  return merged
}

function buildAnnotationInlineStyle(color: string) {
  return {
    '--annotation-color': color,
    '--annotation-highlight': hexToRgba(color, 0.18)
  } as CSSProperties
}

function buildMathOverlayInteractionRect(rect: MathAnnotationRect) {
  const height = Math.max(4, Math.min(rect.height, MATH_OVERLAY_INTERACTION_HEIGHT))
  return {
    left: rect.left,
    top: rect.top + Math.max(0, rect.height - height),
    width: rect.width,
    height
  } satisfies MathAnnotationRect
}

function collectMathNodeDecorationAttributes(
  decorations: readonly ({ from: number; to: number; type: { attrs: Record<string, string | undefined> } } | null | undefined)[],
  nodePos: number | null,
  nodeSize: number
) {
  if (nodePos === null) {
    return {} as Record<string, string>
  }

  const mergedAttributes: Record<string, string> = {}
  const classNames: string[] = []
  const styleChunks: string[] = []

  for (const decoration of decorations) {
    if (!decoration || decoration.from !== nodePos || decoration.to !== nodePos + nodeSize) {
      continue
    }

    for (const [key, value] of Object.entries(decoration.type.attrs ?? {})) {
      if (!value) {
        continue
      }

      if (key === 'class') {
        classNames.push(...value.split(/\s+/).filter(Boolean))
        continue
      }

      if (key === 'style') {
        styleChunks.push(value)
        continue
      }

      mergedAttributes[key] = value
    }
  }

  if (classNames.length > 0) {
    mergedAttributes.class = [...new Set(classNames)].join(' ')
  }
  if (styleChunks.length > 0) {
    mergedAttributes.style = styleChunks.join(' ')
  }

  return mergedAttributes
}

function mergeDomAttributeSets(...sources: Array<Record<string, unknown> | undefined>) {
  const mergedAttributes: Record<string, string> = {}
  const classNames: string[] = []
  const styleChunks: string[] = []

  for (const source of sources) {
    if (!source) {
      continue
    }

    for (const [key, rawValue] of Object.entries(source)) {
      if (rawValue === undefined || rawValue === null || rawValue === false) {
        continue
      }

      const value = String(rawValue)
      if (key === 'class') {
        classNames.push(...value.split(/\s+/).filter(Boolean))
        continue
      }

      if (key === 'style') {
        styleChunks.push(value)
        continue
      }

      mergedAttributes[key] = value
    }
  }

  if (classNames.length > 0) {
    mergedAttributes.class = [...new Set(classNames)].join(' ')
  }
  if (styleChunks.length > 0) {
    mergedAttributes.style = styleChunks.join(' ')
  }

  return mergedAttributes
}

function mergeClassNames(...values: Array<string | undefined>) {
  const classNames = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? [])
  return [...new Set(classNames)].join(' ')
}

function parseInlineStyleAttribute(styleText: string | undefined) {
  if (!styleText) {
    return undefined
  }

  const styleObject: Record<string, string> = {}
  for (const declaration of styleText.split(';')) {
    const colonIndex = declaration.indexOf(':')
    if (colonIndex <= 0) {
      continue
    }

    const rawProperty = declaration.slice(0, colonIndex).trim()
    const rawValue = declaration.slice(colonIndex + 1).trim()
    if (!rawProperty || !rawValue) {
      continue
    }

    if (rawProperty.startsWith('--')) {
      styleObject[rawProperty] = rawValue
      continue
    }

    styleObject[toCamelCaseStyleName(rawProperty)] = rawValue
  }

  return Object.keys(styleObject).length > 0 ? (styleObject as CSSProperties) : undefined
}

function toCamelCaseStyleName(property: string) {
  return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

function countMathRenderErrors(latex: string) {
  const normalizedLatex = latex.trim()
  if (!normalizedLatex) {
    return 0
  }

  const cached = mathRenderErrorCountCache.get(normalizedLatex)
  if (cached !== undefined) {
    return cached
  }

  try {
    const count = validateLatex(normalizedLatex).length
    mathRenderErrorCountCache.set(normalizedLatex, count)
    return count
  } catch {
    mathRenderErrorCountCache.set(normalizedLatex, 1)
    return 1
  }
}

function splitMathDisplayParts(latex: string): MathDisplayParts {
  const extractedTag = extractTrailingMathTag(latex)
  if (!extractedTag) {
    return {
      latex,
      tagText: null
    }
  }

  return {
    latex: extractedTag.latex,
    tagText: extractedTag.starred ? extractedTag.text : `(${extractedTag.text})`
  }
}

function extractTrailingMathTag(latex: string) {
  const trimmed = latex.trimEnd()
  if (!trimmed.endsWith('}')) {
    return null
  }

  const closingBraceIndex = trimmed.length - 1
  let depth = 0
  let openingBraceIndex = -1
  for (let index = closingBraceIndex; index >= 0; index -= 1) {
    const character = trimmed[index]
    if (character === '}' && !isEscapedMathDelimiter(trimmed, index)) {
      depth += 1
      continue
    }
    if (character === '{' && !isEscapedMathDelimiter(trimmed, index)) {
      depth -= 1
      if (depth === 0) {
        openingBraceIndex = index
        break
      }
    }
  }

  if (openingBraceIndex < 0) {
    return null
  }

  const commandPrefix = trimmed.slice(0, openingBraceIndex)
  const commandMatch = /\\tag(\*)?\s*$/.exec(commandPrefix)
  if (!commandMatch) {
    return null
  }

  const text = trimmed.slice(openingBraceIndex + 1, closingBraceIndex).replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }

  const mathLatex = commandPrefix.slice(0, commandMatch.index).trimEnd()
  if (!mathLatex) {
    return null
  }

  return {
    latex: mathLatex,
    text,
    starred: commandMatch[1] === '*'
  }
}

function isEscapedMathDelimiter(source: string, index: number) {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function resolveMathRangeRects(field: MathfieldElement, range: [number, number]) {
  try {
    const mathfield = getInternalMathfield(field)
    if (!mathfield) {
      return [] as DOMRect[]
    }

    const rects = new Map<string, DOMRect>()
    for (const atom of mathfield.model.getAtoms(range, { includeChildren: true })) {
      const bounds = resolveMathAtomBounds(mathfield, atom)
      if (!bounds) {
        continue
      }

      const id = resolveMathAtomBranchId(atom)
      const existing = rects.get(id)
      if (!existing) {
        rects.set(id, bounds)
        continue
      }

      const nextLeft = Math.min(existing.left, bounds.left)
      const nextTop = Math.min(existing.top, bounds.top)
      const nextRight = Math.max(existing.left + existing.width, bounds.left + bounds.width)
      const nextBottom = Math.max(existing.top + existing.height, bounds.top + bounds.height)
      rects.set(id, new DOMRect(nextLeft, nextTop, nextRight - nextLeft, nextBottom - nextTop))
    }

    return [...rects.values()]
  } catch {
    return [] as DOMRect[]
  }
}

function getInternalMathfield(field: MathfieldElement) {
  const candidate = field as unknown as { _mathfield?: MathfieldInternalHandle }
  const mathfield = candidate._mathfield
  if (!mathfield || !(mathfield.field instanceof HTMLElement) || typeof mathfield.model?.getAtoms !== 'function') {
    return null
  }

  return mathfield
}

function resolveMathAtomBounds(mathfield: MathfieldInternalHandle, atom: MathfieldInternalAtom) {
  if (!atom.id) {
    return null
  }

  const nodeList = Array.from(mathfield.field.querySelectorAll<HTMLElement>(`[data-atom-id="${atom.id}"]`))
  if (nodeList.length === 0) {
    return null
  }

  let result: DOMRect | null = null
  for (const node of nodeList) {
    const bounds = getMathNodeBounds(node)
    if (!bounds) {
      continue
    }

    if (!result) {
      result = bounds
      continue
    }

    const nextLeft = Math.min(result.left, bounds.left)
    const nextTop = Math.min(result.top, bounds.top)
    const nextRight = Math.max(result.left + result.width, bounds.left + bounds.width)
    const nextBottom = Math.max(result.top + result.height, bounds.top + bounds.height)
    result = new DOMRect(nextLeft, nextTop, nextRight - nextLeft, nextBottom - nextTop)
  }

  return result
}

function getMathNodeBounds(node: HTMLElement) {
  let target: HTMLElement = node
  let bounds = target.getBoundingClientRect()
  while (bounds.bottom === bounds.top && target.parentElement instanceof HTMLElement) {
    target = target.parentElement
    bounds = target.getBoundingClientRect()
    if (bounds.bottom !== bounds.top) {
      break
    }
  }

  const styles = window.getComputedStyle(target)
  const marginRight = Number.parseFloat(styles.marginRight)
  const computedWidth = Number.parseFloat(styles.width)
  const computedHeight = Number.parseFloat(styles.height)
  const width =
    bounds.width > 0 && Number.isFinite(bounds.width)
      ? bounds.width
      : Number.isFinite(computedWidth) && computedWidth > 0
        ? computedWidth
        : target.offsetWidth
  const height =
    bounds.height > 0 && Number.isFinite(bounds.height)
      ? bounds.height
      : Number.isFinite(computedHeight) && computedHeight > 0
        ? computedHeight
        : target.offsetHeight

  if (width <= 0 && height <= 0) {
    return null
  }

  return new DOMRect(bounds.left, bounds.top - 1, width + Math.max(0, marginRight || 0), Math.max(1, height))
}

function resolveMathAtomBranchId(atom: MathfieldInternalAtom) {
  if (!atom.parent) {
    return 'root'
  }

  let result = atom.parent.id ?? ''
  if (typeof atom.parentBranch === 'string') {
    result += `-${atom.parentBranch}`
  } else if (Array.isArray(atom.parentBranch)) {
    result += `-${atom.parentBranch[0]}/${atom.parentBranch[0]}`
  }
  return result
}

function shouldRenderTextAnnotationAcrossMathNode(layout: AnnotationLayout, mathNodePos: number | null, mathNodeSize: number) {
  if (layout.mathNodeId || mathNodePos === null) {
    return false
  }

  const from = layout.from
  const to = layout.to
  if (typeof from !== 'number' || typeof to !== 'number' || from >= to) {
    return false
  }

  const nodeStart = mathNodePos
  const nodeEnd = mathNodePos + mathNodeSize
  return from < nodeEnd && to > nodeStart
}

function normalizeMathRange(range: [number, number], maxOffset = Number.POSITIVE_INFINITY) {
  const clampedFirst = Math.max(0, Math.min(range[0], maxOffset))
  const clampedSecond = Math.max(0, Math.min(range[1], maxOffset))
  const start = Math.min(clampedFirst, clampedSecond)
  const end = Math.max(clampedFirst, clampedSecond)
  if (start === end) {
    return null
  }

  return [start, end] as [number, number]
}

function resolveMathNodePosition(getPos?: (() => number | undefined) | boolean) {
  if (typeof getPos !== 'function') {
    return null
  }

  const pos = getPos()
  return typeof pos === 'number' ? pos : null
}

function resolveMathNodeAnchorPosition(args: {
  field: MathfieldElement
  editorView?: EditorView
  getPos?: (() => number | undefined) | boolean
  mathNodeId: string
}) {
  const directPos = resolveMathNodePosition(args.getPos)
  if (directPos !== null) {
    return directPos
  }

  if (!args.editorView) {
    return null
  }

  const indexedPos = findMathNodePositionById(args.editorView.state.doc, args.mathNodeId)
  if (indexedPos !== null) {
    return indexedPos
  }

  const candidates = [
    args.field.closest('.rich-text-math'),
    args.field.closest('.rich-text-math-frame'),
    args.field
  ]

  for (const candidate of candidates) {
    if (!(candidate instanceof Node)) {
      continue
    }

    try {
      return args.editorView.posAtDOM(candidate, 0, -1)
    } catch {
      continue
    }
  }

  return null
}

function findMathNodePositionById(doc: ProseMirrorNode, mathNodeId: string) {
  if (!mathNodeId) {
    return null
  }

  let result: number | null = null
  doc.descendants((node, pos) => {
    if (
      (node.type.name === 'inlineMath' || node.type.name === 'blockMath') &&
      typeof node.attrs.mathNodeId === 'string' &&
      node.attrs.mathNodeId === mathNodeId
    ) {
      result = pos
      return false
    }

    return true
  })

  return result
}

function resolveMathMenuPoint(field: MathfieldElement) {
  const rect = field.getBoundingClientRect()
  return {
    x: rect.right + 8,
    y: rect.bottom + 8
  }
}

function SemanticBlockView(props: { node: { attrs: { title?: string | null } } }) {
  return (
    <NodeViewWrapper as="section" className="semantic-block">
      {props.node.attrs.title ? <div className="semantic-block-title">{props.node.attrs.title}</div> : null}
      <NodeViewContent className="semantic-block-content" />
    </NodeViewWrapper>
  )
}

function RichTextImageView(props: {
  node: { attrs: { src?: string; alt?: string; title?: string | null } }
  extension: { options: { documentPath?: string; mountedVaultPath?: string; remoteLibraryId?: string; remoteRevisionId?: string } }
}) {
  const { src = '', alt = '', title } = props.node.attrs
  const { documentPath, mountedVaultPath, remoteLibraryId, remoteRevisionId } = props.extension.options
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResolvedSrc(null)

    void resolveRichTextImageSrc({
      src,
      documentPath,
      mountedVaultPath,
      remoteLibraryId,
      remoteRevisionId
    })
      .then((nextSrc) => {
        if (!cancelled) {
          setResolvedSrc(nextSrc)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [documentPath, mountedVaultPath, remoteLibraryId, remoteRevisionId, src])
  if (!resolvedSrc) {
    return <NodeViewWrapper as="span" className="markdown-image-missing">{alt || src}</NodeViewWrapper>
  }

  return (
    <NodeViewWrapper as="span" className="rich-text-image-wrap">
      <img src={resolvedSrc} alt={alt} title={title ?? undefined} loading="lazy" />
    </NodeViewWrapper>
  )
}

function hexToRgba(color: string, alpha: number) {
  const trimmed = color.trim()
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = Number.parseInt(hex[0] + hex[0], 16)
    const g = Number.parseInt(hex[1] + hex[1], 16)
    const b = Number.parseInt(hex[2] + hex[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return `rgba(184, 77, 32, ${alpha})`
}
