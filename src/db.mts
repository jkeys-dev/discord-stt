import pg from 'pg'
import { z } from 'zod'
import {
  DatabaseUrlSchema,
  NewTranscriptionRecord,
  NewTranscriptionRecordSchema,
  QueryLimitSchema,
  TranscriptionRecord,
  TranscriptionRecordSchema,
  VoiceChannelId,
  VoiceChannelIdSchema,
} from './types.mjs'
import { error, log } from './utils.mjs'

const { Pool } = pg

let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL
      ? DatabaseUrlSchema.parse(process.env.DATABASE_URL)
      : undefined

    pool = new Pool(databaseUrl ? { connectionString: databaseUrl } : undefined)
    pool.on('error', (err) => {
      error('Unexpected PostgreSQL pool error:', err)
    })
  }
  return pool
}

export async function initDb(): Promise<void> {
  const db = getPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      text_channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_transcriptions_voice_channel_created
      ON transcriptions (voice_channel_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transcriptions_user_created
      ON transcriptions (user_id, created_at DESC);
  `)
  log('PostgreSQL database initialized')
}

export async function saveTranscription(
  record: NewTranscriptionRecord | z.input<typeof NewTranscriptionRecordSchema>
): Promise<TranscriptionRecord> {
  const validated = NewTranscriptionRecordSchema.parse(record)
  const db = getPool()
  const result = await db.query(
    `
    INSERT INTO transcriptions (
      guild_id,
      voice_channel_id,
      text_channel_id,
      user_id,
      username,
      content
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      guild_id AS "guildId",
      voice_channel_id AS "voiceChannelId",
      text_channel_id AS "textChannelId",
      user_id AS "userId",
      username,
      content,
      created_at AS "createdAt"
    `,
    [
      validated.guildId,
      validated.voiceChannelId,
      validated.textChannelId,
      validated.userId,
      validated.username,
      validated.content,
    ]
  )
  return TranscriptionRecordSchema.parse(result.rows[0])
}

export async function getRecentTranscriptions(
  voiceChannelId: VoiceChannelId,
  limit = 50
): Promise<TranscriptionRecord[]> {
  const validChannelId = VoiceChannelIdSchema.parse(voiceChannelId)
  const validLimit = QueryLimitSchema.parse(limit)
  const db = getPool()
  const result = await db.query(
    `
    SELECT
      id,
      guild_id AS "guildId",
      voice_channel_id AS "voiceChannelId",
      text_channel_id AS "textChannelId",
      user_id AS "userId",
      username,
      content,
      created_at AS "createdAt"
    FROM transcriptions
    WHERE voice_channel_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [validChannelId, validLimit]
  )
  return z.array(TranscriptionRecordSchema).parse(result.rows)
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
