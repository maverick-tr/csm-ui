"use client";

import { useRef, useEffect, useCallback } from "react";

interface WaveformVisualizerProps {
  audioData: Float32Array | null;
  isPlaying: boolean;
}

const WaveformVisualizer = ({ audioData, isPlaying }: WaveformVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Function to draw the waveform - wrapped in useCallback to avoid recreating on every render
  const drawWaveform = useCallback((ctx: CanvasRenderingContext2D, audioData: Float32Array, timeOffset: number = 0) => {
    if (!canvasRef.current) return;
    
    const { width, height } = canvasRef.current;
    ctx.clearRect(0, 0, width, height);
    
    // Calculate dimensions
    const centerY = height / 2;
    const amplitudeScale = height * 0.35; // Reduced amplitude scale to make waveform smaller
    
    // Pure white color for OLED theme with sharp edges
    ctx.strokeStyle = "#FFFFFF"; // Pure white color
    ctx.lineWidth = 1.5; // Thinner lines for sharper appearance
    ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
    ctx.shadowBlur = 4; // Reduced blur for sharper look
    
    // Start the path
    ctx.beginPath();
    
    // How many samples to skip (for performance)
    const skipFactor = Math.max(1, Math.floor(audioData.length / width / 2));
    
    // Draw the waveform
    for (let i = 0; i < width; i++) {
      const sampleIndex = Math.floor((i / width) * (audioData.length / skipFactor)) * skipFactor;
      
      if (sampleIndex < audioData.length) {
        // Add a ripple effect based on time (reduced effect magnitude)
        const ripple = isPlaying ? 
          Math.sin((i / width * 8) + timeOffset * 4) * 5 * (isPlaying ? 1 : 0) : 0;
        
        const value = audioData[sampleIndex] * amplitudeScale;
        // Reduced jitter for cleaner appearance
        const jitter = isPlaying ? (Math.random() - 0.5) * 1 : 0;
        
        const y = centerY + value + ripple + jitter;
        
        if (i === 0) {
          ctx.moveTo(i, y);
        } else {
          ctx.lineTo(i, y);
        }
      }
    }
    
    // Draw the path
    ctx.stroke();
    
    // Draw mirrored waveform (simplified)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.shadowBlur = 0; // No blur for mirror effect
    ctx.beginPath();
    
    for (let i = 0; i < width; i++) {
      const sampleIndex = Math.floor((i / width) * (audioData.length / skipFactor)) * skipFactor;
      
      if (sampleIndex < audioData.length) {
        const ripple = isPlaying ? 
          Math.sin((i / width * 8) + timeOffset * 4 + Math.PI) * 3 * (isPlaying ? 1 : 0) : 0;
        
        const value = -audioData[sampleIndex] * amplitudeScale * 0.5; // Reduce mirror size
        const jitter = isPlaying ? (Math.random() - 0.5) * 0.5 : 0; // Less jitter
        
        const y = centerY + value + ripple + jitter;
        
        if (i === 0) {
          ctx.moveTo(i, y);
        } else {
          ctx.lineTo(i, y);
        }
      }
    }
    
    ctx.stroke();
    
    // Add a horizontal line in the middle
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.shadowBlur = 0;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }, [isPlaying]); // Only redeclare when isPlaying changes
  
  // Animation function - wrapped in useCallback to avoid recreating on every render
  const animate = useCallback((timestamp: number) => {
    if (!canvasRef.current || !audioData) return;
    
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
      console.log("Animation started");
    }
    
    const timeElapsed = (timestamp - startTimeRef.current) / 1000;
    const ctx = canvasRef.current.getContext("2d");
    
    if (ctx) {
      drawWaveform(ctx, audioData, timeElapsed);
    }
    
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [audioData, drawWaveform, isPlaying]);
  
  // Handle initial setup and static waveform
  useEffect(() => {
    if (!audioData || !canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    
    const resizeCanvas = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      
      // Set display size (CSS)
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      
      // Set actual size in memory (scaled to account for extra pixel density)
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      // Scale the context to ensure correct drawing operations
      ctx.scale(dpr, dpr);
      
      // Draw again to account for the new canvas size
      if (audioData) {
        drawWaveform(ctx, audioData);
      }
    };
    
    resizeCanvas();
    
    // Resize on window resize
    window.addEventListener("resize", resizeCanvas);
    
    // If not playing, draw a static waveform
    if (!isPlaying && ctx) {
      drawWaveform(ctx, audioData);
    }
    
    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [audioData, drawWaveform, isPlaying]);
  
  // Handle animation based on playing state
  useEffect(() => {
    // Clean up previous animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Update timestamp on play/pause
    if (isPlaying) {
      console.log("Starting animation for waveform");
      startTimeRef.current = 0; // Reset start time when playback begins
      animationRef.current = requestAnimationFrame(animate);
    } else {
      // Draw static waveform when paused
      if (canvasRef.current && audioData) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          console.log("Drawing static waveform");
          drawWaveform(ctx, audioData, 0); // Use 0 for static visualization
        }
      }
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animate, audioData, drawWaveform, isPlaying]);
  
  return (
    <div className="relative w-full h-full bg-black/30 rounded-lg overflow-hidden">
      {!audioData && (
        <div className="absolute inset-0 flex items-center justify-center text-white opacity-40">
          Generate audio to see waveform
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
    </div>
  );
};

export default WaveformVisualizer; 