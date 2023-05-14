# discord-stt
a Discord server that enables real-time transcription on a voice channel via bot listening and sending messages

## Setup

```
yarn build
cp .env.local .env
```

Find the channel ids and paste them into your environment token. Also, create a Discord bot and paste the bot's token in.

## Usage

Invite your bot to your discord server with the environment variables configured correctly, then run the program.

`node build/app.mjs`

## Known problems & future improvements

This repository is mostly a proof of concept that shows that it is possible to transcribe audio buffers from Discord and post the transcriptions to a text channel, in near-time that is close enough to real-time to be useful. However, it is not a complete solution, and known problems are listed below.

- technically incorrect -- Because of the way that the underlying discord Node libraries work, there are actually two concurrent threads that can add packet to any given user's Opus packets array. The underlying library only delivers opus packets when the user is actively speaking, so this program has to attempt to add packets of silence when the user is not speaking. I "solved" this problem by adding an interval on the duration of the frame (20ms) and keeping track of the timestamp of the last Opus packet received by the audio event listener. The interval will add a silence packet when we haven't received a real packet in the past frame duration. This approach seems to work okay in practice, but it doesn't seem to be "correct"; for instance, the interval and the real packet event listener are not synchronized in any way. 
- lack of cleanup -- The bot will not presently attempt to clean up after itself by deleting old discord messages. 
- no persistent storage -- the transcriptions are sent to the text channel you specify, but the message ids are not persisted anywhere. That makes it impossible to add functionality, like deleting Discord transcription messages after a timeout, across program invocations. 
- potential for hallucinations -- the currently used transcription software, OpenAI's open-sourced Whisper model, is prone to hallucination, especially with poor quality inputs. This software does not currently make any analytical attempt to not transcribe poor audio, or audio that cannot possibly correspond to human speech. Adding a fast step before the transcription, that is able to analyze and output the approximate quality of the audio (in terms of human speech), would make it easier to ignore low-quality or nonsensical audio. For instance, an audio buffer that consists of a user coughing would be transcribed presently. (This program *does* check the average `no_speech_prob` for the produced segments, and will not send a Discord message for a transcription that Whisper determines is unlikely to be speech.)
- approximate outputs -- the bot listens on each connected user's audio stream separately and makes no attempt to order the outputs based on the start or end timestamps of any given "listening period". Practically speaking, that means that transcriptions might be posted to the discord channel out of order, and that the timestamp associated with the discord message might not accurately reflect the timestamp of when that user began speaking.
