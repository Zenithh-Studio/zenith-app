'use client'

import Link from 'next/link'
import { ArrowLeft, Braces, GitBranch, Play, ShieldCheck } from 'lucide-react'
import { useLocale } from '../shared/i18n/LocaleProvider'
import { Sidebar } from '../presentation/components/studio/AppChrome'

export function DocumentationPage() {
  const { t } = useLocale()
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 lg:flex-row">
      <Sidebar active="docs" />
      <main className="min-w-0 flex-1 px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-violet-700"
          >
            <ArrowLeft size={16} /> {t('Back to workflows')}
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
            Znith Studio
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">{t('Workflow guide')}</h1>
          <p className="mt-3 text-zinc-500">
            {t(
              'Build typed production graphs, configure providers later, and inspect every persisted execution.',
            )}
          </p>
          <div className="mt-10 space-y-4">
            {[
              [
                Braces,
                'Add and configure nodes',
                'Use the Canvas Elements tab, bottom Add menu, or right-click the canvas. Media nodes expose provider, model, prompt, aspect ratio, and upload controls.',
              ],
              [
                GitBranch,
                'Connect typed ports',
                'Drag between matching handles. Invalid data types and duplicate single-input edges are rejected.',
              ],
              [
                Play,
                'Run safely',
                'Run the whole workflow or a selected node with dependencies. Independent branches run concurrently with retry and timeout policies.',
              ],
              [
                ShieldCheck,
                'Configure credentials',
                'Add provider keys in Settings. Keys are encrypted on the server and never written into workflow exports or browser code.',
              ],
            ].map(([Icon, title, detail]) => (
              <section
                key={String(title)}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <Icon className="text-violet-600" size={20} />
                <h2 className="mt-3 font-semibold">{t(String(title))}</h2>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">{t(String(detail))}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
