export type ProviderId =
  | 'openai'
  | 'chatgpt2api'
  | 'muse2api'
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
    modalities: ['text', 'vision'],
    models: {
      text: ['gemini-2.0-flash', 'gemini-2.5-flash'],
      vision: ['gemini-2.0-flash', 'gemini-2.5-flash'],
    },
    credential: 'APP_GEMINI_API_KEY',
  },
  {
    id: 'replicate',
    name: 'Replicate',
    modalities: ['image', 'video'],
    models: { image: [], video: [] },
    credential: 'REPLICATE_API_TOKEN',
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
