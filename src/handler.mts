import { VoiceReceiver } from '@discordjs/voice'
import { chunkSize, frameDuration, minNoisyFrames } from './constants.mjs'
import { client } from './app.mjs'
import assert from 'assert'
import { log, transcodeAndSave } from './utils.mjs'
import { generateSilentOpusPacket, getEncoder } from './encoder.mjs'

const startedBySpeaker = {}

export function getUserConnectedHandler(receiver: VoiceReceiver, targetTextChannel: any) {
  assert(!!client.user, 'did not find user for bot')
  const silentOpusPacket = generateSilentOpusPacket()

  return async function handleUserConnected(userId: string) {
    const user = client.users.cache.get(userId)
    assert(user, 'did not find broadcasting user')
    if (startedBySpeaker[user.username]) {
      return
    }
    startedBySpeaker[user.username] = true
    log(`listening to input from user ${user.username}`)

    const stream = receiver.subscribe(userId)

    let checkMissingPacketsInterval: NodeJS.Timer
    let packets: Buffer[] = []
    let bufferLength = 0
    let numNoisyFrames = 0 // the # of non-silent frames in a buffering period
    let lastPacketTimestamp = Date.now()
    let transcoding = false
    let talking = false
    let idx = 0

    async function infer() {
      transcoding = true
      assert(user, 'did not find broadcasting user')
      log('transcoding and saving')
      const audioBuffer = Buffer.concat(packets)
      packets = []
      bufferLength = 0
      numNoisyFrames = 0
      await transcodeAndSave(audioBuffer, `${user.username}_${idx++}_chunk.wav`, user.username, targetTextChannel)
      transcoding = false
    }

    checkMissingPacketsInterval = setInterval(async () => {
      // Check if no packet has been received for more than 20ms (assuming 48kHz sample rate and 960 samples per frame)
      if (Date.now() - lastPacketTimestamp > frameDuration) {
        // Insert a silent Opus packet
        const decoded = getEncoder().decode(silentOpusPacket)
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

    stream.on('data', async (opusPacket) => {
      talking = true
      numNoisyFrames++
      lastPacketTimestamp = Date.now()
      const decoded = getEncoder().decode(opusPacket)
      bufferLength += decoded.length
      packets.push(decoded)
    })

    stream.on('end', () => {
      log(`${user.username}'s audio stream has ended`)
      clearInterval(checkMissingPacketsInterval)
      startedBySpeaker[user.username] = false
    })
  }
}
