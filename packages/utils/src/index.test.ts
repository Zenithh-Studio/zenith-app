import { describe, expect, it } from 'vitest'
import {
  clampNumber,
  cloneValue,
  formatDate,
  formatFileSize,
  slugify,
  toErrorMessage,
} from './index'

describe('shared utilities', () => {
  it('clamps numbers within inclusive bounds', () => {
    expect(clampNumber(-2, 0, 10)).toBe(0)
    expect(clampNumber(4, 0, 10)).toBe(4)
    expect(clampNumber(12, 0, 10)).toBe(10)
  })

  it('clones values without sharing nested references', () => {
    const source = { nested: { value: 1 } }
    const copy = cloneValue(source)
    copy.nested.value = 2
    expect(source.nested.value).toBe(1)
  })

  it('formats names, dates, file sizes, and unknown errors', () => {
    expect(slugify('Đặng Thái Sơn')).toBe('dang-thai-son')
    expect(formatDate('invalid')).toBe('Unknown date')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(toErrorMessage(new Error('Bad request'))).toBe('Bad request')
    expect(toErrorMessage({})).toBe('Unexpected error.')
  })
})
