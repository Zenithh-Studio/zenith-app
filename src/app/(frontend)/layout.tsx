import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FrontendLayout, frontendMetadata } from '@znith/fe'
import '@znith/fe/styles.css'

export const metadata: Metadata = frontendMetadata

export default function RootLayout({ children }: { children: ReactNode }) {
  return <FrontendLayout>{children}</FrontendLayout>
}
