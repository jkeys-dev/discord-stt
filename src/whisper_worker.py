import contextlib
import json
import os
import struct
import sys
import numpy as np
import torch
import whisper


def main() -> None:
    model_name = os.getenv("WHISPER_MODEL", "base.en")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    use_fp16 = device == "cuda"

    protocol_out = sys.stdout
    stdin_buf = sys.stdin.buffer

    with contextlib.redirect_stdout(sys.stderr):
        sys.stderr.write(f"Discord STT | Loading Whisper model '{model_name}' on {device}...\n")
        sys.stderr.flush()
        model = whisper.load_model(model_name, device=device)
        sys.stderr.write(f"Discord STT | Whisper model '{model_name}' ready.\n")
        sys.stderr.flush()

    while True:
        header = stdin_buf.read(4)
        if not header or len(header) < 4:
            break

        (byte_length,) = struct.unpack(">I", header)
        pcm_bytes = bytearray()
        while len(pcm_bytes) < byte_length:
            chunk = stdin_buf.read(byte_length - len(pcm_bytes))
            if not chunk:
                break
            pcm_bytes.extend(chunk)

        if len(pcm_bytes) < byte_length:
            break

        try:
            with contextlib.redirect_stdout(sys.stderr):
                audio = (
                    np.frombuffer(pcm_bytes, dtype=np.int16)
                    .flatten()
                    .astype(np.float32)
                    / 32768.0
                )
                result = model.transcribe(
                    audio,
                    language="en",
                    task="transcribe",
                    fp16=use_fp16,
                )

            segments = [
                {"no_speech_prob": float(seg.get("no_speech_prob", 0.0))}
                for seg in result.get("segments", [])
            ]
            payload = {
                "ok": True,
                "text": result.get("text", ""),
                "segments": segments,
            }
        except Exception as exc:
            payload = {
                "ok": False,
                "error": str(exc),
            }

        protocol_out.write(json.dumps(payload) + "\n")
        protocol_out.flush()


if __name__ == "__main__":
    main()
