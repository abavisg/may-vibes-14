// src/popup.js
document.addEventListener('DOMContentLoaded', () => {
  const authButton = document.getElementById('auth-button');
  const statusConnected = document.getElementById('status-connected');
  const statusDisconnected = document.getElementById('status-disconnected');

  // Check authentication status
  checkAuthStatus();

  // Add click event for the authenticate button
  authButton.addEventListener('click', () => {
    authenticate();
  });

  function checkAuthStatus() {
    chrome.runtime.sendMessage({ action: "getAuthToken" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        // User is not authenticated
        statusConnected.style.display = 'none';
        statusDisconnected.style.display = 'block';
        authButton.textContent = 'Authenticate';
        return;
      }
      
      if (response?.success && response?.token) {
        // User is authenticated
        statusConnected.style.display = 'block';
        statusDisconnected.style.display = 'none';
        authButton.textContent = 'Re-authenticate';
      } else {
        // User is not authenticated
        statusConnected.style.display = 'none';
        statusDisconnected.style.display = 'block';
        authButton.textContent = 'Authenticate';
      }
    });
  }

  function authenticate() {
    chrome.runtime.sendMessage({ action: "getAuthToken" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        return;
      }
      
      if (response?.success && response?.token) {
        checkAuthStatus();
      } else {
        console.error('Authentication failed:', response?.error);
        // Show error message to user
        statusDisconnected.textContent = `Authentication failed: ${response?.error || 'Unknown error'}`;
        statusDisconnected.style.display = 'block';
      }
    });
  }
}); 