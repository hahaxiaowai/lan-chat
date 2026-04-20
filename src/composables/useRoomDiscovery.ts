import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { createId } from '@/lib/utils'
import type {
  DiscoveredRoom,
  PeerProfile,
  SignalNodeClientEvent,
  SignalNodeServerEvent,
} from '@/types'

const RECONNECT_DELAY_MS = 2_000
const DIRECT_JOIN_REQUEST_TIMEOUT_MS = 20_000
const DIRECT_JOIN_CONNECT_TIMEOUT_MS = 30_000

interface UseRoomDiscoveryOptions {
  phase: Ref<'entry' | 'guest-pairing' | 'room'>
  isHost: Ref<boolean>
  roomId: Ref<string>
  roomLabel: Ref<string>
  localPeer: Ref<PeerProfile | null>
  createInviteBundle: () => Promise<string>
  prepareJoinFromInvite: (
    inviteBundle: string,
    nickname: string,
    options?: { autoSubmitAnswer?: boolean },
  ) => Promise<string>
  importGuestAnswer: (answerBundle: string) => Promise<void>
}

export function useRoomDiscovery(options: UseRoomDiscoveryOptions) {
  const discoveredRooms = ref<DiscoveredRoom[]>([])
  const discoveryError = ref('')
  const directJoinPendingRoomId = ref<string | null>(null)
  const directJoinPendingRoomLabel = ref('')
  const autoJoinMode = ref(false)
  const signalState = ref<'connecting' | 'online' | 'offline'>('connecting')

  let socket: WebSocket | null = null
  let reconnectTimer = 0
  let directJoinTimer = 0
  let pendingRequestId: string | null = null
  let pendingJoinNickname = ''
  let disposed = false

  function getSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }

  function setDiscoveryError(message: string) {
    discoveryError.value = message
  }

  function clearDiscoveryError() {
    discoveryError.value = ''
  }

  function clearDirectJoinState() {
    directJoinPendingRoomId.value = null
    directJoinPendingRoomLabel.value = ''
    autoJoinMode.value = false
    pendingRequestId = null
    pendingJoinNickname = ''

    if (directJoinTimer) {
      window.clearTimeout(directJoinTimer)
      directJoinTimer = 0
    }
  }

  function armDirectJoinTimeout(delayMs: number, message: string) {
    if (directJoinTimer) {
      window.clearTimeout(directJoinTimer)
    }

    directJoinTimer = window.setTimeout(() => {
      if (!pendingRequestId) {
        return
      }

      clearDirectJoinState()
      setDiscoveryError(message)
    }, delayMs)
  }

  function postEvent(event: SignalNodeClientEvent) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event))
    }
  }

  function announceRoom() {
    const profile = options.localPeer.value

    if (!options.isHost.value || !profile || !options.roomId.value || !options.roomLabel.value) {
      return
    }

    postEvent({
      kind: 'room-upsert',
      room: {
        roomId: options.roomId.value,
        roomLabel: options.roomLabel.value,
        hostId: profile.id,
        hostNickname: profile.nickname,
        seenAt: Date.now(),
      },
    })
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) {
      return
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0
      connect()
    }, RECONNECT_DELAY_MS)
  }

  function connect() {
    if (disposed) {
      return
    }

    signalState.value = 'connecting'
    socket = new WebSocket(getSocketUrl())

    socket.addEventListener('open', () => {
      signalState.value = 'online'
      clearDiscoveryError()
      announceRoom()
    })

    socket.addEventListener('close', () => {
      signalState.value = 'offline'
      if (!disposed) {
        setDiscoveryError('与局域网信令节点断开，正在尝试重连。')
      }
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      signalState.value = 'offline'
      setDiscoveryError('无法连接局域网信令节点，请确认临时节点已启动。')
    })

    socket.addEventListener('message', async (event) => {
      const payload = JSON.parse(String(event.data)) as SignalNodeServerEvent

      switch (payload.kind) {
        case 'room-list':
          discoveredRooms.value = payload.rooms
          break
        case 'join-request':
          if (!options.isHost.value || payload.roomId !== options.roomId.value) {
            return
          }

          try {
            const offerBundle = await options.createInviteBundle()
            postEvent({
              kind: 'join-offer',
              requestId: payload.requestId,
              roomId: payload.roomId,
              offerBundle,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : '生成房间邀请失败。'
            setDiscoveryError(message)
            postEvent({
              kind: 'join-status',
              requestId: payload.requestId,
              roomId: payload.roomId,
              status: 'failed',
              message,
            })
          }
          break
        case 'join-offer':
          if (payload.requestId !== pendingRequestId || payload.roomId !== directJoinPendingRoomId.value) {
            return
          }

          try {
            const answerBundle = await options.prepareJoinFromInvite(payload.offerBundle, pendingJoinNickname, {
              autoSubmitAnswer: true,
            })
            armDirectJoinTimeout(
              DIRECT_JOIN_CONNECT_TIMEOUT_MS,
              '已提交加入应答，但局域网直连建立较慢，请确认房主仍在线，或改用邀请码手动加入。',
            )
            postEvent({
              kind: 'join-answer',
              requestId: payload.requestId,
              roomId: payload.roomId,
              answerBundle,
            })
          } catch (error) {
            clearDirectJoinState()
            setDiscoveryError(error instanceof Error ? error.message : '自动进入房间失败。')
          }
          break
        case 'join-answer':
          if (!options.isHost.value || payload.roomId !== options.roomId.value) {
            return
          }

          try {
            await options.importGuestAnswer(payload.answerBundle)
            postEvent({
              kind: 'join-status',
              requestId: payload.requestId,
              roomId: payload.roomId,
              status: 'answer-imported',
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : '导入访客应答失败。'
            setDiscoveryError(message)
            postEvent({
              kind: 'join-status',
              requestId: payload.requestId,
              roomId: payload.roomId,
              status: 'failed',
              message,
            })
          }
          break
        case 'join-status':
          if (payload.requestId !== pendingRequestId || payload.roomId !== directJoinPendingRoomId.value) {
            return
          }

          if (payload.status === 'failed') {
            clearDirectJoinState()
            setDiscoveryError(payload.message || '房主未能完成自动加入，请改用邀请码手动加入。')
            return
          }

          if (payload.status === 'answer-imported') {
            armDirectJoinTimeout(
              DIRECT_JOIN_CONNECT_TIMEOUT_MS,
              '房主已经接收加入应答，但局域网直连仍未建立，请稍后重试或改用邀请码手动加入。',
            )
          }
          break
        case 'signal-error':
          if (payload.requestId && payload.requestId === pendingRequestId) {
            clearDirectJoinState()
          }
          setDiscoveryError(payload.message)
          break
        default:
          break
      }
    })
  }

  async function requestDirectJoin(room: DiscoveredRoom, nickname: string) {
    clearDiscoveryError()

    if (socket?.readyState !== WebSocket.OPEN) {
      throw new Error('局域网信令节点当前不可用，请确认节点已启动后再试。')
    }

    const normalizedNickname = nickname.trim() || '访客'
    pendingJoinNickname = normalizedNickname
    pendingRequestId = createId('join')
    directJoinPendingRoomId.value = room.roomId
    directJoinPendingRoomLabel.value = room.roomLabel
    autoJoinMode.value = true

    postEvent({
      kind: 'join-request',
      requestId: pendingRequestId,
      roomId: room.roomId,
      nickname: normalizedNickname,
    })

    armDirectJoinTimeout(
      DIRECT_JOIN_REQUEST_TIMEOUT_MS,
      '房主没有及时响应自动加入请求，请确认对方仍在线，或改用邀请码手动加入。',
    )
  }

  onMounted(() => {
    connect()
  })

  watch(
    () => [options.isHost.value, options.phase.value, options.roomId.value, options.roomLabel.value, signalState.value] as const,
    ([host, phase, currentRoomId, currentRoomLabel, currentSignal], [previousHost, previousPhase, previousRoomId]) => {
      if (host && phase === 'room' && currentRoomId && currentRoomLabel && currentSignal === 'online') {
        announceRoom()
      }

      if (previousHost && previousPhase === 'room' && previousRoomId && previousRoomId !== currentRoomId) {
        postEvent({
          kind: 'room-close',
          roomId: previousRoomId,
        })
      }
    },
  )

  watch(
    () => options.phase.value,
    (phase) => {
      if (phase === 'room' || phase === 'entry') {
        clearDirectJoinState()
      }
    },
  )

  onBeforeUnmount(() => {
    disposed = true

    if (options.isHost.value && options.roomId.value) {
      postEvent({
        kind: 'room-close',
        roomId: options.roomId.value,
      })
    }

    clearDirectJoinState()

    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
    }

    socket?.close()
  })

  return {
    discoveredRooms,
    discoveryError,
    directJoinPendingRoomId,
    directJoinPendingRoomLabel,
    autoJoinMode,
    requestDirectJoin,
    signalState,
  }
}
