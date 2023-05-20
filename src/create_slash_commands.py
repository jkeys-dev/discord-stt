import os
import requests
from dotenv import load_dotenv

load_dotenv()

bot_token = os.getenv('DISCORD_BOT_TOKEN')
application_id = os.getenv('DISCORD_APPLICATION_ID')

url = f"https://discord.com/api/v10/applications/{application_id}/commands"

json = {
    "name": "start",
    "type": 1,
    "description": "Start transcription in the voice channel that you are connected to",
}

json2 = {
    "name": "stop",
    "type": 1,
    "description": "Stop transcription in the voice channel that you are connected to",
}

headers = {
    "Authorization": f"Bot {bot_token}"
}

r = requests.post(url, headers=headers, json=json)
r2 = requests.post(url, headers=headers, json=json2)
