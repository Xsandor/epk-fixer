# EPK Fixer

**EPK Fixer** is a browser-based tool to ensure that the `cert.txt` file inside an `.epk` archive ends with a newline. All processing happens locally in your browser—no files are uploaded.

## Features

- Drag & drop or select an `.epk` file
- Automatically detects and updates `cert.txt` to end with a newline
- Instant download of the fixed flle (if needed)
- No server-side processing; privacy-friendly
- Simple, modern UI

## Usage

1. Open `epk-fixer.html` in your browser.
2. Drop your `.epk` file or select it using the file picker.
3. The tool will check for `cert.txt`:
   - If it needs fixing, you’ll get a download of the updated archive.
   - If it’s already correct, you’ll see a log message and no download.
4. All logs and status messages are shown in the app.

## Disclaimer

This tool is provided as-is, without warranty of any kind. Use at your own risk.
