import { config } from 'dotenv'
config()

import assert from 'assert'
import { Client } from 'discord.js'
import { GatewayIntentBits } from '@discordjs/core'
import { createAudioPlayer } from '@discordjs/voice'
import { connectToVoiceChannel, createCacheDirIfNotExists, log } from './utils.mjs'
import { initEncoder } from './encoder.mjs'
import { getUserConnectedHandler } from './handler.mjs'

const token = process.env.DISCORD_TOKEN!
const targetVoiceChannelId = process.env.TARGET_VOICE_CHANNEL_ID!
const targetTextChannelId = process.env.TARGET_TEXT_CHANNEL_ID!

export const client = new Client({
  intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.Guilds],
})

client.on('ready', async () => {
  createCacheDirIfNotExists()
  initEncoder()
  
  assert(!!client.user, 'did not find user for bot')
  log(`Logged in as ${client.user.tag}!`)

  const targetVoiceChannel = client.channels.cache.get(targetVoiceChannelId)
  const targetTextChannel = client.channels.cache.get(targetTextChannelId)
  assert(!!targetVoiceChannel, 'target voice channel id not found')

  const connection = await connectToVoiceChannel(targetVoiceChannel)
  const audioPlayer = createAudioPlayer()
  const { receiver } = connection

  connection.subscribe(audioPlayer)
  connection.on('error', console.error)
  receiver.speaking.on('start', getUserConnectedHandler(receiver, targetTextChannel))
})

client.login(token)
