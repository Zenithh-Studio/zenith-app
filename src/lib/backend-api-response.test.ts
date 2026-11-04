import { describe, expect, it } from 'vitest'
import { backendUnavailableResponse } from './backend-api-response'

describe('backendUnavailableResponse', () => {
  it('returns a safe structured response when Figma backend config is unavailable', async () => {
    const response = backendUnavailableResponse()

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      error: 'The data service is unavailable. Try again after the workspace backend is connected.',
    })
  })
})
