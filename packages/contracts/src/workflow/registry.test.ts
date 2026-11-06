import { describe, expect, it } from 'vitest'
import { nodeRegistry, paletteNodeRegistry, registryByType } from './registry'
import { workflowTemplates } from './templates'

describe('workflow node palette', () => {
  it('exposes the current studio workflow nodes and keeps legacy definitions registered', () => {
    expect(paletteNodeRegistry.map(({ type }) => type)).toEqual([
      'input.prompt',
      'input.image',
      'processing.template',
      'ai.generate-text',
      'ai.analyze-image',
      'ai.generate-image',
      'ai.edit-image',
      'ai.generate-video',
      'ai.image-to-video',
      'output.preview',
    ])
    expect(nodeRegistry.length).toBeGreaterThan(paletteNodeRegistry.length)
    expect(registryByType.has('input.video')).toBe(true)
    expect(registryByType.has('utility.http-request')).toBe(true)
  })

  it('defaults new video nodes to Muse2API with its configured model', () => {
    for (const type of ['ai.generate-video', 'ai.image-to-video']) {
      expect(registryByType.get(type)?.defaultConfig).toMatchObject({
        provider: 'muse2api',
        model: 'muse-video',
        resolution: '720p',
        generateAudio: true,
      })
    }
  })

  it('connects the video starter prompt to a Muse2API generator', () => {
    const definition = workflowTemplates.video.definition
    const videoNode = definition.nodes.find((node) => node.type === 'ai.generate-video')

    expect(videoNode?.config).toMatchObject({
      provider: 'muse2api',
      model: 'muse-video',
      resolution: '720p',
      generateAudio: true,
    })
    expect(definition.edges).toEqual([
      {
        id: 'brief-video',
        source: 'brief',
        sourceHandle: 'prompt',
        target: 'video',
        targetHandle: 'prompt',
      },
    ])
  })
})
