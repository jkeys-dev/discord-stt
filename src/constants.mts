import {
  DecibelsFsSchema,
  FrameCountSchema,
  MillisecondsSchema,
  VadConfig,
  VadConfigSchema,
  WhisperModel,
  WhisperModelSchema,
} from './types.mjs'

export const sampleRate = 16000
export const frameDuration = 20 // ms
export const samplesPerFrame = (sampleRate * frameDuration) / 1000 // 320 samples per 20ms frame at 16kHz
export const channels = 1
export const bytesPerSample = 2
export const frameByteLength = samplesPerFrame * channels * bytesPerSample // 640 bytes per 20ms frame
export const chunkDuration = 5 // seconds
export const chunkSize = chunkDuration * sampleRate * channels * bytesPerSample // 160,000 bytes
export const maxChunkDuration = 20 // seconds max utterance length before forced flush
export const maxChunkSize = maxChunkDuration * sampleRate * channels * bytesPerSample // 640,000 bytes

export const modelSize: WhisperModel = WhisperModelSchema.parse('base.en')

// the minimum number of frames that are non-silent in order to transcribe
export const minNoisyFrames = 15 // 300ms of voiced frames

export const defaultVadConfig: VadConfig = VadConfigSchema.parse({
  frameDurationMs: MillisecondsSchema.parse(frameDuration),
  speechOnsetDb: DecibelsFsSchema.parse(-42),
  speechSustainDb: DecibelsFsSchema.parse(-47),
  snrOnsetMarginDb: 10,
  snrSustainMarginDb: 6,
  minNoiseFloorDb: DecibelsFsSchema.parse(-65),
  maxNoiseFloorDb: DecibelsFsSchema.parse(-35),
  noiseFloorAlpha: 0.03,
  silenceDurationMs: MillisecondsSchema.parse(800),
  minVoicedFrames: FrameCountSchema.parse(minNoisyFrames),
  preRollFrames: FrameCountSchema.parse(10),
})
