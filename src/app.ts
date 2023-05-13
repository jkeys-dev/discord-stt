import { config } from 'dotenv'
config()

import assert from 'assert'
import { Client } from 'discord.js'
import { GatewayIntentBits } from '@discordjs/core'
import { createAudioPlayer } from '@discordjs/voice'
import {
  connectToVoiceChannel,
  createCacheDirIfNotExists,
  log,
  transcodeAndSave,
} from './utils.mjs'
import { chunkSize, frameDuration } from './constants.mjs'
import { initEncoder, getEncoder, generateSilentOpusPacket } from './encoder.mjs'

createCacheDirIfNotExists()
initEncoder()

let targetTextChannel
const token = process.env.DISCORD_TOKEN!
const targetVoiceChannelId = process.env.TARGET_VOICE_CHANNEL_ID!
const targetTextChannelId = process.env.TARGET_TEXT_CHANNEL_ID!
const startedBySpeaker = {}
const silentOpusPacket = generateSilentOpusPacket()

const client = new Client({
  intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.Guilds],
})

client.on('ready', async () => {
  assert(!!client.user, 'did not find user for bot')
  log(`Logged in as ${client.user.tag}!`)

  const targetChannel = client.channels.cache.get(targetVoiceChannelId)
  targetTextChannel = client.channels.cache.get(targetTextChannelId)
  assert(!!targetChannel, 'target voice channel id not found')

  const connection = await connectToVoiceChannel(targetChannel)
  const audioPlayer = createAudioPlayer()

  connection.subscribe(audioPlayer)
  connection.on('error', console.error)
  connection.on('stateChange', (oldState: any, newState: any) => {
    log(`Connection state changed from ${oldState.status} to ${newState.status}`)
  })

  const receiver = connection.receiver
  receiver.speaking.on('start', async (userId) => {
    const user = client.users.cache.get(userId)
    if (startedBySpeaker[user.username]) {
      return
    }
    startedBySpeaker[user.username] = true
    log(`listening to input from user ${user.username}`)

    const stream = receiver.subscribe(userId)

    let checkMissingPacketsInterval: NodeJS.Timer
    let buffer = Buffer.alloc(0)
    let lastPacketTimestamp = Date.now()
    let transcoding = false
    let talking = false
    let idx = 0

    async function infer() {
      transcoding = true
      log('transcoding and saving')
      const copy = Buffer.concat([buffer])
      buffer = Buffer.alloc(0)
      await transcodeAndSave(copy, `${user.username}_${idx++}_chunk.wav`, user.username, targetTextChannel)
      transcoding = false
    }

    checkMissingPacketsInterval = setInterval(async () => {
      // Check if no packet has been received for more than 20ms (assuming 48kHz sample rate and 960 samples per frame)
      if (Date.now() - lastPacketTimestamp > frameDuration) {
        // Insert a silent Opus packet
        const decoded = getEncoder().decode(silentOpusPacket)
        buffer = Buffer.concat([buffer, decoded])
      }

      if (Date.now() - lastPacketTimestamp > 500) {
        talking = false
      }

      if (buffer.length >= chunkSize && !transcoding && !talking) {
        await infer()
      }
    }, frameDuration) // Check every 20ms

    stream.on('data', async (opusPacket) => {
      talking = true
      lastPacketTimestamp = Date.now()
      const decoded = getEncoder().decode(opusPacket)
      buffer = Buffer.concat([buffer, decoded])
      if (buffer.length >= chunkSize && !transcoding && !talking) {
        await infer()
      }
    })
    stream.on('end', () => {
      log(`${user.username}'s audio stream has ended`)
      clearInterval(checkMissingPacketsInterval)
      startedBySpeaker[user.username] = false
    })
  })
})

client.login(token)
