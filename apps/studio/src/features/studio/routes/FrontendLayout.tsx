import React from 'react'
import type { Metadata } from 'next'
import { siteSettings } from '../shared/lib/site-settings'
import { LocaleProvider, type Locale } from '../shared/i18n/LocaleProvider'

export const frontendMetadata: Metadata = {
  metadataBase: new URL(siteSettings.url),
  title: siteSettings.title,
  description: siteSettings.description,
  openGraph: {
    title: siteSettings.title,
    description: siteSettings.description,
  },
}

export function FrontendLayout({
  children,
  locale = siteSettings.language === 'vi' ? 'vi' : 'en',
}: {
  children: React.ReactNode
  locale?: Locale
}) {
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white text-zinc-950 antialiased">
        <a className="skip-link" href="#root">
          Skip to content
        </a>
        <div id="root" tabIndex={-1}>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </div>
      </body>
    </html>
  )
}
