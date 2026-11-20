'use client'

import { DropdownSelect } from './DropdownSelect'
import { useEffect, useState, type FormEvent } from 'react'
import { Check, HardDrive, KeyRound, LoaderCircle, PlugZap, Sparkles } from 'lucide-react'
import { studioFetch } from '@/lib/studio-local-api'
import { getStorageEstimate } from '@/lib/studio-indexed-db'
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

const providerOptions: Array<{ id: ProviderId; name: string }> = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'replicate', name: 'Replicate' },
  { id: 'runway', name: 'Runway' },
  { id: 'chatgpt2api', name: 'ChatGPT' },
  { id: 'muse2api', name: 'Muse' },
]

const emptySettings: StudioSettings = {
  locale: 'en',
  modelDefaults: {},
  imagePreferences: {},
  videoPreferences: {},
  audioPreferences: {},
  providers: Object.fromEntries(
    providerOptions.map(({ id }) => [id, { configured: false, endpointCustomized: false }]),
  ) as Record<ProviderId, ProviderStatus>,
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      {children}
    </section>
  )
}

function ProviderCard({
  provider,
  status,
  onSaved,
}: {
  provider: (typeof providerOptions)[number]
  status: ProviderStatus
  onSaved: (provider: ProviderId, status: ProviderStatus) => void
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
      const response = await studioFetch('/api/studio/settings', {
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
      const next = body.settings?.providers[provider.id] || {
        configured,
        endpointCustomized: customEndpoint,
      }
      setConfigured(next.configured)
      setCustomEndpoint(next.endpointCustomized)
      onSaved(provider.id, next)
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
      <label className="mt-4 block text-xs font-medium text-zinc-700">
        {t('settings.key')}
        <input
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            configured ? t('settings.savedKeyPlaceholder') : t('settings.pasteProviderKey')
          }
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
      <p className="mt-1.5 text-[11px] text-zinc-400">
        {configured ? t('settings.savedKeyHelp') : t('settings.providerKeyStorageHelp')}
      </p>
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
          {saving ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
          {saving ? t('common.saving') : t('common.save')}
        </button>
        {message && (
          <p role="status" className="text-xs text-zinc-500">
            {message}
          </p>
        )}
      </div>
    </form>
  )
}

type MuseConnectionState =
  'idle' | 'checking' | 'connected' | 'missing-key' | 'invalid-key' | 'gateway-unavailable'

function Muse2APIProviderCard() {
  const { t } = useLocale()
  const [connection, setConnection] = useState<MuseConnectionState>('idle')

  const connect = async () => {
    setConnection('checking')
    try {
      const response = await studioFetch('/api/studio/providers/muse2api/connect', {
        method: 'POST',
      })
      const result = (await response.json().catch(() => ({}))) as {
        connected?: boolean
        errorCode?: MuseConnectionState
      }
      setConnection(
        response.ok && result.connected
          ? 'connected'
          : result.errorCode === 'missing-key' || result.errorCode === 'invalid-key'
            ? result.errorCode
            : 'gateway-unavailable',
      )
    } catch {
      setConnection('gateway-unavailable')
    }
  }

  const statusKey: Record<Exclude<MuseConnectionState, 'checking'>, string> = {
    idle: 'settings.museNotChecked',
    connected: 'settings.museConnected',
    'missing-key': 'settings.museMissingKey',
    'invalid-key': 'settings.museInvalidKey',
    'gateway-unavailable': 'settings.museUnavailable',
  }
  const connected = connection === 'connected'

  return (
    <section className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Muse</h3>
          <p className="mt-1 text-xs text-zinc-500">{t('settings.providerHint.muse2api')}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}
        >
          {connected && <Check size={12} aria-hidden="true" />}
          {connected
            ? t('settings.museConnectedStatus')
            : connection === 'checking'
              ? t('settings.museChecking')
              : t('settings.museDisconnected')}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connection === 'checking'}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#272441] px-3 text-xs font-semibold text-white transition hover:bg-[#403a6d] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {connection === 'checking' ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <PlugZap size={14} />
          )}
          {t('settings.museConnect')}
        </button>
        <p role="status" aria-live="polite" className="text-xs text-zinc-500">
          {connection === 'checking' ? t('settings.museChecking') : t(statusKey[connection])}
        </p>
      </div>
    </section>
  )
}

export function SettingsPage() {
  const { locale, t } = useLocale()
  const [settings, setSettings] = useState(emptySettings)
  const [providers, setProviders] = useState(emptySettings.providers)
  const [storage, setStorage] = useState({ usedBytes: 0, quotaBytes: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formRevision, setFormRevision] = useState(0)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      studioFetch('/api/studio/settings').then((response) => response.json()),
      getStorageEstimate(),
    ])
      .then(([body, estimate]) => {
        if (!active) return
        if (body.settings) {
          const next = { ...emptySettings, ...body.settings }
          setSettings(next)
          setProviders(next.providers)
          setFormRevision((value) => value + 1)
        }
        setStorage(estimate)
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const changeLocale = async (nextLocale: 'en' | 'vi') => {
    const response = await studioFetch('/api/studio/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: nextLocale }),
    })
    if (!response.ok) {
      const body = (await response.json()) as { error?: string }
      setMessage(t(body.error || 'settings.error'))
      return
    }
    window.location.reload()
  }

  const savePreference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
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
        resolution: String(form.get('image-resolution') || '1k'),
        count: Number(form.get('image-count') || 1),
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
      const response = await studioFetch('/api/studio/settings', {
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
      setSaving(false)
    }
  }

  const model = (modality: string) => String(settings.modelDefaults[modality] || '')
  const imagePref = settings.imagePreferences
  const videoPref = settings.videoPreferences
  const audioPref = settings.audioPreferences
  const selectedProviderOption = providerOptions.find(({ id }) => id === selectedProvider)

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f8] lg:flex-row">
      <Sidebar active="settings" />
      <main className="min-w-0 flex-1 px-4 pb-12 pt-5 sm:px-7 lg:px-10 lg:pt-9">
        <div className="mx-auto max-w-5xl">
          <header className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#746d9d]">
              Local workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              {t('settings.title')}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Data and provider settings stay in this browser's IndexedDB.
            </p>
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
                  <DropdownSelect
                    value={locale}
                    onChange={(event) => void changeLocale(event.target.value as 'en' | 'vi')}
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  >
                    <option value="en">English</option>
                    <option value="vi">Tiếng Việt</option>
                  </DropdownSelect>
                </label>
              </div>
              <form key={formRevision} onSubmit={(event) => void savePreference(event)}>
                <div className="grid gap-4 md:grid-cols-2">
                  {(['text', 'image', 'video', 'audio'] as const).map((modality) => (
                    <label key={modality} className="text-xs font-medium text-zinc-600">
                      {t(`settings.defaultModel${modality[0]!.toUpperCase()}${modality.slice(1)}`)}
                      <input
                        name={`default-${modality}`}
                        defaultValue={model(modality)}
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
                      Image resolution
                      <input
                        name="image-resolution"
                        defaultValue={String(imagePref.resolution || '1k')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      Image count
                      <input
                        name="image-count"
                        type="number"
                        min="1"
                        max="15"
                        defaultValue={Number(imagePref.count || 1)}
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
                    disabled={saving || loading}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#272441] px-4 text-xs font-semibold text-white hover:bg-[#403a6d] disabled:opacity-50"
                  >
                    {saving && <LoaderCircle size={14} className="animate-spin" />}
                    {saving ? t('common.saving') : t('common.save')}
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
              <div
                className="mb-4 flex flex-nowrap gap-2 overflow-x-auto pb-2"
                role="group"
                aria-label={t('settings.providers')}
              >
                {providerOptions.map((provider) => {
                  const selected = selectedProvider === provider.id
                  const configured =
                    provider.id !== 'muse2api' && providers[provider.id]?.configured
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${selected ? 'border-[#272441] bg-[#272441] text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-violet-50'}`}
                    >
                      {provider.name}
                      {configured && (
                        <Check
                          size={13}
                          aria-label={t('settings.configured')}
                          className={selected ? 'text-emerald-300' : 'text-emerald-600'}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
              {selectedProviderOption ? (
                selectedProviderOption.id === 'muse2api' ? (
                  <Muse2APIProviderCard key={selectedProviderOption.id} />
                ) : (
                  <ProviderCard
                    key={selectedProviderOption.id}
                    provider={selectedProviderOption}
                    status={providers[selectedProviderOption.id]}
                    onSaved={(id, status) =>
                      setProviders((current) => ({ ...current, [id]: status }))
                    }
                  />
                )
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-500">
                  {t('settings.selectProvider')}
                </p>
              )}
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <HardDrive size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-zinc-900">Browser storage</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatLocaleBytes(storage.usedBytes, locale)} used ·{' '}
                    {formatLocaleBytes(storage.quotaBytes, locale)} available to this site
                  </p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-[#746d9d]"
                      style={{
                        width: `${storage.quotaBytes ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
