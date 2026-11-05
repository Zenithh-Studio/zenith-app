import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FrontendLayout, frontendMetadata } from '@/features/studio'
import '@/features/studio/styles.css'

export const metadata: Metadata = frontendMetadata

export default function RootLayout({ children }: { children: ReactNode }) {
  return <FrontendLayout>{children}</FrontendLayout>
}
