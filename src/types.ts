export type PeerStatus = 'connecting' | 'online' | 'offline'

export interface PeerProfile {
  id: string
  nickname: string
  isHost: boolean
  joinedAt: number
  status: PeerStatus
}

export interface ImageMeta {
  attachmentId: string
  name: string
  mime: string
  size: number
  previewUrl?: string
}

export interface ChatMessage {
  id: string
  senderId: string
  senderNickname: string
  type: 'text' | 'image'
  createdAt: number
  text?: string
  imageMeta?: ImageMeta
  pending?: boolean
}

export interface SignalBundle {
  kind: 'offer' | 'answer'
  roomId: string
  roomLabel: string
  peerId: string
  nickname: string
  sdp: string
  expiresAt: number
  version: 1
}

export interface PresenceSyncEvent {
  kind: 'presence-sync'
  roomId: string
  roomLabel: string
  hostId: string
  peers: PeerProfile[]
}

export interface MessageEventPayload {
  kind: 'message'
  message: ChatMessage
}

export interface ImageStartEvent {
  kind: 'image-start'
  message: ChatMessage
}

export interface ImageChunkEvent {
  kind: 'image-chunk'
  messageId: string
  attachmentId: string
  index: number
  total: number
  chunk: string
}

export interface ImageCompleteEvent {
  kind: 'image-complete'
  messageId: string
  attachmentId: string
}

export interface HistoryBatchEvent {
  kind: 'history-batch'
  batch: number
  messages: ChatMessage[]
}

export interface HistoryEndEvent {
  kind: 'history-end'
  total: number
}

export interface RoomClosedEvent {
  kind: 'room-closed'
  reason?: string
}

export interface ErrorEventPayload {
  kind: 'error'
  message: string
}

export type RoomEvent =
  | PresenceSyncEvent
  | MessageEventPayload
  | ImageStartEvent
  | ImageChunkEvent
  | ImageCompleteEvent
  | HistoryBatchEvent
  | HistoryEndEvent
  | RoomClosedEvent
  | ErrorEventPayload

export interface StoredMessageRecord {
  id: string
  roomId: string
  senderId: string
  senderNickname: string
  type: ChatMessage['type']
  createdAt: number
  text?: string
  imageName?: string
  imageMime?: string
  imageSize?: number
  imageBlob?: Blob
}

export interface DiscoveredRoom {
  roomId: string
  roomLabel: string
  hostId: string
  hostNickname: string
  seenAt: number
}

export type SignalNodeClientEvent =
  | {
      kind: 'room-upsert'
      room: DiscoveredRoom
    }
  | {
      kind: 'room-close'
      roomId: string
    }
  | {
      kind: 'join-request'
      requestId: string
      roomId: string
      nickname: string
    }
  | {
      kind: 'join-offer'
      requestId: string
      roomId: string
      offerBundle: string
    }
  | {
      kind: 'join-answer'
      requestId: string
      roomId: string
      answerBundle: string
    }
  | {
      kind: 'join-status'
      requestId: string
      roomId: string
      status: 'answer-imported' | 'failed'
      message?: string
    }

export type SignalNodeServerEvent =
  | {
      kind: 'room-list'
      rooms: DiscoveredRoom[]
    }
  | {
      kind: 'join-request'
      requestId: string
      roomId: string
      nickname: string
    }
  | {
      kind: 'join-offer'
      requestId: string
      roomId: string
      offerBundle: string
    }
  | {
      kind: 'join-answer'
      requestId: string
      roomId: string
      answerBundle: string
    }
  | {
      kind: 'join-status'
      requestId: string
      roomId: string
      status: 'answer-imported' | 'failed'
      message?: string
    }
  | {
      kind: 'signal-error'
      message: string
      requestId?: string
      roomId?: string
    }
