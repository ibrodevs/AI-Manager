"""Assemble reviewed ElevenLabs utterances; never generate speech or spend credits.

Usage: python3 scripts/assemble-demo-audio.py /path/to/paid-recordings --reviewed --commercial-license
Input: <scenario-id>/00.mp3, 01.mp3, ... in exact script order.
Regenerate all free-plan takes on a paid plan before using this command.
"""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import tempfile
import wave


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def assemble(source, reviewed, commercial):
    if not reviewed or not commercial:
        raise SystemExit("Blocked: confirm both listening/transcript review and commercial license; free-plan audio cannot be published.")
    root = Path(__file__).resolve().parents[1]
    scenarios = json.loads((root / "lib/demo-scenarios.json").read_text())
    for scenario in scenarios:
        for line in scenario["lines"]:
            path = source / scenario["id"] / f'{line["seq"]:02}.mp3'
            if not path.is_file():
                raise SystemExit(f"Incomplete recording: {path}")
    manifest = {}
    # Prepare every output before writing any public file or metadata.
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        for scenario in scenarios:
            turns, samples = [], bytearray()
            for line in scenario["lines"]:
                src = source / scenario["id"] / f'{line["seq"]:02}.mp3'
                decoded = work / "utterance.wav"
                run("ffmpeg", "-y", "-i", str(src), "-af", "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-48dB,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", str(decoded))
                with wave.open(str(decoded), "rb") as wav:
                    frames = wav.readframes(wav.getnframes())
                if len(frames) < 4410:
                    raise SystemExit(f"Empty/too short audio: {src}")
                start = len(samples) / 2 / 44100 * 1000
                samples.extend(frames)
                end = len(samples) / 2 / 44100 * 1000
                turns.append({**line, "startMs": round(start), "endMs": round(end), "interrupted": False})
                samples.extend(bytes(round(0.28 * 44100) * 2))
            raw = work / f'{scenario["id"]}.wav'
            with wave.open(str(raw), "wb") as wav:
                wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(44100); wav.writeframes(samples)
            mp3 = work / f'{scenario["id"]}.mp3'
            run("ffmpeg", "-y", "-i", str(raw), "-af", "loudnorm=I=-18:TP=-2:LRA=7", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", str(mp3))
            # Native playback uses actual MP3 metadata, including encoder padding.
            duration = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(mp3)], text=True)
            manifest[scenario["id"]] = {"audioUrl": f'/audio/demos/{mp3.name}', "durationMs": round(float(duration) * 1000), "turns": turns, "provider": "ElevenLabs", "model": "eleven_v3", "assembledAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "commercialLicense": True}
        output = root / "public/audio/demos"
        output.mkdir(parents=True, exist_ok=True)
        for scenario in scenarios:
            name = f'{scenario["id"]}.mp3'
            (output / name).write_bytes((work / name).read_bytes())
        (root / "lib/demo-audio.generated.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print("Assembled both recordings. Listen to the final MP3s and run production-build E2E before publishing.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--reviewed", action="store_true")
    parser.add_argument("--commercial-license", action="store_true")
    args = parser.parse_args()
    assemble(args.source, args.reviewed, args.commercial_license)
