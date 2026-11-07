import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

vi.mock('server-only', () => ({}))

import { transformImage } from './image-transforms'

async function sampleImage(width = 8, height = 6) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 60, g: 90, b: 120 } },
  })
    .png()
    .toBuffer()
}

describe('image transforms', () => {
  it('crops a normalized region into a new image without mutating the source', async () => {
    const source = await sampleImage()
    const [crop] = await transformImage(source, {
      action: 'crop',
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    })
    const output = await sharp(crop.buffer).metadata()

    expect(output).toMatchObject({ width: 4, height: 4, format: 'png' })
    expect(crop.metadata).toMatchObject({
      action: 'crop',
      crop: { left: 2, top: 1, width: 4, height: 4 },
    })
    expect(source.byteLength).toBeGreaterThan(0)
  })

  it('splits a source into stable row-major tiles with provenance', async () => {
    const output = await transformImage(await sampleImage(), {
      action: 'split',
      columns: 2,
      rows: 3,
    })

    expect(
      output.map(({ suffix, width, height, metadata }) => ({
        suffix,
        width,
        height,
        order: metadata.order,
        row: metadata.row,
        column: metadata.column,
      })),
    ).toEqual([
      { suffix: 'part-1-1', width: 4, height: 2, order: 1, row: 1, column: 1 },
      { suffix: 'part-1-2', width: 4, height: 2, order: 2, row: 1, column: 2 },
      { suffix: 'part-2-1', width: 4, height: 2, order: 3, row: 2, column: 1 },
      { suffix: 'part-2-2', width: 4, height: 2, order: 4, row: 2, column: 2 },
      { suffix: 'part-3-1', width: 4, height: 2, order: 5, row: 3, column: 1 },
      { suffix: 'part-3-2', width: 4, height: 2, order: 6, row: 3, column: 2 },
    ])
  })

  it('rejects out-of-bounds crops and split grids above the approved cap', async () => {
    const source = await sampleImage()

    await expect(
      transformImage(source, {
        action: 'crop',
        crop: { x: 0.8, y: 0.8, width: 0.5, height: 0.5 },
      }),
    ).rejects.toThrow('Choose a crop area inside the image.')
    await expect(transformImage(source, { action: 'split', columns: 5, rows: 2 })).rejects.toThrow(
      'Split grids must be between 2×2 and 4×4.',
    )
  })
})
