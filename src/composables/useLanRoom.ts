import { computed, onBeforeUnmount, ref } from 'vue'
import { t } from '@/i18n'
import { chatMessageToStoredRecord, listStoredMessages, putStoredMessage } from '@/lib/db'
import { decodeSignalBundle, encodeSignalBundle } from '@/lib/signalCodec'
import {
  createAnswerSdp,
  createOfferSdp,
  createPeerConnection,
  sendWithBackpressure,
  setAnswerRemoteDescription,
  setOfferRemoteDescription,
} from '@/lib/webrtc'
import {
  base64ToUint8Array,
  blobToDataUrl,
  createPlayfulNickname,
  createId,
  revokeMessagePreviewUrls,
  roomLabelFromId,
  sortMessages,
  uint8ArrayToBase64,
} from '@/lib/utils'
import type {
  ChatMessage,
  ErrorEventPayload,
  HistoryBatchEvent,
  HistoryEndEvent,
  ImageChunkEvent,
  ImageCompleteEvent,
  ImageStartEvent,
  MessageEventPayload,
  PeerProfile,
  PresenceSyncEvent,
  RoomClosedEvent,
  RoomEvent,
  SignalBundle,
  StoredMessageRecord,
} from '@/types'

const HISTORY_RECENT_LIMIT = 100
const HISTORY_BATCH_SIZE = 100
const IMAGE_CHUNK_SIZE = 12 * 1024
const SIGNAL_TTL_MS = 10 * 60_000
const SESSION_HINT_KEY = 'lan-chat:recovery-hint'

interface PeerLink {
  peerId: string
  connection: RTCPeerConnection
  profile: PeerProfile
  chatChannel: RTCDataChannel | null
  assetChannel: RTCDataChannel | null
  isReady: boolean
  hasSyncedHistory: boolean
}

interface IncomingTransfer {
  messageId: string
  attachmentId: string
  mime: string
  senderId: string
  chunks: Uint8Array[]
}

export function useLanRoom() {
  const phase = ref<'entry' | 'guest-pairing' | 'room'>('entry')
  const localPeer = ref<PeerProfile | null>(null)
  const peers = ref<PeerProfile[]>([])
  const roomId = ref('')
  const roomLabel = ref('')
  const inviteBundleText = ref('')
  const inviteExpiry = ref<number | null>(null)
  const joinAnswerBundleText = ref('')
  const pendingInviteImport = ref('')
  const pendingAnswerImport = ref('')
  const statusText = ref(t('status.ready'))
  const errorText = ref('')
  const recoveryHint = ref<string | null>(sessionStorage.getItem(SESSION_HINT_KEY))
  const messages = ref<ChatMessage[]>([])
  const visibleCount = ref(120)

  sessionStorage.removeItem(SESSION_HINT_KEY)

  const activeConnections = new Map<string, PeerLink>()
  const pendingInvites = new Map<string, PeerLink>()
  const incomingTransfers = new Map<string, IncomingTransfer>()
  const imageBlobs = new Map<string, Blob>()
  let guestLink: PeerLink | null = null

  const isHost = computed(() => Boolean(localPeer.value?.isHost))
  const visibleMessages = computed(() => {
    const startIndex = Math.max(0, messages.value.length - visibleCount.value)
    return messages.value.slice(startIndex)
  })
  const hasOlderMessages = computed(() => messages.value.length > visibleCount.value)

  function pushStatus(message: string) {
    statusText.value = message
  }

  function pushError(message: string) {
    errorText.value = message
  }

  function clearError() {
    errorText.value = ''
  }

  function upsertPeer(profile: PeerProfile) {
    const index = peers.value.findIndex((candidate) => candidate.id === profile.id)

    if (index === -1) {
      peers.value = [...peers.value, profile].sort((left, right) => left.joinedAt - right.joinedAt)
      return
    }

    const nextPeers = [...peers.value]
    nextPeers[index] = {
      ...nextPeers[index],
      ...profile,
    }
    peers.value = nextPeers
  }

  function removePeer(peerId: string) {
    peers.value = peers.value.filter((peer) => peer.id !== peerId)
  }

  function upsertMessage(message: ChatMessage) {
    const index = messages.value.findIndex((candidate) => candidate.id === message.id)

    if (index === -1) {
      messages.value = sortMessages([...messages.value, message])
      return
    }

    const current = messages.value[index]
    const nextMessage: ChatMessage = {
      ...current,
      ...message,
      imageMeta: mergeImageMeta(current.imageMeta, message.imageMeta),
    }
    const nextMessages = [...messages.value]
    nextMessages[index] = nextMessage
    messages.value = sortMessages(nextMessages)
  }

  function mergeMessages(nextMessages: ChatMessage[]) {
    let merged = [...messages.value]

    for (const message of nextMessages) {
      const index = merged.findIndex((candidate) => candidate.id === message.id)

      if (index === -1) {
        merged.push(message)
      } else {
        merged[index] = {
          ...merged[index],
          ...message,
          imageMeta: mergeImageMeta(merged[index].imageMeta, message.imageMeta),
        }
      }
    }

    messages.value = sortMessages(merged)
  }

  function updateMessageImage(messageId: string, previewUrl: string, pending = false) {
    const message = messages.value.find((candidate) => candidate.id === messageId)

    if (!message?.imageMeta) {
      return
    }

    upsertMessage({
      ...message,
      pending,
      imageMeta: {
        ...message.imageMeta,
        previewUrl,
      },
    })
  }

  function mergeImageMeta(
    existing?: ChatMessage['imageMeta'],
    incoming?: ChatMessage['imageMeta'],
  ): ChatMessage['imageMeta'] {
    if (!existing && !incoming) {
      return undefined
    }

    if (!existing) {
      return incoming
    }

    if (!incoming) {
      return existing
    }

    return {
      attachmentId: incoming.attachmentId || existing.attachmentId,
      name: incoming.name || existing.name,
      mime: incoming.mime || existing.mime,
      size: incoming.size || existing.size,
      previewUrl: incoming.previewUrl ?? existing.previewUrl,
    }
  }

  function resetState() {
    revokeMessagePreviewUrls(messages.value)
    messages.value = []
    peers.value = []
    roomId.value = ''
    roomLabel.value = ''
    inviteBundleText.value = ''
    inviteExpiry.value = null
    joinAnswerBundleText.value = ''
    pendingInviteImport.value = ''
    pendingAnswerImport.value = ''
    visibleCount.value = 120

    for (const link of activeConnections.values()) {
      link.chatChannel?.close()
      link.assetChannel?.close()
      link.connection.close()
    }

    for (const link of pendingInvites.values()) {
      link.chatChannel?.close()
      link.assetChannel?.close()
      link.connection.close()
    }

    activeConnections.clear()
    pendingInvites.clear()
    incomingTransfers.clear()
    imageBlobs.clear()

    if (guestLink) {
      guestLink.chatChannel?.close()
      guestLink.assetChannel?.close()
      guestLink.connection.close()
      guestLink = null
    }
  }

  function getLocalProfile() {
    if (!localPeer.value) {
      throw new Error(t('errors.notInRoom'))
    }

    return localPeer.value
  }

  function storeRecoveryHint(message: string) {
    sessionStorage.setItem(SESSION_HINT_KEY, message)
  }

  function showRecoveryHint(message: string) {
    recoveryHint.value = message
    sessionStorage.setItem(SESSION_HINT_KEY, message)
  }

  function buildMessageBase(type: ChatMessage['type']) {
    const profile = getLocalProfile()

    return {
      id: createId('msg'),
      senderId: profile.id,
      senderNickname: profile.nickname,
      type,
      createdAt: Date.now(),
    } satisfies Omit<ChatMessage, 'text' | 'imageMeta'>
  }

  function getConnection(peerId: string) {
    return activeConnections.get(peerId) ?? pendingInvites.get(peerId) ?? (guestLink?.peerId === peerId ? guestLink : null)
  }

  function setupLinkConnectionState(link: PeerLink) {
    link.connection.addEventListener('connectionstatechange', () => {
      const state = link.connection.connectionState

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        if (isHost.value) {
          pendingInvites.delete(link.peerId)
          activeConnections.delete(link.peerId)
          if (state !== 'closed') {
            upsertPeer({
              ...link.profile,
              status: 'offline',
            })
            pushStatus(t('status.peerOffline', { nickname: link.profile.nickname }))
            void syncPresence()
          }
        } else if (guestLink?.peerId === link.peerId && phase.value !== 'entry') {
          pushError(t('errors.hostConnectionLost'))
        }
      }
    })
  }

  function attachChatChannel(link: PeerLink, channel: RTCDataChannel) {
    link.chatChannel = channel
    channel.addEventListener('open', () => {
      void finalizeLinkReady(link)
    })
    channel.addEventListener('message', (event) => {
      void handleChatChannelMessage(link.peerId, String(event.data))
    })
    channel.addEventListener('close', () => {
      if (isHost.value) {
        upsertPeer({
          ...link.profile,
          status: 'offline',
        })
      }
    })
  }

  function attachAssetChannel(link: PeerLink, channel: RTCDataChannel) {
    link.assetChannel = channel
    channel.addEventListener('open', () => {
      void finalizeLinkReady(link)
    })
    channel.addEventListener('message', (event) => {
      void handleAssetChannelMessage(link.peerId, String(event.data))
    })
  }

  async function finalizeLinkReady(link: PeerLink) {
    if (link.isReady || link.chatChannel?.readyState !== 'open' || link.assetChannel?.readyState !== 'open') {
      return
    }

    link.isReady = true

    if (isHost.value) {
      pendingInvites.delete(link.peerId)
      activeConnections.set(link.peerId, link)
      upsertPeer({
        ...link.profile,
        status: 'online',
      })
      pushStatus(t('status.peerJoined', { nickname: link.profile.nickname }))
      await syncPresence()
      await syncHistoryToPeer(link.peerId)
      return
    }

    phase.value = 'room'
    guestLink = link
    pushStatus(t('status.connectedToRoom', { roomLabel: roomLabel.value }))
  }

  async function sendChatEvent(link: PeerLink, event: RoomEvent) {
    if (!link.chatChannel || link.chatChannel.readyState !== 'open') {
      return
    }

    await sendWithBackpressure(link.chatChannel, JSON.stringify(event))
  }

  async function sendAssetEvent(link: PeerLink, event: ImageChunkEvent) {
    if (!link.assetChannel || link.assetChannel.readyState !== 'open') {
      return
    }

    await sendWithBackpressure(link.assetChannel, JSON.stringify(event))
  }

  async function broadcastEvent(event: RoomEvent, excludedPeerId?: string) {
    const tasks = [...activeConnections.values()]
      .filter((link) => link.peerId !== excludedPeerId)
      .map((link) =>
        event.kind === 'image-chunk'
          ? sendAssetEvent(link, event)
          : sendChatEvent(link, event),
      )

    await Promise.all(tasks)
  }

  async function syncPresence() {
    if (!isHost.value || !localPeer.value) {
      return
    }

    const event: PresenceSyncEvent = {
      kind: 'presence-sync',
      roomId: roomId.value,
      roomLabel: roomLabel.value,
      hostId: localPeer.value.id,
      peers: peers.value,
    }

    await broadcastEvent(event)
  }

  async function serializeStoredMessages(records: StoredMessageRecord[]) {
    const results = await Promise.all(
      records.map(async (record) => {
        if (record.type !== 'image' || !record.imageBlob) {
          return {
            id: record.id,
            senderId: record.senderId,
            senderNickname: record.senderNickname,
            type: record.type,
            createdAt: record.createdAt,
            text: record.text,
          } satisfies ChatMessage
        }

        const previewUrl = await blobToDataUrl(record.imageBlob)

        return {
          id: record.id,
          senderId: record.senderId,
          senderNickname: record.senderNickname,
          type: 'image',
          createdAt: record.createdAt,
          imageMeta: {
            attachmentId: `${record.id}-history`,
            name: record.imageName ?? t('common.image'),
            mime: record.imageMime ?? 'image/jpeg',
            size: record.imageSize ?? record.imageBlob.size,
            previewUrl,
          },
        } satisfies ChatMessage
      }),
    )

    return results
  }

  async function getHistoryMessages() {
    const stored = await listStoredMessages(roomId.value)

    if (stored.length > 0) {
      return serializeStoredMessages(stored)
    }

    return messages.value
  }

  async function syncHistoryToPeer(peerId: string) {
    const link = activeConnections.get(peerId)

    if (!link || link.hasSyncedHistory) {
      return
    }

    link.hasSyncedHistory = true
    const history = await getHistoryMessages()
    const recentMessages = history.slice(-HISTORY_RECENT_LIMIT)
    const olderMessages = history.slice(0, Math.max(0, history.length - HISTORY_RECENT_LIMIT))

    await sendChatEvent(link, {
      kind: 'history-batch',
      batch: 0,
      messages: recentMessages,
    } satisfies HistoryBatchEvent)

    let batchIndex = 1
    for (let cursor = 0; cursor < olderMessages.length; cursor += HISTORY_BATCH_SIZE) {
      await sendChatEvent(link, {
        kind: 'history-batch',
        batch: batchIndex,
        messages: olderMessages.slice(cursor, cursor + HISTORY_BATCH_SIZE),
      } satisfies HistoryBatchEvent)
      batchIndex += 1
    }

    await sendChatEvent(link, {
      kind: 'history-end',
      total: history.length,
    } satisfies HistoryEndEvent)
  }

  async function persistMessage(message: ChatMessage, imageBlob?: Blob) {
    if (!isHost.value) {
      return
    }

    await putStoredMessage(chatMessageToStoredRecord(roomId.value, message, imageBlob))
  }

  async function handlePresenceSync(event: PresenceSyncEvent) {
    roomId.value = event.roomId
    roomLabel.value = event.roomLabel
    peers.value = event.peers
  }

  async function handleMessageEvent(sourcePeerId: string, event: MessageEventPayload) {
    if (isHost.value) {
      const peer = peers.value.find((candidate) => candidate.id === sourcePeerId)
      const normalizedMessage: ChatMessage = {
        ...event.message,
        senderId: sourcePeerId,
        senderNickname: peer?.nickname ?? event.message.senderNickname,
      }
      upsertMessage(normalizedMessage)
      await persistMessage(normalizedMessage)
      await broadcastEvent(
        {
          kind: 'message',
          message: normalizedMessage,
        },
        sourcePeerId,
      )
      return
    }

    upsertMessage(event.message)
  }

  async function handleImageStartEvent(sourcePeerId: string, event: ImageStartEvent) {
    if (!event.message.imageMeta) {
      return
    }

    const peer = peers.value.find((candidate) => candidate.id === sourcePeerId)
    const normalizedMessage: ChatMessage = {
      ...event.message,
      senderId: isHost.value ? sourcePeerId : event.message.senderId,
      senderNickname: isHost.value ? peer?.nickname ?? event.message.senderNickname : event.message.senderNickname,
      pending: true,
    }

    incomingTransfers.set(event.message.id, {
      messageId: event.message.id,
      attachmentId: event.message.imageMeta.attachmentId,
      mime: event.message.imageMeta.mime,
      senderId: normalizedMessage.senderId,
      chunks: [],
    })

    upsertMessage(normalizedMessage)

    if (isHost.value) {
      await broadcastEvent(
        {
          kind: 'image-start',
          message: normalizedMessage,
        },
        sourcePeerId,
      )
    }
  }

  async function handleImageChunkEvent(sourcePeerId: string, event: ImageChunkEvent) {
    const transfer = incomingTransfers.get(event.messageId)

    if (!transfer) {
      return
    }

    transfer.chunks[event.index] = base64ToUint8Array(event.chunk)

    if (isHost.value) {
      await broadcastEvent(event, sourcePeerId)
    }
  }

  async function handleImageCompleteEvent(sourcePeerId: string, event: ImageCompleteEvent) {
    const transfer = incomingTransfers.get(event.messageId)

    if (!transfer) {
      return
    }

    incomingTransfers.delete(event.messageId)
    const blobParts = transfer.chunks.map((chunk) => chunk as BlobPart)
    const blob = new Blob(blobParts, {
      type: transfer.mime,
    })
    imageBlobs.set(event.messageId, blob)

    const previewUrl = URL.createObjectURL(blob)
    updateMessageImage(event.messageId, previewUrl, false)
    const message = messages.value.find((candidate) => candidate.id === event.messageId)

    if (message && isHost.value) {
      await persistMessage(message, blob)
      await broadcastEvent(event, sourcePeerId)
    }
  }

  async function handleHistoryBatch(event: HistoryBatchEvent) {
    mergeMessages(event.messages)
  }

  async function handleRoomClosed(event: RoomClosedEvent) {
    showRecoveryHint(event.reason ?? t('recovery.hostClosedRefresh'))
    pushError(event.reason ?? t('recovery.hostClosed'))
    await leaveRoom(false)
  }

  async function handleErrorEvent(event: ErrorEventPayload) {
    pushError(event.message)
  }

  async function handleChatChannelMessage(sourcePeerId: string, raw: string) {
    const event = JSON.parse(raw) as RoomEvent

    switch (event.kind) {
      case 'presence-sync':
        await handlePresenceSync(event)
        break
      case 'message':
        await handleMessageEvent(sourcePeerId, event)
        break
      case 'image-start':
        await handleImageStartEvent(sourcePeerId, event)
        break
      case 'image-complete':
        await handleImageCompleteEvent(sourcePeerId, event)
        break
      case 'history-batch':
        await handleHistoryBatch(event)
        break
      case 'history-end':
        pushStatus(t('status.historyComplete', { total: event.total }))
        break
      case 'room-closed':
        await handleRoomClosed(event)
        break
      case 'error':
        await handleErrorEvent(event)
        break
      default:
        break
    }
  }

  async function handleAssetChannelMessage(sourcePeerId: string, raw: string) {
    const event = JSON.parse(raw) as ImageChunkEvent

    if (event.kind === 'image-chunk') {
      await handleImageChunkEvent(sourcePeerId, event)
    }
  }

  async function createRoom(nickname: string) {
    clearError()
    resetState()

    const normalizedNickname = nickname.trim() || createPlayfulNickname('host')
    const hostId = createId('host')
    const nextRoomId = createId('room')
    const hostProfile: PeerProfile = {
      id: hostId,
      nickname: normalizedNickname,
      isHost: true,
      joinedAt: Date.now(),
      status: 'online',
    }

    localPeer.value = hostProfile
    roomId.value = nextRoomId
    roomLabel.value = roomLabelFromId(nextRoomId)
    peers.value = [hostProfile]
    phase.value = 'room'
    pushStatus(t('status.roomCreated'))
    storeRecoveryHint(t('recovery.refreshedHost', { roomLabel: roomLabel.value }))
    await generateInvite()
  }

  async function createInviteBundle() {
    if (!isHost.value) {
      throw new Error(t('errors.hostOnlyInvite'))
    }

    clearError()
    const peerId = createId('peer')
    const profile: PeerProfile = {
      id: peerId,
      nickname: t('common.pendingMember'),
      isHost: false,
      joinedAt: Date.now(),
      status: 'connecting',
    }
    const connection = createPeerConnection()
    const chatChannel = connection.createDataChannel('chat', {
      ordered: true,
    })
    const assetChannel = connection.createDataChannel('asset', {
      ordered: true,
    })
    const link: PeerLink = {
      peerId,
      connection,
      profile,
      chatChannel: null,
      assetChannel: null,
      isReady: false,
      hasSyncedHistory: false,
    }

    setupLinkConnectionState(link)
    attachChatChannel(link, chatChannel)
    attachAssetChannel(link, assetChannel)
    const sdp = await createOfferSdp(connection)
    const bundle: SignalBundle = {
      kind: 'offer',
      roomId: roomId.value,
      roomLabel: roomLabel.value,
      peerId,
      nickname: getLocalProfile().nickname,
      sdp,
      expiresAt: Date.now() + SIGNAL_TTL_MS,
      version: 1,
    }

    pendingInvites.set(peerId, link)
    const encodedBundle = encodeSignalBundle(bundle)
    inviteBundleText.value = encodedBundle
    inviteExpiry.value = bundle.expiresAt
    return encodedBundle
  }

  async function generateInvite() {
    clearError()
    await createInviteBundle()
    pushStatus(t('status.inviteUpdated'))
  }

  async function importGuestAnswer(raw: string) {
    if (!isHost.value) {
      throw new Error(t('errors.hostOnlyImportAnswer'))
    }

    clearError()
    const bundle = decodeSignalBundle(raw)

    if (bundle.kind !== 'answer') {
      throw new Error(t('errors.notAnswerBundle'))
    }

    if (bundle.roomId !== roomId.value) {
      throw new Error(t('errors.answerWrongRoom'))
    }

    if (bundle.expiresAt < Date.now()) {
      throw new Error(t('errors.answerExpired'))
    }

    const link = pendingInvites.get(bundle.peerId)

    if (!link) {
      throw new Error(t('errors.noMatchingInvite'))
    }

    link.profile = {
      ...link.profile,
      nickname: bundle.nickname,
      joinedAt: Date.now(),
      status: 'connecting',
    }
    upsertPeer(link.profile)
    await setAnswerRemoteDescription(link.connection, bundle.sdp)
    pendingAnswerImport.value = ''
    pushStatus(t('status.connectingPeer', { nickname: bundle.nickname }))
  }

  async function prepareJoin(
    rawInvite: string,
    nickname: string,
    options?: {
      autoSubmitAnswer?: boolean
    },
  ) {
    clearError()
    resetState()

    const bundle = decodeSignalBundle(rawInvite)

    if (bundle.kind !== 'offer') {
      throw new Error(t('errors.notOfferBundle'))
    }

    if (bundle.expiresAt < Date.now()) {
      throw new Error(t('errors.inviteExpired'))
    }

    const guestNickname = nickname.trim() || createPlayfulNickname('guest')
    const guestProfile: PeerProfile = {
      id: bundle.peerId,
      nickname: guestNickname,
      isHost: false,
      joinedAt: Date.now(),
      status: 'connecting',
    }
    const hostProfile: PeerProfile = {
      id: 'host-preview',
      nickname: bundle.nickname,
      isHost: true,
      joinedAt: Date.now() - 1,
      status: 'online',
    }
    const connection = createPeerConnection()
    const link: PeerLink = {
      peerId: bundle.peerId,
      connection,
      profile: guestProfile,
      chatChannel: null,
      assetChannel: null,
      isReady: false,
      hasSyncedHistory: false,
    }

    setupLinkConnectionState(link)
    connection.addEventListener('datachannel', (event) => {
      if (event.channel.label === 'chat') {
        attachChatChannel(link, event.channel)
      } else if (event.channel.label === 'asset') {
        attachAssetChannel(link, event.channel)
      }
    })

    await setOfferRemoteDescription(connection, bundle.sdp)
    const sdp = await createAnswerSdp(connection)
    const answerBundle: SignalBundle = {
      kind: 'answer',
      roomId: bundle.roomId,
      roomLabel: bundle.roomLabel,
      peerId: bundle.peerId,
      nickname: guestNickname,
      sdp,
      expiresAt: Date.now() + SIGNAL_TTL_MS,
      version: 1,
    }

    localPeer.value = guestProfile
    roomId.value = bundle.roomId
    roomLabel.value = bundle.roomLabel
    peers.value = [hostProfile, guestProfile]
    const encodedAnswerBundle = encodeSignalBundle(answerBundle)
    joinAnswerBundleText.value = encodedAnswerBundle
    guestLink = link
    phase.value = 'guest-pairing'
    pendingInviteImport.value = rawInvite.trim()
    storeRecoveryHint(t('recovery.refreshedGuest', { roomLabel: bundle.roomLabel }))
    pushStatus(
      options?.autoSubmitAnswer
        ? t('status.autoSubmittingAnswer', { roomLabel: bundle.roomLabel })
        : t('status.answerReady', { nickname: bundle.nickname }),
    )
    return encodedAnswerBundle
  }

  async function sendText(text: string) {
    const normalizedText = text.trim()

    if (!normalizedText) {
      return
    }

    clearError()
    const message: ChatMessage = {
      ...buildMessageBase('text'),
      text: normalizedText,
    }
    upsertMessage(message)

    if (isHost.value) {
      await persistMessage(message)
      await broadcastEvent({
        kind: 'message',
        message,
      })
      return
    }

    if (!guestLink) {
      throw new Error(t('errors.noHostConnection'))
    }

    await sendChatEvent(guestLink, {
      kind: 'message',
      message,
    })
  }

  async function sendImage(file: File) {
    clearError()
    const profile = getLocalProfile()
    const previewUrl = URL.createObjectURL(file)
    const message: ChatMessage = {
      ...buildMessageBase('image'),
      senderId: profile.id,
      senderNickname: profile.nickname,
      pending: true,
      imageMeta: {
        attachmentId: createId('asset'),
        name: file.name || t('common.image'),
        mime: file.type || 'image/jpeg',
        size: file.size,
        previewUrl,
      },
    }

    upsertMessage(message)
    imageBlobs.set(message.id, file)
    const startEvent: ImageStartEvent = {
      kind: 'image-start',
      message,
    }

    if (isHost.value) {
      await broadcastEvent(startEvent)
    } else if (guestLink) {
      await sendChatEvent(guestLink, startEvent)
    } else {
      throw new Error(t('errors.noHostConnection'))
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const totalChunks = Math.ceil(bytes.length / IMAGE_CHUNK_SIZE)
    const imageMeta = message.imageMeta

    if (!imageMeta) {
      throw new Error(t('errors.imageMetaMissing'))
    }

    for (let cursor = 0; cursor < bytes.length; cursor += IMAGE_CHUNK_SIZE) {
      const chunk = bytes.slice(cursor, cursor + IMAGE_CHUNK_SIZE)
      const event: ImageChunkEvent = {
        kind: 'image-chunk',
        messageId: message.id,
        attachmentId: imageMeta.attachmentId,
        index: Math.floor(cursor / IMAGE_CHUNK_SIZE),
        total: totalChunks,
        chunk: uint8ArrayToBase64(chunk),
      }

      if (isHost.value) {
        await broadcastEvent(event)
      } else if (guestLink) {
        await sendAssetEvent(guestLink, event)
      }
    }

    const completeEvent: ImageCompleteEvent = {
      kind: 'image-complete',
      messageId: message.id,
      attachmentId: imageMeta.attachmentId,
    }

    updateMessageImage(message.id, previewUrl, false)

    if (isHost.value) {
      await persistMessage(message, file)
      await broadcastEvent(completeEvent)
      return
    }

    if (!guestLink) {
      throw new Error(t('errors.noHostConnection'))
    }

    await sendChatEvent(guestLink, completeEvent)
  }

  function loadOlderMessages() {
    visibleCount.value += 120
  }

  async function leaveRoom(saveHint = true) {
    if (saveHint && roomLabel.value) {
      storeRecoveryHint(t('recovery.leftRoom', { roomLabel: roomLabel.value }))
    }

    if (isHost.value) {
      await broadcastEvent({
        kind: 'room-closed',
        reason: t('recovery.hostClosedSession'),
      } satisfies RoomClosedEvent)
    }

    resetState()
    localPeer.value = null
    phase.value = 'entry'
    pushStatus(t('status.ready'))
  }

  function dismissRecoveryHint() {
    recoveryHint.value = null
    sessionStorage.removeItem(SESSION_HINT_KEY)
  }

  function clearImports() {
    pendingInviteImport.value = ''
    pendingAnswerImport.value = ''
  }

  function handleBeforeUnload() {
    if (!roomLabel.value) {
      return
    }

    storeRecoveryHint(t('recovery.refreshedRoom', { roomLabel: roomLabel.value }))
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    resetState()
  })

  return {
    phase,
    isHost,
    localPeer,
    peers,
    roomId,
    roomLabel,
    inviteBundleText,
    inviteExpiry,
    joinAnswerBundleText,
    pendingInviteImport,
    pendingAnswerImport,
    statusText,
    errorText,
    recoveryHint,
    visibleMessages,
    hasOlderMessages,
    messages,
    createInviteBundle,
    createRoom,
    generateInvite,
    importGuestAnswer,
    prepareJoin,
    sendText,
    sendImage,
    loadOlderMessages,
    leaveRoom,
    dismissRecoveryHint,
    clearImports,
  }
}
