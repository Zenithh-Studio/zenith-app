/**
 * Browser-local database for Zenith Studio.
 *
 * The object stores follow the same local-first approach as Infinite Canvas:
 * structured records live in their own stores and binary files are kept out of
 * the JSON records in a separate assetFiles store.
 */

export const studioStores = [
  'workflows',
  'automations',
  'executions',
  'prompts',
  'textAssets',
  'media',
  'assetFiles',
  'generations',
  'settings',
  'productions',
] as const

export type StudioStore = (typeof studioStores)[number]
export type StudioRecord = { id: string; [key: string]: unknown }

const DATABASE_NAME = 'zenith-studio'
const DATABASE_VERSION = 5
let databasePromise: Promise<IDBDatabase> | undefined

const storeIndexes: Partial<
  Record<StudioStore, Array<{ name: string; keyPath: string | string[] }>>
> = {
  workflows: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
  automations: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
  executions: [
    { name: 'workflowId', keyPath: 'workflowId' },
    { name: 'workflowStartedAt', keyPath: ['workflowId', 'startedAt'] },
  ],
  prompts: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
  textAssets: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
  media: [{ name: 'createdAt', keyPath: 'createdAt' }],
  generations: [
    { name: 'createdAt', keyPath: 'createdAt' },
    { name: 'modalityCreatedAt', keyPath: ['modality', 'createdAt'] },
  ],
  productions: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
}

function openDatabase() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is available only in a browser.'))
  }
  if (databasePromise) return databasePromise

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    let blocked = false
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of studioStores) {
        const store = db.objectStoreNames.contains(name)
          ? request.transaction!.objectStore(name)
          : db.createObjectStore(name, { keyPath: 'id' })
        const indexes = storeIndexes[name] || []
        const currentIndexes = new Set(indexes.map(({ name: indexName }) => indexName))
        for (const indexName of Array.from(store.indexNames)) {
          if (!currentIndexes.has(indexName)) store.deleteIndex(indexName)
        }
        for (const index of indexes) {
          if (!store.indexNames.contains(index.name)) {
            store.createIndex(index.name, index.keyPath, { unique: false })
          }
        }
      }
    }
    request.onsuccess = () => {
      if (blocked) {
        request.result.close()
        return
      }
      request.result.onversionchange = () => {
        request.result.close()
        databasePromise = undefined
      }
      resolve(request.result)
    }
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error || new Error('Could not open the Zenith Studio database.'))
    }
    request.onblocked = () => {
      blocked = true
      databasePromise = undefined
      reject(new Error('The Zenith Studio database upgrade is blocked.'))
    }
  })
  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error || new Error('IndexedDB transaction failed.'))
  })
}

export type ListRecordOptions = {
  index?: string
  query?: IDBValidKey | IDBKeyRange
  direction?: IDBCursorDirection
  limit?: number
}

export async function listRecords<T extends StudioRecord>(
  storeName: StudioStore,
  options: ListRecordOptions = {},
) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const done = transactionDone(transaction)
  const store = transaction.objectStore(storeName)
  const source = options.index ? store.index(options.index) : store
  let values: T[]
  if (options.direction || options.limit) {
    values = await new Promise<T[]>((resolve, reject) => {
      const result: T[] = []
      const cursorRequest = source.openCursor(options.query, options.direction || 'next')
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor || (options.limit && result.length >= options.limit)) {
          resolve(result)
          return
        }
        result.push(cursor.value as T)
        cursor.continue()
      }
      cursorRequest.onerror = () =>
        reject(cursorRequest.error || new Error('IndexedDB query failed.'))
    })
  } else {
    values = (await requestResult(source.getAll(options.query))) as T[]
  }
  await done
  return values
}

export async function getRecord<T extends StudioRecord>(storeName: StudioStore, id: string) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const done = transactionDone(transaction)
  const value = (await requestResult(transaction.objectStore(storeName).get(id))) as T | undefined
  await done
  return value || null
}

export async function putRecord<T extends StudioRecord>(storeName: StudioStore, value: T) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(storeName).put(value)
  await done
  return value
}

export async function updateRecord<T extends StudioRecord>(
  storeName: StudioStore,
  id: string,
  update: (current: T | null) => T,
) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const done = transactionDone(transaction)
  const store = transaction.objectStore(storeName)
  const request = store.get(id)
  const updated = await new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      try {
        const next = update((request.result as T | undefined) || null)
        if (next.id !== id) throw new Error('Updated IndexedDB records must keep the same ID.')
        store.put(next)
        resolve(next)
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error || new Error('IndexedDB update failed.'))
  }).catch(async (error) => {
    await done.catch(() => undefined)
    throw error
  })
  await done
  return updated
}

export async function deleteRecord(storeName: StudioStore, id: string) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(storeName).delete(id)
  await done
}

export async function saveMediaAsset(file: File | Blob, asset: StudioRecord) {
  const id = String(asset.id || crypto.randomUUID())
  const fileId = crypto.randomUUID()
  const name =
    typeof File !== 'undefined' && file instanceof File
      ? file.name
      : String(asset.filename || 'asset')
  const createdAt = String(asset.createdAt || new Date().toISOString())
  const record = {
    ...asset,
    id,
    fileId,
    filename: String(asset.filename || name),
    mimeType: String(asset.mimeType || file.type || 'application/octet-stream'),
    filesize: file.size,
    createdAt,
  }
  const db = await openDatabase()
  const transaction = db.transaction(['assetFiles', 'media'], 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore('assetFiles').put({
    id: fileId,
    blob: file,
    name,
    type: file.type,
    size: file.size,
    createdAt,
  })
  transaction.objectStore('media').put(record)
  await done
  return record
}

export async function getAssetFile(id: string) {
  return getRecord<StudioRecord & { blob: Blob; name: string; type: string; size: number }>(
    'assetFiles',
    id,
  )
}

export async function deleteMediaAssets(assets: StudioRecord[]) {
  const db = await openDatabase()
  const transaction = db.transaction(['media', 'assetFiles'], 'readwrite')
  const done = transactionDone(transaction)
  const media = transaction.objectStore('media')
  const files = transaction.objectStore('assetFiles')
  for (const asset of assets) {
    media.delete(asset.id)
    if (typeof asset.fileId === 'string') files.delete(asset.fileId)
  }
  await done
}

export async function getStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usedBytes: 0, quotaBytes: 0 }
  }
  const estimate = await navigator.storage.estimate()
  return { usedBytes: estimate.usage || 0, quotaBytes: estimate.quota || 0 }
}
