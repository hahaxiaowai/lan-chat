import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ChatMessage } from '@/types'

const PLAYFUL_PREFIXES = ['火锅', '奶茶', '蹦迪', '摸鱼', '像素', '宇宙', '海盐', '电波', '旋风', '芝士']
const PLAYFUL_MIDDLES = ['土豆', '橘猫', '海豚', '章鱼', '汽水', '月亮', '星云', '耳机', '派对', '泡泡']
const HOST_SUFFIXES = ['房主', '掌柜', '船长', '队长', '大王', '指挥官']
const GUEST_SUFFIXES = ['访客', '队友', '搭子', '乘客', '选手', '特派员']

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createId(prefix: string) {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${suffix}`
}

export function roomLabelFromId(roomId: string) {
  return `LAN-${roomId.slice(-4).toUpperCase()}`
}

export function createPlayfulNickname(role: 'host' | 'guest') {
  const suffixes = role === 'host' ? HOST_SUFFIXES : GUEST_SUFFIXES
  const prefix = PLAYFUL_PREFIXES[Math.floor(Math.random() * PLAYFUL_PREFIXES.length)]
  const middle = PLAYFUL_MIDDLES[Math.floor(Math.random() * PLAYFUL_MIDDLES.length)]
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  return `${prefix}${middle}${suffix}`
}

export function formatClockTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return left.id.localeCompare(right.id)
    }

    return left.createdAt - right.createdAt
  })
}

export function bytesToSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败。'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = ''

  for (const value of bytes) {
    binary += String.fromCharCode(value)
  }

  return btoa(binary)
}

export function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function revokeMessagePreviewUrls(messages: ChatMessage[]) {
  for (const message of messages) {
    const previewUrl = message.imageMeta?.previewUrl

    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
  }
}
