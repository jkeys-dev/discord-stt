import { VoiceConnection } from '@discordjs/voice'
import { z } from 'zod'

// Branded primitive & identifier schemas
export const GuildIdSchema = z.string().min(1).brand<'GuildId'>()
export type GuildId = z.infer<typeof GuildIdSchema>

export const VoiceChannelIdSchema = z.string().min(1).brand<'VoiceChannelId'>()
export type VoiceChannelId = z.infer<typeof VoiceChannelIdSchema>

export const TextChannelIdSchema = z.string().min(1).brand<'TextChannelId'>()
export type TextChannelId = z.infer<typeof TextChannelIdSchema>

export const UserIdSchema = z.string().min(1).brand<'UserId'>()
export type UserId = z.infer<typeof UserIdSchema>

export const UsernameSchema = z.string().min(1).brand<'Username'>()
export type Username = z.infer<typeof UsernameSchema>

export const TranscriptionIdSchema = z.coerce.string().min(1).brand<'TranscriptionId'>()
export type TranscriptionId = z.infer<typeof TranscriptionIdSchema>

export const TranscriptTextSchema = z.string().trim().min(1).brand<'TranscriptText'>()
export type TranscriptText = z.infer<typeof TranscriptTextSchema>

// Branded audio buffer schemas (16kHz mono s16le PCM & Opus packets)
export const OpusPacketSchema = z.instanceof(Buffer).brand<'OpusPacket'>()
export type OpusPacket = z.infer<typeof OpusPacketSchema>

export const Pcm16kMonoBufferSchema = z
  .instanceof(Buffer)
  .refine(
    (buf) => buf.byteLength % 2 === 0,
    '16kHz mono s16le PCM buffer must have an even byte length'
  )
  .brand<'Pcm16kMonoBuffer'>()
export type Pcm16kMonoBuffer = z.infer<typeof Pcm16kMonoBufferSchema>

// Branded VAD schemas
export const RmsAmplitudeSchema = z.number().min(0).max(1).brand<'RmsAmplitude'>()
export type RmsAmplitude = z.infer<typeof RmsAmplitudeSchema>

export const DecibelsFsSchema = z.number().min(-120).max(0).brand<'DecibelsFs'>()
export type DecibelsFs = z.infer<typeof DecibelsFsSchema>

export const MillisecondsSchema = z.number().int().nonnegative().brand<'Milliseconds'>()
export type Milliseconds = z.infer<typeof MillisecondsSchema>

export const FrameCountSchema = z.number().int().nonnegative().brand<'FrameCount'>()
export type FrameCount = z.infer<typeof FrameCountSchema>

export const VadConfigSchema = z
  .object({
    frameDurationMs: MillisecondsSchema,
    speechOnsetDb: DecibelsFsSchema,
    speechSustainDb: DecibelsFsSchema,
    snrOnsetMarginDb: z.number().positive(),
    snrSustainMarginDb: z.number().positive(),
    minNoiseFloorDb: DecibelsFsSchema,
    maxNoiseFloorDb: DecibelsFsSchema,
    noiseFloorAlpha: z.number().min(0.001).max(0.5),
    silenceDurationMs: MillisecondsSchema,
    minVoicedFrames: FrameCountSchema,
    preRollFrames: FrameCountSchema,
  })
  .brand<'VadConfig'>()
export type VadConfig = z.infer<typeof VadConfigSchema>

export const VadFrameMetricsSchema = z
  .object({
    rms: RmsAmplitudeSchema,
    dbfs: DecibelsFsSchema,
  })
  .brand<'VadFrameMetrics'>()
export type VadFrameMetrics = z.infer<typeof VadFrameMetricsSchema>

export const VadStateSnapshotSchema = z
  .object({
    isSpeechFrame: z.boolean(),
    isTalking: z.boolean(),
    dbfs: DecibelsFsSchema,
    noiseFloorDb: DecibelsFsSchema,
    silentDurationMs: MillisecondsSchema,
    voicedFrames: FrameCountSchema,
    shouldTranscribe: z.boolean(),
    shouldReset: z.boolean(),
  })
  .brand<'VadStateSnapshot'>()
export type VadStateSnapshot = z.infer<typeof VadStateSnapshotSchema>

// Branded configuration & environment schemas
export const SttEngineSchema = z.enum(['whisper', 'nano-parakeet']).brand<'SttEngine'>()
export type SttEngine = z.infer<typeof SttEngineSchema>

export const WhisperModelSchema = z
  .enum([
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
  .brand<'WhisperModel'>()
export type WhisperModel = z.infer<typeof WhisperModelSchema>

export const ParakeetModelSchema = z.string().min(1).brand<'ParakeetModel'>()
export type ParakeetModel = z.infer<typeof ParakeetModelSchema>

export const DiscordTokenSchema = z.string().min(1).brand<'DiscordToken'>()
export type DiscordToken = z.infer<typeof DiscordTokenSchema>

export const DatabaseUrlSchema = z.string().min(1).brand<'DatabaseUrl'>()
export type DatabaseUrl = z.infer<typeof DatabaseUrlSchema>

export const QueryLimitSchema = z.number().int().positive().max(1000).brand<'QueryLimit'>()
export type QueryLimit = z.infer<typeof QueryLimitSchema>

export const EnvSchema = z.object({
  DISCORD_TOKEN: DiscordTokenSchema,
  DISCORD_APPLICATION_ID: z.string().min(1).optional(),
  DATABASE_URL: DatabaseUrlSchema.optional(),
  STT_ENGINE: SttEngineSchema.optional(),
  WHISPER_MODEL: WhisperModelSchema.optional(),
  PARAKEET_MODEL: ParakeetModelSchema.optional(),
  PYTHON_COMMAND: z.string().min(1).optional(),
})
export type Env = z.infer<typeof EnvSchema>

// Whisper / STT worker JSON response schemas
export const WhisperSegmentSchema = z.object({
  no_speech_prob: z.number().min(0).max(1),
})
export type WhisperSegment = z.infer<typeof WhisperSegmentSchema>

export const WhisperOutputSchema = z
  .object({
    ok: z.literal(true),
    text: z.string(),
    segments: z.array(WhisperSegmentSchema).default([]),
  })
  .brand<'WhisperOutput'>()
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

// Speaker & Database record schemas
export const SpeakerContextSchema = z
  .object({
    guildId: GuildIdSchema,
    voiceChannelId: VoiceChannelIdSchema,
    userId: UserIdSchema,
    username: UsernameSchema,
  })
  .brand<'SpeakerContext'>()
export type SpeakerContext = z.infer<typeof SpeakerContextSchema>

export const NewTranscriptionRecordSchema = z
  .object({
    guildId: GuildIdSchema,
    voiceChannelId: VoiceChannelIdSchema,
    textChannelId: TextChannelIdSchema,
    userId: UserIdSchema,
    username: UsernameSchema,
    content: TranscriptTextSchema,
  })
  .brand<'NewTranscriptionRecord'>()
export type NewTranscriptionRecord = z.infer<typeof NewTranscriptionRecordSchema>

export const TranscriptionRecordSchema = z
  .object({
    id: TranscriptionIdSchema,
    guildId: GuildIdSchema,
    voiceChannelId: VoiceChannelIdSchema,
    textChannelId: TextChannelIdSchema,
    userId: UserIdSchema,
    username: UsernameSchema,
    content: TranscriptTextSchema,
    createdAt: z.coerce.date(),
  })
  .brand<'TranscriptionRecord'>()
export type TranscriptionRecord = z.infer<typeof TranscriptionRecordSchema>

// In-memory session metadata
export interface TranscriptionMetadata {
  voiceChannelId: VoiceChannelId
  textChannelId: TextChannelId
  users: Map<UserId, () => void>
  connection: VoiceConnection
  onSpeakingStart?: (userId: string) => void
}
