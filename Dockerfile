FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

RUN apt-get upgrade && apt-get update

# install build and runtime apt dependencies
RUN apt-get install curl ffmpeg --no-install-recommends -y && rm -rf /var/lib/apt/lists/*

# install node
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash - 
RUN apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# install python
RUN apt-get install -y python3.10 && rm -rf /var/lib/apt/lists/*

RUN npm install -g yarn 

RUN curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py
RUN pip3 install -U openai-whisper && pip3 uninstall -y torch && pip3 cache purge && pip3 install torch torchvision torchaudio --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cu117

# copy src
COPY . .

# build source
RUN yarn && yarn build

# start the app
CMD node build/app.mjs
