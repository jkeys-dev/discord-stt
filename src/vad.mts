import { defaultVadConfig } from './constants.mjs'
import {
  DecibelsFsSchema,
  FrameCountSchema,
  MillisecondsSchema,
  Pcm16kMonoBuffer,
  Pcm16kMonoBufferSchema,
  RmsAmplitudeSchema,
  VadConfig,
  VadConfigSchema,
  VadFrameMetrics,
  VadFrameMetricsSchema,
  VadStateSnapshot,
  VadStateSnapshotSchema,
} from './types.mjs'

const MIN_DBFS = -100

function clampDb(value: number, min = -120, max = 0): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Computes normalized RMS amplitude [0, 1] and energy in dBFS [-120, 0]
 * for a 16kHz mono 16-bit signed little-endian PCM frame.
 */
export function computeFrameMetrics(frame: Pcm16kMonoBuffer): VadFrameMetrics {
  const validFrame = Pcm16kMonoBufferSchema.parse(frame)
  const sampleCount = validFrame.byteLength / 2

  if (sampleCount === 0) {
    return VadFrameMetricsSchema.parse({
      rms: RmsAmplitudeSchema.parse(0),
      dbfs: DecibelsFsSchema.parse(MIN_DBFS),
    })
  }

  let sumSquares = 0
  for (let offset = 0; offset < validFrame.byteLength; offset += 2) {
    const sample = validFrame.readInt16LE(offset) / 32768
    sumSquares += sample * sample
  }

  const rms = Math.min(1, Math.sqrt(sumSquares / sampleCount))
  const dbfs = rms > 1e-5 ? clampDb(20 * Math.log10(rms), MIN_DBFS, 0) : MIN_DBFS

  return VadFrameMetricsSchema.parse({
    rms: RmsAmplitudeSchema.parse(rms),
    dbfs: DecibelsFsSchema.parse(dbfs),
  })
}

/**
 * Creates a closure-based Voice Activity Detector (VAD) for a single speaker's
 * 16kHz mono PCM stream, using RMS dBFS energy, an adaptive noise floor, and
 * onset/sustain hysteresis with a configurable silence hangover timer.
 */
export function createVadProcessor(config: VadConfig = defaultVadConfig) {
  const cfg = VadConfigSchema.parse(config)

  let noiseFloorDb: number = -55
  let isTalking = false
  let silentDurationMs = 0
  let voicedFrames = 0

  function resetUtterance() {
    isTalking = false
    silentDurationMs = 0
    voicedFrames = 0
  }

  function processFrame(frame: Pcm16kMonoBuffer | null): VadStateSnapshot {
    const metrics = frame
      ? computeFrameMetrics(frame)
      : { rms: RmsAmplitudeSchema.parse(0), dbfs: DecibelsFsSchema.parse(MIN_DBFS) }

    const onsetThresholdDb = Math.max(
      cfg.speechOnsetDb,
      noiseFloorDb + cfg.snrOnsetMarginDb
    )
    const sustainThresholdDb = Math.max(
      cfg.speechSustainDb,
      noiseFloorDb + cfg.snrSustainMarginDb
    )

    const activeThresholdDb = isTalking ? sustainThresholdDb : onsetThresholdDb
    const isSpeechFrame = metrics.dbfs >= activeThresholdDb

    if (isSpeechFrame) {
      isTalking = true
      silentDurationMs = 0
      voicedFrames++
    } else {
      // Update adaptive noise floor during non-speech acoustic frames
      if (frame && metrics.dbfs > MIN_DBFS) {
        const updatedFloor =
          (1 - cfg.noiseFloorAlpha) * noiseFloorDb + cfg.noiseFloorAlpha * metrics.dbfs
        noiseFloorDb = clampDb(updatedFloor, cfg.minNoiseFloorDb, cfg.maxNoiseFloorDb)
      }

      if (voicedFrames > 0) {
        silentDurationMs += cfg.frameDurationMs
      }
    }

    const silenceReached = voicedFrames > 0 && silentDurationMs >= cfg.silenceDurationMs
    if (silenceReached) {
      isTalking = false
    }

    const shouldTranscribe = silenceReached && voicedFrames >= cfg.minVoicedFrames
    const shouldReset = silenceReached && voicedFrames < cfg.minVoicedFrames

    return VadStateSnapshotSchema.parse({
      isSpeechFrame,
      isTalking,
      dbfs: metrics.dbfs,
      noiseFloorDb: DecibelsFsSchema.parse(noiseFloorDb),
      silentDurationMs: MillisecondsSchema.parse(silentDurationMs),
      voicedFrames: FrameCountSchema.parse(voicedFrames),
      shouldTranscribe,
      shouldReset,
    })
  }

  return {
    processFrame,
    resetUtterance,
    config: cfg,
  }
}
