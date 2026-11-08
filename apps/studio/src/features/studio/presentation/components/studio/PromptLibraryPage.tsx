'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BookOpenText,
  Check,
  Clipboard,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Sidebar } from './AppChrome'
import { useLocale } from '@/features/studio/shared/i18n/LocaleProvider'

type PromptRecord = {
  id: string
  title: string
  description?: string
  content: string
  category?: string
  tags?: Array<{ tag: string }>
  updatedAt: string
}
const blankPrompt = { title: '', description: '', content: '', category: '', tags: '' }

export function PromptLibraryPage() {
  const { t, locale } = useLocale()
  const [prompts, setPrompts] = useState<PromptRecord[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<PromptRecord | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const categories = useMemo(
    () => [...new Set(prompts.map((prompt) => prompt.category).filter(Boolean) as string[])].sort(),
    [prompts],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ page: String(page) })
      if (search.trim()) query.set('search', search.trim())
      if (category) query.set('category', category)
      const response = await fetch(`/api/studio/prompts?${query}`)
      const body = (await response.json()) as {
        docs?: PromptRecord[]
        totalPages?: number
        error?: string
      }
      if (!response.ok) throw new Error(body.error || 'Could not load prompts.')
      setPrompts(body.docs || [])
      setTotalPages(body.totalPages || 1)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load prompts.')
    } finally {
      setLoading(false)
    }
  }, [category, page, search])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (prompt: PromptRecord) => {
    setEditing(prompt)
    setFormOpen(true)
  }
  const savePrompt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setFeedback('')
    const form = new FormData(event.currentTarget)
    const body = {
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      content: String(form.get('content') || ''),
      category: String(form.get('category') || ''),
      tags: String(form.get('tags') || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }
    try {
      const response = await fetch('/api/studio/prompts', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...body } : body),
      })
      const result = (await response.json()) as { prompt?: PromptRecord; error?: string }
      if (!response.ok || !result.prompt)
        throw new Error(result.error || 'Prompt could not be saved.')
      setFormOpen(false)
      await load()
      setFeedback(locale === 'vi' ? 'Đã lưu prompt.' : 'Prompt saved.')
    } catch (saveError) {
      setFeedback(saveError instanceof Error ? saveError.message : 'Prompt could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const deletePrompt = async (prompt: PromptRecord) => {
    const confirmed = window.confirm(
      locale === 'vi' ? `Xóa “${prompt.title}”?` : `Delete “${prompt.title}”?`,
    )
    if (!confirmed) return
    const response = await fetch('/api/studio/prompts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prompt.id }),
    })
    if (!response.ok) {
      const body = (await response.json()) as { error?: string }
      setFeedback(body.error || 'Prompt could not be deleted.')
    } else {
      setPrompts((current) => current.filter((item) => item.id !== prompt.id))
    }
  }

  const copyPrompt = async (prompt: PromptRecord) => {
    await navigator.clipboard.writeText(prompt.content)
    setFeedback(locale === 'vi' ? 'Đã sao chép nội dung prompt.' : 'Prompt copied to clipboard.')
  }

  const savePromptAsTextAsset = async (prompt: PromptRecord) => {
    try {
      const response = await fetch('/api/studio/text-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.title,
          content: prompt.content,
          source: 'prompt',
          sourceId: prompt.id,
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Text asset could not be saved.')
      setFeedback(locale === 'vi' ? 'Đã lưu prompt vào Assets.' : 'Prompt saved to Assets.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Text asset could not be saved.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f8] lg:flex-row">
      <Sidebar active="prompts" />
      <main className="min-w-0 flex-1 px-4 pb-12 pt-5 sm:px-7 lg:px-10 lg:pt-9">
        <div className="mx-auto max-w-6xl">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#746d9d]">
                Workspace library
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                {t('nav.prompts')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-500">
                {locale === 'vi'
                  ? 'Lưu prompt thuộc tài khoản, sắp xếp theo chủ đề và đưa vào Studio chỉ với một bước.'
                  : 'Keep prompts with your account, organize them by topic, and send them straight into Studio.'}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#272441] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#403a6d]"
            >
              <Plus size={15} />
              {locale === 'vi' ? 'Tạo prompt' : 'New prompt'}
            </button>
          </header>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <label className="relative min-w-[220px] flex-1 sm:max-w-md">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <span className="sr-only">{t('common.search')}</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={
                  locale === 'vi' ? 'Tìm tiêu đề hoặc nội dung…' : 'Search titles or content…'
                }
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
              />
            </label>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value)
                setPage(1)
              }}
              aria-label={locale === 'vi' ? 'Lọc danh mục' : 'Filter category'}
              className="h-10 min-w-36 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-700"
            >
              <option value="">{locale === 'vi' ? 'Mọi danh mục' : 'All categories'}</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {feedback && (
              <p role="status" className="text-xs text-zinc-500">
                {feedback}
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-zinc-500">
              <LoaderCircle size={16} className="animate-spin" />
              {t('common.loading')}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium"
              >
                {locale === 'vi' ? 'Thử lại' : 'Try again'}
              </button>
            </div>
          ) : prompts.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {prompts.map((prompt) => (
                <article
                  key={prompt.id}
                  className="flex min-h-[270px] flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#efedf8] text-[#655ba0]">
                      <BookOpenText size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-zinc-900">
                        {prompt.title}
                      </h2>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {prompt.description ||
                          prompt.category ||
                          (locale === 'vi' ? 'Chưa phân loại' : 'Uncategorized')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyPrompt(prompt)}
                      aria-label={locale === 'vi' ? 'Sao chép prompt' : 'Copy prompt'}
                      title={locale === 'vi' ? 'Sao chép prompt' : 'Copy prompt'}
                      className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
                    >
                      <Clipboard size={15} />
                    </button>
                  </div>
                  <p className="mt-4 line-clamp-5 flex-1 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
                    {prompt.content}
                  </p>
                  <div className="mt-3 flex min-h-5 flex-wrap gap-1.5">
                    {prompt.tags?.map(({ tag }) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
                    <Link
                      href={`/image?prompt=${encodeURIComponent(prompt.id)}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                    >
                      {locale === 'vi' ? 'Dùng cho ảnh' : 'Use in Image'}
                      <ArrowRight size={12} />
                    </Link>
                    <Link
                      href={`/video?prompt=${encodeURIComponent(prompt.id)}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      {locale === 'vi' ? 'Dùng cho video' : 'Use in Video'}
                      <ArrowRight size={12} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void savePromptAsTextAsset(prompt)}
                      aria-label={
                        locale === 'vi' ? 'Lưu prompt vào Assets' : 'Save prompt to Assets'
                      }
                      title={locale === 'vi' ? 'Lưu prompt vào Assets' : 'Save prompt to Assets'}
                      className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(prompt)}
                      aria-label={locale === 'vi' ? 'Sửa prompt' : 'Edit prompt'}
                      className="ml-auto grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePrompt(prompt)}
                      aria-label={locale === 'vi' ? 'Xóa prompt' : 'Delete prompt'}
                      className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-400">
                  <BookOpenText size={21} />
                </span>
                <h2 className="mt-4 text-sm font-semibold text-zinc-800">
                  {locale === 'vi' ? 'Thư viện prompt đang trống' : 'Your prompt library is empty'}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {locale === 'vi'
                    ? 'Tạo prompt đầu tiên để lưu dùng lại.'
                    : 'Create your first reusable prompt.'}
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Plus size={14} />
                  {locale === 'vi' ? 'Tạo prompt' : 'Create prompt'}
                </button>
              </div>
            </div>
          )}

          {!loading && totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs disabled:opacity-40"
              >
                {locale === 'vi' ? 'Trước' : 'Previous'}
              </button>
              <span className="text-xs text-zinc-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs disabled:opacity-40"
              >
                {locale === 'vi' ? 'Sau' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </main>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/35 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFormOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-form-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#746d9d]">
                  {locale === 'vi' ? 'Không gian riêng' : 'Private to your workspace'}
                </p>
                <h2 id="prompt-form-title" className="mt-1 text-xl font-semibold text-zinc-900">
                  {editing
                    ? locale === 'vi'
                      ? 'Sửa prompt'
                      : 'Edit prompt'
                    : locale === 'vi'
                      ? 'Prompt mới'
                      : 'New prompt'}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t('common.cancel')}
                onClick={() => setFormOpen(false)}
                className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
              >
                <X size={17} />
              </button>
            </div>
            <form
              key={editing?.id || 'new'}
              onSubmit={(event) => void savePrompt(event)}
              className="mt-5 space-y-4"
            >
              <label className="block text-xs font-medium text-zinc-600">
                {locale === 'vi' ? 'Tiêu đề' : 'Title'}
                <input
                  name="title"
                  required
                  defaultValue={editing?.title || blankPrompt.title}
                  className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-600">
                  {locale === 'vi' ? 'Chủ đề' : 'Category'}
                  <input
                    name="category"
                    defaultValue={editing?.category || ''}
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600">
                  {locale === 'vi' ? 'Thẻ, phân cách bằng dấu phẩy' : 'Tags, comma separated'}
                  <input
                    name="tags"
                    defaultValue={editing?.tags?.map(({ tag }) => tag).join(', ') || ''}
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-zinc-600">
                {locale === 'vi' ? 'Mô tả' : 'Description'}
                <input
                  name="description"
                  defaultValue={editing?.description || ''}
                  className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                {locale === 'vi' ? 'Nội dung prompt' : 'Prompt content'}
                <textarea
                  name="content"
                  required
                  rows={9}
                  defaultValue={editing?.content || ''}
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 p-3 text-sm leading-6 outline-none focus:border-violet-400"
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-10 rounded-lg px-4 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#272441] px-4 text-xs font-semibold text-white hover:bg-[#403a6d] disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
