import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Create an account · Zenith Studio' }

export default function SignupPage() {
  redirect('/workflows')
}
