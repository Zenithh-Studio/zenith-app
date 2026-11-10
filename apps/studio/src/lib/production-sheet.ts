export const productionSheetNames = [
  'Visual Bible',
  'Shot Master',
  'Image Prompt',
  'Motion Prompt',
] as const

export type ProductionSheetName = (typeof productionSheetNames)[number]
export type ProductionSheet = { headers: string[]; rows: string[][] }
export type ProductionSheets = Record<ProductionSheetName, ProductionSheet>
export type ValidationIssue = {
  severity: 'error' | 'warning'
  message: string
  sheet?: ProductionSheetName
  row?: number
}
export type ProductionOutput = {
  status: 'succeeded' | 'failed'
  assetId?: string
  generationId?: string
  path: string
  sourceHash: string
  error?: string
  updatedAt: string
}
export type ProductionRecord = {
  id: string
  spreadsheetUrl: string
  title: string
  projectCode: string
  sheets: ProductionSheets
  sourceHash: string
  validation: ValidationIssue[]
  outputs: Record<string, ProductionOutput>
  importedAt: string
  createdAt: string
  updatedAt: string
}

export const productionColumns: Record<ProductionSheetName, string[]> = {
  'Visual Bible': ['Type', 'Id', 'Name/location', 'Prompt Json'],
  'Shot Master': [
    'Shot ID',
    'Scene ID',
    'Draft ID',
    'Draft Out',
    'Duration',
    'Narration',
    'Image ID',
    'Animation ID',
  ],
  'Image Prompt': [
    'Prompt ID',
    'Shot ID',
    'Scene ID',
    'Reference ID',
    'Image Prompt EN',
    'Prompt Json',
  ],
  'Motion Prompt': ['Animation ID', 'Shot ID', 'Motion Method', 'Motion Prompt EN', 'Prompt Json'],
}

const headerAliases: Record<ProductionSheetName, Record<string, string[]>> = {
  'Visual Bible': {
    Type: ['Type'],
    Id: ['Id', 'ID', 'Visual Bible ID'],
    'Name/location': ['Name/location', 'Name / location', 'Name / Location', 'Name location'],
    'Prompt Json': ['Prompt Json', 'Prompt JSON', 'Prompt'],
  },
  'Shot Master': {
    'Shot ID': ['Shot ID'],
    'Scene ID': ['Scene ID'],
    'Draft ID': ['Draft ID', 'Draft In'],
    'Draft Out': ['Draft Out'],
    Duration: ['Duration', 'Duratuion', 'Duration draft'],
    Narration: ['Narration', 'Narration anchor', 'Narration (EN)'],
    'Image ID': ['Image ID', 'Image prompt ID', 'Image Prompt ID'],
    'Animation ID': ['Animation ID', 'Animation prompt ID', 'Motion ID'],
  },
  'Image Prompt': {
    'Prompt ID': ['Prompt ID'],
    'Shot ID': ['Shot ID'],
    'Scene ID': ['Scene ID'],
    'Reference ID': ['Reference ID', 'Reference IDs', 'References'],
    'Image Prompt EN': ['Image Prompt EN', 'Image prompt EN — production draft', 'Image prompt EN'],
    'Prompt Json': ['Prompt Json', 'Prompt JSON'],
  },
  'Motion Prompt': {
    'Animation ID': ['Animation ID', 'Motion ID'],
    'Shot ID': ['Shot ID'],
    'Motion Method': ['Motion Method', 'Method'],
    'Motion Prompt EN': [
      'Motion Prompt EN',
      'Mothion Prompt EN',
      'Motion prompt EN — production draft',
    ],
    'Prompt Json': ['Prompt Json', 'Prompt JSON'],
  },
}

function normalizedHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function normalizeProductionSheet(name: ProductionSheetName, sheet: ProductionSheet) {
  const aliases = headerAliases[name]
  const sourceColumns = sheet.headers.flatMap((header, sourceIndex) => {
    const target = productionColumns[name].find((column) =>
      aliases[column]?.some((alias) => normalizedHeader(alias) === normalizedHeader(header)),
    )
    return target ? [{ target, sourceIndex }] : []
  })
  const uniqueColumns = sourceColumns.filter(
    (column, index) => sourceColumns.findIndex((item) => item.target === column.target) === index,
  )
  return {
    headers: uniqueColumns.map((column) => column.target),
    rows: sheet.rows.map((row) =>
      uniqueColumns.map((column) => String(row[column.sourceIndex] || '')),
    ),
  }
}

function value(row: Record<string, string>, key: string) {
  return String(row[key] ?? '').trim()
}

export function productionRows(sheet: ProductionSheet | undefined) {
  if (!sheet) return []
  return sheet.rows
    .map((cells) =>
      Object.fromEntries(
        sheet.headers.map((header, index) => [header, String(cells[index] ?? '')]),
      ),
    )
    .filter((row) => Object.values(row).some((cell) => String(cell).trim()))
}

export function parseReferenceIds(input: string) {
  const value = input.trim()
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean)
    if (Array.isArray(parsed)) {
      return [
        ...new Set(
          parsed.flatMap((item) => (typeof item === 'string' ? [item.trim()] : [])).filter(Boolean),
        ),
      ]
    }
    if (parsed && typeof parsed === 'object') {
      return [
        ...new Set(
          Object.values(parsed as Record<string, unknown>)
            .flatMap((items) => {
              if (typeof items === 'string') return [items.trim()]
              if (Array.isArray(items))
                return items
                  .filter((item): item is string => typeof item === 'string')
                  .map((item) => item.trim())
              return []
            })
            .filter(Boolean),
        ),
      ]
    }
  } catch {
    // Plain text IDs may be comma, semicolon, or whitespace separated.
  }
  return [
    ...new Set(
      value
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

export function parsePromptJson(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function uniqueIndex(
  records: Array<Record<string, string>>,
  key: string,
  sheet: ProductionSheetName,
  issues: ValidationIssue[],
) {
  const result = new Map<string, Record<string, string>>()
  records.forEach((record, index) => {
    const id = value(record, key)
    if (!id) {
      issues.push({ severity: 'error', sheet, row: index + 2, message: `${key} is required.` })
      return
    }
    if (result.has(id)) {
      issues.push({ severity: 'error', sheet, row: index + 2, message: `Duplicate ${key}: ${id}.` })
      return
    }
    result.set(id, record)
  })
  return result
}

function referencesFromPrompt(value: string) {
  const json = parsePromptJson(value)
  const references = json?.references
  if (!references || typeof references !== 'object' || Array.isArray(references)) return []
  return Object.values(references as Record<string, unknown>).flatMap((items) =>
    Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : [],
  )
}

export function validateProductionSheets(sheets: Partial<ProductionSheets>) {
  const issues: ValidationIssue[] = []
  for (const sheetName of productionSheetNames) {
    const sheet = sheets[sheetName]
    if (!sheet) {
      issues.push({ severity: 'error', sheet: sheetName, message: 'Required sheet is missing.' })
      continue
    }
    const normalizedHeaders = new Set(sheet.headers.map((header) => header.trim().toLowerCase()))
    for (const header of productionColumns[sheetName]) {
      if (!normalizedHeaders.has(header.toLowerCase())) {
        issues.push({ severity: 'error', sheet: sheetName, message: `Missing column: ${header}.` })
      }
    }
  }

  if (
    issues.some(
      (issue) =>
        issue.message.startsWith('Required sheet') || issue.message.startsWith('Missing column'),
    )
  ) {
    return issues
  }

  const masters = productionRows(sheets['Visual Bible'])
  const shots = productionRows(sheets['Shot Master'])
  const images = productionRows(sheets['Image Prompt'])
  const motions = productionRows(sheets['Motion Prompt'])
  const masterIndex = uniqueIndex(masters, 'Id', 'Visual Bible', issues)
  const shotIndex = uniqueIndex(shots, 'Shot ID', 'Shot Master', issues)
  const imageIndex = uniqueIndex(images, 'Prompt ID', 'Image Prompt', issues)
  const motionIndex = uniqueIndex(motions, 'Animation ID', 'Motion Prompt', issues)

  for (const [index, row] of shots.entries()) {
    const shotId = value(row, 'Shot ID')
    const duration = Number(value(row, 'Duration'))
    if (!Number.isFinite(duration) || duration <= 0) {
      issues.push({
        severity: 'error',
        sheet: 'Shot Master',
        row: index + 2,
        message: `Invalid duration for ${shotId || 'shot'}.`,
      })
    }
    if (value(row, 'Image ID') && !imageIndex.has(value(row, 'Image ID'))) {
      issues.push({
        severity: 'warning',
        sheet: 'Shot Master',
        row: index + 2,
        message: `Image ID for ${shotId} does not match an Image Prompt ID.`,
      })
    }
    if (value(row, 'Animation ID') && !motionIndex.has(value(row, 'Animation ID'))) {
      issues.push({
        severity: 'warning',
        sheet: 'Shot Master',
        row: index + 2,
        message: `Animation ID for ${shotId} does not match a Motion Prompt ID.`,
      })
    }
  }

  for (const [index, row] of images.entries()) {
    const shotId = value(row, 'Shot ID')
    const shot = shotIndex.get(shotId)
    if (!shot) {
      issues.push({
        severity: 'error',
        sheet: 'Image Prompt',
        row: index + 2,
        message: `Unknown Shot ID: ${shotId || '(empty)'}.`,
      })
    } else if (value(row, 'Scene ID') !== value(shot, 'Scene ID')) {
      issues.push({
        severity: 'error',
        sheet: 'Image Prompt',
        row: index + 2,
        message: `Scene ID does not match Shot Master for ${shotId}.`,
      })
    }
    const promptJson = value(row, 'Prompt Json')
    const promptSpec = parsePromptJson(promptJson)
    if (promptJson && !promptSpec) {
      issues.push({
        severity: 'warning',
        sheet: 'Image Prompt',
        row: index + 2,
        message: `Prompt Json is invalid; Image Prompt EN will be used for ${value(row, 'Prompt ID') || 'this prompt'}.`,
      })
    }
    if (
      promptSpec &&
      ((promptSpec.prompt_id && promptSpec.prompt_id !== value(row, 'Prompt ID')) ||
        (promptSpec.shot_id && promptSpec.shot_id !== shotId) ||
        (promptSpec.scene_id && promptSpec.scene_id !== value(row, 'Scene ID')))
    ) {
      issues.push({
        severity: 'warning',
        sheet: 'Image Prompt',
        row: index + 2,
        message: `Prompt Json IDs do not match ${value(row, 'Prompt ID') || 'this prompt'}.`,
      })
    }
    const refIds = [
      ...new Set([
        ...parseReferenceIds(value(row, 'Reference ID')),
        ...referencesFromPrompt(promptJson),
      ]),
    ]
    for (const referenceId of refIds) {
      if (!masterIndex.has(referenceId)) {
        issues.push({
          severity: 'warning',
          sheet: 'Image Prompt',
          row: index + 2,
          message: `Reference ID ${referenceId} is unavailable; image generation can continue without it.`,
        })
      }
    }
    if (!value(row, 'Image Prompt EN') && !parsePromptJson(promptJson)?.prompt) {
      issues.push({
        severity: 'warning',
        sheet: 'Image Prompt',
        row: index + 2,
        message: `No English prompt text was found for ${value(row, 'Prompt ID') || 'this prompt'}.`,
      })
    }
  }

  for (const [index, row] of motions.entries()) {
    const shotId = value(row, 'Shot ID')
    const shot = shotIndex.get(shotId)
    if (!shot) {
      issues.push({
        severity: 'error',
        sheet: 'Motion Prompt',
        row: index + 2,
        message: `Unknown Shot ID: ${shotId || '(empty)'}.`,
      })
    } else if (value(row, 'Scene ID') && value(row, 'Scene ID') !== value(shot, 'Scene ID')) {
      issues.push({
        severity: 'error',
        sheet: 'Motion Prompt',
        row: index + 2,
        message: `Scene ID does not match Shot Master for ${shotId}.`,
      })
    }
    const promptJson = value(row, 'Prompt Json')
    const promptSpec = parsePromptJson(promptJson)
    if (promptJson && !promptSpec) {
      issues.push({
        severity: 'warning',
        sheet: 'Motion Prompt',
        row: index + 2,
        message: `Prompt Json is invalid; Motion Prompt EN will be used for ${value(row, 'Animation ID') || 'this prompt'}.`,
      })
    }
    if (
      promptSpec &&
      ((promptSpec.animation_id && promptSpec.animation_id !== value(row, 'Animation ID')) ||
        (promptSpec.shot_id && promptSpec.shot_id !== shotId) ||
        (promptSpec.scene_id && shot && promptSpec.scene_id !== value(shot, 'Scene ID')))
    ) {
      issues.push({
        severity: 'warning',
        sheet: 'Motion Prompt',
        row: index + 2,
        message: `Prompt Json IDs do not match ${value(row, 'Animation ID') || 'this prompt'}.`,
      })
    }
    const jsonDuration = Number(promptSpec?.duration_seconds)
    const shotDuration = Number(value(shot || {}, 'Duration'))
    if (promptSpec?.duration_seconds !== undefined) {
      if (!Number.isFinite(jsonDuration) || jsonDuration <= 0) {
        issues.push({
          severity: 'error',
          sheet: 'Motion Prompt',
          row: index + 2,
          message: `Invalid motion duration for ${value(row, 'Animation ID') || shotId}.`,
        })
      } else if (Number.isFinite(shotDuration) && Math.abs(jsonDuration - shotDuration) > 0.01) {
        issues.push({
          severity: 'error',
          sheet: 'Motion Prompt',
          row: index + 2,
          message: `Motion duration does not match Shot Master for ${shotId}.`,
        })
      }
    }
    if (!value(row, 'Motion Prompt EN') && !parsePromptJson(promptJson)?.prompt) {
      issues.push({
        severity: 'warning',
        sheet: 'Motion Prompt',
        row: index + 2,
        message: `No motion prompt text was found for ${value(row, 'Animation ID') || 'this prompt'}.`,
      })
    }
  }

  for (const [index, row] of masters.entries()) {
    const promptJson = value(row, 'Prompt Json')
    if (promptJson && !parsePromptJson(promptJson)) {
      issues.push({
        severity: 'warning',
        sheet: 'Visual Bible',
        row: index + 2,
        message: `Prompt Json is invalid for ${value(row, 'Id') || 'this asset'}; raw prompt text will be sent.`,
      })
    }
  }

  return issues
}

export function productionSourceHash(sheets: Partial<ProductionSheets>) {
  const source = JSON.stringify(sheets)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function productionProjectInfo(sheets: Partial<ProductionSheets>, spreadsheetId: string) {
  const title = `Production ${spreadsheetId.slice(0, 8)}`
  return { title, projectCode: `production-${spreadsheetId.slice(0, 8)}` }
}
