import argparse
import json
import os
import sys
import whisper
from huggingface_hub import hf_hub_download
import torch

def main():
    parser = argparse.ArgumentParser(description='Transcribe audio using Whisper')
    parser.add_argument('--audio', type=str, required=True, help='Path to audio file')
    parser.add_argument('--model', type=str, default='base', help='Whisper model to use (tiny, base, small, medium, large)')
    
    args = parser.parse_args()
    
    # Check if audio file exists
    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"Audio file not found: {args.audio}"}))
        sys.exit(1)
    
    try:
        # Load the Whisper model (will download on first run)
        print(f"Loading Whisper {args.model} model...", file=sys.stderr)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = whisper.load_model(args.model, device=device)
        
        # Transcribe the audio
        print(f"Transcribing audio...", file=sys.stderr)
        result = model.transcribe(args.audio)
        
        # Return the result as JSON
        output = {
            "text": result["text"].strip(),
            "segments": result["segments"],
            "language": result["language"]
        }
        
        print(json.dumps(output))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main() 