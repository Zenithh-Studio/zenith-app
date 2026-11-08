import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/features/studio'
import { getAppSession } from '@/lib/app-auth'
import { headers } from 'next/headers'

export const metadata: Metadata = { title: 'Sign in · Zenith Studio' }

export default async function LoginPage() {
  const session = await getAppSession(new Headers(await headers()))
  if (session) redirect('/workflows')
  return <AuthForm mode="login" />
}
