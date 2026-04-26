import { t } from '@/i18n'

const ICE_TIMEOUT_MS = 20_000

export function createPeerConnection(onConnectionStateChange?: (state: RTCPeerConnectionState) => void) {
  const connection = new RTCPeerConnection({
    iceServers: [],
  })

  connection.addEventListener('connectionstatechange', () => {
    onConnectionStateChange?.(connection.connectionState)
  })

  return connection
}

export async function waitForIceGatheringComplete(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === 'complete') {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(t('errors.iceTimeout')))
    }, ICE_TIMEOUT_MS)

    const handleStateChange = () => {
      if (connection.iceGatheringState === 'complete') {
        cleanup()
        resolve()
      }
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      connection.removeEventListener('icegatheringstatechange', handleStateChange)
    }

    connection.addEventListener('icegatheringstatechange', handleStateChange)
  })
}

export async function createOfferSdp(connection: RTCPeerConnection) {
  const offer = await connection.createOffer()
  await connection.setLocalDescription(offer)
  await waitForIceGatheringComplete(connection)

  if (!connection.localDescription?.sdp) {
    throw new Error(t('errors.createOfferFailed'))
  }

  return connection.localDescription.sdp
}

export async function createAnswerSdp(connection: RTCPeerConnection) {
  const answer = await connection.createAnswer()
  await connection.setLocalDescription(answer)
  await waitForIceGatheringComplete(connection)

  if (!connection.localDescription?.sdp) {
    throw new Error(t('errors.createAnswerFailed'))
  }

  return connection.localDescription.sdp
}

export async function setOfferRemoteDescription(connection: RTCPeerConnection, sdp: string) {
  await connection.setRemoteDescription({
    type: 'offer',
    sdp,
  })
}

export async function setAnswerRemoteDescription(connection: RTCPeerConnection, sdp: string) {
  await connection.setRemoteDescription({
    type: 'answer',
    sdp,
  })
}

export async function waitForDataChannelOpen(channel: RTCDataChannel) {
  if (channel.readyState === 'open') {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(t('errors.channelOpenTimeout', { label: channel.label })))
    }, 15_000)

    const handleOpen = () => {
      cleanup()
      resolve()
    }

    const handleClose = () => {
      cleanup()
      reject(new Error(t('errors.channelClosedBeforeOpen', { label: channel.label })))
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      channel.removeEventListener('open', handleOpen)
      channel.removeEventListener('close', handleClose)
    }

    channel.addEventListener('open', handleOpen)
    channel.addEventListener('close', handleClose)
  })
}

export async function sendWithBackpressure(channel: RTCDataChannel, payload: string) {
  channel.bufferedAmountLowThreshold = 64 * 1024

  while (channel.bufferedAmount > 256 * 1024) {
    await new Promise<void>((resolve) => {
      const handleLow = () => {
        channel.removeEventListener('bufferedamountlow', handleLow)
        resolve()
      }

      channel.addEventListener('bufferedamountlow', handleLow, { once: true })
    })
  }

  channel.send(payload)
}
