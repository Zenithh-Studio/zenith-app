import { describe, expect, it } from 'vitest'
import { nodeRegistry } from '@znith/contracts'
import {
  formatLocaleBytes,
  formatLocaleDate,
  formatLocaleNumber,
  translateMessage,
} from './LocaleProvider'

describe('locale helpers', () => {
  it('uses English fallback for missing translations', () => {
    expect(translateMessage('vi', 'A missing English message')).toBe('A missing English message')
    expect(translateMessage('en', 'A missing English message')).toBe('A missing English message')
  })

  it('translates known strings and interpolates variables', () => {
    expect(translateMessage('vi', 'No workflows yet')).toBe('Chưa có quy trình')
    expect(translateMessage('vi', 'Page {page} of {totalPages}', { page: 2, totalPages: 7 })).toBe(
      'Trang 2/7',
    )
  })

  it('provides complete English and Vietnamese keys for account settings', () => {
    const settingsKeys = [
      'settings.personalAccount',
      'settings.defaultsHelp',
      'settings.defaultModelText',
      'settings.defaultModelImage',
      'settings.defaultModelVideo',
      'settings.defaultModelAudio',
      'settings.imageAspectRatio',
      'settings.imageQuality',
      'settings.videoAspectRatio',
      'settings.videoResolution',
      'settings.videoDuration',
      'settings.audioVoice',
      'settings.audioFormat',
      'settings.audioSpeed',
      'settings.audioInstructions',
      'settings.total',
      'settings.roleUser',
      'settings.roleAdmin',
      'settings.sharedGatewayHelp',
      'settings.pasteProviderKey',
      'settings.customEndpointSaved',
      'settings.providerHint.openai',
      'settings.providerHint.anthropic',
      'settings.providerHint.gemini',
      'settings.providerHint.replicate',
      'settings.providerHint.runway',
      'settings.providerHint.chatgpt2api',
      'settings.providerHint.muse2api',
    ]

    for (const key of settingsKeys) {
      expect(translateMessage('en', key), `English translation for ${key}`).not.toBe(key)
      expect(translateMessage('vi', key), `Vietnamese translation for ${key}`).not.toBe(key)
    }
  })

  it('translates every registered node label, category, and description', () => {
    for (const node of nodeRegistry) {
      expect(translateMessage('vi', node.displayName), `label for ${node.type}`).not.toBe(
        node.displayName,
      )
      expect(translateMessage('vi', node.category), `category for ${node.type}`).not.toBe(
        node.category,
      )
      expect(translateMessage('vi', node.description), `description for ${node.type}`).not.toBe(
        node.description,
      )
    }
  })

  it('formats numbers, dates, and byte sizes for the selected locale', () => {
    expect(formatLocaleNumber(1234, 'en')).toBe('1,234')
    expect(formatLocaleNumber(1234, 'vi')).toBe('1.234')
    expect(formatLocaleDate('not a date', 'en')).toBe('—')
    expect(formatLocaleDate(null, 'vi')).toBe('—')
    expect(formatLocaleBytes(0, 'vi')).toBe('0 B')
    expect(formatLocaleBytes(1024 * 1024, 'en')).toBe('1 MB')
    expect(formatLocaleBytes(1536, 'vi')).toBe('1,5 KB')
  })
})
