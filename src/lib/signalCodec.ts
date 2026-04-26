import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { t } from '@/i18n'
import type { SignalBundle } from '@/types'

const SIGNAL_PREFIX = 'lanchat:'

export function encodeSignalBundle(bundle: SignalBundle): string {
  const payload = compressToEncodedURIComponent(JSON.stringify(bundle))
  return `${SIGNAL_PREFIX}${payload}`
}

export function decodeSignalBundle(raw: string): SignalBundle {
  const normalized = raw.trim()
  const payload = normalized.startsWith(SIGNAL_PREFIX)
    ? normalized.slice(SIGNAL_PREFIX.length)
    : normalized

  const decoded = decompressFromEncodedURIComponent(payload)

  if (!decoded) {
    throw new Error(t('errors.signalDecodeFailed'))
  }

  const parsed = JSON.parse(decoded) as Partial<SignalBundle>

  if (
    !parsed.kind ||
    !parsed.roomId ||
    !parsed.roomLabel ||
    !parsed.peerId ||
    !parsed.nickname ||
    !parsed.sdp ||
    !parsed.expiresAt
  ) {
    throw new Error(t('errors.signalMissingFields'))
  }

  return {
    kind: parsed.kind,
    roomId: parsed.roomId,
    roomLabel: parsed.roomLabel,
    peerId: parsed.peerId,
    nickname: parsed.nickname,
    sdp: parsed.sdp,
    expiresAt: parsed.expiresAt,
    version: 1,
  }
}

export function getSignalExpiryLabel(expiresAt: number): string {
  const remainingMs = Math.max(0, expiresAt - Date.now())
  const remainingMinutes = Math.ceil(remainingMs / 60_000)

  if (remainingMinutes <= 1) {
    return t('time.lessThanOneMinute')
  }

  return t('time.minutes', { count: remainingMinutes })
}
