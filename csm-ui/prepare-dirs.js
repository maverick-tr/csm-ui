const fs = require('fs');
const path = require('path');

// Create necessary directories for the application
console.log('Setting up directories for production mode...');

const projectRoot = process.cwd();
const directories = [
  path.join(projectRoot, 'public', 'audio'),
  path.join(projectRoot, 'tmp')
];

// Ensure each directory exists
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    console.log(`Directory already exists: ${dir}`);
  }
  
  // Verify permissions
  try {
    const testFile = path.join(dir, '.test-write-access');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✓ Directory is writable: ${dir}`);
  } catch (error) {
    console.error(`✗ Directory is NOT writable: ${dir}`);
    console.error(`  Error: ${error.message}`);
  }
});

console.log('Directory setup complete.'); 