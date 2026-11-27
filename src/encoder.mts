import OpusScript from 'opusscript'
import { frameByteLength, samplesPerFrame } from './constants.mjs'
import { OpusPacket, Pcm16kMonoBuffer, asOpusPacket, asPcm16kMono } from './types.mjs'

export function generateSilentPcmFrame(): Pcm16kMonoBuffer {
  // 320 samples of silence in a 16kHz, 1-channel 16-bit PCM buffer (640 bytes)
  return asPcm16kMono(Buffer.alloc(frameByteLength, 0))
}

export function generateSilentOpusPacket(encoder: OpusScript): OpusPacket {
  const silentPcmChunk = generateSilentPcmFrame()
  return asOpusPacket(encoder.encode(silentPcmChunk, samplesPerFrame))
}
