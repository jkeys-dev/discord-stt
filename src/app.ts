require('dotenv').config()

const { Client } = require('discord.js')
import { REST } from '@discordjs/rest'
import { GatewayIntentBits } from '@discordjs/core'
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
} from '@discordjs/voice'
const { OpusEncoder } = require('@discordjs/opus')
import { spawn } from 'child_process'
const ffmpeg = require('fluent-ffmpeg')
const { Readable } = require('stream')
const fs = require('fs')
const { rimraf } = require('rimraf')

try {
  fs.mkdirSync('./.app-cache')
} catch (e: any) {
  if (!fs.existsSync('./.app-cache')) {
    throw new Error('could not create .app-cache folder and it does not exist')
  }
}

const token = process.env.DISCORD_TOKEN!
const targetVoiceChannelId = process.env.TARGET_VOICE_CHANNEL_ID!
const targetTextChannelId = process.env.TARGET_TEXT_CHANNEL_ID!

const sampleRate = 48000
const frameDuration = 20
const channels = 1
const bytesPerSample = 2

const chunkDuration = 5 // seconds
const chunkSize = chunkDuration * sampleRate * channels * bytesPerSample

const client = new Client({
  intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.Guilds],
})

function generateSilentOpusPacket(encoder: any) {
  // 960 samples of silence in a 48kHz, 2-channel PCM buffer
  // const silentPcmChunk = Buffer.alloc(960 * 2 * 2, 0);
  // 480 samples of silence in a 48kHz, 1-channel PCM buffer
  const silentPcmChunk = Buffer.alloc(480 * 2 * 2, 0)

  // Encode the silent PCM buffer as an Opus packet
  const silentOpusPacket = encoder.encode(silentPcmChunk)

  return silentOpusPacket
}

let targetTextChannel
let transcodingByUser = {}
let startedBySpeaker = {}

async function transcodeAndSave(buffer: Buffer, outputFile, user: string) {
  const path = `.app-cache/${outputFile}`
  if (transcodingByUser[user]) {
    console.warn('already transcoding for user, discarding buffer')
    return
  }

  transcodingByUser[user] = true

  await rimraf(`${outputFile.split(0)}.json`)

  await new Promise((resolve, reject) => {
    return ffmpeg(Readable.from(buffer))
      .inputFormat('s16le')
      .audioBitrate('16k')
      .saveToFile(path)
      .on('end', resolve)
      .on('error', reject)
  })

  const args = [
    '--output_dir',
    './.app-cache',
    '--language',
    'en',
    '--task',
    'transcribe',
    '--model',
    'base.en',
    '--output_format',
    'json',
    path,
  ]

  await new Promise((resolve, reject) => {
    return spawn('whisper', args, { shell: true })
      .on('exit', resolve)
      .on('error', reject)
  })

  const resultPath = `.app-cache/${outputFile.split('.')[0]}.json`
  const json = await JSON.parse(fs.readFileSync(resultPath, 'utf-8'))

  const avgNoSpeechProb = json.segments
    .map((seg) => seg.no_speech_prob)
    .reduce((sum, val) => sum + val, 0.0)

  if (avgNoSpeechProb > 0.6) {
    console.log('probably not speaking, not sending to channel')
  } else {
    const formattedDate = new Date().toISOString()
    await targetTextChannel.send({
      content: `${user}: ${json.text}\n @ ${formattedDate}`,
      tts: false,
    })
  }

  transcodingByUser[user] = false
}

async function connectToVoiceChannel(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  })

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20e3)
    return connection
  } catch (err) {
    console.error('failed to connect to voice channel')
    connection.destroy()
    throw err
  }
}

client.on('ready', async () => {
  if (!client.user) {
    throw new Error('did not find user for bot')
  }

  console.log(`Logged in as ${client.user.tag}!`)

  const targetChannel = client.channels.cache.get(targetVoiceChannelId)
  targetTextChannel = client.channels.cache.get(targetTextChannelId)
  if (!targetChannel /* || targetChannel.type !== 'GUILD_VOICE' */) {
    console.log('Error: Target channel not found or not a voice channel')
    return
  }

  const connection = await connectToVoiceChannel(targetChannel)

  const audioPlayer = createAudioPlayer()
  connection.subscribe(audioPlayer)

  connection.on('stateChange', (oldState: any, newState: any) => {
    console.log(
      `Connection state changed from ${oldState.status} to ${newState.status}`
    )
  })
  connection.on('error', console.warn)

  const receiver = connection.receiver
  receiver.speaking.on('start', async (userId) => {
    const user = client.users.cache.get(userId)
    if (startedBySpeaker[user.username]) {
      return
    }
    startedBySpeaker[user.username] = true
    console.log(`listening to input from user ${user.username}`)

    const stream = receiver.subscribe(userId)
    const opusDecoder = new OpusEncoder(sampleRate, channels) // 48kHz sample rate, 2 channels
    let checkMissingPacketsInterval
    let buffer = Buffer.alloc(0)
    let lastPacketTimestamp = Date.now()
    let transcoding = false
    let talking = false
    let idx = 0

    await opusDecoder.ready

    const silentOpusPacket = generateSilentOpusPacket(opusDecoder)

    checkMissingPacketsInterval = setInterval(async () => {
      // Check if no packet has been received for more than 20ms (assuming 48kHz sample rate and 960 samples per frame)
      if (Date.now() - lastPacketTimestamp > 20) {
        // Insert a silent Opus packet
        const decoded = opusDecoder.decode(silentOpusPacket)
        buffer = Buffer.concat([buffer, decoded])
      }

      // update the flag
      if (Date.now() - lastPacketTimestamp > 500) {
        talking = false
      }

      const bufferSize = buffer.length
      if (bufferSize >= chunkSize && !transcoding && !talking) {
        transcoding = true
        console.log('transcoding and saving')
        const copy = Buffer.concat([buffer])
        buffer = Buffer.alloc(0)
        await transcodeAndSave(
          copy,
          `${user.username}_${idx++}_chunk.wav`,
          user.username
        )
        transcoding = false
      }
    }, 20) // Check every 20ms

    stream.on('data', async (opusPacket) => {
      talking = true
      lastPacketTimestamp = Date.now()
      const decoded = opusDecoder.decode(opusPacket)
      buffer = Buffer.concat([buffer, decoded])
      // console.log(`Received ${decoded.length} bytes of audio from ${user.username}`)

      const bufferSize = buffer.length
      if (bufferSize >= chunkSize && !transcoding && !talking) {
        transcoding = true
        console.log('transcoding and saving')
        const copy = Buffer.concat([buffer])
        buffer = Buffer.alloc(0)
        await transcodeAndSave(
          copy,
          `${user.username}_${idx++}_chunk.wav`,
          user.username
        )
        transcoding = false
      }
      // Process the audio chunk, e.g., send it to the Whisper ASR API for transcription.
    })
    stream.on('end', () => {
      console.log(`${user.username}'s audio stream has ended`)
    })
  })
})

client.login(token)
