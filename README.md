# discord-stt
A Discord server that enables real-time transcription on a voice channel via a bot listening and sending messages. 

![Discord Speech-to-Text](https://github.com/jkeys-dev/discord-stt/blob/main/static/discord-stt.gif?raw=true)

## Setup

```
# install ffmpeg
brew install ffmpeg # or, https://ffmpeg.org/download.html

# install whisper CLI
# (goto openai/whisper and follow the instructions there)

cp .env.local .env

# insert values for your bot into the .env

# setup slash commands
pip install python-dotenv
python create_slash_commands.py # or, `python3 create_slash_commands.py`
```

Find the channel ids and paste them into your `.env` file. Also, create a Discord bot and paste the bot's token in.

## Usage

Invite your bot to your discord server with the environment variables configured correctly, then run the program.

URL to invite the bot: `https://discord.com/api/oauth2/authorize?client_id=<client_id>&permissions=<permission_integer>&scope=bot%20applications.commands`

```
# bare metal
yarn build
node build/app.mjs

# docker
docker build -t discord-stt -f ./Dockerfile .
docker run -it --rm --gpus all discord-stt

```

## Limitations and Known Problems

This repository is mostly a proof of concept that shows that it is possible to transcribe audio buffers from Discord and post the transcriptions to a text channel, in near-time that is close enough to real-time to be useful. However, it is not a complete solution, and known problems are listed below.

- fast machine required
- buggy -- cleanup is not working properly
- technically incorrect -- the silence packet interval and the real packet event listener are not synchronized in any way. 
- lack of cleanup -- The bot will not presently attempt to clean up after itself by deleting old discord messages. 
- approximate outputs -- transcriptions might be posted out of order
