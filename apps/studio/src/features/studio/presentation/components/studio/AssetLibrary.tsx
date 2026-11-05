'use client'

import { FileVideo, Image as ImageIcon, LoaderCircle, Upload } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Brand, Sidebar } from './AppChrome'
import type { AssetDocument } from '@znith/contracts'
import { formatFileSize } from '@znith/utils'

export function AssetLibrary() {
  const [assets, setAssets] = useState<AssetDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const load = useCallback(async () => {
    const response = await fetch('/api/studio/assets')
    const responseBody = await response.json()
    if (response.ok) setAssets(responseBody.docs)
    else setError(responseBody.error || 'Could not load assets.')
    setLoading(false)
  }, [])
  useEffect(() => {
    // The request resolves asynchronously and then initializes the remote asset state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  const upload = async (file: File) => {
    const form = new FormData()
    form.set('file', file)
    form.set('alt', file.name)
    const response = await fetch('/api/studio/assets', { method: 'POST', body: form })
    const responseBody = await response.json()
    if (!response.ok) setError(responseBody.error || 'Could not upload asset.')
    else {
      setLoading(true)
      await load()
    }
  }
  return (
    <main className="flex min-h-screen bg-[#f7f7f8]">
      <Sidebar active="assets" />
      <section className="min-w-0 flex-1">
        <header className="flex h-16 items-center border-b border-zinc-200 bg-white px-5 lg:hidden">
          <Brand />
        </header>
        <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                Workspace
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Asset library</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Upload and reuse production media across workflows.
              </p>
            </div>
            <input
              ref={input}
              type="file"
              accept="image/*,video/*,audio/*,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) upload(file)
                event.target.value = ''
              }}
            />
            <button
              onClick={() => input.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"
            >
              <Upload size={16} /> Upload asset
            </button>
          </div>
          {error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {loading ? (
            <div className="grid h-72 place-items-center text-sm text-zinc-500">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : assets.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {assets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.url ?? undefined}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative grid aspect-square place-items-center bg-zinc-100">
                    {asset.mimeType?.startsWith('image/') && asset.url ? (
                      <Image
                        src={asset.url}
                        alt={asset.filename || ''}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
                        unoptimized
                        className="object-cover"
                      />
                    ) : asset.mimeType?.startsWith('video/') && asset.url ? (
                      <video src={asset.url} className="size-full object-cover" />
                    ) : (
                      <FileVideo className="text-zinc-300" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-xs font-medium">
                      {asset.filename || 'Untitled asset'}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-400">
                      {asset.mimeType} · {formatFileSize(asset.filesize)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white text-center">
              <div>
                <ImageIcon className="mx-auto text-zinc-300" />
                <p className="mt-3 text-sm font-medium">No assets yet</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Upload an image, video, audio file, or PDF.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
