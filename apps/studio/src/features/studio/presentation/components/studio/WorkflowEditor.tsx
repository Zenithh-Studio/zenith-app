'use client'

import { studioFetch } from '@/lib/studio-local-api'
import { getRecord, updateRecord } from '@/lib/studio-indexed-db'
import type { StudioRecord } from '@/lib/studio-indexed-db'

import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  Connection,
  EdgeLabelRenderer,
  EdgeProps,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  NodeResizeControl,
  NodeResizer,
  NodeToolbar,
  Position,
  SelectionMode,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react'
import {
  ArrowLeft,
  AudioLines,
  Brush,
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Code2,
  Copy,
  CopyPlus,
  Crop,
  Download,
  FileText,
  BookOpenText,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Hand,
  Keyboard,
  MousePointer2,
  LayoutGrid,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  Redo2,
  Undo2,
  WandSparkles,
  Settings2,
  LockKeyhole,
  UnlockKeyhole,
  Upload,
  Video,
  VolumeX,
  ZoomIn,
  X,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import {
  createContext,
  useCallback,
  useContext,
  useEffectEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from 'react'
import {
  defaultModelDuration,
  displayModelName,
  modelDurationOptions,
  modelSupportsAudioToggle,
  modelResolutionOptions,
  modelSupportsResolution,
  paletteNodeRegistry,
  providersFor,
  registryByType,
} from '@znith/contracts'
import type {
  ExecutionDocument,
  ExecutionLog,
  NodeExecutionRecord,
  WorkflowDocument,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowGroup,
  WorkflowNode,
} from '@znith/contracts'
import {
  cloneValue,
  imageAspectRatios,
  imageCountQuickOptions,
  imageResolutionOptions,
  imageSizeFromSettings,
  normalizeImageCount,
  readImageDimensions,
} from '@znith/utils'
import { WorkflowSidePanel } from './WorkflowSidePanel'
import {
  formatLocaleDate,
  formatLocaleNumber,
  useLocale,
} from '@/features/studio/shared/i18n/LocaleProvider'
import {
  ImageUtilitiesDialog,
  type DerivedImageAsset,
  type ImageToolAction,
} from './ImageUtilitiesDialog'
import {
  getNodeCapabilities,
  getNodePrimaryAction,
  getRegisteredNodeActions,
  type NodeActionState,
} from '@/features/studio/shared/lib/workflow-node-actions'
import { redactDiagnosticData } from '@/features/studio/shared/lib/node-diagnostics'
import { appVersion } from '@/lib/app-version'

type StudioNodeData = {
  workflowNode: WorkflowNode
  canvasGroup?: WorkflowGroup
  groupRun?: GroupRunSummary
  record?: NodeExecutionRecord
  executionLogs?: ExecutionLog[]
  mediaVersions?: MediaOutputVersion[]
  outputStale?: boolean
}
type StudioNode = Node<StudioNodeData, 'studioNode'>
type GroupRunSummary = {
  executionId: string
  status: ExecutionDocument['status']
  total: number
  complete: number
  failed: number
  running: number
}
type PendingNodeConnection = {
  nodeId: string
  handleId: string
  handleType: 'source' | 'target'
  dataType: string
  targetPortId: string
  position: { x: number; y: number }
}

type NodeToolbarPreferences = {
  showActionLabels: boolean
  hiddenQuickActions: string[]
}

const defaultNodeToolbarPreferences: NodeToolbarPreferences = {
  showActionLabels: false,
  hiddenQuickActions: [],
}
const defaultNodeToolbarPreferencesSnapshot = JSON.stringify(defaultNodeToolbarPreferences)
const nodeToolbarPreferenceSubscribers = new Set<() => void>()
let currentNodeToolbarPreferences = defaultNodeToolbarPreferences
let nodeToolbarPreferencesLoad: Promise<void> | undefined

function workflowEditorPreferences(settings: StudioRecord | null) {
  const uiPreferences = settings?.uiPreferences
  if (!uiPreferences || typeof uiPreferences !== 'object') return {}
  const workflowEditor = (uiPreferences as Record<string, unknown>).workflowEditor
  return workflowEditor && typeof workflowEditor === 'object'
    ? (workflowEditor as Record<string, unknown>)
    : {}
}

function publishNodeToolbarPreferences(preferences: NodeToolbarPreferences) {
  currentNodeToolbarPreferences = preferences
  nodeToolbarPreferenceSubscribers.forEach((subscriber) => subscriber())
}

function loadNodeToolbarPreferences() {
  if (nodeToolbarPreferencesLoad) return nodeToolbarPreferencesLoad
  nodeToolbarPreferencesLoad = (async () => {
    const settings = await getRecord('settings', 'current')
    const saved = workflowEditorPreferences(settings).nodeToolbar
    if (saved && typeof saved === 'object') {
      const value = saved as Partial<NodeToolbarPreferences>
      publishNodeToolbarPreferences({
        showActionLabels: value.showActionLabels === true,
        hiddenQuickActions: Array.isArray(value.hiddenQuickActions)
          ? value.hiddenQuickActions.filter((item): item is string => typeof item === 'string')
          : [],
      })
      return
    }

    if (typeof window === 'undefined') return
    const hasLegacy =
      window.localStorage.getItem('zenith:node-toolbar-labels') !== null ||
      window.localStorage.getItem('zenith:node-toolbar-hidden-actions') !== null
    if (!hasLegacy) return
    let hiddenQuickActions: string[] = []
    try {
      const legacy = JSON.parse(
        window.localStorage.getItem('zenith:node-toolbar-hidden-actions') || '[]',
      )
      if (Array.isArray(legacy))
        hiddenQuickActions = legacy.filter((item): item is string => typeof item === 'string')
    } catch {
      hiddenQuickActions = []
    }
    const preferences = {
      showActionLabels: window.localStorage.getItem('zenith:node-toolbar-labels') === 'true',
      hiddenQuickActions,
    }
    publishNodeToolbarPreferences(preferences)
    await saveWorkflowEditorPreferences({ nodeToolbar: preferences })
    window.localStorage.removeItem('zenith:node-toolbar-labels')
    window.localStorage.removeItem('zenith:node-toolbar-hidden-actions')
  })()
    .catch(() => undefined)
    .finally(() => {
      nodeToolbarPreferencesLoad = undefined
    })
  return nodeToolbarPreferencesLoad
}

function getNodeToolbarPreferencesSnapshot() {
  return JSON.stringify(currentNodeToolbarPreferences)
}

function subscribeNodeToolbarPreferences(onChange: () => void) {
  nodeToolbarPreferenceSubscribers.add(onChange)
  return () => {
    nodeToolbarPreferenceSubscribers.delete(onChange)
  }
}

async function saveWorkflowEditorPreferences(preferences: Record<string, unknown>) {
  await updateRecord<StudioRecord>('settings', 'current', (stored) => {
    const current = stored || { id: 'current' }
    const uiPreferences =
      current.uiPreferences && typeof current.uiPreferences === 'object'
        ? (current.uiPreferences as Record<string, unknown>)
        : {}
    const workflowEditor = workflowEditorPreferences(current)
    return {
      ...current,
      id: 'current',
      uiPreferences: { ...uiPreferences, workflowEditor: { ...workflowEditor, ...preferences } },
      updatedAt: new Date().toISOString(),
    }
  })
}

function saveNodeToolbarPreferences(preferences: NodeToolbarPreferences) {
  publishNodeToolbarPreferences(preferences)
  void saveWorkflowEditorPreferences({ nodeToolbar: preferences }).catch(() => undefined)
}

type MediaOutputVersion = {
  executionId: string
  createdAt: string
  prompt?: string
  provider?: string
  model?: string
  output: import('@znith/contracts').NodeValue
}

type NodeActionContextValue = {
  isWorkflowRunning: boolean
  renamingNodeId: string | null
  startRenameNode: (nodeId: string) => void
  saveNodeName: (nodeId: string, name: string) => void
  cancelRenameNode: () => void
  stopWorkflow: () => void
  checkVideoTask: (nodeId: string) => Promise<void>
  runNode: (nodeId: string, retry?: boolean) => void
  saveOutputToAssets: (nodeId: string, executionId?: string) => Promise<void>
  saveWorkflowUpload: (nodeId: string, assetId: string) => Promise<void>
  generateImageFromText: (nodeId: string) => void
  deleteNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void
  replaceMedia: (nodeId: string) => void
  selectNode: (nodeId: string) => void
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void
  resizeNode: (nodeId: string, width: number, height?: number) => void
  selectMediaVersion: (nodeId: string, output: import('@znith/contracts').NodeValue) => void
  addDerivedImages: (nodeId: string, action: ImageToolAction, assets: DerivedImageAsset[]) => void
  addTextNode: (content: string, sourceAssetId?: string) => void
  addReferenceInput: (targetNodeId: string, targetPortId: string) => void
  updateGroup: (groupId: string, patch: Partial<WorkflowGroup>) => void
  ungroup: (groupId: string) => void
  runGroup: (groupId: string) => void
  captureHistory: () => void
  markDirty: () => void
}

const NodeActionContext = createContext<NodeActionContextValue | null>(null)
const EdgeDeleteContext = createContext<((edgeId: string) => void) | null>(null)

type TextNodeEditorContextValue = {
  updateValue: (nodeId: string, value: string) => void
  finishEditing: (nodeId: string) => void
}

const TextNodeEditorContext = createContext<TextNodeEditorContextValue | null>(null)

const canvasImageAspectRatios = ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9']

const iconByType: Record<string, typeof FileText> = {
  'input.text': FileText,
  'input.prompt': MessageSquareText,
  'input.json': Braces,
  'processing.template': Code2,
  'processing.merge-text': Copy,
  'ai.generate-text': WandSparkles,
  'utility.delay': Clock3,
  'utility.debug': Zap,
  'output.preview': LayoutGrid,
  'input.image': ImageIcon,
  'input.video': Video,
  'input.audio': AudioLines,
  'ai.generate-audio': AudioLines,
  'ai.generate-image': Sparkles,
  'ai.edit-image': ImagePlus,
  'ai.generate-video': Video,
  'ai.image-to-video': Video,
  'ai.analyze-image': WandSparkles,
  'utility.note': StickyNote,
}

const categoryTone: Record<string, { icon: string; border: string; handle: string }> = {
  Input: { icon: 'bg-blue-50 text-blue-600', border: 'border-blue-100', handle: '!bg-blue-500' },
  AI: {
    icon: 'bg-violet-50 text-violet-600',
    border: 'border-violet-100',
    handle: '!bg-violet-500',
  },
  Processing: {
    icon: 'bg-amber-50 text-amber-600',
    border: 'border-amber-100',
    handle: '!bg-amber-500',
  },
  Output: {
    icon: 'bg-emerald-50 text-emerald-600',
    border: 'border-emerald-100',
    handle: '!bg-emerald-500',
  },
  Utility: { icon: 'bg-zinc-100 text-zinc-600', border: 'border-zinc-200', handle: '!bg-zinc-500' },
}

const portTone = {
  text: { icon: Type, className: '!bg-violet-600' },
  image: { icon: ImageIcon, className: '!bg-blue-500' },
  video: { icon: Video, className: '!bg-fuchsia-500' },
  audio: { icon: AudioLines, className: '!bg-emerald-600' },
  json: { icon: Braces, className: '!bg-amber-500' },
} as const

function nodeSlug(node: WorkflowNode) {
  return (
    node.slug ||
    `${node.type
      .split('.')
      .at(-1)
      ?.replaceAll(/[^a-z0-9]+/gi, '-')
      .toLowerCase()}-${node.id.slice(-4)}`
  )
}

function TypedHandles({ definition }: { definition: ReturnType<typeof registryByType.get> }) {
  const inputTypes = [...new Set((definition?.inputs ?? []).map((port) => port.dataType))]
  return (
    <>
      {inputTypes.map((dataType, index) => {
        const visual = portTone[dataType as keyof typeof portTone] ?? portTone.json
        const Icon = visual.icon
        return (
          <Handle
            key={dataType}
            id={`type-${dataType}`}
            type="target"
            position={Position.Left}
            style={{ top: 52 + index * 36, left: -18 }}
            className={`!z-20 !grid !size-7 !place-items-center !rounded-lg !border-2 !border-white !shadow-md ${visual.className}`}
            title={`${dataType} input`}
          >
            <Icon size={12} className="pointer-events-none text-white" />
          </Handle>
        )
      })}
      {definition?.outputs.map((port, index) => {
        const visual = portTone[port.dataType as keyof typeof portTone] ?? portTone.json
        const Icon = visual.icon
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={Position.Right}
            style={{ top: 52 + index * 36, right: -18 }}
            className={`!z-20 !grid !size-7 !place-items-center !rounded-lg !border-2 !border-white !shadow-md ${visual.className}`}
            title={`${port.name} · ${port.dataType}`}
          >
            <Icon size={12} className="pointer-events-none text-white" />
          </Handle>
        )
      })}
    </>
  )
}

function mediaSource(value: unknown, assetId?: unknown, fileName?: unknown) {
  const source = typeof value === 'string' ? value : ''
  if (!assetId) return source

  if (source) {
    try {
      const parsed = new URL(source, 'http://payload.local')
      if (parsed.pathname.startsWith('/api/media/file/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      // Fall back to the upload filename when the asset URL is malformed.
    }
  }

  return typeof fileName === 'string' && fileName
    ? `/api/media/file/${encodeURIComponent(fileName)}`
    : source
}

function imageRatioLabel(width: number, height: number) {
  const actualRatio = width / height
  const matchingPreset = canvasImageAspectRatios.find((ratio) => {
    const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
    const presetRatio = ratioWidth / ratioHeight
    return Math.abs(actualRatio - presetRatio) <= presetRatio * 0.01
  })
  if (matchingPreset) return matchingPreset

  const roundedWidth = Math.round(width)
  const roundedHeight = Math.round(height)
  let a = roundedWidth
  let b = roundedHeight
  while (b !== 0) [a, b] = [b, a % b]
  const divisor = Math.max(a, 1)
  return `${roundedWidth / divisor}:${roundedHeight / divisor}`
}

function nextOutputRevision() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function NodeRunIndicator({ status }: { status?: NodeActionState }) {
  const { t } = useLocale()
  const indicator = (
    Icon: typeof LoaderCircle,
    label: string,
    className: string,
    iconClassName = '',
  ) => (
    <span
      role="img"
      aria-label={t(label)}
      title={t(label)}
      className={`ml-1 grid size-5 shrink-0 place-items-center rounded-full ${className}`}
    >
      <Icon size={13} className={iconClassName} />
    </span>
  )

  if (status === 'running') {
    return indicator(LoaderCircle, 'Running', 'bg-violet-50 text-violet-700', 'animate-spin')
  }
  if (status === 'queued') {
    return indicator(Clock3, 'Queued', 'bg-zinc-100 text-zinc-500')
  }
  if (status === 'pending') {
    return indicator(Clock3, 'Pending', 'bg-amber-50 text-amber-700')
  }
  if (status === 'waiting_for_input') {
    return indicator(Clock3, 'Waiting for input', 'bg-amber-50 text-amber-700')
  }
  if (status === 'succeeded') {
    return indicator(Check, 'Succeeded', 'bg-emerald-50 text-emerald-700')
  }
  if (status === 'failed') {
    return indicator(CircleAlert, 'Failed', 'bg-rose-50 text-rose-700')
  }
  if (status === 'skipped') {
    return indicator(CircleAlert, 'Skipped', 'bg-amber-50 text-amber-700')
  }
  if (status === 'cancelled') {
    return indicator(X, 'Cancelled', 'bg-zinc-100 text-zinc-500')
  }
  if (status === 'interrupted') {
    return indicator(CircleAlert, 'Interrupted', 'bg-orange-50 text-orange-700')
  }
  return <GripVertical size={15} className="shrink-0 text-zinc-400" />
}

function mediaNodeValue(value: unknown, expectedType?: string) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.type !== 'image' && candidate.type !== 'video' && candidate.type !== 'audio')
    return undefined
  if (expectedType && candidate.type !== expectedType) return undefined
  return candidate as unknown as import('@znith/contracts').NodeValue
}

function mediaOutputURL(output?: import('@znith/contracts').NodeValue) {
  const value = output?.value
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const url = (value as Record<string, unknown>).url
    return typeof url === 'string' ? url : ''
  }
  return ''
}

function isMediaOutputStale(node: WorkflowNode, executions: ExecutionDocument[]) {
  if (
    !['ai.generate-image', 'ai.edit-image', 'ai.generate-video', 'ai.image-to-video'].includes(
      node.type,
    )
  ) {
    return false
  }

  const latestSuccessfulOutput = [...executions]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .find((execution) => {
      const record = execution.nodeRecords?.find(
        (item) => item.nodeId === node.id && item.status === 'succeeded',
      )
      return Object.values(record?.outputs ?? {}).some(
        (output) => output.type === 'image' || output.type === 'video' || output.type === 'audio',
      )
    })
  if (!latestSuccessfulOutput) return false

  const executedNode = latestSuccessfulOutput.snapshot.nodes.find((item) => item.id === node.id)
  const previousRevision = String(executedNode?.config.outputRevision || '')
  const currentRevision = String(node.config.outputRevision || '')
  if (previousRevision !== currentRevision) return true

  const previousRatio = String(executedNode?.config.aspectRatio || '')
  const currentRatio = String(node.config.aspectRatio || '')
  return previousRatio !== currentRatio
}

type ModelOption = {
  value: string
  providerId: string
  providerName: string
  model: string
  modelName: string
}

function ModelSelector({
  value,
  options,
  onChange,
}: {
  value: string
  options: ModelOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 12, width: 380 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)
  const filtered = options.filter((option) =>
    `${option.providerName} ${option.modelName} ${option.model}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as globalThis.Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const showMenu = () => {
    const bounds = trigger.current?.getBoundingClientRect()
    if (!bounds) return
    const width = Math.min(440, window.innerWidth - 24)
    const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))
    const top = Math.max(12, Math.min(bounds.bottom + 6, window.innerHeight - 400))
    setPosition({ top, left, width })
    setSearch('')
    setOpen(true)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Choose model"
        aria-expanded={open}
        onClick={showMenu}
        className="flex h-8 max-w-48 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
        title={selected ? `${selected.providerName} · ${selected.modelName}` : 'Choose model'}
      >
        <span className="truncate">{selected?.modelName || 'Select model'}</span>
        <ChevronDown size={13} className="shrink-0 text-zinc-500" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="dialog"
            aria-label="Select a model"
            className="fixed z-[120] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_12px_35px_rgba(24,24,27,.2)]"
            style={{ top: position.top, left: position.left, width: position.width }}
          >
            <label className="relative block p-2">
              <Search
                size={15}
                className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                autoFocus
                aria-label="Search all models"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search all models…"
                className="h-10 w-full rounded-lg bg-zinc-100 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
            </label>
            <div className="max-h-80 overflow-y-auto px-2 pb-2">
              {filtered.map((option) => {
                const active = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${active ? 'bg-violet-50' : 'hover:bg-zinc-100'}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-800">
                      {option.providerName === 'Google Gemini'
                        ? 'G'
                        : option.providerName.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">
                        {option.modelName}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {option.providerName}
                      </span>
                    </span>
                    {active && <Check size={15} className="shrink-0 text-violet-700" />}
                  </button>
                )
              })}
              {!filtered.length && (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">No matching models</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function NodeActionToolbar({
  workflowNode,
  record,
  selected,
  hovered,
  mediaVersions = [],
  onToolbarPointerEnter,
  onToolbarPointerLeave,
  aspectRatioValue,
  videoRef,
  onOpenPreview,
}: {
  workflowNode: WorkflowNode
  record?: NodeExecutionRecord
  selected: boolean
  hovered: boolean
  mediaVersions?: MediaOutputVersion[]
  onToolbarPointerEnter: () => void
  onToolbarPointerLeave: () => void
  aspectRatioValue?: string
  videoRef?: { current: HTMLVideoElement | null }
  onOpenPreview?: () => void
}) {
  const { t } = useLocale()
  const actions = useContext(NodeActionContext)
  const [moreOpen, setMoreOpen] = useState(false)
  const [checkingTask, setCheckingTask] = useState(false)
  const [savingOutput, setSavingOutput] = useState(false)
  const [imageToolsOpen, setImageToolsOpen] = useState(false)
  const [activeImageTool, setActiveImageTool] = useState<ImageToolAction>('crop')
  const [frameMode, setFrameMode] = useState<'first' | 'current' | 'last'>('current')
  const [capturingFrame, setCapturingFrame] = useState(false)
  const [frameMessage, setFrameMessage] = useState('')
  const toolbarPreferencesSnapshot = useSyncExternalStore(
    subscribeNodeToolbarPreferences,
    getNodeToolbarPreferencesSnapshot,
    () => defaultNodeToolbarPreferencesSnapshot,
  )
  useEffect(() => {
    void loadNodeToolbarPreferences()
  }, [])
  const nodeToolbarPreferences = JSON.parse(toolbarPreferencesSnapshot) as NodeToolbarPreferences
  const { showActionLabels, hiddenQuickActions } = nodeToolbarPreferences
  const [copyPromptMessage, setCopyPromptMessage] = useState('')
  const [textAssetSave, setTextAssetSave] = useState<{
    value: string
    status: 'saving' | 'saved' | 'error'
    error?: string
  } | null>(null)
  const config = workflowNode.config
  const type = workflowNode.type
  useEffect(() => {
    if (!moreOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [moreOpen])
  if (!actions) return null

  const nodeCapabilities = getNodeCapabilities(type)
  const modality = nodeCapabilities?.modality || 'text'
  const providerId = String(
    config.provider ||
      (modality === 'video' ? 'muse2api' : modality === 'image' ? 'chatgpt2api' : 'openai'),
  )
  const model = String(config.model || '')
  const providerModels = providersFor(modality).flatMap((provider) =>
    (provider.models[modality] ?? []).map((providerModel) => ({
      value: `${provider.id}::${providerModel}`,
      providerId: provider.id,
      providerName: provider.name,
      model: providerModel,
      modelName: displayModelName(providerModel),
    })),
  )
  const selectedModelValue = `${providerId}::${model}`
  const modelOptions = providerModels.some((option) => option.value === selectedModelValue)
    ? providerModels
    : [
        {
          value: selectedModelValue,
          providerId,
          providerName: providerId,
          model: model || 'Default model',
          modelName: model || 'Default model',
        },
        ...providerModels,
      ]
  const selectedOutput = mediaNodeValue(config.selectedOutput)
  const isInputMedia = type === 'input.image' || type === 'input.video' || type === 'input.audio'
  const inputOutput =
    isInputMedia && config.url
      ? ({
          type: type === 'input.image' ? 'image' : type === 'input.audio' ? 'audio' : 'video',
          value: { url: config.url },
          assetId: config.assetId,
        } as import('@znith/contracts').NodeValue)
      : undefined
  const output =
    selectedOutput ??
    Object.values(record?.outputs ?? {})
      .map((value) => mediaNodeValue(value))
      .find(Boolean) ??
    inputOutput
  const textOutput = Object.values(record?.outputs ?? {}).find((value) => value.type === 'text')
  const downloadURL = mediaOutputURL(output)
  const imageAssetId = String(output?.assetId || output?.metadata?.assetId || '')
  const imageToolsURL =
    output?.type === 'image' && imageAssetId
      ? mediaSource(
          downloadURL,
          imageAssetId,
          String(output?.metadata?.filename || output?.metadata?.fileName || ''),
        )
      : ''
  const outputText = typeof textOutput?.value === 'string' ? textOutput.value : ''
  const isAI = nodeCapabilities?.generator === true
  const isVideoGenerator = isAI && nodeCapabilities?.modality === 'video'
  const referenceInputPorts = [
    'ai.generate-image',
    'ai.edit-image',
    'ai.generate-video',
    'ai.image-to-video',
  ].includes(type)
    ? (registryByType
        .get(type)
        ?.inputs.filter((port) => ['image', 'video', 'audio'].includes(port.dataType)) ?? [])
    : []
  const isVideoTaskPending = Boolean(
    isVideoGenerator &&
    record?.providerTask?.taskId &&
    !['succeeded', 'failed', 'cancelled'].includes(record.status),
  )
  const primaryAction = getNodePrimaryAction(
    type,
    record?.status as NodeActionState | undefined,
    isVideoTaskPending,
    actions.isWorkflowRunning,
  )
  const currentMediaVersion = mediaVersions.find((version) => {
    const versionAsset = version.output.assetId || version.output.metadata?.assetId
    const outputAsset = output?.assetId || output?.metadata?.assetId
    return (
      (versionAsset && outputAsset && String(versionAsset) === String(outputAsset)) ||
      (mediaOutputURL(version.output) && mediaOutputURL(version.output) === mediaOutputURL(output))
    )
  })
  const registeredActions = getRegisteredNodeActions({
    nodeType: type,
    status: record?.status as NodeActionState | undefined,
    isVideoTaskPending,
    isWorkflowRunning: actions.isWorkflowRunning,
    hasOutput: Boolean(output || outputText),
    hasText: Boolean(
      (type === 'input.text' || type === 'input.prompt') && String(config.value || '').trim(),
    ),
    hasPrompt: Boolean(currentMediaVersion?.prompt),
    hasImageOutput: output?.type === 'image',
    hasSavedImage: Boolean(imageAssetId),
    hasMediaOutput: Boolean(output && ['image', 'video', 'audio'].includes(output.type)),
    hasSavedOutput: Boolean(
      !config.workflowUpload && (output?.assetId || output?.metadata?.assetId),
    ),
  })
  const saveOutputAction = registeredActions.find((item) => item.id === 'save-to-assets')
  const imageToolsAction = registeredActions.find((item) => item.id === 'image-tools')
  const openImageTool = (action: ImageToolAction) => {
    setActiveImageTool(action)
    setImageToolsOpen(true)
  }
  const replaceInputAction = registeredActions.find((item) => item.id === 'replace-input')
  const copyPromptAction = registeredActions.find((item) => item.id === 'copy-prompt')
  const generateImageFromTextAction = registeredActions.find(
    (item) => item.id === 'generate-image-from-text',
  )
  const copyOutputPrompt = async () => {
    const prompt = currentMediaVersion?.prompt
    if (!prompt) {
      setCopyPromptMessage('No prompt was saved for this output.')
      return
    }
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyPromptMessage('Prompt copied.')
    } catch {
      setCopyPromptMessage('Clipboard access is unavailable.')
    }
  }
  const resolutionOptions = modelResolutionOptions(providerId, model)
  const supportsResolution = modelSupportsResolution(providerId, model)
  const supportsAudioToggle = modelSupportsAudioToggle(providerId, model)
  const durationOptions = modelDurationOptions(providerId, model)
  const canRunNode = isAI
  const ratioOptions = [
    ...new Set(
      [...imageAspectRatios, aspectRatioValue].filter((ratio): ratio is string => Boolean(ratio)),
    ),
  ]

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()
  const update = (patch: Record<string, unknown>) =>
    actions.updateNodeConfig(workflowNode.id, patch)
  const copyOutput = () => {
    if (outputText) void navigator.clipboard?.writeText(outputText)
  }
  const copyTextInput = async () => {
    const text = String(config.value || '')
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyPromptMessage('Prompt copied.')
    } catch {
      setCopyPromptMessage('Clipboard access is unavailable.')
    }
  }
  const captureVideoFrame = async () => {
    const video = videoRef?.current
    if (!video || !imageAssetId || !video.videoWidth || !video.videoHeight) {
      setFrameMessage('Load a saved video before capturing a frame.')
      return
    }
    if (frameMode === 'last' && !Number.isFinite(video.duration)) {
      setFrameMessage('The video duration is unavailable.')
      return
    }
    setCapturingFrame(true)
    setFrameMessage('')
    const originalTime = video.currentTime
    const wasPlaying = !video.paused
    try {
      video.pause()
      const timestampSeconds =
        frameMode === 'first'
          ? 0
          : frameMode === 'last'
            ? Math.max(0, video.duration - 0.05)
            : originalTime
      if (Math.abs(timestampSeconds - originalTime) > 0.01) {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('error', onError)
            resolve()
          }
          const onError = () => {
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('error', onError)
            reject(new Error('The video could not seek to the requested frame.'))
          }
          video.addEventListener('seeked', onSeeked, { once: true })
          video.addEventListener('error', onError, { once: true })
          video.currentTime = timestampSeconds
        })
      }
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('The browser could not prepare the frame image.')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('The browser could not encode the captured frame.')
      const filename = `${workflowNode.slug}-${frameMode}-frame.png`
      const form = new FormData()
      form.set('sourceVideoAssetId', imageAssetId)
      form.set('captureMode', frameMode)
      form.set('timestampSeconds', String(timestampSeconds))
      form.set('file', new File([blob], filename, { type: 'image/png' }))
      const response = await studioFetch('/api/studio/video-frames', { method: 'POST', body: form })
      const body = (await response.json()) as {
        media?: {
          id: string
          url?: string | null
          filename?: string | null
          mimeType?: string | null
          derivedMetadata?: Record<string, unknown>
        }
        error?: string
      }
      if (!response.ok || !body.media)
        throw new Error(body.error || 'The frame could not be saved.')
      actions.addDerivedImages(workflowNode.id, 'capture-frame', [
        {
          id: body.media.id,
          url: body.media.url,
          filename: body.media.filename || filename,
          mimeType: body.media.mimeType || 'image/png',
          alt: `${workflowNode.name} · ${frameMode} frame`,
          derivedMetadata: body.media.derivedMetadata,
        },
      ])
      setFrameMessage('Frame saved to Assets and added to the canvas.')
    } catch (failure) {
      setFrameMessage(
        failure instanceof Error ? failure.message : 'The video frame could not be captured.',
      )
    } finally {
      if (Math.abs(video.currentTime - originalTime) > 0.01) video.currentTime = originalTime
      if (wasPlaying) void video.play().catch(() => undefined)
      setCapturingFrame(false)
    }
  }
  const toggleQuickAction = (id: string) => {
    const next = hiddenQuickActions.includes(id)
      ? hiddenQuickActions.filter((item) => item !== id)
      : [...hiddenQuickActions, id]
    saveNodeToolbarPreferences({
      ...nodeToolbarPreferences,
      showActionLabels,
      hiddenQuickActions: next,
    })
  }
  const toggleActionLabels = () => {
    saveNodeToolbarPreferences({
      showActionLabels: !showActionLabels,
      hiddenQuickActions,
    })
  }
  const copyDiagnostics = () => {
    void navigator.clipboard?.writeText(
      JSON.stringify(
        {
          id: workflowNode.id,
          type: workflowNode.type,
          version: registryByType.get(workflowNode.type)?.version,
          status: record?.status || 'idle',
          config: redactDiagnosticData(config),
          error: record?.error || undefined,
        },
        null,
        2,
      ),
    )
    setMoreOpen(false)
  }
  const saveTextOutput = async () => {
    if (!outputText) return
    setTextAssetSave({ value: outputText, status: 'saving' })
    try {
      const response = await studioFetch('/api/studio/text-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: workflowNode.name,
          content: outputText,
          source: 'workflow',
          sourceId: workflowNode.id,
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Text output could not be saved to Assets.')
      setTextAssetSave({ value: outputText, status: 'saved' })
    } catch (error) {
      setTextAssetSave({
        value: outputText,
        status: 'error',
        error: error instanceof Error ? error.message : 'Text output could not be saved to Assets.',
      })
    }
  }

  return (
    <>
      <NodeToolbar
        nodeId={workflowNode.id}
        isVisible={selected || hovered}
        position={Position.Bottom}
        align="center"
        offset={10}
        className="nodrag nowheel !z-50"
      >
        <div
          className="nodrag nowheel flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white/95 p-1 shadow-[0_8px_20px_rgba(24,24,27,.14)]"
          onPointerDown={stop}
          onClick={stop}
          role="toolbar"
          aria-label={`${workflowNode.name} actions`}
          onPointerEnter={onToolbarPointerEnter}
          onPointerLeave={onToolbarPointerLeave}
        >
          {isAI && (
            <label
              className="flex h-7 max-w-40 items-center border-r border-zinc-200 pr-1"
              title={t('Choose the provider and model used by this node.')}
            >
              <span className="sr-only">{t('Provider and model')}</span>
              <ModelSelector
                value={selectedModelValue}
                options={modelOptions}
                onChange={(value) => {
                  const [provider, ...modelParts] = value.split('::')
                  const nextModel = modelParts.join('::')
                  const nextDurationOptions = modelDurationOptions(provider, nextModel)
                  const nextResolutionOptions = modelResolutionOptions(provider, nextModel)
                  update({
                    provider,
                    model: nextModel,
                    ...(isVideoGenerator
                      ? {
                          duration: nextDurationOptions.includes(Number(config.duration))
                            ? Number(config.duration)
                            : defaultModelDuration(provider, nextModel),
                          resolution: nextResolutionOptions.includes(String(config.resolution))
                            ? config.resolution
                            : (nextResolutionOptions[0] ?? '720p'),
                          selectedOutput: null,
                          outputRevision: nextOutputRevision(),
                        }
                      : {}),
                  })
                }}
              />
            </label>
          )}
          {'aspectRatio' in config && (
            <label
              className="flex h-7 items-center"
              title={t(
                'Choose the aspect ratio used for the next run. Changing it clears the current output.',
              )}
            >
              <span className="sr-only">{t('Aspect ratio')}</span>
              <select
                aria-label={t('Aspect ratio')}
                value={aspectRatioValue || String(config.aspectRatio || '1:1')}
                onChange={(event) =>
                  update({
                    aspectRatio: event.target.value,
                    selectedOutput: null,
                    outputRevision: nextOutputRevision(),
                  })
                }
                className="h-7 cursor-pointer rounded-lg bg-transparent px-1.5 text-[10px] font-medium text-zinc-700 outline-none hover:bg-zinc-100"
              >
                {ratioOptions.map((ratio) => (
                  <option key={ratio}>{ratio}</option>
                ))}
              </select>
            </label>
          )}
          {aspectRatioValue !== undefined ? (
            <button
              type="button"
              aria-label={
                config.lockImageAspectRatio === false ? 'Lock image ratio' : 'Free image resize'
              }
              aria-pressed={config.lockImageAspectRatio !== false}
              title={
                config.lockImageAspectRatio === false
                  ? 'Lock resize to the image’s original display ratio.'
                  : 'Allow free resizing of the image node.'
              }
              onClick={() =>
                update({
                  lockImageAspectRatio: config.lockImageAspectRatio === false,
                  displayHeight: 0,
                })
              }
              className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              {config.lockImageAspectRatio === false ? (
                <UnlockKeyhole size={14} />
              ) : (
                <LockKeyhole size={14} />
              )}
            </button>
          ) : null}
          {'quality' in config && (
            <label
              className="flex h-7 items-center"
              title={t('Choose the generated image quality.')}
            >
              <span className="sr-only">{t('Quality')}</span>
              <select
                aria-label={t('Quality')}
                value={String(config.quality || 'standard')}
                onChange={(event) => update({ quality: event.target.value })}
                className="h-7 cursor-pointer rounded-lg bg-transparent px-1.5 text-[10px] font-medium text-zinc-700 outline-none hover:bg-zinc-100"
              >
                {['draft', 'standard', 'high'].map((quality) => (
                  <option key={quality}>{t(quality)}</option>
                ))}
              </select>
            </label>
          )}
          {'duration' in config && (
            <label
              className="flex h-7 items-center"
              title={t('Set the generated video duration in seconds.')}
            >
              <span className="sr-only">{t('Duration')}</span>
              <select
                aria-label={t('Duration')}
                value={String(
                  durationOptions.includes(Number(config.duration))
                    ? Number(config.duration)
                    : (durationOptions[0] ?? 5),
                )}
                onChange={(event) => update({ duration: Number(event.target.value) })}
                className="h-7 cursor-pointer rounded-lg bg-transparent px-1.5 text-[10px] font-medium text-zinc-700 outline-none hover:bg-zinc-100"
              >
                {durationOptions.map((duration) => (
                  <option key={duration} value={duration}>
                    {t('{count} seconds', { count: duration })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isVideoGenerator && (
            <label
              className="flex h-7 items-center"
              title={
                supportsResolution
                  ? t('Choose the generated video resolution.')
                  : t('Resolution is not configurable for this model.')
              }
            >
              <span className="sr-only">{t('Video resolution')}</span>
              <select
                aria-label={t('Video resolution')}
                value={String(config.resolution || '720p')}
                disabled={!supportsResolution}
                onChange={(event) =>
                  update({
                    resolution: event.target.value,
                    selectedOutput: null,
                    outputRevision: nextOutputRevision(),
                  })
                }
                className="h-7 cursor-pointer rounded-lg bg-transparent px-1.5 text-[10px] font-medium text-zinc-700 outline-none hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {['480p', '720p', '1080p'].map((resolution) => (
                  <option
                    key={resolution}
                    value={resolution}
                    disabled={!resolutionOptions.includes(resolution)}
                  >
                    {resolution}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isVideoGenerator && supportsAudioToggle && (
            <button
              type="button"
              aria-label="Generate audio"
              aria-pressed={config.generateAudio !== false}
              title={
                config.generateAudio === false
                  ? 'Audio generation is off.'
                  : 'Audio generation is on.'
              }
              onClick={() =>
                update({
                  generateAudio: config.generateAudio === false,
                  selectedOutput: null,
                  outputRevision: nextOutputRevision(),
                })
              }
              className={`grid size-7 shrink-0 place-items-center rounded-md ${config.generateAudio === false ? 'text-zinc-400 hover:bg-zinc-100' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}
            >
              {config.generateAudio === false ? <VolumeX size={14} /> : <AudioLines size={14} />}
            </button>
          )}
          {canRunNode && primaryAction !== 'none' && (
            <button
              type="button"
              title={
                primaryAction === 'check-status'
                  ? t('Check the saved provider task without creating a new video.')
                  : primaryAction === 'retry'
                    ? t(
                        'Retry with current settings; the previous execution snapshot remains in history.',
                      )
                    : primaryAction === 'cancel'
                      ? t('Stop the active workflow run.')
                      : t('Run this node with its connected dependencies.')
              }
              aria-label={
                primaryAction === 'check-status'
                  ? t('Check video task status')
                  : primaryAction === 'retry'
                    ? t('Retry node with current settings')
                    : primaryAction === 'cancel'
                      ? t('Stop active run')
                      : t('Run node')
              }
              disabled={
                primaryAction === 'check-status'
                  ? checkingTask
                  : primaryAction === 'cancel'
                    ? false
                    : actions.isWorkflowRunning
              }
              onClick={async () => {
                if (primaryAction === 'cancel') actions.stopWorkflow()
                else if (primaryAction === 'check-status') {
                  setCheckingTask(true)
                  try {
                    await actions.checkVideoTask(workflowNode.id)
                  } finally {
                    setCheckingTask(false)
                  }
                } else actions.runNode(workflowNode.id, primaryAction === 'retry')
              }}
              className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-white disabled:cursor-not-allowed disabled:opacity-45 ${primaryAction === 'cancel' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-zinc-900 hover:bg-violet-700'}`}
            >
              {primaryAction === 'check-status' ? (
                <RefreshCw size={13} className={checkingTask ? 'animate-spin' : ''} />
              ) : primaryAction === 'cancel' ? (
                <X size={13} />
              ) : primaryAction === 'retry' ? (
                <RefreshCw size={13} />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
              {showActionLabels && (
                <span className="text-[9px] font-medium">
                  {primaryAction === 'check-status'
                    ? checkingTask
                      ? t('Checking')
                      : t('Check status')
                    : primaryAction === 'cancel'
                      ? t('Stop active run')
                      : primaryAction === 'retry'
                        ? 'Retry'
                        : 'Run'}
                </span>
              )}
            </button>
          )}
          {downloadURL && !hiddenQuickActions.includes('download') && (
            <a
              href={mediaSource(
                downloadURL,
                (mediaNodeValue(config.selectedOutput) ?? output)?.assetId,
              )}
              download
              target="_blank"
              rel="noreferrer"
              title={t('Download the currently displayed media output.')}
              aria-label={t('Download media output')}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100"
            >
              <Download size={14} />
              {showActionLabels && <span className="text-[9px]">Download</span>}
            </a>
          )}
          {saveOutputAction ? (
            <button
              type="button"
              title={t(saveOutputAction.disabledReason || 'Save this output to your Assets.')}
              aria-label={t('Save output to Assets')}
              disabled={saveOutputAction.disabled || savingOutput}
              onClick={async () => {
                setSavingOutput(true)
                try {
                  const uploadedAssetId = String(output?.assetId || output?.metadata?.assetId || '')
                  if (workflowNode.config.workflowUpload && uploadedAssetId) {
                    await actions.saveWorkflowUpload(workflowNode.id, uploadedAssetId)
                  } else {
                    await actions.saveOutputToAssets(
                      workflowNode.id,
                      currentMediaVersion?.executionId,
                    )
                  }
                } finally {
                  setSavingOutput(false)
                }
              }}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {savingOutput ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {showActionLabels && (
                <span className="text-[9px]">{savingOutput ? t('Saving') : t('Save')}</span>
              )}
            </button>
          ) : null}
          {(type === 'ai.generate-image' || type === 'ai.edit-image') &&
          !hiddenQuickActions.includes('prompt') ? (
            <button
              type="button"
              title={
                currentMediaVersion?.prompt
                  ? t('Copy the prompt saved with this image output.')
                  : t('No prompt was saved with this output.')
              }
              aria-label={t('Copy prompt for this image output')}
              onClick={() => void copyOutputPrompt()}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              <Copy size={14} />
              {showActionLabels && <span className="text-[9px]">Prompt</span>}
            </button>
          ) : null}
          {output?.type === 'image' ? (
            <>
              {!hiddenQuickActions.includes('mask-edit') ? (
                <button
                  type="button"
                  title={t('Paint a Mask')}
                  aria-label={t('Paint a Mask')}
                  disabled={imageToolsAction?.disabled}
                  onClick={() => openImageTool('mask-edit')}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Brush size={14} />
                  {showActionLabels && <span className="text-[9px]">{t('Paint a Mask')}</span>}
                </button>
              ) : null}
              {!hiddenQuickActions.includes('crop') ? (
                <button
                  type="button"
                  title={t('Crop image')}
                  aria-label={t('Crop image')}
                  disabled={imageToolsAction?.disabled}
                  onClick={() => openImageTool('crop')}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Crop size={14} />
                  {showActionLabels && <span className="text-[9px]">{t('Crop image')}</span>}
                </button>
              ) : null}
              {!hiddenQuickActions.includes('upscale') ? (
                <button
                  type="button"
                  title={t('Increase image resolution')}
                  aria-label={t('Increase image resolution')}
                  disabled={imageToolsAction?.disabled}
                  onClick={() => openImageTool('upscale')}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ZoomIn size={14} />
                  {showActionLabels && (
                    <span className="text-[9px]">{t('Increase resolution')}</span>
                  )}
                </button>
              ) : null}
              {!hiddenQuickActions.includes('image-detail') ? (
                <button
                  type="button"
                  title={t('View image detail')}
                  aria-label={t('View image detail')}
                  disabled={!downloadURL || !onOpenPreview}
                  onClick={() => onOpenPreview?.()}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Maximize2 size={14} />
                  {showActionLabels && <span className="text-[9px]">{t('View detail')}</span>}
                </button>
              ) : null}
            </>
          ) : null}
          {copyPromptAction && ['input.text', 'input.prompt'].includes(type) ? (
            <button
              type="button"
              title={t(copyPromptAction.disabledReason || 'Copy this text prompt.')}
              aria-label={t('Copy prompt')}
              disabled={copyPromptAction.disabled}
              onClick={() => void copyTextInput()}
              className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Copy size={14} />
            </button>
          ) : null}
          {copyPromptMessage && (
            <span role="status" className="max-w-32 truncate text-[9px] text-zinc-500">
              {copyPromptMessage}
            </span>
          )}
          {outputText && (
            <>
              <button
                type="button"
                title="Copy the latest text output."
                aria-label="Copy text output"
                onClick={copyOutput}
                className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                title={
                  textAssetSave?.value === outputText && textAssetSave.status === 'saved'
                    ? 'Text output saved to Assets.'
                    : 'Save this text output to Assets.'
                }
                aria-label="Save text output to Assets"
                disabled={textAssetSave?.value === outputText && textAssetSave.status === 'saving'}
                onClick={() => void saveTextOutput()}
                className={`grid size-7 shrink-0 place-items-center rounded-md ${textAssetSave?.value === outputText && textAssetSave.status === 'saved' ? 'bg-emerald-50 text-emerald-700' : textAssetSave?.value === outputText && textAssetSave.status === 'error' ? 'bg-rose-50 text-rose-700' : 'text-zinc-600 hover:bg-zinc-100'} disabled:opacity-45`}
              >
                {textAssetSave?.value === outputText && textAssetSave.status === 'saved' ? (
                  <Check size={14} />
                ) : (
                  <FileText size={14} />
                )}
              </button>
              {textAssetSave?.value === outputText && textAssetSave.status === 'error' ? (
                <span
                  role="status"
                  title={textAssetSave.error}
                  className="max-w-40 truncate text-[10px] text-rose-700"
                >
                  {textAssetSave.error}
                </span>
              ) : null}
            </>
          )}
          {generateImageFromTextAction ? (
            <button
              type="button"
              title={
                generateImageFromTextAction.disabledReason ||
                'Create a connected image generation node from this text.'
              }
              aria-label="Generate image from this text"
              disabled={generateImageFromTextAction.disabled || actions.isWorkflowRunning}
              onClick={() => actions.generateImageFromText(workflowNode.id)}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles size={14} />
              {showActionLabels && <span className="text-[9px]">Image</span>}
            </button>
          ) : null}
          {['input.text', 'input.prompt'].includes(type) ? (
            <>
              <button
                type="button"
                title="Zoom text out."
                aria-label="Zoom text out"
                onClick={() => update({ fontSize: Number(config.fontSize || 12) - 1 })}
                className="grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100"
              >
                A−
              </button>
              <button
                type="button"
                title="Zoom text in."
                aria-label="Zoom text in"
                onClick={() => update({ fontSize: Number(config.fontSize || 12) + 1 })}
                className="grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100"
              >
                A+
              </button>
            </>
          ) : null}
          {Boolean(config.selectedOutput) && !hiddenQuickActions.includes('fresh') && (
            <button
              type="button"
              title="Clear this saved version so the next run generates a fresh result."
              aria-label="Generate a fresh output on next run"
              onClick={() => update({ selectedOutput: null })}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-violet-700 hover:bg-violet-50"
            >
              <RefreshCw size={14} />
              {showActionLabels && <span className="text-[9px]">Fresh</span>}
            </button>
          )}
          {isInputMedia && (
            <>
              {replaceInputAction ? (
                <button
                  type="button"
                  title={replaceInputAction.disabledReason || 'Upload or replace this media input.'}
                  aria-label={
                    workflowNode.config.url ? 'Replace media input' : 'Upload media input'
                  }
                  disabled={replaceInputAction.disabled || actions.isWorkflowRunning}
                  onClick={() => actions.replaceMedia(workflowNode.id)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Upload size={14} />
                </button>
              ) : null}
              <button
                type="button"
                title="Open media settings to upload or replace the input."
                aria-label="Open media settings"
                onClick={() => actions.selectNode(workflowNode.id)}
                className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100"
              >
                <Settings2 size={14} />
              </button>
            </>
          )}
          <div className="relative ml-0.5 border-l border-zinc-200 pl-1">
            <button
              type="button"
              title="More node actions"
              aria-label="More node actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              <MoreHorizontal size={15} />
            </button>
            {moreOpen && (
              <div
                role="menu"
                aria-label="More node actions"
                className="absolute bottom-9 right-0 z-[80] max-h-[min(70vh,420px)] w-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 text-xs text-zinc-700 shadow-2xl"
              >
                <MenuItem
                  icon={CircleAlert}
                  label="Info"
                  onClick={() => {
                    actions.selectNode(workflowNode.id)
                    setMoreOpen(false)
                  }}
                />
                <MenuItem
                  icon={Type}
                  label={t('Rename node')}
                  onClick={() => {
                    actions.startRenameNode(workflowNode.id)
                    setMoreOpen(false)
                  }}
                />
                {referenceInputPorts.length ? (
                  <>
                    <div className="my-1.5 border-t border-zinc-100" />
                    <p className="px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      {t('Add reference input')}
                    </p>
                    {referenceInputPorts.map((port) => (
                      <MenuItem
                        key={port.id}
                        icon={
                          port.dataType === 'image'
                            ? ImageIcon
                            : port.dataType === 'video'
                              ? Video
                              : AudioLines
                        }
                        label={
                          port.dataType === 'audio'
                            ? t('Voice input')
                            : t('{name} input', { name: port.name.replace(/s$/, '') })
                        }
                        onClick={() => {
                          actions.addReferenceInput(workflowNode.id, port.id)
                          setMoreOpen(false)
                        }}
                      />
                    ))}
                  </>
                ) : null}
                {type === 'input.video' || output?.type === 'video' ? (
                  <>
                    <label className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[10px] text-zinc-600">
                      <span>Frame source</span>
                      <select
                        aria-label="Video frame source"
                        value={frameMode}
                        disabled={capturingFrame}
                        onChange={(event) =>
                          setFrameMode(event.target.value as 'first' | 'current' | 'last')
                        }
                        className="h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-[10px]"
                      >
                        <option value="first">{t('First frame')}</option>
                        <option value="current">{t('Current frame')}</option>
                        <option value="last">{t('Last frame')}</option>
                      </select>
                    </label>
                    <MenuItem
                      icon={ImagePlus}
                      label={capturingFrame ? t('Capturing frame…') : t('Capture frame to Assets')}
                      disabled={capturingFrame || !imageAssetId}
                      title={
                        imageAssetId
                          ? t('Save a frame as a new image Asset and input node.')
                          : t('Save the video to Assets before capturing a frame.')
                      }
                      onClick={() => void captureVideoFrame()}
                    />
                    {frameMessage ? (
                      <p role="status" className="px-2.5 py-1 text-[10px] text-zinc-500">
                        {frameMessage}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {imageToolsAction ? (
                  <MenuItem
                    icon={Crop}
                    label={t('Image tools · Crop, Split, Upscale')}
                    disabled={imageToolsAction.disabled}
                    title={
                      imageToolsAction.disabledReason ||
                      t('Create crop, split, upscale, or super-resolution derivatives.')
                    }
                    onClick={() => {
                      setMoreOpen(false)
                      openImageTool('crop')
                    }}
                  />
                ) : null}
                <MenuItem
                  icon={Copy}
                  label={t('Copy redacted diagnostics')}
                  onClick={copyDiagnostics}
                />
                <MenuItem
                  icon={CopyPlus}
                  label={t('Duplicate node')}
                  onClick={() => {
                    actions.duplicateNode(workflowNode.id)
                    setMoreOpen(false)
                  }}
                />
                <MenuItem
                  icon={Trash2}
                  label={t('Delete node')}
                  tone="danger"
                  onClick={() => {
                    actions.deleteNode(workflowNode.id)
                    setMoreOpen(false)
                  }}
                />
                {downloadURL && hiddenQuickActions.includes('download') && (
                  <a
                    role="menuitem"
                    href={mediaSource(
                      downloadURL,
                      (mediaNodeValue(config.selectedOutput) ?? output)?.assetId,
                    )}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-zinc-50"
                  >
                    <Download size={14} />
                    Download output
                  </a>
                )}
                {Boolean(config.selectedOutput) && hiddenQuickActions.includes('fresh') && (
                  <MenuItem
                    icon={RefreshCw}
                    label="Generate fresh output"
                    onClick={() => {
                      update({ selectedOutput: null })
                      setMoreOpen(false)
                    }}
                  />
                )}
                {output?.type === 'image' ? (
                  <>
                    <div className="my-1.5 border-t border-zinc-100" />
                    <p className="px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      {t('Customize toolbar')}
                    </p>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-zinc-50">
                      <span>{t('Show Download')}</span>
                      <input
                        type="checkbox"
                        checked={!hiddenQuickActions.includes('download')}
                        onChange={() => toggleQuickAction('download')}
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-zinc-50">
                      <span>{t('Show Generate fresh')}</span>
                      <input
                        type="checkbox"
                        checked={!hiddenQuickActions.includes('fresh')}
                        onChange={() => toggleQuickAction('fresh')}
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-zinc-50">
                      <span>{t('Show Copy prompt')}</span>
                      <input
                        type="checkbox"
                        checked={!hiddenQuickActions.includes('prompt')}
                        onChange={() => toggleQuickAction('prompt')}
                      />
                    </label>
                    {(
                      [
                        ['mask-edit', 'Show Paint a Mask'],
                        ['crop', 'Show Crop image'],
                        ['upscale', 'Show Increase image resolution'],
                        ['image-detail', 'Show View image detail'],
                      ] as const
                    ).map(([id, label]) => (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-zinc-50"
                      >
                        <span>{t(label)}</span>
                        <input
                          type="checkbox"
                          checked={!hiddenQuickActions.includes(id)}
                          onChange={() => toggleQuickAction(id)}
                        />
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-zinc-50">
                      <span>{t('Show action labels')}</span>
                      <input
                        type="checkbox"
                        checked={showActionLabels}
                        onChange={toggleActionLabels}
                      />
                    </label>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => saveNodeToolbarPreferences(defaultNodeToolbarPreferences)}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-[10px] text-violet-700 hover:bg-violet-50"
                    >
                      {t('Reset toolbar defaults')}
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </NodeToolbar>
      {imageToolsOpen && imageAssetId && imageToolsURL && typeof document !== 'undefined'
        ? createPortal(
            <ImageUtilitiesDialog
              assetId={imageAssetId}
              assetName={String(
                output?.metadata?.filename || output?.metadata?.fileName || workflowNode.name,
              )}
              imageURL={imageToolsURL}
              initialAction={activeImageTool}
              onClose={() => setImageToolsOpen(false)}
              onCreated={(action, assets) =>
                actions.addDerivedImages(workflowNode.id, action, assets)
              }
              onInsertText={(content) => actions.addTextNode(content, imageAssetId)}
            />,
            document.body,
          )
        : null}
    </>
  )
}

function ConnectionEdge(props: EdgeProps<Edge<{ targetPort?: string }>>) {
  const [hovered, setHovered] = useState(false)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deleteEdge = useContext(EdgeDeleteContext)
  const [path, labelX, labelY] = getBezierPath(props)
  const show = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
    setHovered(true)
  }
  const hideSoon = () => {
    hideTimeout.current = setTimeout(() => setHovered(false), 100)
  }

  return (
    <>
      <g onMouseEnter={show} onMouseLeave={hideSoon}>
        <BaseEdge
          id={props.id}
          path={path}
          markerEnd={props.markerEnd}
          markerStart={props.markerStart}
          style={props.style}
          interactionWidth={24}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute z-50 transition-opacity"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'all' : 'none',
          }}
          onMouseEnter={show}
          onMouseLeave={hideSoon}
        >
          <button
            type="button"
            title="Remove this connection."
            aria-label="Remove connection"
            onClick={(event) => {
              event.stopPropagation()
              deleteEdge?.(props.id)
            }}
            className="grid size-7 place-items-center rounded-full border-2 border-white bg-sky-500 text-white shadow-md transition hover:scale-110 hover:bg-rose-600"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

function StudioNodeCard(props: NodeProps<StudioNode>) {
  if (props.data.canvasGroup) return <WorkflowGroupCard {...props} />
  return <WorkflowNodeCard {...props} />
}

function WorkflowGroupInspector({
  group,
  workflowNodes,
  availableNodes,
  nodeRecords,
  groupRun,
  isWorkflowRunning,
  onUpdate,
  onSelectNode,
  onAddNode,
  onRun,
  onUngroup,
}: {
  group: WorkflowGroup
  workflowNodes: WorkflowNode[]
  availableNodes: WorkflowNode[]
  nodeRecords: NodeExecutionRecord[]
  groupRun?: GroupRunSummary
  isWorkflowRunning: boolean
  onUpdate: (patch: Partial<WorkflowGroup>) => void
  onSelectNode: (nodeId: string) => void
  onAddNode: (nodeId: string) => void
  onRun: () => void
  onUngroup: () => void
}) {
  const { t, locale } = useLocale()
  const savedDescription = group.description || ''
  const [draft, setDraft] = useState({
    id: group.id,
    savedName: group.name,
    savedDescription,
    name: group.name,
    description: savedDescription,
  })
  const name = draft.id === group.id && draft.savedName === group.name ? draft.name : group.name
  const description =
    draft.id === group.id && draft.savedDescription === savedDescription
      ? draft.description
      : savedDescription
  const members = group.nodeIds
    .map((nodeId) => workflowNodes.find((node) => node.id === nodeId))
    .filter((node): node is WorkflowNode => Boolean(node))
  const moveMember = (nodeId: string, direction: -1 | 1) => {
    const index = group.nodeIds.indexOf(nodeId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= group.nodeIds.length) return
    const nodeIds = [...group.nodeIds]
    ;[nodeIds[index], nodeIds[nextIndex]] = [nodeIds[nextIndex], nodeIds[index]]
    onUpdate({ nodeIds })
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {t('Group name')}
      </label>
      <input
        value={name}
        onChange={(event) =>
          setDraft({
            id: group.id,
            savedName: group.name,
            savedDescription,
            name: event.target.value,
            description,
          })
        }
        onBlur={() => {
          if (name.trim() && name.trim() !== group.name) onUpdate({ name: name.trim() })
          else
            setDraft({
              id: group.id,
              savedName: group.name,
              savedDescription,
              name: group.name,
              description,
            })
        }}
        className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {t('Description')}
        </span>
        <textarea
          value={description}
          rows={3}
          onChange={(event) =>
            setDraft({
              id: group.id,
              savedName: group.name,
              savedDescription,
              name,
              description: event.target.value,
            })
          }
          onBlur={() => {
            if (description !== (group.description || '')) onUpdate({ description })
          }}
          className="w-full resize-y rounded-xl border border-zinc-200 p-3 text-xs leading-relaxed outline-none focus:border-violet-300"
        />
      </label>
      <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {t('Group color')}
        <select
          value={group.color || '#7668b1'}
          onChange={(event) => onUpdate({ color: event.target.value })}
          className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-normal normal-case text-zinc-700"
        >
          <option value="#7668b1">{t('Violet')}</option>
          <option value="#287d74">{t('Teal')}</option>
          <option value="#b76b30">{t('Amber')}</option>
          <option value="#537399">{t('Blue')}</option>
          <option value="#a64f66">{t('Rose')}</option>
        </select>
      </label>
      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {t('Members')} · {formatLocaleNumber(members.length, locale)}
        </h3>
        <button
          type="button"
          disabled={!members.length || isWorkflowRunning}
          title={
            isWorkflowRunning
              ? t('Wait until the active workflow run finishes.')
              : members.length
                ? t('Run this group and its upstream dependencies.')
                : t('Add nodes before running this group.')
          }
          onClick={onRun}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-[11px] font-semibold text-white disabled:opacity-45"
        >
          <Play size={12} fill="currentColor" /> {t('Run group')}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-2 text-[10px] text-zinc-500">
        <span className="min-w-0 flex-1">
          {groupRun
            ? t(
                'Last run: {status} · {complete}/{total} complete · {failed} failed · {running} running',
                {
                  status: t(groupRun.status),
                  complete: formatLocaleNumber(groupRun.complete, locale),
                  total: formatLocaleNumber(groupRun.total, locale),
                  failed: formatLocaleNumber(groupRun.failed, locale),
                  running: formatLocaleNumber(groupRun.running, locale),
                },
              )
            : t('No group run yet')}
        </span>
        {groupRun ? (
          <code className="max-w-24 truncate" title={groupRun.executionId}>
            {groupRun.executionId}
          </code>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('Add an ungrouped workflow node')}</span>
          <select
            aria-label={t('Add node to group')}
            value=""
            disabled={!availableNodes.length}
            onChange={(event) => {
              if (event.target.value) onAddNode(event.target.value)
            }}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-600 disabled:bg-zinc-50"
          >
            <option value="">
              {availableNodes.length ? t('Add node…') : t('No ungrouped nodes')}
            </option>
            {availableNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={Boolean(group.collapsed)}
          onClick={() => onUpdate({ collapsed: !group.collapsed })}
          className="h-9 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {group.collapsed ? t('Expand canvas group') : t('Collapse canvas group')}
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {members.map((node, index) => {
          const status = nodeRecords.find((record) => record.nodeId === node.id)
          return (
            <li
              key={node.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-100 px-2.5 py-2"
            >
              <button
                type="button"
                onClick={() => onSelectNode(node.id)}
                className="min-w-0 flex-1 truncate text-left text-xs text-zinc-700 hover:text-violet-700"
              >
                {node.name}
              </button>
              <span
                className={`size-2 shrink-0 rounded-full ${status?.status === 'running' ? 'animate-pulse bg-violet-500' : status?.status === 'succeeded' ? 'bg-emerald-500' : status?.status === 'failed' ? 'bg-rose-500' : status?.status === 'queued' ? 'bg-zinc-400' : 'bg-zinc-200'}`}
                role="img"
                aria-label={`${node.name}: ${t(status?.status || 'idle')}`}
                title={`${node.name}: ${t(status?.status || 'idle')}${status?.error ? ` · ${t(status.error)}` : ''}`}
              />
              <button
                type="button"
                aria-label={`Move ${node.name} up`}
                title={t('Move up')}
                disabled={index === 0}
                onClick={() => moveMember(node.id, -1)}
                className="grid size-6 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 disabled:opacity-30"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                aria-label={`Move ${node.name} down`}
                title={t('Move down')}
                disabled={index === members.length - 1}
                onClick={() => moveMember(node.id, 1)}
                className="grid size-6 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 disabled:opacity-30"
              >
                <ChevronDown size={13} />
              </button>
              <button
                type="button"
                aria-label={t('Remove {name} from group', { name: node.name })}
                title={t('Remove {name} from group', { name: node.name })}
                onClick={() => onUpdate({ nodeIds: group.nodeIds.filter((id) => id !== node.id) })}
                className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
              >
                <X size={13} />
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={onUngroup}
        className="mt-5 h-9 w-full rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
      >
        {t('Ungroup members')}
      </button>
    </div>
  )
}

function WorkflowGroupCard({ id, data, selected }: NodeProps<StudioNode>) {
  const { t, locale } = useLocale()
  const actions = useContext(NodeActionContext)
  const group = data.canvasGroup!
  const groupRun = data.groupRun
  const [draft, setDraft] = useState({ id: group.id, savedName: group.name, name: group.name })
  const name = draft.id === group.id && draft.savedName === group.name ? draft.name : group.name
  const color = group.color || '#7668b1'

  return (
    <div
      className={`relative h-full w-full overflow-visible rounded-2xl border-2 shadow-sm ${selected ? 'ring-2 ring-violet-300' : ''}`}
      style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 8%, white)` }}
      aria-label={t('{name} workflow group', { name: group.name })}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={320}
        minHeight={180}
        color={color}
        onResizeStart={() => actions?.captureHistory()}
        onResizeEnd={() => actions?.markDirty()}
      />
      <div
        className="nodrag flex h-12 items-center gap-2 rounded-t-xl border-b bg-white/75 px-3"
        style={{ borderColor: `${color}55` }}
      >
        <LayoutGrid size={15} aria-hidden="true" style={{ color }} />
        <input
          aria-label={t('Group name')}
          value={name}
          onChange={(event) =>
            setDraft({ id: group.id, savedName: group.name, name: event.target.value })
          }
          onBlur={() => {
            const nextName = name.trim()
            if (nextName && nextName !== group.name)
              actions?.updateGroup(group.id, { name: nextName })
            else setDraft({ id: group.id, savedName: group.name, name: group.name })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape')
              setDraft({ id: group.id, savedName: group.name, name: group.name })
          }}
          className="nodrag min-w-0 flex-1 bg-transparent text-xs font-semibold text-zinc-800 outline-none"
        />
        <span className="shrink-0 text-[10px] text-zinc-500">
          {groupRun
            ? `${formatLocaleNumber(groupRun.complete, locale)}/${formatLocaleNumber(groupRun.total, locale)}`
            : `${group.nodeIds.length} ${t('nodes')}`}
        </span>
        <button
          type="button"
          title={
            group.nodeIds.length
              ? t('Run this group and its upstream dependencies')
              : t('Add nodes before running this group.')
          }
          aria-label={t('Run group')}
          disabled={!group.nodeIds.length || Boolean(actions?.isWorkflowRunning)}
          onClick={() => actions?.runGroup(group.id)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-violet-100 hover:text-violet-700 disabled:opacity-40"
        >
          <Play size={13} fill="currentColor" />
        </button>
        <button
          type="button"
          title={group.collapsed ? t('Expand canvas group') : t('Collapse canvas group')}
          aria-label={group.collapsed ? t('Expand canvas group') : t('Collapse canvas group')}
          aria-pressed={Boolean(group.collapsed)}
          onClick={() => actions?.updateGroup(group.id, { collapsed: !group.collapsed })}
          className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100"
        >
          {group.collapsed ? <Plus size={14} /> : <MoreHorizontal size={15} />}
        </button>
        <button
          type="button"
          title={t('Open group details')}
          aria-label={t('Open group details')}
          onClick={() => actions?.selectNode(id)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100"
        >
          <Settings2 size={14} />
        </button>
        <button
          type="button"
          title={t('Ungroup nodes')}
          aria-label={t('Ungroup nodes')}
          onClick={() => actions?.ungroup(group.id)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-rose-50 hover:text-rose-700"
        >
          <X size={14} />
        </button>
      </div>
      {!group.collapsed && group.description ? (
        <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">{group.description}</p>
      ) : null}
    </div>
  )
}

function InlineNodeName({
  name,
  renaming,
  onCommit,
  onCancel,
  className,
}: {
  name: string
  renaming: boolean
  onCommit: (name: string) => void
  onCancel: () => void
  className: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const committedRef = useRef(false)

  useEffect(() => {
    if (renaming) {
      cancelledRef.current = false
      committedRef.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [name, renaming])

  if (!renaming) return <span className={className}>{name}</span>

  const commit = () => {
    if (cancelledRef.current || committedRef.current) return
    committedRef.current = true
    const nextName = inputRef.current?.value.trim() || ''
    if (nextName) onCommit(nextName)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      aria-label="Node name"
      defaultValue={name}
      onBlur={() => {
        if (!cancelledRef.current) commit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          cancelledRef.current = true
          onCancel()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`nodrag nowheel min-w-0 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-zinc-900 outline-none ring-2 ring-violet-100 ${className}`}
    />
  )
}

function WorkflowNodeCard({ data, selected, width, height }: NodeProps<StudioNode>) {
  const { t, locale } = useLocale()
  const textNodeEditor = useContext(TextNodeEditorContext)
  const actions = useContext(NodeActionContext)
  const isRenaming = actions?.renamingNodeId === data.workflowNode.id
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const toolbarHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showHoverToolbar = () => {
    if (toolbarHoverTimer.current) clearTimeout(toolbarHoverTimer.current)
    setHovered(true)
  }
  const hideHoverToolbar = () => {
    if (toolbarHoverTimer.current) clearTimeout(toolbarHoverTimer.current)
    toolbarHoverTimer.current = setTimeout(() => setHovered(false), 180)
  }
  useEffect(
    () => () => {
      if (toolbarHoverTimer.current) clearTimeout(toolbarHoverTimer.current)
    },
    [],
  )
  const definition = registryByType.get(data.workflowNode.type)
  const tone = categoryTone[definition?.category ?? 'Utility']
  const Icon = iconByType[data.workflowNode.type] ?? Zap
  const record = data.record
  const isRunning = record?.status === 'running'
  const mediaType = definition?.outputs.find(
    (port) => port.dataType === 'image' || port.dataType === 'video' || port.dataType === 'audio',
  )?.dataType
  const isInputMedia =
    data.workflowNode.type === 'input.image' ||
    data.workflowNode.type === 'input.video' ||
    data.workflowNode.type === 'input.audio'
  const selectedOutput = mediaNodeValue(data.workflowNode.config.selectedOutput, mediaType)
  const inputOutput =
    isInputMedia && data.workflowNode.config.url
      ? ({
          type: mediaType,
          value: {
            url: data.workflowNode.config.url,
            fileName: data.workflowNode.config.fileName,
            mimeType: data.workflowNode.config.mimeType,
          },
          assetId: data.workflowNode.config.assetId,
        } as import('@znith/contracts').NodeValue)
      : undefined
  const output =
    selectedOutput ??
    inputOutput ??
    (!data.outputStale
      ? (Object.values(record?.outputs ?? {}).find((value) => value.type === mediaType) ??
        (record?.outputs ? Object.values(record.outputs)[0] : undefined))
      : undefined)
  const toolbarRecord =
    data.outputStale && !selectedOutput && record ? { ...record, outputs: undefined } : record
  const preview = output?.value
  const previewObject =
    preview && typeof preview === 'object' ? (preview as Record<string, unknown>) : null
  const mediaAssetId =
    output?.assetId ??
    output?.metadata?.assetId ??
    previewObject?.assetId ??
    data.workflowNode.config.assetId
  const mediaFileName =
    output?.metadata?.filename ??
    output?.metadata?.fileName ??
    previewObject?.filename ??
    data.workflowNode.config.fileName
  const mediaValue = mediaSource(
    previewObject?.url ?? (typeof preview === 'string' ? preview : data.workflowNode.config.url),
    mediaAssetId,
    mediaFileName,
  )
  const slug = nodeSlug(data.workflowNode)
  const ratio = String(
    data.workflowNode.config.aspectRatio || (mediaType === 'video' ? '16:9' : '1:1'),
  )
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
  const [measuredImage, setMeasuredImage] = useState<{
    source: string
    width: number
    height: number
  } | null>(null)
  const [measuredVideo, setMeasuredVideo] = useState<{
    source: string
    width: number
    height: number
  } | null>(null)
  const configuredImageWidth = Number(
    previewObject?.width ?? data.workflowNode.config.imageWidth ?? 0,
  )
  const configuredImageHeight = Number(
    previewObject?.height ?? data.workflowNode.config.imageHeight ?? 0,
  )
  const imageDimensions =
    mediaType === 'image' && configuredImageWidth > 0 && configuredImageHeight > 0
      ? { width: configuredImageWidth, height: configuredImageHeight }
      : measuredImage?.source === mediaValue
        ? measuredImage
        : null
  const mediaRatio =
    mediaType === 'image' && imageDimensions
      ? `${imageDimensions.width} / ${imageDimensions.height}`
      : mediaType === 'video' && measuredVideo?.source === mediaValue
        ? `${measuredVideo.width} / ${measuredVideo.height}`
        : `${ratioWidth || 1} / ${ratioHeight || 1}`
  const mediaRatioLabel =
    mediaType === 'image' && imageDimensions
      ? imageRatioLabel(imageDimensions.width, imageDimensions.height)
      : mediaType === 'video' && measuredVideo?.source === mediaValue
        ? imageRatioLabel(measuredVideo.width, measuredVideo.height)
        : ratio
  const imageRatioLocked = data.workflowNode.config.lockImageAspectRatio !== false
  const imageDisplayWidth = Math.max(
    180,
    Number(data.workflowNode.config.displayWidth || width || 320),
  )
  const savedImageDisplayHeight = Number(data.workflowNode.config.displayHeight || height || 0)
  const imageDisplayHeight =
    savedImageDisplayHeight > 0 ? Math.max(160, savedImageDisplayHeight) : undefined
  const mediaVersions = data.mediaVersions ?? []
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (!previewOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewOpen])

  if (mediaType) {
    return (
      <div
        onPointerEnter={showHoverToolbar}
        onPointerLeave={hideHoverToolbar}
        className={`group relative flex w-[320px] flex-col rounded-2xl transition ${selected ? 'drop-shadow-[0_0_6px_rgba(124,58,237,.28)]' : ''} ${isRunning ? 'ring-2 ring-violet-100' : ''}`}
        style={{
          width: mediaType === 'image' ? imageDisplayWidth : 320,
          ...(mediaType === 'image' && !imageRatioLocked && imageDisplayHeight
            ? { height: imageDisplayHeight }
            : {}),
        }}
      >
        <TypedHandles definition={definition} />
        {mediaType === 'image' && imageRatioLocked && selected ? (
          <NodeResizeControl
            position="right"
            resizeDirection="horizontal"
            minWidth={180}
            color="#7c3aed"
            onResizeStart={() => actions?.captureHistory()}
            onResizeEnd={(_, params) => actions?.resizeNode(data.workflowNode.id, params.width)}
          />
        ) : mediaType === 'image' && !imageRatioLocked ? (
          <NodeResizer
            minWidth={180}
            minHeight={160}
            color="#7c3aed"
            isVisible={selected}
            onResizeStart={() => actions?.captureHistory()}
            onResizeEnd={(_, params) =>
              actions?.resizeNode(data.workflowNode.id, params.width, params.height)
            }
          />
        ) : null}
        {mediaVersions.length ? (
          <NodeToolbar
            nodeId={data.workflowNode.id}
            isVisible={selected || hovered}
            position={Position.Top}
            align="center"
            offset={8}
            className="nodrag nowheel !z-50"
          >
            <div
              className="nodrag nowheel flex h-14 max-w-[calc(100vw-2rem)] items-center justify-center gap-1.5 overflow-x-auto px-2"
              onPointerEnter={showHoverToolbar}
              onPointerLeave={hideHoverToolbar}
            >
              {mediaVersions.map((version, index) => {
                const versionURL = mediaSource(
                  mediaOutputURL(version.output),
                  version.output.assetId ?? version.output.metadata?.assetId,
                  version.output.metadata?.filename ?? version.output.metadata?.fileName,
                )
                const currentAssetId = output?.assetId ?? output?.metadata?.assetId
                const versionAssetId = version.output.assetId ?? version.output.metadata?.assetId
                const active = Boolean(
                  (currentAssetId && currentAssetId === versionAssetId) ||
                  (mediaOutputURL(output) &&
                    mediaOutputURL(output) === mediaOutputURL(version.output)) ||
                  (mediaValue && versionURL === mediaValue),
                )
                return (
                  <button
                    key={`${version.executionId}-${index}`}
                    type="button"
                    title={`${t('Saved')} ${t(version.output.type)}${version.provider ? ` · ${version.provider}` : ''}${version.model ? ` · ${displayModelName(version.model)}` : ''} · ${formatLocaleDate(version.createdAt, locale)}`}
                    aria-label={`Select saved media version ${index + 1}`}
                    aria-pressed={active}
                    onClick={() =>
                      actions?.selectMediaVersion(data.workflowNode.id, version.output)
                    }
                    className={`relative shrink-0 overflow-hidden rounded-md border-2 bg-zinc-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? 'z-10 h-11 w-8 -translate-y-1 border-violet-600 shadow-lg ring-2 ring-violet-200' : 'h-8 w-6 border-white opacity-80 shadow-sm hover:scale-110 hover:opacity-100 hover:border-violet-300'}`}
                  >
                    {version.output.type === 'image' && versionURL ? (
                      <Image
                        src={versionURL}
                        alt=""
                        fill
                        sizes="32px"
                        unoptimized
                        className="object-contain"
                      />
                    ) : version.output.type === 'audio' ? (
                      <AudioLines size={13} className="absolute inset-0 m-auto text-zinc-500" />
                    ) : versionURL ? (
                      <video
                        src={versionURL}
                        muted
                        playsInline
                        preload="metadata"
                        className="size-full object-contain"
                        onLoadedMetadata={(event) => {
                          const video = event.currentTarget
                          if (video.duration > 0)
                            video.currentTime = Math.min(0.1, video.duration / 2)
                        }}
                      />
                    ) : (
                      <Video size={13} className="absolute inset-0 m-auto text-zinc-500" />
                    )}
                  </button>
                )
              })}
            </div>
          </NodeToolbar>
        ) : null}
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <span className={`grid size-6 place-items-center rounded-md ${tone.icon}`}>
            <Icon size={12} />
          </span>
          <InlineNodeName
            name={data.workflowNode.name}
            renaming={isRenaming}
            onCommit={(name) => actions?.saveNodeName(data.workflowNode.id, name)}
            onCancel={() => actions?.cancelRenameNode()}
            className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-900"
          />
          <NodeRunIndicator status={record?.status} />
        </div>
        <div className="relative flex min-h-0 flex-1">
          <div
            className={`relative grid w-full min-h-0 place-items-center overflow-hidden rounded-2xl border bg-white shadow-[0_12px_30px_rgba(24,24,27,.1)] ${isRunning ? 'border-violet-400 ring-2 ring-violet-100' : selected ? 'border-violet-500 ring-2 ring-violet-100' : 'border-zinc-200'}`}
            style={
              mediaType === 'audio'
                ? { minHeight: 76 }
                : mediaType === 'image' && !imageRatioLocked && imageDisplayHeight
                  ? { height: '100%' }
                  : { aspectRatio: mediaRatio }
            }
          >
            {mediaValue ? (
              mediaType === 'audio' ? (
                <audio
                  src={mediaValue}
                  controls
                  className="w-full px-3"
                  aria-label={t('{name} audio output', { name: data.workflowNode.name })}
                />
              ) : mediaType === 'video' ? (
                <video
                  ref={videoPreviewRef}
                  src={mediaValue}
                  controls
                  className="size-full object-contain"
                  onLoadedMetadata={(event) => {
                    const { videoWidth, videoHeight } = event.currentTarget
                    if (videoWidth > 0 && videoHeight > 0) {
                      setMeasuredVideo({
                        source: mediaValue,
                        width: videoWidth,
                        height: videoHeight,
                      })
                    }
                  }}
                />
              ) : mediaAssetId ? (
                <Image
                  src={mediaValue}
                  alt={data.workflowNode.name}
                  fill
                  sizes="320px"
                  unoptimized
                  className="object-contain object-center"
                  onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget
                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setMeasuredImage({
                        source: mediaValue,
                        width: naturalWidth,
                        height: naturalHeight,
                      })
                    }
                  }}
                />
              ) : (
                <Image
                  src={mediaValue}
                  alt={data.workflowNode.name}
                  fill
                  sizes="320px"
                  unoptimized
                  className="object-contain object-center"
                  onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget
                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setMeasuredImage({
                        source: mediaValue,
                        width: naturalWidth,
                        height: naturalHeight,
                      })
                    }
                  }}
                />
              )
            ) : record?.error ? (
              <div className="p-5 text-center text-xs text-rose-600">{record.error}</div>
            ) : mediaType === 'audio' ? (
              <AudioLines size={38} className="text-zinc-300" />
            ) : mediaType === 'video' ? (
              <Video size={38} className="text-zinc-300" />
            ) : (
              <ImageIcon size={38} className="text-zinc-300" />
            )}
            {mediaValue ? (
              <button
                type="button"
                aria-label={t('Enlarge media preview')}
                title={t('Enlarge preview')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setPreviewOpen(true)
                }}
                className="nodrag absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-lg border border-zinc-200/80 bg-white/90 text-zinc-800 shadow-sm transition hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <Maximize2 size={16} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
          <span>@{slug}</span>
          <span>
            {mediaType === 'audio'
              ? String(output?.metadata?.mimeType || 'Audio')
              : mediaRatioLabel}
          </span>
        </div>
        <NodeActionToolbar
          workflowNode={data.workflowNode}
          record={toolbarRecord}
          selected={selected}
          hovered={hovered}
          mediaVersions={mediaVersions}
          onToolbarPointerEnter={showHoverToolbar}
          onToolbarPointerLeave={hideHoverToolbar}
          aspectRatioValue={mediaType === 'image' ? mediaRatioLabel : undefined}
          videoRef={videoPreviewRef}
          onOpenPreview={() => setPreviewOpen(true)}
        />
        {previewOpen && mediaValue && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="nodrag nopan fixed inset-0 z-[10000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
                role="presentation"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  if (event.target === event.currentTarget) setPreviewOpen(false)
                }}
              >
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${mediaType === 'video' ? 'Video' : mediaType === 'audio' ? 'Audio' : 'Image'} preview`}
                  className="relative grid h-full max-h-[92vh] w-full max-w-6xl place-items-center"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label="Close preview"
                    title="Close preview"
                    onClick={() => setPreviewOpen(false)}
                    className="absolute right-0 top-0 z-10 grid size-10 place-items-center rounded-full bg-white/95 text-zinc-900 shadow-lg transition hover:bg-white"
                  >
                    <X size={20} />
                  </button>
                  {mediaType === 'audio' ? (
                    <audio
                      src={mediaValue}
                      controls
                      autoPlay={false}
                      className="w-full max-w-3xl"
                    />
                  ) : mediaType === 'video' ? (
                    <video
                      src={mediaValue}
                      controls
                      autoPlay={false}
                      playsInline
                      className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                    />
                  ) : (
                    <div className="relative h-full w-full">
                      <Image
                        src={mediaValue}
                        alt={data.workflowNode.name}
                        fill
                        sizes="100vw"
                        unoptimized
                        className="object-contain"
                      />
                    </div>
                  )}
                </section>
              </div>,
              document.body,
            )
          : null}
      </div>
    )
  }

  if (data.workflowNode.type === 'input.text' || data.workflowNode.type === 'input.prompt') {
    const value = String(data.workflowNode.config.value ?? '')
    const isPrompt = data.workflowNode.type === 'input.prompt'

    return (
      <div
        onPointerEnter={showHoverToolbar}
        onPointerLeave={hideHoverToolbar}
        className={`group relative w-[352px] ${selected ? 'drop-shadow-[0_0_10px_rgba(124,58,237,.2)]' : ''}`}
      >
        <TypedHandles definition={definition} />
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <span className={`grid size-6 place-items-center rounded-md ${tone.icon}`}>
            <Icon size={12} />
          </span>
          <InlineNodeName
            name={data.workflowNode.name}
            renaming={isRenaming}
            onCommit={(name) => actions?.saveNodeName(data.workflowNode.id, name)}
            onCancel={() => actions?.cancelRenameNode()}
            className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-900"
          />
          <NodeRunIndicator status={record?.status} />
        </div>
        <div
          className={`rounded-2xl border bg-white shadow-[0_10px_30px_rgba(24,24,27,0.08)] transition ${isRunning ? 'border-violet-400 ring-2 ring-violet-100' : selected ? 'border-violet-500 ring-2 ring-violet-100' : tone.border}`}
        >
          <div className="p-3.5 pb-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {t(isPrompt ? 'Prompt content' : 'Text content')}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-medium text-zinc-500">
                {t(isPrompt ? 'Reusable prompt' : 'Plain text')}
              </span>
            </div>
            <textarea
              aria-label={`${data.workflowNode.name} content`}
              className="nodrag nowheel min-h-[184px] max-h-[360px] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 text-xs leading-[1.65] text-zinc-700 outline-none transition placeholder:text-zinc-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-50"
              placeholder={t(
                isPrompt
                  ? 'Write a reusable prompt or creative brief…'
                  : 'Enter text to pass to connected nodes…',
              )}
              rows={8}
              value={value}
              style={{ fontSize: `${Number(data.workflowNode.config.fontSize || 12)}px` }}
              onChange={(event) =>
                textNodeEditor?.updateValue(data.workflowNode.id, event.target.value)
              }
              onBlur={() => textNodeEditor?.finishEditing(data.workflowNode.id)}
            />
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-3.5 py-2.5 text-[10px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Type size={12} />
              {t('{count} text output', {
                count: formatLocaleNumber(definition?.outputs.length ?? 0, locale),
              })}
            </span>
            <span>
              {formatLocaleNumber(Array.from(value).length, locale)} {t('characters')}
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
          <span>@{slug}</span>
        </div>
        <NodeActionToolbar
          workflowNode={data.workflowNode}
          record={record}
          selected={selected}
          hovered={hovered}
          mediaVersions={data.mediaVersions}
          onToolbarPointerEnter={showHoverToolbar}
          onToolbarPointerLeave={hideHoverToolbar}
        />
      </div>
    )
  }

  return (
    <div
      onPointerEnter={showHoverToolbar}
      onPointerLeave={hideHoverToolbar}
      className={`group relative ${mediaType ? 'w-[320px]' : 'w-[272px]'} rounded-2xl border bg-white shadow-[0_10px_30px_rgba(24,24,27,0.08)] transition ${isRunning ? 'border-violet-400 ring-2 ring-violet-100 shadow-violet-100' : selected ? 'border-violet-500 ring-2 ring-violet-100' : tone.border}`}
    >
      <TypedHandles definition={definition} />
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-3 py-2.5">
        <span className={`grid size-7 place-items-center rounded-lg ${tone.icon}`}>
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <InlineNodeName
            name={data.workflowNode.name}
            renaming={isRenaming}
            onCommit={(name) => actions?.saveNodeName(data.workflowNode.id, name)}
            onCancel={() => actions?.cancelRenameNode()}
            className="block w-full truncate text-xs font-semibold text-zinc-900"
          />
          <div className="text-[10px] text-zinc-400">@{slug}</div>
        </div>
        <NodeRunIndicator status={record?.status} />
      </div>
      <div className={`${mediaType ? 'min-h-[230px]' : 'min-h-[76px]'} p-3.5`}>
        {!definition?.available ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            {definition?.unavailableReason}
          </div>
        ) : record?.error ? (
          <div className="line-clamp-3 text-xs leading-relaxed text-rose-600">{record.error}</div>
        ) : mediaType && mediaValue ? (
          mediaType === 'audio' ? (
            <audio src={mediaValue} controls className="w-full rounded-xl" />
          ) : mediaType === 'video' ? (
            <video
              src={mediaValue}
              controls
              className="h-52 w-full rounded-xl bg-zinc-950 object-contain"
            />
          ) : (
            <div className="relative h-52 w-full overflow-hidden rounded-xl bg-zinc-100">
              <Image
                src={mediaValue}
                alt={data.workflowNode.name}
                fill
                sizes="320px"
                unoptimized
                className="object-contain"
              />
            </div>
          )
        ) : mediaType ? (
          <div className="grid h-48 place-items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 text-zinc-300">
            {mediaType === 'audio' ? (
              <AudioLines size={34} />
            ) : mediaType === 'video' ? (
              <Video size={34} />
            ) : (
              <ImageIcon size={34} />
            )}
          </div>
        ) : preview !== undefined ? (
          <div className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">
            {typeof preview === 'string' ? preview : JSON.stringify(preview, null, 2)}
          </div>
        ) : data.workflowNode.type.startsWith('input.') ? (
          <div className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">
            {String(data.workflowNode.config.value || 'Select to add input')}
          </div>
        ) : (
          <div className="text-xs leading-relaxed text-zinc-400">
            {definition?.description ? t(definition.description) : null}
          </div>
        )}
      </div>
      <NodeActionToolbar
        workflowNode={data.workflowNode}
        record={record}
        selected={selected}
        hovered={hovered}
        mediaVersions={data.mediaVersions}
        onToolbarPointerEnter={showHoverToolbar}
        onToolbarPointerLeave={hideHoverToolbar}
      />
    </div>
  )
}

const nodeTypes = { studioNode: StudioNodeCard }
const edgeTypes = { bezier: ConnectionEdge }

function toFlowNodes(
  definition: WorkflowDefinition,
  records: NodeExecutionRecord[] = [],
  logs: ExecutionLog[] = [],
  executions: ExecutionDocument[] = [],
): StudioNode[] {
  const collapsedNodeIds = new Set(
    (definition.groups ?? []).filter((group) => group.collapsed).flatMap((group) => group.nodeIds),
  )
  const workflowNodes = definition.nodes.map((node) => ({
    id: node.id,
    type: 'studioNode',
    position: node.position,
    hidden: collapsedNodeIds.has(node.id),
    data: {
      workflowNode: node,
      record: records.find((record) => record.nodeId === node.id),
      executionLogs: logs.filter((log) => log.nodeId === node.id),
      mediaVersions: mediaOutputVersions(executions, node.id),
      outputStale: isMediaOutputStale(node, executions),
    },
  }))
  const groupNodes = (definition.groups ?? []).map((group) =>
    createGroupFlowNode(group, false, groupRunSummary(group, executions)),
  )
  return [...groupNodes, ...workflowNodes] as StudioNode[]
}

function groupRunSummary(
  group: WorkflowGroup,
  executions: ExecutionDocument[],
): GroupRunSummary | undefined {
  const execution = executions.find((item) => item.scope === `group:${group.id}`)
  if (!execution) return undefined
  const snapshotGroup = execution.snapshot.groups?.find((item) => item.id === group.id)
  const memberIds = new Set(snapshotGroup?.nodeIds ?? group.nodeIds)
  const records = execution.nodeRecords.filter((record) => memberIds.has(record.nodeId))
  return {
    executionId: execution.id,
    status: execution.status,
    total: memberIds.size,
    complete: records.filter((record) =>
      ['succeeded', 'failed', 'skipped', 'cancelled'].includes(record.status),
    ).length,
    failed: records.filter((record) => record.status === 'failed').length,
    running: records.filter((record) => record.status === 'running' || record.status === 'queued')
      .length,
  }
}

function workflowGroupFlowId(groupId: string) {
  return `__zenith-group-${groupId}`
}

function createGroupFlowNode(
  group: WorkflowGroup,
  selected = false,
  groupRun?: GroupRunSummary,
): StudioNode {
  const id = workflowGroupFlowId(group.id)
  return {
    id,
    type: 'studioNode',
    position: group.position,
    style: { width: group.width, height: group.collapsed ? 56 : group.height, zIndex: -1 },
    zIndex: -1,
    selected,
    data: {
      workflowNode: {
        id,
        type: 'utility.note',
        name: group.name,
        slug: id,
        position: group.position,
        config: {},
      },
      canvasGroup: group,
      groupRun,
    },
  }
}

function mediaOutputVersions(
  executions: ExecutionDocument[],
  nodeId: string,
): MediaOutputVersion[] {
  const versions: MediaOutputVersion[] = []
  const seen = new Set<string>()
  for (const execution of executions) {
    const record = execution.nodeRecords?.find(
      (item) => item.nodeId === nodeId && item.status === 'succeeded',
    )
    if (!record?.outputs) continue
    const executedNode = execution.snapshot.nodes.find((node) => node.id === nodeId)
    const configuredPrompt =
      typeof executedNode?.config.prompt === 'string' ? executedNode.config.prompt : ''
    const connectedPrompt = execution.snapshot.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => {
        const upstream = execution.nodeRecords?.find((item) => item.nodeId === edge.source)
        return (
          upstream?.outputs?.[edge.sourceHandle] ||
          Object.values(upstream?.outputs || {}).find((value) => value.type === 'text')
        )
      })
      .find((value) => value?.type === 'text' && typeof value.value === 'string')
    const prompt =
      configuredPrompt || (typeof connectedPrompt?.value === 'string' ? connectedPrompt.value : '')
    for (const output of Object.values(record.outputs)) {
      if (output.type !== 'image' && output.type !== 'video' && output.type !== 'audio') continue
      const identity = output.assetId || mediaOutputURL(output) || `${execution.id}:${output.type}`
      if (seen.has(identity)) continue
      seen.add(identity)
      versions.push({
        executionId: execution.id,
        createdAt: record.completedAt || execution.completedAt || execution.startedAt,
        prompt: prompt || undefined,
        provider:
          typeof executedNode?.config.provider === 'string'
            ? executedNode.config.provider
            : undefined,
        model:
          typeof executedNode?.config.model === 'string' ? executedNode.config.model : undefined,
        output,
      })
    }
  }
  return versions
}

function mergeExecutionNodeRecords(executions: ExecutionDocument[]) {
  const latestRecords = new Map<string, NodeExecutionRecord>()
  const latestSuccessfulOutputs = new Map<string, NonNullable<NodeExecutionRecord['outputs']>>()

  for (const execution of executions) {
    for (const record of execution.nodeRecords ?? []) {
      if (!latestRecords.has(record.nodeId)) latestRecords.set(record.nodeId, record)
      if (
        record.status === 'succeeded' &&
        record.outputs &&
        !latestSuccessfulOutputs.has(record.nodeId)
      ) {
        latestSuccessfulOutputs.set(record.nodeId, record.outputs)
      }
    }
  }

  return [...latestRecords.values()].map((record) => {
    const previousOutputs = latestSuccessfulOutputs.get(record.nodeId)
    return previousOutputs ? { ...record, outputs: previousOutputs } : record
  })
}

function runScopeNodeIds(definition: WorkflowDefinition, targetNodeId?: string) {
  if (!targetNodeId) return new Set(definition.nodes.map((node) => node.id))
  return runGroupScopeNodeIds(definition, [targetNodeId])
}

function runGroupScopeNodeIds(definition: WorkflowDefinition, targetNodeIds: string[]) {
  const included = new Set(targetNodeIds)
  let changed = true
  while (changed) {
    changed = false
    for (const edge of definition.edges) {
      if (included.has(edge.target) && !included.has(edge.source)) {
        included.add(edge.source)
        changed = true
      }
    }
  }
  return included
}

function executionScopeNodeIds(execution: ExecutionDocument) {
  if (execution.scope === 'workflow')
    return new Set(execution.snapshot.nodes.map((node) => node.id))
  const nodeRun = /^node:(.*):with-dependencies$/.exec(execution.scope)
  if (nodeRun) return runScopeNodeIds(execution.snapshot, nodeRun[1])
  const groupRun = /^group:(.*)$/.exec(execution.scope)
  if (groupRun) {
    const group = execution.snapshot.groups?.find((item) => item.id === groupRun[1])
    return group ? runGroupScopeNodeIds(execution.snapshot, group.nodeIds) : new Set<string>()
  }
  return new Set<string>()
}

function hasGeneratedMediaOutput(node: StudioNode) {
  if (
    ![
      'ai.generate-image',
      'ai.edit-image',
      'ai.generate-video',
      'ai.image-to-video',
      'ai.generate-audio',
    ].includes(node.data.workflowNode.type)
  ) {
    return false
  }

  return Object.values(node.data.record?.outputs ?? {}).some(
    (output) => output.type === 'image' || output.type === 'video' || output.type === 'audio',
  )
}

function portColor(dataType?: string) {
  if (dataType === 'image') return '#3b82f6'
  if (dataType === 'video') return '#d946ef'
  if (dataType === 'audio') return '#059669'
  if (dataType === 'json') return '#f59e0b'
  return '#7c3aed'
}

function toFlowEdges(definition: WorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => {
    const source = definition.nodes.find((node) => node.id === edge.source)
    const target = definition.nodes.find((node) => node.id === edge.target)
    const sourcePort = registryByType
      .get(source?.type || '')
      ?.outputs.find((port) => port.id === edge.sourceHandle)
    const targetPort = registryByType
      .get(target?.type || '')
      ?.inputs.find((port) => port.id === edge.targetHandle)
    return {
      ...edge,
      targetHandle: `type-${targetPort?.dataType || sourcePort?.dataType || 'text'}`,
      data: { targetPort: edge.targetHandle },
      type: 'bezier',
      animated: false,
      style: { stroke: portColor(sourcePort?.dataType), strokeWidth: 2 },
    }
  })
}

function targetPortForEdge(edge: Edge) {
  return String(
    (edge.data as { targetPort?: string } | undefined)?.targetPort || edge.targetHandle || '',
  )
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <EditorInner workflowId={workflowId} />
    </ReactFlowProvider>
  )
}

function EditorInner({ workflowId }: { workflowId: string }) {
  const { t, locale } = useLocale()
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null)
  const [executions, setExecutions] = useState<ExecutionDocument[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteWidth, setPaletteWidth] = useState(280)
  const [paletteWidthLoaded, setPaletteWidthLoaded] = useState(false)
  const [showMinimap, setShowMinimap] = useState(true)
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  const [dotBackground, setDotBackground] = useState(true)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [shortcutSearch, setShortcutSearch] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState<'selected' | 'canvas' | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTabState, setInspectorTabState] = useState<{
    nodeId: string | null
    tab: 'details' | 'json'
  }>({ nodeId: null, tab: 'details' })
  const inspectorNodeTab =
    inspectorTabState.nodeId === selectedId ? inspectorTabState.tab : 'details'
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null)
  const [runScopeIds, setRunScopeIds] = useState<string[]>([])
  const [mediaUploadProgress, setMediaUploadProgress] = useState<{
    completed: number
    total: number
  } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [runConfirmation, setRunConfirmation] = useState<{
    targetNodeId?: string
    groupId?: string
    retryOfExecutionId?: string
    previousMediaCount: number
  } | null>(null)
  const [nodePickerOpen, setNodePickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerPosition, setPickerPosition] = useState<{ x: number; y: number } | null>(null)
  const [pendingNodeConnection, setPendingNodeConnection] = useState<PendingNodeConnection | null>(
    null,
  )
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(
    null,
  )
  const mediaInput = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<{ type: 'new' } | { type: 'selected'; nodeId: string }>({
    type: 'new',
  })
  const runLockRef = useRef(false)
  const runStartedAtRef = useRef<string | null>(null)
  const runExecutionIdRef = useRef<string | null>(null)
  const hasLoadedWorkflowRef = useRef(false)
  const initialFitPendingRef = useRef(false)
  const groupDragRef = useRef<{ groupId: string; lastPosition: { x: number; y: number } } | null>(
    null,
  )
  const [undoStack, setUndoStack] = useState<WorkflowDefinition[]>([])
  const [redoStack, setRedoStack] = useState<WorkflowDefinition[]>([])
  const textEditHistoryCaptured = useRef(new Set<string>())
  const clipboard = useRef<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null>(null)
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, getZoom, deleteElements } = useReactFlow()
  const nodesInitialized = useNodesInitialized()

  const load = useCallback(async () => {
    const response = await studioFetch(`/api/studio/workflows/${workflowId}`, { cache: 'no-store' })
    const responseBody = await response.json()
    if (!response.ok) return setError(responseBody.error || 'Could not load workflow.')
    const refreshedExecutions = responseBody.executions as ExecutionDocument[]
    const activeExecution = refreshedExecutions.find((execution) => execution.status === 'running')
    const latestExecution = activeExecution ?? refreshedExecutions[0]
    if (!hasLoadedWorkflowRef.current) {
      hasLoadedWorkflowRef.current = true
      initialFitPendingRef.current = responseBody.workflow.definition.nodes.length > 0
    }
    setWorkflow(responseBody.workflow)
    setExecutions(refreshedExecutions)
    setNodes(
      toFlowNodes(
        responseBody.workflow.definition,
        mergeExecutionNodeRecords(refreshedExecutions),
        latestExecution?.logs,
        refreshedExecutions,
      ),
    )
    if (activeExecution) {
      runLockRef.current = true
      runStartedAtRef.current = activeExecution.startedAt
      runExecutionIdRef.current = activeExecution.id
      setRunStartedAt(activeExecution.startedAt)
      setRunScopeIds([...executionScopeNodeIds(activeExecution)])
      setRunning(true)
    } else {
      runLockRef.current = false
      runStartedAtRef.current = null
      runExecutionIdRef.current = null
      setRunStartedAt(null)
      setRunScopeIds([])
      setRunning(false)
    }
    setEdges(toFlowEdges(responseBody.workflow.definition))
    setUndoStack([])
    setRedoStack([])
  }, [setEdges, setNodes, workflowId])

  const checkVideoTask = useCallback(
    async (nodeId: string) => {
      const execution = executions.find((item) =>
        item.nodeRecords.some((record) => record.nodeId === nodeId && record.providerTask?.taskId),
      )
      if (!execution) {
        setError('No saved video task is available for this node.')
        return
      }
      setError('')
      try {
        const response = await studioFetch(`/api/studio/workflows/${workflowId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionId: execution.id }),
        })
        const body = (await response.json()) as {
          status?: string
          execution?: ExecutionDocument
          error?: string
        }
        if (!response.ok) throw new Error(body.error || 'Video task status could not be checked.')
        if (body.execution) {
          const updatedExecution = body.execution
          const nextExecutions = [
            updatedExecution,
            ...executions.filter((item) => item.id !== updatedExecution.id),
          ]
          setExecutions(nextExecutions)
          const recordsByNode = new Map(
            updatedExecution.nodeRecords.map((record) => [record.nodeId, record]),
          )
          setNodes((current) =>
            current.map((node) => ({
              ...node,
              data: {
                ...node.data,
                ...(node.data.canvasGroup
                  ? { groupRun: groupRunSummary(node.data.canvasGroup, nextExecutions) }
                  : {}),
                ...(recordsByNode.has(node.id) ? { record: recordsByNode.get(node.id) } : {}),
              },
            })),
          )
          if (!['running', 'queued'].includes(updatedExecution.status)) {
            runStartedAtRef.current = null
            runExecutionIdRef.current = null
            runLockRef.current = false
            setRunStartedAt(null)
            setRunScopeIds([])
            setRunning(false)
          }
        }
        setNotice(
          body.status === 'resumed'
            ? 'Video task completed. The saved workflow continued from its execution snapshot.'
            : body.status === 'pending'
              ? 'Video task is still processing. You can check again without creating another task.'
              : body.status === 'running'
                ? 'The workflow is already active and is checking this provider task.'
                : `Video task status: ${body.status || 'updated'}.`,
        )
      } catch (failure) {
        setError(
          failure instanceof Error ? failure.message : 'Video task status could not be checked.',
        )
      }
    },
    [executions, setNodes, workflowId],
  )

  useEffect(() => {
    // The request resolves asynchronously and then initializes the remote workflow state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    if (!initialFitPendingRef.current || !nodesInitialized) return
    const frame = window.requestAnimationFrame(() => {
      initialFitPendingRef.current = false
      void fitView({ padding: 0.22, duration: 500 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fitView, nodesInitialized])

  useEffect(() => {
    if (!running || !runStartedAt) return

    let active = true
    let requestInFlight = false
    const refreshProgress = async () => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const response = await studioFetch(`/api/studio/workflows/${workflowId}`, {
          cache: 'no-store',
        })
        if (!response.ok) return
        const responseBody = await response.json()
        if (
          !active ||
          runStartedAtRef.current !== runStartedAt ||
          !Array.isArray(responseBody.executions)
        ) {
          return
        }

        const refreshedExecutions = responseBody.executions as ExecutionDocument[]
        const currentExecution =
          refreshedExecutions.find((execution) => execution.id === runExecutionIdRef.current) ??
          refreshedExecutions.find((execution) => execution.startedAt >= runStartedAt)
        if (!currentExecution) return

        runExecutionIdRef.current = currentExecution.id
        setExecutions(refreshedExecutions)
        setRunScopeIds([...executionScopeNodeIds(currentExecution)])
        const recordsById = new Map(
          mergeExecutionNodeRecords(refreshedExecutions).map((record) => [record.nodeId, record]),
        )
        const logsByNodeId = new Map<string, ExecutionLog[]>()
        for (const log of currentExecution.logs ?? []) {
          if (!log.nodeId) continue
          logsByNodeId.set(log.nodeId, [...(logsByNodeId.get(log.nodeId) ?? []), log])
        }
        setNodes((current) =>
          current.map((node) => {
            const record = recordsById.get(node.id)
            return {
              ...node,
              data: {
                ...node.data,
                outputStale: isMediaOutputStale(node.data.workflowNode, refreshedExecutions),
                ...(node.data.canvasGroup
                  ? { groupRun: groupRunSummary(node.data.canvasGroup, refreshedExecutions) }
                  : {}),
                ...(record
                  ? {
                      record: {
                        ...record,
                        outputs: record.outputs ?? node.data.record?.outputs,
                      },
                    }
                  : {}),
                executionLogs: logsByNodeId.get(node.id) ?? [],
              },
            }
          }),
        )
        if (currentExecution.status !== 'running') {
          runStartedAtRef.current = null
          runExecutionIdRef.current = null
          runLockRef.current = false
          setRunStartedAt(null)
          setRunning(false)
        }
      } catch {
        // A temporary progress refresh failure should not interrupt the running execution.
      } finally {
        requestInFlight = false
      }
    }

    void refreshProgress()
    const interval = window.setInterval(() => void refreshProgress(), 900)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [runStartedAt, running, setNodes, workflowId])

  const definitionFromState = useCallback(
    (): WorkflowDefinition => ({
      version: 1,
      nodes: nodes
        .filter((node) => !node.data.canvasGroup)
        .map((node) => ({ ...node.data.workflowNode, position: node.position })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle || '',
        target: edge.target,
        targetHandle: targetPortForEdge(edge),
      })),
      ...(nodes.some((node) => node.data.canvasGroup)
        ? {
            groups: nodes
              .filter((node) => node.data.canvasGroup)
              .map((node) => ({
                ...node.data.canvasGroup!,
                position: node.position,
                width: Number(node.style?.width ?? node.width ?? node.data.canvasGroup!.width),
                height: node.data.canvasGroup!.collapsed
                  ? node.data.canvasGroup!.height
                  : Number(node.style?.height ?? node.height ?? node.data.canvasGroup!.height),
              })),
          }
        : {}),
    }),
    [edges, nodes],
  )

  const restoreDefinition = useCallback(
    (definition: WorkflowDefinition) => {
      setNodes(toFlowNodes(definition))
      setEdges(toFlowEdges(definition))
      setSelectedId(null)
      setDirty(true)
    },
    [setEdges, setNodes],
  )

  const captureHistory = useCallback(() => {
    setUndoStack((current) => [...current, cloneValue(definitionFromState())].slice(-50))
    setRedoStack([])
  }, [definitionFromState])

  const undo = useCallback(() => {
    const previous = undoStack.at(-1)
    if (!previous) return
    setUndoStack((current) => current.slice(0, -1))
    setRedoStack((current) => [...current, cloneValue(definitionFromState())])
    restoreDefinition(previous)
  }, [definitionFromState, restoreDefinition, undoStack])

  const redo = useCallback(() => {
    const next = redoStack.at(-1)
    if (!next) return
    setRedoStack((current) => current.slice(0, -1))
    setUndoStack((current) => [...current, cloneValue(definitionFromState())].slice(-50))
    restoreDefinition(next)
  }, [definitionFromState, redoStack, restoreDefinition])

  const save = useCallback(
    async (definitionOverride?: WorkflowDefinition) => {
      if (!workflow) return false
      setSaving(true)
      setError('')
      const response = await studioFetch(`/api/studio/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description || '',
          definition: definitionOverride ?? definitionFromState(),
        }),
      })
      const responseBody = await response.json()
      setSaving(false)
      if (!response.ok) {
        setError(responseBody.error || 'Could not save workflow.')
        return false
      }
      setWorkflow(responseBody.workflow)
      setDirty(false)
      return true
    },
    [definitionFromState, workflow, workflowId],
  )

  const executeRun = async (
    targetNodeId?: string,
    groupId?: string,
    definitionOverride?: WorkflowDefinition,
    retryOfExecutionId?: string,
  ) => {
    if (runLockRef.current) return
    runLockRef.current = true
    runExecutionIdRef.current = null
    let executionCompleted = false
    setRunning(true)
    setError('')
    try {
      if (!(await save(definitionOverride))) return

      const definition = definitionOverride ?? definitionFromState()
      const group = groupId ? definition.groups?.find((item) => item.id === groupId) : undefined
      const scopeNodeIds = group
        ? runGroupScopeNodeIds(definition, group.nodeIds)
        : runScopeNodeIds(definition, targetNodeId)
      setRunScopeIds([...scopeNodeIds])
      const startedAt = new Date().toISOString()
      runStartedAtRef.current = startedAt
      setRunStartedAt(startedAt)
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: scopeNodeIds.has(node.id)
            ? {
                ...node.data,
                record: {
                  ...node.data.record,
                  nodeId: node.id,
                  status: 'queued',
                  error: undefined,
                },
              }
            : node.data,
        })),
      )

      try {
        setNotice('')
        const response = await studioFetch(`/api/studio/workflows/${workflowId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetNodeId, groupId, retryOfExecutionId }),
        })
        const responseBody = await response.json()
        if (typeof responseBody.executionId === 'string') {
          runExecutionIdRef.current = responseBody.executionId
        }
        executionCompleted = typeof responseBody.executionId === 'string'
        const records: NodeExecutionRecord[] = responseBody.records ?? []
        setNodes((current) =>
          current.map((node) => {
            const nextRecord = records.find((record) => record.nodeId === node.id)
            if (!nextRecord) return node
            const previousOutputs = node.data.record?.outputs
            return {
              ...node,
              data: {
                ...node.data,
                record: {
                  ...nextRecord,
                  outputs: nextRecord.outputs ?? previousOutputs,
                },
              },
            }
          }),
        )
        if (!response.ok) setError(responseBody.error || 'Execution failed.')
        if (responseBody.status === 'cancelled')
          setNotice(
            'Execution stopped. The active provider request may still finish remotely; its result will not replace this workflow output.',
          )
        await load()
      } catch {
        setError('Could not confirm workflow execution. Checking saved outputs…')
        try {
          await load()
        } catch {
          // Keep the execution status visible when a follow-up read also fails.
        }
      }
    } catch {
      setError('Could not start workflow execution.')
    } finally {
      if (runExecutionIdRef.current && !executionCompleted) {
        setRunning(true)
      } else {
        runStartedAtRef.current = null
        runExecutionIdRef.current = null
        setRunStartedAt(null)
        setRunning(false)
        runLockRef.current = false
      }
    }
  }

  const run = async (targetNodeId?: string, groupId?: string, retry = false) => {
    if (running || runLockRef.current) return
    const definition = definitionFromState()
    const selectedGroup = groupId ? definition.groups?.find((group) => group.id === groupId) : null
    if (groupId && !selectedGroup) return
    const scopeNodeIds = selectedGroup
      ? runGroupScopeNodeIds(definition, selectedGroup.nodeIds)
      : runScopeNodeIds(definition, targetNodeId)
    const previousMediaCount = nodes.filter(
      (node) => scopeNodeIds.has(node.id) && hasGeneratedMediaOutput(node),
    ).length
    const retryOfExecutionId =
      retry && targetNodeId
        ? executions.find((execution) =>
            execution.nodeRecords.some(
              (record) =>
                record.nodeId === targetNodeId &&
                ['failed', 'cancelled', 'interrupted'].includes(record.status),
            ),
          )?.id
        : undefined
    if (previousMediaCount) {
      setRunConfirmation({ targetNodeId, groupId, retryOfExecutionId, previousMediaCount })
      return
    }
    await executeRun(targetNodeId, groupId, undefined, retryOfExecutionId)
  }

  const stopRun = async () => {
    setError('')
    try {
      const response = await studioFetch(`/api/studio/workflows/${workflowId}/execute`, {
        method: 'DELETE',
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'The workflow could not be stopped.')
      setNotice('Stop requested. Waiting for the active provider request to settle.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The workflow could not be stopped.')
    }
  }

  const selectedNode = nodes.find((node) => node.id === selectedId && !node.data.canvasGroup)
  const selectedGroupNode = nodes.find((node) => node.id === selectedId && node.data.canvasGroup)
  const selectedGroup = selectedGroupNode?.data.canvasGroup
  const contextNode = contextMenu?.nodeId
    ? nodes.find((node) => node.id === contextMenu.nodeId)
    : undefined
  const contextGroups = (() => {
    if (!contextNode || contextNode.data.canvasGroup) return []
    const groups = definitionFromState().groups ?? []
    const nodeIsGrouped = groups.some((group) => group.nodeIds.includes(contextNode.id))
    if (nodeIsGrouped) return []
    return groups.filter((group) => !group.nodeIds.includes(contextNode.id))
  })()
  const workflowNodes = nodes.filter((node) => !node.data.canvasGroup)
  const selectedWorkflowNodes = workflowNodes.filter((node) => node.selected)
  const selectedDefinition = selectedNode
    ? registryByType.get(selectedNode.data.workflowNode.type)
    : undefined
  const pickerNodeDefinitions = paletteNodeRegistry.filter((item) => {
    const matchesSearch = `${item.displayName} ${item.description} ${item.category}`
      .toLowerCase()
      .includes(pickerSearch.toLowerCase())
    if (!matchesSearch || !pendingNodeConnection) return matchesSearch
    const definition = registryByType.get(item.type)
    const ports =
      pendingNodeConnection.handleType === 'source' ? definition?.inputs : definition?.outputs
    return ports?.some((port) => port.dataType === pendingNodeConnection.dataType) ?? false
  })
  const latestExecution = executions[0]
  const latestExecutionNodeNames = new Map(
    (latestExecution?.snapshot.nodes ?? []).map((node) => [node.id, node.name]),
  )
  const runScope = new Set(runScopeIds)
  const runNodes = nodes.filter((node) => runScope.has(node.id))
  const runningNodeNames = runNodes
    .filter((node) => node.data.record?.status === 'running')
    .map((node) => node.data.workflowNode.name)
  const completedRunNodeCount = runNodes.filter((node) =>
    ['succeeded', 'failed', 'skipped'].includes(node.data.record?.status ?? ''),
  ).length
  const runningNodeLabel = runningNodeNames.length
    ? runningNodeNames.join(', ')
    : 'Preparing workflow'
  const isTextInputNode = Boolean(
    selectedNode && ['input.text', 'input.prompt'].includes(selectedNode.data.workflowNode.type),
  )
  const isMediaConfiguration = Boolean(
    selectedNode &&
    [
      'input.image',
      'input.video',
      'input.audio',
      'ai.analyze-image',
      'ai.generate-image',
      'ai.edit-image',
      'ai.generate-video',
      'ai.image-to-video',
      'ai.generate-audio',
      'processing.compose-layout',
      'output.save-image',
      'output.save-video',
    ].includes(selectedNode.data.workflowNode.type),
  )

  useEffect(() => {
    let active = true
    const frame = window.requestAnimationFrame(() => {
      setZoomPercent(Math.round(getZoom() * 100))
    })
    void (async () => {
      const settings = await getRecord('settings', 'current')
      let storedWidth = Number(workflowEditorPreferences(settings).sidePanelWidth)
      if (!Number.isFinite(storedWidth) || storedWidth < 220 || storedWidth > 480) {
        const legacyWidth = Number(window.localStorage.getItem('zenith:workflow-side-panel-width'))
        if (Number.isFinite(legacyWidth) && legacyWidth >= 220 && legacyWidth <= 480) {
          storedWidth = legacyWidth
          await saveWorkflowEditorPreferences({ sidePanelWidth: Math.round(legacyWidth) })
          window.localStorage.removeItem('zenith:workflow-side-panel-width')
        }
      }
      if (active && Number.isFinite(storedWidth) && storedWidth >= 220 && storedWidth <= 480) {
        setPaletteWidth(storedWidth)
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (active) setPaletteWidthLoaded(true)
      })
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
    }
  }, [getZoom])

  useEffect(() => {
    if (!paletteWidthLoaded) return
    const timeout = window.setTimeout(() => {
      void saveWorkflowEditorPreferences({ sidePanelWidth: Math.round(paletteWidth) }).catch(
        () => undefined,
      )
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [paletteWidth, paletteWidthLoaded])

  const focusSelection = () => {
    const selected = nodes.filter((node) => node.selected)
    if (!selected.length) return
    fitView({ nodes: selected, padding: 0.35, duration: 300 })
  }

  const alignSelection = (axis: 'x' | 'y') => {
    if (selectedWorkflowNodes.length < 2) return
    captureHistory()
    const coordinate = Math.min(
      ...selectedWorkflowNodes.map((node) => (axis === 'x' ? node.position.x : node.position.y)),
    )
    const selectedIds = new Set(selectedWorkflowNodes.map((node) => node.id))
    setNodes((current) =>
      current.map((node) =>
        selectedIds.has(node.id)
          ? {
              ...node,
              position:
                axis === 'x'
                  ? { ...node.position, x: coordinate }
                  : { ...node.position, y: coordinate },
            }
          : node,
      ),
    )
    setDirty(true)
  }

  const distributeSelection = () => {
    if (selectedWorkflowNodes.length < 3) return
    const ordered = [...selectedWorkflowNodes].sort(
      (left, right) => left.position.x - right.position.x,
    )
    const start = ordered[0].position.x
    const end = ordered.at(-1)!.position.x
    if (start === end) return
    captureHistory()
    const positions = new Map(
      ordered.map((node, index) => [
        node.id,
        start + ((end - start) * index) / (ordered.length - 1),
      ]),
    )
    setNodes((current) =>
      current.map((node) => {
        const x = positions.get(node.id)
        return x === undefined ? node : { ...node, position: { ...node.position, x } }
      }),
    )
    setDirty(true)
  }

  const exportSelection = () => {
    if (!selectedWorkflowNodes.length) return
    const ids = new Set(selectedWorkflowNodes.map((node) => node.id))
    const selection = redactDiagnosticData({
      version: 1,
      nodes: selectedWorkflowNodes.map((node) => node.data.workflowNode),
      edges: definitionFromState().edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    })
    const blob = new Blob([JSON.stringify(selection, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'zenith-workflow-selection.json'
    anchor.click()
    requestAnimationFrame(() => URL.revokeObjectURL(url))
    setNotice('The selected nodes were exported as redacted JSON.')
  }

  const insertAsset = (asset: {
    id: string
    kind?: string
    title?: string
    content?: string
    filename?: string
    alt?: string
    mimeType?: string
    url?: string | null
    filesize?: number
  }) => {
    const targetNode = nodes.find((node) => node.id === selectedId && !node.data.canvasGroup)
    const targetDefinition = targetNode
      ? registryByType.get(targetNode.data.workflowNode.type)
      : undefined
    if (asset.kind === 'text') {
      if (
        targetNode &&
        ['input.text', 'input.prompt'].includes(targetNode.data.workflowNode.type)
      ) {
        updateNodeConfig(targetNode.id, { value: asset.content || '', textAssetId: asset.id })
        setNotice('Text asset inserted into the selected input.')
      } else {
        addNode('input.prompt', undefined, { value: asset.content || '', textAssetId: asset.id })
      }
      return
    }
    const mimeType = asset.mimeType || ''
    const type = mimeType.startsWith('image/')
      ? 'input.image'
      : mimeType.startsWith('video/')
        ? 'input.video'
        : mimeType.startsWith('audio/')
          ? 'input.audio'
          : 'input.file'
    if (!registryByType.has(type)) {
      setError('This asset type cannot be connected to a workflow node yet.')
      return
    }
    const config = {
      assetId: asset.id,
      url: mediaSource(asset.url || '', asset.id, asset.filename),
      fileName: asset.filename || asset.title || '',
      mimeType,
      ...(asset.filesize ? { fileSize: asset.filesize } : {}),
    }
    if (targetNode?.data.workflowNode.type === type) {
      updateNodeConfig(targetNode.id, config)
      setNotice('Asset replaced the selected media input.')
      return
    }

    const mediaType = type === 'input.image' ? 'image' : type === 'input.video' ? 'video' : 'audio'
    const referencePort = targetDefinition?.inputs.find(
      (port) =>
        port.dataType === mediaType &&
        (port.multiple ||
          !edges.some(
            (edge) => edge.target === targetNode?.id && targetPortForEdge(edge) === port.id,
          )),
    )
    if (targetNode && targetDefinition?.inputs.some((port) => port.dataType === mediaType)) {
      if (!referencePort) {
        setError('All compatible reference inputs on this node are already connected.')
        return
      }
      const inputType = mediaType === 'image' ? 'input.image' : `input.${mediaType}`
      const inputDefinition = registryByType.get(inputType)
      const sourcePort = inputDefinition?.outputs.find((port) => port.dataType === mediaType)
      if (!inputDefinition?.available || !sourcePort) {
        setError('This asset type cannot be connected to a workflow node yet.')
        return
      }
      const id = `${inputType.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`
      const workflowNode: WorkflowNode = {
        id,
        type: inputType,
        name: asset.title || asset.filename || inputDefinition.displayName,
        slug: `${inputType.replaceAll('.', '-')}-${id.slice(-4)}`,
        position: { x: targetNode.position.x - 400, y: targetNode.position.y },
        config: { ...cloneValue(inputDefinition.defaultConfig), ...config },
      }
      captureHistory()
      setNodes((current) => [
        ...current,
        { id, type: 'studioNode', position: workflowNode.position, data: { workflowNode } },
      ])
      setEdges((current) =>
        addEdge(
          {
            id: `edge-${crypto.randomUUID().slice(0, 8)}`,
            source: id,
            sourceHandle: sourcePort.id,
            target: targetNode.id,
            targetHandle: `type-${mediaType}`,
            data: { targetPort: referencePort.id },
            type: 'bezier',
            style: { stroke: portColor(mediaType), strokeWidth: 2 },
          },
          current,
        ),
      )
      setSelectedId(id)
      setDirty(true)
      setNotice('Asset connected to the selected reference input.')
      return
    }
    addNode(type, undefined, config)
  }

  const insertPrompt = (prompt: { id: string; title: string; content: string }) => {
    const targetNode = nodes.find((node) => node.id === selectedId && !node.data.canvasGroup)
    if (targetNode && ['input.text', 'input.prompt'].includes(targetNode.data.workflowNode.type)) {
      updateNodeConfig(targetNode.id, { value: prompt.content, promptId: prompt.id })
      setNotice('Prompt inserted into the selected text node.')
      return
    }
    addNode('input.prompt', undefined, {
      value: prompt.content,
      promptId: prompt.id,
      title: prompt.title,
    })
  }

  const addNode = (
    type: string,
    at?: { x: number; y: number },
    config?: Record<string, unknown>,
  ): string | null => {
    const definition = registryByType.get(type)
    if (!definition?.available) return null
    const connection = pendingNodeConnection
    const connectionPort = connection
      ? connection.handleType === 'source'
        ? definition.inputs.find((port) => port.dataType === connection.dataType)
        : definition.outputs.find((port) => port.dataType === connection.dataType)
      : undefined
    if (connection && !connectionPort) {
      setError('Choose a node with a matching typed port to complete this connection.')
      return null
    }
    captureHistory()
    const id = `${type.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`
    const workflowNode: WorkflowNode = {
      id,
      type,
      name: definition.displayName,
      slug: `${definition.displayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${id.slice(-4)}`,
      position: at ?? pickerPosition ?? { x: 120 + nodes.length * 36, y: 120 + nodes.length * 26 },
      config: { ...cloneValue(definition.defaultConfig), ...config },
    }
    setNodes((current) => [
      ...current,
      { id, type: 'studioNode', position: workflowNode.position, data: { workflowNode } },
    ])
    if (connection && connectionPort) {
      const sourceNodeId = connection.handleType === 'source' ? connection.nodeId : id
      const targetNodeId = connection.handleType === 'source' ? id : connection.nodeId
      const sourceHandle =
        connection.handleType === 'source' ? connection.handleId : connectionPort.id
      const targetPortId =
        connection.handleType === 'source' ? connectionPort.id : connection.targetPortId
      setEdges((current) =>
        addEdge(
          {
            id: `edge-${crypto.randomUUID().slice(0, 8)}`,
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle: `type-${connection.dataType}`,
            data: { targetPort: targetPortId },
            type: 'bezier',
            style: { stroke: portColor(connection.dataType), strokeWidth: 2 },
          },
          current,
        ),
      )
    }
    setSelectedId(id)
    setInspectorOpen(false)
    setDirty(true)
    setNodePickerOpen(false)
    setPendingNodeConnection(null)
    setContextMenu(null)
    return id
  }

  const addReferenceInput = (targetNodeId: string, targetPortId: string) => {
    const target = nodes.find((node) => node.id === targetNodeId && !node.data.canvasGroup)
    const targetDefinition = registryByType.get(target?.data.workflowNode.type || '')
    const targetPort = targetDefinition?.inputs.find((port) => port.id === targetPortId)
    const inputType =
      targetPort?.dataType === 'image' ? 'input.image' : `input.${targetPort?.dataType}`
    const inputDefinition = registryByType.get(inputType)
    const sourcePort = inputDefinition?.outputs.find(
      (port) => port.dataType === targetPort?.dataType,
    )
    if (!target || !targetPort || !inputDefinition?.available || !sourcePort) return
    if (
      !targetPort.multiple &&
      edges.some((edge) => edge.target === targetNodeId && targetPortForEdge(edge) === targetPortId)
    ) {
      setError(`The ${targetPort.name.toLowerCase()} input is already connected.`)
      return
    }

    const id = `${inputType.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`
    const position = { x: target.position.x, y: target.position.y + 360 }
    const workflowNode: WorkflowNode = {
      id,
      type: inputType,
      name: inputDefinition.displayName,
      slug: `${inputType.replaceAll('.', '-')}-${id.slice(-4)}`,
      position,
      config: cloneValue(inputDefinition.defaultConfig),
    }
    captureHistory()
    setNodes((current) => [
      ...current,
      { id, type: 'studioNode', position, data: { workflowNode } },
    ])
    setEdges((current) =>
      addEdge(
        {
          id: `edge-${crypto.randomUUID().slice(0, 8)}`,
          source: id,
          sourceHandle: sourcePort.id,
          target: targetNodeId,
          targetHandle: `type-${targetPort.dataType}`,
          data: { targetPort: targetPort.id },
          type: 'bezier',
          style: { stroke: portColor(targetPort.dataType), strokeWidth: 2 },
        },
        current,
      ),
    )
    setSelectedId(id)
    setInspectorOpen(false)
    setDirty(true)
    setError('')
  }

  const generateImageFromText = (sourceNodeId: string) => {
    const sourceNode = nodes.find((node) => node.id === sourceNodeId && !node.data.canvasGroup)
    const sourceType = sourceNode?.data.workflowNode.type
    const sourceText = String(sourceNode?.data.workflowNode.config.value || '').trim()
    const sourceDefinition = sourceType ? registryByType.get(sourceType) : undefined
    const imageDefinition = registryByType.get('ai.generate-image')
    const sourcePort = sourceDefinition?.outputs.find((port) => port.dataType === 'text')
    const promptPort = imageDefinition?.inputs.find(
      (port) => port.id === 'prompt' && port.dataType === 'text',
    )
    if (!sourceNode || !sourceText || !sourcePort || !promptPort || !imageDefinition?.available) {
      setError('Add text to this node before generating an image.')
      return
    }
    const imageNodeId = `ai-generate-image-${crypto.randomUUID().slice(0, 8)}`
    const workflowNode: WorkflowNode = {
      id: imageNodeId,
      type: 'ai.generate-image',
      name: imageDefinition.displayName,
      slug: `generate-image-${imageNodeId.slice(-4)}`,
      position: { x: sourceNode.position.x + 440, y: sourceNode.position.y },
      config: { ...cloneValue(imageDefinition.defaultConfig), prompt: sourceText },
    }
    const workflowEdge: WorkflowEdge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      source: sourceNodeId,
      sourceHandle: sourcePort.id,
      target: imageNodeId,
      targetHandle: promptPort.id,
    }
    const definition = definitionFromState()
    const nextDefinition: WorkflowDefinition = {
      ...definition,
      nodes: [...definition.nodes, workflowNode],
      edges: [...definition.edges, workflowEdge],
    }
    captureHistory()
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id: imageNodeId,
        type: 'studioNode',
        position: workflowNode.position,
        selected: true,
        data: { workflowNode },
      },
    ])
    const targetPortColor = portColor(promptPort.dataType)
    setEdges((current) =>
      addEdge(
        {
          id: workflowEdge.id,
          source: sourceNodeId,
          sourceHandle: sourcePort.id,
          target: imageNodeId,
          targetHandle: `type-${promptPort.dataType}`,
          data: { targetPort: promptPort.id },
          type: 'bezier',
          style: { stroke: targetPortColor, strokeWidth: 2 },
        },
        current,
      ),
    )
    setSelectedId(imageNodeId)
    setInspectorOpen(false)
    setDirty(true)
    requestAnimationFrame(() =>
      fitView({ nodes: [{ id: imageNodeId }], padding: 0.4, duration: 400 }),
    )
    void executeRun(imageNodeId, undefined, nextDefinition)
  }

  const addDerivedImages = (
    sourceNodeId: string,
    action: ImageToolAction,
    assets: DerivedImageAsset[],
  ) => {
    const sourceNode = nodes.find((node) => node.id === sourceNodeId && !node.data.canvasGroup)
    const imageDefinition = registryByType.get('input.image')
    if (!sourceNode || !imageDefinition?.available || !assets.length) return
    const parentGroup = nodes.find((node) => node.data.canvasGroup?.nodeIds.includes(sourceNodeId))
    const baseX = parentGroup
      ? parentGroup.position.x + Number(parentGroup.style?.width ?? parentGroup.width ?? 360) + 72
      : sourceNode.position.x + 400
    const baseY = sourceNode.position.y
    const actionName =
      action === 'super-resolution'
        ? 'Super-resolution'
        : action === 'capture-frame'
          ? 'Capture frame'
          : action[0].toUpperCase() + action.slice(1)
    const newFlowNodes = assets.map((asset, index) => {
      const id = `input-image-${crypto.randomUUID().slice(0, 8)}`
      const filename = asset.filename || `${actionName.toLowerCase()}-${index + 1}.png`
      const workflowNode: WorkflowNode = {
        id,
        type: 'input.image',
        name: `${sourceNode.data.workflowNode.name} · ${actionName}${assets.length > 1 ? ` ${index + 1}` : ''}`,
        slug: `${actionName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${id.slice(-4)}`,
        position: { x: baseX, y: baseY + index * 230 },
        config: {
          ...cloneValue(imageDefinition.defaultConfig),
          assetId: asset.id,
          url: asset.url || `/api/media/file/${encodeURIComponent(filename)}`,
          fileName: filename,
          mimeType: asset.mimeType || 'image/png',
          ...(asset.derivedMetadata ? { derivedMetadata: asset.derivedMetadata } : {}),
        },
      }
      return {
        id,
        type: 'studioNode' as const,
        position: workflowNode.position,
        selected: index === 0,
        data: { workflowNode },
      }
    })
    captureHistory()
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...newFlowNodes,
    ])
    setSelectedId(newFlowNodes[0].id)
    setInspectorOpen(false)
    setDirty(true)
    setNotice(
      assets.length === 1
        ? `Derived ${actionName.toLowerCase()} image added to the canvas.`
        : `${assets.length} split images added to the canvas in reading order.`,
    )
    requestAnimationFrame(() => fitView({ nodes: newFlowNodes, padding: 0.3, duration: 450 }))
  }

  const createGroup = () => {
    const definition = definitionFromState()
    const existingMembership = new Set(definition.groups?.flatMap((group) => group.nodeIds) ?? [])
    const selectedNodes = nodes.filter(
      (node) => node.selected && !node.data.canvasGroup && !existingMembership.has(node.id),
    )
    const groupId = `group-${crypto.randomUUID().slice(0, 8)}`
    const positions = selectedNodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? 320,
      height: node.measured?.height ?? 180,
    }))
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const left = positions.length ? Math.min(...positions.map((item) => item.x)) - 24 : center.x
    const top = positions.length ? Math.min(...positions.map((item) => item.y)) - 60 : center.y
    const right = positions.length
      ? Math.max(...positions.map((item) => item.x + item.width)) + 24
      : center.x + 360
    const bottom = positions.length
      ? Math.max(...positions.map((item) => item.y + item.height)) + 24
      : center.y + 240
    const group: WorkflowGroup = {
      id: groupId,
      name: selectedNodes.length ? 'New group' : 'Empty group',
      color: '#7668b1',
      collapsed: false,
      nodeIds: selectedNodes.map((node) => node.id),
      position: { x: left, y: top },
      width: Math.max(320, right - left),
      height: Math.max(180, bottom - top),
    }
    captureHistory()
    setNodes((current) => [
      createGroupFlowNode(group, true),
      ...current.map((node) => ({ ...node, selected: false })),
    ])
    setSelectedId(workflowGroupFlowId(group.id))
    setInspectorOpen(true)
    setDirty(true)
  }

  const updateGroup = (groupId: string, patch: Partial<WorkflowGroup>) => {
    const groupNodeId = workflowGroupFlowId(groupId)
    captureHistory()
    setNodes((current) => {
      const oldGroupNode = current.find((node) => node.id === groupNodeId)
      if (!oldGroupNode?.data.canvasGroup) return current
      const previousGroup = oldGroupNode.data.canvasGroup
      const nextGroup = { ...previousGroup, ...patch }
      const previousMembers = new Set(previousGroup.nodeIds)
      const nextMembers = new Set(nextGroup.nodeIds)
      return current.map((node) => {
        if (node.id === groupNodeId) {
          return {
            ...node,
            position: nextGroup.position,
            style: {
              ...node.style,
              width: nextGroup.width,
              height: nextGroup.collapsed ? 56 : nextGroup.height,
            },
            data: {
              ...node.data,
              workflowNode: { ...node.data.workflowNode, name: nextGroup.name },
              canvasGroup: nextGroup,
            },
          }
        }
        if (node.data.canvasGroup) return node
        if (previousMembers.has(node.id) || nextMembers.has(node.id)) {
          return {
            ...node,
            hidden: nextMembers.has(node.id) ? Boolean(nextGroup.collapsed) : false,
          }
        }
        return node
      })
    })
    setDirty(true)
  }

  const addNodeToGroup = (groupId: string, nodeId: string) => {
    const definition = definitionFromState()
    const group = definition.groups?.find((item) => item.id === groupId)
    const node = nodes.find((item) => item.id === nodeId && !item.data.canvasGroup)
    if (!group || !node || group.nodeIds.includes(nodeId)) return
    if (definition.groups?.some((item) => item.id !== groupId && item.nodeIds.includes(nodeId))) {
      setError('This node already belongs to another group.')
      return
    }
    const left = Math.min(group.position.x, node.position.x - 24)
    const top = Math.min(group.position.y, node.position.y - 60)
    const right = Math.max(
      group.position.x + group.width,
      node.position.x + (node.measured?.width ?? node.width ?? 320) + 24,
    )
    const bottom = Math.max(
      group.position.y + group.height,
      node.position.y + (node.measured?.height ?? node.height ?? 180) + 24,
    )
    updateGroup(groupId, {
      nodeIds: [...group.nodeIds, nodeId],
      position: { x: left, y: top },
      width: right - left,
      height: bottom - top,
    })
    setSelectedId(workflowGroupFlowId(groupId))
    setInspectorOpen(true)
  }

  const ungroup = (groupId: string) => {
    const groupFlowId = workflowGroupFlowId(groupId)
    const groupNode = nodes.find((node) => node.id === groupFlowId)
    if (!groupNode?.data.canvasGroup) return
    captureHistory()
    const memberIds = new Set(groupNode.data.canvasGroup.nodeIds)
    setNodes((current) =>
      current
        .filter((node) => node.id !== groupFlowId)
        .map((node) => (memberIds.has(node.id) ? { ...node, hidden: false } : node)),
    )
    setSelectedId(null)
    setInspectorOpen(false)
    setDirty(true)
  }

  const openNodePicker = (position?: { x: number; y: number }) => {
    setPickerPosition(position ?? null)
    setPendingNodeConnection(null)
    setPickerSearch('')
    setNodePickerOpen(true)
    setContextMenu(null)
  }

  const openCompatibleNodePicker = (
    event: MouseEvent | TouchEvent,
    connectionState: {
      fromNode?: { id: string } | null
      fromHandle?: { id?: string | null; type?: string | null } | null
      toNode?: unknown
    },
  ) => {
    if (
      !connectionState.fromNode ||
      !connectionState.fromHandle?.id ||
      !connectionState.fromHandle.type ||
      connectionState.toNode
    )
      return
    const { fromNode, fromHandle } = connectionState
    if (fromHandle.type !== 'source' && fromHandle.type !== 'target') return
    const startNode = nodes.find((node) => node.id === fromNode.id && !node.data.canvasGroup)
    const startDefinition = startNode
      ? registryByType.get(startNode.data.workflowNode.type)
      : undefined
    const port =
      fromHandle.type === 'source'
        ? startDefinition?.outputs.find((item) => item.id === fromHandle.id)
        : startDefinition?.inputs.find(
            (item) =>
              `type-${item.dataType}` === fromHandle.id &&
              (item.multiple ||
                !edges.some(
                  (edge) => edge.target === fromNode.id && targetPortForEdge(edge) === item.id,
                )),
          )
    if (!port) return
    const compatible = paletteNodeRegistry.some((candidate) => {
      const candidateDefinition = registryByType.get(candidate.type)
      return (
        fromHandle.type === 'source' ? candidateDefinition?.inputs : candidateDefinition?.outputs
      )?.some((item) => item.dataType === port.dataType)
    })
    if (!compatible) return
    const touch = 'changedTouches' in event ? event.changedTouches[0] : undefined
    const clientX = touch?.clientX ?? ('clientX' in event ? event.clientX : undefined)
    const clientY = touch?.clientY ?? ('clientY' in event ? event.clientY : undefined)
    if (clientX === undefined || clientY === undefined) return
    const position = screenToFlowPosition({ x: clientX, y: clientY })
    setPendingNodeConnection({
      nodeId: startNode!.id,
      handleId: fromHandle.id!,
      handleType: fromHandle.type,
      dataType: port.dataType,
      targetPortId: fromHandle.type === 'target' ? port.id : '',
      position,
    })
    setPickerPosition(position)
    setPickerSearch('')
    setNodePickerOpen(true)
    setContextMenu(null)
  }

  const uploadMedia = async (files: File[]) => {
    if (!files.length || mediaUploadProgress) return
    setError('')
    const failures: string[] = []
    const uploadedNodes: StudioNode[] = []
    let uploadedCount = 0
    const basePosition = pickerPosition ?? {
      x: 120 + nodes.length * 36,
      y: 120 + nodes.length * 26,
    }

    for (const [index, file] of files.entries()) {
      setMediaUploadProgress({ completed: index + 1, total: files.length })
      try {
        const form = new FormData()
        form.set('file', file)
        form.set('alt', file.name)
        form.set('scope', 'workflow')
        const response = await studioFetch('/api/studio/assets', { method: 'POST', body: form })
        const responseBody = await response.json()
        if (!response.ok || !responseBody.media) {
          failures.push(`${file.name}: ${responseBody.error || 'Could not upload media.'}`)
          continue
        }

        const media = responseBody.media
        const config = {
          assetId: media.id,
          workflowUpload: true,
          url: mediaSource(media.url, media.id, media.filename),
          fileName: media.filename || file.name,
          mimeType: media.mimeType || file.type,
          ...(file.type.startsWith('image/') && media.width > 0 && media.height > 0
            ? { imageWidth: media.width, imageHeight: media.height }
            : {}),
        }
        const type = file.type.startsWith('audio/')
          ? 'input.audio'
          : file.type.startsWith('video/')
            ? 'input.video'
            : 'input.image'
        const target = uploadTarget.current
        const targetNode =
          target.type === 'selected'
            ? nodes.find((node) => node.id === target.nodeId && !node.data.canvasGroup)
            : undefined
        if (target.type === 'selected' && files.length === 1) {
          if (targetNode?.data.workflowNode.type !== type) {
            const expected = targetNode
              ? registryByType.get(targetNode.data.workflowNode.type)?.outputs[0]?.dataType
              : undefined
            failures.push(
              `${file.name}: Choose a ${expected || 'matching'} file to replace this input.`,
            )
            continue
          }
          updateNodeConfig(targetNode.id, config)
        } else {
          const definition = registryByType.get(type)
          if (!definition?.available) {
            failures.push(`${file.name}: This media input node is unavailable.`)
            continue
          }
          const id = `${type.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`
          const position = {
            x: basePosition.x + uploadedNodes.length * 48,
            y: basePosition.y + uploadedNodes.length * 42,
          }
          const workflowNode: WorkflowNode = {
            id,
            type,
            name: definition.displayName,
            slug: `${definition.displayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${id.slice(-4)}`,
            position,
            config: { ...cloneValue(definition.defaultConfig), ...config },
          }
          uploadedNodes.push({
            id,
            type: 'studioNode',
            position,
            data: { workflowNode },
          })
        }
        uploadedCount += 1
      } catch {
        failures.push(`${file.name}: Could not upload media.`)
      }
    }

    if (uploadedNodes.length) {
      captureHistory()
      setNodes((current) => [...current, ...uploadedNodes])
      setSelectedId(uploadedNodes.at(-1)?.id ?? null)
      setInspectorOpen(false)
      setDirty(true)
      setNodePickerOpen(false)
      setContextMenu(null)
    }
    setMediaUploadProgress(null)
    uploadTarget.current = { type: 'new' }
    if (mediaInput.current) mediaInput.current.multiple = true
    if (failures.length) {
      setError(
        `Uploaded ${uploadedCount} of ${files.length} files. ${failures.slice(0, 3).join(' ')}${failures.length > 3 ? ` And ${failures.length - 3} more failed.` : ''}`,
      )
    }
  }

  const replaceMediaInput = (nodeId: string) => {
    uploadTarget.current = { type: 'selected', nodeId }
    if (!mediaInput.current) return
    mediaInput.current.multiple = false
    mediaInput.current.click()
  }

  const connect = (connection: Connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source)
    const targetNode = nodes.find((node) => node.id === connection.target)
    if (!sourceNode || !targetNode || !connection.sourceHandle) return
    const sourcePort = registryByType
      .get(sourceNode.data.workflowNode.type)
      ?.outputs.find((port) => port.id === connection.sourceHandle)
    if (sourcePort && connection.targetHandle !== `type-${sourcePort.dataType}`) {
      setError(`Connect ${sourcePort.dataType} output to the matching ${sourcePort.dataType} icon.`)
      return
    }
    const compatiblePorts = registryByType
      .get(targetNode.data.workflowNode.type)
      ?.inputs.filter((port) => port.dataType === sourcePort?.dataType)
    const targetPort = compatiblePorts?.find(
      (port) =>
        port.multiple ||
        !edges.some(
          (edge) => edge.target === connection.target && targetPortForEdge(edge) === port.id,
        ),
    )
    if (!sourcePort || !compatiblePorts?.length) {
      setError('Those ports are not type-compatible.')
      return
    }
    if (!targetPort) {
      setError(
        `All compatible inputs on “${targetNode.data.workflowNode.name}” are already connected.`,
      )
      return
    }
    if (
      edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.sourceHandle === connection.sourceHandle &&
          edge.target === connection.target &&
          targetPortForEdge(edge) === targetPort.id,
      )
    )
      return
    captureHistory()
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          targetHandle: `type-${sourcePort.dataType}`,
          data: { targetPort: targetPort.id },
          type: 'bezier',
          style: { stroke: portColor(sourcePort.dataType), strokeWidth: 2 },
        },
        current,
      ),
    )
    setDirty(true)
    setError('')
  }

  const reconnect = (oldEdge: Edge, connection: Connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source)
    const targetNode = nodes.find((node) => node.id === connection.target)
    const sourcePort = registryByType
      .get(sourceNode?.data.workflowNode.type || '')
      ?.outputs.find((port) => port.id === connection.sourceHandle)
    if (sourcePort && connection.targetHandle !== `type-${sourcePort.dataType}`) {
      setError(`Connect ${sourcePort.dataType} output to the matching ${sourcePort.dataType} icon.`)
      return
    }
    const compatiblePorts = registryByType
      .get(targetNode?.data.workflowNode.type || '')
      ?.inputs.filter((port) => port.dataType === sourcePort?.dataType)
    const targetPort = compatiblePorts?.find(
      (port) =>
        port.multiple ||
        !edges.some(
          (edge) =>
            edge.id !== oldEdge.id &&
            edge.target === connection.target &&
            targetPortForEdge(edge) === port.id,
        ),
    )
    if (!sourcePort || !targetPort) {
      setError('No compatible input is available for this connection.')
      return
    }
    captureHistory()
    setEdges((current) =>
      reconnectEdge(
        oldEdge,
        { ...connection, targetHandle: `type-${sourcePort.dataType}` },
        current,
      ).map((edge) =>
        edge.id === oldEdge.id
          ? {
              ...edge,
              data: { ...edge.data, targetPort: targetPort.id },
              type: 'bezier',
              style: { stroke: portColor(sourcePort.dataType), strokeWidth: 2 },
            }
          : edge,
      ),
    )
    setDirty(true)
    setError('')
  }

  const updateSelected = (patch: Partial<WorkflowNode>) => {
    if (!selectedId) return
    captureHistory()
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedId
          ? {
              ...node,
              data: { ...node.data, workflowNode: { ...node.data.workflowNode, ...patch } },
            }
          : node,
      ),
    )
    setDirty(true)
  }

  const updateNodeConfig = (nodeId: string, patch: Record<string, unknown>) => {
    const target = nodes.find((node) => node.id === nodeId)
    if (!target) return
    const imageOrVideoGenerator = [
      'ai.generate-image',
      'ai.edit-image',
      'ai.generate-video',
      'ai.image-to-video',
    ].includes(target.data.workflowNode.type)
    const generationSettingsChanged =
      imageOrVideoGenerator &&
      Object.entries(patch).some(
        ([key, value]) =>
          [
            'aspectRatio',
            'quality',
            'duration',
            'resolution',
            'size',
            'count',
            'generateAudio',
            'provider',
            'model',
          ].includes(key) && String(value) !== String(target.data.workflowNode.config[key]),
      )
    const configPatch = generationSettingsChanged
      ? {
          ...patch,
          selectedOutput: null,
          outputRevision:
            typeof patch.outputRevision === 'string' ? patch.outputRevision : nextOutputRevision(),
        }
      : patch
    const workflowNode = {
      ...target.data.workflowNode,
      config: { ...target.data.workflowNode.config, ...configPatch },
    }
    captureHistory()
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              ...(patch.lockImageAspectRatio === true
                ? {
                    height: undefined,
                    style: { ...node.style, height: undefined },
                  }
                : {}),
              data: {
                ...node.data,
                workflowNode,
                outputStale: isMediaOutputStale(workflowNode, executions),
              },
            }
          : node,
      ),
    )
    setDirty(true)
  }

  const resizeNode = (nodeId: string, width: number, height?: number) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              width,
              height,
              style: { ...node.style, width, height },
              data: {
                ...node.data,
                workflowNode: {
                  ...node.data.workflowNode,
                  config: {
                    ...node.data.workflowNode.config,
                    displayWidth: width,
                    displayHeight: height ?? 0,
                  },
                },
              },
            }
          : node,
      ),
    )
    setDirty(true)
  }

  const updateConfigMany = (patch: Record<string, unknown>) => {
    if (!selectedNode) return
    updateNodeConfig(selectedNode.id, patch)
  }

  const updateConfig = (key: string, value: unknown) => {
    updateConfigMany({ [key]: value })
  }

  const selectMediaVersion = (nodeId: string, output: import('@znith/contracts').NodeValue) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    if (
      node.data.workflowNode.type === 'input.image' ||
      node.data.workflowNode.type === 'input.video'
    ) {
      const value =
        output.value && typeof output.value === 'object'
          ? (output.value as Record<string, unknown>)
          : {}
      updateNodeConfig(nodeId, {
        url: mediaOutputURL(output),
        assetId: output.assetId || output.metadata?.assetId || '',
        fileName: value.fileName || output.metadata?.filename || output.metadata?.fileName || '',
        mimeType:
          value.mimeType ||
          output.metadata?.mimeType ||
          (output.type === 'image' ? 'image/png' : 'video/mp4'),
        selectedOutput: null,
      })
      return
    }
    updateNodeConfig(nodeId, { selectedOutput: cloneValue(output) })
  }

  const deleteNodeById = (nodeId: string) => {
    if (!nodes.some((node) => node.id === nodeId)) return
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })))
    setSelectedId(nodeId)
    setDeleteConfirmation('selected')
  }

  const duplicateNodeById = (nodeId: string) => {
    const source = nodes.find((node) => node.id === nodeId)
    if (!source) return
    captureHistory()
    const workflowNode = {
      ...cloneValue(source.data.workflowNode),
      id: `${source.data.workflowNode.type.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`,
      name: `${source.data.workflowNode.name} copy`,
      position: { x: source.position.x + 36, y: source.position.y + 36 },
    }
    setNodes((current) => [
      ...current,
      {
        id: workflowNode.id,
        type: 'studioNode',
        position: workflowNode.position,
        data: { workflowNode },
      },
    ])
    setSelectedId(workflowNode.id)
    setInspectorOpen(false)
    setDirty(true)
  }

  const deleteEdgeById = (edgeId: string) => {
    if (!edges.some((edge) => edge.id === edgeId)) return
    captureHistory()
    setEdges((current) => current.filter((edge) => edge.id !== edgeId))
    setDirty(true)
  }

  const updateTextNodeValue = useCallback(
    (nodeId: string, value: string) => {
      if (!textEditHistoryCaptured.current.has(nodeId)) {
        captureHistory()
        textEditHistoryCaptured.current.add(nodeId)
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  workflowNode: {
                    ...node.data.workflowNode,
                    config: { ...node.data.workflowNode.config, value },
                  },
                },
              }
            : node,
        ),
      )
      setDirty(true)
    },
    [captureHistory, setNodes],
  )

  const finishTextNodeEditing = useCallback((nodeId: string) => {
    textEditHistoryCaptured.current.delete(nodeId)
  }, [])

  const textNodeEditor = useMemo(
    () => ({ updateValue: updateTextNodeValue, finishEditing: finishTextNodeEditing }),
    [finishTextNodeEditing, updateTextNodeValue],
  )

  const deleteSelected = () => {
    if (!selectedId) return
    captureHistory()
    setNodes((current) => current.filter((node) => node.id !== selectedId))
    setEdges((current) =>
      current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId),
    )
    setSelectedId(null)
    setDirty(true)
  }

  const duplicateSelected = () => {
    if (!selectedNode) return
    captureHistory()
    const id = `${selectedNode.data.workflowNode.type.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`
    const workflowNode = {
      ...cloneValue(selectedNode.data.workflowNode),
      id,
      name: `${selectedNode.data.workflowNode.name} copy`,
      position: { x: selectedNode.position.x + 36, y: selectedNode.position.y + 36 },
    }
    setNodes((current) => [
      ...current,
      { id, type: 'studioNode', position: workflowNode.position, data: { workflowNode } },
    ])
    setSelectedId(id)
    setDirty(true)
  }

  const autoLayout = () => {
    captureHistory()
    const columns = 4
    setNodes((current) =>
      current.map((node, index) => ({
        ...node,
        position: { x: (index % columns) * 340 + 80, y: Math.floor(index / columns) * 240 + 80 },
      })),
    )
    setDirty(true)
    requestAnimationFrame(() => fitView({ padding: 0.18, duration: 500 }))
  }

  const copySelection = useCallback(() => {
    const selected = nodes.filter((node) => node.selected || node.id === selectedId)
    if (!selected.length) return
    const ids = new Set(selected.map((node) => node.id))
    clipboard.current = {
      nodes: selected.map((node) => ({
        ...cloneValue(node.data.workflowNode),
        position: node.position,
      })),
      edges: edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.sourceHandle || '',
          target: edge.target,
          targetHandle: targetPortForEdge(edge),
        })),
    }
  }, [edges, nodes, selectedId])

  const pasteSelection = useCallback(() => {
    if (!clipboard.current) return
    captureHistory()
    const ids = new Map(
      clipboard.current.nodes.map((node) => [
        node.id,
        `${node.type.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`,
      ]),
    )
    const pastedNodes = clipboard.current.nodes.map((node) => {
      const id = ids.get(node.id)!
      const workflowNode = {
        ...structuredClone(node),
        id,
        name: `${node.name} copy`,
        position: { x: node.position.x + 48, y: node.position.y + 48 },
      }
      return {
        id,
        type: 'studioNode' as const,
        position: workflowNode.position,
        selected: true,
        data: { workflowNode },
      }
    })
    const pastedEdges = clipboard.current.edges.map((edge) => {
      const sourceNode = clipboard.current?.nodes.find((node) => node.id === edge.source)
      const sourcePort = registryByType
        .get(sourceNode?.type || '')
        ?.outputs.find((port) => port.id === edge.sourceHandle)
      return {
        ...edge,
        id: `edge-${crypto.randomUUID().slice(0, 8)}`,
        source: ids.get(edge.source)!,
        target: ids.get(edge.target)!,
        targetHandle: `type-${sourcePort?.dataType || 'text'}`,
        data: { targetPort: edge.targetHandle },
        type: 'bezier',
        style: { stroke: portColor(sourcePort?.dataType), strokeWidth: 2 },
      }
    })
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...pastedNodes,
    ])
    setEdges((current) => [...current, ...pastedEdges])
    setSelectedId(pastedNodes[0]?.id ?? null)
    setDirty(true)
  }, [captureHistory, setEdges, setNodes])

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
      return
    if (event.key === 'Escape') {
      if (shortcutsOpen) setShortcutsOpen(false)
      else if (nodePickerOpen) setNodePickerOpen(false)
      else setSelectedId(null)
      return
    }
    if (shortcutsOpen || nodePickerOpen) return
    const command = event.metaKey || event.ctrlKey
    const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id)
    if (command && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      copySelection()
    } else if (command && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      pasteSelection()
    } else if (command && event.key.toLowerCase() === 'z' && event.shiftKey) {
      event.preventDefault()
      redo()
    } else if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      undo()
    } else if (command && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setNodes((current) => current.map((node) => ({ ...node, selected: true })))
    } else if (command && event.key.toLowerCase() === 'g' && event.shiftKey) {
      if (selectedGroup) {
        event.preventDefault()
        ungroup(selectedGroup.id)
      }
    } else if (command && event.key.toLowerCase() === 'g') {
      if (selectedIds.length) {
        event.preventDefault()
        createGroup()
      }
    } else if (command && event.key === 'Enter') {
      event.preventDefault()
      if (selectedGroup) void run(undefined, selectedGroup.id)
      else if (selectedIds.length === 1) void run(selectedIds[0])
      else void run()
    } else if (!command && event.key.toLowerCase() === 'f') {
      focusSelection()
    } else if (!command && event.key.toLowerCase() === 'n') {
      openNodePicker()
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
      event.preventDefault()
      setDeleteConfirmation('selected')
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!workflow) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 text-sm text-zinc-500">
        {error || (
          <>
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            {t('Loading workflow')}
          </>
        )}
      </main>
    )
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#f5f5f6] text-zinc-950">
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 bg-[#f5f5f6] px-3 sm:px-4">
        <input
          ref={mediaInput}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) void uploadMedia(files)
            event.target.value = ''
          }}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            aria-label={paletteOpen ? t('Collapse panel') : t('Expand panel')}
            title={paletteOpen ? t('Collapse panel') : t('Expand panel')}
            onClick={() => setPaletteOpen((open) => !open)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            {paletteOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <Link
            href="/workflows"
            aria-label={t('Back to workflows')}
            title={t('Back to workflows')}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-white/80"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0 max-w-[240px] flex-1">
            <input
              value={workflow.name}
              onChange={(event) => {
                setWorkflow({ ...workflow, name: event.target.value })
                setDirty(true)
              }}
              className="block w-full truncate bg-transparent text-sm font-semibold outline-none"
            />
            <span className="block text-[11px] text-zinc-400">
              {dirty ? t('Unsaved changes') : t('All changes saved')}
            </span>
          </div>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-zinc-500 shadow-sm backdrop-blur xl:block">
          {workflowNodes.length} nodes · {edges.length} connections ·{' '}
          {nodes.filter((node) => node.data.canvasGroup).length} groups
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href="/docs"
            aria-label={t('nav.docs')}
            title={t('nav.docs')}
            className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            <BookOpenText size={15} />
          </Link>
          <Link
            href="/settings"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            <Settings2 size={15} />
          </Link>
          <button
            type="button"
            aria-label={t('settings.language')}
            title={t('settings.language')}
            onClick={async () => {
              const nextLocale = locale === 'en' ? 'vi' : 'en'
              try {
                const response = await studioFetch('/api/studio/settings', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ locale: nextLocale }),
                })
                if (!response.ok) throw new Error('Language preference could not be saved.')
                document.cookie = `zenith-locale=${nextLocale}; Path=/; SameSite=Lax; Max-Age=31536000`
                window.location.reload()
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'Language could not change.')
              }
            }}
            className="grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[10px] font-semibold uppercase text-zinc-600 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            {locale}
          </button>
          <span className="hidden px-1 text-[10px] font-medium tabular-nums text-zinc-500 sm:inline">
            v{appVersion}
          </span>
          <a
            href="https://github.com/Zenithh-Studio/Zenith"
            target="_blank"
            rel="noreferrer"
            aria-label={t('GitHub repository')}
            title={t('GitHub repository')}
            className="hidden size-8 place-items-center rounded-lg text-zinc-600 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-violet-600 sm:grid"
          >
            <Code2 size={15} />
          </a>
          <button
            type="button"
            aria-label={t('Keyboard shortcuts')}
            title={t('Keyboard shortcuts')}
            onClick={() => setShortcutsOpen(true)}
            className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            <Keyboard size={15} />
          </button>
          <span className="mx-1 h-5 border-l border-zinc-300" />
          <button
            onClick={() => save()}
            disabled={saving || !dirty}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/70 px-2.5 text-xs font-medium text-zinc-700 disabled:opacity-40 sm:px-3"
          >
            <Save size={14} />{' '}
            <span className="hidden sm:inline">{saving ? t('Saving') : t('Save')}</span>
          </button>
          {mediaUploadProgress ? (
            <div
              aria-live="polite"
              className="hidden items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-medium text-blue-700 xl:flex"
              role="status"
            >
              <LoaderCircle size={12} className="animate-spin" />
              {t('Uploading {completed}/{total}', mediaUploadProgress)}
            </div>
          ) : null}
          {running ? (
            <div
              aria-live="polite"
              aria-label={`Running: ${runningNodeLabel}`}
              className="hidden max-w-[190px] items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-2 text-[10px] font-medium text-violet-800 xl:flex"
              role="status"
              title={runningNodeLabel}
            >
              <LoaderCircle size={13} className="shrink-0 animate-spin" />
              <span className="max-w-[110px] truncate">{runningNodeLabel}</span>
              <span className="shrink-0 tabular-nums text-violet-600">
                {formatLocaleNumber(completedRunNodeCount, locale)}/
                {formatLocaleNumber(runScopeIds.length, locale)}
              </span>
            </div>
          ) : null}
          {running && (
            <button
              type="button"
              onClick={() => void stopRun()}
              aria-label={t('Stop active run')}
              title={t('Stop active run')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              <X size={13} />
              <span className="hidden sm:inline">{t('Stop active run')}</span>
            </button>
          )}
          <button
            onClick={() => run()}
            disabled={running || workflowNodes.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-xs font-semibold text-white shadow-sm shadow-violet-200 disabled:opacity-50 sm:gap-2 sm:px-3.5"
          >
            {running ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}{' '}
            <span className="hidden sm:inline">{running ? t('Running') : t('Run all')}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="absolute left-1/2 top-20 z-50 flex max-w-xl -translate-x-1/2 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs text-rose-700 shadow-xl">
          <CircleAlert size={15} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          className="absolute left-1/2 top-20 z-40 flex max-w-xl -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-xs text-amber-800 shadow-xl"
        >
          <CircleAlert size={15} className="shrink-0" />
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss status" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {runConfirmation ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/35 p-4 backdrop-blur-[2px]">
          <section
            aria-labelledby="workflow-rerun-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
            role="alertdialog"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <RefreshCw size={18} />
              </span>
              <div>
                <h2 id="workflow-rerun-title" className="text-sm font-semibold text-zinc-900">
                  Generate a new version?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                  {runConfirmation.previousMediaCount} node
                  {runConfirmation.previousMediaCount === 1 ? ' already has' : 's already have'} a
                  generated image or video. This run will create another version. Previous results
                  stay in execution history, and new media is saved separately in Assets.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRunConfirmation(null)}
                className="h-9 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetNodeId = runConfirmation.targetNodeId
                  const groupId = runConfirmation.groupId
                  const retryOfExecutionId = runConfirmation.retryOfExecutionId
                  setRunConfirmation(null)
                  void executeRun(targetNodeId, groupId, undefined, retryOfExecutionId)
                }}
                className="h-9 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Generate new version
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteConfirmation ? (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-zinc-950/35 p-4 backdrop-blur-[2px]">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-workflow-content-title"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="delete-workflow-content-title" className="text-sm font-semibold text-zinc-900">
              {deleteConfirmation === 'canvas' ? 'Clear this canvas?' : 'Delete selected nodes?'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              This removes the selected node cards and their connections from this workflow. Saved
              Assets and prior execution snapshots remain available in Assets and history.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="h-9 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const targets =
                    deleteConfirmation === 'canvas' ? nodes : nodes.filter((node) => node.selected)
                  setDeleteConfirmation(null)
                  if (targets.length)
                    void deleteElements({
                      nodes: targets,
                      ...(deleteConfirmation === 'canvas' ? { edges } : {}),
                    })
                  setDirty(true)
                }}
                className="h-9 rounded-xl bg-rose-600 px-3.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                {deleteConfirmation === 'canvas' ? 'Clear canvas' : 'Delete nodes'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {paletteOpen && (
          <div
            className="absolute inset-y-0 left-0 z-30 lg:relative lg:inset-auto lg:h-full lg:shrink-0"
            style={{ width: `${paletteWidth}px` }}
          >
            <WorkflowSidePanel
              width={paletteWidth}
              searchNodes={paletteSearch}
              onSearchNodes={setPaletteSearch}
              onInsertAsset={insertAsset}
              onInsertPrompt={insertPrompt}
              canvasNodes={workflowNodes.map((node) => {
                const group = nodes.find((candidate) =>
                  candidate.data.canvasGroup?.nodeIds.includes(node.id),
                )?.data.canvasGroup
                return {
                  id: node.id,
                  name: node.data.workflowNode.name,
                  type: node.data.workflowNode.type,
                  ...(group ? { groupId: group.id } : {}),
                }
              })}
              canvasGroups={nodes.flatMap((node) =>
                node.data.canvasGroup
                  ? [
                      {
                        id: node.data.canvasGroup.id,
                        name: node.data.canvasGroup.name,
                        nodeIds: node.data.canvasGroup.nodeIds,
                      },
                    ]
                  : [],
              )}
              onFocusNode={(nodeId) => {
                setNodes((current) =>
                  current.map((node) => ({ ...node, selected: node.id === nodeId })),
                )
                setSelectedId(nodeId)
                setInspectorOpen(true)
                fitView({ nodes: [{ id: nodeId }], padding: 0.4, duration: 400 })
              }}
            />
            <div
              aria-label="Resize workflow side panel"
              aria-orientation="vertical"
              role="separator"
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                event.currentTarget.dataset.startX = String(event.clientX)
                event.currentTarget.dataset.startWidth = String(paletteWidth)
              }}
              onPointerMove={(event) => {
                if (!(event.buttons & 1)) return
                const startX = Number(event.currentTarget.dataset.startX)
                const startWidth = Number(event.currentTarget.dataset.startWidth)
                if (!Number.isFinite(startX) || !Number.isFinite(startWidth)) return
                const width = Math.max(220, Math.min(480, startWidth + event.clientX - startX))
                setPaletteWidth(width)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') setPaletteWidth((width) => Math.max(220, width - 16))
                if (event.key === 'ArrowRight')
                  setPaletteWidth((width) => Math.min(480, width + 16))
              }}
              className="absolute right-0 top-0 z-40 hidden h-full w-1 cursor-col-resize touch-none bg-transparent transition hover:bg-violet-300 focus-visible:bg-violet-500 lg:block"
            />
          </div>
        )}

        <section className="relative min-h-0 min-w-0 flex-1">
          <NodeActionContext.Provider
            value={{
              isWorkflowRunning: running,
              renamingNodeId,
              startRenameNode: (nodeId) => setRenamingNodeId(nodeId),
              saveNodeName: (nodeId, name) => {
                const nextName = name.trim()
                if (nextName) {
                  const target = nodes.find((node) => node.id === nodeId)
                  if (target && target.data.workflowNode.name !== nextName) {
                    captureHistory()
                    setNodes((current) =>
                      current.map((node) =>
                        node.id === nodeId
                          ? {
                              ...node,
                              data: {
                                ...node.data,
                                workflowNode: { ...node.data.workflowNode, name: nextName },
                              },
                            }
                          : node,
                      ),
                    )
                    setDirty(true)
                  }
                }
                setRenamingNodeId(null)
              },
              cancelRenameNode: () => setRenamingNodeId(null),
              stopWorkflow: () => {
                void stopRun()
              },
              checkVideoTask,
              saveOutputToAssets: async (nodeId, executionId) => {
                setError('')
                try {
                  const response = await studioFetch(
                    `/api/studio/workflows/${workflowId}/save-output`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ nodeId, executionId }),
                    },
                  )
                  const body = (await response.json()) as { error?: string }
                  if (!response.ok) {
                    throw new Error(body.error || 'Output could not be saved to Assets.')
                  }
                  await load()
                  setNotice('Output saved to Assets.')
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : 'Output could not be saved to Assets.',
                  )
                }
              },
              saveWorkflowUpload: async (nodeId, assetId) => {
                setError('')
                try {
                  const response = await studioFetch('/api/studio/assets/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assetId }),
                  })
                  const body = (await response.json()) as { error?: string }
                  if (!response.ok) {
                    throw new Error(body.error || 'Upload could not be saved to Assets.')
                  }
                  window.dispatchEvent(new Event('zenith:assets-changed'))
                  updateNodeConfig(nodeId, { workflowUpload: false })
                  const definition = definitionFromState()
                  const nextDefinition = {
                    ...definition,
                    nodes: definition.nodes.map((node) =>
                      node.id === nodeId
                        ? { ...node, config: { ...node.config, workflowUpload: false } }
                        : node,
                    ),
                  }
                  if (await save(nextDefinition)) setNotice('Asset saved to Assets.')
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : 'Upload could not be saved to Assets.',
                  )
                }
              },
              runNode: (nodeId, retry) => {
                void run(nodeId, undefined, retry)
              },
              generateImageFromText,
              deleteNode: deleteNodeById,
              duplicateNode: duplicateNodeById,
              replaceMedia: replaceMediaInput,
              selectNode: (nodeId) => {
                setInspectorTabState({ nodeId, tab: 'details' })
                setSelectedId(nodeId)
                setInspectorOpen(true)
              },
              updateNodeConfig,
              resizeNode,
              selectMediaVersion,
              addDerivedImages,
              addTextNode: (content, sourceAssetId) =>
                addNode('input.prompt', undefined, {
                  value: content,
                  ...(sourceAssetId
                    ? {
                        imageDescription: {
                          provider: 'openai',
                          model: 'gpt-6-luna',
                          sourceAssetId,
                        },
                      }
                    : {}),
                }),
              addReferenceInput,
              updateGroup,
              ungroup,
              runGroup: (groupId) => {
                void run(undefined, groupId)
              },
              captureHistory,
              markDirty: () => setDirty(true),
            }}
          >
            <EdgeDeleteContext.Provider value={deleteEdgeById}>
              <TextNodeEditorContext.Provider value={textNodeEditor}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={(changes) => {
                    onNodesChange(changes)
                    if (
                      changes.some(
                        (change) => change.type === 'position' && change.dragging === false,
                      )
                    )
                      setDirty(true)
                  }}
                  onEdgesChange={(changes) => {
                    onEdgesChange(changes)
                    setDirty(true)
                  }}
                  onConnect={connect}
                  onConnectEnd={openCompatibleNodePicker}
                  onReconnect={reconnect}
                  onNodeDragStart={(_, node) => {
                    captureHistory()
                    if (node.data.canvasGroup) {
                      groupDragRef.current = {
                        groupId: node.data.canvasGroup.id,
                        lastPosition: { ...node.position },
                      }
                    }
                  }}
                  onNodeDrag={(_, node) => {
                    const drag = groupDragRef.current
                    if (
                      !drag ||
                      !node.data.canvasGroup ||
                      drag.groupId !== node.data.canvasGroup.id
                    )
                      return
                    const delta = {
                      x: node.position.x - drag.lastPosition.x,
                      y: node.position.y - drag.lastPosition.y,
                    }
                    if (!delta.x && !delta.y) return
                    drag.lastPosition = { ...node.position }
                    const memberIds = new Set(node.data.canvasGroup.nodeIds)
                    setNodes((current) =>
                      current.map((item) =>
                        memberIds.has(item.id)
                          ? {
                              ...item,
                              position: {
                                x: item.position.x + delta.x,
                                y: item.position.y + delta.y,
                              },
                            }
                          : item,
                      ),
                    )
                  }}
                  onNodeDragStop={() => {
                    groupDragRef.current = null
                    setDirty(true)
                  }}
                  onNodeClick={(_, node) => {
                    setSelectedId(node.id)
                  }}
                  onNodeContextMenu={(event, node) => {
                    event.preventDefault()
                    setNodes((current) =>
                      current.map((item) => ({ ...item, selected: item.id === node.id })),
                    )
                    setSelectedId(node.id)
                    setContextMenu({
                      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 248)),
                      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 380)),
                      nodeId: node.id,
                    })
                  }}
                  onPaneClick={() => setSelectedId(null)}
                  onMoveEnd={(_, viewport) => setZoomPercent(Math.round(viewport.zoom * 100))}
                  onPaneContextMenu={(event) => {
                    event.preventDefault()
                    setContextMenu({
                      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 248)),
                      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 450)),
                    })
                    setPickerPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
                  }}
                  onNodesDelete={(deleted) => {
                    captureHistory()
                    const ids = new Set(deleted.map((node) => node.id))
                    const deletedGroupMembers = new Set(
                      deleted.flatMap((node) => node.data.canvasGroup?.nodeIds ?? []),
                    )
                    if (deletedGroupMembers.size) {
                      setNodes((current) =>
                        current.map((node) =>
                          deletedGroupMembers.has(node.id) ? { ...node, hidden: false } : node,
                        ),
                      )
                    }
                    setEdges((current) =>
                      current.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
                    )
                    setDirty(true)
                  }}
                  onEdgesDelete={() => {
                    captureHistory()
                    setDirty(true)
                  }}
                  fitView
                  minZoom={0.2}
                  maxZoom={1.8}
                  panOnDrag={canvasMode === 'pan'}
                  selectionOnDrag={canvasMode === 'select'}
                  selectionMode={SelectionMode.Partial}
                  defaultEdgeOptions={{
                    type: 'bezier',
                    style: { stroke: '#8b5cf6', strokeWidth: 2 },
                  }}
                  connectionLineStyle={{ stroke: '#8b5cf6', strokeWidth: 2 }}
                  deleteKeyCode={null}
                  multiSelectionKeyCode={['Meta', 'Control']}
                >
                  <Background
                    variant={dotBackground ? BackgroundVariant.Dots : BackgroundVariant.Lines}
                    gap={20}
                    size={1.2}
                    color="#d4d4d8"
                  />
                  {showMinimap && (
                    <MiniMap
                      position="bottom-right"
                      className="!m-4 !rounded-xl !border !border-zinc-200 !bg-white !shadow-lg"
                      nodeColor="#8b5cf6"
                      maskColor="rgba(244,244,245,.72)"
                      pannable
                      zoomable
                    />
                  )}
                </ReactFlow>
              </TextNodeEditorContext.Provider>
            </EdgeDeleteContext.Provider>
          </NodeActionContext.Provider>
          <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white/95 p-1.5 shadow-xl backdrop-blur [scrollbar-width:none] sm:bottom-4">
            <DockButton
              label="Select mode"
              pressed={canvasMode === 'select'}
              onClick={() => setCanvasMode('select')}
            >
              <MousePointer2 size={15} />
            </DockButton>
            <DockButton
              label="Pan mode"
              pressed={canvasMode === 'pan'}
              onClick={() => setCanvasMode('pan')}
            >
              <Hand size={15} />
            </DockButton>
            <DockDivider />
            <DockButton label="Undo" hint="Ctrl+Z" disabled={!undoStack.length} onClick={undo}>
              <Undo2 size={15} />
            </DockButton>
            <DockButton
              label="Redo"
              hint="Ctrl+Shift+Z"
              disabled={!redoStack.length}
              onClick={redo}
            >
              <Redo2 size={15} />
            </DockButton>
            <DockButton
              label="Focus selection"
              disabled={!nodes.some((node) => node.selected)}
              onClick={focusSelection}
            >
              <Maximize2 size={15} />
            </DockButton>
            <DockDivider />
            <DockButton label="Add text input" onClick={() => addNode('input.text')}>
              <Type size={15} />
            </DockButton>
            <DockButton label="Add image input" onClick={() => addNode('input.image')}>
              <ImageIcon size={15} />
            </DockButton>
            <DockButton label="Add video generator" onClick={() => addNode('ai.generate-video')}>
              <Video size={15} />
            </DockButton>
            <DockButton label="Add audio input" onClick={() => addNode('input.audio')}>
              <AudioLines size={15} />
            </DockButton>
            <DockButton label="Add config input" onClick={() => addNode('input.json')}>
              <Braces size={15} />
            </DockButton>
            <DockButton label="Open all node types" onClick={() => openNodePicker()}>
              <Plus size={15} />
            </DockButton>
            <DockDivider />
            <DockButton
              label={
                selectedWorkflowNodes.length ? 'Group selected nodes' : 'Create an empty group'
              }
              disabled={Boolean(selectedGroup)}
              onClick={createGroup}
            >
              <LayoutGrid size={15} />
            </DockButton>
            {selectedWorkflowNodes.length > 1 ? (
              <>
                <DockDivider />
                <DockButton
                  label="Duplicate selected nodes"
                  onClick={() => {
                    copySelection()
                    pasteSelection()
                  }}
                >
                  <CopyPlus size={15} />
                </DockButton>
                <DockButton label="Align selected nodes left" onClick={() => alignSelection('x')}>
                  <span aria-hidden="true" className="text-sm leading-none">
                    ⇤
                  </span>
                </DockButton>
                <DockButton label="Align selected nodes top" onClick={() => alignSelection('y')}>
                  <span aria-hidden="true" className="text-sm leading-none">
                    ⇡
                  </span>
                </DockButton>
                <DockButton
                  label="Distribute selected nodes horizontally"
                  disabled={selectedWorkflowNodes.length < 3}
                  onClick={distributeSelection}
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    ↔
                  </span>
                </DockButton>
                <DockButton label="Export selected nodes" onClick={exportSelection}>
                  <Download size={15} />
                </DockButton>
              </>
            ) : null}
            <DockButton
              label="Upload media"
              disabled={Boolean(mediaUploadProgress)}
              onClick={() => {
                uploadTarget.current = { type: 'new' }
                if (mediaInput.current) mediaInput.current.multiple = true
                mediaInput.current?.click()
              }}
            >
              <Upload size={15} />
            </DockButton>
            <DockButton
              label="Toggle canvas appearance"
              pressed={dotBackground}
              onClick={() => setDotBackground((enabled) => !enabled)}
            >
              <Settings2 size={15} />
            </DockButton>
            <DockButton
              label="Delete selected nodes"
              disabled={!nodes.some((node) => node.selected)}
              onClick={() => setDeleteConfirmation('selected')}
            >
              <Trash2 size={15} />
            </DockButton>
            <DockButton
              label="Clear canvas"
              disabled={!nodes.length}
              onClick={() => setDeleteConfirmation('canvas')}
            >
              <X size={15} />
            </DockButton>
            <DockDivider />
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => void zoomOut()}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                −
              </span>
            </button>
            <span className="min-w-10 shrink-0 text-center text-[10px] font-medium tabular-nums text-zinc-500">
              {zoomPercent}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => void zoomIn()}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                +
              </span>
            </button>
            <span className="mx-0.5 h-5 border-l border-zinc-200" />
            <button
              type="button"
              aria-label="Fit all nodes"
              title="Fit all nodes"
              onClick={() => fitView({ padding: 0.18, duration: 300 })}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              aria-label={showMinimap ? 'Hide minimap' : 'Show minimap'}
              aria-pressed={showMinimap}
              title={showMinimap ? 'Hide minimap' : 'Show minimap'}
              onClick={() => setShowMinimap((visible) => !visible)}
              className={`grid size-8 shrink-0 place-items-center rounded-lg hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600 ${showMinimap ? 'text-violet-700' : 'text-zinc-500'}`}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </section>

        {inspectorOpen && (
          <aside className="fixed bottom-0 right-0 top-12 z-30 flex w-80 max-w-[calc(100vw-1rem)] shrink-0 flex-col border-l border-zinc-200 bg-white shadow-2xl xl:static xl:z-10 xl:max-w-none xl:shadow-none">
            <div className="flex h-13 items-center justify-between border-b border-zinc-100 px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {selectedGroup ? 'Group inspector' : selectedNode ? 'Node inspector' : 'Execution'}
              </span>
              <button
                onClick={() => setInspectorOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X size={16} />
              </button>
            </div>
            {selectedNode && !selectedGroup ? (
              <div
                role="tablist"
                aria-label="Node inspector sections"
                className="flex gap-1 border-b border-zinc-100 p-2"
              >
                {(['details', 'json'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={inspectorNodeTab === tab}
                    onClick={() => setInspectorTabState({ nodeId: selectedId, tab })}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-violet-600 ${inspectorNodeTab === tab ? 'bg-violet-50 text-violet-700' : 'text-zinc-500 hover:bg-zinc-50'}`}
                  >
                    {tab === 'details' ? 'Details' : 'JSON'}
                  </button>
                ))}
              </div>
            ) : null}
            {selectedGroup ? (
              <WorkflowGroupInspector
                group={selectedGroup}
                workflowNodes={workflowNodes.map((node) => node.data.workflowNode)}
                availableNodes={workflowNodes
                  .filter((node) => !contextGroups.some((group) => group.nodeIds.includes(node.id)))
                  .map((node) => node.data.workflowNode)}
                nodeRecords={nodes.flatMap((node) => (node.data.record ? [node.data.record] : []))}
                groupRun={selectedGroupNode?.data.groupRun}
                isWorkflowRunning={running}
                onUpdate={(patch) => updateGroup(selectedGroup.id, patch)}
                onSelectNode={(nodeId) => {
                  setSelectedId(nodeId)
                  setInspectorOpen(true)
                  fitView({ nodes: [{ id: nodeId }], padding: 0.4, duration: 400 })
                }}
                onAddNode={(nodeId) => addNodeToGroup(selectedGroup.id, nodeId)}
                onRun={() => void run(undefined, selectedGroup.id)}
                onUngroup={() => ungroup(selectedGroup.id)}
              />
            ) : selectedNode && selectedDefinition && inspectorNodeTab === 'json' ? (
              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                  JSON is redacted: credentials, inline media, and external URLs are omitted.
                </p>
                <pre className="max-h-[calc(100%-7rem)] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 text-[10px] leading-relaxed text-zinc-200">
                  {JSON.stringify(
                    redactDiagnosticData({
                      id: selectedNode.id,
                      type: selectedNode.data.workflowNode.type,
                      version: selectedDefinition.version,
                      position: selectedNode.position,
                      size: {
                        width: selectedNode.measured?.width ?? selectedNode.width ?? null,
                        height: selectedNode.measured?.height ?? selectedNode.height ?? null,
                      },
                      status: selectedNode.data.record?.status || 'idle',
                      provider: selectedNode.data.workflowNode.config.provider,
                      model: selectedNode.data.workflowNode.config.model,
                      config: selectedNode.data.workflowNode.config,
                      media: Object.entries(selectedNode.data.record?.outputs || {}).map(
                        ([port, output]) => ({
                          port,
                          type: output.type,
                          assetId: output.assetId || output.metadata?.assetId,
                          metadata: output.metadata,
                        }),
                      ),
                      error: selectedNode.data.record?.error,
                    }),
                    null,
                    2,
                  )}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    const info = redactDiagnosticData({
                      id: selectedNode.id,
                      type: selectedNode.data.workflowNode.type,
                      version: selectedDefinition.version,
                      position: selectedNode.position,
                      size: {
                        width: selectedNode.measured?.width ?? selectedNode.width ?? null,
                        height: selectedNode.measured?.height ?? selectedNode.height ?? null,
                      },
                      status: selectedNode.data.record?.status || 'idle',
                      provider: selectedNode.data.workflowNode.config.provider,
                      model: selectedNode.data.workflowNode.config.model,
                      config: selectedNode.data.workflowNode.config,
                      media: Object.entries(selectedNode.data.record?.outputs || {}).map(
                        ([port, output]) => ({
                          port,
                          type: output.type,
                          assetId: output.assetId || output.metadata?.assetId,
                          metadata: output.metadata,
                        }),
                      ),
                      error: selectedNode.data.record?.error,
                    })
                    void navigator.clipboard
                      ?.writeText(JSON.stringify(info, null, 2))
                      .then(() => setNotice('Redacted node JSON copied.'))
                      .catch(() => setError('Clipboard access is unavailable.'))
                  }}
                  className="mt-3 h-9 w-full rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-violet-600"
                >
                  Copy JSON
                </button>
              </div>
            ) : selectedNode && selectedDefinition ? (
              <div className="flex-1 overflow-y-auto">
                <div className="border-b border-zinc-100 p-4">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Name
                  </label>
                  <input
                    value={selectedNode.data.workflowNode.name}
                    onChange={(event) => updateSelected({ name: event.target.value })}
                    className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                  />
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Node slug
                    </span>
                    <div className="flex h-10 items-center rounded-xl border border-zinc-200 px-3 focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-50">
                      <span className="text-xs text-zinc-400">@</span>
                      <input
                        value={nodeSlug(selectedNode.data.workflowNode)}
                        onChange={(event) =>
                          updateSelected({
                            slug: event.target.value
                              .replace(/^@/, '')
                              .toLowerCase()
                              .replaceAll(/[^a-z0-9-]+/g, '-'),
                          })
                        }
                        className="min-w-0 flex-1 bg-transparent pl-0.5 text-xs outline-none"
                      />
                    </div>
                  </label>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    {selectedDefinition.description}
                  </p>
                </div>
                <InspectorSection title="Inputs">
                  {selectedDefinition.inputs.length ? (
                    selectedDefinition.inputs.map((port) => {
                      const connected = edges.some(
                        (edge) => edge.target === selectedId && targetPortForEdge(edge) === port.id,
                      )
                      return (
                        <div
                          key={port.id}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 text-xs"
                        >
                          <span className="font-medium">
                            {port.name}
                            <span className="ml-1 text-zinc-400">· {port.dataType}</span>
                          </span>
                          <span
                            className={
                              connected
                                ? 'text-emerald-600'
                                : port.required
                                  ? 'text-amber-600'
                                  : 'text-zinc-400'
                            }
                          >
                            {connected ? 'Connected' : port.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-xs text-zinc-400">
                      This node does not consume upstream data.
                    </p>
                  )}
                </InspectorSection>
                <InspectorSection title="Info">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    <dt className="text-zinc-400">Node ID</dt>
                    <dd className="truncate font-mono text-zinc-700" title={selectedNode.id}>
                      {selectedNode.id}
                    </dd>
                    <dt className="text-zinc-400">Type / version</dt>
                    <dd className="text-zinc-700">
                      {selectedNode.data.workflowNode.type} · {selectedDefinition.version}
                    </dd>
                    <dt className="text-zinc-400">Position</dt>
                    <dd className="tabular-nums text-zinc-700">
                      {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
                    </dd>
                    <dt className="text-zinc-400">Size</dt>
                    <dd className="tabular-nums text-zinc-700">
                      {Math.round(selectedNode.measured?.width ?? selectedNode.width ?? 0)} ×{' '}
                      {Math.round(selectedNode.measured?.height ?? selectedNode.height ?? 0)}
                    </dd>
                    <dt className="text-zinc-400">Status</dt>
                    <dd className="text-zinc-700">{selectedNode.data.record?.status || 'idle'}</dd>
                    <dt className="text-zinc-400">Provider / model</dt>
                    <dd className="truncate text-zinc-700">
                      {String(selectedNode.data.workflowNode.config.provider || '—')} /{' '}
                      {String(selectedNode.data.workflowNode.config.model || '—')}
                    </dd>
                  </dl>
                  {selectedNode.data.record?.error ? (
                    <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-[11px] leading-relaxed text-rose-700">
                      {String(redactDiagnosticData(selectedNode.data.record.error))}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      const node = selectedNode.data.workflowNode
                      const info = redactDiagnosticData({
                        id: node.id,
                        type: node.type,
                        version: selectedDefinition.version,
                        position: selectedNode.position,
                        size: {
                          width: selectedNode.measured?.width ?? selectedNode.width ?? null,
                          height: selectedNode.measured?.height ?? selectedNode.height ?? null,
                        },
                        status: selectedNode.data.record?.status || 'idle',
                        provider: node.config.provider,
                        model: node.config.model,
                        config: node.config,
                        media: Object.entries(selectedNode.data.record?.outputs || {}).map(
                          ([port, output]) => ({
                            port,
                            type: output.type,
                            assetId: output.assetId || output.metadata?.assetId,
                            metadata: output.metadata,
                          }),
                        ),
                        error: selectedNode.data.record?.error,
                      })
                      void navigator.clipboard
                        ?.writeText(JSON.stringify(info, null, 2))
                        .then(() => setNotice('Redacted node JSON copied.'))
                        .catch(() => setError('Clipboard access is unavailable.'))
                    }}
                    className="mt-3 h-8 w-full rounded-lg border border-zinc-200 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-violet-600"
                  >
                    Copy redacted JSON
                  </button>
                </InspectorSection>
                {selectedDefinition.inputs.some((port) =>
                  ['image', 'video', 'audio'].includes(port.dataType),
                ) ? (
                  <InspectorSection title="Connected references">
                    {edges
                      .filter((edge) => edge.target === selectedNode.id)
                      .map((edge) => {
                        const port = selectedDefinition.inputs.find(
                          (item) => item.id === targetPortForEdge(edge),
                        )
                        if (!port || !['image', 'video', 'audio'].includes(port.dataType))
                          return null
                        const source = nodes.find((item) => item.id === edge.source)
                        const sourceConfig = source?.data.workflowNode.config
                        const previewURL = sourceConfig?.url
                          ? mediaSource(
                              sourceConfig.url,
                              sourceConfig.assetId,
                              sourceConfig.fileName,
                            )
                          : ''
                        return (
                          <div
                            key={edge.id}
                            className="flex items-center gap-2 rounded-xl border border-zinc-100 p-2"
                          >
                            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-500">
                              {port.dataType === 'image' && previewURL ? (
                                <Image
                                  src={previewURL}
                                  alt=""
                                  width={36}
                                  height={36}
                                  unoptimized
                                  className="size-full object-cover"
                                />
                              ) : port.dataType === 'video' ? (
                                <Video size={16} />
                              ) : port.dataType === 'audio' ? (
                                <AudioLines size={16} />
                              ) : (
                                <CircleAlert size={16} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-zinc-700">
                                {source?.data.workflowNode.name || 'Missing reference'}
                              </span>
                              <span className="block truncate text-[10px] text-zinc-400">
                                {port.name} · {port.dataType}
                                {sourceConfig?.fileName
                                  ? ` · ${String(sourceConfig.fileName)}`
                                  : ''}
                              </span>
                              {!source ||
                              (source?.data.workflowNode.type.startsWith('input.') &&
                                !previewURL) ? (
                                <span className="block text-[10px] text-amber-700">
                                  Reference source is unavailable.
                                </span>
                              ) : null}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${port.name} reference`}
                              title="Remove this reference connection."
                              onClick={() => deleteEdgeById(edge.id)}
                              className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )
                      })}
                    {!edges.some((edge) => {
                      if (edge.target !== selectedNode.id) return false
                      return selectedDefinition.inputs.some(
                        (port) =>
                          port.id === targetPortForEdge(edge) &&
                          ['image', 'video', 'audio'].includes(port.dataType),
                      )
                    }) ? (
                      <p className="text-xs text-zinc-400">
                        Select an asset in the Assets panel to add a compatible reference.
                      </p>
                    ) : null}
                  </InspectorSection>
                ) : null}
                <InspectorSection title="Configuration">
                  {isTextInputNode && (
                    <p className="mb-3 rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
                      Edit the content directly on the node card in the canvas.
                    </p>
                  )}
                  {(selectedNode.data.workflowNode.type === 'ai.generate-text' ||
                    registryByType.get(selectedNode.data.workflowNode.type)?.category === 'AI') && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
                      The node is ready. Add the selected provider credential later to execute it;
                      secrets are never stored in workflow JSON.
                    </div>
                  )}
                  {isMediaConfiguration ? (
                    <MediaConfiguration
                      type={selectedNode.data.workflowNode.type}
                      config={selectedNode.data.workflowNode.config}
                      onChange={updateConfig}
                      onChangeMany={updateConfigMany}
                      uploading={Boolean(mediaUploadProgress)}
                      onUpload={() => {
                        uploadTarget.current = { type: 'selected', nodeId: selectedNode.id }
                        if (mediaInput.current) mediaInput.current.multiple = false
                        mediaInput.current?.click()
                      }}
                    />
                  ) : isTextInputNode ? null : Object.entries(selectedNode.data.workflowNode.config)
                      .length ? (
                    Object.entries(selectedNode.data.workflowNode.config).map(([key, value]) => (
                      <label key={key} className="mb-3 block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          {key.replaceAll(/([A-Z])/g, ' $1')}
                        </span>
                        {key === 'provider' ? (
                          <select
                            value={String(value)}
                            onChange={(event) => {
                              const provider = providersFor('text').find(
                                (item) => item.id === event.target.value,
                              )
                              updateConfigMany({
                                provider: event.target.value,
                                ...(provider?.models.text?.[0]
                                  ? { model: provider.models.text[0] }
                                  : {}),
                              })
                            }}
                            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none"
                          >
                            {providersFor('text').map((provider) => (
                              <option key={provider.id} value={provider.id}>
                                {provider.name}
                              </option>
                            ))}
                          </select>
                        ) : typeof value === 'string' &&
                          (key === 'value' ||
                            key.toLowerCase().includes('prompt') ||
                            key === 'template') ? (
                          <textarea
                            rows={key === 'value' ? 6 : 4}
                            value={value}
                            onChange={(event) => updateConfig(key, event.target.value)}
                            className="w-full resize-y rounded-xl border border-zinc-200 p-3 text-xs leading-relaxed outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                          />
                        ) : (
                          <input
                            type={typeof value === 'number' ? 'number' : 'text'}
                            value={String(value)}
                            onChange={(event) =>
                              updateConfig(
                                key,
                                typeof value === 'number'
                                  ? Number(event.target.value)
                                  : event.target.value,
                              )
                            }
                            className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-violet-300"
                          />
                        )}
                      </label>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-400">No configuration is required.</p>
                  )}
                  {selectedNode.data.workflowNode.type === 'ai.generate-text' &&
                    selectedNode.data.workflowNode.config.provider === 'custom-http' && (
                      <label className="mt-3 block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          HTTPS endpoint
                        </span>
                        <input
                          value={String(selectedNode.data.workflowNode.config.endpoint || '')}
                          onChange={(event) => updateConfig('endpoint', event.target.value)}
                          placeholder="https://provider.example/api"
                          className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-violet-300"
                        />
                      </label>
                    )}
                </InspectorSection>
                <InspectorSection title="Output">
                  {selectedNode.data.record?.outputs ? (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-200">
                      {JSON.stringify(selectedNode.data.record.outputs, null, 2)}
                    </pre>
                  ) : selectedNode.data.record?.error ? (
                    <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                      {selectedNode.data.record.error}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">Run this node to inspect its output.</p>
                  )}
                </InspectorSection>
                <InspectorSection title="Node log">
                  {selectedNode.data.executionLogs?.length ? (
                    <div className="space-y-2">
                      {selectedNode.data.executionLogs.map((log, index) => (
                        <div
                          key={`${log.at}-${index}`}
                          className="rounded-xl bg-zinc-50 p-3 text-[11px] leading-relaxed"
                        >
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <span
                              className={`size-1.5 rounded-full ${log.level === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            />
                            {formatLocaleDate(log.at, locale)}
                          </div>
                          <p className={log.level === 'error' ? 'text-rose-700' : 'text-zinc-600'}>
                            {log.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">This node has no log entries yet.</p>
                  )}
                </InspectorSection>
                <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-4">
                  <button
                    onClick={() => run(selectedId || undefined)}
                    disabled={running || !selectedDefinition.available}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    <Play size={13} /> Run dependencies
                  </button>
                  <button
                    onClick={duplicateSelected}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-medium"
                  >
                    <Copy size={13} /> Duplicate
                  </button>
                  <button
                    onClick={deleteSelected}
                    className="col-span-2 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-200 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={13} /> Delete node
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Latest run</span>
                    {latestExecution ? (
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${latestExecution.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700' : latestExecution.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-zinc-100 text-zinc-600'}`}
                      >
                        {latestExecution.status}
                      </span>
                    ) : null}
                  </div>
                  {latestExecution?.retryOf ? (
                    <p className="mt-2 break-all text-[10px] text-zinc-500">
                      {t('Retry of execution {id}', { id: latestExecution.retryOf })}
                    </p>
                  ) : null}
                  {latestExecution ? (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                        <span>{formatLocaleDate(latestExecution.startedAt, locale)}</span>
                        <span className="text-right">{latestExecution.durationMs ?? 0} ms</span>
                      </div>
                      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                        {latestExecution.logs?.map((log, index) => (
                          <div
                            key={`${log.at}-${index}`}
                            className="flex gap-2 text-[11px] leading-relaxed"
                          >
                            <span
                              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${log.level === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            />
                            <span className="text-zinc-600">
                              {log.nodeId ? (
                                <span className="mr-1 font-semibold text-violet-700">
                                  {latestExecutionNodeNames.get(log.nodeId) || log.nodeId}:
                                </span>
                              ) : null}
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-400">
                      No executions yet. Run the workflow to create a persistent snapshot.
                    </p>
                  )}
                </div>
                <div className="mt-4 rounded-2xl bg-violet-50 p-4">
                  <Sparkles size={17} className="text-violet-600" />
                  <p className="mt-3 text-xs font-semibold text-violet-950">Canvas ready</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-violet-700">
                    Select a node to configure it, or connect matching handles to transfer typed
                    data.
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
      {contextMenu && (
        <>
          <button
            aria-label="Close canvas menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 w-60 rounded-2xl border border-zinc-700 bg-[#2d2d31] p-1.5 text-sm text-zinc-100 shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.nodeId && contextNode ? (
              <>
                <ContextAction
                  icon={Play}
                  label={
                    contextNode.data.canvasGroup
                      ? 'Run group with dependencies'
                      : ['failed', 'cancelled', 'interrupted'].includes(
                            contextNode.data.record?.status || '',
                          )
                        ? 'Retry with current settings'
                        : 'Run with dependencies'
                  }
                  disabled={
                    running ||
                    (!contextNode.data.canvasGroup &&
                      registryByType.get(contextNode.data.workflowNode.type)?.category !== 'AI') ||
                    Boolean(
                      contextNode.data.canvasGroup && !contextNode.data.canvasGroup.nodeIds.length,
                    )
                  }
                  onClick={() => {
                    if (contextNode.data.canvasGroup)
                      void run(undefined, contextNode.data.canvasGroup.id)
                    else
                      void run(
                        contextNode.data.workflowNode.id,
                        undefined,
                        ['failed', 'cancelled', 'interrupted'].includes(
                          contextNode.data.record?.status || '',
                        ),
                      )
                    setContextMenu(null)
                  }}
                />
                <ContextAction
                  icon={CopyPlus}
                  label="Duplicate"
                  onClick={() => {
                    duplicateNodeById(contextNode.id)
                    setContextMenu(null)
                  }}
                />
                {!contextNode.data.canvasGroup && (
                  <ContextAction
                    icon={Type}
                    label="Rename"
                    onClick={() => {
                      setRenamingNodeId(contextNode.id)
                      setContextMenu(null)
                    }}
                  />
                )}
                {!contextNode.data.canvasGroup ? (
                  <ContextAction
                    icon={LayoutGrid}
                    label="Group"
                    onClick={() => {
                      createGroup()
                      setContextMenu(null)
                    }}
                  />
                ) : (
                  <ContextAction
                    icon={LayoutGrid}
                    label="Ungroup"
                    onClick={() => {
                      ungroup(contextNode.data.canvasGroup!.id)
                      setContextMenu(null)
                    }}
                  />
                )}
                {contextGroups.map((group) => (
                  <ContextAction
                    key={`group-${group.id}`}
                    icon={LayoutGrid}
                    label={`Add to ${group.name}`}
                    onClick={() => {
                      addNodeToGroup(group.id, contextNode.id)
                      setContextMenu(null)
                    }}
                  />
                ))}
                <ContextAction
                  icon={CircleAlert}
                  label="Info"
                  onClick={() => {
                    setInspectorTabState({ nodeId: contextNode.id, tab: 'details' })
                    setInspectorOpen(true)
                    setContextMenu(null)
                  }}
                />
                <ContextAction
                  icon={Copy}
                  label="Copy diagnostics"
                  onClick={() => {
                    const node = contextNode.data.workflowNode
                    const info = {
                      id: node.id,
                      type: node.type,
                      version: registryByType.get(node.type)?.version,
                      position: contextNode.position,
                      status: contextNode.data.record?.status || 'idle',
                      config: redactDiagnosticData(node.config),
                      error: contextNode.data.record?.error || undefined,
                    }
                    void navigator.clipboard?.writeText(JSON.stringify(info, null, 2))
                    setContextMenu(null)
                  }}
                />
                <div className="my-1.5 border-t border-zinc-600" />
                <ContextAction
                  icon={Trash2}
                  label="Delete"
                  onClick={() => {
                    setNodes((current) =>
                      current.map((node) => ({ ...node, selected: node.id === contextNode.id })),
                    )
                    setDeleteConfirmation('selected')
                    setContextMenu(null)
                  }}
                />
              </>
            ) : (
              <>
                <ContextAction
                  icon={Plus}
                  label="Add node"
                  hint="N"
                  onClick={() => openNodePicker(pickerPosition ?? undefined)}
                />
                <ContextAction
                  icon={RefreshCw}
                  label="Refresh"
                  onClick={() => {
                    setContextMenu(null)
                    load()
                  }}
                />
                <ContextAction
                  icon={ImagePlus}
                  label="Add media from library"
                  onClick={() => {
                    uploadTarget.current = { type: 'new' }
                    if (mediaInput.current) mediaInput.current.multiple = true
                    setContextMenu(null)
                    mediaInput.current?.click()
                  }}
                />
                <ContextAction
                  icon={StickyNote}
                  label="Add note"
                  onClick={() => addNode('utility.note', pickerPosition ?? undefined)}
                />
                <div className="my-1.5 border-t border-zinc-600" />
                <ContextAction
                  icon={Undo2}
                  label="Undo"
                  hint="Ctrl+Z"
                  disabled={!undoStack.length}
                  onClick={() => {
                    undo()
                    setContextMenu(null)
                  }}
                />
                <ContextAction
                  icon={Redo2}
                  label="Redo"
                  hint="Ctrl+Shift+Z"
                  disabled={!redoStack.length}
                  onClick={() => {
                    redo()
                    setContextMenu(null)
                  }}
                />
                <div className="my-1.5 border-t border-zinc-600" />
                <ContextAction
                  icon={Maximize2}
                  label="Fit view"
                  onClick={() => {
                    fitView({ padding: 0.18, duration: 500 })
                    setContextMenu(null)
                  }}
                />
                <ContextAction
                  icon={LayoutGrid}
                  label="Auto layout nodes"
                  onClick={() => {
                    autoLayout()
                    setContextMenu(null)
                  }}
                />
                <div className="my-1.5 border-t border-zinc-600" />
                <ContextAction
                  icon={Settings2}
                  label="Workflow settings"
                  onClick={() => {
                    const name = window.prompt('Workflow name', workflow.name)
                    if (name?.trim()) {
                      setWorkflow({ ...workflow, name: name.trim() })
                      setDirty(true)
                    }
                    setContextMenu(null)
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
      {nodePickerOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/35 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNodePickerOpen(false)
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-[#303034] text-zinc-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-600 px-4 py-3">
              <span className="text-sm font-semibold">
                {pendingNodeConnection
                  ? `Connect ${pendingNodeConnection.dataType} node`
                  : 'Add node'}
              </span>
              <button
                onClick={() => setNodePickerOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="relative p-3">
              <Search
                size={15}
                className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                autoFocus
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setNodePickerOpen(false)
                  if (event.key === 'Enter') {
                    const first = pickerNodeDefinitions[0]
                    if (first) addNode(first.type)
                  }
                }}
                placeholder="Search nodes…"
                className="h-11 w-full rounded-xl border border-zinc-700 bg-[#19191a] pl-10 pr-3 text-sm outline-none focus:border-violet-500"
              />
            </div>
            <div className="max-h-[430px] overflow-y-auto border-t border-zinc-700 p-2">
              {pickerNodeDefinitions.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-zinc-400">
                  {pendingNodeConnection
                    ? `No node exposes a ${pendingNodeConnection.dataType} port for this connection.`
                    : 'No nodes match this search.'}
                </p>
              ) : (
                pickerNodeDefinitions.map((definition) => {
                  const Icon = iconByType[definition.type] ?? Zap
                  return (
                    <button
                      key={definition.type}
                      onClick={() => addNode(definition.type)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-700/70"
                    >
                      <Icon size={16} className="mt-0.5 shrink-0 text-violet-400" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{definition.displayName}</span>
                        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
                          {definition.description}
                        </span>
                      </span>
                      <span className="ml-auto rounded-md bg-zinc-800 px-1.5 py-0.5 text-[9px] uppercase text-zinc-500">
                        {definition.category}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-zinc-700 px-4 py-2 text-[10px] text-zinc-500">
              <span>Enter Select</span>
              <span>Esc Close</span>
              <span className="ml-auto">
                {pickerNodeDefinitions.length}{' '}
                {pendingNodeConnection ? 'compatible nodes' : 'nodes'}
              </span>
            </div>
          </div>
        </div>
      )}
      {shortcutsOpen && (
        <KeyboardShortcutsDialog
          search={shortcutSearch}
          onSearch={setShortcutSearch}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
    </main>
  )
}

function DockButton({
  label,
  hint,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  hint?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const { t } = useLocale()
  return (
    <button
      type="button"
      aria-label={t(label)}
      aria-pressed={pressed}
      title={hint ? `${t(label)} · ${hint}` : t(label)}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-35 ${pressed ? 'bg-violet-100 text-violet-800' : 'text-zinc-600 hover:bg-zinc-100'}`}
    >
      {children}
    </button>
  )
}

function DockDivider() {
  return <span aria-hidden="true" className="mx-0.5 h-6 shrink-0 border-l border-zinc-200" />
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
  disabled = false,
  title,
}: {
  icon: typeof CircleAlert
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  title?: string
}) {
  const { t } = useLocale()
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title ? t(title) : t(label)}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-45 ${tone === 'danger' ? 'text-rose-700' : 'text-zinc-700'}`}
    >
      <Icon size={14} />
      {t(label)}
    </button>
  )
}

function KeyboardShortcutsDialog({
  search,
  onSearch,
  onClose,
}: {
  search: string
  onSearch: (value: string) => void
  onClose: () => void
}) {
  const { t } = useLocale()
  const modifier =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const entries = [
    { category: 'Canvas', action: t('Select all nodes'), keys: `${modifier} + A` },
    { category: 'Canvas', action: t('Focus selection'), keys: 'F' },
    { category: 'Canvas', action: t('Pan mode'), keys: t('Choose Pan in the bottom dock') },
    { category: 'Nodes', action: t('Copy selected nodes'), keys: `${modifier} + C` },
    { category: 'Nodes', action: t('Paste nodes'), keys: `${modifier} + V` },
    { category: 'Nodes', action: t('Add a node'), keys: 'N' },
    { category: 'Nodes', action: t('Delete selection'), keys: 'Delete / Backspace' },
    { category: 'Groups', action: t('Group selection'), keys: `${modifier} + G` },
    {
      category: 'Groups',
      action: t('Ungroup selected group'),
      keys: `${modifier} + Shift + G`,
    },
    { category: 'Run', action: t('Run selection or workflow'), keys: `${modifier} + Enter` },
    { category: 'History', action: t('Undo'), keys: `${modifier} + Z` },
    { category: 'History', action: t('Redo'), keys: `${modifier} + Shift + Z` },
    {
      category: 'Navigation',
      action: t('Close dialog or clear selection'),
      keys: 'Escape',
    },
  ].filter((entry) =>
    `${entry.category} ${entry.action} ${entry.keys}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-zinc-950/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-shortcuts-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 id="workflow-shortcuts-title" className="text-sm font-semibold text-zinc-900">
              {t('Keyboard shortcuts')}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              {t('Shortcuts pause while you edit text or use a dialog.')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('Close keyboard shortcuts')}
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            <X size={16} />
          </button>
        </div>
        <div className="relative border-b border-zinc-100 p-3">
          <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            autoFocus
            aria-label={t('Search keyboard shortcuts')}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t('Search shortcuts…')}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs outline-none focus:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-100"
          />
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          {['Canvas', 'Nodes', 'Groups', 'Run', 'History', 'Navigation'].map((category) => {
            const matches = entries.filter((entry) => entry.category === category)
            if (!matches.length) return null
            return (
              <section key={category}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  {t(category)}
                </h3>
                <div className="divide-y divide-zinc-100">
                  {matches.map((entry) => (
                    <div
                      key={entry.action}
                      className="flex items-center justify-between gap-4 py-2 text-xs"
                    >
                      <span className="text-zinc-700">{entry.action}</span>
                      <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600">
                        {entry.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
          {!entries.length && (
            <p className="py-8 text-center text-xs text-zinc-500">{t('No matching shortcuts.')}</p>
          )}
        </div>
      </section>
    </div>
  )
}

function ContextAction({
  icon: Icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: typeof Plus
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  const { t } = useLocale()
  return (
    <button
      aria-label={t(label)}
      title={hint ? `${t(label)} · ${hint}` : t(label)}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-600"
    >
      <Icon size={15} className="text-zinc-400" />
      <span>{t(label)}</span>
      {hint && <span className="ml-auto text-[10px] text-zinc-500">{hint}</span>}
    </button>
  )
}

function MediaConfiguration({
  type,
  config,
  onChange,
  onChangeMany,
  uploading,
  onUpload,
}: {
  type: string
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onChangeMany: (patch: Record<string, unknown>) => void
  uploading: boolean
  onUpload: () => void
}) {
  const isInput = type === 'input.image' || type === 'input.video' || type === 'input.audio'
  const nodeCapabilities = getNodeCapabilities(type)
  const isAI = nodeCapabilities?.generator === true
  const modality = nodeCapabilities?.modality || 'image'
  const providers = providersFor(modality)
  const selectedProvider = providers.find((provider) => provider.id === config.provider)
  const providerModels = selectedProvider?.models[modality] ?? []
  const currentModel = String(config.model || '')
  const hasModelOptions =
    providerModels.length > 0 && (!currentModel || providerModels.includes(currentModel))
  const isVideoGenerator = isAI && modality === 'video'
  const isImageGenerator = ['ai.generate-image', 'ai.edit-image'].includes(type)
  const imageResolution = String(config.resolution || '1k')
  const imageAspectRatio = String(config.aspectRatio || '1:1')
  const imageDimensions = readImageDimensions(config.size, imageResolution, imageAspectRatio)
  const imageDimensionsKey = JSON.stringify([config.size, imageResolution, imageAspectRatio])
  const [imageSizeDraftState, setImageSizeDraftState] = useState(() => ({
    key: imageDimensionsKey,
    width: String(imageDimensions.width),
    height: String(imageDimensions.height),
  }))
  const imageSizeDraft =
    imageSizeDraftState.key === imageDimensionsKey
      ? imageSizeDraftState
      : {
          key: imageDimensionsKey,
          width: String(imageDimensions.width),
          height: String(imageDimensions.height),
        }
  const imageWidthDraft = imageSizeDraft.width
  const imageHeightDraft = imageSizeDraft.height
  const normalizedImageCount = normalizeImageCount(config.count)
  const [imageCountDraftState, setImageCountDraftState] = useState(() => ({
    count: normalizedImageCount,
    value: String(normalizedImageCount),
  }))
  const imageCountDraft =
    imageCountDraftState.count === normalizedImageCount
      ? imageCountDraftState.value
      : String(normalizedImageCount)
  const ratios = imageAspectRatios
  return (
    <div className="space-y-4">
      {isInput && (
        <>
          {config.url ? (
            type === 'input.audio' ? (
              <audio
                src={mediaSource(config.url, config.assetId, config.fileName)}
                controls
                className="w-full rounded-xl"
              />
            ) : type === 'input.video' ? (
              <video
                src={mediaSource(config.url, config.assetId, config.fileName)}
                controls
                className="h-40 w-full rounded-xl bg-zinc-950 object-contain"
              />
            ) : (
              <div className="relative h-40 w-full overflow-hidden rounded-xl bg-zinc-100">
                <Image
                  src={mediaSource(config.url, config.assetId, config.fileName)}
                  alt=""
                  fill
                  sizes="280px"
                  unoptimized
                  className="object-contain"
                />
              </div>
            )
          ) : null}
          <button
            disabled={uploading}
            onClick={onUpload}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Uploading media' : config.url ? 'Replace media' : 'Choose / upload media'}
          </button>
          {config.fileName && (
            <p className="truncate text-[10px] text-zinc-400">{String(config.fileName)}</p>
          )}
        </>
      )}
      {isAI && type !== 'ai.generate-audio' && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Provider
            </span>
            <select
              value={String(config.provider || providers[0]?.id || '')}
              onChange={(event) => {
                const provider = providers.find((item) => item.id === event.target.value)
                const defaultModel = provider?.models[modality]?.[0]
                const nextDurationOptions = modelDurationOptions(
                  event.target.value,
                  defaultModel || '',
                )
                const nextResolutionOptions = modelResolutionOptions(
                  event.target.value,
                  defaultModel || '',
                )
                onChangeMany({
                  provider: event.target.value,
                  ...(defaultModel ? { model: defaultModel } : {}),
                  ...(isVideoGenerator && defaultModel
                    ? {
                        duration: nextDurationOptions.includes(Number(config.duration))
                          ? Number(config.duration)
                          : defaultModelDuration(event.target.value, defaultModel),
                        resolution: nextResolutionOptions.includes(String(config.resolution))
                          ? config.resolution
                          : (nextResolutionOptions[0] ?? '720p'),
                        selectedOutput: null,
                        outputRevision: nextOutputRevision(),
                      }
                    : {}),
                })
              }}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none"
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Prompt
            </span>
            <textarea
              rows={5}
              value={String(config.prompt || '')}
              onChange={(event) => onChange('prompt', event.target.value)}
              placeholder="Describe the image or video you want to create…"
              className="w-full resize-y rounded-xl border border-zinc-200 p-3 text-xs leading-relaxed outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
            />
          </label>
        </>
      )}
      {type === 'ai.generate-audio' && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Text
            </span>
            <textarea
              rows={4}
              value={String(config.prompt || '')}
              onChange={(event) => onChange('prompt', event.target.value)}
              placeholder="Write the text to speak…"
              className="w-full resize-y rounded-xl border border-zinc-200 p-3 text-xs leading-relaxed outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Voice
              <select
                value={String(config.voice || 'alloy')}
                onChange={(event) => onChange('voice', event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-2 text-xs font-normal normal-case text-zinc-700"
              >
                {[
                  'alloy',
                  'ash',
                  'ballad',
                  'coral',
                  'echo',
                  'fable',
                  'onyx',
                  'nova',
                  'sage',
                  'shimmer',
                ].map((voice) => (
                  <option key={voice}>{voice}</option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Format
              <select
                value={String(config.format || 'mp3')}
                onChange={(event) => onChange('format', event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-2 text-xs font-normal normal-case text-zinc-700"
              >
                {['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].map((format) => (
                  <option key={format}>{format}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Speech speed
            <input
              type="range"
              min="0.25"
              max="4"
              step="0.05"
              value={Number(config.speed || 1)}
              onChange={(event) => onChange('speed', Number(event.target.value))}
              className="mt-2 w-full accent-violet-600"
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Voice instructions
            <textarea
              rows={2}
              value={String(config.instructions || '')}
              onChange={(event) => onChange('instructions', event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-xs font-normal normal-case outline-none focus:border-violet-300"
            />
          </label>
        </>
      )}
      {'aspectRatio' in config && (
        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Output aspect ratio
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ratios.map((ratio) => (
              <button
                key={ratio}
                type="button"
                aria-pressed={config.aspectRatio === ratio}
                onClick={() =>
                  isImageGenerator
                    ? onChangeMany({
                        aspectRatio: ratio,
                        size: `${imageSizeFromSettings(imageResolution, ratio).width}x${imageSizeFromSettings(imageResolution, ratio).height}`,
                      })
                    : onChange('aspectRatio', ratio)
                }
                className={`rounded-full border px-2.5 py-1.5 text-[10px] font-medium ${config.aspectRatio === ratio ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-zinc-200 text-zinc-500'}`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      )}
      {isImageGenerator ? (
        <div className="space-y-3 rounded-xl border border-zinc-100 p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Resolution
            <select
              value={imageResolution}
              onChange={(event) => {
                const dimensions = imageSizeFromSettings(event.target.value, imageAspectRatio)
                onChangeMany({
                  resolution: event.target.value,
                  size: `${dimensions.width}x${dimensions.height}`,
                })
              }}
              className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-normal normal-case text-zinc-700"
            >
              {imageResolutionOptions.map((resolution) => (
                <option key={resolution} value={resolution}>
                  {resolution === 'auto' ? 'Auto' : resolution.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Custom image size
            </span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="flex h-10 items-center rounded-lg border border-zinc-200 px-2 text-[10px] text-zinc-400">
                W
                <input
                  type="number"
                  min="1"
                  aria-label="Image width"
                  value={imageWidthDraft}
                  onChange={(event) => {
                    const value = event.target.value
                    setImageSizeDraftState({
                      key: imageDimensionsKey,
                      width: value,
                      height: imageHeightDraft,
                    })
                    const width = Math.floor(Number(value))
                    if (width > 0) onChange('size', `${width}x${imageDimensions.height}`)
                  }}
                  className="min-w-0 flex-1 px-2 text-xs text-zinc-700 outline-none"
                />
              </label>
              <span className="text-zinc-300">×</span>
              <label className="flex h-10 items-center rounded-lg border border-zinc-200 px-2 text-[10px] text-zinc-400">
                H
                <input
                  type="number"
                  min="1"
                  aria-label="Image height"
                  value={imageHeightDraft}
                  onChange={(event) => {
                    const value = event.target.value
                    setImageSizeDraftState({
                      key: imageDimensionsKey,
                      width: imageWidthDraft,
                      height: value,
                    })
                    const height = Math.floor(Number(value))
                    if (height > 0) onChange('size', `${imageDimensions.width}x${height}`)
                  }}
                  className="min-w-0 flex-1 px-2 text-xs text-zinc-700 outline-none"
                />
              </label>
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Image count
            </span>
            <div className="flex flex-wrap gap-1.5">
              {imageCountQuickOptions.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={normalizeImageCount(config.count) === count}
                  onClick={() => {
                    setImageCountDraftState({ count, value: String(count) })
                    onChange('count', count)
                  }}
                  className={`h-8 rounded-lg border px-2.5 text-[10px] font-medium ${normalizeImageCount(config.count) === count ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-zinc-200 text-zinc-500'}`}
                >
                  {count}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="15"
                aria-label="Custom image count"
                value={imageCountDraft}
                onChange={(event) => {
                  const value = event.target.value
                  const count = value ? normalizeImageCount(value) : normalizedImageCount
                  setImageCountDraftState({ count, value })
                  if (value) onChange('count', count)
                }}
                onBlur={() => {
                  const count = normalizeImageCount(imageCountDraft)
                  setImageCountDraftState({ count, value: String(count) })
                  onChange('count', count)
                }}
                className="h-8 w-16 rounded-lg border border-zinc-200 px-2 text-center text-[10px] font-normal text-zinc-700"
              />
            </div>
          </div>
        </div>
      ) : null}
      {'model' in config && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Model
          </span>
          {hasModelOptions ? (
            <select
              aria-label="Model"
              value={currentModel || providerModels[0]}
              onChange={(event) => {
                const nextModel = event.target.value
                const durationOptions = modelDurationOptions(
                  String(config.provider || ''),
                  nextModel,
                )
                const resolutionOptions = modelResolutionOptions(
                  String(config.provider || ''),
                  nextModel,
                )
                onChangeMany({
                  model: nextModel,
                  ...(isVideoGenerator
                    ? {
                        duration: durationOptions.includes(Number(config.duration))
                          ? Number(config.duration)
                          : defaultModelDuration(String(config.provider || ''), nextModel),
                        resolution: resolutionOptions.includes(String(config.resolution))
                          ? config.resolution
                          : (resolutionOptions[0] ?? '720p'),
                        selectedOutput: null,
                        outputRevision: nextOutputRevision(),
                      }
                    : {}),
                })
              }}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none focus:border-violet-300"
            >
              {providerModels.map((providerModel) => (
                <option key={providerModel} value={providerModel}>
                  {displayModelName(providerModel)}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={currentModel}
              onChange={(event) => onChange('model', event.target.value)}
              placeholder={
                modality === 'video'
                  ? config.provider === 'muse2api'
                    ? 'muse-video'
                    : 'Custom model ID'
                  : 'Model ID'
              }
              className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-violet-300"
            />
          )}
        </label>
      )}
      {config.provider === 'muse2api' && (
        <p className="text-[10px] leading-relaxed text-zinc-400">
          Muse2API uses a server-configured gateway. It supports text-to-video or one first-frame
          image.
        </p>
      )}
      {(config.provider === 'custom-http' || config.provider === 'comfyui') && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            HTTPS endpoint
          </span>
          <input
            value={String(config.endpoint || '')}
            onChange={(event) => onChange('endpoint', event.target.value)}
            placeholder="https://provider.example/api"
            className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-violet-300"
          />
        </label>
      )}
      {config.provider === 'comfyui' && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            API workflow JSON
          </span>
          <textarea
            rows={6}
            value={String(config.workflow || '')}
            onChange={(event) => onChange('workflow', event.target.value)}
            placeholder={'Paste ComfyUI API workflow; use "{{prompt}}" where the prompt belongs.'}
            className="w-full rounded-xl border border-zinc-200 p-3 font-mono text-[10px] leading-relaxed outline-none focus:border-violet-300"
          />
        </label>
      )}
      {'duration' in config && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Duration (seconds)
          </span>
          <select
            value={String(
              modelDurationOptions(
                String(config.provider || ''),
                String(config.model || ''),
              ).includes(Number(config.duration))
                ? Number(config.duration)
                : (modelDurationOptions(
                    String(config.provider || ''),
                    String(config.model || ''),
                  )[0] ?? 5),
            )}
            onChange={(event) => onChange('duration', Number(event.target.value))}
            className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none"
          >
            {modelDurationOptions(String(config.provider || ''), String(config.model || '')).map(
              (duration) => (
                <option key={duration} value={duration}>
                  {duration}s
                </option>
              ),
            )}
          </select>
        </label>
      )}
    </div>
  )
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(true)
  return (
    <section className="border-b border-zinc-100 p-4">
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
      >
        {t(title)}
        <ChevronDown size={14} className={open ? '' : '-rotate-90'} />
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}
