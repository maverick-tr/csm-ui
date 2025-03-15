import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import formidable from 'formidable';
import os from 'os';

// Disable body parsing to handle form-data with files
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the multipart form data
    const form = formidable({ multiples: false });
    
    const [, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Check if file exists
    const audioFileField = files.audio;
    if (!audioFileField) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const audioFile = Array.isArray(audioFileField) ? audioFileField[0] : audioFileField;

    // Determine base directory for file operations
    // In production, process.cwd() might not be what we expect
    
    // Get the project root directory
    const projectRoot = path.resolve(process.cwd());
    
    // Create unique ID for the temporary file
    const audioId = uuidv4();
    const tmpDir = path.join(projectRoot, 'tmp');
    const tempFilePath = path.join(tmpDir, `${audioId}${path.extname(audioFile.originalFilename || '.wav')}`);
    
    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    console.log('Environment:', process.env.NODE_ENV);
    console.log('Project root:', projectRoot);
    console.log('Temp file path:', tempFilePath);

    // Read the uploaded file and save it to the temp path
    const data = fs.readFileSync(audioFile.filepath);
    fs.writeFileSync(tempFilePath, data);

    // Create a Python script to transcribe the audio
    const transcribeScript = path.join(projectRoot, '..', 'transcribe_audio.py');
    
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
    
    console.log('Transcribe script path:', transcribeScript);
    console.log('Python interpreter:', pythonInterpreter);
    
    // Construct the command using the venv Python interpreter
    const cmd = `"${pythonInterpreter}" "${transcribeScript}" --audio "${tempFilePath}"`;
    console.log('Executing command:', cmd);
    
    // Execute the Python script
    exec(cmd, (error, stdout, stderr) => {
      // Clean up the temporary audio file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      if (error) {
        console.error(`Execution error: ${error}`);
        console.error(`Stderr: ${stderr}`);
        console.error(`Stdout: ${stdout}`);
        return res.status(500).json({ error: 'Failed to transcribe audio', details: stderr });
      }

      console.log(`Command output: ${stdout}`);

      // Parse the output to get the transcription
      try {
        const result = JSON.parse(stdout);
        return res.status(200).json(result);
      } catch (parseError) {
        return res.status(500).json({ 
          error: 'Failed to parse transcription result', 
          details: stdout,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
        });
      }
    });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 