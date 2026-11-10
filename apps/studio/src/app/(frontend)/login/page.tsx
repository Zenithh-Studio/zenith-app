import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Sign in · Zenith Studio' }

export default function LoginPage() {
  redirect('/workflows')
}
