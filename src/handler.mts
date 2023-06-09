import Opus from '@discordjs/opus'
import { AudioReceiveStream, VoiceReceiver } from '@discordjs/voice'
import assert from 'assert'
import { TextChannel, VoiceChannel } from 'discord.js'
import fs from 'fs'
import { client } from './app.mjs'
import { channels, chunkSize, frameDuration, minNoisyFrames, sampleRate } from './constants.mjs'
import { generateSilentOpusPacket } from './encoder.mjs'
import { insertUserToTranscription } from './state.mjs'
import { log, transcodeAndSave } from './utils.mjs'

const { OpusEncoder } = Opus

const startedBySpeaker = {}

function getSpeakerHashKey(voiceChannelId: string, username: string) {
  return `${voiceChannelId}:${username}`
}

export function getUserConnectedHandler(
  receiver: VoiceReceiver,
  targetTextChannel: TextChannel,
  voiceChannel: VoiceChannel
) {
  assert(!!client.user, 'did not find user for bot')
  const encoder = new OpusEncoder(sampleRate, channels)
  const silentOpusPacket = generateSilentOpusPacket(encoder)

  return async function handleUserConnected(userId: string) {
    const user = client.users.cache.get(userId)
    assert(user, 'did not find broadcasting user')
    const speakerHashKey = getSpeakerHashKey(voiceChannel.id, user.username)
    if (startedBySpeaker[speakerHashKey]) {
      return
    }
    startedBySpeaker[speakerHashKey] = true
    log(`listening to input from user ${user.username}`)

    // closure variables that represent the state for a given user
    let checkMissingPacketsInterval: NodeJS.Timer
    let packets: Buffer[] = []
    let bufferLength = 0
    let numNoisyFrames = 0 // the # of non-silent frames in a buffering period
    let lastPacketTimestamp = Date.now()
    let transcoding = false
    let talking = false
    let idx = 0
    let username: string | undefined
    let stream: AudioReceiveStream | undefined

    async function handlePacket(opusPacket) {
      talking = true
      numNoisyFrames++
      lastPacketTimestamp = Date.now()
      const decoded = encoder.decode(opusPacket)
      bufferLength += decoded.length
      packets.push(decoded)
    }

    stream = receiver.subscribe(userId)

    async function infer() {
      transcoding = true
      assert(user, 'did not find broadcasting user')
      log('transcoding and saving')
      const audioBuffer = Buffer.concat(packets)
      packets = []
      bufferLength = 0
      numNoisyFrames = 0
      const audioPath = `${user.username}_${idx++}_chunk.wav`
      await transcodeAndSave(audioBuffer, audioPath, user.username, targetTextChannel)
      transcoding = false
      fs.rmSync(`.app-cache/${audioPath}`)
    }

    checkMissingPacketsInterval = setInterval(async () => {
      // Check if no packet has been received for more than 20ms (assuming 48kHz sample rate and 960 samples per frame)
      if (Date.now() - lastPacketTimestamp > frameDuration) {
        // Insert a silent Opus packet
        const decoded = encoder.decode(silentOpusPacket)
        bufferLength += decoded.length
        packets.push(decoded)
      }

      if (Date.now() - lastPacketTimestamp > 800) {
        talking = false
      }

      if (bufferLength >= chunkSize && !transcoding && !talking && numNoisyFrames >= minNoisyFrames) {
        await infer()
      }
    }, frameDuration) // Check every 20ms

    function stop() {
      log(`$stopped listening to ${username} in ${targetTextChannel.name}`)
      startedBySpeaker[speakerHashKey] = undefined
      stream.off('data', handlePacket)
      stream.off('end', stop)
      clearInterval(checkMissingPacketsInterval)
    }

    insertUserToTranscription(voiceChannel, user.id, stop)

    stream.on('data', handlePacket)
    stream.on('end', stop)
  }
}
