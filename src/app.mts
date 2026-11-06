import assert from 'assert'
import { Client, GatewayIntentBits, TextChannel, VoiceChannel } from 'discord.js'
import { config } from 'dotenv'
import { closeDb, initDb } from './db.mjs'
import { getUserConnectedHandler } from './handler.mjs'
import {
  hasTranscription,
  insertTranscription,
  removeTranscription,
  stopAllTranscriptions,
  stopUserInTranscription,
} from './state.mjs'
import { DiscordTokenSchema, UserIdSchema, VoiceChannelIdSchema } from './types.mjs'
import { connectToVoiceChannel, error, isGuildMember, log } from './utils.mjs'
import { closeWhisperWorker, initWhisperWorker } from './whisper.mjs'

config()

const tokenResult = DiscordTokenSchema.safeParse(process.env.DISCORD_TOKEN)

export const client = new Client({
  intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.Guilds],
})

client.on('ready', async () => {
  try {
    await initDb()
  } catch (err) {
    error('failed to initialize PostgreSQL database', err)
  }

  try {
    initWhisperWorker()
  } catch (err) {
    error('failed to initialize Whisper worker', err)
  }

  assert(!!client.user, 'did not find user for bot')
  log(`Logged in as ${client.user.tag}!`)
})

client.on('voiceStateUpdate', (oldState, newState) => {
  if (!oldState.channelId || oldState.channelId === newState.channelId) {
    return
  }

  const oldChannelId = VoiceChannelIdSchema.parse(oldState.channelId)
  const memberId = UserIdSchema.parse(oldState.id)

  // If the bot itself left or was disconnected from the voice channel, clean up the session
  if (memberId === client.user?.id) {
    removeTranscription(oldChannelId)
    return
  }

  // If a participant left the voice channel, stop listening to them
  stopUserInTranscription(oldChannelId, memberId)
})

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) {
    return
  }

  const { commandName } = interaction
  if (commandName === 'start') {
    // Get the voice channel of the user who sent the command
    if (!isGuildMember(interaction.member)) {
      return
    }

    const voiceChannel = interaction.member.voice.channel as VoiceChannel
    if (!voiceChannel) {
      await interaction.reply('Discord STT | Please join a voice channel first!')
      return
    }

    const voiceChannelId = VoiceChannelIdSchema.parse(voiceChannel.id)
    if (hasTranscription(voiceChannelId)) {
      await interaction.reply('Discord STT | Transcription is already running in your voice channel!')
      return
    }

    await interaction.reply('Discord STT | Starting transcription in your voice channel!')

    const targetTextChannel = interaction.channel as TextChannel
    let connection
    try {
      connection = await connectToVoiceChannel(voiceChannel)
    } catch (err) {
      error('could not join voice channel', err)
      await interaction.followUp('Discord STT | Failed to connect to the voice channel.').catch(() => {})
      return
    }

    // Start transcription
    const handleUserConnected = getUserConnectedHandler(
      connection.receiver,
      targetTextChannel,
      voiceChannel
    )

    // store metadata for proper cleanup
    insertTranscription(voiceChannel, targetTextChannel, connection, handleUserConnected)

    connection.receiver.speaking.on('start', handleUserConnected)
    for (const [rawUserId] of voiceChannel.members) {
      const userId = UserIdSchema.parse(rawUserId)
      handleUserConnected(userId)
    }
  } else if (commandName === 'stop') {
    // Get the voice channel of the user who sent the command
    if (!isGuildMember(interaction.member)) {
      return
    }

    const voiceChannel = interaction.member.voice.channel as VoiceChannel
    if (!voiceChannel) {
      await interaction.reply('Discord STT | Please join a voice channel first!')
      return
    }

    const voiceChannelId = VoiceChannelIdSchema.parse(voiceChannel.id)

    // disconnect and remove information about this interaction from local state
    const stopped = removeTranscription(voiceChannelId)
    if (!stopped) {
      await interaction.reply('Discord STT | No active transcription in your voice channel!')
      return
    }

    await interaction.reply('Discord STT | Stopped transcription in your voice channel!')
  }
})

async function shutdown() {
  log('Shutting down...')
  stopAllTranscriptions()
  closeWhisperWorker()
  client.destroy()
  await closeDb()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

if (tokenResult.success) {
  client.login(tokenResult.data)
}
