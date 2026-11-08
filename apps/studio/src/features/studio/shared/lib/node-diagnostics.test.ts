import { describe, expect, it } from 'vitest'
import { redactDiagnosticData } from './node-diagnostics'

describe('node diagnostics redaction', () => {
  it('removes credentials and large or private media URLs recursively', () => {
    expect(
      redactDiagnosticData({
        config: {
          apiKey: 'private-key',
          prompt: 'Bearer hidden-value sk-12345678long-secret',
          data: 'data:image/png;base64,secret-pixels',
          providerUrl: 'https://provider.example/private?token=abc',
          localAsset: '/api/media/file/image.png',
        },
      }),
    ).toEqual({
      config: {
        apiKey: '[redacted]',
        prompt: 'Bearer [redacted] [credential]',
        data: '[inline media omitted]',
        providerUrl: '[external URL omitted]',
        localAsset: '/api/media/file/image.png',
      },
    })
  })
})
