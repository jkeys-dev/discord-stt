import OpusScript from 'opusscript'
import { frameByteLength, samplesPerFrame } from './constants.mjs'
import { OpusPacket, OpusPacketSchema, Pcm16kMonoBuffer, Pcm16kMonoBufferSchema } from './types.mjs'

export function generateSilentPcmFrame(): Pcm16kMonoBuffer {
  // 320 samples of silence in a 16kHz, 1-channel 16-bit PCM buffer (640 bytes)
  return Pcm16kMonoBufferSchema.parse(Buffer.alloc(frameByteLength, 0))
}

export function generateSilentOpusPacket(encoder: OpusScript): OpusPacket {
  const silentPcmChunk = generateSilentPcmFrame()
  return OpusPacketSchema.parse(encoder.encode(silentPcmChunk, samplesPerFrame))
}
