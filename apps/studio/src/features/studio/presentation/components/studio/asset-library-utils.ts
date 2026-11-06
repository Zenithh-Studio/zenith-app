import type { AssetDocument } from '@znith/contracts'

export type AssetSort =
  'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'type-asc'

export function sortAssets(assets: AssetDocument[], sort: AssetSort) {
  return [...assets].sort((left, right) => {
    if (sort === 'name-asc' || sort === 'name-desc') {
      const byName = (left.filename || '').localeCompare(right.filename || '', undefined, {
        sensitivity: 'base',
      })
      return sort === 'name-asc' ? byName : -byName
    }
    if (sort === 'size-desc' || sort === 'size-asc') {
      const bySize = (left.filesize || 0) - (right.filesize || 0)
      return sort === 'size-asc' ? bySize : -bySize
    }
    if (sort === 'type-asc') {
      return (left.mimeType || '').localeCompare(right.mimeType || '')
    }
    const byDate = Date.parse(left.createdAt) - Date.parse(right.createdAt)
    return sort === 'date-asc' ? byDate : -byDate
  })
}

export function toggleAssetSelection(selectedIds: string[], assetId: string) {
  return selectedIds.includes(assetId)
    ? selectedIds.filter((id) => id !== assetId)
    : [...selectedIds, assetId]
}
