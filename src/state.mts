import { Client, TextChannel, VoiceChannel } from 'discord.js'
import { createAudioPlayer } from '@discordjs/voice'
import { TranscriptionMetadata } from './types.mjs'
import assert from 'assert'
import { getUserConnectedHandler } from './handler.mjs'
import { connectToVoiceChannel } from './utils.mjs'

const transcriptionMetadatasByVoiceChannelId: Record<string, TranscriptionMetadata | undefined> = {}

// TODO: these functions are async so that the downstream code doesn't have to change
// when these are updated to read and write from a data store (or at least the local filesystem)

export async function hydrate(client: Client) {
  // TODO: read the state of the bot from wherever and hydrate the global Records

  for (const [voiceChannelId, metadata] of Object.entries(transcriptionMetadatasByVoiceChannelId)) {
    const targetVoiceChannel = client.channels.cache.get(voiceChannelId) as VoiceChannel
    const targetTextChannel = client.channels.cache.get(metadata.textChannelId) as TextChannel
    assert(!!targetVoiceChannel, 'target voice channel id not found')

    const connection = await connectToVoiceChannel(targetVoiceChannel)
    const audioPlayer = createAudioPlayer()
    const { receiver } = connection

    const handleUserConnected = getUserConnectedHandler(receiver, targetTextChannel, targetVoiceChannel)

    connection.subscribe(audioPlayer)
    connection.on('error', console.error)
    receiver.speaking.on('start', handleUserConnected)
  }
}

export async function insertTranscription(voiceChannel: VoiceChannel, textChannel: TextChannel) {
  // TODO: insert a row for this transcription state

  transcriptionMetadatasByVoiceChannelId[voiceChannel.id] = {
    id: voiceChannel.id,
    users: {},
    voiceChannelId: voiceChannel.id,
    textChannelId: textChannel.id,
  }
}

export async function removeTranscription(voiceChannel: VoiceChannel) {
  for (const user of Object.values(transcriptionMetadatasByVoiceChannelId[voiceChannel.id].users)) {
    user.stop()
  }

  // TODO: delete the row for this transcription in the provided voice channel

  transcriptionMetadatasByVoiceChannelId[voiceChannel.id] = undefined
}

export async function insertUserToTranscription(voiceChannel: VoiceChannel, userId: string, stop: () => void) {
  // TODO: change this assertion to assert the existence of the Transcription record in the database
  assert(
    !!transcriptionMetadatasByVoiceChannelId[voiceChannel.id],
    'this transcription does not exist in the local state'
  )

  transcriptionMetadatasByVoiceChannelId[voiceChannel.id].users[userId] = { id: userId, stop }
}
