import { WorkflowEditor } from '@/features/studio'
import { requireAppUser } from '@/lib/app-auth'

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAppUser()
  const { id } = await params
  return <WorkflowEditor workflowId={id} />
}
