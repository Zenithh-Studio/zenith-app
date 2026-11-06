export type ProviderId =
  | 'openai'
  | 'chatgpt2api'
  | 'muse2api'
  | 'runway'
  | 'anthropic'
  | 'gemini'
  | 'replicate'
  | 'comfyui'
  | 'custom-http'

export type ProviderModality = 'text' | 'vision' | 'image' | 'video'

export interface ProviderInfo {
  id: ProviderId
  name: string
  modalities: ProviderModality[]
  models: Partial<Record<ProviderModality, string[]>>
  credential?: string
}

export const providerCatalog: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    modalities: ['text', 'vision', 'image'],
    models: {
      text: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'],
      vision: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'],
      image: ['dall-e-3', 'dall-e-2', 'gpt-image-1'],
    },
    credential: 'APP_OPENAI_API_KEY',
  },
  {
    id: 'chatgpt2api',
    name: 'ChatGPT2API',
    modalities: ['image'],
    models: { image: ['gpt-image-2', 'codex-gpt-image-2', 'auto'] },
    credential: 'APP_CHATGPT2API_API_KEY',
  },
  {
    id: 'muse2api',
    name: 'Muse2API',
    modalities: ['video'],
    models: { video: ['muse-video'] },
    credential: 'APP_MUSE2API_API_KEY',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    modalities: ['text', 'vision'],
    models: {
      text: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514'],
      vision: ['claude-sonnet-4-20250514'],
    },
    credential: 'APP_ANTHROPIC_API_KEY',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    modalities: ['text', 'vision', 'video'],
    models: {
      text: [
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-2.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
        'gemini-4-argon',
      ],
      vision: [
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-2.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
      ],
      video: ['gemini-omni-1.1-flash', 'veo-3.1-fast-generate-preview'],
    },
    credential: 'APP_GEMINI_API_KEY',
  },
  {
    id: 'replicate',
    name: 'Replicate',
    modalities: ['image', 'video'],
    models: { image: [], video: ['bytedance/seedance-2.5'] },
    credential: 'REPLICATE_API_TOKEN',
  },
  {
    id: 'runway',
    name: 'Runway',
    modalities: ['video'],
    models: { video: ['gen4.5'] },
    credential: 'RUNWAYML_API_SECRET',
  },
  {
    id: 'comfyui',
    name: 'ComfyUI',
    modalities: ['image', 'video'],
    models: { image: [], video: [] },
  },
  {
    id: 'custom-http',
    name: 'Custom HTTP API',
    modalities: ['text', 'vision', 'image', 'video'],
    models: { text: [], vision: [], image: [], video: [] },
  },
]

export function providersFor(modality: ProviderModality) {
  return providerCatalog.filter((provider) => provider.modalities.includes(modality))
}

const modelDisplayNames: Record<string, string> = {
  'muse-video': 'Muse Video',
  'bytedance/seedance-2.5': 'Seedance 2.5',
  'gemini-omni-1.1-flash': 'Gemini Omni Flash',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-4-argon': 'Gemini 4 Argon',
  'veo-3.1-fast-generate-preview': 'Veo 3.1 Fast',
  'gen4.5': 'Gen-4.5',
}

export function displayModelName(model: string) {
  return modelDisplayNames[model] ?? model
}

export function providerModelLabel(providerId: string, model: string) {
  const provider = providerCatalog.find((item) => item.id === providerId)
  return `${provider?.name ?? providerId} · ${displayModelName(model)}`
}

export function modelSupportsResolution(providerId: string, model: string) {
  return modelResolutionOptions(providerId, model).length > 0
}

export function modelResolutionOptions(providerId: string, model: string) {
  if (providerId === 'replicate' && model === 'bytedance/seedance-2.5') {
    return ['480p', '720p', '1080p']
  }
  if (providerId === 'gemini' && model === 'gemini-omni-1.1-flash') {
    return ['720p', '1080p']
  }
  if (providerId === 'gemini' && model === 'veo-3.1-fast-generate-preview') {
    return ['720p', '1080p']
  }
  return []
}

export function modelDurationOptions(providerId: string, model: string) {
  if (providerId === 'replicate' && model === 'bytedance/seedance-2.5') {
    return [4, 5, 6, 8, 10, 15, 20, 25, 30]
  }
  if (providerId === 'gemini' && model === 'veo-3.1-fast-generate-preview') {
    return [4, 6, 8]
  }
  if (providerId === 'runway' && model === 'gen4.5') {
    return [5, 10]
  }
  return [3, 4, 5, 6, 8, 10]
}

export function defaultModelDuration(providerId: string, model: string) {
  return providerId === 'gemini' && model === 'veo-3.1-fast-generate-preview' ? 8 : 5
}

export function modelSupportsAudioToggle(providerId: string, model: string) {
  return providerId === 'replicate' && model === 'bytedance/seedance-2.5'
}
