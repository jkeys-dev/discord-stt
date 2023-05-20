import { config } from 'dotenv'
import assert from 'assert'
import { Client, TextChannel, VoiceChannel } from 'discord.js'
import { GatewayIntentBits } from '@discordjs/core'
import { createAudioPlayer } from '@discordjs/voice'
import { connectToVoiceChannel, createCacheDirIfNotExists, disconnectFromVoiceChannel, isGuildMember, log } from './utils.mjs'
import { initEncoder } from './encoder.mjs'
import { getUserConnectedHandler } from './handler.mjs'
import { VoiceChannelId } from './types.mjs'
import { insertTranscription, removeTranscription } from './state.mjs'

config()

const token = process.env.DISCORD_TOKEN!
const botName = process.env.BOT_NAME!

export const client = new Client({
  intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.Guilds],
})

client.on('ready', async () => {
  createCacheDirIfNotExists()
  initEncoder()

  assert(!!client.user, 'did not find user for bot')
  log(`Logged in as ${client.user.tag}!`)
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

    await interaction.reply('Discord STT | Starting transcription in your voice channel!')

    const targetTextChannel = interaction.channel as TextChannel
    const connection = await connectToVoiceChannel(voiceChannel)

    // Start transcription
    const handleUserConnected = getUserConnectedHandler(connection.receiver, targetTextChannel, voiceChannel)

    // store metadata for proper cleanup
    insertTranscription(voiceChannel, targetTextChannel, connection)

    connection.receiver.speaking.on('start', handleUserConnected)
    for (const [userId] of voiceChannel.members) {
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

    // disconnect and remove information about this interaction from local state
    removeTranscription(voiceChannel)
    await interaction.reply('Discord STT | Stopped transcription in your voice channel!')
  }
})

client.login(token)
