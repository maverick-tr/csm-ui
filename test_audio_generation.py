#!/usr/bin/env python
"""
Test script for audio generation to identify production mode issues.
"""
import os
import sys
import torch
import torchaudio
from generator import load_csm_1b, Segment

def main():
    print("=== Audio Generation Test ===")
    print(f"Python version: {sys.version}")
    print(f"PyTorch version: {torch.__version__}")
    print(f"Working directory: {os.getcwd()}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA device: {torch.cuda.get_device_name(0)}")
    
    # Choose device based on CUDA availability
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    
    # Get model path - use local model if available, otherwise download
    model_path = None
    if os.path.exists("ckpt.pt"):
        model_path = "ckpt.pt"
        print(f"Using local model: {model_path}")
    else:
        print("No local model found, will download from Hugging Face...")
    
    # Test text to generate
    test_text = "This is a test for audio generation in production mode."
    speaker_id = 0
    
    print(f"Loading model and initializing generator...")
    try:
        generator = load_csm_1b(model_path, device)
        print("Generator initialized successfully")
        
        # Generate audio
        print(f"Generating audio for text: '{test_text}'")
        audio = generator.generate(
            text=test_text,
            speaker=speaker_id,
            context=[],
            max_audio_length_ms=10000,
            temperature=0.9,
            topk=50,
        )
        
        # Print audio stats
        print(f"Audio generated: shape={audio.shape}, dtype={audio.dtype}")
        if audio.numel() == 0:
            print(f"WARNING: Generated audio is empty!")
        else:
            print(f"Audio min value: {audio.min().item()}")
            print(f"Audio max value: {audio.max().item()}")
            print(f"Audio mean value: {audio.mean().item()}")
        
        # Save the audio
        output_file = "test_output.wav"
        print(f"Saving audio to {output_file}")
        torchaudio.save(output_file, audio.unsqueeze(0).cpu(), generator.sample_rate)
        
        # Verify the saved file
        if os.path.exists(output_file):
            file_size = os.path.getsize(output_file)
            print(f"Audio saved successfully ({file_size} bytes)")
            if file_size == 0:
                print(f"WARNING: Saved audio file is empty (0 bytes)!")
            else:
                print(f"File size looks good: {file_size} bytes")
        else:
            print(f"ERROR: Failed to save audio file!")
            
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 