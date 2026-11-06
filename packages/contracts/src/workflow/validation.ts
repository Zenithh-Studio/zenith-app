import { registryByType } from './registry'
import { workflowDefinitionSchema } from './schemas'
import type { WorkflowDefinition, WorkflowNode } from './types'

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
  targetNodeId?: string,
): WorkflowNode[] {
  const parsed = workflowDefinitionSchema.safeParse(definition)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid workflow definition.')
  }

  const nodes = new Map(parsed.data.nodes.map((node) => [node.id, node]))
  let included = new Set(nodes.keys())
  if (targetNodeId) {
    if (!nodes.has(targetNodeId)) throw new Error('The selected node no longer exists.')
    included = new Set([targetNodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of parsed.data.edges) {
        if (included.has(edge.target) && !included.has(edge.source)) {
          included.add(edge.source)
          changed = true
        }
      }
    }
  }

  const incomingCounts = new Map<string, number>()
  for (const edge of parsed.data.edges) {
    if (!included.has(edge.source) || !included.has(edge.target)) continue
    const key = `${edge.target}\u0000${edge.targetHandle}`
    incomingCounts.set(key, (incomingCounts.get(key) ?? 0) + 1)
  }
  for (const id of included) {
    const node = nodes.get(id)!
    const nodeDefinition = registryByType.get(node.type)
    if (!nodeDefinition) throw new Error(`Node type “${node.type}” is not supported.`)
    for (const input of nodeDefinition.inputs) {
      const count = incomingCounts.get(`${node.id}\u0000${input.id}`) ?? 0
      if (input.required && count === 0) {
        throw new Error(`Node “${node.name}” is missing required input “${input.name}”.`)
      }
    }
  }

  const indegree = new Map([...included].map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of parsed.data.edges) {
    if (!included.has(edge.source) || !included.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    const targets = outgoing.get(edge.source) ?? []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }

  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id)
  const sorted: WorkflowNode[] = []
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    sorted.push(nodes.get(id)!)
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }
  if (sorted.length !== included.size) {
    throw new Error('Cycles are not supported in executable workflows.')
  }
  return sorted
}
