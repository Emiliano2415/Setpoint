// SECURITY NOTE: IndexedDB data is stored unencrypted on the user's device.
// This is acceptable for POS terminals operated by trusted staff.
// If this app is ever deployed on shared/public devices, implement
// encryption using the Web Crypto API with a per-session derived key.
// See: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
import { openDB, type DBSchema } from 'idb'

interface SetpointDB extends DBSchema {
  pending_tickets: {
    key: string
    value: {
      id: string
      clubId: string
      items: Array<{ productoId: string; nombre: string; cantidad: number; precio: number }>
      total: number
      createdAt: string
      synced: boolean
    }
  }
  productos_cache: {
    key: string
    value: {
      id: string
      nombre: string
      precio: number
      categoriaId: string
      categoriaNombre: string
      activo: boolean
    }
    indexes: { 'by-categoria': string }
  }
}

const DB_NAME = 'setpoint-pos'
const DB_VERSION = 1

export async function getDB() {
  return openDB<SetpointDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending_tickets')) {
        db.createObjectStore('pending_tickets', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('productos_cache')) {
        const store = db.createObjectStore('productos_cache', { keyPath: 'id' })
        store.createIndex('by-categoria', 'categoriaId')
      }
    },
  })
}

export async function saveTicketOffline(ticket: SetpointDB['pending_tickets']['value']) {
  const db = await getDB()
  await db.put('pending_tickets', ticket)
}

export async function getPendingTickets() {
  const db = await getDB()
  return db.getAll('pending_tickets')
}

export async function markTicketSynced(id: string) {
  const db = await getDB()
  const ticket = await db.get('pending_tickets', id)
  if (ticket) await db.put('pending_tickets', { ...ticket, synced: true })
}

export async function cacheProductos(productos: SetpointDB['productos_cache']['value'][]) {
  const db = await getDB()
  const tx = db.transaction('productos_cache', 'readwrite')
  await Promise.all([...productos.map((p) => tx.store.put(p)), tx.done])
}

export async function getCachedProductos() {
  const db = await getDB()
  return db.getAll('productos_cache')
}
