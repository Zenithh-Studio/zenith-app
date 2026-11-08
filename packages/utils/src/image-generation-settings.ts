export const imageResolutionOptions = ['1k', '2k', '4k', 'auto'] as const
export type ImageResolution = (typeof imageResolutionOptions)[number]

export const imageAspectRatios = ['1:1', '2:3', '3:2', '4:3', '3:4', '16:9', '9:16', '21:9']
export const imageCountQuickOptions = [1, 2, 3, 4]

export type ImageDimensions = { width: number; height: number }

const sizePresets: Record<Exclude<ImageResolution, 'auto'>, Record<string, ImageDimensions>> = {
  '1k': {
    '1:1': { width: 1024, height: 1024 },
    '2:3': { width: 1024, height: 1536 },
    '3:2': { width: 1536, height: 1024 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
    '16:9': { width: 1536, height: 864 },
    '9:16': { width: 864, height: 1536 },
    '21:9': { width: 2016, height: 864 },
  },
  '2k': {
    '1:1': { width: 2048, height: 2048 },
    '2:3': { width: 1360, height: 2048 },
    '3:2': { width: 2048, height: 1360 },
    '4:3': { width: 2048, height: 1536 },
    '3:4': { width: 1536, height: 2048 },
    '16:9': { width: 2048, height: 1152 },
    '9:16': { width: 1152, height: 2048 },
    '21:9': { width: 2688, height: 1152 },
  },
  '4k': {
    '1:1': { width: 2880, height: 2880 },
    '2:3': { width: 2336, height: 3520 },
    '3:2': { width: 3520, height: 2336 },
    '4:3': { width: 3312, height: 2480 },
    '3:4': { width: 2480, height: 3312 },
    '16:9': { width: 3840, height: 2160 },
    '9:16': { width: 2160, height: 3840 },
    '21:9': { width: 3840, height: 1648 },
  },
}

export function imageSizeFromSettings(resolution: string, aspectRatio: string) {
  const scale = resolution === '2k' || resolution === '4k' ? resolution : '1k'
  return sizePresets[scale][aspectRatio] || sizePresets[scale]['1:1']
}

export function readImageDimensions(size: unknown, resolution: string, aspectRatio: string) {
  const match = typeof size === 'string' ? /^(\d+)x(\d+)$/i.exec(size.trim()) : null
  if (match) {
    const width = Number(match[1])
    const height = Number(match[2])
    if (width > 0 && height > 0) return { width, height }
  }
  return imageSizeFromSettings(resolution, aspectRatio)
}

export function normalizeImageCount(value: unknown) {
  return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 1)))
}
