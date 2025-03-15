"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import WaveformVisualizer from "@/components/waveform-visualizer";
import AudioInput from "@/components/audio-input";

// Types matching the Python classes
interface Segment {
  speaker: number;
  text: string;
  audio: Float32Array | null;
  audioPath?: string;
}

// Version that can be serialized for storage
interface SerializableSegment {
  speaker: number;
  text: string;
  audioPath?: string;
  // No audio data - it's too large for localStorage
}

interface ContextFile {
  name: string;
  segments: Segment[];
}

// For storage
interface StorableContextFile {
  name: string;
  segments: SerializableSegment[];
}

// Session interface for saving/loading generation settings
interface SavedSession {
  id: string;
  name: string;
  inputText: string;
  selectedSpeaker: number;
  maxAudioLength: number;
  temperature: number;
  topK: number;
  contextName: string | null; // Name of the used context
  createdAt: number; // Timestamp
}

// In-memory cache for audio data
const audioCache: Record<string, Float32Array> = {};

// Add a debug helper function at the top level
const debugAudioElement = (audioUrl: string): Promise<void> => {
  return new Promise((resolve) => {
    const debugAudio = new Audio();
    console.log(`Debug: Creating audio element for ${audioUrl}`);
    
    debugAudio.onloadedmetadata = () => {
      console.log(`Debug: Audio metadata loaded successfully: duration=${debugAudio.duration}s, paused=${debugAudio.paused}`);
      resolve();
    };
    
    debugAudio.onerror = () => {
      console.error(`Debug: Audio element error:`, debugAudio.error);
      resolve(); // Resolve anyway to continue
    };
    
    // Set crossOrigin to anonymous in case of CORS issues
    debugAudio.crossOrigin = "anonymous";
    debugAudio.src = `${audioUrl}?t=${Date.now()}`; // Add cache busting
    
    // Attempt to load without playing
    debugAudio.load();
  });
};

// Add a new function to convert a public audio URL to an API proxy URL
const getProxyAudioUrl = (publicUrl: string): string => {
  if (!publicUrl) return '';
  const filename = publicUrl.split('/').pop();
  if (!filename) return publicUrl;
  return `/api/audio-proxy?filename=${encodeURIComponent(filename)}`;
};

const TTSInterface = () => {
  // User input state
  const [inputText, setInputText] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<number>(0);
  const [maxAudioLength, setMaxAudioLength] = useState<number>(10000); // 10 seconds in ms (default)
  const [temperature, setTemperature] = useState<number>(0.9);
  const [topK, setTopK] = useState<number>(50);
  
  // Wrapped state setters that clear current session name
  const setInputTextAndClearSession = (text: string) => {
    if (currentSessionName) setCurrentSessionName(null);
    setInputText(text);
  };
  
  const setSelectedSpeakerAndClearSession = (speaker: number) => {
    if (currentSessionName) setCurrentSessionName(null);
    setSelectedSpeaker(speaker);
  };
  
  const setMaxAudioLengthAndClearSession = (length: number) => {
    if (currentSessionName) setCurrentSessionName(null);
    setMaxAudioLength(length);
  };
  
  const setTemperatureAndClearSession = (temp: number) => {
    if (currentSessionName) setCurrentSessionName(null);
    setTemperature(temp);
  };
  
  const setTopKAndClearSession = (topk: number) => {
    if (currentSessionName) setCurrentSessionName(null);
    setTopK(topk);
  };
  
  // Context management
  const [contexts, setContexts] = useState<ContextFile[]>([]);
  const [activeContext, setActiveContext] = useState<ContextFile | null>(null);
  const [newContextName, setNewContextName] = useState<string>("");
  
  // Session management
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [sessionName, setSessionName] = useState<string>("");
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(null);
  const [showSaveSessionDialog, setShowSaveSessionDialog] = useState<boolean>(false);
  const [showLoadSessionDialog, setShowLoadSessionDialog] = useState<boolean>(false);

  // Audio state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  
  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // For visualization
  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  
  // For context audio upload
  const [showUploadDialog, setShowUploadDialog] = useState<boolean>(false);
  const [uploadedAudio, setUploadedAudio] = useState<File | null>(null);
  const [uploadAudioUrl, setUploadAudioUrl] = useState<string | null>(null);
  const [uploadAudioData, setUploadAudioData] = useState<Float32Array | null>(null);
  const [uploadText, setUploadText] = useState<string>("");
  const [uploadSpeaker, setUploadSpeaker] = useState<number>(0);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add a new state to track audio loading status
  const [isAudioLoaded, setIsAudioLoaded] = useState<boolean>(false);
  const [loadingAudio, setLoadingAudio] = useState<boolean>(false);

  // Helper functions for storage
  const storeContexts = (contextsToStore: ContextFile[]) => {
    try {
      // Convert to storable format without audio data
      const storableContexts: StorableContextFile[] = contextsToStore.map(ctx => ({
        name: ctx.name,
        segments: ctx.segments.map(segment => ({
          speaker: segment.speaker,
          text: segment.text,
          audioPath: segment.audioPath,
          // Don't include audio data
        }))
      }));
      
      localStorage.setItem("csm-contexts", JSON.stringify(storableContexts));
    } catch (e) {
      console.error("Failed to store contexts:", e);
      toast.error("Failed to save contexts. Your browser's storage may be full.");
    }
  };

  // Store sessions in localStorage
  const storeSessions = (sessionsToStore: SavedSession[]) => {
    try {
      localStorage.setItem("csm-sessions", JSON.stringify(sessionsToStore));
    } catch (e) {
      console.error("Failed to store sessions:", e);
      toast.error("Failed to save sessions. Your browser's storage may be full.");
    }
  };

  // Save current session
  const saveCurrentSession = () => {
    if (!sessionName) {
      toast.error("Please enter a name for your session");
      return;
    }

    const newSession: SavedSession = {
      id: Date.now().toString(),
      name: sessionName,
      inputText,
      selectedSpeaker,
      maxAudioLength,
      temperature,
      topK,
      contextName: activeContext?.name || null,
      createdAt: Date.now(),
    };

    const updatedSessions = [...savedSessions, newSession];
    setSavedSessions(updatedSessions);
    storeSessions(updatedSessions);
    setCurrentSessionName(sessionName);

    setShowSaveSessionDialog(false);
    setSessionName("");
    toast.success(`Session "${sessionName}" saved successfully!`);
  };

  // Load a session
  const loadSession = (session: SavedSession) => {
    setInputText(session.inputText);
    setSelectedSpeaker(session.selectedSpeaker);
    setMaxAudioLength(session.maxAudioLength);
    setTemperature(session.temperature);
    setTopK(session.topK);
    setCurrentSessionName(session.name);
    
    // Set active context if available
    if (session.contextName) {
      const contextToLoad = contexts.find(ctx => ctx.name === session.contextName);
      if (contextToLoad) {
        setActiveContext(contextToLoad);
      }
    }

    setShowLoadSessionDialog(false);
    toast.success(`Session "${session.name}" loaded successfully!`);
  };

  // Delete a session
  const deleteSession = (id: string) => {
    const updatedSessions = savedSessions.filter(session => session.id !== id);
    setSavedSessions(updatedSessions);
    storeSessions(updatedSessions);
    toast.success("Session deleted successfully!");
  };
  
  // Load saved contexts from localStorage
  useEffect(() => {
    const savedContexts = localStorage.getItem("csm-contexts");
    if (savedContexts) {
      try {
        const parsedContexts: StorableContextFile[] = JSON.parse(savedContexts);
        
        // Convert back to full contexts with null audio data
        const loadedContexts: ContextFile[] = parsedContexts.map(ctx => ({
          name: ctx.name,
          segments: ctx.segments.map(segment => ({
            speaker: segment.speaker,
            text: segment.text,
            audioPath: segment.audioPath,
            audio: null // We don't store audio data in localStorage
          }))
        }));
        
        setContexts(loadedContexts);
      } catch (e) {
        console.error("Failed to parse saved contexts", e);
      }
    }

    // Load saved sessions
    const savedSessionsData = localStorage.getItem("csm-sessions");
    if (savedSessionsData) {
      try {
        const parsedSessions: SavedSession[] = JSON.parse(savedSessionsData);
        setSavedSessions(parsedSessions);
      } catch (e) {
        console.error("Failed to parse saved sessions", e);
      }
    }
  }, []);
  
  // Save contexts to localStorage whenever they change
  useEffect(() => {
    if (contexts.length > 0) {
      storeContexts(contexts);
    }
  }, [contexts]);
  
  // Replace the useEffect for audioRef with this enhanced version:
  useEffect(() => {
    const currentAudioRef = audioRef.current;
    if (!currentAudioRef) return;
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    
    currentAudioRef.addEventListener("play", handlePlay);
    currentAudioRef.addEventListener("pause", handlePause);
    currentAudioRef.addEventListener("ended", handleEnded);
    
    return () => {
      currentAudioRef.removeEventListener("play", handlePlay);
      currentAudioRef.removeEventListener("pause", handlePause);
      currentAudioRef.removeEventListener("ended", handleEnded);
    };
  }, []);
  
  // Update the useEffect to handle audio URL changes
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      // Start the loading process
      setLoadingAudio(true);
      setIsAudioLoaded(false);
      
      // Try with both the direct URL and the proxy URL
      // The proxy URL is more reliable in production environments
      const directUrl = `${audioUrl}?t=${Date.now()}`;
      const proxyUrl = `${getProxyAudioUrl(audioUrl)}`;
      
      console.log(`Loading audio, direct URL: ${directUrl}`);
      console.log(`Loading audio, proxy URL: ${proxyUrl}`);
      
      // Capture the current ref to prevent closure issues
      const currentAudioRef = audioRef.current;
      
      // Set crossOrigin to anonymous in case of CORS issues
      currentAudioRef.crossOrigin = "anonymous";
      
      // Add comprehensive event listeners to track loading state
      const handleLoadedData = () => {
        console.log("Audio loaded data event fired");
        setIsAudioLoaded(true);
        setLoadingAudio(false);
      };
      
      const handleCanPlay = () => {
        console.log("Audio can play event fired");
        setIsAudioLoaded(true);
        setLoadingAudio(false);
      };
      
      const handleLoadedMetadata = () => {
        console.log("Audio loaded metadata event fired");
      };
      
      const handleError = () => {
        console.error("Audio element error:", currentAudioRef.error);
        
        // If the direct URL fails, try the proxy URL
        if (currentAudioRef.src === directUrl) {
          console.log("Direct URL failed, trying proxy URL");
          currentAudioRef.src = proxyUrl;
          currentAudioRef.load();
          return;
        }
        
        setLoadingAudio(false);
        toast.error(`Error loading audio: ${currentAudioRef.error?.message || 'Unknown error'}`);
        
        // Try alternative method with a blob
        if (audioUrl) {
          console.log("Attempting to load audio via blob URL");
          fetch(proxyUrl, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
          })
          .then(response => response.blob())
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            console.log("Created blob URL:", blobUrl);
            currentAudioRef.src = blobUrl;
            currentAudioRef.load();
          })
          .catch(err => {
            console.error("Failed to create blob URL:", err);
          });
        }
      };
      
      // Add all event listeners
      currentAudioRef.addEventListener("loadeddata", handleLoadedData);
      currentAudioRef.addEventListener("canplay", handleCanPlay);
      currentAudioRef.addEventListener("loadedmetadata", handleLoadedMetadata);
      currentAudioRef.addEventListener("error", handleError);
      
      // First try the direct URL
      currentAudioRef.src = directUrl;
      currentAudioRef.load();
      
      // Cleanup function
      return () => {
        // Remove all event listeners using the captured ref
        currentAudioRef.removeEventListener("loadeddata", handleLoadedData);
        currentAudioRef.removeEventListener("canplay", handleCanPlay);
        currentAudioRef.removeEventListener("loadedmetadata", handleLoadedMetadata);
        currentAudioRef.removeEventListener("error", handleError);
        
        // Clean up any blob URLs we created
        if (currentAudioRef.src.startsWith('blob:')) {
          URL.revokeObjectURL(currentAudioRef.src);
        }
      };
    }
  }, [audioUrl]);
  
  // Handle upload audio playback state
  useEffect(() => {
    const currentUploadAudioRef = uploadAudioRef.current;
    if (!currentUploadAudioRef) return;
    
    const handlePlay = () => {}; // Handle play if needed
    const handlePause = () => {}; // Handle pause if needed
    const handleEnded = () => {}; // Handle ended if needed
    
    currentUploadAudioRef.addEventListener("play", handlePlay);
    currentUploadAudioRef.addEventListener("pause", handlePause);
    currentUploadAudioRef.addEventListener("ended", handleEnded);
    
    return () => {
      currentUploadAudioRef.removeEventListener("play", handlePlay);
      currentUploadAudioRef.removeEventListener("pause", handlePause);
      currentUploadAudioRef.removeEventListener("ended", handleEnded);
    };
  }, []);
  
  // Update the fetchAudioBuffer function to use the proxy endpoint
  const fetchAudioBuffer = async (url: string) => {
    try {
      // Check cache first
      if (audioCache[url]) {
        console.log(`Using cached audio data for ${url}`);
        return audioCache[url];
      }
      
      // Use both direct and proxy URLs for reliability
      const directUrl = `${url}?t=${Date.now()}`;
      const proxyUrl = getProxyAudioUrl(url);
      
      // First check if the audio element can load the file
      console.log(`Checking if audio file can be loaded with Audio element: ${url}`);
      await debugAudioElement(url);
      
      // Try both URLs for fetching
      let response;
      let fetchUrl;
      
      try {
        console.log(`Fetching audio from direct URL: ${directUrl}`);
        response = await fetch(directUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        fetchUrl = directUrl;
        
        if (!response.ok) {
          throw new Error(`Direct URL failed with status: ${response.status}`);
        }
      } catch (directError) {
        console.log(`Direct URL failed (${directError instanceof Error ? directError.message : 'unknown error'}), trying proxy URL: ${proxyUrl}`);
        response = await fetch(proxyUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        fetchUrl = proxyUrl;
        
        if (!response.ok) {
          throw new Error(`Both direct and proxy URLs failed: ${response.status}`);
        }
      }
      
      console.log(`Audio fetched from ${fetchUrl}, status: ${response.status}, getting arrayBuffer...`);
      const arrayBuffer = await response.arrayBuffer();
      console.log(`ArrayBuffer received, size: ${arrayBuffer.byteLength} bytes`);
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Received empty audio file');
      }
      
      // Try to read the first few bytes to check if it looks like a valid WAV file
      const firstBytes = new Uint8Array(arrayBuffer.slice(0, 12));
      console.log('First 12 bytes of file:', Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      console.log(`Creating AudioContext...`);
      const audioContext = new AudioContext();
      
      console.log(`Decoding audio data...`);
      let audioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        console.error(`Audio decoding failed:`, decodeError);
        throw new Error(`Failed to decode audio: ${decodeError instanceof Error ? decodeError.message : 'Unknown error'}`);
      }
      
      console.log(`Audio decoded successfully, channels: ${audioBuffer.numberOfChannels}, duration: ${audioBuffer.duration}s`);
      
      // Get the first channel data for visualization
      const channelData = audioBuffer.getChannelData(0);
      console.log(`Channel data extracted, length: ${channelData.length}`);
      
      // Cache the result
      audioCache[url] = channelData;
      
      return channelData;
    } catch (error) {
      console.error("Error fetching audio data:", error);
      
      // If there was an error decoding, try to manually create a visualization 
      // for files we know exist but might have decoding issues
      try {
        // Check if the file exists by doing a HEAD request
        const headResponse = await fetch(`${url}?t=${Date.now()}`, { method: 'HEAD' });
        if (headResponse.ok) {
          console.log(`Audio file exists (${headResponse.headers.get('content-length')} bytes) but couldn't be decoded, generating placeholder visualization`);
          
          // Create a simple sine wave as placeholder visualization
          const sampleRate = 24000; // CSM sample rate
          const duration = 5; // 5 seconds as fallback
          const samplesCount = sampleRate * duration;
          const placeholderData = new Float32Array(samplesCount);
          
          // Generate a simple waveform (sine wave with variation)
          for (let i = 0; i < samplesCount; i++) {
            const t = i / sampleRate;
            placeholderData[i] = 0.5 * Math.sin(2 * Math.PI * 440 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t));
          }
          
          // Cache this placeholder
          audioCache[url] = placeholderData;
          toast.warning("Audio visualization may not be accurate, but audio should play correctly");
          
          return placeholderData;
        }
      } catch (e) {
        console.error("Error creating placeholder visualization:", e);
      }
      
      // Last resort - return a minimal visualizer that just shows something
      const placeholderData = new Float32Array(24000 * 3); // 3 seconds of audio
      for (let i = 0; i < placeholderData.length; i++) {
        const t = i / 24000;
        placeholderData[i] = 0.25 * Math.sin(2 * Math.PI * 220 * t);
      }
      
      toast.warning("Audio visualization not available, but audio should still play");
      return placeholderData;
    }
  };
  
  // Call the API endpoint to generate speech
  const generateSpeech = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to generate speech.");
      return;
    }
    
    try {
      setIsProcessing(true);
      setGenerationProgress(10); // Start progress
      
      // Clear current session name when generating new speech
      // as the parameters may have changed
      if (currentSessionName) {
        setCurrentSessionName(null);
      }
      
      // Prepare context data for the API - only include audioPath
      const contextData = activeContext ? 
        activeContext.segments.map(segment => ({
          text: segment.text,
          speaker: segment.speaker,
          audioPath: segment.audioPath, // Use audio path if available
          // Don't include audio data in API calls
        })) : [];
      
      setGenerationProgress(20); // Update progress
      
      // Call our API endpoint
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText,
          speaker: selectedSpeaker,
          context: contextData,
          maxAudioLength,
          temperature,
          topK,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate audio');
      }
      
      setGenerationProgress(60); // Update progress after API call
      
      const data = await response.json();
      
      // Check for warnings in the response
      if (data.warnings) {
        console.log("API warnings:", data.warnings);
        toast.warning("Audio generated with warnings, but should play correctly");
      }
      
      // Get the audio URL from the response
      const generatedAudioUrl = data.audioUrl;
      setAudioUrl(generatedAudioUrl);
      
      // First verify that the audio file exists and is readable
      // This is especially important in production mode
      if (generatedAudioUrl) {
        const audioFilename = generatedAudioUrl.split('/').pop();
        if (audioFilename) {
          try {
            console.log(`Verifying audio file exists: ${audioFilename}`);
            const checkResponse = await fetch(`/api/check-audio?filename=${encodeURIComponent(audioFilename)}`);
            const checkData = await checkResponse.json();
            console.log('Audio file check result:', checkData);
            
            if (checkData.exists && checkData.isReadable) {
              console.log(`Audio file validation successful: ${checkData.size} bytes, valid WAV: ${checkData.wavInfo?.isValidWav}`);
            } else {
              console.error('Audio file validation failed:', checkData);
              toast.error('Generated audio file could not be validated');
            }
          } catch (error) {
            console.error('Error checking audio file:', error);
          }
        }
      }
      
      setGenerationProgress(80); // Update progress before visualization
      
      console.log(`Attempting to fetch audio for visualization from ${generatedAudioUrl}`);
      // Fetch the audio for visualization
      const audioBuffer = await fetchAudioBuffer(generatedAudioUrl);
      if (audioBuffer) {
        console.log(`Audio visualization data received, length: ${audioBuffer.length}`);
        setAudioData(audioBuffer);
        setGenerationProgress(100); // Complete progress
      } else {
        console.error("Failed to get audio visualization data, but audio URL is set");
        // Even if visualization fails, we can still play the audio
        setGenerationProgress(100);
        // Add a small delay and try again in case the file wasn't ready yet
        setTimeout(async () => {
          console.log("Retrying audio visualization fetch...");
          const retryBuffer = await fetchAudioBuffer(generatedAudioUrl);
          if (retryBuffer) {
            console.log(`Retry successful, audio data received, length: ${retryBuffer.length}`);
            setAudioData(retryBuffer);
          }
        }, 1000);
      }
      
      toast.success("Audio generated successfully!");
      
      // Add to context if we have an active context
      if (activeContext) {
        const newSegment: Segment = {
          speaker: selectedSpeaker,
          text: inputText,
          audio: null, // We'll store the path instead
          audioPath: generatedAudioUrl,
        };
        
        const updatedContexts = contexts.map(ctx => {
          if (ctx.name === activeContext.name) {
            return {
              ...ctx,
              segments: [...ctx.segments, newSegment],
            };
          }
          return ctx;
        });
        
        setContexts(updatedContexts);
        
        // Update active context
        const updatedActiveContext = updatedContexts.find(ctx => ctx.name === activeContext.name);
        if (updatedActiveContext) {
          setActiveContext(updatedActiveContext);
        }
      }
    } catch (error) {
      console.error("Error generating speech:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate speech");
    } finally {
      setIsProcessing(false);
      // We leave the progress bar at 100% after success, or reset to 0 on error
      if (generationProgress < 100) {
        setGenerationProgress(0);
      }
    }
  };
  
  // Download generated audio
  const downloadAudio = () => {
    if (!audioUrl) {
      toast.error("No audio available to download");
      return;
    }
    
    try {
      // Get the direct URL to the server-generated audio file
      // This ensures we get the proper WAV file with correct headers
      // Use the proxy URL for better reliability
      const proxyUrl = getProxyAudioUrl(audioUrl);
      console.log(`Downloading audio from proxy URL: ${proxyUrl}`);
      
      // Fetch the audio data and create a download
      fetch(proxyUrl, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to download: ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `csm-speech-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, 100);
        
        toast.success("Audio downloaded successfully");
      })
      .catch(error => {
        console.error("Download error:", error);
        toast.error(`Download failed: ${error.message}`);
        
        // Fallback to direct URL
        const a = document.createElement("a");
        a.href = audioUrl;
        a.download = `csm-speech-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    } catch (error) {
      console.error("Download error:", error);
      
      // Direct fallback method
      const a = document.createElement("a");
      a.href = audioUrl;
      a.download = `csm-speech-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
  
  // Create a new context
  const createContext = () => {
    if (!newContextName) {
      toast.error("Please enter a name for the context");
      return;
    }
    
    if (contexts.some(ctx => ctx.name === newContextName)) {
      toast.error("A context with this name already exists");
      return;
    }
    
    const newContext: ContextFile = {
      name: newContextName,
      segments: [],
    };
    
    setContexts([...contexts, newContext]);
    setActiveContext(newContext);
    setNewContextName("");
    
    toast.success(`Context "${newContextName}" created and set as active`);
  };
  
  // Set active context
  const handleSetActiveContext = (contextName: string) => {
    const context = contexts.find(ctx => ctx.name === contextName);
    if (context) {
      setActiveContext(context);
      toast.success(`Context "${contextName}" set as active`);
    }
  };
  
  // Delete a context
  const deleteContext = (contextName: string) => {
    setContexts(contexts.filter(ctx => ctx.name !== contextName));
    
    if (activeContext && activeContext.name === contextName) {
      setActiveContext(null);
    }
    
    toast.success(`Context "${contextName}" deleted`);
  };
  
  // Add uploaded audio to context
  const handleAddToContext = () => {
    if (!activeContext) {
      toast.error("Please select an active context first");
      return;
    }
    
    if (!uploadedAudio || !uploadAudioUrl) {
      toast.error("Please upload an audio file first");
      return;
    }
    
    if (!uploadText.trim()) {
      toast.error("Please enter text for this audio segment");
      return;
    }
    
    // Create a new segment with the uploaded audio
    const newSegment: Segment = {
      speaker: uploadSpeaker,
      text: uploadText,
      audio: uploadAudioData,
      audioPath: uploadAudioUrl || undefined, // Store the local URL for playback
    };
    
    // Update the contexts state
    const updatedContexts = contexts.map(ctx => {
      if (ctx.name === activeContext.name) {
        return {
          ...ctx,
          segments: [...ctx.segments, newSegment],
        };
      }
      return ctx;
    });
    
    setContexts(updatedContexts);
    
    // Update the active context
    const updatedActiveContext = updatedContexts.find(ctx => ctx.name === activeContext.name);
    if (updatedActiveContext) {
      setActiveContext(updatedActiveContext);
    }
    
    // Reset upload state
    setUploadedAudio(null);
    setUploadAudioUrl(null);
    setUploadAudioData(null);
    setUploadText("");
    setUploadSpeaker(0);
    setShowUploadDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    
    toast.success("Audio added to context");
  };
  
  // Handle keyboard shortcuts for audio controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only capture space key for audio control when not in a text input or textarea
      const activeElement = document.activeElement;
      const isInputActive = activeElement instanceof HTMLInputElement || 
                           activeElement instanceof HTMLTextAreaElement ||
                           activeElement?.getAttribute('role') === 'textbox';
      
      // Space = Play/Pause only when not typing in an input
      if (e.key === " " && audioRef.current && audioUrl && !isInputActive) {
        e.preventDefault();
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying, audioUrl]);
  
  // Add a manual playback function to ensure audio and animation are in sync
  const playAudio = () => {
    if (audioRef.current && isAudioLoaded) {
      console.log("Manually playing audio");
      audioRef.current.play()
        .then(() => {
          console.log("Audio playback started successfully");
          setIsPlaying(true);
        })
        .catch(error => {
          console.error("Error starting audio playback:", error);
          toast.error("Couldn't start audio playback. Try clicking the play button again.");
        });
    } else if (audioRef.current && !isAudioLoaded) {
      console.log("Audio not yet loaded, waiting...");
      toast.info("Audio is still loading, please wait...");
    }
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="w-full h-full">
      <Tabs defaultValue="generate" className="w-full">
        <div className="flex justify-center">
          <TabsList className="mb-4">
            <TabsTrigger value="generate">Generate Speech</TabsTrigger>
            <TabsTrigger value="manage-context">Manage Context</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="generate" className="mt-0">
          <div className="flex flex-col gap-3 p-6 bg-card rounded-lg shadow">
            {/* Active Context Display */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Active Context:</span>
                {activeContext ? (
                  <span className="text-sm px-2 py-1 bg-muted rounded-md">
                    {activeContext.name} ({activeContext.segments.length} segments)
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
                {currentSessionName && (
                  <span className="text-sm px-2 py-1 bg-primary/20 text-primary rounded-md ml-1 border border-primary/30">
                    Session: {currentSessionName}
                  </span>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowSaveSessionDialog(true)}
                  className="text-white border-white/20 hover:bg-white/10"
                >
                  Save Session
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowLoadSessionDialog(true)}
                  className="text-white border-white/20 hover:bg-white/10"
                >
                  Load Session
                </Button>
              </div>
            </div>
            
            {/* Input Area */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Speaker</label>
                <Select
                  value={selectedSpeaker.toString()}
                  onValueChange={(value) => setSelectedSpeakerAndClearSession(parseInt(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select speaker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Speaker 0</SelectItem>
                    <SelectItem value="1">Speaker 1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Text to Speak</label>
                <AudioInput
                  initialText={inputText}
                  onTextChange={(text) => setInputTextAndClearSession(text)}
                  onAudioCaptured={(blob, transcript) => {
                    setInputTextAndClearSession(transcript);
                  }}
                  placeholder="Enter text or record/upload audio to convert to speech..."
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Max Audio Length: {(maxAudioLength / 1000).toFixed(1)}s (upper limit only)
                  </label>
                  <Slider
                    min={5000}  // Minimum 5 seconds
                    max={30000} // Maximum 30 seconds
                    step={1000}
                    value={[maxAudioLength]}
                    onValueChange={(value) => setMaxAudioLengthAndClearSession(value[0])}
                    className="[&>[role=slider]]:bg-white [&>.slider-track]:bg-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Temperature: {temperature.toFixed(2)}
                  </label>
                  <Slider
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    value={[temperature]}
                    onValueChange={(value) => setTemperatureAndClearSession(value[0])}
                    className="[&>[role=slider]]:bg-white [&>.slider-track]:bg-white/50"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Top-K: {topK}
                </label>
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={[topK]}
                  onValueChange={(value) => setTopKAndClearSession(value[0])}
                  className="[&>[role=slider]]:bg-white [&>.slider-track]:bg-white/50"
                />
              </div>
              
              <Button 
                className="w-full bg-white text-black hover:bg-white/90" 
                onClick={generateSpeech} 
                disabled={isProcessing}
              >
                {isProcessing ? "Generating..." : "Generate Speech"}
              </Button>
              
              {isProcessing && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Processing</span>
                    <span>{generationProgress}%</span>
                  </div>
                  <Progress value={generationProgress} className="h-2 [&>div]:bg-white" />
                </div>
              )}
            </div>
            
            {/* Audio Player and Visualization */}
            <div className="mt-2">
              {audioData ? (
                <div 
                  className="aspect-[16/4] bg-black rounded-lg overflow-hidden relative cursor-pointer"
                  onClick={() => isPlaying ? pauseAudio() : playAudio()}
                >
                  <WaveformVisualizer audioData={audioData} isPlaying={isPlaying} />
                  
                  {/* Custom play/pause button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-16 h-16 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0' : 'opacity-100'} hover:opacity-100`}>
                      {isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                          <rect x="6" y="4" width="4" height="16"></rect>
                          <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                          <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  {loadingAudio && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                    </div>
                  )}
                </div>
              ) : audioUrl ? (
                <div className="aspect-[16/4] bg-black rounded-lg overflow-hidden relative flex items-center justify-center">
                  <div className="text-white/50 text-sm">
                    Audio is available for playback but visualization could not be generated.
                  </div>
                  
                  {loadingAudio && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-12 flex items-center justify-center text-sm text-white/10 border border-white/10 rounded-lg">
                  
                </div>
              )}
              
              <div className="mt-2 flex items-center justify-between gap-4">
                <div className="flex-1">
                  {audioUrl && (
                    <audio
                      ref={audioRef}
                      controls
                      className="w-full"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      crossOrigin="anonymous"
                      preload="auto"
                    />
                  )}
                </div>
                
                {audioUrl && (
                  <Button onClick={downloadAudio} variant="outline" size="sm" className="text-white border-white/20 hover:bg-white/10">
                    Download
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
        
        {/* Save Session Dialog */}
        <Dialog open={showSaveSessionDialog} onOpenChange={setShowSaveSessionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Current Session</DialogTitle>
              <DialogDescription>
                Save your current settings, text, and active context for future use.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Session Name</label>
                <Input
                  placeholder="Enter a name for this session"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Session will include:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Current text: &quot;{inputText.length > 20 ? inputText.substring(0, 20) + '...' : inputText}&quot;</li>
                  <li>• Speaker: {selectedSpeaker}</li>
                  <li>• Max Length: {(maxAudioLength / 1000).toFixed(1)}s</li>
                  <li>• Temperature: {temperature.toFixed(2)}</li>
                  <li>• Top-K: {topK}</li>
                  <li>• Active Context: {activeContext?.name || 'None'}</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveSessionDialog(false)} className="border-white/20 hover:bg-white/10">
                Cancel
              </Button>
              <Button onClick={saveCurrentSession} className="bg-white text-black hover:bg-white/90">
                Save Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Load Session Dialog */}
        <Dialog open={showLoadSessionDialog} onOpenChange={setShowLoadSessionDialog}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Load Saved Session</DialogTitle>
              <DialogDescription>
                Choose a previously saved session to restore those settings.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[400px] overflow-y-auto">
              {savedSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No saved sessions yet. Generate some speech and save your settings first.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedSessions.map((session) => (
                    <Card key={session.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{session.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {new Date(session.createdAt).toLocaleString()}
                          </p>
                          <p className="text-sm truncate max-w-[300px] mt-2">
                            &quot;{session.inputText}&quot;
                          </p>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <span className="mr-2">Speaker: {session.selectedSpeaker}</span>
                            <span className="mr-2">Context: {session.contextName || 'None'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => loadSession(session)}
                            className="bg-white text-black hover:bg-white/90"
                          >
                            Load
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => deleteSession(session.id)}
                            className="border-white/20 text-white hover:bg-white/10"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLoadSessionDialog(false)} className="border-white/20 hover:bg-white/10">
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <TabsContent value="manage-context" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Context Management</CardTitle>
              <CardDescription>
                Manage conversation contexts to improve speech generation quality.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Enter context name"
                  value={newContextName}
                  onChange={(e) => setNewContextName(e.target.value)}
                />
                <Button onClick={createContext} className="bg-white text-black hover:bg-white/90">
                  Create
                </Button>
              </div>
              
              <div className="flex items-center justify-between py-4 border-b">
                <div className="font-medium">Saved Contexts</div>
                
                {activeContext && (
                  <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowUploadDialog(true)}
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        Add Audio to Context
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] px-6 overflow-hidden">
                      <DialogHeader>
                        <DialogTitle>Add Audio to Context</DialogTitle>
                        <DialogDescription>
                          Add existing audio to use as context for better quality speech generation.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 my-4 mx-1 overflow-x-hidden">
                        <div className="space-y-2">
                          <AudioInput
                            initialText={uploadText}
                            onTextChange={(text) => setUploadText(text)}
                            onAudioCaptured={(blob, transcript) => {
                              setUploadedAudio(new File([blob], "recorded-audio.wav", { type: "audio/wav" }));
                              setUploadAudioUrl(URL.createObjectURL(blob));
                              setUploadText(transcript);
                              
                              // Get audio data for visualization
                              const fileReader = new FileReader();
                              fileReader.onload = async (e) => {
                                const arrayBuffer = e.target?.result as ArrayBuffer;
                                const audioContext = new AudioContext();
                                const audioData = await audioContext.decodeAudioData(arrayBuffer);
                                const float32Array = audioData.getChannelData(0);
                                setUploadAudioData(float32Array);
                              };
                              fileReader.readAsArrayBuffer(blob);
                            }}
                            placeholder="Enter transcript or record/upload audio..."
                          />
                        </div>
                        
                        {uploadAudioData && (
                          <div className="mt-2">
                            <div className="font-medium text-sm mb-2">Audio Waveform</div>
                            <div className="h-24 w-full pr-2">
                              <WaveformVisualizer audioData={uploadAudioData} isPlaying={false} />
                            </div>
                          </div>
                        )}
                        
                        <div className="space-y-2 mt-4">
                          <div className="font-medium text-sm">Speaker</div>
                          <Select 
                            value={uploadSpeaker.toString()}
                            onValueChange={(value) => setUploadSpeaker(parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select speaker" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Speaker 0</SelectItem>
                              <SelectItem value="1">Speaker 1</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowUploadDialog(false)} className="border-white/20 hover:bg-white/10">
                          Cancel
                        </Button>
                        <Button onClick={handleAddToContext} disabled={!uploadedAudio || !uploadText.trim()} className="bg-white text-black hover:bg-white/90">
                          Add to Context
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              
              <div className="space-y-4">
                {contexts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No saved contexts yet</div>
                ) : (
                  <div className="space-y-2">
                    {contexts.map((context) => (
                      <Card key={context.name} className={`${activeContext?.name === context.name ? 'border-primary' : ''}`}>
                        <CardHeader className="p-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{context.name}</CardTitle>
                            <div className="flex space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleSetActiveContext(context.name)}
                                className="border-white/20 text-white hover:bg-white/10"
                              >
                                {activeContext?.name === context.name ? "Active" : "Use"}
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => deleteContext(context.name)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="text-sm text-muted-foreground">
                            {context.segments.length} segment{context.segments.length === 1 ? '' : 's'}
                          </div>
                          {context.segments.length > 0 && (
                            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                              {context.segments.map((segment, idx) => (
                                <div key={idx} className="text-xs p-2 rounded bg-muted flex items-start">
                                  <span className="font-bold mr-2">Speaker {segment.speaker}:</span>
                                  <span className="truncate">{segment.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TTSInterface; 