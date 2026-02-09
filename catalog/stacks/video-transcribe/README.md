# Video Transcribe Stack

Extract audio from video files and transcribe using local Whisper.

## Features

- Extract audio from video files (MOV, MP4, etc.)
- Transcribe audio using whisper-cli (local, fast)
- Process videos end-to-end (extract + transcribe)
- Save transcripts as text and JSON
- No API keys required - fully local

## Requirements

- ffmpeg (`/opt/homebrew/bin/ffmpeg`)
- whisper-cli (`/opt/homebrew/bin/whisper-cli`)
- Whisper model (`~/.whisper-models/ggml-base.en.bin`)

## Tools

### `extract_audio_from_video`

Extract audio track from a video file.

**Parameters:**
- `video_path` (string, required): Path to video file
- `output_path` (string, required): Where to save extracted audio

**Returns:**
```json
{
  "success": true,
  "output_path": "/path/to/audio.m4a",
  "size_bytes": 1234567,
  "size_mb": 1.18
}
```

### `transcribe_audio`

Transcribe an audio file using Whisper.

**Parameters:**
- `audio_path` (string, required): Path to audio file
- `output_path` (string, optional): Base path for saving transcript files

**Returns:**
```json
{
  "success": true,
  "transcript": "transcribed text here...",
  "duration_seconds": 70.12,
  "duration_formatted": "1:10",
  "word_count": 231,
  "transcribed_at": "2026-01-17T12:00:00",
  "txt_path": "/path/to/transcript.txt",
  "json_path": "/path/to/transcript.json"
}
```

### `process_video_full`

Extract audio and transcribe in one operation.

**Parameters:**
- `video_path` (string, required): Path to video file
- `output_dir` (string, optional): Directory for outputs (defaults to video location)

**Returns:**
```json
{
  "success": true,
  "video_path": "/path/to/video.mov",
  "audio": { ... },
  "transcript": { ... }
}
```

## Usage Example

```python
# Process a video from iCloud inbox
result = process_video_full(
    video_path="/Users/hoff/Library/Mobile Documents/com~apple~CloudDocs/inbox/IMG_5107.MOV",
    output_dir="/Users/hoff/Library/Mobile Documents/com~apple~CloudDocs/inbox"
)
```

## Workflow Integration

This stack is designed to work with the iCloud inbox workflow:

1. Video lands in `/Users/hoff/Library/Mobile Documents/com~apple~CloudDocs/inbox`
2. `process_video_full` extracts audio and transcribes
3. Output files saved in same inbox folder:
   - `video.MOV` (original)
   - `video_audio.m4a` (extracted audio)
   - `video_audio.txt` (transcript)
   - `video_audio.json` (metadata + transcript)

All files sync to iCloud automatically.
