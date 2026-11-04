import Link from 'next/link'
import { Boxes, ChevronDown, CircleHelp, Command, Settings2, Workflow } from 'lucide-react'

export function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 font-semibold tracking-[-0.02em] text-zinc-950"
    >
      <span className="grid size-8 place-items-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
        <Command size={17} strokeWidth={2.4} />
      </span>
      <span>Znith Studio</span>
    </Link>
  )
}

export function Sidebar({ active = 'workflows' }: { active?: 'workflows' | 'assets' }) {
  return (
    <aside className="hidden w-[232px] shrink-0 border-r border-zinc-200/80 bg-white px-3 py-4 lg:flex lg:flex-col">
      <div className="px-2 pb-7">
        <Brand />
      </div>
      <nav className="space-y-1 text-sm">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium ${active === 'workflows' ? 'bg-violet-50 text-violet-700' : 'text-zinc-600 hover:bg-zinc-50'}`}
        >
          <Workflow size={17} /> Workflows
        </Link>
        <Link
          href="/assets"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium ${active === 'assets' ? 'bg-violet-50 text-violet-700' : 'text-zinc-600 hover:bg-zinc-50'}`}
        >
          <Boxes size={17} /> Assets
        </Link>
      </nav>
      <div className="mt-auto space-y-1 border-t border-zinc-100 pt-3 text-sm">
        <a
          href="/admin"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-zinc-600 hover:bg-zinc-50"
        >
          <Settings2 size={17} /> Admin settings
        </a>
        <Link
          href="/docs"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-zinc-600 hover:bg-zinc-50"
        >
          <CircleHelp size={17} /> Documentation
        </Link>
        <a
          href="/admin"
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-zinc-200 p-2 text-left hover:bg-zinc-50"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-xs font-semibold text-violet-700">
            ZS
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-zinc-800">
              Local workspace
            </span>
            <span className="block text-[11px] text-zinc-400">Payload connected</span>
          </span>
          <ChevronDown size={14} className="text-zinc-400" />
        </a>
      </div>
    </aside>
  )
}
