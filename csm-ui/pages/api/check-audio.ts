import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get filename from query
    const { filename } = req.query;
    
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid filename parameter' });
    }
    
    // Validate filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    
    // Get the project root directory
    const projectRoot = path.resolve(process.cwd());
    const audioDir = path.join(projectRoot, 'public', 'audio');
    const filePath = path.join(audioDir, sanitizedFilename);
    
    console.log(`Checking audio file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found',
        path: filePath,
        sanitizedFilename
      });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Open the file to check if it's readable
    const fd = fs.openSync(filePath, 'r');
    
    // Read the first 44 bytes (WAV header)
    const buffer = Buffer.alloc(44);
    const bytesRead = fs.readSync(fd, buffer, 0, 44, 0);
    fs.closeSync(fd);
    
    // Parse WAV header for additional checks
    let wavInfo = null;
    if (bytesRead === 44) {
      // Check WAV file signature
      const riffSignature = buffer.toString('ascii', 0, 4);
      const waveSignature = buffer.toString('ascii', 8, 12);
      const isWav = riffSignature === 'RIFF' && waveSignature === 'WAVE';
      
      if (isWav) {
        const sampleRate = buffer.readUInt32LE(24);
        const channels = buffer.readUInt16LE(22);
        const bitsPerSample = buffer.readUInt16LE(34);
        
        wavInfo = {
          isValidWav: true,
          sampleRate,
          channels,
          bitsPerSample,
          headerHex: buffer.toString('hex').match(/.{1,2}/g)?.join(' ')
        };
      } else {
        wavInfo = {
          isValidWav: false,
          headerHex: buffer.toString('hex').match(/.{1,2}/g)?.join(' ')
        };
      }
    }
    
    // Return file information
    return res.status(200).json({
      exists: true,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isReadable: bytesRead > 0,
      bytesRead,
      wavInfo
    });
  } catch (error) {
    console.error('Error checking audio file:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 