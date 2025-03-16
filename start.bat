@echo off
setlocal enabledelayedexpansion

REM Default port
set PORT=1885

REM Default mode is production
set DEV_MODE=false

REM Parse command-line arguments
:parse_args
if "%~1"=="" goto :done_parsing
if "%~1"=="--dev" (
    set DEV_MODE=true
    shift
    goto :parse_args
)
if "%~1:~0,7%"=="--port=" (
    set PORT=%~1:~7%
    shift
    goto :parse_args
)
echo Unknown parameter: %~1
exit /b 1
:done_parsing

REM Function to check if a port is available
call :check_port %PORT%
if errorlevel 1 (
    echo Port %PORT% is already in use. Please choose another port or free up this port.
    exit /b 1
)

REM Check if virtual environment is active
if "%VIRTUAL_ENV%"=="" (
    if exist ".venv" (
        echo Activating virtual environment...
        call .venv\Scripts\activate.bat
    ) else (
        echo Creating and activating virtual environment...
        python -m venv .venv
        call .venv\Scripts\activate.bat
        
        REM Install uv if not already installed
        python -c "import importlib.util; print(1 if importlib.util.find_spec('uv') else 0)" > temp.txt
        set /p UV_INSTALLED=<temp.txt
        del temp.txt
        
        if "!UV_INSTALLED!"=="0" (
            echo Installing uv package installer...
            pip install uv
        )
        
        echo Installing dependencies with uv...
        uv pip install -r requirements.txt
        
        REM Windows-specific: Install triton-windows
        echo Installing triton-windows for Windows...
        pip install triton-windows
    )
)

REM Check for whisper model and download if not present
python -c "import importlib.util; print(1 if importlib.util.find_spec('whisper') else 0)" > temp.txt
set /p WHISPER_INSTALLED=<temp.txt
del temp.txt

if "!WHISPER_INSTALLED!"=="0" (
    echo Installing Whisper package...
    uv pip install openai-whisper
)

REM Check if the 'base' model is already downloaded
if not exist "%USERPROFILE%\.cache\whisper\base.pt" (
    echo Downloading Whisper base model (this may take a minute)...
    python -c "import whisper; whisper.load_model('base')" || echo Failed to download Whisper model. Will attempt on first use.
)

REM Change to the UI directory
cd csm-ui

REM Ensure required directories exist
echo Ensuring required directories exist...
if not exist "public\audio" mkdir public\audio
if not exist "tmp" mkdir tmp

REM Check permissions of the directories (Windows doesn't have the same permission checking as Linux)
REM but we can try to create a test file to see if we have write access
echo test > public\audio\test.txt
if not exist "public\audio\test.txt" (
    echo Warning: Cannot write to public\audio directory. Audio generation may fail.
)
del public\audio\test.txt 2>nul

echo test > tmp\test.txt
if not exist "tmp\test.txt" (
    echo Warning: Cannot write to tmp directory. File uploads may fail.
)
del tmp\test.txt 2>nul

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing Node.js dependencies...
    call npm install
)

REM Start the Next.js server
if "%DEV_MODE%"=="true" (
    echo Starting Next.js development server on port %PORT%...
    set NODE_ENV=development
    set PORT=%PORT%
    start /b cmd /c "npm run dev"
) else (
    echo Building Next.js application for production...
    call npm run build
    
    echo Starting Next.js production server on port %PORT%...
    set NODE_ENV=production
    set PORT=%PORT%
    start /b cmd /c "npm start"
)

echo Services started! Press Ctrl+C in the server window to stop.
echo Web interface is available at http://localhost:%PORT%

REM Keep the window open
pause
exit /b

:check_port
REM Use PowerShell to check if port is in use
powershell -command "$conn = New-Object System.Net.Sockets.TcpClient; try { $conn.Connect('localhost', %1); $conn.Close(); exit 1 } catch { exit 0 }"
exit /b %errorlevel% 