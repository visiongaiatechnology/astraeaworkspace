#!/usr/bin/env python3
"""Generate the release dependency inventories (SBOM evidence) for Astraea Workspace Alpha 0.1.

This is a *local, deterministic inventory*: Cargo packages from `cargo metadata` and npm packages
from `ui/package-lock.json`. It is deliberately not a certified SPDX/CycloneDX document; the audit
report labels it as an internal inventory, and `cargo deny check` is the license/advisory gate.

Usage: python scripts/release/generate-sbom.py [--root PATH] [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run_metadata(root: Path) -> dict:
    result = subprocess.run(
        ["cargo", "metadata", "--format-version", "1", "--all-features"],
        cwd=root,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"cargo metadata failed: {result.returncode}\n{result.stderr[-2000:].decode("utf-8", "replace")}")
    # cargo metadata is UTF-8; decode explicitly so a non-UTF-8 Windows console code page cannot
    # corrupt or drop the inventory.
    return json.loads(result.stdout.decode("utf-8", "replace"))


def cargo_sbom(metadata: dict) -> dict:
    packages = []
    for package in metadata.get("packages", []):
        packages.append(
            {
                "name": package.get("name"),
                "version": package.get("version"),
                "license": package.get("license"),
                "source": package.get("source"),
                "workspaceMember": package.get("name") in {
                    member.get("name") for member in metadata.get("packages", []) if member.get("id") in metadata.get("workspace_members", [])
                },
            }
        )
    packages.sort(key=lambda entry: (entry["name"] or "", entry["version"] or ""))
    return {
        "format": "astraea.sbom.cargo/1",
        "note": "Internal dependency inventory generated from cargo metadata; not a certified SPDX/CycloneDX document.",
        "packageCount": len(packages),
        "packages": packages,
    }


def npm_sbom(lockfile: dict) -> dict:
    packages = []
    for path, entry in sorted((lockfile.get("packages") or {}).items()):
        name = entry.get("name") or path.rsplit("node_modules/", 1)[-1]
        if not name or path == "":
            continue
        packages.append(
            {
                "name": name,
                "version": entry.get("version"),
                "license": entry.get("license"),
                "dev": bool(entry.get("dev")),
                "optional": bool(entry.get("optional")),
            }
        )
    return {
        "format": "astraea.sbom.npm/1",
        "note": "Internal dependency inventory generated from the committed ui/package-lock.json; dev-only packages are marked.",
        "packageCount": len(packages),
        "packages": packages,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    root = args.root.resolve()
    out_dir = args.out or root / "audit"
    out_dir.mkdir(parents=True, exist_ok=True)

    revision = ""
    try:
        revision = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=False
        ).stdout.strip()
    except OSError:
        pass

    metadata = run_metadata(root)
    cargo = cargo_sbom(metadata)
    cargo["sourceRevision"] = revision

    lockfile_path = root / "ui" / "package-lock.json"
    lockfile = json.loads(lockfile_path.read_text(encoding="utf-8"))
    npm = npm_sbom(lockfile)
    npm["sourceRevision"] = revision
    npm["lockfileVersion"] = lockfile.get("lockfileVersion")

    cargo_path = out_dir / "sbom-cargo.json"
    npm_path = out_dir / "sbom-npm.json"
    cargo_path.write_text(json.dumps(cargo, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    npm_path.write_text(json.dumps(npm, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"WROTE {cargo_path} ({cargo['packageCount']} packages)")
    print(f"WROTE {npm_path} ({npm['packageCount']} packages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
