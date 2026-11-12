import { executeWorkflowRequestSchema, validateWorkflowDefinition } from '@znith/contracts'
import type {
  ExecutionDocument,
  ExecutionLog,
  NodeExecutionRecord,
  WorkflowDefinition,
} from '@znith/contracts'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { withContextApiLogging } from '@/lib/server-logger'
import { withProviderCredentials } from '@/server/modules/providers/credential-context'
import { runWorkflow } from '@/server/modules/workflows/infrastructure/engine'

type RouteContext = { params: Promise<{ id: string }> }
type ProviderId =
  'openai' | 'anthropic' | 'gemini' | 'replicate' | 'runway' | 'chatgpt2api' | 'muse2api'
type Credentials = {
  keys?: Partial<Record<ProviderId, string>>
  baseUrls?: Partial<Record<ProviderId, string>>
}
type LocalWorkflow = { id: string; name?: string; definition?: WorkflowDefinition }

const activeRuns = new Map<string, AbortController>()

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Workflow execution failed.'
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
      '[credential]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [credential]')
    .slice(0, 2000)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasStableMediaReference(node: WorkflowDefinition['nodes'][number]) {
  return Boolean(node.config.assetId || node.config.storageKey || node.config.fileId)
}

function snapshotWorkflowDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  const mediaInputTypes = new Set(['input.image', 'input.video', 'input.audio'])
  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      if (
        !mediaInputTypes.has(node.type) ||
        !hasStableMediaReference(node) ||
        typeof node.config.url !== 'string' ||
        !node.config.url.startsWith('data:')
      ) {
        return node
      }
      return { ...node, config: { ...node.config, url: '' } }
    }),
  }
}

function stripInlineInputMedia(records: NodeExecutionRecord[], definition: WorkflowDefinition) {
  const mediaInputTypes = new Set(['input.image', 'input.video', 'input.audio'])
  const localMediaNodeIds = new Set(
    definition.nodes
      .filter(
        (node) =>
          mediaInputTypes.has(node.type) &&
          hasStableMediaReference(node) &&
          typeof node.config.url === 'string' &&
          node.config.url.startsWith('data:'),
      )
      .map((node) => node.id),
  )

  return records.map((record) => {
    if (!record.outputs || !localMediaNodeIds.has(record.nodeId)) return record
    return {
      ...record,
      outputs: Object.fromEntries(
        Object.entries(record.outputs).map(([key, output]) => {
          if (!['image', 'video', 'audio'].includes(output.type) || !isRecord(output.value)) {
            return [key, output]
          }
          return [key, { ...output, value: { ...output.value, url: '' } }]
        }),
      ),
    }
  })
}

function isPrivateAddress(address: string) {
  if (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80:')
  )
    return true
  const octets = address.split('.').map(Number)
  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254) ||
      octets[0] === 0)
  )
}

async function inlineMediaURL(value: unknown) {
  if (!isRecord(value) || typeof value.url !== 'string') return value
  const source = value.url
  if (source.startsWith('data:')) return value
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return value
  }
  if (url.protocol !== 'https:') return value
  const addressType = isIP(url.hostname)
  const addresses = addressType
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => [])
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return value
  const response = await fetch(url, {
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  }).catch(() => null)
  if (!response?.ok) return value
  const size = Number(response.headers.get('content-length'))
  const declaredMimeType = typeof value.mimeType === 'string' ? value.mimeType : ''
  const limit = declaredMimeType.startsWith('video/') ? 150 * 1024 * 1024 : 40 * 1024 * 1024
  if (Number.isFinite(size) && size > limit) return value
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.byteLength || buffer.byteLength > limit) return value
  const mimeType =
    response.headers.get('content-type')?.split(';', 1)[0] ||
    String(value.mimeType || 'application/octet-stream')
  return { ...value, url: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType }
}

async function inlineExecutionMedia(records: NodeExecutionRecord[]) {
  return Promise.all(
    records.map(async (record) => {
      if (!record.outputs) return record
      const outputs = Object.fromEntries(
        await Promise.all(
          Object.entries(record.outputs).map(async ([key, output]) => {
            if (!['image', 'video', 'audio'].includes(output.type)) return [key, output]
            const value = await inlineMediaURL(output.value)
            return [key, { ...output, value }]
          }),
        ),
      )
      return { ...record, outputs }
    }),
  )
}

async function executeWorkflow(request: Request, context: RouteContext) {
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!isRecord(body) || !isRecord(body.workflow)) {
    return Response.json({ error: 'The local workflow definition is required.' }, { status: 400 })
  }
  const workflow = body.workflow as LocalWorkflow
  if (workflow.id !== id || !workflow.definition) {
    return Response.json({ error: 'The local workflow definition is invalid.' }, { status: 400 })
  }
  const input = executeWorkflowRequestSchema.safeParse({
    ...(typeof body.targetNodeId === 'string' ? { targetNodeId: body.targetNodeId } : {}),
    ...(typeof body.groupId === 'string' ? { groupId: body.groupId } : {}),
    ...(typeof body.retryOfExecutionId === 'string'
      ? { retryOfExecutionId: body.retryOfExecutionId }
      : {}),
  })
  if (!input.success)
    return Response.json({ error: 'Invalid workflow execution request.' }, { status: 400 })
  if (activeRuns.has(id))
    return Response.json({ error: 'This workflow is already running.' }, { status: 409 })

  const credentials = (isRecord(body.credentials) ? body.credentials : {}) as Credentials
  const definition = structuredClone(workflow.definition)
  const group = input.data.groupId
    ? definition.groups?.find((candidate) => candidate.id === input.data.groupId)
    : undefined
  if (input.data.groupId && !group)
    return Response.json({ error: 'The selected group no longer exists.' }, { status: 422 })
  try {
    validateWorkflowDefinition(definition, input.data.targetNodeId, group?.nodeIds)
  } catch (error) {
    return Response.json({ error: sanitizeError(error) }, { status: 422 })
  }

  const controller = new AbortController()
  activeRuns.set(id, controller)
  const startedAt = new Date()
  const executionId = crypto.randomUUID()
  const recordsById = new Map<string, NodeExecutionRecord>()
  const logs: ExecutionLog[] = []
  const scope = input.data.targetNodeId
    ? `node:${input.data.targetNodeId}:with-dependencies`
    : group
      ? `group:${group.id}`
      : 'workflow'

  try {
    const result = await withProviderCredentials(
      {
        keys: credentials.keys || {},
        baseUrls: credentials.baseUrls || {},
      },
      () =>
        runWorkflow(definition, input.data.targetNodeId, {
          signal: controller.signal,
          ...(group ? { targetNodeIds: group.nodeIds } : {}),
          onNodeRecord: async (record) => {
            recordsById.set(record.nodeId, structuredClone(record))
          },
          onExecutionLog: async (log) => {
            logs.push(structuredClone(log))
          },
          onProviderTask: (nodeId, task) => {
            const record = recordsById.get(nodeId)
            if (record) recordsById.set(nodeId, { ...record, providerTask: { ...task } })
          },
        }),
    )
    const completedAt = new Date()
    const localRecords = stripInlineInputMedia(
      await inlineExecutionMedia(result.records),
      definition,
    )
    const execution: ExecutionDocument & { workflowId: string } = {
      id: executionId,
      workflow: id,
      workflowId: id,
      status: result.status,
      scope,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      snapshot: snapshotWorkflowDefinition(definition),
      nodeRecords: localRecords,
      logs: result.logs,
      ...(result.error ? { error: result.error } : {}),
      createdAt: startedAt.toISOString(),
      updatedAt: completedAt.toISOString(),
    }
    return Response.json(
      { executionId, ...result, records: localRecords, execution },
      { status: result.status === 'failed' ? 422 : 200 },
    )
  } catch (error) {
    return Response.json({ error: sanitizeError(error) }, { status: 502 })
  } finally {
    activeRuns.delete(id)
  }
}

async function cancelWorkflow(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const controller = activeRuns.get(id)
  if (!controller)
    return Response.json({ error: 'No active workflow execution can be stopped.' }, { status: 409 })
  controller.abort(new Error('Execution was cancelled by the user.'))
  return Response.json({ cancelled: true })
}

export const POST = withContextApiLogging('/api/studio/workflows/[id]/execute', executeWorkflow)
export const DELETE = withContextApiLogging('/api/studio/workflows/[id]/execute', cancelWorkflow)
