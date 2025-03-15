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
    
    console.log(`Serving audio file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Audio file not found: ${filePath}`);
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Set proper headers
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    // Handle errors in the stream
    fileStream.on('error', (error) => {
      console.error(`Error streaming audio file: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
      res.end();
    });
  } catch (error) {
    console.error('Error serving audio file:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 