import { config } from 'dotenv'
import assert from 'assert'
import { Client, TextChannel, VoiceChannel } from 'discord.js'
import { GatewayIntentBits } from '@discordjs/core'
import { createAudioPlayer } from '@discordjs/voice'
import { connectToVoiceChannel, createCacheDirIfNotExists, isGuildMember, log } from './utils.mjs'
import { initEncoder } from './encoder.mjs'
import { getUserConnectedHandler } from './handler.mjs'
import { VoiceChannelId } from './types.mjs'
import { insertTranscription, removeTranscription } from './state.mjs'

config()

const token = process.env.DISCORD_TOKEN!

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

    const connection = await connectToVoiceChannel(voiceChannel)
    const { receiver } = connection

    // Get the text channel where the command was issued
    const targetTextChannel = interaction.channel as TextChannel

    // Start transcription
    const handleUserConnected = getUserConnectedHandler(receiver, targetTextChannel, voiceChannel)

    await insertTranscription(voiceChannel, targetTextChannel)

    receiver.speaking.on('start', handleUserConnected)
    for (const [userId] of voiceChannel.members) {
      handleUserConnected(userId)
    }

  } else if (commandName === 'end') {
    // Get the voice channel of the user who sent the command
    if (!isGuildMember(interaction.member)) {
      return
    }

    const voiceChannel = interaction.member.voice.channel as VoiceChannel

    if (!voiceChannel) {
      await interaction.reply('Discord STT | Please join a voice channel first!')
      return
    }

    await removeTranscription(voiceChannel)
    await interaction.reply('Discord STT | Stopped transcription in your voice channel!')
  }
})

client.login(token)
