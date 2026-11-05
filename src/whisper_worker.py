import contextlib
import inspect
import json
import os
import struct
import sys
from typing import Any, Callable, Dict
import numpy as np
import torch


def create_whisper_engine(device: str) -> Callable[[np.ndarray], Dict[str, Any]]:
    import whisper

    model_name = os.getenv("WHISPER_MODEL", "base.en")
    use_fp16 = device == "cuda"

    sys.stderr.write(f"Discord STT | Loading Whisper model '{model_name}' on {device}...\n")
    sys.stderr.flush()
    model = whisper.load_model(model_name, device=device)
    sys.stderr.write(f"Discord STT | Whisper model '{model_name}' ready.\n")
    sys.stderr.flush()

    def transcribe_chunk(audio: np.ndarray) -> Dict[str, Any]:
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
        return {
            "ok": True,
            "text": result.get("text", ""),
            "segments": segments,
        }

    return transcribe_chunk


def create_nano_parakeet_engine(device: str) -> Callable[[np.ndarray], Dict[str, Any]]:
    from nano_parakeet import from_pretrained

    parakeet_model = os.getenv("PARAKEET_MODEL", "").strip() or None
    label = parakeet_model or "default"
    sys.stderr.write(f"Discord STT | Loading nano-parakeet model '{label}' on {device}...\n")
    sys.stderr.flush()

    sig = inspect.signature(from_pretrained)
    kwargs: Dict[str, Any] = {}
    args = []

    if parakeet_model is not None:
        if "model_name" in sig.parameters:
            kwargs["model_name"] = parakeet_model
        elif "repo_id" in sig.parameters:
            kwargs["repo_id"] = parakeet_model
        elif len(sig.parameters) > 0:
            args.append(parakeet_model)

    if "device" in sig.parameters:
        kwargs["device"] = device

    model = from_pretrained(*args, **kwargs)
    if "device" not in kwargs and hasattr(model, "to"):
        model = model.to(device)

    sys.stderr.write(f"Discord STT | nano-parakeet model '{label}' ready.\n")
    sys.stderr.flush()

    def transcribe_chunk(audio: np.ndarray) -> Dict[str, Any]:
        raw_out = model.transcribe(audio)
        if isinstance(raw_out, str):
            text = raw_out
        elif isinstance(raw_out, dict):
            text = str(raw_out.get("text", ""))
        else:
            text = str(raw_out)

        segments = [{"no_speech_prob": 0.0}] if text.strip() else []
        return {
            "ok": True,
            "text": text,
            "segments": segments,
        }

    return transcribe_chunk


def main() -> None:
    engine_name = os.getenv("STT_ENGINE", "whisper").strip().lower()
    device = "cuda" if torch.cuda.is_available() else "cpu"

    protocol_out = sys.stdout
    stdin_buf = sys.stdin.buffer

    with contextlib.redirect_stdout(sys.stderr):
        if engine_name == "nano-parakeet":
            transcribe_fn = create_nano_parakeet_engine(device)
        elif engine_name == "whisper":
            transcribe_fn = create_whisper_engine(device)
        else:
            raise ValueError(
                f"Unsupported STT_ENGINE '{engine_name}'. Expected 'whisper' or 'nano-parakeet'."
            )

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
                payload = transcribe_fn(audio)
        except Exception as exc:
            payload = {
                "ok": False,
                "error": str(exc),
            }

        protocol_out.write(json.dumps(payload) + "\n")
        protocol_out.flush()


if __name__ == "__main__":
    main()
