import { VoiceConnection } from '@discordjs/voice'
import { TextChannelId, TranscriptionMetadata, UserId, VoiceChannelId } from './types.mjs'
import { disconnectFromVoiceChannel } from './utils.mjs'

const transcriptionsByVoiceChannelId = new Map<VoiceChannelId, TranscriptionMetadata>()

export function hasTranscription(voiceChannelId: VoiceChannelId): boolean {
  return transcriptionsByVoiceChannelId.has(voiceChannelId)
}

export function insertTranscription(
  voiceChannelId: VoiceChannelId,
  textChannelId: TextChannelId,
  connection: VoiceConnection,
  onSpeakingStart?: (userId: string) => void
) {
  if (transcriptionsByVoiceChannelId.has(voiceChannelId)) {
    removeTranscription(voiceChannelId)
  }

  transcriptionsByVoiceChannelId.set(voiceChannelId, {
    voiceChannelId,
    textChannelId,
    users: new Map<UserId, () => void>(),
    connection,
    onSpeakingStart,
  })
}

export function removeTranscription(voiceChannelId: VoiceChannelId): boolean {
  const state = transcriptionsByVoiceChannelId.get(voiceChannelId)
  if (!state) {
    return false
  }

  if (state.onSpeakingStart) {
    state.connection.receiver.speaking.off('start', state.onSpeakingStart)
  }

  for (const stopUser of state.users.values()) {
    stopUser()
  }

  disconnectFromVoiceChannel(state.connection)
  transcriptionsByVoiceChannelId.delete(voiceChannelId)
  return true
}

export function hasUserInTranscription(
  voiceChannelId: VoiceChannelId,
  userId: UserId
): boolean {
  return Boolean(transcriptionsByVoiceChannelId.get(voiceChannelId)?.users.has(userId))
}

export function insertUserToTranscription(
  voiceChannelId: VoiceChannelId,
  userId: UserId,
  stop: () => void
) {
  const state = transcriptionsByVoiceChannelId.get(voiceChannelId)
  if (!state) {
    return
  }

  state.users.set(userId, stop)
}

export function removeUserFromTranscription(
  voiceChannelId: VoiceChannelId,
  userId: UserId
) {
  transcriptionsByVoiceChannelId.get(voiceChannelId)?.users.delete(userId)
}

export function stopUserInTranscription(
  voiceChannelId: VoiceChannelId,
  userId: UserId
) {
  const stop = transcriptionsByVoiceChannelId.get(voiceChannelId)?.users.get(userId)
  if (stop) {
    stop()
  }
}

export function stopAllTranscriptions() {
  for (const voiceChannelId of Array.from(transcriptionsByVoiceChannelId.keys())) {
    removeTranscription(voiceChannelId)
  }
}
