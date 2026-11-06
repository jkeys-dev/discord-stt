import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { defaultSttEngine, modelSize } from './constants.mjs'
import {
  ParakeetModelSchema,
  Pcm16kMonoBuffer,
  Pcm16kMonoBufferSchema,
  SttEngineSchema,
  WhisperModelSchema,
  WhisperOutput,
  WhisperWorkerResponseSchema,
} from './types.mjs'

interface PendingRequest {
  resolve: (output: WhisperOutput) => void
  reject: (err: Error) => void
}

let workerProcess: ChildProcessWithoutNullStreams | undefined
const pendingQueue: PendingRequest[] = []

function resolveWorkerScriptPath(): string {
  const relativeToModule = fileURLToPath(new URL('../src/whisper_worker.py', import.meta.url))
  if (fs.existsSync(relativeToModule)) {
    return relativeToModule
  }
  return path.resolve(process.cwd(), 'src/whisper_worker.py')
}

function resolvePythonCommand(): string {
  if (process.env.PYTHON_COMMAND) {
    return process.env.PYTHON_COMMAND
  }

  const venvCandidate =
    process.platform === 'win32'
      ? path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe')
      : path.resolve(process.cwd(), '.venv', 'bin', 'python')

  if (fs.existsSync(venvCandidate)) {
    return venvCandidate
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

function getOrStartWorker(): ChildProcessWithoutNullStreams {
  if (workerProcess && !workerProcess.killed && workerProcess.exitCode === null) {
    return workerProcess
  }

  const pythonBin = resolvePythonCommand()
  const sttEngine = process.env.STT_ENGINE
    ? SttEngineSchema.parse(process.env.STT_ENGINE)
    : defaultSttEngine
  const whisperModel = process.env.WHISPER_MODEL
    ? WhisperModelSchema.parse(process.env.WHISPER_MODEL)
    : modelSize
  const parakeetModel = process.env.PARAKEET_MODEL
    ? ParakeetModelSchema.parse(process.env.PARAKEET_MODEL)
    : undefined
  const scriptPath = resolveWorkerScriptPath()

  const child = spawn(pythonBin, ['-u', scriptPath], {
    env: {
      ...process.env,
      STT_ENGINE: sttEngine,
      WHISPER_MODEL: whisperModel,
      ...(parakeetModel ? { PARAKEET_MODEL: parakeetModel } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  child.stderr.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim()
    if (msg) {
      console.log(msg)
    }
  })

  const rl = readline.createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    const pending = pendingQueue.shift()
    if (!pending) {
      return
    }

    try {
      const parsed = WhisperWorkerResponseSchema.parse(JSON.parse(trimmed))
      if (parsed.ok) {
        pending.resolve(parsed)
      } else {
        pending.reject(new Error(`STT worker error: ${parsed.error}`))
      }
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error(String(err)))
    }
  })

  const handleTerminate = (reason: Error) => {
    if (workerProcess === child) {
      workerProcess = undefined
    }
    while (pendingQueue.length > 0) {
      pendingQueue.shift()?.reject(reason)
    }
  }

  child.on('error', (err) => {
    handleTerminate(new Error(`STT worker process error: ${err.message}`))
  })

  child.on('exit', (code, signal) => {
    handleTerminate(
      new Error(`STT worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    )
  })

  workerProcess = child
  return child
}

export function initWhisperWorker(): void {
  getOrStartWorker()
}

export async function transcribePcm16kMono(pcmBuffer: Pcm16kMonoBuffer): Promise<WhisperOutput> {
  const validBuffer = Pcm16kMonoBufferSchema.parse(pcmBuffer)
  const worker = getOrStartWorker()

  const header = Buffer.alloc(4)
  header.writeUInt32BE(validBuffer.byteLength, 0)

  return new Promise<WhisperOutput>((resolve, reject) => {
    pendingQueue.push({ resolve, reject })

    worker.stdin.write(header, (headerErr) => {
      if (headerErr) {
        return
      }
      worker.stdin.write(validBuffer)
    })
  })
}

export function closeWhisperWorker(): void {
  if (workerProcess) {
    try {
      workerProcess.stdin.end()
      workerProcess.kill()
    } catch {
      // ignore errors during shutdown
    }
    workerProcess = undefined
  }
}
