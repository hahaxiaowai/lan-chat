import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { t } from '@/i18n'
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
const DEFAULT_SIGNAL_PATH = '/ws'

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

  function normalizeSocketUrl(url: string) {
    const target = new URL(url, window.location.origin)

    if (target.protocol === 'https:') {
      target.protocol = 'wss:'
    } else if (target.protocol === 'http:') {
      target.protocol = 'ws:'
    }

    return target.toString()
  }

  function getSocketUrl() {
    // Production static hosting can point the frontend at a separately deployed signal node.
    const configuredUrl = window.__LAN_CHAT_SIGNAL_URL__?.trim() || import.meta.env.VITE_SIGNAL_URL?.trim()

    if (configuredUrl) {
      return normalizeSocketUrl(configuredUrl)
    }

    return normalizeSocketUrl(DEFAULT_SIGNAL_PATH)
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
        setDiscoveryError(t('errors.signalDisconnected'))
      }
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      signalState.value = 'offline'
      setDiscoveryError(t('errors.signalConnectFailed'))
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
            const message = error instanceof Error ? error.message : t('errors.createInviteFailed')
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
              t('errors.directJoinSlowAfterAnswer'),
            )
            postEvent({
              kind: 'join-answer',
              requestId: payload.requestId,
              roomId: payload.roomId,
              answerBundle,
            })
          } catch (error) {
            clearDirectJoinState()
            setDiscoveryError(error instanceof Error ? error.message : t('errors.autoJoinFailed'))
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
            const message = error instanceof Error ? error.message : t('errors.importAnswerFailed')
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
            setDiscoveryError(payload.message || t('errors.hostAutoJoinFailed'))
            return
          }

          if (payload.status === 'answer-imported') {
            armDirectJoinTimeout(
              DIRECT_JOIN_CONNECT_TIMEOUT_MS,
              t('errors.directJoinSlowAfterHostImport'),
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
      throw new Error(t('errors.signalUnavailable'))
    }

    const normalizedNickname = nickname.trim() || t('common.guest')
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
      t('errors.directJoinNoHostResponse'),
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
