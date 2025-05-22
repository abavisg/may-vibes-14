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
  
  const messageType = message.action || message.type;
  
  if (messageType === "getAuthToken") {
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
    return true;
  }
  
  if (messageType === "fetchEmail") {
    if (!message.token || !message.messageId) {
      sendResponse({ success: false, error: "Missing token or messageId" });
      return true;
    }
    
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
      
      const validId = listData.messages[0].id;
      console.log("Using message ID:", validId);
      
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
    return true;
  }

  if (messageType === "summarizeWithOllama") {
    if (!message.content) {
      sendResponse({ success: false, error: "No content provided for summarization" });
      return true;
    }

    let emailContent = message.content;
    emailContent = emailContent.replace(/\s\s+/g, ' ').trim();
    const maxLength = 2000;
    if (emailContent.length > maxLength) {
      emailContent = emailContent.substring(0, maxLength) + "...";
    }

    const ollamaUrl = "http://localhost:11434/api/generate";
    const ollamaPayload = {
      model: "tinyllama", 
      prompt: `Summarize this email in one sentence: ###${emailContent}###`,
      stream: false,
      options: {
        num_ctx: 2048
      }
    };

    console.log("Sending to Ollama (tinyllama). Prompt length:", ollamaPayload.prompt.length);
    
    (async () => {
      let responseSent = false;
      try {
        const response = await fetch(ollamaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(ollamaPayload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Ollama API Error Response Text:", errorText);
          throw new Error(`Ollama API error: ${response.status} - ${errorText.substring(0,100)}`);
        }

        const ollamaData = await response.json();
        console.log("Ollama response:", ollamaData);

        if (ollamaData.response) {
          if (!responseSent) {
            sendResponse({ success: true, summary: ollamaData.response.trim() });
            responseSent = true;
          }
        } else {
          if (!responseSent) {
            sendResponse({ success: false, error: "Ollama did not return a summary. Response: " + JSON.stringify(ollamaData) });
            responseSent = true;
          }
        }
      } catch (error) {
        console.error("Error contacting Ollama or processing response:", error);
        if (!responseSent) {
          sendResponse({ success: false, error: error.message });
          responseSent = true;
        }
      }
    })();

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