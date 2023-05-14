import fs from 'fs'
import { Readable } from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import { TextChannel } from 'discord.js'
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice'
import { spawn } from 'child_process'
import { modelSize } from './constants.mjs'

export function createCacheDirIfNotExists() {
  try {
    fs.mkdirSync('./.app-cache')
  } catch (e: any) {
    if (!fs.existsSync('./.app-cache')) {
      throw new Error('could not create .app-cache folder and it does not exist')
    }
  }
}

export function log(...args: any[]) {
  console.log('Discord STT |', ...args)
}

export function sum(xs: number[]) {
  return xs.reduce((sum, val) => sum + val, 0.0)
}

// discord utils

export async function connectToVoiceChannel(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  })

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20e3)
    return connection
  } catch (err) {
    console.error('failed to connect to voice channel')
    connection.destroy()
    throw err
  }
}

// transcription / whisper utils

export function getWhisperArgs(path: string) {
  const args = [
    '--output_dir',
    './.app-cache',
    '--language',
    'en',
    '--task',
    'transcribe',
    '--model',
    modelSize,
    '--output_format',
    'json',
    path,
  ] as const

  return args
}

export async function saveIntermediateFile(path: string, buffer: Buffer) {
  await new Promise((resolve, reject) => {
    return ffmpeg(Readable.from(buffer))
      .inputFormat('s16le')
      .audioBitrate('16k')
      .saveToFile(path)
      .on('end', resolve)
      .on('error', reject)
  })
}

export async function transcribe(audioPath: string) {
  const args = getWhisperArgs(audioPath)
  await new Promise((resolve, reject) => {
    return spawn('whisper', args, { shell: true }).on('exit', resolve).on('error', reject)
  })
}

export async function getWhisperResults(outputFile: string): Promise<string | undefined> {
  const resultPath = `.app-cache/${outputFile.split('.')[0]}.json`
  const json = await JSON.parse(fs.readFileSync(resultPath, 'utf-8'))

  const avgNoSpeechProb =
    json.segments.length > 0 ? sum(json.segments.map((seg) => seg.no_speech_prob)) / json.segments.length : 1.0

  if (avgNoSpeechProb > 0.6) {
    log('probably not speaking, not sending to channel')
    return
  }

  return json.text as string
}

const transcodingByUser = {}
export async function transcodeAndSave(buf: Buffer, outputFile: string, user: string, targetTextChannel: TextChannel) {
  const path = `.app-cache/${outputFile}`
  transcodingByUser[user] = true

  try {
    await saveIntermediateFile(path, buf)
    await transcribe(path)
    const text = await getWhisperResults(outputFile)

    if (text) {
      await targetTextChannel.send({
        content: `${user}: ${text}`,
        tts: false,
      })
    }
  } finally {
    transcodingByUser[user] = false
  }
}
