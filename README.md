# One-Line Email Summarizer

A Chrome extension that helps you quickly scan your Gmail inbox by providing one-line summaries of emails when you hover over subject lines.

## Features

- Hover over Gmail subject lines to see a summary of the email content
- Authentication with Gmail API for secure access to your emails
- Simple and clean user interface
- Works directly in your Gmail inbox

## Installation

1. Clone this repository or download the ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension will appear in your toolbar

## Usage

1. Click the extension icon in your browser toolbar
2. Authenticate with your Google account
3. Navigate to Gmail
4. Hover over email subject lines to see summaries

## Development Notes

The extension requires the following:
- A proper 128x128 icon.png file in the src directory
- Valid Google API credentials in the manifest.json file

## Privacy

This extension accesses your Gmail data only when you hover over a subject line, and only with your explicit permission. No data is stored on servers - all processing happens locally.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 