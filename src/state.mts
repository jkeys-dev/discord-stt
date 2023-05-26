import { VoiceConnection } from '@discordjs/voice'
import assert from 'assert'
import { TextChannel, VoiceChannel } from 'discord.js'
import { TranscriptionMetadata } from './types.mjs'
import { disconnectFromVoiceChannel } from './utils.mjs'

const transcriptionMetadatasByVoiceChannelId: Record<string, TranscriptionMetadata | undefined> = {}

export function insertTranscription(voiceChannel: VoiceChannel, textChannel: TextChannel, connection: VoiceConnection) {
  transcriptionMetadatasByVoiceChannelId[voiceChannel.id] = {
    id: voiceChannel.id,
    users: {},
    voiceChannelId: voiceChannel.id,
    textChannelId: textChannel.id,
    connection
  }
}

export function removeTranscription(voiceChannel: VoiceChannel) {
  const state = transcriptionMetadatasByVoiceChannelId[voiceChannel.id]
  for (const user of Object.values(state.users)) {
    user.stop()
  }
  disconnectFromVoiceChannel(state.connection)
  transcriptionMetadatasByVoiceChannelId[voiceChannel.id] = undefined
}

export function insertUserToTranscription(voiceChannel: VoiceChannel, userId: string, stop: () => void) {
  assert(
    !!transcriptionMetadatasByVoiceChannelId[voiceChannel.id],
    'this transcription does not exist in the local state'
  )

  transcriptionMetadatasByVoiceChannelId[voiceChannel.id].users[userId] = { id: userId, stop }
}
