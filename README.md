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
