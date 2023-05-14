import Opus from '@discordjs/opus'
import assert from 'assert'
import { channels, sampleRate } from './constants.mjs'

const { OpusEncoder } = Opus

let _encoder: Opus.OpusEncoder | undefined

export function initEncoder() {
  assert(!_encoder, 'encoder already created')
  _encoder = new OpusEncoder(sampleRate, channels)
  return _encoder
}

export function getEncoder() {
  assert(!!_encoder, 'encoder not defined')
  return _encoder
}

export function generateSilentOpusPacket() {
  // 960 samples of silence in a 48kHz, 1-channel PCM buffer
  const silentPcmChunk = Buffer.alloc(960 * 1 * 2, 0)

  // Encode the silent PCM buffer as an Opus packet
  const silentOpusPacket = getEncoder().encode(silentPcmChunk)

  return silentOpusPacket
}
