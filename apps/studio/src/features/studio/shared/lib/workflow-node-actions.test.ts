import { describe, expect, it } from 'vitest'
import {
  getNodeCapabilities,
  getNodePrimaryAction,
  getRegisteredNodeActions,
} from './workflow-node-actions'

describe('workflow node actions', () => {
  it('uses explicit node types to resolve media behavior', () => {
    expect(getNodeCapabilities('ai.image-to-video')).toMatchObject({
      modality: 'video',
      generator: true,
    })
    expect(getNodeCapabilities('input.audio')).toMatchObject({
      modality: 'audio',
      inputMedia: true,
    })
    expect(getNodeCapabilities('ai.generate-image')).toMatchObject({
      modality: 'image',
      generator: true,
    })
    expect(getNodeCapabilities('custom.video.processor')).toBeUndefined()
  })

  it('chooses retry, cancel, and query actions from node state', () => {
    expect(getNodePrimaryAction('ai.generate-image', 'failed')).toBe('retry')
    expect(getNodePrimaryAction('ai.generate-video', 'running', false, true)).toBe('cancel')
    expect(getNodePrimaryAction('ai.generate-video', 'interrupted', true)).toBe('check-status')
    expect(getNodePrimaryAction('input.image', 'failed')).toBe('none')
  })

  it('registers image actions with explicit state and saved-asset reasons', () => {
    const actions = getRegisteredNodeActions({
      nodeType: 'ai.generate-image',
      status: 'succeeded',
      hasImageOutput: true,
      hasSavedImage: false,
      hasMediaOutput: true,
      hasSavedOutput: false,
      hasPrompt: false,
    })

    expect(actions.find((action) => action.id === 'image-tools')).toMatchObject({
      label: 'Image tools',
      handler: 'image-tools',
      disabled: true,
      disabledReason: 'Save this image to Assets before using image tools.',
    })
    expect(actions.find((action) => action.id === 'copy-prompt')).toMatchObject({
      disabled: true,
      disabledReason: 'This output has no saved prompt in its execution snapshot.',
    })
    expect(actions.find((action) => action.id === 'run')).toBeDefined()
    expect(actions.find((action) => action.id === 'save-to-assets')).toMatchObject({
      label: 'Save to Assets',
      disabled: false,
    })
    expect(
      getRegisteredNodeActions({
        nodeType: 'ai.generate-image',
        hasMediaOutput: true,
        hasSavedOutput: false,
        isWorkflowRunning: true,
      }).find((action) => action.id === 'save-to-assets'),
    ).toMatchObject({
      disabled: true,
      disabledReason: 'Wait until the active workflow run finishes.',
    })
    expect(
      getRegisteredNodeActions({
        nodeType: 'ai.generate-image',
        hasMediaOutput: true,
        hasSavedOutput: true,
      }).find((action) => action.id === 'save-to-assets'),
    ).toBeUndefined()
  })

  it('offers a prompt-to-image action only for text inputs with content', () => {
    expect(
      getRegisteredNodeActions({ nodeType: 'input.prompt', hasText: false }).find(
        (action) => action.id === 'generate-image-from-text',
      ),
    ).toMatchObject({ disabled: true, disabledReason: 'Add text before generating an image.' })
    expect(
      getRegisteredNodeActions({ nodeType: 'input.prompt', hasText: true }).find(
        (action) => action.id === 'generate-image-from-text',
      ),
    ).toMatchObject({ disabled: false })
    expect(
      getRegisteredNodeActions({ nodeType: 'input.image', hasText: true }).find(
        (action) => action.id === 'generate-image-from-text',
      ),
    ).toBeUndefined()
  })

  it('offers prompt copy for editable text nodes with content', () => {
    expect(
      getRegisteredNodeActions({ nodeType: 'input.text', hasText: false }).find(
        (action) => action.id === 'copy-prompt',
      ),
    ).toBeUndefined()
    expect(
      getRegisteredNodeActions({ nodeType: 'input.prompt', hasText: true }).find(
        (action) => action.id === 'copy-prompt',
      ),
    ).toMatchObject({ disabled: false, label: 'Copy prompt' })
  })
})
