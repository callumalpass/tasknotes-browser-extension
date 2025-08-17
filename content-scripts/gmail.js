/**
 * Gmail Content Script
 * Adds TaskNotes integration directly to Gmail interface
 */

// Browser polyfill is loaded via manifest.json before this script
// TaskCreationModal is now loaded via manifest.json

class GmailTaskNotesIntegration {
  constructor() {
    this.initialized = false;
    this.api = null;
  }

  /**
   * Initialize the Gmail integration
   */
  async init() {
    if (this.initialized) return;

    console.log('Initializing TaskNotes Gmail integration');
    
    // Wait for Gmail to fully load
    await this.waitForGmailLoad();
    
    // Add TaskNotes button to Gmail interface
    this.addTaskNotesButton();
    
    // Set up observers for dynamic content
    this.setupObservers();
    
    this.initialized = true;
  }

  /**
   * Wait for Gmail interface to load
   */
  async waitForGmailLoad() {
    return new Promise((resolve) => {
      const checkGmail = () => {
        // Look for Gmail's main toolbar or conversation view
        const toolbar = document.querySelector('[role="toolbar"]') ||
                       document.querySelector('.ar.as') ||
                       document.querySelector('.nH .nU');
        
        if (toolbar) {
          resolve();
        } else {
          setTimeout(checkGmail, 500);
        }
      };
      checkGmail();
    });
  }

  /**
   * Add TaskNotes button to Gmail email title area (only for individual opened emails)
   */
  addTaskNotesButton() {
    // Remove existing button if it exists
    const existingButton = document.getElementById('tasknotes-gmail-button');
    if (existingButton) {
      existingButton.remove();
    }

    // Only add button if we're viewing an individual email (not inbox/list view)
    if (!this.isViewingIndividualEmail()) {
      console.log('Not viewing individual email, skipping button');
      return;
    }

    // Look for email header/title area in individual email view
    const emailHeader = document.querySelector('[role="main"] .hP') || // Individual email subject
                        document.querySelector('[role="main"] h2[data-thread-id]') || // Thread subject in main view
                        document.querySelector('.ii .hP') || // Email content area subject
                        document.querySelector('[data-message-id] .hP'); // Message-specific subject

    if (!emailHeader) {
      console.log('Gmail individual email header not found');
      return;
    }

    console.log('Found email header for individual email:', emailHeader.textContent);

    // Create TaskNotes button (compact for header)
    const button = document.createElement('div');
    button.id = 'tasknotes-gmail-button';
    button.className = 'tasknotes-button tasknotes-header-button';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('title', 'Add to TaskNotes');
    
    // Compact button for header area
    button.innerHTML = `
      <div class="asa">
        <img src="${browser.runtime.getURL('icons/tasknotes-icon-16.png')}" alt="TaskNotes" style="width: 16px; height: 16px; vertical-align: middle;">
        <span class="tasknotes-button-text">TaskNotes</span>
      </div>
    `;
    
    // Apply header-specific styling
    button.style.cssText = `
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      background: #f8f9fa;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 12px;
      color: #3c4043;
      cursor: pointer;
      transition: all 0.2s ease;
      gap: 4px;
    `;

    // Add click handler
    button.addEventListener('click', () => this.createTaskFromEmail());
    
    // Add keyboard handler
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.createTaskFromEmail();
      }
    });

    // Add hover effects
    button.addEventListener('mouseenter', () => {
      button.style.background = '#f1f3f4';
      button.style.borderColor = '#c1c7cd';
      button.style.boxShadow = '0 1px 2px rgba(60, 64, 67, 0.3)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = '#f8f9fa';
      button.style.borderColor = '#dadce0';
      button.style.boxShadow = 'none';
    });

    // Insert button inline with the email subject
    if (emailHeader) {
      // Make the email header container flex to accommodate the button
      const headerParent = emailHeader.parentElement;
      if (headerParent) {
        headerParent.style.display = 'flex';
        headerParent.style.alignItems = 'center';
        headerParent.style.gap = '8px';
        
        // Make sure the subject doesn't grow too much
        emailHeader.style.flex = '1';
        emailHeader.style.minWidth = '0'; // Allow text truncation if needed
      }
      
      // Insert button after the subject element
      button.style.flexShrink = '0'; // Prevent button from shrinking
      emailHeader.insertAdjacentElement('afterend', button);
    } else {
      console.log('Gmail email header not found');
      return;
    }

    console.log('TaskNotes button added to Gmail');
  }

  /**
   * Set up observers to re-add button when Gmail updates
   */
  setupObservers() {
    // Observer for DOM changes (Gmail is a SPA)
    const observer = new MutationObserver((mutations) => {
      let shouldCheckForButton = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new nodes contain individual email content (not inbox list)
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Look for individual email content indicators
              if (node.querySelector && (
                node.querySelector('.ii') || // Email body content
                node.querySelector('[data-message-id]') || // Individual message
                node.querySelector('.adn') || // Email content area
                node.classList?.contains('ii') ||
                node.hasAttribute('data-message-id')
              )) {
                shouldCheckForButton = true;
                console.log('Individual email content detected in DOM');
                break;
              }
            }
          }
        }
      });
      
      if (shouldCheckForButton) {
        // Wait a bit for Gmail to finish rendering
        setTimeout(() => {
          const existingButton = document.getElementById('tasknotes-gmail-button');
          if (!existingButton) {
            console.log('Email content detected, adding TaskNotes button');
            this.addTaskNotesButton();
          }
        }, 300);
      }
    });

    // Observe changes to Gmail's main content area
    const gmailContainer = document.querySelector('.nH') || // Main Gmail container
                          document.querySelector('[role="main"]') ||
                          document.querySelector('.arl') ||
                          document.body;
    
    if (gmailContainer) {
      observer.observe(gmailContainer, {
        childList: true,
        subtree: true
      });
      console.log('Gmail observer set up on container:', gmailContainer.className);
    }

    // Also listen for URL changes (Gmail uses history API)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('Gmail URL changed:', currentUrl);
        
        // Wait for new content to load
        setTimeout(() => {
          const existingButton = document.getElementById('tasknotes-gmail-button');
          if (!existingButton) {
            this.addTaskNotesButton();
          }
        }, 500);
      }
    });
    
    urlObserver.observe(document, { subtree: true, childList: true });
  }

  /**
   * Check if we're currently viewing an individual email (not inbox or list view)
   */
  isViewingIndividualEmail() {
    const url = window.location.href;
    
    // Check URL patterns for individual email views
    const isIndividualEmail = url.includes('/mail/u/') && 
                             (url.includes('#inbox/') || url.includes('#sent/') || url.includes('#all/')) &&
                             url.match(/\/[a-f0-9]{16}$/); // Gmail conversation ID pattern
    
    // Also check if we can see email content elements (not just list view)
    const hasEmailContent = document.querySelector('.ii') || // Email body content
                           document.querySelector('[data-message-id]') || // Individual message
                           document.querySelector('.adn'); // Email content area

    console.log('Individual email check - URL match:', isIndividualEmail, 'Content:', !!hasEmailContent);
    return isIndividualEmail || hasEmailContent;
  }

  /**
   * Extract email data from current Gmail view
   */
  extractEmailData() {
    const emailData = {
      subject: '',
      sender: '',
      senderEmail: '',
      body: '',
      url: window.location.href,
      timestamp: new Date().toISOString()
    };

    try {
      // Try multiple selectors for email subject
      const subjectSelectors = [
        'h2[data-thread-id]',
        '.hP',
        '.bog',
        '[data-thread-perm-id] h2',
        '.kv .hP'
      ];
      
      for (const selector of subjectSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          emailData.subject = element.textContent.trim();
          break;
        }
      }

      // Try multiple selectors for sender information
      const senderSelectors = [
        '.go span[email]',
        '.go .qu',
        '.gD',
        '.yW span[email]',
        '.yW span'
      ];

      for (const selector of senderSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          emailData.senderEmail = element.getAttribute('email') || '';
          emailData.sender = element.textContent?.trim() || emailData.senderEmail;
          if (emailData.sender) break;
        }
      }

      // Try to extract email body
      const bodySelectors = [
        '.ii',
        '.a3s.aiL',
        '.aHl',
        '.Am .ii'
      ];

      for (const selector of bodySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          emailData.body = element.textContent.trim().substring(0, 500) + '...';
          break;
        }
      }

      console.log('Extracted email data:', emailData);
      return emailData;

    } catch (error) {
      console.error('Error extracting email data:', error);
      return emailData;
    }
  }

  /**
   * Create TaskNotes task from current email using modal
   */
  async createTaskFromEmail() {
    try {
      // Extract email data
      const emailData = this.extractEmailData();

      if (!emailData.subject && !emailData.sender) {
        throw new Error('Could not extract email information');
      }

      // TaskCreationModal should be available from manifest injection
      if (typeof window.TaskCreationModal === 'undefined') {
        throw new Error('TaskCreationModal not loaded by manifest');
      }

      // Prepare prefill data
      const prefillData = {
        title: emailData.subject ? `Email: ${emailData.subject}` : 'Gmail Task',
        details: this.formatEmailNotes(emailData),
        tags: ['email', 'gmail'],
        contexts: emailData.sender ? [`@${emailData.sender.replace(/[<>]/g, '').trim()}`] : [],
        status: 'open',
        priority: 'normal'
      };

      // Create and show modal
      const modal = new window.TaskCreationModal({
        prefillData: prefillData,
        onComplete: (taskData) => {
          this.showSuccess(`Task created: ${taskData.title}`);
          modal.destroy();
        },
        onCancel: () => {
          modal.destroy();
        }
      });

      await modal.show();

    } catch (error) {
      console.error('Error creating task from email:', error);
      this.showError(error.message);
    }
  }

  /**
   * Format email data into task notes
   */
  formatEmailNotes(emailData) {
    let notes = '';
    
    if (emailData.sender) {
      notes += `**From:** ${emailData.sender}\n`;
    }
    
    if (emailData.senderEmail && emailData.senderEmail !== emailData.sender) {
      notes += `**Email:** ${emailData.senderEmail}\n`;
    }
    
    if (emailData.subject) {
      notes += `**Subject:** ${emailData.subject}\n`;
    }
    
    notes += `**Gmail URL:** ${emailData.url}\n`;
    notes += `**Created:** ${new Date(emailData.timestamp).toLocaleString()}\n`;
    
    if (emailData.body) {
      notes += `\n**Email Preview:**\n${emailData.body}`;
    }
    
    return notes;
  }


  /**
   * Show success message
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `tasknotes-notification tasknotes-notification-${type}`;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const integration = new GmailTaskNotesIntegration();
    integration.init();
  });
} else {
  const integration = new GmailTaskNotesIntegration();
  integration.init();
}