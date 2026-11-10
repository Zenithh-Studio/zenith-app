'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Boxes,
  CircleHelp,
  Command,
  Image as ImageIcon,
  Menu,
  Settings2,
  Video,
  Workflow,
  X,
  BookOpenText,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocale } from '@/features/studio/shared/i18n/LocaleProvider'

type NavigationId = 'workflows' | 'image' | 'video' | 'prompts' | 'assets' | 'settings' | 'docs'

const mainNavigation: Array<{
  id: NavigationId
  href: string
  Icon: typeof Workflow
}> = [
  { id: 'workflows', href: '/workflows', Icon: Workflow },
  { id: 'image', href: '/image', Icon: ImageIcon },
  { id: 'video', href: '/video', Icon: Video },
  { id: 'prompts', href: '/prompts', Icon: BookOpenText },
  { id: 'assets', href: '/assets', Icon: Boxes },
]

const utilityNavigation: Array<{
  id: NavigationId
  href: string
  Icon: typeof Settings2
}> = [
  { id: 'settings', href: '/settings', Icon: Settings2 },
  { id: 'docs', href: '/docs', Icon: CircleHelp },
]

export function Brand() {
  return (
    <Link href="/workflows" className="flex items-center gap-3 font-semibold tracking-[-0.03em]">
      <span className="grid size-8 place-items-center rounded-xl bg-[#272441] text-[#e6e2ff]">
        <Command size={16} strokeWidth={2.4} />
      </span>
      <span className="text-[15px] text-zinc-950">Zenith</span>
      <span className="border-l border-zinc-200 pl-3 text-xs font-medium tracking-normal text-zinc-400">
        Studio
      </span>
    </Link>
  )
}

function NavigationLinks({
  active,
  onNavigate,
}: {
  active?: NavigationId
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { t } = useLocale()
  const current = active || mainNavigation.find((item) => pathname === item.href)?.id

  return (
    <>
      <nav aria-label="Main navigation" className="space-y-1">
        {mainNavigation.map(({ id, href, Icon }) => (
          <Link
            key={id}
            href={href}
            onClick={onNavigate}
            aria-current={current === id ? 'page' : undefined}
            className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${current === id ? 'bg-[#efedf8] text-[#403a6d]' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}
          >
            <Icon
              size={17}
              strokeWidth={current === id ? 2.2 : 1.8}
              className={
                current === id ? 'text-[#655ba0]' : 'text-zinc-400 group-hover:text-zinc-600'
              }
              aria-hidden="true"
            />
            {t(`nav.${id}`)}
          </Link>
        ))}
      </nav>
      <div className="mt-8 space-y-1 border-t border-zinc-200/80 pt-4">
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          {t('nav.workspace')}
        </p>
        {utilityNavigation.map(({ id, href, Icon }) => (
          <Link
            key={id}
            href={href}
            onClick={onNavigate}
            aria-current={current === id ? 'page' : undefined}
            className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${current === id ? 'bg-[#efedf8] text-[#403a6d]' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}
          >
            <Icon
              size={17}
              className={current === id ? 'text-[#655ba0]' : 'text-zinc-400'}
              aria-hidden="true"
            />
            {t(`nav.${id}`)}
          </Link>
        ))}
      </div>
    </>
  )
}

export function Sidebar({ active }: { active?: NavigationId }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    if (!mobileOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])

  return (
    <>
      <aside className="hidden w-[248px] shrink-0 border-r border-zinc-200/80 bg-[#fbfbfc] px-4 py-5 lg:flex lg:flex-col">
        <div className="px-2 pb-8">
          <Brand />
        </div>
        <NavigationLinks active={active} />
        <div className="mt-auto border-t border-zinc-200/80 pt-3">
          <div className="mb-2 flex items-center gap-3 px-3 py-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-[#e9e7f5] text-[11px] font-semibold text-[#524b7d]">
              Z
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-zinc-800">{t('nav.private')}</span>
              <span className="block text-[11px] text-zinc-400">{t('nav.projects')}</span>
            </span>
          </div>
          <p className="px-3 py-2 text-[11px] text-zinc-400">Local IndexedDB workspace</p>
        </div>
      </aside>
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 bg-[#fbfbfc] px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          aria-label={mobileOpen ? t('nav.close') : t('nav.open')}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="grid size-10 place-items-center rounded-lg text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/25 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            aria-label="Mobile navigation"
            className="flex h-full w-[min(88vw,320px)] flex-col border-r border-zinc-200 bg-[#fbfbfc] px-4 py-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2 pb-8">
              <Brand />
            </div>
            <NavigationLinks active={active} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto border-t border-zinc-200/80 pt-3">
              <p className="px-3 py-2 text-[11px] text-zinc-400">Local IndexedDB workspace</p>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
