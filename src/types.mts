import { VoiceConnection } from '@discordjs/voice'
import { z } from 'zod'

type Brand<T, B extends string> = T & { readonly __brand: B }

// External Discord & DB entity ID schemas (branded because all are string IDs that can be mixed up)
export const GuildIdSchema = z.string().min(1).brand<'GuildId'>()
export type GuildId = z.infer<typeof GuildIdSchema>

export const VoiceChannelIdSchema = z.string().min(1).brand<'VoiceChannelId'>()
export type VoiceChannelId = z.infer<typeof VoiceChannelIdSchema>

export const TextChannelIdSchema = z.string().min(1).brand<'TextChannelId'>()
export type TextChannelId = z.infer<typeof TextChannelIdSchema>

export const UserIdSchema = z.string().min(1).brand<'UserId'>()
export type UserId = z.infer<typeof UserIdSchema>

export const TranscriptionIdSchema = z.coerce.string().min(1).brand<'TranscriptionId'>()
export type TranscriptionId = z.infer<typeof TranscriptionIdSchema>

// Branded audio buffers (zero runtime overhead in the 20ms audio loop; prevents mixing Opus vs PCM buffers)
export type OpusPacket = Brand<Buffer, 'OpusPacket'>
export type Pcm16kMonoBuffer = Brand<Buffer, 'Pcm16kMonoBuffer'>

export function asOpusPacket(buf: Buffer): OpusPacket {
  return buf as OpusPacket
}

export function asPcm16kMono(buf: Buffer): Pcm16kMonoBuffer {
  return buf as Pcm16kMonoBuffer
}

// External environment configuration schemas
export const SttEngineSchema = z.enum(['whisper', 'nano-parakeet'])
export type SttEngine = z.infer<typeof SttEngineSchema>

export const WhisperModelSchema = z.enum([
  'tiny',
  'tiny.en',
  'base',
  'base.en',
  'small',
  'small.en',
  'medium',
  'medium.en',
  'large',
])
export type WhisperModel = z.infer<typeof WhisperModelSchema>

export const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1).optional(),
  DISCORD_APPLICATION_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  STT_ENGINE: SttEngineSchema.optional(),
  WHISPER_MODEL: WhisperModelSchema.optional(),
  PARAKEET_MODEL: z.string().min(1).optional(),
  PYTHON_COMMAND: z.string().min(1).optional(),
})
export type Env = z.infer<typeof EnvSchema>

// External Python STT worker stdout JSON schemas
export const WhisperSegmentSchema = z.object({
  no_speech_prob: z.number().min(0).max(1),
})
export type WhisperSegment = z.infer<typeof WhisperSegmentSchema>

export const WhisperOutputSchema = z.object({
  ok: z.literal(true),
  text: z.string(),
  segments: z.array(WhisperSegmentSchema).default([]),
})
export type WhisperOutput = z.infer<typeof WhisperOutputSchema>

export const WhisperWorkerErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
})

export const WhisperWorkerResponseSchema = z.discriminatedUnion('ok', [
  WhisperOutputSchema,
  WhisperWorkerErrorSchema,
])
export type WhisperWorkerResponse = z.infer<typeof WhisperWorkerResponseSchema>

// External PostgreSQL row schema
export const TranscriptionRecordSchema = z.object({
  id: TranscriptionIdSchema,
  guildId: GuildIdSchema,
  voiceChannelId: VoiceChannelIdSchema,
  textChannelId: TextChannelIdSchema,
  userId: UserIdSchema,
  username: z.string(),
  content: z.string(),
  createdAt: z.coerce.date(),
})
export type TranscriptionRecord = z.infer<typeof TranscriptionRecordSchema>

// Internal application types (no Zod needed)
export interface VadConfig {
  frameDurationMs: number
  speechOnsetDb: number
  speechSustainDb: number
  snrOnsetMarginDb: number
  snrSustainMarginDb: number
  minNoiseFloorDb: number
  maxNoiseFloorDb: number
  noiseFloorAlpha: number
  silenceDurationMs: number
  minVoicedFrames: number
  preRollFrames: number
}

export interface VadFrameMetrics {
  rms: number
  dbfs: number
}

export interface VadStateSnapshot {
  isSpeechFrame: boolean
  isTalking: boolean
  dbfs: number
  noiseFloorDb: number
  silentDurationMs: number
  voicedFrames: number
  shouldTranscribe: boolean
  shouldReset: boolean
}

export interface SpeakerContext {
  guildId: GuildId
  voiceChannelId: VoiceChannelId
  userId: UserId
  username: string
}

export interface NewTranscriptionRecord {
  guildId: GuildId
  voiceChannelId: VoiceChannelId
  textChannelId: TextChannelId
  userId: UserId
  username: string
  content: string
}

export interface TranscriptionMetadata {
  voiceChannelId: VoiceChannelId
  textChannelId: TextChannelId
  users: Map<UserId, () => void>
  connection: VoiceConnection
  onSpeakingStart?: (userId: string) => void
}
