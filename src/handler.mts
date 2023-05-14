import { VoiceReceiver } from '@discordjs/voice'
import { chunkSize, frameDuration } from './constants.mjs'
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
    let buffer = Buffer.alloc(0)
    let lastPacketTimestamp = Date.now()
    let transcoding = false
    let talking = false
    let idx = 0

    async function infer() {
      transcoding = true
      assert(user, 'did not find broadcasting user')
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
  }
}
