import { describe, expect, it } from 'vitest'
import {
  displayModelName,
  modelSupportsAudioToggle,
  modelDurationOptions,
  modelResolutionOptions,
  modelSupportsResolution,
  providerModelLabel,
  providersFor,
} from './catalog'

describe('video model catalog', () => {
  it('lists the requested video models under their API providers', () => {
    const videoModels = providersFor('video').flatMap((provider) =>
      (provider.models.video ?? []).map((model) => `${provider.id}:${model}`),
    )

    expect(videoModels).toEqual(
      expect.arrayContaining([
        'replicate:bytedance/seedance-2.5',
        'gemini:gemini-omni-1.1-flash',
        'gemini:veo-3.1-fast-generate-preview',
        'runway:gen4.5',
      ]),
    )
  })

  it('uses short model names with provider-dot-model labels', () => {
    expect(displayModelName('veo-3.1-fast-generate-preview')).toBe('Veo 3.1 Fast')
    expect(providerModelLabel('replicate', 'bytedance/seedance-2.5')).toBe(
      'Replicate · Seedance 2.5',
    )
  })

  it('exposes only model-supported resolution and audio controls', () => {
    expect(modelSupportsResolution('replicate', 'bytedance/seedance-2.5')).toBe(true)
    expect(modelSupportsResolution('gemini', 'gemini-omni-1.1-flash')).toBe(true)
    expect(modelSupportsResolution('runway', 'gen4.5')).toBe(false)
    expect(modelSupportsAudioToggle('replicate', 'bytedance/seedance-2.5')).toBe(true)
    expect(modelSupportsAudioToggle('gemini', 'gemini-omni-1.1-flash')).toBe(false)
    expect(modelResolutionOptions('replicate', 'bytedance/seedance-2.5')).toEqual([
      '480p',
      '720p',
      '1080p',
    ])
    expect(modelResolutionOptions('gemini', 'veo-3.1-fast-generate-preview')).toEqual([
      '720p',
      '1080p',
    ])
    expect(modelDurationOptions('gemini', 'veo-3.1-fast-generate-preview')).toEqual([4, 6, 8])
    expect(modelDurationOptions('runway', 'gen4.5')).toEqual([5, 10])
  })
})

describe('Gemini text model catalog', () => {
  const textModels = providersFor('text').find((provider) => provider.id === 'gemini')?.models.text
  const visionModels = providersFor('vision').find((provider) => provider.id === 'gemini')?.models
    .vision

  it('lists supported text-output Gemini models for Generate Text', () => {
    expect(textModels).toEqual([
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
    ])
  })

  it('makes image-input Gemini models available to Analyze Image', () => {
    expect(visionModels).toEqual(textModels?.filter((model) => model !== 'gemini-4-argon'))
  })

  it('uses readable labels for the Gemini model selector', () => {
    expect(displayModelName('gemini-3.8-flash')).toBe('Gemini 3.8 Flash')
    expect(displayModelName('gemini-4-argon')).toBe('Gemini 4 Argon')
  })
})
