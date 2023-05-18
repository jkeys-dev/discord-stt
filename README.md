# discord-stt
A Discord server that enables real-time transcription on a voice channel via a bot listening and sending messages. 

## Setup

```
# install ffmpeg
brew install ffmpeg # or, https://ffmpeg.org/download.html

cp .env.local .env

# insert values for your bot into the .env

# setup slash commands
pip install python-dotenv
python create_slash_commands.py # or, `python3 create_slash_commands.py`
```

Find the channel ids and paste them into your environment token. Also, create a Discord bot and paste the bot's token in.

## Usage

Invite your bot to your discord server with the environment variables configured correctly, then run the program.

https://discord.com/api/oauth2/authorize?client_id=<client_id>&permissions=<permission_integer>&scope=bot%20applications.commands

```
# bare metal
yarn build
node build/app.mjs

# docker
docker build -t discord-stt -f ./Dockerfile .
docker run -it --rm --gpus all discord-stt

```

## Limitations, Known Problems and Future Improvements

This repository is mostly a proof of concept that shows that it is possible to transcribe audio buffers from Discord and post the transcriptions to a text channel, in near-time that is close enough to real-time to be useful. However, it is not a complete solution, and known problems are listed below.

- fast machine required -- Although you can run this program on any machine, only machines with CUDA-enabled GPUs are currently likely to be fast enough to be useful in conversation.
- single channel, always-on design -- this repository uses environment variables to specify the relevant text and audio channel. With the current design, one would have to have an `.env` for each channel they wished to transcribe on. Furthermore, the program will listen and transcribe on an audio channel for as long as the program is running. A more robust implementation would allow users to send messages to the bot to dynamically enable transcription in any given channel. 
- technically incorrect -- Because of the way that the underlying discord Node libraries work, there are actually two concurrent threads that can add packet to any given user's Opus packets array. The underlying library only delivers opus packets when the user is actively speaking, so this program has to attempt to add packets of silence when the user is not speaking. I "solved" this problem by adding an interval on the duration of the frame (20ms) and keeping track of the timestamp of the last Opus packet received by the audio event listener. The interval will add a silence packet when we haven't received a real packet in the past frame duration. This approach seems to work okay in practice, but it doesn't seem to be "correct"; for instance, the interval and the real packet event listener are not synchronized in any way. 
- lack of cleanup -- The bot will not presently attempt to clean up after itself by deleting old discord messages. 
- no persistent storage -- the transcriptions are sent to the text channel you specify, but the message ids are not persisted anywhere. That makes it impossible to add functionality, like deleting Discord transcription messages after a timeout, across program invocations. 
- potential for hallucinations -- the currently used transcription software, OpenAI's open-sourced Whisper model, is prone to hallucination, especially with poor quality inputs. This software does not currently make any analytical attempt to not transcribe poor audio, or audio that cannot possibly correspond to human speech. Adding a fast step before the transcription, that is able to analyze and output the approximate quality of the audio (in terms of human speech), would make it easier to ignore low-quality or nonsensical audio. For instance, an audio buffer that consists of a user coughing would be transcribed presently. (This program *does* check the average `no_speech_prob` for the produced segments, and will not send a Discord message for a transcription that Whisper determines is unlikely to be speech.)
- approximate outputs -- the bot listens on each connected user's audio stream separately and makes no attempt to order the outputs based on the start or end timestamps of any given "listening period". Practically speaking, that means that transcriptions might be posted to the discord channel out of order, and that the timestamp associated with the discord message might not accurately reflect the timestamp of when that user began speaking.

So, the future improvements include:

- lower minimum requirements and increase usefulness by using `faster-whisper`, `whisper.cpp`, etc. for machines without CUDA support
- refactor to a multi-channel, dynamic, slash command-based design
- synchronize silence packet insertions so that the reconstructed audio stream is closer to the actual input
- add option for cleaning up messages on an interval
- add support for persistence using at least one database (probably Postgres)
- enqueue and re-order transcription results 
- (experimental) pre-process captured audio buffer for low-quality and/or non-speech characteristics