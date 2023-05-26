import { OpusEncoder } from '@discordjs/opus'

export function generateSilentOpusPacket(encoder: OpusEncoder) {
  // 960 samples of silence in a 48kHz, 1-channel PCM buffer
  const silentPcmChunk = Buffer.alloc(960 * 1 * 2, 0)

  // Encode the silent PCM buffer as an Opus packet
  const silentOpusPacket = encoder.encode(silentPcmChunk)

  return silentOpusPacket
}
