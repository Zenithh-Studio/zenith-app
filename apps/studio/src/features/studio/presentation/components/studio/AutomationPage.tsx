'use client'

import type {
  AssetDocument,
  NodeExecutionRecord,
  NodeValue,
  WorkflowDocument,
  WorkflowNode,
} from '@znith/contracts'
import { registryByType } from '@znith/contracts'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bot,
  Check,
  CircleAlert,
  Clock3,
  Eye,
  FileImage,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveLocalMediaUrl, studioFetch } from '@/lib/studio-local-api'
import { formatLocaleDate, useLocale } from '@/features/studio/shared/i18n/LocaleProvider'
import { Sidebar } from './AppChrome'

type AutomationMediaResult = {
  type: 'image' | 'video'
  assetId?: string
  storageKey?: string
  fileName?: string
  mimeType?: string
  url?: string
  executionId?: string
  createdAt: string
}

type AutomationPromptRow = {
  id: string
  userPrompt: string
  result: AutomationMediaResult | null
  status: 'idle' | 'running' | 'succeeded' | 'failed'
  error?: string
}

type AutomationDocument = {
  id: string
  name: string
  workflowId: string
  records: AutomationPromptRow[]
  createdAt: string
  updatedAt: string
}

type AutomationPlan = {
  promptNode: WorkflowNode
  generatorNode: WorkflowNode
  mediaType: 'image' | 'video'
}

const mediaGeneratorTypes = new Set([
  'ai.generate-image',
  'ai.edit-image',
  'ai.generate-video',
  'ai.image-to-video',
])
const workflowOutputGeneratorTypes = new Set([...mediaGeneratorTypes, 'ai.generate-audio'])

function automationPlan(workflow: WorkflowDocument): { plan?: AutomationPlan; reason?: string } {
  const nodes = workflow.definition?.nodes || []
  const edges = workflow.definition?.edges || []
  const promptNodes = nodes.filter((node) => node.type === 'input.user-prompt')
  if (promptNodes.length !== 1 || String(promptNodes[0]?.config.value ?? '').trim()) {
    return { reason: 'This workflow must contain exactly one empty User Prompt node.' }
  }

  const generatorNodes = nodes.filter((node) => workflowOutputGeneratorTypes.has(node.type))
  if (generatorNodes.length !== 1) {
    return { reason: 'This workflow must contain exactly one output generator.' }
  }

  const promptNode = promptNodes[0]!
  const generatorNode = generatorNodes[0]!
  if (!mediaGeneratorTypes.has(generatorNode.type)) {
    return { reason: 'Automation supports image or video generators only.' }
  }
  const connectedPrompt = edges.some(
    (edge) =>
      edge.source === promptNode.id &&
      edge.sourceHandle === 'prompt' &&
      edge.target === generatorNode.id &&
      edge.targetHandle === 'prompt',
  )
  if (!connectedPrompt) {
    return { reason: 'The User Prompt node must be connected to the generator Prompt input.' }
  }

  const definition = registryByType.get(generatorNode.type)
  const missingRequiredInput = definition?.inputs.find(
    (port) =>
      port.required &&
      !edges.some((edge) => edge.target === generatorNode.id && edge.targetHandle === port.id),
  )
  if (missingRequiredInput) {
    return {
      reason: `Connect the required ${missingRequiredInput.name} input before using this workflow.`,
    }
  }

  return {
    plan: {
      promptNode,
      generatorNode,
      mediaType:
        generatorNode.type === 'ai.generate-image' || generatorNode.type === 'ai.edit-image'
          ? 'image'
          : 'video',
    },
  }
}

function countCompleted(automation: AutomationDocument) {
  return automation.records.filter((row) => Boolean(row.result)).length
}

export function AutomationDashboard() {
  const { locale, t } = useLocale()
  const router = useRouter()
  const [automations, setAutomations] = useState<AutomationDocument[]>([])
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [automationResponse, workflowResponse] = await Promise.all([
        studioFetch('/api/studio/automations', { cache: 'no-store' }),
        studioFetch('/api/studio/workflows', { cache: 'no-store' }),
      ])
      const [automationBody, workflowBody] = await Promise.all([
        automationResponse.json(),
        workflowResponse.json(),
      ])
      setError('')
      if (!automationResponse.ok) {
        throw new Error(automationBody.error || 'Could not load automations.')
      }
      setAutomations(automationBody.docs || [])
      setWorkflowNames(
        Object.fromEntries(
          ((workflowBody.docs || []) as WorkflowDocument[]).map((workflow) => [
            workflow.id,
            workflow.name,
          ]),
        ),
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load automations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const createAutomation = async () => {
    setError('')
    try {
      const response = await studioFetch('/api/studio/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Automation ${automations.length + 1}` }),
      })
      const body = (await response.json()) as { automation?: AutomationDocument; error?: string }
      if (!response.ok || !body.automation) {
        throw new Error(body.error || 'Could not create automation.')
      }
      router.push(`/automations/${body.automation.id}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create automation.')
    }
  }

  const removeAutomation = async (automation: AutomationDocument) => {
    if (!window.confirm(t('Delete automation “{name}”?', { name: automation.name }))) return
    const response = await studioFetch(`/api/studio/automations/${automation.id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      setError(t('Could not delete automation.'))
      return
    }
    setAutomations((current) => current.filter((item) => item.id !== automation.id))
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f7f8] text-zinc-950 lg:flex-row">
      <Sidebar active="automations" />
      <section className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                <Bot size={14} /> {t('Workspace')}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">{t('Automations')}</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-500">
                {t('Manage repeatable runs of image and video workflows.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void createAutomation()}
              className="inline-flex h-10 items-center gap-2 self-start rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 sm:self-auto"
            >
              <Plus size={16} /> {t('Create automation')}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {t(error)}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-zinc-200/30">
            {loading ? (
              <div className="grid h-64 place-items-center text-sm text-zinc-500">
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="animate-spin" size={18} /> {t('Loading automations')}
                </span>
              </div>
            ) : automations.length === 0 ? (
              <div className="grid min-h-80 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                    <Bot size={22} />
                  </span>
                  <h2 className="font-semibold">{t('No automations yet')}</h2>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
                    {t('Manage repeatable runs of image and video workflows.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void createAutomation()}
                    className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    {t('Create your first automation')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <thead className="bg-zinc-50/80 text-xs font-medium text-zinc-500">
                    <tr>
                      <th className="w-[32%] px-5 py-3.5">{t('Automation')}</th>
                      <th className="w-[28%] px-4 py-3.5">{t('Workflow')}</th>
                      <th className="w-[15%] px-4 py-3.5">{t('User Prompt')}</th>
                      <th className="w-[17%] px-4 py-3.5">{t('Updated')}</th>
                      <th className="w-[8%] px-3 py-3.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {automations.map((automation) => (
                      <tr key={automation.id} className="group hover:bg-zinc-50/70">
                        <td className="px-5 py-4">
                          <Link
                            href={`/automations/${automation.id}`}
                            className="font-medium text-zinc-900 group-hover:text-violet-700"
                          >
                            {automation.name || t('Automation')}
                          </Link>
                        </td>
                        <td className="truncate px-4 py-4 text-zinc-600">
                          {workflowNames[automation.workflowId] || t('Choose workflow')}
                        </td>
                        <td className="px-4 py-4 text-zinc-600">
                          {countCompleted(automation)} / {automation.records.length}
                        </td>
                        <td className="px-4 py-4 text-zinc-500">
                          {formatLocaleDate(automation.updatedAt, locale)}
                        </td>
                        <td className="px-3 py-4 text-right">
                          <button
                            type="button"
                            aria-label={`${t('Delete automation')} ${automation.name}`}
                            title={t('Delete automation')}
                            onClick={() => void removeAutomation(automation)}
                            className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

export function AutomationDetailPage({ automationId }: { automationId: string }) {
  const { locale, t } = useLocale()
  const router = useRouter()
  const [automation, setAutomation] = useState<AutomationDocument | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([])
  const [resolvedResults, setResolvedResults] = useState<Record<string, string>>({})
  const [assetPickerRowId, setAssetPickerRowId] = useState('')
  const [assetCandidates, setAssetCandidates] = useState<AssetDocument[]>([])
  const [assetPickerLoading, setAssetPickerLoading] = useState(false)
  const [uploadMenuRowId, setUploadMenuRowId] = useState('')
  const [uploadingRowId, setUploadingRowId] = useState('')
  const [previewResult, setPreviewResult] = useState<{
    url: string
    type: 'image' | 'video'
    fileName: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  const [runningRowId, setRunningRowId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const automationRef = useRef<AutomationDocument | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRowIdRef = useRef('')
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const runLockRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const [automationResponse, workflowResponse] = await Promise.all([
        studioFetch(`/api/studio/automations/${encodeURIComponent(automationId)}`, {
          cache: 'no-store',
        }),
        studioFetch('/api/studio/workflows', { cache: 'no-store' }),
      ])
      const [automationBody, workflowBody] = await Promise.all([
        automationResponse.json(),
        workflowResponse.json(),
      ])
      setError('')
      if (!automationResponse.ok || !automationBody.automation) {
        throw new Error(automationBody.error || 'Automation not found.')
      }
      const loaded = automationBody.automation as AutomationDocument
      automationRef.current = loaded
      setAutomation(loaded)
      setWorkflows((workflowBody.docs || []) as WorkflowDocument[])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load automations.')
    } finally {
      setLoading(false)
    }
  }, [automationId])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const selectedWorkflow = workflows.find((workflow) => workflow.id === automation?.workflowId)
  const selectedPlan = selectedWorkflow ? automationPlan(selectedWorkflow) : undefined
  const eligibleWorkflows = useMemo(
    () => workflows.filter((workflow) => Boolean(automationPlan(workflow).plan)),
    [workflows],
  )

  const persistCurrent = async (): Promise<boolean> => {
    const snapshot = automationRef.current
    if (!snapshot) return false
    if (savePromiseRef.current) {
      const activeSave = await savePromiseRef.current
      if (!activeSave) return false
      if (automationRef.current !== snapshot) return persistCurrent()
      return true
    }

    setSaving(true)
    const savePromise = (async () => {
      try {
        const response = await studioFetch(`/api/studio/automations/${snapshot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        })
        const body = (await response.json()) as {
          automation?: AutomationDocument
          error?: string
        }
        if (!response.ok || !body.automation) {
          throw new Error(body.error || 'Could not save automation.')
        }
        if (automationRef.current === snapshot) {
          automationRef.current = body.automation
          setAutomation(body.automation)
          setDirty(false)
        }
        setError('')
        return true
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not save automation.')
        return false
      } finally {
        setSaving(false)
      }
    })()
    savePromiseRef.current = savePromise
    const succeeded = await savePromise
    if (savePromiseRef.current === savePromise) savePromiseRef.current = null
    if (succeeded && automationRef.current !== snapshot) return persistCurrent()
    return succeeded
  }

  const mutateAutomation = (update: (current: AutomationDocument) => AutomationDocument) => {
    const current = automationRef.current
    if (!current) return
    const next = { ...update(current), updatedAt: new Date().toISOString() }
    automationRef.current = next
    setAutomation(next)
    setDirty(true)
  }

  const getGeneratorOutput = (
    body: Record<string, unknown>,
    plan: AutomationPlan,
  ): { record: NodeExecutionRecord; output: NodeValue } => {
    const records = (
      Array.isArray(body.records)
        ? body.records
        : (body.execution as Record<string, unknown> | undefined)?.nodeRecords
    ) as NodeExecutionRecord[] | undefined
    const record = records?.find((item) => item.nodeId === plan.generatorNode.id)
    if (!record || record.status !== 'succeeded') {
      throw new Error(record?.error || String(body.error || 'Workflow generation failed.'))
    }
    const output = Object.values(record.outputs || {}).find((item) => item.type === plan.mediaType)
    if (!output) throw new Error('The workflow completed without an image or video result.')
    return { record, output }
  }

  const runPromptRow = async (
    rowId: string,
    workflow: WorkflowDocument,
    plan: AutomationPlan,
  ): Promise<boolean> => {
    const row = automationRef.current?.records.find((item) => item.id === rowId)
    if (!row || row.result || !row.userPrompt.trim()) return false
    setRunningRowId(rowId)
    setNotice('')
    mutateAutomation((current) => ({
      ...current,
      records: current.records.map((item) =>
        item.id === rowId ? { ...item, status: 'running', error: '' } : item,
      ),
    }))
    try {
      const definition = structuredClone(workflow.definition)
      definition.nodes = definition.nodes.map((node) =>
        node.id === plan.promptNode.id
          ? { ...node, config: { ...node.config, value: row.userPrompt } }
          : node,
      )
      const response = await studioFetch(`/api/studio/workflows/${workflow.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetNodeId: plan.generatorNode.id,
          workflowDefinition: definition,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok) throw new Error(String(body.error || 'Workflow generation failed.'))
      const { output } = getGeneratorOutput(body, plan)
      const data =
        output.value && typeof output.value === 'object'
          ? (output.value as Record<string, unknown>)
          : { url: output.value }
      const metadata = output.metadata || {}
      const result: AutomationMediaResult = {
        type: plan.mediaType,
        ...(typeof output.assetId === 'string' ? { assetId: output.assetId } : {}),
        ...(typeof data.storageKey === 'string'
          ? { storageKey: data.storageKey }
          : typeof metadata.storageKey === 'string'
            ? { storageKey: metadata.storageKey }
            : {}),
        ...(typeof data.fileName === 'string'
          ? { fileName: data.fileName }
          : typeof metadata.fileName === 'string'
            ? { fileName: metadata.fileName }
            : typeof metadata.filename === 'string'
              ? { fileName: metadata.filename }
              : {}),
        ...(typeof data.mimeType === 'string'
          ? { mimeType: data.mimeType }
          : typeof metadata.mimeType === 'string'
            ? { mimeType: metadata.mimeType }
            : {}),
        ...(typeof data.url === 'string'
          ? { url: data.url }
          : typeof output.value === 'string'
            ? { url: output.value }
            : {}),
        ...(typeof body.executionId === 'string'
          ? { executionId: body.executionId }
          : typeof (body.execution as Record<string, unknown> | undefined)?.id === 'string'
            ? { executionId: String((body.execution as Record<string, unknown>).id) }
            : {}),
        createdAt: new Date().toISOString(),
      }
      if (!result.assetId && !result.storageKey && !result.url) {
        throw new Error('The workflow result does not contain a readable media asset.')
      }
      const latestURL = await resolveLocalMediaUrl(
        result.assetId || '',
        result.fileName,
        result.storageKey,
      )
      if (latestURL) setResolvedResults((current) => ({ ...current, [rowId]: latestURL }))
      mutateAutomation((current) => ({
        ...current,
        records: current.records.map((item) =>
          item.id === rowId ? { ...item, status: 'succeeded', result, error: '' } : item,
        ),
      }))
      return true
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Workflow generation failed.'
      mutateAutomation((current) => ({
        ...current,
        records: current.records.map((item) =>
          item.id === rowId ? { ...item, status: 'failed', error: message } : item,
        ),
      }))
      setError(message)
      return false
    } finally {
      setRunningRowId('')
    }
  }

  const runOne = async (rowId: string) => {
    if (runLockRef.current || !automation || !selectedWorkflow || !selectedPlan?.plan) return
    runLockRef.current = true
    setBatchRunning(false)
    setError('')
    setNotice('')
    try {
      const row = automationRef.current?.records.find((item) => item.id === rowId)
      if (row?.result) return
      if (!row?.userPrompt.trim()) {
        setError(t('Prompt cannot be blank.'))
        return
      }
      await runPromptRow(rowId, selectedWorkflow, selectedPlan.plan)
    } finally {
      runLockRef.current = false
    }
  }

  const runAll = async () => {
    if (runLockRef.current || !automation || !selectedWorkflow || !selectedPlan?.plan) return
    runLockRef.current = true
    setBatchRunning(true)
    setError('')
    setNotice('')
    try {
      const rows = [...(automationRef.current?.records || [])]
      let generated = 0
      let failed = 0
      let skipped = 0
      for (const row of rows) {
        const current = automationRef.current?.records.find((item) => item.id === row.id)
        if (!current || current.result || !current.userPrompt.trim()) {
          skipped += 1
          continue
        }
        if (await runPromptRow(row.id, selectedWorkflow, selectedPlan.plan)) generated += 1
        else failed += 1
      }
      setNotice(
        t('Automation run finished: {generated} generated, {failed} failed, {skipped} skipped.', {
          generated,
          failed,
          skipped,
        }),
      )
    } finally {
      runLockRef.current = false
      setBatchRunning(false)
      setRunningRowId('')
    }
  }

  const changeWorkflow = (workflowId: string) => {
    setResolvedResults({})
    mutateAutomation((current) => ({
      ...current,
      workflowId,
      records: current.records.map((row) => ({
        ...row,
        result: null,
        status: 'idle',
        error: '',
      })),
    }))
  }

  const openAssetPicker = async (rowId: string) => {
    const mediaType = selectedPlan?.plan?.mediaType
    if (!mediaType) return
    setUploadMenuRowId('')
    setAssetPickerRowId(rowId)
    setAssetCandidates([])
    setAssetPickerLoading(true)
    try {
      const response = await studioFetch(`/api/studio/assets?type=${mediaType}&limit=100`, {
        cache: 'no-store',
      })
      const body = (await response.json()) as { docs?: AssetDocument[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load media assets.')
      setAssetCandidates(
        (body.docs || []).filter((asset) =>
          String(asset.mimeType || '')
            .toLowerCase()
            .startsWith(`${mediaType}/`),
        ),
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load media assets.')
    } finally {
      setAssetPickerLoading(false)
    }
  }

  const attachAssetToRow = async (rowId: string, asset: AssetDocument) => {
    const mediaType = selectedPlan?.plan?.mediaType
    if (
      !mediaType ||
      !String(asset.mimeType || '')
        .toLowerCase()
        .startsWith(`${mediaType}/`)
    ) {
      setError(t('Uploaded media type must match the workflow output.'))
      return
    }
    const result: AutomationMediaResult = {
      type: mediaType,
      assetId: asset.id,
      ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
      ...(asset.filename ? { fileName: asset.filename } : {}),
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      ...(asset.url ? { url: asset.url } : {}),
      createdAt: new Date().toISOString(),
    }
    const localURL = await resolveLocalMediaUrl(
      result.assetId || '',
      result.fileName,
      result.storageKey,
    )
    setResolvedResults((current) => ({
      ...current,
      [rowId]: localURL || result.url || '',
    }))
    mutateAutomation((current) => ({
      ...current,
      records: current.records.map((row) =>
        row.id === rowId ? { ...row, result, status: 'succeeded', error: '' } : row,
      ),
    }))
    setAssetPickerRowId('')
    setError('')
  }

  const uploadMediaFile = async (rowId: string, file: File) => {
    const mediaType = selectedPlan?.plan?.mediaType
    if (!mediaType) return
    if (!file.type.toLowerCase().startsWith(`${mediaType}/`)) {
      setError(t('Uploaded media type must match the workflow output.'))
      return
    }
    setUploadingRowId(rowId)
    setUploadMenuRowId('')
    setError('')
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('alt', file.name)
      const response = await studioFetch('/api/studio/assets', { method: 'POST', body: form })
      const body = (await response.json()) as { media?: AssetDocument; error?: string }
      if (!response.ok || !body.media) throw new Error(body.error || 'Could not upload media.')
      await attachAssetToRow(rowId, body.media)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not upload media.')
    } finally {
      setUploadingRowId('')
    }
  }

  const clearRowResult = (rowId: string) => {
    setResolvedResults((current) => {
      const next = { ...current }
      delete next[rowId]
      return next
    })
    mutateAutomation((current) => ({
      ...current,
      records: current.records.map((row) =>
        row.id === rowId ? { ...row, result: null, status: 'idle', error: '' } : row,
      ),
    }))
  }

  const resultReferenceKey = JSON.stringify(
    automation?.records.map((row) => [
      row.id,
      row.result?.assetId,
      row.result?.storageKey,
      row.result?.fileName,
      row.result?.url,
    ]) || [],
  )

  useEffect(() => {
    const current = automationRef.current
    if (!current) return
    let active = true
    void Promise.all(
      current.records.map(async (row) => {
        if (!row.result) return [row.id, ''] as const
        const localURL = await resolveLocalMediaUrl(
          row.result.assetId || '',
          row.result.fileName,
          row.result.storageKey,
        )
        return [row.id, localURL || row.result.url || ''] as const
      }),
    ).then((entries) => {
      if (active) setResolvedResults(Object.fromEntries(entries))
    })
    return () => {
      active = false
    }
    // The key tracks only saved media references, so typing a prompt does not re-resolve every result.
  }, [resultReferenceKey])

  const deleteAutomation = async () => {
    if (!automation) return
    if (!window.confirm(t('Delete automation “{name}”?', { name: automation.name }))) return
    const response = await studioFetch(`/api/studio/automations/${automation.id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      setError(t('Could not delete automation.'))
      return
    }
    router.push('/automations')
  }

  const busy = batchRunning || Boolean(runningRowId) || Boolean(uploadingRowId) || saving

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f7f8] text-zinc-950 lg:flex-row">
      <input
        ref={uploadInputRef}
        type="file"
        accept={selectedPlan?.plan?.mediaType === 'video' ? 'video/*' : 'image/*'}
        className="hidden"
        aria-label={t('Upload media from folder')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          const rowId = uploadTargetRowIdRef.current
          event.currentTarget.value = ''
          if (file && rowId) void uploadMediaFile(rowId, file)
        }}
      />
      <Sidebar active="automations" />
      <section className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <Link
            href="/automations"
            className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-violet-700"
          >
            <ArrowLeft size={14} /> {t('Automations')}
          </Link>

          {loading ? (
            <div className="grid h-64 place-items-center text-sm text-zinc-500">
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="animate-spin" size={18} /> {t('common.loading')}
              </span>
            </div>
          ) : !automation ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-600">
              {error || t('Automation not found.')}
            </div>
          ) : (
            <>
              <header className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                    <Bot size={14} /> {t('Automation details')}
                  </p>
                  <label className="block max-w-2xl">
                    <span className="sr-only">{t('Automation name')}</span>
                    <input
                      value={automation.name}
                      onChange={(event) =>
                        mutateAutomation((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder={t('Automation name')}
                      disabled={busy}
                      className="w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-[-0.035em] outline-none focus:ring-0 disabled:opacity-70"
                    />
                  </label>
                  <p className="mt-2 max-w-3xl text-sm text-zinc-500">
                    {t(
                      'Select a workflow with one empty User Prompt node connected to one image or video generator.',
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs text-zinc-500" role="status">
                    {saving ? t('Saving…') : dirty ? t('Unsaved') : t('Saved')}
                  </span>
                  <button
                    type="button"
                    onClick={() => void persistCurrent()}
                    disabled={saving || busy || !dirty}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {saving ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAutomation()}
                    disabled={busy}
                    className="grid size-10 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    aria-label={t('Delete automation')}
                    title={t('Delete automation')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </header>

              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                >
                  <span className="inline-flex items-start gap-2">
                    <CircleAlert size={16} className="mt-0.5 shrink-0" /> {t(error)}
                  </span>
                </div>
              )}
              {notice && (
                <div
                  role="status"
                  className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                >
                  {notice}
                </div>
              )}

              <section className="mb-6 grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5">
                <label className="block text-xs font-semibold text-zinc-700">
                  {t('Choose workflow')}
                  <select
                    value={automation.workflowId}
                    onChange={(event) => changeWorkflow(event.target.value)}
                    disabled={busy}
                    className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-800 outline-none focus:border-violet-400 disabled:bg-zinc-50"
                  >
                    <option value="">{t('Choose workflow')}</option>
                    {selectedWorkflow && !selectedPlan?.plan && (
                      <option value={selectedWorkflow.id}>
                        {selectedWorkflow.name} ·{' '}
                        {t(selectedPlan?.reason || 'Workflow unavailable')}
                      </option>
                    )}
                    {eligibleWorkflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                  {selectedWorkflow && !selectedPlan?.plan ? (
                    <span className="mt-2 block font-normal text-rose-600">
                      {t(selectedPlan?.reason || 'Workflow unavailable')}
                    </span>
                  ) : eligibleWorkflows.length === 0 ? (
                    <span className="mt-2 block font-normal text-zinc-500">
                      {t('No workflow matches the automation requirements.')}
                    </span>
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => void runAll()}
                  disabled={
                    busy ||
                    !selectedPlan?.plan ||
                    !automation.records.some((row) => row.userPrompt.trim() && !row.result)
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {batchRunning ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {batchRunning ? t('Generating…') : t('Generate all')}
                </button>
              </section>

              <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-zinc-200/30">
                <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{t('User Prompt')}</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {automation.records.length} / 20 · {t('Completed')}{' '}
                      {countCompleted(automation)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      mutateAutomation((current) =>
                        current.records.length >= 20
                          ? current
                          : {
                              ...current,
                              records: [
                                ...current.records,
                                {
                                  id: crypto.randomUUID(),
                                  userPrompt: '',
                                  result: null,
                                  status: 'idle',
                                },
                              ],
                            },
                      )
                    }
                    disabled={busy || automation.records.length >= 20}
                    className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 sm:self-auto"
                  >
                    <Plus size={14} /> {t('Add prompt')}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
                    <thead className="bg-zinc-50/80 text-xs font-medium text-zinc-500">
                      <tr>
                        <th className="w-[7%] px-4 py-3">{t('ID')}</th>
                        <th className="w-[32%] px-4 py-3">{t('User Prompt')}</th>
                        <th className="w-[14%] px-4 py-3">{t('Action')}</th>
                        <th className="w-[37%] px-4 py-3">{t('Result')}</th>
                        <th className="w-[10%] px-4 py-3">{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {automation.records.map((row, index) => {
                        const mediaURL = resolvedResults[row.id] || row.result?.url || ''
                        const rowRunning = row.status === 'running' || runningRowId === row.id
                        return (
                          <tr key={row.id} className="align-top">
                            <td className="px-4 py-4 text-xs font-medium text-zinc-500">
                              <span title={row.id}>{row.id.slice(0, 8)}</span>
                            </td>
                            <td className="px-4 py-3">
                              <textarea
                                aria-label={`${t('User Prompt')} ${index + 1}`}
                                value={row.userPrompt}
                                onChange={(event) =>
                                  mutateAutomation((current) => ({
                                    ...current,
                                    records: current.records.map((item) =>
                                      item.id === row.id
                                        ? { ...item, userPrompt: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                                rows={3}
                                disabled={busy}
                                placeholder={t('Write a user prompt or creative brief…')}
                                className="min-h-20 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5 text-xs leading-5 text-zinc-800 outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-50 disabled:opacity-60"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-nowrap items-center gap-1">
                                <div className="relative">
                                  <button
                                    type="button"
                                    aria-label={t('Attach media')}
                                    title={t('Attach media')}
                                    onClick={() =>
                                      setUploadMenuRowId((current) =>
                                        current === row.id ? '' : row.id,
                                      )
                                    }
                                    disabled={busy || !selectedPlan?.plan}
                                    className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                                  >
                                    {uploadingRowId === row.id ? (
                                      <LoaderCircle size={14} className="animate-spin" />
                                    ) : (
                                      <Upload size={14} />
                                    )}
                                  </button>
                                  {uploadMenuRowId === row.id && (
                                    <div className="absolute left-0 top-9 z-20 flex gap-1 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
                                      <button
                                        type="button"
                                        aria-label={t('Choose from Assets')}
                                        title={t('Choose from Assets')}
                                        onClick={() => void openAssetPicker(row.id)}
                                        className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-violet-50 hover:text-violet-700"
                                      >
                                        <FileImage size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={t('Upload media from folder')}
                                        title={t('Upload media from folder')}
                                        onClick={() => {
                                          uploadTargetRowIdRef.current = row.id
                                          setUploadMenuRowId('')
                                          uploadInputRef.current?.click()
                                        }}
                                        className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-violet-50 hover:text-violet-700"
                                      >
                                        <FolderOpen size={15} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {!row.result && (
                                  <button
                                    type="button"
                                    aria-label={t(
                                      row.status === 'failed' ? 'Retry' : 'Generate row',
                                    )}
                                    title={t(row.status === 'failed' ? 'Retry' : 'Generate row')}
                                    onClick={() => void runOne(row.id)}
                                    disabled={busy || !selectedPlan?.plan || !row.userPrompt.trim()}
                                    className="grid size-8 place-items-center rounded-lg bg-[#292644] text-white hover:bg-[#403a6d] disabled:cursor-not-allowed disabled:opacity-45"
                                  >
                                    {rowRunning ? (
                                      <LoaderCircle size={14} className="animate-spin" />
                                    ) : (
                                      <Play size={13} fill="currentColor" />
                                    )}
                                  </button>
                                )}
                                {row.result && (
                                  <button
                                    type="button"
                                    aria-label={t('Clear result')}
                                    title={t('Clear result')}
                                    onClick={() => clearRowResult(row.id)}
                                    disabled={busy}
                                    className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  aria-label={`${t('Delete row')} ${index + 1}`}
                                  title={t('Delete row')}
                                  onClick={() =>
                                    mutateAutomation((current) => ({
                                      ...current,
                                      records: current.records.filter((item) => item.id !== row.id),
                                    }))
                                  }
                                  disabled={busy}
                                  className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {row.result ? (
                                <div className="flex min-h-[86px] items-start gap-3">
                                  {mediaURL ? (
                                    row.result.type === 'video' ? (
                                      <video
                                        src={mediaURL}
                                        controls
                                        preload="metadata"
                                        className="h-24 w-40 rounded-lg border border-zinc-200 bg-zinc-950 object-contain"
                                      />
                                    ) : (
                                      <div className="relative h-24 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                                        <Image
                                          src={mediaURL}
                                          alt={t('Generated result')}
                                          fill
                                          sizes="160px"
                                          unoptimized
                                          className="object-contain"
                                        />
                                      </div>
                                    )
                                  ) : (
                                    <span className="grid h-24 w-40 place-items-center rounded-lg bg-zinc-50 text-zinc-300">
                                      {row.result.type === 'video' ? (
                                        <Video size={22} />
                                      ) : (
                                        <ImageIcon size={22} />
                                      )}
                                    </span>
                                  )}
                                  <div className="min-w-0 pt-1 text-[10px] text-zinc-500">
                                    <span className="block truncate font-medium text-zinc-700">
                                      {row.result.fileName ||
                                        (row.result.type === 'video' ? t('Video') : t('Image'))}
                                    </span>
                                    <span className="mt-1 block">
                                      {formatLocaleDate(row.result.createdAt, locale)}
                                    </span>
                                    {mediaURL && (
                                      <button
                                        type="button"
                                        aria-label={t('View media')}
                                        title={t('View media')}
                                        onClick={() =>
                                          setPreviewResult({
                                            url: mediaURL,
                                            type: row.result!.type,
                                            fileName:
                                              row.result!.fileName ||
                                              (row.result!.type === 'video'
                                                ? t('Video')
                                                : t('Image')),
                                          })
                                        }
                                        className="mt-2 grid size-7 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                                      >
                                        <Eye size={14} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : row.status === 'failed' ? (
                                <p className="max-w-sm whitespace-pre-wrap text-xs text-rose-600">
                                  {t(row.error || 'Workflow generation failed.')}
                                </p>
                              ) : (
                                <p className="flex min-h-[72px] items-center text-xs text-zinc-400">
                                  {rowRunning
                                    ? t('Generating…')
                                    : t('Generated media appears here.')}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                                {rowRunning ? (
                                  <LoaderCircle size={13} className="animate-spin" />
                                ) : row.result ? (
                                  <Check size={13} className="text-emerald-600" />
                                ) : row.status === 'failed' ? (
                                  <CircleAlert size={13} className="text-rose-500" />
                                ) : (
                                  <Clock3 size={13} />
                                )}
                                {t(
                                  rowRunning
                                    ? 'Running'
                                    : row.result
                                      ? 'Succeeded'
                                      : row.status === 'failed'
                                        ? 'Failed'
                                        : 'Idle',
                                )}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {automation.records.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-500">
                            {t('No user prompts yet. Add a prompt to begin.')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <footer className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3 text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {t('Rows with an existing result are skipped when you generate all.')}
                  </span>
                  <span>{t('Changes are saved only when you click Save.')}</span>
                  <span>{t('At most 20 prompts.')}</span>
                </footer>
              </section>

              {assetPickerRowId && (
                <div
                  className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setAssetPickerRowId('')
                  }}
                >
                  <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="automation-asset-picker-title"
                    className="flex max-h-[min(80vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                  >
                    <header className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
                      <div>
                        <h2 id="automation-asset-picker-title" className="text-base font-semibold">
                          {t('Choose from Assets')}
                        </h2>
                        <p className="mt-1 text-xs text-zinc-500">
                          {t('Choose media that matches the workflow output.')}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={t('Close')}
                        title={t('Close')}
                        onClick={() => setAssetPickerRowId('')}
                        className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                      >
                        <X size={16} />
                      </button>
                    </header>
                    <div className="min-h-48 overflow-y-auto p-5">
                      {assetPickerLoading ? (
                        <div className="grid h-40 place-items-center text-sm text-zinc-500">
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle size={16} className="animate-spin" />
                            {t('common.loading')}
                          </span>
                        </div>
                      ) : assetCandidates.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {assetCandidates.map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => void attachAssetToRow(assetPickerRowId, asset)}
                              className="overflow-hidden rounded-xl border border-zinc-200 text-left transition hover:border-violet-400 hover:shadow-md"
                            >
                              <div className="relative grid aspect-video place-items-center overflow-hidden bg-zinc-100 text-zinc-400">
                                {asset.url && asset.mimeType?.startsWith('video/') ? (
                                  <video
                                    src={asset.url}
                                    preload="metadata"
                                    className="h-full w-full object-contain"
                                  />
                                ) : asset.url ? (
                                  <Image
                                    src={asset.url}
                                    alt={asset.alt || asset.filename || t('Image')}
                                    fill
                                    sizes="(max-width: 1024px) 50vw, 30vw"
                                    unoptimized
                                    className="object-contain"
                                  />
                                ) : asset.mimeType?.startsWith('video/') ? (
                                  <Video size={24} />
                                ) : (
                                  <ImageIcon size={24} />
                                )}
                              </div>
                              <span className="block truncate px-3 py-2 text-xs font-medium text-zinc-700">
                                {asset.filename || t('Untitled media')}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="grid h-40 place-items-center text-sm text-zinc-500">
                          {t('No matching media assets.')}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {previewResult && (
                <div
                  className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/85 p-4 backdrop-blur-sm sm:p-8"
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setPreviewResult(null)
                  }}
                >
                  <section
                    role="dialog"
                    aria-modal="true"
                    aria-label={previewResult.fileName}
                    className="relative flex h-full max-h-[90vh] w-full max-w-6xl items-center justify-center"
                  >
                    <button
                      type="button"
                      aria-label={t('Close')}
                      title={t('Close')}
                      onClick={() => setPreviewResult(null)}
                      className="absolute right-0 top-0 z-10 grid size-10 place-items-center rounded-full bg-white/95 text-zinc-800 shadow-lg hover:bg-white"
                    >
                      <X size={18} />
                    </button>
                    {previewResult.type === 'video' ? (
                      <video
                        src={previewResult.url}
                        controls
                        autoPlay={false}
                        className="max-h-full max-w-full rounded-xl bg-black object-contain shadow-2xl"
                      />
                    ) : (
                      <Image
                        src={previewResult.url}
                        alt={previewResult.fileName}
                        width={1920}
                        height={1080}
                        unoptimized
                        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                      />
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
