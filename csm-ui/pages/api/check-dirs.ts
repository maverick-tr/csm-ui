import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import os from 'os';

// This API endpoint is for diagnostic purposes to check paths and permissions
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const projectRoot = path.resolve(process.cwd());
    const audioDir = path.join(projectRoot, 'public', 'audio');
    const tmpDir = path.join(projectRoot, 'tmp');
    const pythonScriptPath = path.join(projectRoot, '..', 'generate_speech.py');
    const transcribeScriptPath = path.join(projectRoot, '..', 'transcribe_audio.py');
    
    // Create directories if they don't exist (for testing)
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    // Check if we can write to the directories
    let audioWritable = false;
    let tmpWritable = false;
    
    try {
      const testAudioFile = path.join(audioDir, 'test.txt');
      fs.writeFileSync(testAudioFile, 'test');
      audioWritable = true;
      fs.unlinkSync(testAudioFile);
    } catch (error) {
      console.error('Audio dir write test failed:', error);
    }
    
    try {
      const testTmpFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testTmpFile, 'test');
      tmpWritable = true;
      fs.unlinkSync(testTmpFile);
    } catch (error) {
      console.error('Tmp dir write test failed:', error);
    }
    
    // Check if Python scripts exist
    const pythonScriptExists = fs.existsSync(pythonScriptPath);
    const transcribeScriptExists = fs.existsSync(transcribeScriptPath);
    
    // Get permissions of directories and files
    const getPermissions = (filePath: string): string => {
      try {
        const stats = fs.statSync(filePath);
        return stats.mode.toString(8).slice(-3);
      } catch {
        return 'unknown';
      }
    };
    
    const audioDirPermissions = fs.existsSync(audioDir) ? getPermissions(audioDir) : 'directory not found';
    const tmpDirPermissions = fs.existsSync(tmpDir) ? getPermissions(tmpDir) : 'directory not found';
    const pythonScriptPermissions = pythonScriptExists ? getPermissions(pythonScriptPath) : 'file not found';
    const transcribeScriptPermissions = transcribeScriptExists ? getPermissions(transcribeScriptPath) : 'file not found';
    
    // Return detailed diagnostic information
    return res.status(200).json({
      environment: {
        nodeEnv: process.env.NODE_ENV,
        platform: os.platform(),
        user: os.userInfo().username,
        cwd: process.cwd(),
        projectRoot,
      },
      directories: {
        audioDir: {
          path: audioDir,
          exists: fs.existsSync(audioDir),
          writable: audioWritable,
          permissions: audioDirPermissions
        },
        tmpDir: {
          path: tmpDir,
          exists: fs.existsSync(tmpDir),
          writable: tmpWritable,
          permissions: tmpDirPermissions
        }
      },
      files: {
        generateSpeechScript: {
          path: pythonScriptPath,
          exists: pythonScriptExists,
          permissions: pythonScriptPermissions
        },
        transcribeScript: {
          path: transcribeScriptPath,
          exists: transcribeScriptExists,
          permissions: transcribeScriptPermissions
        }
      }
    });
  } catch (error) {
    console.error('Error checking directories:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
} 