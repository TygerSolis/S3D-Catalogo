#!/usr/bin/env python3
"""Transcode static MP4 assets to web-friendly H.264 and update references."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VIDEO_DIR = ASSETS / "video"
TEXT_EXTENSIONS = {".html", ".js", ".css", ".json", ".md", ".xml", ".txt"}

def read_text_files():
    for path in ROOT.rglob("*"):
        if path.is_file() and ".git" not in path.parts and path.suffix.lower() in TEXT_EXTENSIONS:
            try:
                yield path, path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue

def transcode(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(source),
        "-vf", "scale='min(1280,iw)':-2",
        "-c:v", "libx264", "-preset", "medium", "-crf", "28",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        str(target),
    ]
    subprocess.run(command, check=True)

def main():
    sources = sorted(p for p in ASSETS.glob("*.mp4"))
    if not sources:
        print("No root-level MP4 assets found.")
        return

    text_files = list(read_text_files())
    converted = 0

    for source in sources:
        rel = source.relative_to(ROOT).as_posix()
        if not any(rel in content for _, content in text_files):
            print(f"Keeping unreferenced video: {rel}")
            continue

        target = VIDEO_DIR / source.name
        try:
            transcode(source, target)
        except subprocess.CalledProcessError as exc:
            print(f"Failed to transcode {rel}: {exc}")
            if target.exists():
                target.unlink()
            continue

        target_rel = target.relative_to(ROOT).as_posix()
        for path, content in text_files:
            updated = content.replace(rel, target_rel)
            if updated != content:
                path.write_text(updated, encoding="utf-8")

        source.unlink()
        converted += 1
        print(f"Optimized {rel} -> {target_rel}")

    print(f"Optimized {converted} referenced videos.")

if __name__ == "__main__":
    main()
