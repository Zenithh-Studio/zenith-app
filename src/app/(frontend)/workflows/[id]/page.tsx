import { WorkflowEditor } from '@znith/fe'

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WorkflowEditor workflowId={id} />
}
