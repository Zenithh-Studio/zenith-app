import { AssetLibrary } from '../presentation/components/studio/AssetLibrary'
import { WorkflowDashboard } from '../presentation/components/studio/WorkflowDashboard'

export function HomePage() {
  return <WorkflowDashboard />
}

export function AssetsPage() {
  return <AssetLibrary />
}

export function WorkflowNotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-6 text-center text-zinc-700">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-500">
          The workflow or page you requested was not found.
        </p>
      </div>
    </main>
  )
}
