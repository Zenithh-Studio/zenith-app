import { AssetsPage } from '@/features/studio'
import { requireAppUser } from '@/lib/app-auth'

export default async function Page() {
  await requireAppUser()
  return <AssetsPage />
}
