import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

// This function will call our Python script to generate audio
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get parameters from request body
    const { text, speaker, context, maxAudioLength, temperature, topK } = req.body;

    if (!text || speaker === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Determine base directory for file operations
    // In production, process.cwd() might not be what we expect,
    // so we calculate the project root based on the __dirname
    
    // Get the project root directory
    // For Pages Router, we need to go up from /pages/api to get to project root
    const projectRoot = path.resolve(process.cwd());
    
    // Create a temporary file for the context if provided
    let contextFile = '';
    if (context && context.length > 0) {
      const contextId = uuidv4();
      const tmpDir = path.join(projectRoot, 'tmp');
      contextFile = path.join(tmpDir, `${contextId}.json`);
      
      // Make sure tmp directory exists
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      fs.writeFileSync(contextFile, JSON.stringify(context));
    }

    // Generate a unique ID for this audio file
    const audioId = uuidv4();
    const audioDir = path.join(projectRoot, 'public', 'audio');
    const outputFile = path.join(audioDir, `${audioId}.wav`);
    
    // Make sure audio directory exists
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Get the absolute path to the Python script
    // In production, we need to ensure we're pointing to the correct location
    const pythonScriptPath = path.join(projectRoot, '..', 'generate_speech.py');
    
    // Use the Python interpreter from the virtual environment
    // This is critical for production mode where the environment might not be activated
    // The path is different depending on the OS
    const isWindows = os.platform() === 'win32';
    const pythonInterpreter = path.join(
      projectRoot,
      '..',
      '.venv',
      isWindows ? 'Scripts' : 'bin',
      isWindows ? 'python.exe' : 'python'
    );
    
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Project root:', projectRoot);
    console.log('Python script path:', pythonScriptPath);
    console.log('Python interpreter:', pythonInterpreter);
    console.log('Output file path:', outputFile);
    
    // Use the Python interpreter from the virtual environment instead of system Python
    let cmd = `"${pythonInterpreter}" "${pythonScriptPath}" --text "${text.replace(/"/g, '\\"')}" --speaker ${speaker} --output "${outputFile}"`;
    
    if (contextFile) {
      cmd += ` --context "${contextFile}"`;
    }
    
    // Only add max_audio_length if it's explicitly required
    // This allows CSM to determine natural speech length
    if (maxAudioLength) {
      // Rename the parameter to make it clearer that it's a maximum limit, not a target length
      cmd += ` --max_audio_length ${maxAudioLength}`;
    }
    
    if (temperature) {
      cmd += ` --temperature ${temperature}`;
    }
    
    if (topK) {
      cmd += ` --topk ${topK}`;
    }

    console.log('Executing command:', cmd);

    // Execute the Python script
    exec(cmd, (error, stdout, stderr) => {
      // Clean up the temporary context file if it exists
      if (contextFile && fs.existsSync(contextFile)) {
        fs.unlinkSync(contextFile);
      }

      if (error) {
        console.error(`Execution error: ${error}`);
        console.error(`Stderr: ${stderr}`);
        console.error(`Stdout: ${stdout}`);
        
        // Check if we still have a valid audio file despite the error
        // This can happen with the 'NoneType' object has no attribute 'cadam32bit_grad_fp32' warning
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          if (stats.size > 0) {
            console.log(`Warning occurred but audio was generated successfully: ${outputFile} (${stats.size} bytes)`);
            
            // Return the URL to the generated audio file even though there was a warning
            return res.status(200).json({ 
              audioUrl: `/audio/${audioId}.wav`,
              sampleRate: 24000, // CSM's sample rate
              warnings: stderr || "Warning encountered but audio generated successfully"
            });
          }
        }
        
        return res.status(500).json({ error: 'Failed to generate audio', details: stderr });
      }

      console.log(`Command output: ${stdout}`);
      
      // Check if the output file was created
      if (!fs.existsSync(outputFile)) {
        console.error(`Output file not created: ${outputFile}`);
        return res.status(500).json({ error: 'Output file was not created' });
      }
      
      // Get file size to make sure it's not empty
      const stats = fs.statSync(outputFile);
      if (stats.size === 0) {
        console.error(`Output file is empty: ${outputFile}`);
        return res.status(500).json({ error: 'Generated audio file is empty' });
      }
      
      console.log(`Audio file created successfully: ${outputFile} (${stats.size} bytes)`);
      
      // Check for warnings in output
      const warnings = stdout.includes("Warning:") || stderr ? (stderr || stdout) : null;
      
      // Log important information to help diagnose production issues
      console.log(`Returning audio URL: /audio/${audioId}.wav (${stats.size} bytes)`);
      if (warnings) {
        console.log(`With warnings: ${warnings.substring(0, 100)}...`);
      }
      
      // Set Cache-Control headers to prevent caching issues in production
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      
      // Return the URL to the generated audio file
      return res.status(200).json({ 
        audioUrl: `/audio/${audioId}.wav`,
        sampleRate: 24000, // CSM's sample rate
        warnings: warnings,
        fileSize: stats.size, // Include file size for debugging
        timestamp: Date.now() // Add timestamp to help with caching issues
      });
    });
  } catch (error) {
    console.error('Error generating speech:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 