/**
 * GitHub Content Script
 * Adds TaskNotes integration to GitHub issues and pull requests
 */

console.log('TaskNotes: GitHub content script loaded');

// TaskCreationModal is loaded via manifest.json

class GitHubTaskNotesIntegration {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the GitHub integration
   */
  async init() {
    if (this.initialized) return;

    console.log('TaskNotes: Initializing GitHub integration');
    
    // Wait for GitHub to fully load
    await this.waitForGitHubLoad();
    
    // Add TaskNotes button to GitHub interface
    this.addTaskNotesButton();
    
    // Set up observers for dynamic content
    this.setupObservers();
    
    this.initialized = true;
  }

  /**
   * Wait for GitHub interface to load
   */
  async waitForGitHubLoad() {
    return new Promise((resolve) => {
      const checkGitHub = () => {
        // Look for GitHub's main content or issue/PR header
        const mainContent = document.querySelector('#js-repo-pjax-container') ||
                           document.querySelector('.js-discussion') ||
                           document.querySelector('.gh-header-actions');
        
        if (mainContent) {
          resolve();
        } else {
          setTimeout(checkGitHub, 500);
        }
      };
      checkGitHub();
    });
  }

  /**
   * Add TaskNotes button to GitHub issue/PR header
   */
  addTaskNotesButton() {
    // Remove existing button if it exists
    const existingButton = document.getElementById('tasknotes-github-button');
    if (existingButton) {
      existingButton.remove();
    }

    // Only add button if we're viewing an individual issue or PR
    if (!this.isViewingIssueOrPR()) {
      console.log('TaskNotes: Not viewing individual issue/PR');
      return;
    }

    // Look for the actual status/metadata area below the title
    const statusArea = document.querySelector('.gh-header-meta') ||
                      document.querySelector('.flex-items-center:has(.State)') ||
                      document.querySelector('.js-issue-row') ||
                      document.querySelector('[data-hpc] .d-flex') ||
                      // Fallback: look for any container with State class
                      document.querySelector('.State')?.closest('.d-flex, .flex-items-center') ||
                      // Last resort: create our own container after title
                      (() => {
                        const title = document.querySelector('[data-testid="issue-title"]');
                        if (title) {
                          const container = document.createElement('div');
                          container.style.cssText = 'display: flex; align-items: center; margin-top: 8px; gap: 8px;';
                          title.closest('h1').parentElement.appendChild(container);
                          return container;
                        }
                        return null;
                      })();

    if (!statusArea) {
      console.log('TaskNotes: GitHub status area not found');
      return;
    }

    console.log('TaskNotes: Found GitHub status area:', statusArea);
    console.log('TaskNotes: Status area innerHTML:', statusArea.innerHTML);

    // Create TaskNotes button matching GitHub's exact button structure
    const button = document.createElement('button');
    button.id = 'tasknotes-github-button';
    button.className = 'prc-Button-ButtonBase-c50BI tasknotes-github-button';
    button.setAttribute('type', 'button');
    button.setAttribute('title', 'Add to TaskNotes');
    button.setAttribute('data-loading', 'false');
    button.setAttribute('data-no-visuals', 'true');
    button.setAttribute('data-size', 'medium');
    button.setAttribute('data-variant', 'default');
    
    button.innerHTML = `
      <span data-component="buttonContent" data-align="center" class="prc-Button-ButtonContent-HKbr-">
        <img src="${chrome.runtime.getURL('icons/tasknotes-icon-16.png')}" alt="TaskNotes" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;">
        <span data-component="text" class="prc-Button-Label-pTQ3x">TaskNotes</span>
      </span>
    `;
    
    // Clean GitHub button styling (not badge-like)
    button.style.cssText = `
      margin-left: 8px !important;
      display: inline-flex !important;
      align-items: center !important;
      padding: 6px 12px !important;
      background: #f6f8fa !important;
      border: 1px solid #d0d7de !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: #24292f !important;
      cursor: pointer !important;
      text-decoration: none !important;
      line-height: 20px !important;
      white-space: nowrap !important;
      transition: all 0.1s ease !important;
    `;

    // Add click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.createTaskFromIssue();
    });
    
    // Add keyboard handler
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.createTaskFromIssue();
      }
    });

    // Add proper hover effects
    button.addEventListener('mouseenter', () => {
      button.style.setProperty('background', '#f3f4f6', 'important');
      button.style.setProperty('border-color', '#c1c7cd', 'important');
      button.style.setProperty('box-shadow', '0 1px 2px rgba(27, 31, 36, 0.15)', 'important');
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.setProperty('background', '#f6f8fa', 'important');
      button.style.setProperty('border-color', '#d0d7de', 'important');
      button.style.setProperty('box-shadow', 'none', 'important');
    });

    // Insert button to the right of the title and issue number
    const issueNumber = document.querySelector('.HeaderViewer-module__issueNumberText--ofQHQ') ||
                       document.querySelector('[data-testid="issue-title"]')?.parentElement?.querySelector('span') ||
                       document.querySelector('h1 span:last-child');
    
    if (issueNumber) {
      // Insert right after the issue number
      issueNumber.insertAdjacentElement('afterend', button);
    } else {
      // Fallback: append to the title container
      const titleContainer = document.querySelector('[data-testid="issue-title"]')?.closest('h1');
      if (titleContainer) {
        titleContainer.appendChild(button);
      } else {
        statusArea.appendChild(button);
      }
    }
    
    console.log('TaskNotes: Button added to GitHub issue/PR');
    console.log('TaskNotes: Button element:', button);
    console.log('TaskNotes: Button visible?', button.offsetWidth > 0 && button.offsetHeight > 0);
    console.log('TaskNotes: Updated status area:', statusArea.innerHTML);
  }

  /**
   * Set up observers to re-add button when GitHub updates
   */
  setupObservers() {
    // Observer for DOM changes (GitHub is a SPA)
    const observer = new MutationObserver((mutations) => {
      let shouldCheckForButton = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new nodes contain issue/PR content
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && (
                node.querySelector('.js-discussion') ||
                node.querySelector('[class*="HeaderMenu-module__menuActionsContainer"]') ||
                node.querySelector('.gh-header-actions') ||
                node.querySelector('[data-testid="issue-header"]') ||
                node.classList?.contains('js-discussion')
              )) {
                shouldCheckForButton = true;
                console.log('TaskNotes: Issue/PR content detected');
                break;
              }
            }
          }
        }
      });
      
      if (shouldCheckForButton) {
        setTimeout(() => {
          const existingButton = document.getElementById('tasknotes-github-button');
          if (!existingButton) {
            console.log('TaskNotes: Adding button after content change');
            this.addTaskNotesButton();
          }
        }, 500);
      }
    });

    // Observe changes to GitHub's main content area
    const githubContainer = document.querySelector('#js-repo-pjax-container') ||
                           document.querySelector('.application-main') ||
                           document.body;
    
    if (githubContainer) {
      observer.observe(githubContainer, {
        childList: true,
        subtree: true
      });
      console.log('TaskNotes: GitHub observer set up');
    }

    // Also listen for URL changes (GitHub uses history API)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('TaskNotes: GitHub URL changed:', currentUrl);
        
        setTimeout(() => {
          const existingButton = document.getElementById('tasknotes-github-button');
          if (!existingButton) {
            this.addTaskNotesButton();
          }
        }, 800);
      }
    });
    
    urlObserver.observe(document, { subtree: true, childList: true });
  }

  /**
   * Check if we're currently viewing an individual issue or PR
   */
  isViewingIssueOrPR() {
    const url = window.location.href;
    
    // Check URL patterns for GitHub issues/PRs
    const isIssueOrPR = (url.includes('/issues/') || url.includes('/pull/')) &&
                       url.match(/\/(?:issues|pull)\/\d+/);
    
    // Also check for issue/PR content elements
    const hasIssueContent = document.querySelector('.js-discussion') ||
                           document.querySelector('[data-testid="issue-header"]') ||
                           document.querySelector('[class*="HeaderMenu-module__menuActionsContainer"]') ||
                           document.querySelector('.gh-header-actions') ||
                           document.querySelector('.discussion-timeline');

    console.log('TaskNotes: GitHub issue/PR check - URL match:', isIssueOrPR, 'Content:', !!hasIssueContent);
    return isIssueOrPR || hasIssueContent;
  }

  /**
   * Extract issue/PR data from current GitHub page
   */
  extractIssueData() {
    const issueData = {
      title: '',
      body: '',
      number: '',
      repository: '',
      labels: [],
      assignees: [],
      url: window.location.href,
      type: '', // 'issue' or 'pull_request'
      status: '', // 'open' or 'closed'
      timestamp: new Date().toISOString()
    };

    try {
      // Extract title
      const titleSelectors = [
        '.js-issue-title',
        '[data-testid="issue-title"]',
        '.gh-header-title .js-issue-title',
        'h1 bdi',
        '.js-discussion .gh-header-title'
      ];
      
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          issueData.title = element.textContent.trim();
          break;
        }
      }

      // Extract issue/PR number and repository from URL
      const urlMatch = issueData.url.match(/github\.com\/([^\/]+\/[^\/]+)\/(?:issues|pull)\/(\d+)/);
      if (urlMatch) {
        issueData.repository = urlMatch[1];
        issueData.number = urlMatch[2];
        issueData.type = issueData.url.includes('/pull/') ? 'pull_request' : 'issue';
      }

      // Extract body/description
      const bodySelectors = [
        '.comment-body',
        '.js-comment-body',
        '[data-testid="issue-body"]',
        '.timeline-comment .comment-body'
      ];
      
      for (const selector of bodySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          issueData.body = element.textContent.trim().substring(0, 500) + '...';
          break;
        }
      }

      // Extract labels
      const labelElements = document.querySelectorAll('.js-issue-labels a, .sidebar-labels a, [data-testid="label"]');
      issueData.labels = Array.from(labelElements).map(el => el.textContent.trim()).filter(label => label);

      // Extract assignees
      const assigneeElements = document.querySelectorAll('.assignee .avatar, .sidebar-assignee .avatar');
      issueData.assignees = Array.from(assigneeElements).map(el => el.alt || el.getAttribute('aria-label')).filter(assignee => assignee);

      // Extract status
      const statusElement = document.querySelector('.State') || document.querySelector('[data-testid="issue-state-badge"]');
      if (statusElement) {
        const statusText = statusElement.textContent.toLowerCase();
        issueData.status = statusText.includes('closed') || statusText.includes('merged') ? 'closed' : 'open';
      }

      console.log('TaskNotes: Extracted GitHub issue data:', issueData);
      return issueData;

    } catch (error) {
      console.error('TaskNotes: Error extracting GitHub issue data:', error);
      return issueData;
    }
  }

  /**
   * Create TaskNotes task from current issue/PR using modal
   */
  async createTaskFromIssue() {
    try {
      // Extract issue data
      const issueData = this.extractIssueData();

      if (!issueData.title && !issueData.repository) {
        throw new Error('Could not extract issue information');
      }

      // TaskCreationModal should be available from manifest injection
      if (typeof window.TaskCreationModal === 'undefined') {
        throw new Error('TaskCreationModal not loaded by manifest');
      }

      // Prepare prefill data
      const issueTitle = issueData.title || `${issueData.type === 'pull_request' ? 'PR' : 'Issue'} #${issueData.number}`;
      const prefillData = {
        title: `${issueData.type === 'pull_request' ? 'PR' : 'Issue'}: ${issueTitle}`,
        details: this.formatIssueNotes(issueData),
        tags: this.buildIssueTags(issueData),
        contexts: issueData.assignees.length > 0 ? issueData.assignees.map(a => `@${a}`) : [],
        projects: [issueData.repository],
        status: 'open',
        priority: this.determinePriority(issueData)
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
      console.error('TaskNotes: Error creating task from issue:', error);
      this.showError(error.message);
    }
  }

  /**
   * Format issue data into task notes
   */
  formatIssueNotes(issueData) {
    let notes = '';
    
    if (issueData.repository) {
      notes += `**Repository:** ${issueData.repository}\n`;
    }
    
    if (issueData.number) {
      notes += `**${issueData.type === 'pull_request' ? 'PR' : 'Issue'} #:** ${issueData.number}\n`;
    }
    
    if (issueData.status) {
      notes += `**Status:** ${issueData.status}\n`;
    }
    
    if (issueData.labels.length > 0) {
      notes += `**Labels:** ${issueData.labels.join(', ')}\n`;
    }
    
    if (issueData.assignees.length > 0) {
      notes += `**Assignees:** ${issueData.assignees.join(', ')}\n`;
    }
    
    notes += `**GitHub URL:** ${issueData.url}\n`;
    notes += `**Created:** ${new Date(issueData.timestamp).toLocaleString()}\n`;
    
    if (issueData.body) {
      notes += `\n**Description:**\n${issueData.body}`;
    }
    
    return notes;
  }

  /**
   * Build appropriate tags for the issue
   */
  buildIssueTags(issueData) {
    const tags = ['github'];
    
    if (issueData.type === 'pull_request') {
      tags.push('pull-request');
    } else {
      tags.push('issue');
    }
    
    // Add label-based tags (limit to prevent too many tags)
    if (issueData.labels.length > 0) {
      const labelTags = issueData.labels.slice(0, 3).map(label => 
        label.toLowerCase().replace(/[^a-z0-9]/g, '-')
      );
      tags.push(...labelTags);
    }
    
    return tags;
  }

  /**
   * Determine priority based on issue labels
   */
  determinePriority(issueData) {
    const highPriorityLabels = ['urgent', 'critical', 'high priority', 'p0', 'p1', 'blocker'];
    const lowPriorityLabels = ['low priority', 'p3', 'p4', 'nice to have'];
    
    const labels = issueData.labels.map(l => l.toLowerCase());
    
    if (labels.some(label => highPriorityLabels.some(hp => label.includes(hp)))) {
      return 'high';
    }
    
    if (labels.some(label => lowPriorityLabels.some(lp => label.includes(lp)))) {
      return 'low';
    }
    
    return 'normal';
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
    notification.className = `tasknotes-github-notification tasknotes-notification-${type}`;
    notification.textContent = message;
    
    // GitHub-like notification styling
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#2da44e' : '#da3633'};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
      animation: slideInRight 0.3s ease;
    `;
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 3000);
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const integration = new GitHubTaskNotesIntegration();
    integration.init();
  });
} else {
  const integration = new GitHubTaskNotesIntegration();
  integration.init();
}