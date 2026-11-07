'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Check, KeyRound, LoaderCircle, Shield, HardDrive, Sparkles } from 'lucide-react'
import { Sidebar } from './AppChrome'
import { formatLocaleBytes, useLocale } from '@/features/studio/shared/i18n/LocaleProvider'

type ProviderId =
  'openai' | 'anthropic' | 'gemini' | 'replicate' | 'runway' | 'chatgpt2api' | 'muse2api'
type ProviderStatus = { configured: boolean; endpointCustomized: boolean }
type StudioSettings = {
  locale: 'en' | 'vi'
  modelDefaults: Record<string, unknown>
  imagePreferences: Record<string, unknown>
  videoPreferences: Record<string, unknown>
  audioPreferences: Record<string, unknown>
  providers: Record<ProviderId, ProviderStatus>
}
type UserRow = {
  id: string
  email: string
  name?: string
  role: 'user' | 'admin'
  storageQuotaBytes: number
  storageUsedBytes: number
}

const providerOptions: Array<{ id: ProviderId; name: string }> = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'replicate', name: 'Replicate' },
  { id: 'runway', name: 'Runway' },
  { id: 'chatgpt2api', name: 'ChatGPT2API' },
  { id: 'muse2api', name: 'Muse2API' },
]

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  )
}

function ProviderCard({
  provider,
  status,
  isAdmin,
}: {
  provider: (typeof providerOptions)[number]
  status: ProviderStatus
  isAdmin: boolean
}) {
  const { t } = useLocale()
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [removeKey, setRemoveKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [configured, setConfigured] = useState(status.configured)
  const [customEndpoint, setCustomEndpoint] = useState(status.endpointCustomized)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/studio/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          ...(apiKey ? { apiKey } : {}),
          ...(removeKey ? { apiKey: null } : {}),
          ...(baseUrl.trim()
            ? { baseUrl }
            : customEndpoint && !baseUrl.trim()
              ? { baseUrl: null }
              : {}),
        }),
      })
      const body = (await response.json()) as {
        error?: string
        settings?: { providers: Record<ProviderId, ProviderStatus> }
      }
      if (!response.ok) throw new Error(body.error || t('settings.error'))
      const nextStatus = body.settings?.providers[provider.id]
      setConfigured(nextStatus?.configured ?? configured)
      setCustomEndpoint(nextStatus?.endpointCustomized ?? customEndpoint)
      setApiKey('')
      setBaseUrl('')
      setRemoveKey(false)
      setMessage(t('settings.saved'))
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t('settings.error'))
    } finally {
      setSaving(false)
    }
  }

  const sharedProvider = provider.id === 'chatgpt2api' || provider.id === 'muse2api'
  return (
    <form onSubmit={(event) => void save(event)} className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{provider.name}</h3>
          <p className="mt-1 text-xs text-zinc-500">{t(`settings.providerHint.${provider.id}`)}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
        >
          {configured && <Check size={12} aria-hidden="true" />}
          {configured ? t('settings.configured') : t('settings.missing')}
        </span>
      </div>
      {sharedProvider && !isAdmin ? (
        <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
          {t('settings.sharedGatewayHelp')}
        </p>
      ) : (
        <>
          <label className="mt-4 block text-xs font-medium text-zinc-700">
            {t('settings.key')}
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={configured ? t('settings.replaceKey') : t('settings.pasteProviderKey')}
              className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-zinc-700">
            {t('settings.endpoint')}
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={
                customEndpoint ? t('settings.customEndpointSaved') : 'https://api.example.com/v1'
              }
              className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-zinc-400">{t('settings.endpointHelp')}</p>
          {configured && (
            <label className="mt-3 flex w-fit items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={removeKey}
                onChange={(event) => setRemoveKey(event.target.checked)}
              />
              {t('settings.removeKey')}
            </label>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || (!apiKey && !removeKey && !baseUrl.trim() && !customEndpoint)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#272441] px-3 text-xs font-semibold text-white transition hover:bg-[#403a6d] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {message && (
              <p role="status" className="text-xs text-zinc-500">
                {message}
              </p>
            )}
          </div>
        </>
      )}
    </form>
  )
}

function AdminUserRow({ user, onUpdated }: { user: UserRow; onUpdated: (user: UserRow) => void }) {
  const { locale, t } = useLocale()
  const [role, setRole] = useState(user.role)
  const [quota, setQuota] = useState(String((user.storageQuotaBytes / 1024 ** 3).toFixed(2)))
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/studio/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          role,
          storageQuotaBytes: Math.max(0, Math.round(Number(quota || 0) * 1024 ** 3)),
          ...(password ? { password } : {}),
        }),
      })
      const body = (await response.json()) as { error?: string; user?: UserRow }
      if (!response.ok || !body.user)
        throw new Error(t(body.error || 'settings.accountUpdateFailed'))
      onUpdated(body.user)
      setPassword('')
      setMessage(t('settings.saved'))
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t('settings.accountUpdateFailed'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <article className="grid gap-3 rounded-xl border border-zinc-200 p-4 md:grid-cols-[minmax(160px,1fr)_110px_120px_130px_auto] md:items-end">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-800">{user.email}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatLocaleBytes(user.storageUsedBytes, locale)} {t('settings.used')}
        </p>
      </div>
      <label className="text-xs text-zinc-500">
        {t('settings.role')}
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as UserRow['role'])}
          className="mt-1 block h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800"
        >
          <option value="user">{t('settings.roleUser')}</option>
          <option value="admin">{t('settings.roleAdmin')}</option>
        </select>
      </label>
      <label className="text-xs text-zinc-500">
        {t('settings.quota')}
        <input
          type="number"
          min="0"
          step="0.01"
          value={quota}
          onChange={(event) => setQuota(event.target.value)}
          className="mt-1 block h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs text-zinc-800"
        />
      </label>
      <label className="text-xs text-zinc-500">
        {t('settings.password')}
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 block h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs text-zinc-800"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {saving ? t('common.saving') : t('common.save')}
      </button>
      {message && (
        <p role="status" className="text-xs text-zinc-500 md:col-span-full">
          {message}
        </p>
      )}
    </article>
  )
}

export function SettingsPage({
  initialSettings,
  initialQuota,
  isAdmin,
  email,
}: {
  initialSettings: StudioSettings
  initialQuota: { usedBytes: number; limitBytes: number }
  isAdmin: boolean
  email: string
}) {
  const { locale, t } = useLocale()
  const [settings, setSettings] = useState(initialSettings)
  const [quota] = useState(initialQuota)
  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(isAdmin)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    void fetch('/api/studio/admin/users')
      .then(async (response) => {
        const body = (await response.json()) as { users?: UserRow[] }
        if (response.ok) setUsers(body.users || [])
      })
      .finally(() => setUsersLoading(false))
  }, [isAdmin])

  const changeLocale = async (nextLocale: 'en' | 'vi') => {
    setMessage('')
    try {
      const response = await fetch('/api/studio/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
      })
      if (!response.ok) {
        const result = (await response.json()) as { error?: string }
        setMessage(t(result.error || 'settings.error'))
        return
      }
      document.cookie = `zenith-locale=${nextLocale}; Path=/; SameSite=Lax; Max-Age=31536000`
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t('settings.error'))
    }
  }

  const savePreference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPrefsSaving(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const body = {
      modelDefaults: {
        text: String(form.get('default-text') || ''),
        image: String(form.get('default-image') || ''),
        video: String(form.get('default-video') || ''),
        audio: String(form.get('default-audio') || ''),
      },
      imagePreferences: {
        aspectRatio: String(form.get('image-ratio') || '1:1'),
        quality: String(form.get('image-quality') || 'standard'),
      },
      videoPreferences: {
        aspectRatio: String(form.get('video-ratio') || '16:9'),
        resolution: String(form.get('video-resolution') || '720p'),
        duration: Number(form.get('video-duration') || 5),
      },
      audioPreferences: {
        voice: String(form.get('audio-voice') || 'alloy'),
        format: String(form.get('audio-format') || 'mp3'),
        speed: Number(form.get('audio-speed') || 1),
        instructions: String(form.get('audio-instructions') || ''),
      },
    }
    try {
      const response = await fetch('/api/studio/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json()) as { error?: string; settings?: StudioSettings }
      if (!response.ok) throw new Error(result.error || t('settings.error'))
      if (result.settings) setSettings((current) => ({ ...current, ...result.settings }))
      setMessage(t('settings.saved'))
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t('settings.error'))
    } finally {
      setPrefsSaving(false)
    }
  }

  const quotaPercent = quota.limitBytes
    ? Math.min(100, (quota.usedBytes / quota.limitBytes) * 100)
    : 0
  const model = (modality: string) => String(settings.modelDefaults[modality] || '')
  const imagePref = settings.imagePreferences
  const videoPref = settings.videoPreferences
  const audioPref = settings.audioPreferences

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f8] lg:flex-row">
      <Sidebar active="settings" />
      <main className="min-w-0 flex-1 px-4 pb-12 pt-5 sm:px-7 lg:px-10 lg:pt-9">
        <div className="mx-auto max-w-5xl">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#746d9d]">
                {email}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                {t('settings.title')}
              </h1>
              <p className="mt-2 text-sm text-zinc-500">{t('settings.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
              <Shield size={15} className="text-[#655ba0]" />
              {t('settings.personalAccount')}
            </div>
          </header>

          <div className="grid gap-5">
            <Card>
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-[#efedf8] text-[#655ba0]">
                  <Sparkles size={17} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    {t('settings.preferences')}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">{t('settings.defaultsHelp')}</p>
                </div>
              </div>
              <div className="mb-5 max-w-sm">
                <label className="block text-xs font-medium text-zinc-600">
                  {t('settings.language')}
                  <select
                    value={locale}
                    onChange={(event) => void changeLocale(event.target.value as 'en' | 'vi')}
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  >
                    <option value="en">English</option>
                    <option value="vi">Tiếng Việt</option>
                  </select>
                </label>
              </div>
              <form onSubmit={(event) => void savePreference(event)}>
                <div className="grid gap-4 md:grid-cols-2">
                  {(['text', 'image', 'video', 'audio'] as const).map((modality) => (
                    <label key={modality} className="text-xs font-medium text-zinc-600">
                      {t(`settings.defaultModel${modality[0]!.toUpperCase()}${modality.slice(1)}`)}
                      <input
                        name={`default-${modality}`}
                        defaultValue={model(modality)}
                        placeholder={
                          modality === 'text'
                            ? 'gpt-4o-mini'
                            : modality === 'image'
                              ? 'dall-e-3'
                              : modality === 'video'
                                ? 'veo-3.1-fast-generate-preview'
                                : 'gpt-4o-mini-tts'
                        }
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400"
                      />
                    </label>
                  ))}
                </div>
                <details className="mt-5 rounded-xl border border-zinc-200 px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                    {t('settings.image')} · {t('settings.video')} · {t('settings.audio')}
                  </summary>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="text-xs text-zinc-600">
                      {t('settings.imageAspectRatio')}
                      <input
                        name="image-ratio"
                        defaultValue={String(imagePref.aspectRatio || '1:1')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.imageQuality')}
                      <input
                        name="image-quality"
                        defaultValue={String(imagePref.quality || 'standard')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.videoAspectRatio')}
                      <input
                        name="video-ratio"
                        defaultValue={String(videoPref.aspectRatio || '16:9')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.videoResolution')}
                      <input
                        name="video-resolution"
                        defaultValue={String(videoPref.resolution || '720p')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.videoDuration')}
                      <input
                        type="number"
                        min="1"
                        name="video-duration"
                        defaultValue={Number(videoPref.duration || 5)}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.audioVoice')}
                      <input
                        name="audio-voice"
                        defaultValue={String(audioPref.voice || 'alloy')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.audioFormat')}
                      <input
                        name="audio-format"
                        defaultValue={String(audioPref.format || 'mp3')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      {t('settings.audioSpeed')}
                      <input
                        type="number"
                        min="0.25"
                        max="4"
                        step="0.05"
                        name="audio-speed"
                        defaultValue={Number(audioPref.speed || 1)}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600 md:col-span-3">
                      {t('settings.audioInstructions')}
                      <textarea
                        name="audio-instructions"
                        defaultValue={String(audioPref.instructions || '')}
                        rows={2}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 p-2 text-xs"
                      />
                    </label>
                  </div>
                </details>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={prefsSaving}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#272441] px-4 text-xs font-semibold text-white hover:bg-[#403a6d] disabled:opacity-50"
                  >
                    {prefsSaving && <LoaderCircle size={14} className="animate-spin" />}
                    {prefsSaving ? t('common.saving') : t('common.save')}
                  </button>
                  {message && (
                    <span role="status" className="text-xs text-zinc-500">
                      {message}
                    </span>
                  )}
                </div>
              </form>
            </Card>

            <Card>
              <div className="mb-5">
                <h2 className="text-base font-semibold text-zinc-900">{t('settings.providers')}</h2>
                <p className="mt-1 text-xs text-zinc-500">{t('settings.providerHelp')}</p>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {providerOptions.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    status={settings.providers[provider.id]}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <HardDrive size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-zinc-900">{t('settings.storage')}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatLocaleBytes(quota.usedBytes, locale)} {t('settings.used')} ·{' '}
                    {formatLocaleBytes(quota.limitBytes, locale)} {t('settings.total')}
                  </p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full transition-all ${quotaPercent >= 90 ? 'bg-amber-500' : 'bg-[#746d9d]'}`}
                      style={{ width: `${quotaPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {isAdmin && (
              <Card>
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-zinc-900">{t('settings.admin')}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{t('settings.adminHelp')}</p>
                </div>
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <LoaderCircle size={14} className="animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {users.map((user) => (
                      <AdminUserRow
                        key={user.id}
                        user={user}
                        onUpdated={(updated) =>
                          setUsers((current) =>
                            current.map((item) => (item.id === updated.id ? updated : item)),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
