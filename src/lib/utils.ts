import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { currentLocale, t, type AppLocale } from '@/i18n'
import type { ChatMessage } from '@/types'

const PLAYFUL_PREFIXES = ['火锅', '奶茶', '蹦迪', '摸鱼', '像素', '宇宙', '海盐', '电波', '旋风', '芝士']
const PLAYFUL_MIDDLES = ['土豆', '橘猫', '海豚', '章鱼', '汽水', '月亮', '星云', '耳机', '派对', '泡泡']
const HOST_SUFFIXES = ['房主', '掌柜', '船长', '队长', '大王', '指挥官']
const GUEST_SUFFIXES = ['访客', '队友', '搭子', '乘客', '选手', '特派员']
const EN_PLAYFUL_PREFIXES = ['Sunny', 'Pixel', 'Cosmic', 'Signal', 'Neon', 'Turbo', 'Cloud', 'Echo', 'Fresh', 'Bright']
const EN_PLAYFUL_MIDDLES = ['Potato', 'Comet', 'Bubble', 'Beacon', 'Noodle', 'Rocket', 'Spark', 'Wave', 'Mochi', 'Orbit']
const EN_HOST_SUFFIXES = ['Host', 'Captain', 'Keeper', 'Anchor', 'Guide', 'Pilot']
const EN_GUEST_SUFFIXES = ['Guest', 'Buddy', 'Teammate', 'Rider', 'Player', 'Visitor']

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

export function createPlayfulNickname(role: 'host' | 'guest', locale: AppLocale = currentLocale.value) {
  const prefixes = locale === 'en-US' ? EN_PLAYFUL_PREFIXES : PLAYFUL_PREFIXES
  const middles = locale === 'en-US' ? EN_PLAYFUL_MIDDLES : PLAYFUL_MIDDLES
  const suffixes = locale === 'en-US'
    ? role === 'host' ? EN_HOST_SUFFIXES : EN_GUEST_SUFFIXES
    : role === 'host' ? HOST_SUFFIXES : GUEST_SUFFIXES
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const middle = middles[Math.floor(Math.random() * middles.length)]
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  return locale === 'en-US' ? `${prefix} ${middle} ${suffix}` : `${prefix}${middle}${suffix}`
}

export function formatClockTime(timestamp: number) {
  return new Intl.DateTimeFormat(currentLocale.value, {
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
    reader.onerror = () => reject(reader.error ?? new Error(t('errors.readImageFailed')))
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
