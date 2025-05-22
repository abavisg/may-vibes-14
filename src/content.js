// src/content.js

// Utility to debounce hover event
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function createTooltip(text) {
  const tooltip = document.createElement('div');
  tooltip.innerText = text;
  tooltip.style.position = 'absolute';
  tooltip.style.backgroundColor = '#fff8dc';
  tooltip.style.border = '1px solid #ccc';
  tooltip.style.padding = '5px 10px';
  tooltip.style.borderRadius = '5px';
  tooltip.style.fontSize = '12px';
  tooltip.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  tooltip.style.zIndex = 1000;
  return tooltip;
}

function showSummaryTooltip(event, summaryText) {
  const tooltip = createTooltip(summaryText);
  document.body.appendChild(tooltip);
  const rect = event.target.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  event.target.addEventListener('mouseleave', () => {
    tooltip.remove();
  }, { once: true });
}

// Mock summarizer — replace with API call later
async function fetchSummaryForEmail(messageId) {
  return `This is a one-line summary of message ${messageId}.`; // Placeholder
}

function initHoverSummary() {
  const observer = new MutationObserver(() => {
    const subjectLines = document.querySelectorAll('tr.zA span.bog');
    subjectLines.forEach(subject => {
      if (!subject.dataset.summaryAttached) {
        subject.dataset.summaryAttached = 'true';
        subject.addEventListener('mouseenter', debounce(async (event) => {
          const messageId = subject.closest('tr').dataset.messageId || 'mockId';
          const summary = await fetchSummaryForEmail(messageId);
          showSummaryTooltip(event, summary);
        }, 500));
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('load', () => {
  setTimeout(initHoverSummary, 3000); // Wait for Gmail to load
});
