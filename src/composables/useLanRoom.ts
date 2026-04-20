import { computed, onBeforeUnmount, ref } from 'vue'
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
  const statusText = ref('准备创建局域网房间')
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
      throw new Error('当前还没有进入房间。')
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
            pushStatus(`${link.profile.nickname} 已离线`)
            void syncPresence()
          }
        } else if (guestLink?.peerId === link.peerId && phase.value !== 'entry') {
          pushError('与房主的局域网连接已中断。')
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
      pushStatus(`${link.profile.nickname} 已进入房间`)
      await syncPresence()
      await syncHistoryToPeer(link.peerId)
      return
    }

    phase.value = 'room'
    guestLink = link
    pushStatus(`已连接到 ${roomLabel.value}`)
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
            name: record.imageName ?? '图片',
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
    showRecoveryHint(event.reason ?? '房主已关闭房间，页面刷新后需要重新配对。')
    pushError(event.reason ?? '房主已关闭房间。')
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
        pushStatus(`历史同步完成，共 ${event.total} 条消息`)
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
    pushStatus('房间已创建，正在生成邀请包')
    storeRecoveryHint(`你刚刚刷新了 ${roomLabel.value}，纯前端房间已结束，需要重新生成邀请码。`)
    await generateInvite()
  }

  async function createInviteBundle() {
    if (!isHost.value) {
      throw new Error('只有房主可以生成邀请码。')
    }

    clearError()
    const peerId = createId('peer')
    const profile: PeerProfile = {
      id: peerId,
      nickname: '待加入成员',
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
    pushStatus('邀请码已更新，可以复制文本发给新成员')
  }

  async function importGuestAnswer(raw: string) {
    if (!isHost.value) {
      throw new Error('只有房主可以导入访客应答。')
    }

    clearError()
    const bundle = decodeSignalBundle(raw)

    if (bundle.kind !== 'answer') {
      throw new Error('这不是一个加入应答包。')
    }

    if (bundle.roomId !== roomId.value) {
      throw new Error('这个应答包不属于当前房间。')
    }

    if (bundle.expiresAt < Date.now()) {
      throw new Error('这个应答包已经过期。')
    }

    const link = pendingInvites.get(bundle.peerId)

    if (!link) {
      throw new Error('没有找到匹配的邀请码，可能已经被使用或过期。')
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
    pushStatus(`正在连接 ${bundle.nickname}`)
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
      throw new Error('这不是一个房间邀请码。')
    }

    if (bundle.expiresAt < Date.now()) {
      throw new Error('这个房间邀请码已经过期。')
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
    storeRecoveryHint(`你刚刚刷新了 ${bundle.roomLabel}，需要重新扫描房主的邀请码。`)
    pushStatus(
      options?.autoSubmitAnswer
        ? `已发现 ${bundle.roomLabel}，正在自动提交加入应答`
        : `已生成加入应答，请发回给 ${bundle.nickname}`,
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
      throw new Error('还没有连到房主。')
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
        name: file.name || '图片',
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
      throw new Error('还没有连到房主。')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const totalChunks = Math.ceil(bytes.length / IMAGE_CHUNK_SIZE)
    const imageMeta = message.imageMeta

    if (!imageMeta) {
      throw new Error('图片消息缺少元数据。')
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
      throw new Error('还没有连到房主。')
    }

    await sendChatEvent(guestLink, completeEvent)
  }

  function loadOlderMessages() {
    visibleCount.value += 120
  }

  async function leaveRoom(saveHint = true) {
    if (saveHint && roomLabel.value) {
      storeRecoveryHint(`你离开了 ${roomLabel.value}。如果需要继续聊天，请重新生成或重新扫描邀请码。`)
    }

    if (isHost.value) {
      await broadcastEvent({
        kind: 'room-closed',
        reason: '房主已关闭房间，当前会话已经结束。',
      } satisfies RoomClosedEvent)
    }

    resetState()
    localPeer.value = null
    phase.value = 'entry'
    pushStatus('准备创建局域网房间')
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

    storeRecoveryHint(`你刷新了 ${roomLabel.value}。纯前端房间不会自动恢复，需要重新配对。`)
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
