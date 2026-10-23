#!/usr/bin/env python3
# Astraea provider boundary derived from VGT Infinity commit
# 55b05a697a189d0ec583cdcf340beeba1efc9130. Cryptographic algorithm/suite
# behavior is unchanged; boundary hardening below only constrains process I/O.
from __future__ import annotations

import base64
import json
import os
import socket
import sys
from pathlib import Path
from typing import Any

from pqcrypto.kem import hqc_256
from pqmagic import Kem

MAX_REQUEST = 64 * 1024 * 1024
ALLOWED_FIELDS = {
    "keygen": {"operation", "algorithm"},
    "encaps": {"operation", "algorithm", "public_key"},
    "decaps": {"operation", "algorithm", "private_key", "ciphertext"},
}


class ProviderError(RuntimeError):
    pass


def _deny_network(*_args: object, **_kwargs: object) -> None:
    raise ProviderError("network disabled")


def lock_down_process() -> None:
    # Algorithm modules are loaded before this point. The provider protocol accepts no filesystem
    # paths and the process is rooted in its provider directory. Network construction is disabled
    # at the Python boundary; native host sandboxing remains an explicit release assurance gate.
    os.chdir(Path(__file__).resolve().parent)
    for key in list(os.environ):
        if key.upper().startswith(("HTTP_", "HTTPS_", "ALL_PROXY", "NO_PROXY", "AWS_", "GOOGLE_", "AZURE_")):
            os.environ.pop(key, None)
    socket.socket = _deny_network  # type: ignore[assignment]
    socket.create_connection = _deny_network  # type: ignore[assignment]


def decode_b64(value: object, label: str) -> bytes:
    if not isinstance(value, str) or len(value) > MAX_REQUEST:
        raise ProviderError(f"invalid {label}")
    try:
        result = base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as exc:
        raise ProviderError(f"invalid {label}") from exc
    if not result or len(result) > MAX_REQUEST:
        raise ProviderError(f"invalid {label}")
    return result


def encode_b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def provider(algorithm: object):
    if algorithm == "HQC-256":
        return hqc_256.generate_keypair, hqc_256.encrypt, hqc_256.decrypt
    if algorithm == "AIGIS-ENC-4":
        kem = Kem("AIGIS_ENC_4")
        return kem.keypair, kem.encaps, lambda private, ciphertext: kem.decaps(ciphertext, private)
    raise ProviderError("algorithm rejected")


def execute(request: dict[str, Any]) -> dict[str, str]:
    operation = request.get("operation")
    if operation not in ALLOWED_FIELDS or set(request) != ALLOWED_FIELDS[operation]:
        raise ProviderError("request rejected")
    keygen, encaps, decaps = provider(request.get("algorithm"))
    if operation == "keygen":
        public, private = keygen()
        return {"public_key": encode_b64(bytes(public)), "private_key": encode_b64(bytes(private))}
    if operation == "encaps":
        ciphertext, secret = encaps(decode_b64(request.get("public_key"), "public key"))
        return {"ciphertext": encode_b64(bytes(ciphertext)), "shared_secret": encode_b64(bytes(secret))}
    private = bytearray(decode_b64(request.get("private_key"), "private key"))
    try:
        secret = decaps(bytes(private), decode_b64(request.get("ciphertext"), "ciphertext"))
        return {"shared_secret": encode_b64(bytes(secret))}
    finally:
        private[:] = b"\x00" * len(private)


def main() -> int:
    lock_down_process()
    raw = bytearray(sys.stdin.buffer.read(MAX_REQUEST + 1))
    if not raw or len(raw) > MAX_REQUEST:
        raw[:] = b"\x00" * len(raw)
        return 2
    try:
        request = json.loads(raw.decode("utf-8"))
        if not isinstance(request, dict):
            raise ProviderError("request rejected")
        response = execute(request)
    except Exception as exc:
        print(f"provider failure: {type(exc).__name__}", file=sys.stderr)
        return 2
    finally:
        raw[:] = b"\x00" * len(raw)
    sys.stdout.write(json.dumps(response, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
