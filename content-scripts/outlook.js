/**
 * Outlook Content Script
 * Adds TaskNotes integration to Outlook web interface
 */

console.log('TaskNotes: Outlook content script loaded');

/**
 * Initialize Outlook integration when page is ready
 */
function initializeOutlook() {
  console.log('TaskNotes: Initializing Outlook integration');
  
  // Add TaskNotes button to Outlook toolbar
  addTaskNotesButton();
  
  // Watch for navigation changes in Outlook SPA
  observeOutlookChanges();
}

/**
 * Add TaskNotes button to Outlook email header/toolbar
 */
function addTaskNotesButton() {
  console.log('TaskNotes: Starting Outlook button search...');
  
  // Remove existing button if it exists
  const existingButton = document.querySelector('.tasknotes-outlook-button');
  if (existingButton) {
    existingButton.remove();
  }

  // Only add button if we're viewing an individual email
  if (!isViewingIndividualEmail()) {
    console.log('TaskNotes: Not viewing individual email in Outlook');
    return;
  }

  // Try to find email header/subject area (be more specific to avoid sidebar)
  const headerSelectors = [
    '[data-testid="message-subject"]', // Modern Outlook subject
    '[role="main"] [role="heading"]', // Heading within main content area
    '.ms-font-xl[role="heading"]', // Subject text with heading role
    'h1[id*="subject"]', // Subject heading
    '.od-MessageSubject', // Desktop Outlook subject
    '[aria-label*="Subject"]', // Subject by aria label
    '[class*="ReadingPane"] h1', // Reading pane heading
    '[class*="ReadingPane"] h2', // Reading pane heading
    '[class*="MessageHeader"] [role="heading"]' // Message header heading
  ];

  let emailHeader = null;
  let foundSelector = '';

  // Try each header selector
  for (const selector of headerSelectors) {
    emailHeader = document.querySelector(selector);
    if (emailHeader) {
      foundSelector = selector;
      console.log(`TaskNotes: Found Outlook email header with selector: ${selector}`);
      break;
    }
  }

  if (!emailHeader) {
    console.log('TaskNotes: No Outlook email header found');
    console.log('Available subject-related elements:', document.querySelectorAll('[data-testid*="subject"], [class*="Subject"], [role="heading"], h1, h2, h3'));
    console.log('All data-testid elements:', Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid')));
    console.log('Page title elements:', document.querySelectorAll('h1, h2, h3, [class*="title"], [class*="heading"]'));
    
    // Fallback: try to add to a general container if we can't find the header
    const fallbackContainer = document.querySelector('[role="main"]') || document.querySelector('.ms-Fabric');
    if (fallbackContainer) {
      console.log('TaskNotes: Using fallback container');
      // Create a simple wrapper and add button there
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'margin: 8px 0; text-align: right;';
      wrapper.appendChild(createButton());
      fallbackContainer.insertBefore(wrapper, fallbackContainer.firstChild);
      console.log('TaskNotes: Button added to fallback container');
    }
    return;
  }

  // Create TaskNotes button using helper function
  const button = createButton();
  
  // Insert button near the email header (not in collapsible toolbar)
  if (emailHeader) {
    insertButtonNearHeader(button, emailHeader, foundSelector);
  }
}

/**
 * Create the TaskNotes button element
 */
function createButton() {
  const button = document.createElement('button');
  button.className = 'tasknotes-outlook-button';
  button.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon-16.png')}" alt="TaskNotes" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"> TaskNotes`;
  button.title = 'Add email to TaskNotes';
  button.style.cssText = `
    background: #0078d4;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 16px;
    margin-right: 8px;
    font-size: 12px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  `;
  
  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleTaskNotesClick();
  });
  
  return button;
}

/**
 * Insert button near email header
 */
function insertButtonNearHeader(button, emailHeader, foundSelector) {
  // Make the header container flex to accommodate the button
  const headerParent = emailHeader.parentElement;
  if (headerParent) {
    headerParent.style.display = 'flex';
    headerParent.style.alignItems = 'center';
    headerParent.style.gap = '8px';
    headerParent.style.flexWrap = 'wrap';
    
    // Make sure the subject doesn't grow too much
    emailHeader.style.flex = '1';
    emailHeader.style.minWidth = '0';
  }
  
  // Insert button after the subject element
  button.style.flexShrink = '0';
  emailHeader.insertAdjacentElement('afterend', button);
  
  console.log(`TaskNotes: Button added to Outlook email header (${foundSelector})`);
}

/**
 * Check if we're viewing an individual email in Outlook
 */
function isViewingIndividualEmail() {
  const url = window.location.href;
  console.log('TaskNotes Outlook: Checking URL:', url);
  
  // Check URL patterns for individual email (Outlook has different patterns)
  const hasEmailInUrl = url.includes('/mail/') || 
                       url.includes('/owa/') ||
                       url.includes('/outlook.office.com/') ||
                       url.includes('#path=/mail') ||
                       url.includes('/id/');
  
  // Check for email content elements (be more generous)
  const emailContentSelectors = [
    '[data-testid="message-body"]',
    '.ms-MessageBody',
    '[role="main"] [data-testid="toolbar"]',
    '.od-EmailMessage',
    '[data-testid="message-subject"]',
    '.ms-font-xl',
    '[aria-label*="Message"]',
    '[class*="ReadingPane"]',
    '[class*="MessageBody"]',
    '[data-testid*="message"]'
  ];
  
  let hasEmailContent = false;
  for (const selector of emailContentSelectors) {
    if (document.querySelector(selector)) {
      hasEmailContent = true;
      console.log(`TaskNotes Outlook: Found email content with selector: ${selector}`);
      break;
    }
  }
  
  // Also check if we're NOT in the inbox list view
  const isListView = document.querySelector('[data-testid="message-list"]') || 
                    document.querySelector('.ms-List') ||
                    url.includes('/inbox') && !hasEmailContent;
  
  const result = (hasEmailInUrl || hasEmailContent) && !isListView;
  
  console.log('TaskNotes Outlook: Individual email check - URL:', hasEmailInUrl, 'Content:', hasEmailContent, 'ListViewCheck:', !isListView, 'Result:', result);
  return result;
}

/**
 * Handle TaskNotes button click
 */
function handleTaskNotesClick() {
  console.log('TaskNotes: Outlook button clicked');
  
  try {
    const emailData = extractOutlookEmailData();
    
    if (emailData) {
      // Send to background script
      chrome.runtime.sendMessage({
        action: 'createTask',
        taskData: {
          title: `Email: ${emailData.subject}`,
          notes: `From: ${emailData.sender}\nSubject: ${emailData.subject}\nURL: ${window.location.href}`,
          tags: ['email', 'outlook'],
          contexts: [emailData.sender]
        }
      }, (response) => {
        if (response && response.success) {
          showNotification('Task created successfully!', 'success');
        } else {
          showNotification('Failed to create task', 'error');
        }
      });
    } else {
      showNotification('Could not extract email data', 'error');
    }
  } catch (error) {
    console.error('TaskNotes: Error creating task:', error);
    showNotification('Error creating task', 'error');
  }
}

/**
 * Extract email data from Outlook page
 */
function extractOutlookEmailData() {
  try {
    console.log('TaskNotes: Extracting Outlook email data...');
    
    // Multiple selectors for email subject
    const subjectSelectors = [
      '[data-testid="message-subject"]',
      '[role="main"] [role="heading"]',
      '.ms-font-xl[role="heading"]',
      'h1[id*="subject"]',
      '.od-MessageSubject',
      '[aria-label*="Subject"]',
      '[class*="ReadingPane"] h1',
      '[class*="ReadingPane"] h2'
    ];
    
    let subject = '';
    for (const selector of subjectSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent?.trim()) {
        subject = element.textContent.trim();
        console.log(`TaskNotes: Found subject with selector ${selector}: "${subject}"`);
        break;
      }
    }
    
    // Multiple selectors for email sender
    const senderSelectors = [
      '[data-testid="message-from"]',
      '.ms-Persona-primaryText',
      '[aria-label*="From"]',
      '[data-testid="message-sender"]',
      '[class*="Persona"] [class*="primaryText"]',
      '[class*="sender"]'
    ];
    
    let sender = '';
    for (const selector of senderSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        sender = element.textContent?.trim() || 
                element.getAttribute('aria-label') || 
                element.getAttribute('title') || '';
        if (sender) {
          console.log(`TaskNotes: Found sender with selector ${selector}: "${sender}"`);
          break;
        }
      }
    }
    
    // Fallback to document title if no subject found
    if (!subject) {
      subject = document.title.replace(' - Outlook', '').replace(' - Microsoft Outlook', '').trim();
      console.log(`TaskNotes: Using document title as subject: "${subject}"`);
    }
    
    // Fallback sender
    if (!sender) {
      sender = 'Unknown sender';
      console.log('TaskNotes: Could not find sender, using fallback');
    }
    
    if (subject) {
      return {
        subject: subject.trim(),
        sender: sender.trim()
      };
    }
    
    return null;
  } catch (error) {
    console.error('TaskNotes: Error extracting Outlook email data:', error);
    return null;
  }
}

/**
 * Watch for Outlook navigation changes (SPA)
 */
function observeOutlookChanges() {
  // DOM observer for content changes
  const observer = new MutationObserver((mutations) => {
    let shouldCheckForButton = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if new nodes contain email content
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.querySelector) {
            // Look for Outlook email content indicators
            if (node.querySelector('[data-testid="message-body"]') ||
                node.querySelector('.ms-MessageBody') ||
                node.querySelector('[data-testid="toolbar"]') ||
                node.classList?.contains('ms-MessageBody')) {
              shouldCheckForButton = true;
              console.log('TaskNotes: Outlook email content detected');
              break;
            }
          }
        }
      }
    });
    
    if (shouldCheckForButton) {
      setTimeout(() => {
        if (!document.querySelector('.tasknotes-outlook-button')) {
          addTaskNotesButton();
        }
      }, 500);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also listen for URL changes
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('TaskNotes: Outlook URL changed:', currentUrl);
      
      setTimeout(() => {
        if (!document.querySelector('.tasknotes-outlook-button')) {
          addTaskNotesButton();
        }
      }, 800);
    }
  });
  
  urlObserver.observe(document, { subtree: true, childList: true });
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-family: sans-serif;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOutlook);
} else {
  initializeOutlook();
}