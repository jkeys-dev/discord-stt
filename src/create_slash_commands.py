import requests

# TODO: don't be lazy, and import this from .env
url = "https://discord.com/api/v10/applications/<application id>/commands"

# This is an example CHAT_INPUT or Slash Command, with a type of 1
json = {
    "name": "start",
    "type": 1,
    "description": "Start transcription in the voice channel that you are connected to",
}

json2 = {
    "name": "end",
    "type": 1,
    "description": "End transcription in the voice channel that you are connected to",
}

# For authorization, you can use your bot token
# TODO: don't be lazy, and import this from .env
headers = {
    "Authorization": "Bot <bot token>"
}

r = requests.post(url, headers=headers, json=json)
r2 = requests.post(url, headers=headers, json=json2)
