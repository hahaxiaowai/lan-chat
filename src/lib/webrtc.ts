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
      reject(new Error('ICE 收集超时，请确认设备在同一局域网。'))
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
    throw new Error('无法生成房间邀请。')
  }

  return connection.localDescription.sdp
}

export async function createAnswerSdp(connection: RTCPeerConnection) {
  const answer = await connection.createAnswer()
  await connection.setLocalDescription(answer)
  await waitForIceGatheringComplete(connection)

  if (!connection.localDescription?.sdp) {
    throw new Error('无法生成加入应答。')
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
      reject(new Error(`数据通道 ${channel.label} 打开超时。`))
    }, 15_000)

    const handleOpen = () => {
      cleanup()
      resolve()
    }

    const handleClose = () => {
      cleanup()
      reject(new Error(`数据通道 ${channel.label} 在打开前已关闭。`))
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
