import type { ChatMessage, StoredMessageRecord } from '@/types'
import { t } from '@/i18n'

const DB_NAME = 'lan-chat'
const DB_VERSION = 1
const STORE_NAME = 'messages'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error ?? new Error(t('errors.dbOpenFailed')))
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        const database = request.result

        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'id',
          })
          store.createIndex('roomId', 'roomId', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    })
  }

  return dbPromise
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode)
        const store = transaction.objectStore(STORE_NAME)
        executor(store, resolve, reject)
      }),
  )
}

export function putStoredMessage(record: StoredMessageRecord) {
  return runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(record)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error(t('errors.dbWriteFailed')))
  })
}

export function listStoredMessages(roomId: string) {
  return runTransaction<StoredMessageRecord[]>('readonly', (store, resolve, reject) => {
    const index = store.index('roomId')
    const request = index.getAll(IDBKeyRange.only(roomId))
    request.onsuccess = () => {
      const records = (request.result as StoredMessageRecord[]).sort((left, right) => left.createdAt - right.createdAt)
      resolve(records)
    }
    request.onerror = () => reject(request.error ?? new Error(t('errors.dbReadFailed')))
  })
}

export function chatMessageToStoredRecord(roomId: string, message: ChatMessage, imageBlob?: Blob) {
  return {
    id: message.id,
    roomId,
    senderId: message.senderId,
    senderNickname: message.senderNickname,
    type: message.type,
    createdAt: message.createdAt,
    text: message.text,
    imageName: message.imageMeta?.name,
    imageMime: message.imageMeta?.mime,
    imageSize: message.imageMeta?.size,
    imageBlob,
  } satisfies StoredMessageRecord
}
