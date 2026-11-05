import React from 'react'
import type { Metadata } from 'next'
import { siteSettings } from '../shared/lib/site-settings'

export const frontendMetadata: Metadata = {
  metadataBase: new URL(siteSettings.url),
  title: siteSettings.title,
  description: siteSettings.description,
  openGraph: {
    title: siteSettings.title,
    description: siteSettings.description,
  },
}

export function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteSettings.language}>
      <body className="min-h-screen bg-white text-zinc-950 antialiased">
        <a className="skip-link" href="#root">
          Skip to content
        </a>
        <div id="root" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  )
}
