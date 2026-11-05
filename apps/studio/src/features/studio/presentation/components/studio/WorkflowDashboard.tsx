'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDownUp,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  Ellipsis,
  FileUp,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { workflowTemplates } from '@znith/contracts'
import type { WorkflowDocument } from '@znith/contracts'
import { formatDate, slugify } from '@znith/utils'
import { Sidebar, Brand } from './AppChrome'

const templateTones: Record<string, string> = {
  blank: 'bg-zinc-100 text-zinc-700',
  story: 'bg-violet-100 text-violet-700',
  creative: 'bg-fuchsia-100 text-fuchsia-700',
  video: 'bg-blue-100 text-blue-700',
}

const templates = Object.entries(workflowTemplates).map(([templateId, template]) => ({
  id: templateId,
  name: templateId === 'blank' ? 'Blank workflow' : template.name,
  detail: templateId === 'blank' ? 'Start from an empty canvas' : template.description,
  tone: templateTones[templateId] ?? 'bg-zinc-100 text-zinc-700',
}))

function Status({ value }: { value: string }) {
  const config =
    value === 'succeeded'
      ? { icon: Check, label: 'Succeeded', className: 'bg-emerald-50 text-emerald-700' }
      : value === 'failed'
        ? { icon: CircleAlert, label: 'Failed', className: 'bg-rose-50 text-rose-700' }
        : value === 'running'
          ? { icon: LoaderCircle, label: 'Running', className: 'bg-violet-50 text-violet-700' }
          : { icon: Clock3, label: 'Idle', className: 'bg-zinc-100 text-zinc-600' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      <config.icon size={12} className={value === 'running' ? 'animate-spin' : ''} /> {config.label}
    </span>
  )
}

export function WorkflowDashboard() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState<{
    workflowId: string
    left: number
    top: number
  } | null>(null)
  const [error, setError] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const displayedWorkflows = [...workflows].sort((a, b) => {
    const difference = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    return newestFirst ? difference : -difference
  })
  const activeWorkflow = activeMenu
    ? workflows.find((workflow) => workflow.id === activeMenu.workflowId)
    : undefined

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/studio/workflows?search=${encodeURIComponent(search)}`)
    const responseBody = await response.json()
    if (!response.ok) setError(responseBody.error || 'Could not load workflows.')
    else setWorkflows(responseBody.docs)
    setLoading(false)
  }, [search])

  useEffect(() => {
    const timeout = setTimeout(load, 200)
    return () => clearTimeout(timeout)
  }, [load])

  useEffect(() => {
    if (!activeMenu) return

    const dismissMenu = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuPanelRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) return
      setActiveMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveMenu(null)
    }
    const dismissOnViewportChange = () => setActiveMenu(null)

    document.addEventListener('pointerdown', dismissMenu)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', dismissOnViewportChange)
    window.addEventListener('scroll', dismissOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', dismissMenu)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', dismissOnViewportChange)
      window.removeEventListener('scroll', dismissOnViewportChange, true)
    }
  }, [activeMenu])

  const toggleWorkflowMenu = (event: MouseEvent<HTMLButtonElement>, workflowId: string) => {
    event.stopPropagation()
    if (activeMenu?.workflowId === workflowId) {
      setActiveMenu(null)
      return
    }

    const anchor = event.currentTarget.getBoundingClientRect()
    const menuWidth = 176
    const menuHeight = 152
    const gutter = 8
    menuTriggerRef.current = event.currentTarget
    setActiveMenu({
      workflowId,
      left: Math.max(
        gutter,
        Math.min(anchor.right - menuWidth, window.innerWidth - menuWidth - gutter),
      ),
      top:
        anchor.bottom + menuHeight + gutter <= window.innerHeight
          ? anchor.bottom + 4
          : Math.max(gutter, anchor.top - menuHeight - 4),
    })
  }

  const create = async (templateId: string) => {
    const response = await fetch('/api/studio/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    })
    const responseBody = await response.json()
    if (!response.ok) return setError(responseBody.error || 'Could not create workflow.')
    router.push(`/workflows/${responseBody.workflow.id}`)
  }

  const remove = async (workflow: WorkflowDocument) => {
    if (
      !window.confirm(
        `Delete “${workflow.name}”? Execution history for this workflow will no longer be accessible.`,
      )
    )
      return
    const response = await fetch(`/api/studio/workflows/${workflow.id}`, { method: 'DELETE' })
    if (!response.ok) return setError('Could not delete workflow.')
    setWorkflows((current) => current.filter((item) => item.id !== workflow.id))
  }

  const duplicate = async (workflow: WorkflowDocument) => {
    const response = await fetch('/api/studio/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: 'blank',
        name: `${workflow.name} copy`,
        description: workflow.description,
        definition: workflow.definition,
      }),
    })
    if (!response.ok) return setError('Could not duplicate workflow.')
    await load()
  }

  const run = async (workflow: WorkflowDocument) => {
    setWorkflows((current) =>
      current.map((item) => (item.id === workflow.id ? { ...item, status: 'running' } : item)),
    )
    await fetch(`/api/studio/workflows/${workflow.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    await load()
  }

  const exportWorkflow = (workflow: WorkflowDocument) => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, ...workflow }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slugify(workflow.name) || 'workflow'}.znith.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importWorkflow = async (file: File) => {
    try {
      const imported = JSON.parse(await file.text()) as WorkflowDocument
      const response = await fetch('/api/studio/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: 'blank',
          name: `${imported.name || 'Imported workflow'} (imported)`,
          description: imported.description,
          definition: imported.definition,
        }),
      })
      if (!response.ok) throw new Error()
      await load()
    } catch {
      setError('The selected file is not a valid Znith workflow export.')
    }
  }

  return (
    <main className="flex min-h-screen bg-[#f7f7f8] text-zinc-950">
      <Sidebar />
      <section className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-zinc-200/80 bg-white px-5 lg:hidden">
          <Brand />
          <button
            onClick={() => setCreateOpen(true)}
            className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white"
          >
            <Plus size={18} />
          </button>
        </header>
        <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                Workspace
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Workflows</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Build, run, and monitor your AI production systems.
              </p>
            </div>
            <div className="relative">
              <button
                onClick={() => setCreateOpen(!createOpen)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700"
              >
                <Plus size={16} /> Create workflow
              </button>
              {createOpen && (
                <div className="absolute right-0 top-12 z-30 w-80 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-200/60">
                  <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Choose a starting point
                  </div>
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => create(template.id)}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-zinc-50"
                    >
                      <span
                        className={`grid size-9 place-items-center rounded-xl ${template.tone}`}
                      >
                        <Sparkles size={16} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{template.name}</span>
                        <span className="text-xs text-zinc-500">{template.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <CircleAlert size={16} />
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-zinc-200/30">
            <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-sm">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  size={16}
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search workflows"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(event) =>
                    event.target.files?.[0] && importWorkflow(event.target.files[0])
                  }
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  <FileUp size={14} /> Import
                </button>
                <button
                  onClick={() => setNewestFirst((value) => !value)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  <ArrowDownUp size={14} /> Updated {newestFirst ? 'newest' : 'oldest'}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="grid h-72 place-items-center text-sm text-zinc-500">
                <LoaderCircle className="mr-2 inline animate-spin" size={18} /> Loading workflows
              </div>
            ) : workflows.length === 0 ? (
              <div className="grid min-h-80 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                    <WorkflowIcon size={22} />
                  </span>
                  <h2 className="font-semibold">No workflows yet</h2>
                  <p className="mt-1 max-w-sm text-sm text-zinc-500">
                    Create a blank canvas or start with a production-ready template.
                  </p>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Create your first workflow
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] table-fixed text-left text-sm">
                  <thead className="bg-zinc-50/80 text-xs font-medium text-zinc-500">
                    <tr>
                      <th className="w-[26%] px-5 py-3.5">Workflow</th>
                      <th className="w-[13%] px-4 py-3.5">Category</th>
                      <th className="w-[8%] px-4 py-3.5">Nodes</th>
                      <th className="w-[16%] px-4 py-3.5">Last execution</th>
                      <th className="w-[12%] px-4 py-3.5">Status</th>
                      <th className="w-[17%] px-4 py-3.5">Updated</th>
                      <th className="w-[8%] px-2 py-3.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {displayedWorkflows.map((workflow) => (
                      <tr key={workflow.id} className="group hover:bg-zinc-50/70">
                        <td className="px-5 py-4">
                          <Link href={`/workflows/${workflow.id}`}>
                            <span className="font-medium text-zinc-900 group-hover:text-violet-700">
                              {workflow.name}
                            </span>
                            <span className="mt-1 block max-w-xs truncate text-xs text-zinc-500">
                              {workflow.description || 'No description'}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-4 capitalize text-zinc-600">{workflow.category}</td>
                        <td className="px-4 py-4 text-zinc-600">
                          {workflow.definition.nodes?.length ?? 0}
                        </td>
                        <td className="px-4 py-4 text-zinc-500">
                          {formatDate(workflow.lastExecutionAt)}
                        </td>
                        <td className="px-4 py-4">
                          <Status value={workflow.status} />
                        </td>
                        <td className="px-4 py-4 text-zinc-500">
                          {formatDate(workflow.updatedAt)}
                        </td>
                        <td className="px-2 py-4 text-right">
                          <button
                            ref={
                              activeMenu?.workflowId === workflow.id ? menuTriggerRef : undefined
                            }
                            onClick={(event) => toggleWorkflowMenu(event, workflow.id)}
                            aria-label={`Actions for ${workflow.name}`}
                            aria-haspopup="true"
                            aria-expanded={activeMenu?.workflowId === workflow.id}
                            className="ml-auto grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-white hover:text-zinc-700"
                          >
                            <Ellipsis size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
      {activeMenu && activeWorkflow && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuPanelRef}
              role="group"
              aria-label="Workflow actions"
              style={{ left: activeMenu.left, top: activeMenu.top }}
              className="fixed z-[100] w-44 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl shadow-zinc-900/10"
            >
              <button
                onClick={() => {
                  setActiveMenu(null)
                  void run(activeWorkflow)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50"
              >
                <Play size={14} /> Run workflow
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null)
                  void duplicate(activeWorkflow)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50"
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                onClick={() => {
                  exportWorkflow(activeWorkflow)
                  setActiveMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50"
              >
                <Download size={14} /> Export JSON
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null)
                  void remove(activeWorkflow)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>,
            document.body,
          )
        : null}
    </main>
  )
}
