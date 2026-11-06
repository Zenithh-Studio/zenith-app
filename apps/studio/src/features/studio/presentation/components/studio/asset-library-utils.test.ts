import { describe, expect, it } from 'vitest'
import type { AssetDocument } from '@znith/contracts'
import { sortAssets, toggleAssetSelection } from './asset-library-utils'

const assets: AssetDocument[] = [
  {
    id: 'older',
    alt: 'Older',
    filename: 'zeta.png',
    mimeType: 'image/png',
    filesize: 20,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'newer',
    alt: 'Newer',
    filename: 'alpha.mp4',
    mimeType: 'video/mp4',
    filesize: 10,
    createdAt: '2026-11-06T00:00:00.000Z',
  },
]

describe('asset library interactions', () => {
  it('sorts assets by date, name, size, and media type', () => {
    expect(sortAssets(assets, 'date-desc').map(({ id }) => id)).toEqual(['newer', 'older'])
    expect(sortAssets(assets, 'date-asc').map(({ id }) => id)).toEqual(['older', 'newer'])
    expect(sortAssets(assets, 'name-asc').map(({ id }) => id)).toEqual(['newer', 'older'])
    expect(sortAssets(assets, 'name-desc').map(({ id }) => id)).toEqual(['older', 'newer'])
    expect(sortAssets(assets, 'size-desc').map(({ id }) => id)).toEqual(['older', 'newer'])
    expect(sortAssets(assets, 'size-asc').map(({ id }) => id)).toEqual(['newer', 'older'])
    expect(sortAssets(assets, 'type-asc').map(({ id }) => id)).toEqual(['older', 'newer'])
  })

  it('toggles one selection without changing other selected assets', () => {
    expect(toggleAssetSelection(['first', 'second'], 'first')).toEqual(['second'])
    expect(toggleAssetSelection(['first'], 'second')).toEqual(['first', 'second'])
  })
})
