export type NodeModality = 'text' | 'image' | 'video' | 'audio' | 'vision'
export type NodePrimaryAction = 'run' | 'retry' | 'check-status' | 'cancel' | 'none'

export type NodeActionState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'skipped'
  | 'waiting_for_input'

export type NodeToolbarActionId =
  | 'run'
  | 'retry'
  | 'check-status'
  | 'cancel'
  | 'download'
  | 'save-to-assets'
  | 'create-image-from-last-frame'
  | 'copy-prompt'
  | 'image-tools'
  | 'generate-image-from-text'
  | 'replace-input'
  | 'info'
  | 'diagnostics'
  | 'duplicate'
  | 'rename'
  | 'delete'

export type NodeActionContext = {
  nodeType: string
  status?: NodeActionState
  isVideoTaskPending?: boolean
  isWorkflowRunning?: boolean
  hasOutput?: boolean
  hasPrompt?: boolean
  hasImageOutput?: boolean
  hasSavedImage?: boolean
  hasMediaOutput?: boolean
  hasVideoOutput?: boolean
  hasSavedOutput?: boolean
  hasText?: boolean
}

export type RegisteredNodeAction = {
  id: NodeToolbarActionId
  label: string
  icon: string
  handler: NodeToolbarActionId
  disabled: boolean
  disabledReason?: string
}

type ActionRule = {
  id: NodeToolbarActionId
  label: string
  icon: string
  nodes: readonly string[] | '*'
  handler?: NodeToolbarActionId
  visible: (context: NodeActionContext) => boolean
  disabledReason?: (context: NodeActionContext) => string | undefined
}

const generatorNodeTypes = [
  'ai.generate-text',
  'ai.analyze-image',
  'ai.generate-image',
  'ai.edit-image',
  'ai.generate-video',
  'ai.image-to-video',
  'ai.generate-audio',
] as const

const videoGeneratorNodeTypes = ['ai.generate-video', 'ai.image-to-video'] as const
const imageGeneratorNodeTypes = ['ai.generate-image', 'ai.edit-image'] as const

const nodeActionRegistry: ActionRule[] = [
  {
    id: 'check-status',
    label: 'Check status',
    icon: 'refresh',
    nodes: videoGeneratorNodeTypes,
    visible: (context) => Boolean(context.isVideoTaskPending),
  },
  {
    id: 'cancel',
    label: 'Stop',
    icon: 'stop',
    nodes: generatorNodeTypes,
    visible: (context) => context.status === 'running' && Boolean(context.isWorkflowRunning),
  },
  {
    id: 'retry',
    label: 'Retry',
    icon: 'refresh',
    nodes: generatorNodeTypes,
    visible: (context) =>
      ['failed', 'cancelled', 'interrupted'].includes(context.status || '') ||
      ((context.status === 'running' || context.status === 'queued') && !context.isWorkflowRunning),
    disabledReason: (context) =>
      context.isWorkflowRunning ? 'Wait until the active workflow run finishes.' : undefined,
  },
  {
    id: 'run',
    label: 'Run',
    icon: 'play',
    nodes: generatorNodeTypes,
    visible: (context) =>
      !context.isVideoTaskPending &&
      !['running', 'queued', 'failed', 'cancelled', 'interrupted'].includes(context.status || ''),
    disabledReason: (context) =>
      context.isWorkflowRunning ? 'Wait until the active workflow run finishes.' : undefined,
  },
  {
    id: 'generate-image-from-text',
    label: 'Generate image from text',
    icon: 'sparkles',
    nodes: ['input.text', 'input.prompt', 'input.system-prompt', 'input.user-prompt'],
    visible: () => true,
    disabledReason: (context) =>
      context.hasText ? undefined : 'Add text before generating an image.',
  },
  {
    id: 'download',
    label: 'Download output',
    icon: 'download',
    nodes: '*',
    visible: (context) => Boolean(context.hasOutput),
  },
  {
    id: 'save-to-assets',
    label: 'Save to Assets',
    icon: 'save',
    nodes: '*',
    visible: (context) => Boolean(context.hasMediaOutput && !context.hasSavedOutput),
    disabledReason: (context) =>
      context.isWorkflowRunning ? 'Wait until the active workflow run finishes.' : undefined,
  },
  {
    id: 'create-image-from-last-frame',
    label: 'Create image node from last frame',
    icon: 'image-plus',
    nodes: '*',
    visible: (context) => Boolean(context.hasVideoOutput),
    disabledReason: (context) =>
      context.isWorkflowRunning ? 'Wait until the active workflow run finishes.' : undefined,
  },
  {
    id: 'copy-prompt',
    label: 'Copy prompt',
    icon: 'copy',
    nodes: [
      'input.text',
      'input.prompt',
      'input.system-prompt',
      'input.user-prompt',
      ...imageGeneratorNodeTypes,
    ],
    visible: (context) =>
      Boolean(
        context.hasImageOutput ||
        (['input.text', 'input.prompt', 'input.system-prompt', 'input.user-prompt'].includes(
          context.nodeType,
        ) &&
          context.hasText),
      ),
    disabledReason: (context) =>
      ['input.text', 'input.prompt', 'input.system-prompt', 'input.user-prompt'].includes(
        context.nodeType,
      )
        ? context.hasText
          ? undefined
          : 'Add text before copying the prompt.'
        : context.hasPrompt
          ? undefined
          : 'This output has no saved prompt in its execution snapshot.',
  },
  {
    id: 'image-tools',
    label: 'Image tools',
    icon: 'crop',
    nodes: '*',
    visible: (context) => Boolean(context.hasImageOutput),
    disabledReason: (context) =>
      context.hasSavedImage ? undefined : 'Save this image to Assets before using image tools.',
  },
  {
    id: 'replace-input',
    label: 'Replace media',
    icon: 'upload',
    nodes: ['input.image', 'input.video', 'input.audio'],
    visible: (context) => Boolean(getNodeCapabilities(context.nodeType)?.inputMedia),
  },
  ...(
    [
      ['info', 'Info', 'info'],
      ['diagnostics', 'Copy diagnostics', 'copy'],
      ['duplicate', 'Duplicate node', 'duplicate'],
      ['rename', 'Rename', 'rename'],
      ['delete', 'Delete node', 'delete'],
    ] as const
  ).map(([id, label, icon]) => ({
    id,
    label,
    icon,
    handler: id,
    nodes: '*' as const,
    visible: () => true,
  })),
]

export function getRegisteredNodeActions(context: NodeActionContext): RegisteredNodeAction[] {
  return nodeActionRegistry
    .filter(
      (action) =>
        (action.nodes === '*' || action.nodes.includes(context.nodeType)) &&
        action.visible(context),
    )
    .map((action) => {
      const disabledReason = action.disabledReason?.(context)
      return {
        id: action.id,
        label: action.label,
        icon: action.icon,
        handler: action.handler || action.id,
        disabled: Boolean(disabledReason),
        ...(disabledReason ? { disabledReason } : {}),
      }
    })
}

const nodeCapabilities: Record<
  string,
  { modality?: NodeModality; generator?: boolean; inputMedia?: boolean }
> = {
  'input.text': { modality: 'text' },
  'input.prompt': { modality: 'text' },
  'input.system-prompt': { modality: 'text' },
  'input.user-prompt': { modality: 'text' },
  'input.json': { modality: 'text' },
  'input.image': { modality: 'image', inputMedia: true },
  'input.video': { modality: 'video', inputMedia: true },
  'input.audio': { modality: 'audio', inputMedia: true },
  'ai.generate-text': { modality: 'text', generator: true },
  'ai.analyze-image': { modality: 'vision', generator: true },
  'ai.generate-image': { modality: 'image', generator: true },
  'ai.edit-image': { modality: 'image', generator: true },
  'ai.generate-video': { modality: 'video', generator: true },
  'ai.image-to-video': { modality: 'video', generator: true },
  'ai.generate-audio': { modality: 'audio', generator: true },
  'output.save-image': { modality: 'image' },
  'output.save-video': { modality: 'video' },
  'output.save-audio': { modality: 'audio' },
}

export function getNodeCapabilities(nodeType: string) {
  return nodeCapabilities[nodeType]
}

export function getNodePrimaryAction(
  nodeType: string,
  status: NodeActionState | undefined,
  isVideoTaskPending = false,
  isWorkflowRunning = false,
): NodePrimaryAction {
  const action = getRegisteredNodeActions({
    nodeType,
    status,
    isVideoTaskPending,
    isWorkflowRunning,
  }).find((item) => ['check-status', 'cancel', 'retry', 'run'].includes(item.id))
  return action?.id === 'check-status' ||
    action?.id === 'cancel' ||
    action?.id === 'retry' ||
    action?.id === 'run'
    ? action.id
    : 'none'
}
