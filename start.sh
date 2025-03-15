#!/bin/bash

# Default port
PORT=1885

# Default mode is production
DEV_MODE=false

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --dev) DEV_MODE=true ;;
    --port=*) PORT="${1#*=}" ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

# Function to check if Python package is installed
check_package() {
  python -c "import $1" 2>/dev/null
  return $?
}

# Function to check if a port is available
check_port() {
  if command -v nc &> /dev/null; then
    nc -z localhost $1 >/dev/null 2>&1
    if [ $? -eq 0 ]; then
      return 1  # Port is in use
    else
      return 0  # Port is available
    fi
  elif command -v lsof &> /dev/null; then
    lsof -i:$1 >/dev/null 2>&1
    if [ $? -eq 0 ]; then
      return 1  # Port is in use
    else
      return 0  # Port is available
    fi
  else
    # If we can't check, assume it's available
    return 0
  fi
}

# Check if the port is available
if ! check_port $PORT; then
  echo "Port $PORT is already in use. Please choose another port or free up this port."
  exit 1
fi

# Check if virtual environment is active
if [[ -z "$VIRTUAL_ENV" ]]; then
  if [[ -d ".venv" ]]; then
    echo "Activating virtual environment..."
    source .venv/bin/activate
  else
    echo "Creating and activating virtual environment..."
    python3.10 -m venv .venv
    source .venv/bin/activate
    
    # Install uv if not already installed
    if ! command -v uv &> /dev/null; then
      echo "Installing uv package installer..."
      pip install uv
    fi
    
    echo "Installing dependencies with uv..."
    uv pip install -r requirements.txt
  fi
fi

# Check for whisper model and download if not present
if ! check_package whisper; then
  echo "Installing Whisper package..."
  uv pip install openai-whisper
fi

# Check if the 'base' model is already downloaded
if [[ ! -d "$HOME/.cache/whisper/base.pt" ]]; then
  echo "Downloading Whisper base model (this may take a minute)..."
  # Trigger a download by importing whisper and loading the model
  python -c "import whisper; whisper.load_model('base')" || echo "Failed to download Whisper model. Will attempt on first use."
fi

# Start the Next.js server in the background
cd csm-ui

# Ensure required directories exist
echo "Ensuring required directories exist..."
mkdir -p public/audio
mkdir -p tmp

# Check permissions of the directories
if [[ ! -w "public/audio" ]]; then
  echo "Warning: Cannot write to public/audio directory. Audio generation may fail."
  chmod 755 public/audio 2>/dev/null || echo "Failed to set permissions on public/audio"
fi

if [[ ! -w "tmp" ]]; then
  echo "Warning: Cannot write to tmp directory. File uploads may fail."
  chmod 755 tmp 2>/dev/null || echo "Failed to set permissions on tmp"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing Node.js dependencies..."
  npm install
fi

if [ "$DEV_MODE" = true ]; then
  echo "Starting Next.js development server on port $PORT..."
  NODE_ENV=development PORT=$PORT npm run dev &
else
  echo "Building Next.js application for production..."
  npm run build
  
  echo "Starting Next.js production server on port $PORT..."
  NODE_ENV=production PORT=$PORT npm start &
fi

NEXT_PID=$!

# Trap to kill the Next.js server when the script is interrupted
trap "kill $NEXT_PID 2>/dev/null" EXIT

# Keep the script running until the user manually terminates it
echo "Services started! Press Ctrl+C to stop."
echo "Web interface is available at http://localhost:$PORT"
wait $NEXT_PID 