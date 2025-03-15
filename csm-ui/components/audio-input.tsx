import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mic, Upload, StopCircle, RefreshCw } from "lucide-react";

// Types
interface AudioInputProps {
  onAudioCaptured: (audioBlob: Blob, transcript: string) => void;
  onTextChange?: (text: string) => void;
  placeholder?: string;
  initialText?: string;
  className?: string;
}

const AudioInput = ({
  onAudioCaptured,
  onTextChange,
  placeholder = "Enter text or record/upload audio...",
  initialText = "",
  className = "",
}: AudioInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [text, setText] = useState(initialText);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  useEffect(() => {
    // Clean up media recorder on unmount
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  // Update parent component text when local text changes
  useEffect(() => {
    if (onTextChange) {
      onTextChange(text);
    }
  }, [text, onTextChange]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        
        // Immediately transcribe the recorded audio
        await transcribeAudio(audioBlob);
        
        // Stop all tracks on the stream to turn off the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      setIsRecording(true);
      mediaRecorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if file is an audio file
    if (!file.type.startsWith('audio/')) {
      toast.error('Please upload an audio file');
      return;
    }

    setAudioBlob(file);
    await transcribeAudio(file);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    
    try {
      const formData = new FormData();
      formData.append('audio', blob);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      // Update the text field with transcription
      setText(result.text);
      
      // Pass the audio and transcript to the parent
      onAudioCaptured(blob, result.text);
      
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast.error('Failed to transcribe audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const resetAudio = () => {
    setAudioBlob(null);
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Textarea
        placeholder={placeholder}
        value={text}
        onChange={handleTextChange}
        className="min-h-24 resize-y"
      />
      
      <div className="flex flex-wrap items-center gap-2 pr-1">
        {!isRecording ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={startRecording}
            disabled={isTranscribing}
            title="Record audio"
          >
            <Mic className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={stopRecording}
            title="Stop recording"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        )}
        
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={triggerFileInput}
          disabled={isRecording || isTranscribing}
          title="Upload audio file"
        >
          <Upload className="h-4 w-4" />
        </Button>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="audio/*"
          className="hidden"
        />
        
        {audioBlob && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={resetAudio}
              title="Clear audio"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            
            <audio controls src={URL.createObjectURL(audioBlob)} className="h-8 ml-2 max-w-[180px]" />
          </>
        )}
        
        {isTranscribing && (
          <div className="text-sm text-muted-foreground animate-pulse ml-2 mr-2 whitespace-nowrap">
            Transcribing...
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioInput; 