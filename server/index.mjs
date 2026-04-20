import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const signalOnly = process.argv.includes('--signal-only')
const port = Number(process.env.PORT ?? (signalOnly ? 5174 : 5173))

const sockets = new Map()
const rooms = new Map()
const pendingJoins = new Map()

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function safeSend(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function currentRooms() {
  return [...rooms.values()]
    .map(({ room }) => room)
    .sort((left, right) => right.seenAt - left.seenAt)
}

function broadcastRoomList() {
  const payload = {
    kind: 'room-list',
    rooms: currentRooms(),
  }

  for (const socket of sockets.values()) {
    safeSend(socket, payload)
  }
}

function removeRoomsOwnedBy(socket) {
  let changed = false

  for (const [roomId, entry] of rooms.entries()) {
    if (entry.hostSocket === socket) {
      rooms.delete(roomId)
      changed = true
    }
  }

  for (const [requestId, entry] of pendingJoins.entries()) {
    if (entry.hostSocket === socket || entry.guestSocket === socket) {
      pendingJoins.delete(requestId)
    }
  }

  if (changed) {
    broadcastRoomList()
  }
}

function removePendingJoinsForRoom(roomId) {
  for (const [requestId, entry] of pendingJoins.entries()) {
    if (entry.roomId === roomId) {
      pendingJoins.delete(requestId)
    }
  }
}

function serveStatic(req, res) {
  if (signalOnly) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, service: 'lan-chat-signal-node', port }))
    return
  }

  const urlPath = req.url === '/' ? '/index.html' : req.url ?? '/index.html'
  const cleanPath = urlPath.split('?')[0]
  const targetPath = path.join(distDir, cleanPath)
  const fallbackPath = path.join(distDir, 'index.html')

  const filePath =
    fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() ? targetPath : fallbackPath

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('dist 不存在，请先运行 pnpm build')
    return
  }

  const ext = path.extname(filePath)
  const contentType = mimeTypes[ext] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': contentType })
  fs.createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  if ((req.url ?? '').startsWith('/ws')) {
    res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('请通过 WebSocket 连接 /ws')
    return
  }

  serveStatic(req, res)
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (socket) => {
  const clientId = createId('client')
  sockets.set(clientId, socket)
  safeSend(socket, {
    kind: 'room-list',
    rooms: currentRooms(),
  })

  socket.on('message', (raw) => {
    let payload

    try {
      payload = JSON.parse(String(raw))
    } catch {
      safeSend(socket, {
        kind: 'signal-error',
        message: '信令消息格式无效。',
      })
      return
    }

    switch (payload.kind) {
      case 'room-upsert': {
        rooms.set(payload.room.roomId, {
          room: {
            ...payload.room,
            seenAt: Date.now(),
          },
          hostSocket: socket,
        })
        broadcastRoomList()
        break
      }

      case 'room-close': {
        const room = rooms.get(payload.roomId)
        if (room?.hostSocket === socket) {
          rooms.delete(payload.roomId)
          removePendingJoinsForRoom(payload.roomId)
          broadcastRoomList()
        }
        break
      }

      case 'join-request': {
        const room = rooms.get(payload.roomId)

        if (!room) {
          safeSend(socket, {
            kind: 'signal-error',
            message: '目标房间不存在或已经关闭。',
            roomId: payload.roomId,
            requestId: payload.requestId,
          })
          return
        }

        pendingJoins.set(payload.requestId, {
          roomId: payload.roomId,
          guestSocket: socket,
          hostSocket: room.hostSocket,
        })
        safeSend(room.hostSocket, payload)
        break
      }

      case 'join-offer': {
        const pending = pendingJoins.get(payload.requestId)

        if (!pending || pending.roomId !== payload.roomId || pending.hostSocket !== socket) {
          safeSend(socket, {
            kind: 'signal-error',
            message: '没有找到可用的加入请求，无法转发邀请码。',
            roomId: payload.roomId,
            requestId: payload.requestId,
          })
          return
        }

        safeSend(pending.guestSocket, payload)
        break
      }

      case 'join-answer': {
        const pending = pendingJoins.get(payload.requestId)

        if (!pending || pending.roomId !== payload.roomId || pending.guestSocket !== socket) {
          safeSend(socket, {
            kind: 'signal-error',
            message: '加入请求已经失效，无法转发应答。',
            roomId: payload.roomId,
            requestId: payload.requestId,
          })
          return
        }

        safeSend(pending.hostSocket, payload)
        break
      }

      case 'join-status': {
        const pending = pendingJoins.get(payload.requestId)

        if (!pending || pending.roomId !== payload.roomId || pending.hostSocket !== socket) {
          safeSend(socket, {
            kind: 'signal-error',
            message: '加入状态已经失效，无法同步给访客。',
            roomId: payload.roomId,
            requestId: payload.requestId,
          })
          return
        }

        safeSend(pending.guestSocket, payload)

        if (payload.status === 'answer-imported' || payload.status === 'failed') {
          pendingJoins.delete(payload.requestId)
        }
        break
      }

      default:
        safeSend(socket, {
          kind: 'signal-error',
          message: '不支持的信令事件。',
        })
    }
  })

  socket.on('close', () => {
    sockets.delete(clientId)
    removeRoomsOwnedBy(socket)
  })
})

server.listen(port, '0.0.0.0', () => {
  const mode = signalOnly ? 'signal-only' : 'serve+signal'
  console.log(`[lan-chat] ${mode} node listening on http://0.0.0.0:${port}`)
})
