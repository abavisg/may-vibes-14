# One-Line Email Summarizer

A Chrome extension that helps you quickly scan your Gmail inbox by providing AI-generated one-line summaries of emails when you hover over subject lines. The extension utilizes a local Ollama instance for summarization.

## Features

- **Hover-to-Summarize**: Hover over Gmail subject lines to see a one-line AI-generated summary of the email content.
- **Local AI Processing**: Uses Ollama with a model like `tinyllama` running on your local machine for summarization, ensuring privacy.
- **Gmail API Integration**: Securely accesses email content via the Gmail API after user authentication.
- **Dynamic Tooltip**: Displays summaries in a clean, non-intrusive tooltip that appears near the subject line.
- **Efficient & Responsive**:
    - Debounced hover events to prevent excessive API calls.
    - Cancellation of ongoing summary requests if the mouse moves to another email, ensuring the UI remains responsive.
    - Singleton tooltip management for smooth display without flickering.
- **Fallback Summaries**: Provides a basic snippet if AI summarization fails.

## Prerequisites

1.  **Google Chrome**: The extension is built for Chrome.
2.  **Ollama**: You need to have Ollama installed and running on your local machine.
    *   Installation: [https://ollama.com/download](https://ollama.com/download)
    *   Ensure you have a model downloaded, e.g., `tinyllama`:
        ```bash
        ollama pull tinyllama
        ```
    *   **Crucially**, Ollama must be configured to accept requests from the Chrome extension. Set the `OLLAMA_ORIGINS` environment variable before starting Ollama. For example:
        ```bash
        # Replace YOUR_EXTENSION_ID with the actual ID of the installed extension
        # You can find this ID in chrome://extensions after loading the extension
        OLLAMA_ORIGINS=chrome-extension://YOUR_EXTENSION_ID,http://localhost:* ollama serve
        ```
        Alternatively, for development purposes, you can allow all origins (less secure):
        ```bash
        OLLAMA_ORIGINS=* ollama serve
        ```
        Refer to Ollama documentation for how to set environment variables persistently for your OS.

## Installation

1.  **Clone or Download**:
    *   Clone this repository: `git clone <repository_url>`
    *   Or download the ZIP file and extract it.
2.  **Open Chrome Extensions**: Navigate to `chrome://extensions/` in your Chrome browser.
3.  **Enable Developer Mode**: Toggle on "Developer mode" in the top-right corner.
4.  **Load Unpacked**:
    *   Click the "Load unpacked" button.
    *   Select the `src` directory (or the main extension directory if `manifest.json` is there) from the cloned/downloaded files.
5.  **Extension ID (for OLLAMA_ORIGINS)**:
    *   Once loaded, find the "One-Line Email Summarizer" card.
    *   Copy its ID (e.g., `abcdefghijklmnopqrstuvwxyzabcdef`). You'll need this for the `OLLAMA_ORIGINS` setting.
6.  **Configure Ollama**: Ensure Ollama is running with the correct `OLLAMA_ORIGINS` as described in the Prerequisites.

## Usage

1.  **Authenticate**:
    *   Click the extension icon in your Chrome toolbar.
    *   A popup will appear. Click the "Authenticate" button if prompted.
    *   Follow the Google authentication flow.
2.  **Navigate to Gmail**: Open or refresh your Gmail tab.
3.  **Hover for Summaries**: Hover your mouse cursor over an email subject line in your inbox. A tooltip should appear with a one-line summary.
    *   The first summary might take a moment as the model loads.
    *   If Ollama is not running or not configured correctly, you might see an error or a basic snippet.

## Development Notes

-   **Manifest**: The extension uses `manifest.v3`.
-   **Permissions**:
    -   `identity`: For Google account authentication.
    -   `scripting`: To inject the content script into Gmail.
    -   `storage`: For storing settings or tokens (if implemented).
    -   `alarms`: (Currently included but not actively used, can be for future periodic tasks).
    -   Host Permissions:
        -   `https://mail.google.com/*`: To interact with the Gmail interface.
        -   `https://gmail.googleapis.com/*`: To make Gmail API calls.
        -   `http://localhost:11434/*`: To communicate with the local Ollama API.
-   **Key Files**:
    -   `src/manifest.json`: Defines the extension's properties, permissions, and scripts.
    -   `src/background.js`: Handles authentication, Gmail API communication, and Ollama API calls.
    -   `src/content.js`: Injected into Gmail pages, detects hovers, manages tooltips, and communicates with `background.js`.
    -   `src/popup.html` & `src/popup.js`: UI for the extension's toolbar popup, primarily for authentication status and actions.
-   **Icon**: A placeholder `icon.png` (128x128) is needed in the `src` directory.
-   **OAuth2 Credentials**: Valid Google API OAuth2 client ID needs to be configured in `manifest.json` under `oauth2`.

## Privacy

-   This extension processes your email data locally.
-   Email content is sent from your browser directly to your local Ollama instance for summarization.
-   No email data is stored or transmitted to any external third-party servers by this extension.
-   Authentication is handled via Google's OAuth2 flow.

## License

This project is licensed under the MIT License - see the `LICENSE` file for details. 