import { VoiceConnection } from "@discordjs/voice"

export type VoiceChannelId = string & {}
export type TextChannelId = string & {}
export type UserId = string & {}

export interface User {
  id: string
  stop: () => void
}

export interface TranscriptionMetadata {
  id: string
  voiceChannelId: VoiceChannelId
  textChannelId: TextChannelId
  users: Record<UserId, User>
  connection: VoiceConnection
}
