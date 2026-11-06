import { randomUUID } from 'node:crypto'
import { registryByType } from '@znith/contracts'
import type { NodeExecutionRecord, WorkflowDefinition, WorkflowNode } from '@znith/contracts'
import type { WorkflowRepository } from '../domain/workflow-repository'

function referencesAsset(value: unknown, assetIds: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => referencesAsset(item, assetIds))
  if (!value || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    key === 'assetId'
      ? typeof nested === 'string' && assetIds.has(nested)
      : referencesAsset(nested, assetIds),
  )
}

function clearNodeAssetReference(node: WorkflowNode, assetIds: Set<string>) {
  const config = node.config
  const isMediaInput = node.type === 'input.image' || node.type === 'input.video'
  if (isMediaInput && referencesAsset(config, assetIds)) {
    const clearedConfig = { ...config }
    for (const key of [
      'assetId',
      'url',
      'fileName',
      'mimeType',
      'imageWidth',
      'imageHeight',
      'selectedOutput',
      'outputRevision',
    ]) {
      delete clearedConfig[key]
    }
    return {
      node: {
        ...node,
        config: {
          ...clearedConfig,
          ...(registryByType.get(node.type)?.defaultConfig ?? {}),
        },
      },
      changed: true,
    }
  }

  if (referencesAsset(config.selectedOutput, assetIds)) {
    return {
      node: {
        ...node,
        config: { ...config, selectedOutput: null, outputRevision: randomUUID() },
      },
      changed: true,
    }
  }
  return { node, changed: false }
}

function clearDefinitionAssetReferences(definition: WorkflowDefinition, assetIds: Set<string>) {
  let changed = false
  const nodes = definition.nodes.map((node) => {
    const result = clearNodeAssetReference(node, assetIds)
    changed ||= result.changed
    return result.node
  })
  return changed ? { definition: { ...definition, nodes }, changed } : { definition, changed }
}

function clearExecutionOutputReferences(records: NodeExecutionRecord[], assetIds: Set<string>) {
  let changed = false
  const nextRecords = records.map((record) => {
    if (!record.outputs) return record
    const outputs = Object.fromEntries(
      Object.entries(record.outputs).filter(([, output]) => !referencesAsset(output, assetIds)),
    )
    if (Object.keys(outputs).length === Object.keys(record.outputs).length) return record
    changed = true
    return { ...record, outputs }
  })
  return { records: changed ? nextRecords : records, changed }
}

export class WorkflowAssetReferenceCleaner {
  constructor(private readonly repository: WorkflowRepository) {}

  async clearAssetReferences(assetIds: string[]) {
    const ids = new Set(assetIds)
    if (!ids.size) return

    const workflows = await this.repository.listAllWorkflows()
    for (const workflow of workflows) {
      const result = clearDefinitionAssetReferences(workflow.definition, ids)
      if (result.changed) {
        await this.repository.updateWorkflow(workflow.id, { definition: result.definition })
      }
    }

    const executions = await this.repository.listAllExecutions()
    for (const execution of executions) {
      const snapshot = clearDefinitionAssetReferences(execution.snapshot, ids)
      const nodeRecords = clearExecutionOutputReferences(execution.nodeRecords, ids)
      if (!snapshot.changed && !nodeRecords.changed) continue
      await this.repository.updateExecution(execution.id, {
        ...(snapshot.changed ? { snapshot: snapshot.definition } : {}),
        ...(nodeRecords.changed ? { nodeRecords: nodeRecords.records } : {}),
      })
    }
  }
}
