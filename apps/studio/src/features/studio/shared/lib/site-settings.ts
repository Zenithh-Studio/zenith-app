export const siteSettings = {
  title: process.env.SITE_TITLE || 'Znith Studio',
  description:
    process.env.SITE_DESCRIPTION || 'Build, execute, and monitor typed AI production workflows.',
  language: process.env.SITE_LOCALE || 'en',
  url: process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
}
