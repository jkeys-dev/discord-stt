import pg from 'pg'
import { z } from 'zod'
import {
  NewTranscriptionRecord,
  TranscriptionRecord,
  TranscriptionRecordSchema,
  VoiceChannelId,
} from './types.mjs'
import { error, log } from './utils.mjs'

const { Pool } = pg

let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(
      process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined
    )
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
  record: NewTranscriptionRecord
): Promise<TranscriptionRecord> {
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
      record.guildId,
      record.voiceChannelId,
      record.textChannelId,
      record.userId,
      record.username,
      record.content,
    ]
  )
  return TranscriptionRecordSchema.parse(result.rows[0])
}

export async function getRecentTranscriptions(
  voiceChannelId: VoiceChannelId,
  limit = 50
): Promise<TranscriptionRecord[]> {
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
    [voiceChannelId, limit]
  )
  return z.array(TranscriptionRecordSchema).parse(result.rows)
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
