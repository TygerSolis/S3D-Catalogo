#!/usr/bin/env python3
"""Transcode static MP4 assets for web delivery and repair media references."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VIDEO_DIR = ASSETS / "video"
TEXT_EXTENSIONS = {".html", ".js", ".css", ".json", ".md", ".xml", ".txt"}

def text_paths():
    return [
        path for path in ROOT.rglob("*")
        if path.is_file()
        and ".git" not in path.parts
        and path.suffix.lower() in TEXT_EXTENSIONS
    ]

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

def repair_existing_references(files):
    replacements = {
        f"assets/{video.name}": f"assets/video/{video.name}"
        for video in VIDEO_DIR.glob("*.mp4")
    }
    changed = 0
    for path in files:
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        new_content = content
        for old, new in replacements.items():
            new_content = new_content.replace(old, new)
        if new_content != content:
            path.write_text(new_content, encoding="utf-8")
            changed += 1
    return changed

def main():
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    files = text_paths()
    repaired = repair_existing_references(files)

    converted = 0
    for source in sorted(ASSETS.glob("*.mp4")):
        target = VIDEO_DIR / source.name
        if not target.exists():
            try:
                transcode(source, target)
                converted += 1
                print(f"Optimized {source.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
            except subprocess.CalledProcessError as exc:
                print(f"Failed to transcode {source.relative_to(ROOT)}: {exc}")
                if target.exists():
                    target.unlink()
                continue

        # Always repair all references after a conversion.
        old = source.relative_to(ROOT).as_posix()
        new = target.relative_to(ROOT).as_posix()
        for path in files:
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            new_content = content.replace(old, new)
            if new_content != content:
                path.write_text(new_content, encoding="utf-8")

        source.unlink()

    print(f"Repaired references in {repaired} text files; converted {converted} source videos.")

if __name__ == "__main__":
    main()
