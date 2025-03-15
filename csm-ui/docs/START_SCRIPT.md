# CSM UI Start Script

The `start.sh` script provides an easy way to launch the CSM UI application in either development or production mode.

## Basic Usage

By default, the script runs the application in production mode on port 1885:

```bash
./start.sh
```

This will:
1. Check if port 1885 is available
2. Activate or create a Python virtual environment
3. Build the Next.js application for production
4. Start the production server

## Command-line Options

### Development Mode

To run the application in development mode (with hot reloading):

```bash
./start.sh --dev
```

### Custom Port

To run the application on a different port:

```bash
./start.sh --port=3000
```

You can combine options:

```bash
./start.sh --dev --port=8080
```

## Troubleshooting

If the script reports that the port is already in use, you can either:
1. Free up the port by stopping the process that's using it
2. Specify a different port using the `--port` option

## Requirements

The script requires:
- Bash shell
- Python 3.10 or higher
- Node.js and npm
- Either `nc` or `lsof` for port checking (usually pre-installed on most systems) 