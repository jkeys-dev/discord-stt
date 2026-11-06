import { AudioReceiveStream, VoiceReceiver } from '@discordjs/voice'
import assert from 'assert'
import { TextChannel, VoiceChannel } from 'discord.js'
import OpusScript from 'opusscript'
import { client } from './app.mjs'
import { channels, frameDuration, maxChunkSize, sampleRate } from './constants.mjs'
import { generateSilentPcmFrame } from './encoder.mjs'
import {
  hasUserInTranscription,
  insertUserToTranscription,
  removeUserFromTranscription,
} from './state.mjs'
import {
  GuildIdSchema,
  OpusPacketSchema,
  Pcm16kMonoBuffer,
  Pcm16kMonoBufferSchema,
  SpeakerContextSchema,
  UserIdSchema,
  UsernameSchema,
  VadStateSnapshot,
  VoiceChannelIdSchema,
} from './types.mjs'
import { error, log, transcodeAndSave } from './utils.mjs'
import { createVadProcessor } from './vad.mjs'

export function getUserConnectedHandler(
  receiver: VoiceReceiver,
  targetTextChannel: TextChannel,
  voiceChannel: VoiceChannel
) {
  assert(!!client.user, 'did not find user for bot')
  const voiceChannelId = VoiceChannelIdSchema.parse(voiceChannel.id)
  const guildId = GuildIdSchema.parse(voiceChannel.guild.id)

  // Decode Opus directly to 16kHz mono 16-bit signed little-endian PCM via WASM OpusScript
  const encoder = new OpusScript(sampleRate, channels, OpusScript.Application.VOIP)
  const silentPcmFrame = generateSilentPcmFrame()

  return async function handleUserConnected(rawUserId: string) {
    const userId = UserIdSchema.parse(rawUserId)
    if (hasUserInTranscription(voiceChannelId, userId)) {
      return
    }

    const user =
      client.users.cache.get(userId) ?? (await client.users.fetch(userId).catch(() => undefined))
    if (!user || user.bot) {
      return
    }

    if (hasUserInTranscription(voiceChannelId, userId)) {
      return
    }

    const username = UsernameSchema.parse(user.username)
    const speaker = SpeakerContextSchema.parse({
      guildId,
      voiceChannelId,
      userId,
      username,
    })

    log(`listening to input from user ${username}`)

    // closure variables that represent the state for a given user
    const vad = createVadProcessor()
    let preRoll: Pcm16kMonoBuffer[] = []
    let packets: Pcm16kMonoBuffer[] = []
    let bufferLength = 0
    let lastPacketTimestamp = Date.now()
    let transcoding = false
    let stopped = false
    const stream: AudioReceiveStream = receiver.subscribe(userId)

    function clearUtteranceBuffer() {
      packets = []
      bufferLength = 0
      preRoll = []
      vad.resetUtterance()
    }

    async function infer() {
      if (transcoding || packets.length === 0) {
        return
      }
      transcoding = true
      const audioBuffer = Pcm16kMonoBufferSchema.parse(Buffer.concat(packets))
      clearUtteranceBuffer()

      try {
        log(`transcribing 16kHz mono PCM for ${username} (${audioBuffer.byteLength} bytes)`)
        await transcodeAndSave(audioBuffer, speaker, targetTextChannel)
      } catch (err) {
        error(`transcription failed for ${username}`, err)
      } finally {
        transcoding = false
      }
    }

    function evaluateVadDecision(vadState: VadStateSnapshot) {
      if ((vadState.shouldTranscribe || bufferLength >= maxChunkSize) && !transcoding) {
        void infer()
      } else if (vadState.shouldReset) {
        clearUtteranceBuffer()
      }
    }

    function handlePacket(rawOpusPacket: Buffer) {
      try {
        const opusPacket = OpusPacketSchema.parse(rawOpusPacket)
        const decoded = Pcm16kMonoBufferSchema.parse(encoder.decode(opusPacket))
        lastPacketTimestamp = Date.now()

        const vadState = vad.processFrame(decoded)

        if (vadState.voicedFrames > 0) {
          if (preRoll.length > 0) {
            for (const preFrame of preRoll) {
              packets.push(preFrame)
              bufferLength += preFrame.length
            }
            preRoll = []
          }

          packets.push(decoded)
          bufferLength += decoded.length
          evaluateVadDecision(vadState)
        } else {
          preRoll.push(decoded)
          if (preRoll.length > vad.config.preRollFrames) {
            preRoll.shift()
          }
        }
      } catch (err) {
        error(`failed to decode opus packet from ${username}`, err)
      }
    }

    const checkMissingPacketsInterval = setInterval(() => {
      const elapsed = Date.now() - lastPacketTimestamp

      // When Discord's client gate stops transmitting packets during silence,
      // feed a packet-silence tick into the VAD processor every 20ms.
      if (elapsed > frameDuration) {
        const vadState = vad.processFrame(null)

        if (vadState.voicedFrames > 0) {
          packets.push(silentPcmFrame)
          bufferLength += silentPcmFrame.length
          evaluateVadDecision(vadState)
        }
      }
    }, frameDuration)

    function stop() {
      if (stopped) {
        return
      }
      stopped = true
      log(`stopped listening to ${username} in ${targetTextChannel.name}`)
      removeUserFromTranscription(voiceChannelId, userId)
      clearInterval(checkMissingPacketsInterval)
      stream.off('data', handlePacket)
      stream.off('end', stop)
      stream.off('close', stop)
      stream.destroy()
    }

    insertUserToTranscription(voiceChannelId, userId, stop)

    stream.on('data', handlePacket)
    stream.on('end', stop)
    stream.on('close', stop)
    stream.on('error', (err) => {
      error(`audio stream error for ${username}`, err)
    })
  }
}
