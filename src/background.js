// src/background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("One-Line Email Summarizer installed.");
});

// Clean message/thread ID to remove any URL fragments or prefixes
function cleanMessageId(id) {
  if (!id) return id;
  
  console.log("Cleaning ID:", id);
  
  // Handle case where thread-f: is duplicated
  if (id.includes("thread-f:thread-f:") || id.includes("thread-f:#thread-f:")) {
    const match = id.match(/thread-f:(?:#)?thread-f:(\d+)/);
    if (match && match[1]) {
      console.log("Fixed duplicated thread-f: prefix:", match[1]);
      return match[1];
    }
  }
  
  // If it starts with #, remove it
  if (id.startsWith('#')) {
    id = id.substring(1);
  }
  
  // Handle thread format like "thread-f:1234567890"
  const threadMatch = id.match(/thread-f:(\d+)/);
  if (threadMatch && threadMatch[1]) {
    return threadMatch[1];
  }
  
  // Handle message format like "msg-f:1234567890"
  const msgMatch = id.match(/msg-f:(\d+)/);
  if (msgMatch && msgMatch[1]) {
    return msgMatch[1];
  }
  
  // Handle message format like "message-id:1234567890"
  const messageIdMatch = id.match(/message-id:(\S+)/);
  if (messageIdMatch && messageIdMatch[1]) {
    return messageIdMatch[1];
  }
  
  // Check for and clean any other URL artifacts or special characters
  // This will catch cases like "#thread-f:1234567890"
  const numericMatch = id.match(/(\d{10,})/);
  if (numericMatch && numericMatch[1]) {
    console.log("Extracted numeric ID:", numericMatch[1]);
    return numericMatch[1];
  }
  
  return id;
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  // For backward compatibility, handle both action and type properties
  const messageType = message.action || message.type;
  
  if (messageType === "getAuthToken") {
    // Make sure identity API is available
    if (typeof chrome.identity === 'undefined') {
      console.error("Chrome identity API is not available");
      sendResponse({ success: false, error: "Identity API not available" });
      return true;
    }
    
    console.log("Getting auth token...");
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error("Auth error:", chrome.runtime.lastError);
        sendResponse({ 
          success: false, 
          error: chrome.runtime.lastError.message || "Authentication failed" 
        });
        return;
      }
      
      if (!token) {
        console.error("No token returned");
        sendResponse({ 
          success: false, 
          error: "No token returned" 
        });
        return;
      }
      
      console.log("Token obtained successfully");
      sendResponse({ 
        success: true, 
        token: token 
      });
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  // Handle fetch request from content script
  if (messageType === "fetchEmail") {
    if (!message.token || !message.messageId) {
      sendResponse({ success: false, error: "Missing token or messageId" });
      return true;
    }
    
    // The simplest approach - just get a list of recent messages
    console.log("Fetching recent messages list");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10`;
    
    fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${message.token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return response.json();
    })
    .then(listData => {
      if (!listData || !listData.messages || listData.messages.length === 0) {
        throw new Error("No messages found in inbox");
      }
      
      console.log("Found recent messages:", listData.messages.length);
      
      // Find a message with a valid ID
      const validId = listData.messages[0].id;
      console.log("Using message ID:", validId);
      
      // Now fetch this specific message
      return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${validId}`, {
        headers: {
          'Authorization': `Bearer ${message.token}`
        }
      });
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return response.json();
    })
    .then(messageData => {
      console.log("Successfully fetched message data");
      sendResponse({ success: true, data: messageData });
    })
    .catch(error => {
      console.error("Failed to fetch message:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Helper function to fetch Gmail data
function fetchGmailData(url, token) {
  console.log("Making API request to:", url);
  
  return fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    console.log("API response status:", response.status);
    
    if (!response.ok) {
      // Try to get more information about the error
      return response.text().then(errorText => {
        console.error("API error details:", errorText);
        throw new Error(`API error: ${response.status}`);
      });
    }
    return response.json();
  })
  .catch(error => {
    console.error("API request failed:", error);
    throw error;
  });
}