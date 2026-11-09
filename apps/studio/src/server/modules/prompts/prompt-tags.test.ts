import { describe, expect, it } from 'vitest'
import { promptTagsToJson } from './prompt-tags'

describe('promptTagsToJson', () => {
  it('preserves omitted and empty tag values', () => {
    expect(promptTagsToJson()).toBeUndefined()
    expect(promptTagsToJson([])).toEqual([])
  })

  it('preserves tag order and creates array-compatible item IDs', () => {
    const tags = promptTagsToJson(['portrait', 'film'])

    expect(tags?.map(({ tag }) => tag)).toEqual(['portrait', 'film'])
    expect(new Set(tags?.map(({ id }) => id)).size).toBe(2)
    expect(tags?.every(({ id }) => /^[0-9a-f-]{36}$/i.test(id))).toBe(true)
  })
})
