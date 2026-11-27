import {
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice'
import { APIInteractionGuildMember, GuildMember, TextChannel, VoiceChannel } from 'discord.js'
import { saveTranscription } from './db.mjs'
import {
  Pcm16kMonoBuffer,
  SpeakerContext,
  TextChannelId,
  WhisperOutput,
} from './types.mjs'
import { transcribePcm16kMono } from './whisper.mjs'

export function log(...args: any[]) {
  console.log('Discord STT |', ...args)
}

export function warn(...args: any[]) {
  console.warn('Discord STT |', ...args)
}

export function error(...args: any[]) {
  console.error('Discord STT |', ...args)
}

export function sum(xs: number[]) {
  return xs.reduce((acc, val) => acc + val, 0.0)
}

// discord utils

export async function connectToVoiceChannel(channel: VoiceChannel): Promise<VoiceConnection> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    decryptionFailureTolerance: Number.MAX_SAFE_INTEGER,
  })

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20e3)
    const networking = Reflect.get(connection.state, 'networking')
    const dave = networking ? Reflect.get(networking.state, 'dave') : undefined
    if (dave?.session?.setPassthroughMode) {
      dave.session.setPassthroughMode(true, 10)
    }
    return connection
  } catch (err) {
    error('failed to connect to voice channel')
    connection.destroy()
    throw err
  }
}

export function disconnectFromVoiceChannel(connection: VoiceConnection) {
  try {
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy()
    }
  } catch (err) {
    error('failed to disconnect from voice channel', err)
  }
}

export function isGuildMember(
  member: GuildMember | APIInteractionGuildMember | null
): member is GuildMember {
  return Boolean(member && 'voice' in member && !member.user.bot)
}

// transcription / whisper utils

export function extractTranscriptText(output: WhisperOutput): string | undefined {
  const avgNoSpeechProb =
    output.segments.length > 0
      ? sum(output.segments.map((seg) => seg.no_speech_prob)) / output.segments.length
      : 1.0

  if (avgNoSpeechProb > 0.6) {
    log('probably not speaking, not sending to channel')
    return undefined
  }

  const trimmed = output.text.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export async function transcodeAndSave(
  buf: Pcm16kMonoBuffer,
  speaker: SpeakerContext,
  targetTextChannel: TextChannel,
  textChannelId: TextChannelId
) {
  const whisperOutput = await transcribePcm16kMono(buf)
  const text = extractTranscriptText(whisperOutput)

  if (text) {
    await targetTextChannel.send({
      content: `${speaker.username}: ${text}`,
      tts: false,
    })

    try {
      await saveTranscription({
        guildId: speaker.guildId,
        voiceChannelId: speaker.voiceChannelId,
        textChannelId,
        userId: speaker.userId,
        username: speaker.username,
        content: text,
      })
    } catch (dbErr) {
      error('failed to save transcription to PostgreSQL', dbErr)
    }
  }
}
