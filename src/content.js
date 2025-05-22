// Utility to debounce hover event
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

let globalTooltip = null; // Variable to hold the single tooltip instance

function createOrGetTooltip() {
  if (globalTooltip && document.body.contains(globalTooltip)) {
    return globalTooltip;
  }
  globalTooltip = document.createElement('div');
  globalTooltip.className = 'email-summary-tooltip'; // Add a class for styling/identification
  globalTooltip.style.position = 'absolute';
  globalTooltip.style.backgroundColor = '#fff8dc'; // Cornsilk
  globalTooltip.style.border = '1px solid #ccc';
  globalTooltip.style.padding = '8px 12px'; // Increased padding
  globalTooltip.style.borderRadius = '6px'; // Slightly more rounded
  globalTooltip.style.fontSize = '13px'; // Slightly larger font
  globalTooltip.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'; // Softer shadow
  globalTooltip.style.zIndex = '2147483647'; // Max z-index
  globalTooltip.style.maxWidth = '350px';
  globalTooltip.style.overflow = 'hidden';
  globalTooltip.style.textOverflow = 'ellipsis';
  globalTooltip.style.display = 'none'; // Initially hidden
  globalTooltip.style.fontFamily = 'Arial, sans-serif'; // Consistent font
  document.body.appendChild(globalTooltip);
  return globalTooltip;
}

function showSummaryTooltip(event, summaryText) {
  const tooltip = createOrGetTooltip();
  tooltip.innerText = summaryText || 'Loading summary...';
  
  const targetElement = event.target;
  if (!targetElement) {
      console.warn("Tooltip target element is invalid.");
      tooltip.style.display = 'none';
      return;
  }

  const rect = targetElement.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 7}px`; // Adjusted offset
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.display = 'block';

  // Clear previous listeners to avoid multiple removals or actions
  if (targetElement.tooltipMouseleaveListener) {
    targetElement.removeEventListener('mouseleave', targetElement.tooltipMouseleaveListener);
  }
  if (document.tooltipClickListener) {
    document.removeEventListener('click', document.tooltipClickListener);
  }

  targetElement.tooltipMouseleaveListener = () => {
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  };
  
  document.tooltipClickListener = (clickEvent) => {
    if (tooltip && !tooltip.contains(clickEvent.target) && clickEvent.target !== targetElement) {
      tooltip.style.display = 'none';
    }
  };

  targetElement.addEventListener('mouseleave', targetElement.tooltipMouseleaveListener, { passive: true });
  document.addEventListener('click', document.tooltipClickListener, { passive: true });
}

// Get auth token from background script
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getAuthToken" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      console.log("Auth response:", response);
      
      if (response && response.success && response.token) {
        resolve(response.token);
      } else {
        reject(new Error(response?.error || "Failed to get auth token"));
      }
    });
  });
}

// Use the background script to fetch email data
function fetchEmailFromBackground(messageId, token, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }

    const listener = (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || "Failed to fetch email"));
      }
    };

    chrome.runtime.sendMessage(
      { 
        action: "fetchEmail", 
        messageId: messageId,
        token: token
      }, 
      listener
    );

    signal?.addEventListener('abort', () => {
      // Attempt to remove listener if possible, though sendMessage doesn't directly support cancellation
      // This is more of a promise rejection trigger
      console.log("Aborting fetchEmailFromBackground for messageId:", messageId);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

// Extract the thread ID from the URL
function getThreadIdFromUrl() {
  const hash = window.location.hash;
  
  // First check if the hash already contains thread-f:
  const directThreadMatch = hash.match(/thread-f:(\d+)/);
  if (directThreadMatch && directThreadMatch[1]) {
    console.log("Found direct thread-f: format in URL:", directThreadMatch[1]);
    return `thread-f:${directThreadMatch[1]}`;
  }
  
  // Extract thread ID from various URL formats
  // Format: #inbox/THREAD_ID or #label/LABEL_NAME/THREAD_ID
  const threadIdMatch = hash.match(/#(?:inbox|category\/\w+|label\/[^/]+)\/([a-zA-Z0-9]+)(?:\?|$)/);
  
  if (threadIdMatch && threadIdMatch[1]) {
    console.log("Found thread ID from URL:", threadIdMatch[1]);
    return `thread-f:${threadIdMatch[1]}`;
  }
  
  // Try another format: #inbox/thread/THREAD_ID
  const alternateMatch = hash.match(/#(?:inbox|category\/\w+|label\/[^/]+)\/thread\/([a-zA-Z0-9]+)(?:\?|$)/);
  if (alternateMatch && alternateMatch[1]) {
    console.log("Found thread ID from alternate URL format:", alternateMatch[1]);
    return `thread-f:${alternateMatch[1]}`;
  }
  
  // Try directly extracting thread ID with f: format
  const fMatch = hash.match(/f:(\d+)/);
  if (fMatch && fMatch[1]) {
    console.log("Found direct thread ID:", fMatch[1]);
    return `thread-f:${fMatch[1]}`;
  }
  
  return null;
}

// Get active email list view from Gmail
function findGmailMessageTable() {
  // Various selectors for Gmail's message tables
  const tableSelectors = [
    'table.F.cf.zt',          // Main inbox table
    'div[role="main"] table',  // Alternative main view
    'div.AO table',            // Another possible location
    'div.Cp table'             // Yet another location
  ];
  
  for (const selector of tableSelectors) {
    const table = document.querySelector(selector);
    if (table) {
      return table;
    }
  }
  
  return null;
}

// Helper function to properly format a thread ID
function formatThreadId(id) {
  if (!id) return null;
  
  // If it already has the thread-f: prefix, return as is
  if (id.includes('thread-f:')) {
    return id;
  }
  
  // Otherwise, add the prefix
  return `thread-f:${id}`;
}

// Find a better message ID by looking at the Gmail DOM structure
function findBetterMessageId(element) {
  // First, check if we can extract a thread ID from the URL (if in an open email)
  const threadId = getThreadIdFromUrl();
  if (threadId) {
    return threadId; // Already formatted properly in getThreadIdFromUrl
  }
  
  // Check for thread ID in the URL using query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const threadParam = urlParams.get('threadId') || urlParams.get('th');
  if (threadParam) {
    console.log("Found thread ID from URL parameter:", threadParam);
    return formatThreadId(threadParam);
  }
  
  // Try to find a full message ID in the data attributes
  const possibleElements = [
    ...document.querySelectorAll('[data-legacy-message-id]'),
    ...document.querySelectorAll('[data-message-id]'),
    ...document.querySelectorAll('[data-thread-id]')
  ];
  
  console.log(`Found ${possibleElements.length} elements with message IDs`);
  
  // Log all found IDs for debugging
  const allIds = possibleElements.map(el => {
    return {
      'data-legacy-message-id': el.getAttribute('data-legacy-message-id'),
      'data-message-id': el.getAttribute('data-message-id'),
      'data-thread-id': el.getAttribute('data-thread-id')
    };
  });
  
  if (allIds.length > 0) {
    console.log("All found message IDs:", allIds);
  }
  
  // Check if the element is near any of these elements with IDs
  let closestElement = null;
  let minDistance = Number.MAX_SAFE_INTEGER;
  
  const rect = element.getBoundingClientRect();
  const elementCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
  
  for (const el of possibleElements) {
    const elRect = el.getBoundingClientRect();
    const elCenter = {
      x: elRect.left + elRect.width / 2,
      y: elRect.top + elRect.height / 2
    };
    
    const distance = Math.sqrt(
      Math.pow(elementCenter.x - elCenter.x, 2) + 
      Math.pow(elementCenter.y - elCenter.y, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestElement = el;
    }
  }
  
  if (closestElement) {
    // Check for thread ID first
    const threadId = closestElement.getAttribute('data-thread-id');
    if (threadId) {
      console.log("Found nearby element with thread ID:", threadId);
      return formatThreadId(threadId);
    }
    
    // Then check for message IDs
    const legacyId = closestElement.getAttribute('data-legacy-message-id');
    if (legacyId) {
      console.log("Found nearby element with legacy message ID:", legacyId);
      return legacyId;
    }
    
    const messageId = closestElement.getAttribute('data-message-id');
    if (messageId) {
      console.log("Found nearby element with message ID:", messageId);
      return messageId;
    }
  }
  
  // Try to find message ID in the current URL if we're in a message view
  const urlMatch = window.location.href.match(/[&#](?:th|msg)=([a-zA-Z0-9._-]+)/);
  if (urlMatch && urlMatch[1]) {
    console.log("Found message ID in URL:", urlMatch[1]);
    return formatThreadId(urlMatch[1]);
  }
  
  // Check if any element has a Gmail message ID pattern as its ID
  const emailRows = document.querySelectorAll('tr[id]');
  for (const row of emailRows) {
    // Gmail often uses IDs starting with ":m" for message rows
    if (row.id.startsWith(':m') || row.id.startsWith(':t')) {
      // Look for any data attributes on this row
      const threadId = row.getAttribute('data-thread-id') || 
                      row.getAttribute('data-legacy-thread-id');
      
      if (threadId) {
        console.log("Found thread ID on row:", threadId);
        return formatThreadId(threadId);
      }
    }
  }
  
  return null;
}

// Extract message ID from various Gmail UI elements
function extractMessageId(element) {
  // Try multiple approaches to find the message ID
  
  // First, try using Gmail's data attributes
  const dataMessageId = element.closest('[data-message-id]');
  if (dataMessageId && dataMessageId.getAttribute('data-message-id')) {
    const id = dataMessageId.getAttribute('data-message-id');
    if (id && id.length > 10) {
      console.log("Found message ID from data-message-id:", id);
      return id;
    }
  }
  
  // Next, try the legacy message ID attribute
  const legacyElement = element.closest('[data-legacy-message-id]');
  if (legacyElement && legacyElement.dataset.legacyMessageId) {
    const id = legacyElement.dataset.legacyMessageId;
    if (id && id.length > 10) {
      console.log("Found message ID from data-legacy-message-id:", id);
      return id;
    }
  }
  
  // Try to extract from Gmail's internal structure
  const threadIdElement = element.closest('[data-thread-id]');
  if (threadIdElement && threadIdElement.getAttribute('data-thread-id')) {
    const threadId = threadIdElement.getAttribute('data-thread-id');
    if (threadId && threadId.length > 10) {
      console.log("Found thread ID:", threadId);
      return threadId;
    }
  }
  
  // If we're in an opened email, try to get the thread ID from the URL
  const threadIdFromUrl = getThreadIdFromUrl();
  if (threadIdFromUrl && threadIdFromUrl.length > 10) {
    return threadIdFromUrl;
  }
  
  // Try to extract from row ID (older Gmail format)
  const messageRow = element.closest('tr[id]');
  if (messageRow && messageRow.id) {
    // Gmail format can be like "m_<MESSAGE_ID>" or "<NUMBER>_<MESSAGE_ID>"
    const idMatch = messageRow.id.match(/[a-zA-Z0-9]{16,}/);
    if (idMatch) {
      console.log("Found message ID from row ID:", idMatch[0]);
      return idMatch[0];
    }
  }
  
  // If we couldn't find a valid ID directly, try searching more broadly
  const betterMessageId = findBetterMessageId(element);
  if (betterMessageId) {
    return betterMessageId;
  }
  
  // If we got here, we couldn't find a valid message ID
  // Instead of returning potentially invalid IDs, return null
  console.log("Could not extract a valid message ID");
  return null;
}

// Extract email content from API response
function extractEmailContent(emailData) {
  // If the data doesn't exist, return null
  if (!emailData) {
    console.error("No email data to extract content from");
    return null;
  }
  
  console.log("Extracting content from:", emailData);
  
  // First, try to use the snippet field which is usually available
  if (emailData.snippet) {
    console.log("Using snippet directly");
    return emailData.snippet;
  }
  
  // Gmail API can return data in different formats, try to handle the most common ones
  
  // Try to get the body from the payload
  if (emailData.payload) {
    // Get the parts if they exist
    const parts = emailData.payload.parts || [];
    
    // First look for plain text parts
    for (const part of parts) {
      if (part && part.mimeType === 'text/plain' && part.body && part.body.data) {
        console.log("Found plain text content");
        return part.body.data;
      }
    }
    
    // Next look for HTML parts
    for (const part of parts) {
      if (part && part.mimeType === 'text/html' && part.body && part.body.data) {
        console.log("Found HTML content");
        return part.body.data;
      }
    }
    
    // If parts don't have what we need, check the body directly
    if (emailData.payload.body && emailData.payload.body.data) {
      console.log("Found content in main payload body");
      return emailData.payload.body.data;
    }
    
    // Try to find any part with body data
    for (const part of parts) {
      if (part && part.body && part.body.data) {
        console.log("Found content in part:", part.mimeType);
        return part.body.data;
      }
    }
  }
  
  // If we can't find content, check if this is a thread response
  if (emailData.messages && emailData.messages.length > 0) {
    console.log("This appears to be a thread response, extracting from first message");
    return extractEmailContent(emailData.messages[0]);
  }
  
  console.error("Could not find email content in response");
  return null;
}

// Helper function to extract content directly from Gmail's UI
function extractContentFromUI(element) {
  try {
    const row = element.closest('tr.zA') || 
                element.closest('[role="row"]') || 
                element.closest('.zA');
    
    if (!row) {
      console.log("Could not find email row");
      return null;
    }
    
    let sender = '';
    const senderElements = row.querySelectorAll('.yW span, .zF, [email]');
    if (senderElements.length > 0) {
      sender = senderElements[0].textContent || senderElements[0].getAttribute('email') || '';
    }
    
    let subject = '';
    const subjectElement = element.closest('.bog') || 
                          row.querySelector('.y6 span:not(.T6), .bog, .bqe');
    if (subjectElement) {
      subject = subjectElement.textContent || '';
    }
    
    let snippet = '';
    const snippetElement = row.querySelector('.y2, .xY .xW span');
    if (snippetElement) {
      snippet = snippetElement.textContent || '';
    }
    
    const info = [];
    if (sender) info.push(`From: ${sender.trim()}`);
    if (subject) info.push(`Subject: ${subject.trim()}`);
    if (snippet) info.push(snippet.trim());
    
    if (info.length > 0) {
      return info.join(' | ');
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting content from UI:", error);
    return null;
  }
}

// Send content to Ollama for summarization
function summarizeWithOllama(content, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }

    const listener = (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      if (response && response.success) {
        resolve(response.summary);
      } else {
        reject(new Error(response?.error || "Failed to summarize with Ollama"));
      }
    };

    chrome.runtime.sendMessage(
      { 
        action: "summarizeWithOllama", 
        content: content 
      },
      listener
    );

    signal?.addEventListener('abort', () => {
      console.log("Aborting summarizeWithOllama.");
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

let currentAbortController = null;

async function fetchSummaryForSpecificId(messageId, element, event, signal) {
  console.log("Fetching summary for message ID:", messageId, "for element:", element);
  
  let emailTextContent = extractContentFromUI(element);
  
  if (!emailTextContent && messageId) {
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const token = await getAuthToken(); // Assuming getAuthToken doesn't need signal
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const emailData = await fetchEmailFromBackground(messageId, token, signal);
      
      if (!emailData) {
        console.error("No email data returned from API");
      } else {
        console.log("Received email data from API:", emailData);
        
        let subject = '';
        let from = '';
        
        if (emailData.payload && emailData.payload.headers) {
          for (const header of emailData.payload.headers) {
            if (header.name.toLowerCase() === 'subject') {
              subject = header.value;
            } else if (header.name.toLowerCase() === 'from') {
              from = header.value;
            }
          }
        }
        
        let apiContent = emailData.snippet || extractEmailContent(emailData);
        if (apiContent) {
           if (apiContent.startsWith("Snippet: ")) {
              apiContent = apiContent.substring("Snippet: ".length);
          }
          try {
              // Only attempt atob if it looks like base64
              if (apiContent.length > 20 && /^[A-Za-z0-9+/=]+$/.test(apiContent.replace(/[^A-Za-z0-9+/=]/g, ''))) {
                  apiContent = atob(apiContent.replace(/-/g, '+').replace(/_/g, '/'));
              }
          } catch (e) { 
            console.warn("Failed to decode base64 content, using as is:", e);
          }

          emailTextContent = `From: ${from} | Subject: ${subject} | ${apiContent.trim()}`;
        }
      }
    } catch (apiError) {
      if (apiError.name === 'AbortError') {
        console.log('API fetch aborted in fetchSummaryForSpecificId');
        throw apiError;
      }
      console.error('Error fetching email via API:', apiError);
    }
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (!emailTextContent) {
    emailTextContent = extractContentFromUI(element); // Try UI extraction again
    if (!emailTextContent) {
        return "Could not extract email content for summarization.";
    }
  }
  
  console.log("Content for Ollama:", emailTextContent);
  // Check signal before showing tooltip and before calling Ollama
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  showSummaryTooltip(event, "Summarizing with Ollama..."); 

  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const ollamaSummary = await summarizeWithOllama(emailTextContent, signal);
    return `Ollama: ${ollamaSummary}`;
  } catch (ollamaError) {
    if (ollamaError.name === 'AbortError') {
        console.log('Ollama summarization aborted.');
        throw ollamaError;
    }
    console.error("Ollama summarization failed:", ollamaError);
    const simpleSummary = emailTextContent.split('|').pop().trim().slice(0, 150);
    return simpleSummary + (simpleSummary.length >= 150 ? '...' : ''); 
  }
}

async function fetchSummaryForEmail(element, event) {
  if (currentAbortController) {
    currentAbortController.abort(); // Abort any ongoing fetch/summary
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  try {
    showSummaryTooltip(event, 'Loading summary...'); // Show initial loading message
    
    let contentForSummary = extractContentFromUI(element);
    let messageId = null;

    messageId = extractMessageId(element);
    
    if (!messageId && !contentForSummary) {
        return 'Unable to identify this email or extract its content.';
    }

    if (messageId && messageId.length < 10) { // Basic sanity check for ID length
        console.log("Short/invalid message ID, trying to find a better one:", messageId);
        const betterMessageId = findBetterMessageId(element);
        if (betterMessageId) {
            messageId = betterMessageId;
            console.log("Using better message ID:", messageId);
        } else if (!contentForSummary) { // If still no ID and no UI content
            return "Cannot identify email. Try opening it.";
        }
    }
    
    if (signal.aborted) {
        console.log("Fetch summary aborted before starting specific ID fetch.");
        return "Summarization cancelled.";
    }
    
    const summary = await fetchSummaryForSpecificId(messageId, element, event, signal);
    if (signal.aborted) {
        console.log("Fetch summary aborted after specific ID fetch.");
        // Tooltip might have been updated by fetchSummaryForSpecificId, hide or set to cancelled.
        const tooltip = createOrGetTooltip();
        if (tooltip.style.display === 'block') { // Only if still visible for this event chain
            tooltip.innerText = "Summarization cancelled.";
        }
        return "Summarization cancelled.";
    }
    return summary;

  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('fetchSummaryForEmail aborted.');
      return "Summarization cancelled.";
    }
    console.error('Error in fetchSummaryForEmail:', err);
    return `Error: ${err.message}`;
  } finally {
    // If this controller is still the active one, nullify it.
    // This prevents aborting a new request if this one finished successfully.
    if (currentAbortController && currentAbortController.signal === signal) {
        currentAbortController = null;
    }
  }
}

function initHoverSummary() {
  console.log("Initializing email summary hover functionality");
  
  const selectors = [
    'tr.zA span.bog',                  
    'tr.zA .y6 span:not(.T6)',         
    '.zA[role="row"] h2 span',         
    '.zA[role="row"] .y6',             
    '.ha h2.J-JN-I',                   
    'td[role="gridcell"] .bog',        
    '.Zt',                             
    '.zA.yO .bog',                     
    'h2.bqe',                          
    '.xY.a4W h2',                      
    'tr:not(.btb) span.bog',           
    'tr.zA [role="link"]'              
  ];
  
  const combinedSelector = selectors.join(', ');
  
  const debouncedFetchAndShowSummary = debounce(async (event) => {
    const subjectElement = event.target.closest(combinedSelector);
    if (!subjectElement) return;

    try {
      // The initial "Loading summary..." is now set inside fetchSummaryForEmail
      // to ensure it happens before any async operations that could be aborted.
      const summary = await fetchSummaryForEmail(subjectElement, event);
      // Check if the controller was aborted during the process.
      // If currentAbortController is null here, it means fetchSummaryForEmail completed without being aborted by a new event.
      // If it's not null, it means a new event came in and this execution path should not update the tooltip.
      if (currentAbortController && currentAbortController.signal.aborted && event.target.tooltipMouseleaveListener) {
          // If an abort happened and this is an old, aborted call, don't update.
          // The tooltip might be managed by a newer call or hidden by mouseleave.
          console.log("Debounced call: summarization was aborted, not updating tooltip.");
          return;
      }
      showSummaryTooltip(event, summary); 
    } catch (error) {
      // AbortErrors should be caught and handled within fetchSummaryForEmail or fetchSummaryForSpecificId
      // If an error bubbles up here, it's likely not an AbortError.
      console.error("Error in debounced hover handler:", error);
      showSummaryTooltip(event, `Error: ${error.message}`); 
    }
  }, 300);

  const setupListeners = (targetNode) => {
    targetNode.querySelectorAll(combinedSelector).forEach(subject => {
      if (!subject.dataset.summaryAttached) {
        subject.dataset.summaryAttached = 'true';
        subject.addEventListener('mouseenter', debouncedFetchAndShowSummary);
        // Mouseleave is handled by showSummaryTooltip
      }
    });
  };
  
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches(combinedSelector)) {
              if (!node.dataset.summaryAttached) {
                node.dataset.summaryAttached = 'true';
                node.addEventListener('mouseenter', debouncedFetchAndShowSummary);
              }
            }
            setupListeners(node); // Also check children of added nodes
          }
        });
      } else if (mutation.type === 'attributes') {
        // If an attribute relevant to ID finding changes, re-evaluate elements
        // This is less critical for hover listeners but good for completeness
        if (targetNode.matches && targetNode.matches(combinedSelector)) {
             if (!targetNode.dataset.summaryAttached) { // Element might have been dynamically loaded
                targetNode.dataset.summaryAttached = 'true';
                targetNode.addEventListener('mouseenter', debouncedFetchAndShowSummary);
            }
        }
      }
    }
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true, // Observe attributes like data-message-id if they change
    attributeFilter: ['id', 'data-legacy-message-id', 'data-message-id', 'data-thread-id', 'class', 'role'] // Added class/role
  });
  
  // Initial setup for elements already present
  setupListeners(document.body);
}

// Wait for DOM content to be loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're in Gmail
  if (window.location.hostname === 'mail.google.com') {
    console.log("Email Summarizer extension initialized");
    
    // Initial delay to let Gmail fully load
    setTimeout(initHoverSummary, 2000);
  }
});

// Also try initializing when page is fully loaded
window.addEventListener('load', () => {
  if (window.location.hostname === 'mail.google.com') {
    console.log("Window loaded - initializing summarizer");
    setTimeout(initHoverSummary, 1000);
  }
});