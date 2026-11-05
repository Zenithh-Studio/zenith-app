'use client'

import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import {
  ArrowLeft,
  Braces,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Code2,
  Copy,
  FileText,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  LoaderCircle,
  Maximize2,
  Menu,
  MessageSquareText,
  PanelLeftClose,
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
  Upload,
  Video,
  X,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { nodeRegistry, providersFor, registryByType } from '@znith/contracts'
import type {
  ExecutionDocument,
  NodeExecutionRecord,
  WorkflowDocument,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from '@znith/contracts'
import { cloneValue } from '@znith/utils'
import { Brand } from './AppChrome'

type StudioNodeData = {
  workflowNode: WorkflowNode
  record?: NodeExecutionRecord
}
type StudioNode = Node<StudioNodeData, 'studioNode'>

type TextNodeEditorContextValue = {
  updateValue: (nodeId: string, value: string) => void
  finishEditing: (nodeId: string) => void
}

const TextNodeEditorContext = createContext<TextNodeEditorContextValue | null>(null)

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
      // Fall back to the upload filename when Payload returns a malformed URL.
    }
  }

  return typeof fileName === 'string' && fileName
    ? `/api/media/file/${encodeURIComponent(fileName)}`
    : source
}

function imageRatioLabel(width: number, height: number) {
  const roundedWidth = Math.round(width)
  const roundedHeight = Math.round(height)
  let a = roundedWidth
  let b = roundedHeight
  while (b !== 0) [a, b] = [b, a % b]
  const divisor = Math.max(a, 1)
  return `${roundedWidth / divisor}:${roundedHeight / divisor}`
}

function StudioNodeCard({ data, selected }: NodeProps<StudioNode>) {
  const textNodeEditor = useContext(TextNodeEditorContext)
  const definition = registryByType.get(data.workflowNode.type)
  const tone = categoryTone[definition?.category ?? 'Utility']
  const Icon = iconByType[data.workflowNode.type] ?? Zap
  const record = data.record
  const preview = record?.outputs ? Object.values(record.outputs)[0]?.value : undefined
  const previewObject =
    preview && typeof preview === 'object' ? (preview as Record<string, unknown>) : null
  const mediaType = definition?.outputs.find(
    (port) => port.dataType === 'image' || port.dataType === 'video',
  )?.dataType
  const mediaAssetId = previewObject?.assetId ?? data.workflowNode.config.assetId
  const mediaFileName = previewObject?.filename ?? data.workflowNode.config.fileName
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
      : `${ratioWidth || 1} / ${ratioHeight || 1}`
  const mediaRatioLabel =
    mediaType === 'image' && imageDimensions
      ? imageRatioLabel(imageDimensions.width, imageDimensions.height)
      : ratio

  if (mediaType) {
    return (
      <div
        className={`relative w-[320px] ${selected ? 'drop-shadow-[0_0_10px_rgba(124,58,237,.35)]' : ''}`}
      >
        <TypedHandles definition={definition} />
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className={`grid size-7 place-items-center rounded-lg ${tone.icon}`}>
            <Icon size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
            {data.workflowNode.name}
          </span>
          {record?.status === 'running' ? (
            <LoaderCircle size={15} className="animate-spin text-violet-600" />
          ) : record?.status === 'succeeded' ? (
            <Check size={15} className="text-emerald-600" />
          ) : record?.status === 'failed' ? (
            <CircleAlert size={15} className="text-rose-600" />
          ) : (
            <GripVertical size={15} className="text-zinc-400" />
          )}
        </div>
        <div
          className={`relative grid w-full place-items-center overflow-hidden rounded-2xl border bg-zinc-100 shadow-[0_12px_30px_rgba(24,24,27,.1)] ${selected ? 'border-violet-500 ring-4 ring-violet-100' : 'border-zinc-200'}`}
          style={{ aspectRatio: mediaRatio }}
        >
          {record?.error ? (
            <div className="p-5 text-center text-xs text-rose-600">{record.error}</div>
          ) : mediaValue ? (
            mediaType === 'video' ? (
              <video src={mediaValue} controls className="size-full object-contain" />
            ) : mediaAssetId ? (
              <Image
                src={mediaValue}
                alt={data.workflowNode.name}
                fill
                sizes="320px"
                unoptimized
                className="object-contain"
                onLoad={(event) => {
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
              <img
                src={mediaValue}
                alt={data.workflowNode.name}
                className="size-full object-contain"
                onLoad={(event) => {
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
          ) : mediaType === 'video' ? (
            <Video size={38} className="text-zinc-300" />
          ) : (
            <ImageIcon size={38} className="text-zinc-300" />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
          <span>@{slug}</span>
          <span>{mediaRatioLabel}</span>
        </div>
      </div>
    )
  }

  if (data.workflowNode.type === 'input.text' || data.workflowNode.type === 'input.prompt') {
    const value = String(data.workflowNode.config.value ?? '')
    const isPrompt = data.workflowNode.type === 'input.prompt'

    return (
      <div
        className={`relative w-[352px] ${selected ? 'drop-shadow-[0_0_10px_rgba(124,58,237,.2)]' : ''}`}
      >
        <TypedHandles definition={definition} />
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className={`grid size-7 place-items-center rounded-lg ${tone.icon}`}>
            <Icon size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
            {data.workflowNode.name}
          </span>
          {record?.status === 'running' ? (
            <LoaderCircle size={15} className="animate-spin text-violet-600" />
          ) : record?.status === 'succeeded' ? (
            <Check size={15} className="text-emerald-600" />
          ) : record?.status === 'failed' ? (
            <CircleAlert size={15} className="text-rose-600" />
          ) : (
            <GripVertical size={15} className="text-zinc-300" />
          )}
        </div>
        <div
          className={`rounded-2xl border bg-white shadow-[0_10px_30px_rgba(24,24,27,0.08)] transition ${selected ? 'border-violet-500 ring-4 ring-violet-100' : tone.border}`}
        >
          <div className="p-3.5 pb-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {isPrompt ? 'Prompt content' : 'Text content'}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-medium text-zinc-500">
                {isPrompt ? 'Reusable prompt' : 'Plain text'}
              </span>
            </div>
            <textarea
              aria-label={`${data.workflowNode.name} content`}
              className="nodrag nowheel min-h-[184px] max-h-[360px] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 text-xs leading-[1.65] text-zinc-700 outline-none transition placeholder:text-zinc-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-50"
              placeholder={
                isPrompt
                  ? 'Write a reusable prompt or creative brief…'
                  : 'Enter text to pass to connected nodes…'
              }
              rows={8}
              value={value}
              onChange={(event) =>
                textNodeEditor?.updateValue(data.workflowNode.id, event.target.value)
              }
              onBlur={() => textNodeEditor?.finishEditing(data.workflowNode.id)}
            />
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-3.5 py-2.5 text-[10px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Type size={12} />
              {definition?.outputs.length ?? 0} text output
            </span>
            <span>{Array.from(value).length.toLocaleString()} characters</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
          <span>@{slug}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative ${mediaType ? 'w-[320px]' : 'w-[272px]'} rounded-2xl border bg-white shadow-[0_10px_30px_rgba(24,24,27,0.08)] transition ${selected ? 'border-violet-500 ring-4 ring-violet-100' : tone.border}`}
    >
      <TypedHandles definition={definition} />
      <div className="flex items-center gap-3 border-b border-zinc-100 px-3.5 py-3">
        <span className={`grid size-8 place-items-center rounded-xl ${tone.icon}`}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {data.workflowNode.name}
          </div>
          <div className="text-[10px] text-zinc-400">@{slug}</div>
        </div>
        {record?.status === 'running' ? (
          <LoaderCircle size={15} className="animate-spin text-violet-600" />
        ) : record?.status === 'succeeded' ? (
          <Check size={15} className="text-emerald-600" />
        ) : record?.status === 'failed' ? (
          <CircleAlert size={15} className="text-rose-600" />
        ) : (
          <GripVertical size={15} className="text-zinc-300" />
        )}
      </div>
      <div className={`${mediaType ? 'min-h-[230px]' : 'min-h-[76px]'} p-3.5`}>
        {!definition?.available ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            {definition?.unavailableReason}
          </div>
        ) : record?.error ? (
          <div className="line-clamp-3 text-xs leading-relaxed text-rose-600">{record.error}</div>
        ) : mediaType && mediaValue ? (
          mediaType === 'video' ? (
            <video
              src={mediaValue}
              controls
              className="h-52 w-full rounded-xl bg-zinc-950 object-contain"
            />
          ) : (
            <img
              src={mediaValue}
              alt={data.workflowNode.name}
              className="h-52 w-full rounded-xl bg-zinc-100 object-contain"
            />
          )
        ) : mediaType ? (
          <div className="grid h-48 place-items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 text-zinc-300">
            {mediaType === 'video' ? <Video size={34} /> : <ImageIcon size={34} />}
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
          <div className="text-xs leading-relaxed text-zinc-400">{definition?.description}</div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-100 px-3.5 py-2 text-[10px] text-zinc-400">
        <span>
          {definition?.inputs.length ?? 0} in · {definition?.outputs.length ?? 0} out
        </span>
        <span className="font-medium">{record?.status ?? 'idle'}</span>
      </div>
    </div>
  )
}

const nodeTypes = { studioNode: StudioNodeCard }

function toFlowNodes(
  definition: WorkflowDefinition,
  records: NodeExecutionRecord[] = [],
): StudioNode[] {
  return definition.nodes.map((node) => ({
    id: node.id,
    type: 'studioNode',
    position: node.position,
    data: { workflowNode: node, record: records.find((record) => record.nodeId === node.id) },
  }))
}

function portColor(dataType?: string) {
  if (dataType === 'image') return '#3b82f6'
  if (dataType === 'video') return '#d946ef'
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
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null)
  const [executions, setExecutions] = useState<ExecutionDocument[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [nodePickerOpen, setNodePickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerPosition, setPickerPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const mediaInput = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<'new' | 'selected'>('new')
  const undoStack = useRef<WorkflowDefinition[]>([])
  const redoStack = useRef<WorkflowDefinition[]>([])
  const textEditHistoryCaptured = useRef(new Set<string>())
  const clipboard = useRef<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null>(null)
  const { fitView, screenToFlowPosition } = useReactFlow()

  const load = useCallback(async () => {
    const response = await fetch(`/api/studio/workflows/${workflowId}`)
    const responseBody = await response.json()
    if (!response.ok) return setError(responseBody.error || 'Could not load workflow.')
    setWorkflow(responseBody.workflow)
    setExecutions(responseBody.executions)
    const latestNodeRecords = responseBody.executions[0]?.nodeRecords ?? []
    setNodes(toFlowNodes(responseBody.workflow.definition, latestNodeRecords))
    setEdges(toFlowEdges(responseBody.workflow.definition))
    undoStack.current = []
    redoStack.current = []
    requestAnimationFrame(() => fitView({ padding: 0.18, duration: 500 }))
  }, [fitView, setEdges, setNodes, workflowId])

  useEffect(() => {
    load()
  }, [load])

  const definitionFromState = useCallback(
    (): WorkflowDefinition => ({
      version: 1,
      nodes: nodes.map((node) => ({ ...node.data.workflowNode, position: node.position })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle || '',
        target: edge.target,
        targetHandle: targetPortForEdge(edge),
      })),
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
    undoStack.current.push(cloneValue(definitionFromState()))
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
  }, [definitionFromState])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(cloneValue(definitionFromState()))
    restoreDefinition(previous)
  }, [definitionFromState, restoreDefinition])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(cloneValue(definitionFromState()))
    restoreDefinition(next)
  }, [definitionFromState, restoreDefinition])

  const save = useCallback(async () => {
    if (!workflow) return false
    setSaving(true)
    setError('')
    const response = await fetch(`/api/studio/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: workflow.name,
        description: workflow.description || '',
        definition: definitionFromState(),
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
  }, [definitionFromState, workflow, workflowId])

  const run = async (targetNodeId?: string) => {
    if (!(await save())) return
    setRunning(true)
    setError('')
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, record: { nodeId: node.id, status: 'queued' } },
      })),
    )
    const response = await fetch(`/api/studio/workflows/${workflowId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetNodeId }),
    })
    const responseBody = await response.json()
    setRunning(false)
    const records: NodeExecutionRecord[] = responseBody.records ?? []
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, record: records.find((record) => record.nodeId === node.id) },
      })),
    )
    if (!response.ok) setError(responseBody.error || 'Execution failed.')
    await load()
  }

  const selectedNode = nodes.find((node) => node.id === selectedId)
  const selectedDefinition = selectedNode
    ? registryByType.get(selectedNode.data.workflowNode.type)
    : undefined
  const latestExecution = executions[0]
  const isTextInputNode = Boolean(
    selectedNode && ['input.text', 'input.prompt'].includes(selectedNode.data.workflowNode.type),
  )
  const isMediaConfiguration = Boolean(
    selectedNode &&
    [
      'input.image',
      'input.video',
      'ai.analyze-image',
      'ai.generate-image',
      'ai.edit-image',
      'ai.generate-video',
      'ai.image-to-video',
      'processing.compose-layout',
      'output.save-image',
      'output.save-video',
    ].includes(selectedNode.data.workflowNode.type),
  )

  const filteredRegistry = useMemo(
    () =>
      nodeRegistry.filter((item) =>
        `${item.displayName} ${item.category}`.toLowerCase().includes(paletteSearch.toLowerCase()),
      ),
    [paletteSearch],
  )

  const addNode = (
    type: string,
    at?: { x: number; y: number },
    config?: Record<string, unknown>,
  ) => {
    const definition = registryByType.get(type)
    if (!definition?.available) return
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
    setSelectedId(id)
    setInspectorOpen(true)
    setDirty(true)
    setNodePickerOpen(false)
    setContextMenu(null)
  }

  const openNodePicker = (position?: { x: number; y: number }) => {
    setPickerPosition(position ?? null)
    setPickerSearch('')
    setNodePickerOpen(true)
    setContextMenu(null)
  }

  const uploadMedia = async (file: File) => {
    setError('')
    const form = new FormData()
    form.set('file', file)
    form.set('alt', file.name)
    const response = await fetch('/api/studio/assets', { method: 'POST', body: form })
    const responseBody = await response.json()
    if (!response.ok) return setError(responseBody.error || 'Could not upload media.')
    const config = {
      assetId: responseBody.media.id,
      url: mediaSource(responseBody.media.url, responseBody.media.id, responseBody.media.filename),
      fileName: responseBody.media.filename || file.name,
      mimeType: responseBody.media.mimeType || file.type,
      ...(file.type.startsWith('image/') &&
      responseBody.media.width > 0 &&
      responseBody.media.height > 0
        ? { imageWidth: responseBody.media.width, imageHeight: responseBody.media.height }
        : {}),
    }
    if (
      uploadTarget.current === 'selected' &&
      selectedNode &&
      ['input.image', 'input.video'].includes(selectedNode.data.workflowNode.type)
    ) {
      updateSelected({ config: { ...selectedNode.data.workflowNode.config, ...config } })
    } else {
      addNode(file.type.startsWith('video/') ? 'input.video' : 'input.image', undefined, config)
    }
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

  const updateConfig = (key: string, value: unknown) => {
    if (!selectedNode) return
    updateSelected({ config: { ...selectedNode.data.workflowNode.config, [key]: value } })
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const command = event.metaKey || event.ctrlKey
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
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelection, pasteSelection, redo, undo])

  if (!workflow) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 text-sm text-zinc-500">
        {error || (
          <>
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            Loading workflow
          </>
        )}
      </main>
    )
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#f5f5f6] text-zinc-950">
      <header className="z-20 flex h-16 shrink-0 items-center border-b border-zinc-200 bg-white px-3 sm:px-5">
        <input
          ref={mediaInput}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) uploadMedia(file)
            event.target.value = ''
          }}
        />
        <div className="hidden w-[250px] items-center gap-3 lg:flex">
          <Brand />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:border-l lg:border-zinc-200 lg:pl-5">
          <Link
            href="/"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            <input
              value={workflow.name}
              onChange={(event) => {
                setWorkflow({ ...workflow, name: event.target.value })
                setDirty(true)
              }}
              className="block w-full truncate bg-transparent text-sm font-semibold outline-none"
            />
            <span className="block text-[11px] text-zinc-400">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openNodePicker()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Plus size={14} /> <span className="hidden sm:inline">Add node</span>
          </button>
          <div className="hidden items-center rounded-xl border border-zinc-200 sm:flex">
            <button
              onClick={undo}
              title="Undo (⌘Z)"
              className="grid size-9 place-items-center text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
              disabled={!undoStack.current.length}
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={redo}
              title="Redo (⇧⌘Z)"
              className="grid size-9 place-items-center border-l border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
              disabled={!redoStack.current.length}
            >
              <Redo2 size={14} />
            </button>
          </div>
          <button
            onClick={autoLayout}
            className="hidden h-9 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:flex"
          >
            <LayoutGrid size={14} /> Auto layout
          </button>
          <button
            onClick={() => save()}
            disabled={saving || !dirty}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-700 disabled:opacity-40"
          >
            <Save size={14} />{' '}
            <span className="hidden sm:inline">{saving ? 'Saving' : 'Save'}</span>
          </button>
          <button
            onClick={() => run()}
            disabled={running || nodes.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-sm shadow-violet-200 disabled:opacity-50"
          >
            <Play size={14} fill="currentColor" /> {running ? 'Running' : 'Run all'}
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

      <div className="flex min-h-0 flex-1">
        {paletteOpen ? (
          <aside className="z-10 flex w-[250px] shrink-0 flex-col border-r border-zinc-200 bg-white">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Node library
              </span>
              <button
                onClick={() => setPaletteOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <div className="relative mx-3 mb-3">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                value={paletteSearch}
                onChange={(event) => setPaletteSearch(event.target.value)}
                placeholder="Search nodes"
                className="h-9 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs outline-none focus:border-violet-300"
              />
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-5">
              {['Input', 'AI', 'Processing', 'Output', 'Utility'].map((category) => {
                const items = filteredRegistry.filter((item) => item.category === category)
                if (!items.length) return null
                return (
                  <div key={category}>
                    <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      {category}
                    </div>
                    <div className="space-y-1">
                      {items.map((definition) => {
                        const Icon = iconByType[definition.type] ?? Zap
                        return (
                          <button
                            key={definition.type}
                            disabled={!definition.available}
                            onClick={() => addNode(definition.type)}
                            title={definition.unavailableReason}
                            className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span
                              className={`grid size-8 shrink-0 place-items-center rounded-lg ${categoryTone[category].icon}`}
                            >
                              <Icon size={14} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-zinc-700">
                                {definition.displayName}
                              </span>
                              <span className="block truncate text-[10px] text-zinc-400">
                                {definition.available ? definition.description : 'Unavailable'}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setPaletteOpen(true)}
            className="absolute left-4 top-20 z-20 grid size-10 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-lg"
            aria-label="Open node library"
            title="Open node library"
          >
            <Menu size={17} />
          </button>
        )}

        <section className="relative min-w-0 flex-1">
          <TextNodeEditorContext.Provider value={textNodeEditor}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={(changes) => {
                onNodesChange(changes)
                if (
                  changes.some((change) => change.type === 'position' && change.dragging === false)
                )
                  setDirty(true)
              }}
              onEdgesChange={(changes) => {
                onEdgesChange(changes)
                setDirty(true)
              }}
              onConnect={connect}
              onReconnect={reconnect}
              onNodeDragStart={captureHistory}
              onNodeClick={(_, node) => {
                setSelectedId(node.id)
                setInspectorOpen(true)
              }}
              onPaneClick={() => setSelectedId(null)}
              onPaneContextMenu={(event) => {
                event.preventDefault()
                setContextMenu({ x: event.clientX, y: event.clientY })
                setPickerPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
              }}
              onNodesDelete={(deleted) => {
                const ids = new Set(deleted.map((node) => node.id))
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
              defaultEdgeOptions={{
                type: 'bezier',
                style: { stroke: '#8b5cf6', strokeWidth: 2 },
              }}
              connectionLineStyle={{ stroke: '#8b5cf6', strokeWidth: 2 }}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode={['Meta', 'Control']}
              selectionOnDrag
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d4d4d8" />
              <Controls
                position="bottom-left"
                className="!m-4 !overflow-hidden !rounded-xl !border-zinc-200 !shadow-lg"
              />
              <MiniMap
                position="bottom-right"
                className="!m-4 !rounded-xl !border !border-zinc-200 !bg-white !shadow-lg"
                nodeColor="#8b5cf6"
                maskColor="rgba(244,244,245,.72)"
                pannable
                zoomable
              />
            </ReactFlow>
          </TextNodeEditorContext.Provider>
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-zinc-500 shadow-sm backdrop-blur">
            {nodes.length} nodes · {edges.length} connections
          </div>
        </section>

        {inspectorOpen && (
          <aside className="z-10 hidden w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white xl:flex">
            <div className="flex h-13 items-center justify-between border-b border-zinc-100 px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {selectedNode ? 'Node inspector' : 'Execution'}
              </span>
              <button
                onClick={() => setInspectorOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X size={16} />
              </button>
            </div>
            {selectedNode && selectedDefinition ? (
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
                <InspectorSection title="Configuration">
                  {isTextInputNode && (
                    <p className="mb-3 rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
                      Edit the content directly on the node card in the canvas.
                    </p>
                  )}
                  {(selectedNode.data.workflowNode.type === 'ai.generate-text' ||
                    selectedNode.data.workflowNode.type.startsWith('ai.')) && (
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
                      onUpload={() => {
                        uploadTarget.current = 'selected'
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
                              updateConfig('provider', event.target.value)
                              if (provider?.models.text?.[0])
                                updateConfig('model', provider.models.text[0])
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
                  {latestExecution ? (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                        <span>{new Date(latestExecution.startedAt).toLocaleString()}</span>
                        <span className="text-right">{latestExecution.durationMs ?? 0} ms</span>
                      </div>
                      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                        {latestExecution.logs?.map((log, index) => (
                          <div key={index} className="flex gap-2 text-[11px] leading-relaxed">
                            <span
                              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${log.level === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            />
                            <span className="text-zinc-600">{log.message}</span>
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
                uploadTarget.current = 'new'
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
              disabled={!undoStack.current.length}
              onClick={() => {
                undo()
                setContextMenu(null)
              }}
            />
            <ContextAction
              icon={Redo2}
              label="Redo"
              hint="Ctrl+Shift+Z"
              disabled={!redoStack.current.length}
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
              <span className="text-sm font-semibold">Add node</span>
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
                    const first = nodeRegistry.find((item) =>
                      `${item.displayName} ${item.description} ${item.category}`
                        .toLowerCase()
                        .includes(pickerSearch.toLowerCase()),
                    )
                    if (first) addNode(first.type)
                  }
                }}
                placeholder="Search nodes…"
                className="h-11 w-full rounded-xl border border-zinc-700 bg-[#19191a] pl-10 pr-3 text-sm outline-none focus:border-violet-500"
              />
            </div>
            <div className="max-h-[430px] overflow-y-auto border-t border-zinc-700 p-2">
              {nodeRegistry
                .filter((item) =>
                  `${item.displayName} ${item.description} ${item.category}`
                    .toLowerCase()
                    .includes(pickerSearch.toLowerCase()),
                )
                .map((definition) => {
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
                })}
            </div>
            <div className="flex items-center gap-3 border-t border-zinc-700 px-4 py-2 text-[10px] text-zinc-500">
              <span>Enter Select</span>
              <span>Esc Close</span>
              <span className="ml-auto">{nodeRegistry.length} nodes</span>
            </div>
          </div>
        </div>
      )}
    </main>
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
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-600"
    >
      <Icon size={15} className="text-zinc-400" />
      <span>{label}</span>
      {hint && <span className="ml-auto text-[10px] text-zinc-500">{hint}</span>}
    </button>
  )
}

function MediaConfiguration({
  type,
  config,
  onChange,
  onUpload,
}: {
  type: string
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onUpload: () => void
}) {
  const isInput = type === 'input.image' || type === 'input.video'
  const isAI = type.startsWith('ai.')
  const modality =
    type === 'ai.analyze-image' ? 'vision' : type.includes('video') ? 'video' : 'image'
  const providers = providersFor(modality)
  const ratios = ['9:16', '3:4', '1:1', '4:3', '16:9']
  return (
    <div className="space-y-4">
      {isInput && (
        <>
          {config.url ? (
            type === 'input.video' ? (
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
            onClick={onUpload}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            <Upload size={14} /> {config.url ? 'Replace media' : 'Choose / upload media'}
          </button>
          {config.fileName && (
            <p className="truncate text-[10px] text-zinc-400">{String(config.fileName)}</p>
          )}
        </>
      )}
      {isAI && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Provider
            </span>
            <select
              value={String(config.provider || providers[0]?.id || '')}
              onChange={(event) => {
                const provider = providers.find((item) => item.id === event.target.value)
                onChange('provider', event.target.value)
                const defaultModel = provider?.models[modality]?.[0]
                if (defaultModel) onChange('model', defaultModel)
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
      {'aspectRatio' in config && config.provider !== 'chatgpt2api' && (
        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Aspect ratio
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ratios.map((ratio) => (
              <button
                key={ratio}
                onClick={() => onChange('aspectRatio', ratio)}
                className={`rounded-full border px-2.5 py-1.5 text-[10px] font-medium ${config.aspectRatio === ratio ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-zinc-200 text-zinc-500'}`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      )}
      {'aspectRatio' in config && config.provider === 'chatgpt2api' && (
        <p className="text-[10px] leading-relaxed text-zinc-400">
          ChatGPT2API currently chooses image dimensions automatically.
        </p>
      )}
      {'model' in config && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Model
          </span>
          <input
            value={String(config.model || '')}
            onChange={(event) => onChange('model', event.target.value)}
            placeholder={type.includes('video') ? 'Replicate model version ID' : 'Model ID'}
            className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-violet-300"
          />
        </label>
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
          <input
            type="number"
            min={1}
            max={30}
            value={Number(config.duration || 5)}
            onChange={(event) => onChange('duration', Number(event.target.value))}
            className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs outline-none"
          />
        </label>
      )}
    </div>
  )
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="border-b border-zinc-100 p-4">
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
      >
        {title}
        <ChevronDown size={14} className={open ? '' : '-rotate-90'} />
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}
