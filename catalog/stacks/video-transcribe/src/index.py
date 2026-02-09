#!/usr/bin/env python3
"""
Video Transcribe MCP Server
Provides tools for extracting audio from video and transcribing with Whisper
"""

import sys
import json
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime

# Configuration
FFMPEG = "/opt/homebrew/bin/ffmpeg"
WHISPER = "/opt/homebrew/bin/whisper-cli"
MODEL = Path.home() / ".whisper-models/ggml-base.en.bin"

def get_audio_duration(file_path: str) -> float:
    """Get duration in seconds using ffprobe"""
    try:
        result = subprocess.run(
            ["/opt/homebrew/bin/ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True
        )
        return float(result.stdout.strip())
    except:
        return 0.0

def format_duration(seconds: float) -> str:
    """Format seconds as HH:MM:SS or MM:SS"""
    hours, remainder = divmod(int(seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def extract_audio(video_path: str, output_path: str) -> dict:
    """Extract audio from video file"""
    try:
        result = subprocess.run(
            [FFMPEG, "-i", video_path, "-vn", "-acodec", "copy", output_path, "-y"],
            capture_output=True, text=True, timeout=300
        )

        if Path(output_path).exists():
            size = Path(output_path).stat().st_size
            return {
                "success": True,
                "output_path": output_path,
                "size_bytes": size,
                "size_mb": round(size / (1024 * 1024), 2)
            }
        else:
            return {
                "success": False,
                "error": "Audio file not created",
                "stderr": result.stderr
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def convert_to_wav(input_path: str) -> str:
    """Convert audio to 16kHz mono WAV for whisper"""
    wav_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    try:
        subprocess.run(
            [FFMPEG, "-i", input_path, "-ar", "16000", "-ac", "1", "-y", wav_path],
            capture_output=True, text=True, timeout=60, check=True
        )
        return wav_path
    except Exception as e:
        raise Exception(f"Failed to convert to WAV: {e}")

def transcribe_audio(audio_path: str, output_path: str = None) -> dict:
    """Transcribe audio file using Whisper"""
    try:
        # Convert to WAV if needed
        if not audio_path.endswith('.wav'):
            wav_path = convert_to_wav(audio_path)
        else:
            wav_path = audio_path

        # Transcribe
        result = subprocess.run(
            [WHISPER, "-m", str(MODEL), "-f", wav_path, "--no-timestamps"],
            capture_output=True, text=True, timeout=300
        )

        # Clean up temp WAV
        if wav_path != audio_path:
            Path(wav_path).unlink()

        # Extract transcript
        lines = result.stdout.strip().split('\n')
        transcript_lines = [l for l in lines if not l.startswith('[') and l.strip()]
        transcript = ' '.join(transcript_lines).strip()

        # Get metadata
        duration = get_audio_duration(audio_path)
        word_count = len(transcript.split())

        response = {
            "success": True,
            "transcript": transcript,
            "duration_seconds": round(duration, 2),
            "duration_formatted": format_duration(duration),
            "word_count": word_count,
            "transcribed_at": datetime.now().isoformat()
        }

        # Save outputs if requested
        if output_path:
            # Save text
            txt_path = output_path if output_path.endswith('.txt') else f"{output_path}.txt"
            with open(txt_path, 'w') as f:
                f.write(transcript)

            # Save JSON
            json_path = txt_path.replace('.txt', '.json')
            with open(json_path, 'w') as f:
                json.dump(response, f, indent=2)

            response["txt_path"] = txt_path
            response["json_path"] = json_path

        return response

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def process_video_full(video_path: str, output_dir: str = None) -> dict:
    """Extract audio and transcribe video in one go"""
    try:
        video_p = Path(video_path)

        # Determine output directory
        if output_dir:
            out_dir = Path(output_dir)
        else:
            out_dir = video_p.parent

        out_dir.mkdir(parents=True, exist_ok=True)

        # Extract audio
        audio_path = str(out_dir / f"{video_p.stem}_audio.m4a")
        audio_result = extract_audio(video_path, audio_path)

        if not audio_result["success"]:
            return audio_result

        # Transcribe
        transcript_base = str(out_dir / f"{video_p.stem}_audio")
        transcript_result = transcribe_audio(audio_path, transcript_base)

        return {
            "success": True,
            "video_path": video_path,
            "audio": audio_result,
            "transcript": transcript_result
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

# MCP Server Implementation
def handle_tool_call(tool_name: str, params: dict) -> dict:
    """Handle tool calls from MCP"""
    if tool_name == "extract_audio_from_video":
        return extract_audio(
            params.get("video_path"),
            params.get("output_path")
        )

    elif tool_name == "transcribe_audio":
        return transcribe_audio(
            params.get("audio_path"),
            params.get("output_path")
        )

    elif tool_name == "process_video_full":
        return process_video_full(
            params.get("video_path"),
            params.get("output_dir")
        )

    else:
        return {"error": f"Unknown tool: {tool_name}"}

def main():
    """MCP server main loop"""
    # Read from stdin, write to stdout (MCP protocol)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            tool_name = request.get("tool")
            params = request.get("params", {})

            result = handle_tool_call(tool_name, params)

            response = {
                "success": True,
                "result": result
            }
            print(json.dumps(response))
            sys.stdout.flush()

        except Exception as e:
            error_response = {
                "success": False,
                "error": str(e)
            }
            print(json.dumps(error_response))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
