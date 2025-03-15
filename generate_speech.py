import argparse
import json
import os
import sys
import torch
import torchaudio
import traceback
from huggingface_hub import hf_hub_download
from generator import load_csm_1b, Segment

def main():
    try:
        print(f"=== CSM Speech Generator Debug ===")
        print(f"Python version: {sys.version}")
        print(f"PyTorch version: {torch.__version__}")
        print(f"Working directory: {os.getcwd()}")
        
        parser = argparse.ArgumentParser(description='Generate speech using CSM 1B')
        parser.add_argument('--text', type=str, required=True, help='Text to convert to speech')
        parser.add_argument('--speaker', type=int, default=0, help='Speaker ID (0 or 1)')
        parser.add_argument('--output', type=str, required=True, help='Output audio file path')
        parser.add_argument('--context', type=str, help='Path to context JSON file')
        parser.add_argument('--max_audio_length', type=int, default=10000, 
                           help='Maximum audio length in ms (not a target length, the model will output shorter audio when appropriate)')
        parser.add_argument('--temperature', type=float, default=0.9, help='Temperature for sampling')
        parser.add_argument('--topk', type=int, default=50, help='Top-K for sampling')
        parser.add_argument('--model_path', type=str, help='Path to model checkpoint')
        parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu', 
                            help='Device to run model on')
        
        args = parser.parse_args()
        
        print(f"Received arguments:")
        print(f"  Text: {args.text}")
        print(f"  Speaker: {args.speaker}")
        print(f"  Output path: {args.output}")
        print(f"  Context file: {args.context if args.context else 'None'}")
        print(f"  Device: {args.device}")
        
        # Check if output directory exists
        output_dir = os.path.dirname(args.output)
        print(f"Output directory: {output_dir}")
        
        if output_dir and not os.path.exists(output_dir):
            print(f"Creating output directory: {output_dir}")
            os.makedirs(output_dir, exist_ok=True)
        
        # Check if output directory is writable
        if output_dir:
            test_file = os.path.join(output_dir, ".write_test")
            try:
                with open(test_file, 'w') as f:
                    f.write("test")
                os.remove(test_file)
                print(f"Output directory is writable")
            except Exception as e:
                print(f"WARNING: Output directory is not writable: {e}")
        
        # Load model
        print(f"Loading model...")
        if args.model_path and os.path.exists(args.model_path):
            # Use explicit model path if provided and exists
            model_path = args.model_path
            print(f"Using provided model path: {model_path}")
        else:
            # Check for local model in common locations
            local_model_paths = [
                "ckpt.pt",  # Current directory
                os.path.join(os.path.dirname(os.getcwd()), "ckpt.pt"),  # Parent directory
                os.path.expanduser("~/.cache/huggingface/hub/models--sesame--csm-1b/snapshots/d8622e3e950f9875853f8345deb2519a02957bcb/ckpt.pt")
            ]
            
            for path in local_model_paths:
                if os.path.exists(path):
                    model_path = path
                    print(f"Found local model at: {model_path}")
                    break
            else:
                # Download model if not found locally
                print(f"Downloading model from Hugging Face...")
                try:
                    model_path = hf_hub_download(repo_id="sesame/csm-1b", filename="ckpt.pt")
                    print(f"Model downloaded to: {model_path}")
                except Exception as e:
                    print(f"Error downloading model: {e}")
                    raise
        
        # Verify model exists
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found at {model_path}")
            
        # Initialize generator
        print(f"Initializing generator on {args.device}...")
        try:
            # Explicitly pass the model path
            generator = load_csm_1b(ckpt_path=model_path, device=args.device)
            print(f"Generator initialized")
        except Exception as e:
            print(f"Error initializing generator: {e}")
            print(traceback.format_exc())
            raise
        
        # Load context if provided
        context = []
        if args.context and os.path.exists(args.context):
            print(f"Loading context from {args.context}")
            try:
                with open(args.context, 'r') as f:
                    context_data = json.load(f)
                
                print(f"Context data loaded, {len(context_data)} segments found")
                    
                for i, segment in enumerate(context_data):
                    try:
                        # If audio path is provided, load audio from file
                        if 'audioPath' in segment and os.path.exists(segment['audioPath']):
                            print(f"Loading audio from path for segment {i}: {segment['audioPath']}")
                            audio_tensor, sample_rate = torchaudio.load(segment['audioPath'])
                            audio_tensor = torchaudio.functional.resample(
                                audio_tensor.squeeze(0), 
                                orig_freq=sample_rate, 
                                new_freq=generator.sample_rate
                            )
                            print(f"Audio loaded and resampled from {sample_rate} to {generator.sample_rate}")
                        elif 'audio' in segment and segment['audio']:
                            # If audio data is provided directly (as array)
                            print(f"Using provided audio data for segment {i}")
                            audio_tensor = torch.tensor(segment['audio'], dtype=torch.float32)
                        else:
                            # Skip segments without audio
                            print(f"Skipping segment {i} - no audio data")
                            continue
                        
                        context.append(
                            Segment(
                                text=segment['text'],
                                speaker=segment['speaker'],
                                audio=audio_tensor
                            )
                        )
                        print(f"Added segment {i} to context")
                    except Exception as e:
                        print(f"Error processing context segment {i}: {e}")
                        print(traceback.format_exc())
                
                print(f"Final context contains {len(context)} segments")
            except Exception as e:
                print(f"Error loading context: {e}")
                print(traceback.format_exc())
                context = []
        else:
            print(f"No context provided or context file not found")
        
        # Generate speech
        print(f"Generating speech...")
        try:
            audio = generator.generate(
                text=args.text,
                speaker=args.speaker,
                context=context,
                max_audio_length_ms=args.max_audio_length,
                temperature=args.temperature,
                topk=args.topk,
            )
        except Exception as e:
            print(f"Error during audio generation: {e}")
            print(traceback.format_exc())
            raise
        
        # Check the generated audio
        print(f"Audio generated: shape={audio.shape}, dtype={audio.dtype}")
        if audio.numel() == 0:
            print(f"WARNING: Generated audio is empty!")
        
        # Print audio stats to verify it's not empty
        if audio.numel() > 0:
            print(f"Audio min value: {audio.min().item()}")
            print(f"Audio max value: {audio.max().item()}")
            print(f"Audio mean value: {audio.mean().item()}")
        
        # Save audio
        print(f"Saving audio to {args.output}...")
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        torchaudio.save(args.output, audio.unsqueeze(0).cpu(), generator.sample_rate)
        
        # Verify the saved file
        if os.path.exists(args.output):
            file_size = os.path.getsize(args.output)
            print(f"Audio saved to {args.output} ({file_size} bytes)")
            if file_size == 0:
                print(f"WARNING: Saved audio file is empty (0 bytes)!")
            else:
                print(f"File size looks good: {file_size} bytes")
        else:
            print(f"ERROR: Failed to save audio file, {args.output} does not exist!")

    except Exception as e:
        print(f"ERROR: Unhandled exception: {e}")
        print(traceback.format_exc())
        raise

if __name__ == "__main__":
    main() 