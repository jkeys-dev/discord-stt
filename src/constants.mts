export const sampleRate = 48000
export const frameDuration = 20
export const channels = 1
export const bytesPerSample = 2
export const chunkDuration = 5 // seconds
export const chunkSize = chunkDuration * sampleRate * channels * bytesPerSample

export const modelSize = 'base.en'

// the minimum number of frames that are non-silent in order to transcribe
export const minNoisyFrames = 50
