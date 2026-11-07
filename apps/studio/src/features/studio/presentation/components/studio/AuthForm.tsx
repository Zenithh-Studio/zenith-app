'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Command, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocale } from '../../../shared/i18n/LocaleProvider'

type AuthMode = 'login' | 'signup'

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { t } = useLocale()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [adminSetupAvailable, setAdminSetupAvailable] = useState(false)
  const isSignup = mode === 'signup'

  useEffect(() => {
    if (!isSignup) return
    void fetch('/api/studio/auth/setup-status')
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as { adminSetupAvailable?: boolean }
        setAdminSetupAvailable(Boolean(body.adminSetupAvailable))
      })
      .catch(() => undefined)
  }, [isSignup])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')

    try {
      if (isSignup) {
        const response = await fetch('/api/studio/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            name: String(form.get('name') || '').trim(),
            ...(adminSetupAvailable
              ? { adminSetupToken: String(form.get('adminSetupToken') || '') }
              : {}),
          }),
        })
        const body = (await response.json()) as { message?: string; error?: string }
        if (!response.ok)
          throw new Error(body.error || 'Account creation is temporarily unavailable.')
        const loginResponse = await fetch('/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!loginResponse.ok) {
          setMessage(
            t(
              'We could not sign you in automatically. If you already have an account, use its existing password. Otherwise, retry signup.',
            ),
          )
          return
        }
        router.replace('/workflows')
        router.refresh()
      } else {
        const response = await fetch('/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!response.ok) throw new Error('The email or password was not accepted.')
        router.replace('/workflows')
        router.refresh()
      }
    } catch (submitError) {
      setError(t(submitError instanceof Error ? submitError.message : 'Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f5f4f1] text-zinc-950 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
      <section className="relative hidden overflow-hidden border-r border-[#e6e3dd] bg-[#efeee9] p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -right-24 top-24 size-[360px] rounded-full border border-[#d8d4e7]" />
        <div className="absolute -right-8 top-40 size-[240px] rounded-full border border-[#d8d4e7]" />
        <div className="absolute right-20 top-[208px] size-24 rounded-full bg-[#d9d5e8]" />
        <Link href="/login" className="relative z-10 flex w-fit items-center gap-3 font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-[#272441] text-[#e6e2ff]">
            <Command size={17} />
          </span>
          <span>Zenith</span>
          <span className="border-l border-zinc-300 pl-3 text-xs font-medium text-zinc-500">
            Studio
          </span>
        </Link>
        <div className="relative z-10 max-w-xl">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#706992]">
            {t('A workspace for visual thinking')}
          </p>
          <h1 className="max-w-lg text-5xl font-medium leading-[1.06] tracking-[-0.055em] xl:text-6xl">
            {t('Make room for the next idea.')}
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-zinc-600">
            {t(
              'Connect prompts, images, video, and the small decisions that turn experiments into finished work.',
            )}
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-2">
            {['Build workflows', 'Explore images', 'Shape video'].map((label, index) => (
              <div key={label} className="border-t border-[#d8d4cc] pt-3">
                <span className="text-[10px] font-semibold text-[#716d82]">0{index + 1}</span>
                <p className="mt-1 text-xs text-zinc-600">{t(label)}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-[11px] text-zinc-400">
          {t('Private by design · Your work stays in your workspace')}
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-[#272441] text-[#e6e2ff]">
              <Command size={17} />
            </span>
            <span className="font-semibold">Zenith Studio</span>
          </div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#716995]">
              {t(isSignup ? 'Create your workspace' : 'Welcome back')}
            </p>
            <h2 className="text-[32px] font-medium tracking-[-0.045em]">
              {t(isSignup ? 'Start with an account' : 'Sign in to Zenith')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {isSignup
                ? t('Create an account to keep your workflows and studio history together.')
                : t('Your projects, prompts, and assets are waiting.')}
            </p>
          </div>

          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {isSignup && (
              <label className="block text-xs font-medium text-zinc-700">
                {t('Name')} <span className="text-zinc-400">{t('(optional)')}</span>
                <input
                  name="name"
                  autoComplete="name"
                  className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[#716995] focus:ring-2 focus:ring-[#716995]/15"
                  placeholder={t('How should we address you?')}
                />
              </label>
            )}
            <label className="block text-xs font-medium text-zinc-700">
              {t('Email')}
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[#716995] focus:ring-2 focus:ring-[#716995]/15"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              {t('Password')}
              <input
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                minLength={isSignup ? 12 : undefined}
                className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[#716995] focus:ring-2 focus:ring-[#716995]/15"
                placeholder={t(isSignup ? 'At least 12 characters' : 'Enter your password')}
              />
            </label>
            {isSignup && adminSetupAvailable && (
              <label className="block text-xs font-medium text-zinc-700">
                {t('Admin setup token')} <span className="text-zinc-400">{t('(optional)')}</span>
                <input
                  name="adminSetupToken"
                  type="password"
                  autoComplete="off"
                  className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-[#716995] focus:ring-2 focus:ring-[#716995]/15"
                  placeholder={t('For the first workspace administrator')}
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700"
              >
                {error}
              </p>
            )}
            {message && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800"
              >
                {message}
                <Link href="/login" className="ml-1 font-semibold underline underline-offset-2">
                  {t('Sign in')}
                </Link>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#302c4c] px-4 text-sm font-semibold text-white transition hover:bg-[#413b66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#655ba0] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {loading ? t('Please wait…') : isSignup ? t('Create account') : t('Sign in')}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-500">
            {t(isSignup ? 'Already have an account?' : 'New to Zenith?')}{' '}
            <Link
              href={isSignup ? '/login' : '/signup'}
              className="font-semibold text-[#514a7c] underline-offset-4 hover:underline"
            >
              {t(isSignup ? 'Sign in' : 'Create an account')}
            </Link>
          </p>
          <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-zinc-400">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>{t('Encrypted sessions · Private account data')}</span>
          </div>
        </div>
      </section>
    </main>
  )
}
