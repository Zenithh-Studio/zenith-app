import 'server-only'

import sharp from 'sharp'

export type CropRegion = { x: number; y: number; width: number; height: number }
export type ImageTransform =
  { action: 'crop'; crop: CropRegion } | { action: 'split'; columns: number; rows: number }

export type TransformedImage = {
  buffer: Buffer
  width: number
  height: number
  suffix: string
  metadata: Record<string, unknown>
}

export async function transformImage(buffer: Buffer, transform: ImageTransform) {
  const normalized = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = normalized.info

  if (transform.action === 'crop') {
    const { x, y, width: cropWidth, height: cropHeight } = transform.crop
    if (
      ![x, y, cropWidth, cropHeight].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      cropWidth <= 0 ||
      cropHeight <= 0 ||
      x + cropWidth > 1 ||
      y + cropHeight > 1
    ) {
      throw new Error('Choose a crop area inside the image.')
    }
    const left = Math.floor(x * width)
    const top = Math.floor(y * height)
    const right = Math.min(width, Math.ceil((x + cropWidth) * width))
    const bottom = Math.min(height, Math.ceil((y + cropHeight) * height))
    const extractWidth = right - left
    const extractHeight = bottom - top
    if (extractWidth < 1 || extractHeight < 1) throw new Error('The crop area is too small.')
    const output = await sharp(normalized.data)
      .extract({ left, top, width: extractWidth, height: extractHeight })
      .png()
      .toBuffer()
    return [
      {
        buffer: output,
        width: extractWidth,
        height: extractHeight,
        suffix: 'crop',
        metadata: {
          action: 'crop',
          sourceWidth: width,
          sourceHeight: height,
          crop: { left, top, width: extractWidth, height: extractHeight },
        },
      },
    ] satisfies TransformedImage[]
  }

  if (
    !Number.isInteger(transform.columns) ||
    !Number.isInteger(transform.rows) ||
    transform.columns < 2 ||
    transform.rows < 2 ||
    transform.columns > 4 ||
    transform.rows > 4
  ) {
    throw new Error('Split grids must be between 2×2 and 4×4.')
  }
  if (transform.columns > width || transform.rows > height) {
    throw new Error('The selected grid is larger than the source image.')
  }
  const output: TransformedImage[] = []
  for (let row = 0; row < transform.rows; row += 1) {
    for (let column = 0; column < transform.columns; column += 1) {
      const left = Math.floor((column * width) / transform.columns)
      const top = Math.floor((row * height) / transform.rows)
      const right = Math.floor(((column + 1) * width) / transform.columns)
      const bottom = Math.floor(((row + 1) * height) / transform.rows)
      const tileWidth = right - left
      const tileHeight = bottom - top
      const tile = await sharp(normalized.data)
        .extract({ left, top, width: tileWidth, height: tileHeight })
        .png()
        .toBuffer()
      output.push({
        buffer: tile,
        width: tileWidth,
        height: tileHeight,
        suffix: `part-${row + 1}-${column + 1}`,
        metadata: {
          action: 'split',
          sourceWidth: width,
          sourceHeight: height,
          rows: transform.rows,
          columns: transform.columns,
          row: row + 1,
          column: column + 1,
          order: output.length + 1,
        },
      })
    }
  }
  return output
}
