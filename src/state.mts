import { VoiceConnection } from '@discordjs/voice'
import { TextChannel, VoiceChannel } from 'discord.js'
import {
  TextChannelIdSchema,
  TranscriptionMetadata,
  UserId,
  UserIdSchema,
  VoiceChannelId,
  VoiceChannelIdSchema,
} from './types.mjs'
import { disconnectFromVoiceChannel } from './utils.mjs'

const transcriptionsByVoiceChannelId = new Map<VoiceChannelId, TranscriptionMetadata>()

export function hasTranscription(voiceChannelId: VoiceChannelId): boolean {
  return transcriptionsByVoiceChannelId.has(VoiceChannelIdSchema.parse(voiceChannelId))
}

export function insertTranscription(
  voiceChannel: Pick<VoiceChannel, 'id'>,
  textChannel: Pick<TextChannel, 'id'>,
  connection: VoiceConnection,
  onSpeakingStart?: (userId: string) => void
) {
  const voiceChannelId = VoiceChannelIdSchema.parse(voiceChannel.id)
  const textChannelId = TextChannelIdSchema.parse(textChannel.id)

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

export function removeTranscription(
  voiceChannelOrId: VoiceChannelId | Pick<VoiceChannel, 'id'>
): boolean {
  const voiceChannelId = VoiceChannelIdSchema.parse(
    typeof voiceChannelOrId === 'string' ? voiceChannelOrId : voiceChannelOrId.id
  )
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
  const validVoiceId = VoiceChannelIdSchema.parse(voiceChannelId)
  const validUserId = UserIdSchema.parse(userId)
  return Boolean(transcriptionsByVoiceChannelId.get(validVoiceId)?.users.has(validUserId))
}

export function insertUserToTranscription(
  voiceChannelOrId: VoiceChannelId | Pick<VoiceChannel, 'id'>,
  userId: UserId,
  stop: () => void
) {
  const voiceChannelId = VoiceChannelIdSchema.parse(
    typeof voiceChannelOrId === 'string' ? voiceChannelOrId : voiceChannelOrId.id
  )
  const validUserId = UserIdSchema.parse(userId)
  const state = transcriptionsByVoiceChannelId.get(voiceChannelId)
  if (!state) {
    return
  }

  state.users.set(validUserId, stop)
}

export function removeUserFromTranscription(
  voiceChannelId: VoiceChannelId,
  userId: UserId
) {
  const validVoiceId = VoiceChannelIdSchema.parse(voiceChannelId)
  const validUserId = UserIdSchema.parse(userId)
  transcriptionsByVoiceChannelId.get(validVoiceId)?.users.delete(validUserId)
}

export function stopUserInTranscription(
  voiceChannelId: VoiceChannelId,
  userId: UserId
) {
  const validVoiceId = VoiceChannelIdSchema.parse(voiceChannelId)
  const validUserId = UserIdSchema.parse(userId)
  const stop = transcriptionsByVoiceChannelId.get(validVoiceId)?.users.get(validUserId)
  if (stop) {
    stop()
  }
}

export function stopAllTranscriptions() {
  for (const voiceChannelId of Array.from(transcriptionsByVoiceChannelId.keys())) {
    removeTranscription(voiceChannelId)
  }
}
