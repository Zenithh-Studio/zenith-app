import { redirect } from 'next/navigation'
import { requireAppUser } from '@/lib/app-auth'

export default async function IndexPage() {
  await requireAppUser()
  redirect('/workflows')
}
