import { defaultVadConfig } from './constants.mjs'
import { Pcm16kMonoBuffer, VadConfig, VadFrameMetrics, VadStateSnapshot } from './types.mjs'

const MIN_DBFS = -100

function clampDb(value: number, min = -120, max = 0): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Computes normalized RMS amplitude [0, 1] and energy in dBFS [-120, 0]
 * for a 16kHz mono 16-bit signed little-endian PCM frame.
 */
export function computeFrameMetrics(frame: Pcm16kMonoBuffer): VadFrameMetrics {
  const sampleCount = Math.floor(frame.byteLength / 2)

  if (sampleCount === 0) {
    return { rms: 0, dbfs: MIN_DBFS }
  }

  let sumSquares = 0
  for (let offset = 0; offset + 1 < frame.byteLength; offset += 2) {
    const sample = frame.readInt16LE(offset) / 32768
    sumSquares += sample * sample
  }

  const rms = Math.min(1, Math.sqrt(sumSquares / sampleCount))
  const dbfs = rms > 1e-5 ? clampDb(20 * Math.log10(rms), MIN_DBFS, 0) : MIN_DBFS

  return { rms, dbfs }
}

/**
 * Creates a closure-based Voice Activity Detector (VAD) for a single speaker's
 * 16kHz mono PCM stream, using RMS dBFS energy, an adaptive noise floor, and
 * onset/sustain hysteresis with a configurable silence hangover timer.
 */
export function createVadProcessor(config: VadConfig = defaultVadConfig) {
  let noiseFloorDb = -55
  let isTalking = false
  let silentDurationMs = 0
  let voicedFrames = 0

  function resetUtterance() {
    isTalking = false
    silentDurationMs = 0
    voicedFrames = 0
  }

  function processFrame(frame: Pcm16kMonoBuffer | null): VadStateSnapshot {
    const metrics = frame ? computeFrameMetrics(frame) : { rms: 0, dbfs: MIN_DBFS }

    const onsetThresholdDb = Math.max(
      config.speechOnsetDb,
      noiseFloorDb + config.snrOnsetMarginDb
    )
    const sustainThresholdDb = Math.max(
      config.speechSustainDb,
      noiseFloorDb + config.snrSustainMarginDb
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
          (1 - config.noiseFloorAlpha) * noiseFloorDb + config.noiseFloorAlpha * metrics.dbfs
        noiseFloorDb = clampDb(updatedFloor, config.minNoiseFloorDb, config.maxNoiseFloorDb)
      }

      if (voicedFrames > 0) {
        silentDurationMs += config.frameDurationMs
      }
    }

    const silenceReached = voicedFrames > 0 && silentDurationMs >= config.silenceDurationMs
    if (silenceReached) {
      isTalking = false
    }

    const shouldTranscribe = silenceReached && voicedFrames >= config.minVoicedFrames
    const shouldReset = silenceReached && voicedFrames < config.minVoicedFrames

    return {
      isSpeechFrame,
      isTalking,
      dbfs: metrics.dbfs,
      noiseFloorDb,
      silentDurationMs,
      voicedFrames,
      shouldTranscribe,
      shouldReset,
    }
  }

  return {
    processFrame,
    resetUtterance,
    config,
  }
}
