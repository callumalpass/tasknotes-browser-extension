/**
 * Background Service Worker
 * Handles extension lifecycle, context menus, and keyboard shortcuts
 */

// Import browser polyfill for Manifest V3 service worker
importScripts('lib/browser-polyfill.min.js');

// Inline API Client (avoiding importScripts issues)
class TaskNotesAPI {
  constructor() {
    this.baseUrl = null;
    this.authToken = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      const settings = await this.getSettings();
      this.baseUrl = `http://localhost:${settings.apiPort || 8080}/api`;
      this.authToken = settings.apiAuthToken || null;
      this.initialized = true;
      console.log('API initialized:', this.baseUrl);
      return true;
    } catch (error) {
      console.error('Failed to initialize TaskNotes API:', error);
      return false;
    }
  }

  async getSettings() {
    try {
      const stored = await browser.storage.sync.get(['apiPort', 'apiAuthToken', 'defaultTags', 'defaultStatus', 'defaultPriority']);
      return {
        apiPort: stored.apiPort || 8080,
        apiAuthToken: stored.apiAuthToken || '',
        defaultTags: stored.defaultTags || ['web'],
        defaultStatus: stored.defaultStatus || 'open',
        defaultPriority: stored.defaultPriority || 'normal'
      };
    } catch (error) {
      console.error('Error loading settings:', error);
      // Return defaults if loading fails
      return {
        apiPort: 8080,
        apiAuthToken: '',
        defaultTags: ['web'],
        defaultStatus: 'open',
        defaultPriority: 'normal'
      };
    }
  }

  async request(endpoint, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      console.log('Making request to:', url);
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const data = await response.json();
      console.log('API response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('TaskNotes API not accessible. Make sure Obsidian is running with API enabled.');
      }
      throw error;
    }
  }

  async testConnection() {
    try {
      console.log('Testing connection to:', this.baseUrl + '/health');
      const response = await this.request('/health');
      console.log('Connection test successful:', response);
      return { success: true, data: response };
    } catch (error) {
      console.error('Connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  async createTask(taskData) {
    const settings = await this.getSettings();
    
    // Map extension fields to API fields and apply defaults
    const defaultTags = Array.isArray(settings.defaultTags) 
      ? settings.defaultTags 
      : (settings.defaultTags || 'web').split(',').map(tag => tag.trim());
      
    const task = {
      title: taskData.title,
      status: taskData.status || 'open',
      priority: taskData.priority || settings.defaultPriority || 'normal',
      tags: taskData.tags || defaultTags,
      contexts: taskData.contexts || [],
      projects: taskData.projects || [],
      details: taskData.details || taskData.notes, // Support both 'details' and 'notes' fields
      due: taskData.due,
      scheduled: taskData.scheduled,
      timeEstimate: taskData.timeEstimate,
      creationContext: 'api'
    };

    // Remove undefined fields to let API apply its own defaults
    Object.keys(task).forEach(key => {
      if (task[key] === undefined) {
        delete task[key];
      }
    });

    console.log('Creating task:', task);
    const result = await this.request('/tasks', {
      method: 'POST',
      body: task
    });
    console.log('Task creation result:', result);
    return result;
  }

  async getStats() {
    console.log('Getting stats from API');
    const result = await this.request('/stats');
    console.log('Stats result:', result);
    return result;
  }

  async getTasks(filters = {}) {
    // Note: POST /tasks/query seems to return empty results in current API version
    // For now, always use GET /tasks and do client-side filtering if needed
    console.log('Getting tasks using GET /tasks (client-side filtering for:', filters, ')');
    const result = await this.request('/tasks');
    
    // If filters are provided, do basic client-side filtering
    if (filters && Object.keys(filters).length > 0 && result.success && result.data && result.data.tasks) {
      let filteredTasks = result.data.tasks;
      
      // Filter by status if provided
      if (filters.status) {
        const statusFilter = filters.status.split(',').map(s => s.trim());
        filteredTasks = filteredTasks.filter(task => statusFilter.includes(task.status));
      }
      
      // Apply limit if provided
      if (filters.limit && typeof filters.limit === 'number') {
        filteredTasks = filteredTasks.slice(0, filters.limit);
      }
      
      // Return in same format as API
      return {
        success: true,
        data: {
          tasks: filteredTasks,
          total: result.data.total,
          filtered: filteredTasks.length,
          vault: result.data.vault
        }
      };
    }
    
    return result;
  }

  async getFilterOptions() {
    console.log('Getting filter options from API');
    const result = await this.request('/filter-options');
    console.log('Filter options result:', result);
    return result;
  }


  async getActiveTimeTracking() {
    try {
      const result = await this.request('/time/active');
      console.log('Active time tracking result:', result);
      return result;
    } catch (error) {
      console.log('Error getting active time tracking:', error);
      return { success: false, data: null };
    }
  }

  async getTimeSummary(period = 'today') {
    try {
      const result = await this.request(`/time/summary?period=${period}`);
      console.log('Time summary result:', result);
      return result;
    } catch (error) {
      console.log('Error getting time summary:', error);
      return { success: false, data: null };
    }
  }
}

let api;
let currentTimeTracking = null;
let pollingInterval = null;

console.log('TaskNotes background script loaded');

/**
 * Extension installation and startup
 */
browser.runtime.onInstalled.addListener(async () => {
  console.log('TaskNotes extension installed');
  
  // Initialize API client
  api = new TaskNotesAPI();
  api.initialize().then(() => {
    // Start polling for time tracking after API is initialized
    startTimeTrackingPoller();
  });
  
  // Create context menu items
  await createContextMenus();
});

// Also initialize on startup (when Chrome starts)
browser.runtime.onStartup.addListener(() => {
  console.log('TaskNotes extension starting up');
  
  // Initialize API client
  if (!api) {
    api = new TaskNotesAPI();
    api.initialize().then(() => {
      // Start polling for time tracking after API is initialized
      startTimeTrackingPoller();
    });
  } else {
    // If API already exists, just start the poller
    startTimeTrackingPoller();
  }
});

/**
 * Create right-click context menu items
 */
async function createContextMenus() {
  console.log('Creating context menus...');
  
  try {
    // Remove any existing context menus
    await browser.contextMenus.removeAll();
    console.log('Removed existing context menus, creating new ones...');
    
    // Create main context menu for pages
    await browser.contextMenus.create({
      id: 'create-task-page',
      title: 'Add page to TaskNotes',
      contexts: ['page']
    });
    console.log('Created page context menu successfully');

    // Create context menu for selected text
    await browser.contextMenus.create({
      id: 'create-task-selection',
      title: 'Add selection to TaskNotes',
      contexts: ['selection']
    });

    // Create context menu for links
    await browser.contextMenus.create({
      id: 'create-task-link',
      title: 'Add link to TaskNotes',
      contexts: ['link']
    });

    // Gmail-specific context menu
    await browser.contextMenus.create({
      id: 'create-task-email',
      title: 'Add email to TaskNotes',
      contexts: ['page'],
      documentUrlPatterns: ['https://mail.google.com/*']
    });
    
    console.log('All context menus created successfully');
  } catch (error) {
    console.error('Error creating context menus:', error);
  }
}

/**
 * Handle context menu clicks
 */
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked:', info.menuItemId, 'on tab:', tab.url);

  // Ensure API is initialized
  if (!api) {
    console.log('API not initialized, creating new instance');
    api = new TaskNotesAPI();
    await api.initialize();
  }

  try {
    let taskData = {};

    switch (info.menuItemId) {
      case 'create-task-page':
        taskData = {
          title: `Review: ${tab.title}`,
          details: `Source: ${tab.url}`,
          tags: ['web', 'review'],
          status: 'open'
        };
        break;

      case 'create-task-selection':
        taskData = {
          title: `Follow up: ${info.selectionText.substring(0, 50)}...`,
          details: `Selected text: "${info.selectionText}"\nSource: ${tab.url}`,
          tags: ['web', 'follow-up'],
          status: 'open'
        };
        break;

      case 'create-task-link':
        taskData = {
          title: `Check link: ${info.linkUrl}`,
          details: `Link: ${info.linkUrl}\nFound on: ${tab.url}`,
          tags: ['web', 'link'],
          status: 'open'
        };
        break;

      case 'create-task-email':
        // For Gmail, we need to extract email data from the page
        const emailData = await extractEmailData(tab.id);
        if (emailData) {
          taskData = {
            title: `Email: ${emailData.subject}`,
            details: `From: ${emailData.sender}\nSubject: ${emailData.subject}\nURL: ${tab.url}`,
            tags: ['email', 'gmail'],
            status: 'open'
          };
        } else {
          taskData = {
            title: `Email task from Gmail`,
            details: `URL: ${tab.url}`,
            tags: ['email', 'gmail'],
            status: 'open'
          };
        }
        break;
    }

    // Create the task
    console.log('Creating task with data:', taskData);
    const result = await api.createTask(taskData);
    console.log('Task creation result:', result);
    
    if (result.success) {
      // Extract task info from result for Obsidian link
      const taskData = result.data || result;
      const taskId = taskData.id || taskData.path || 'unknown';
      const taskPath = taskData.path; // This looks like the actual file path
      console.log('Task creation full result:', JSON.stringify(result, null, 2));
      console.log('Extracted task ID:', taskId);
      console.log('Task path:', taskPath);
      
      // Show success notification on page with click-to-open functionality
      await showPageNotification(tab.id, `Task created: ${taskData.title}`, 'success', taskPath);
      
      // Also show Chrome notification as backup (with fallback icon)
      browser.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title: 'TaskNotes', 
        message: `Task created successfully!`
      });
    } else {
      throw new Error(result.error || 'Failed to create task');
    }

  } catch (error) {
    console.error('Error creating task:', error);
    
    // Show error notification on page
    await showPageNotification(tab.id, `Error: ${error.message}`, 'error');
    
    // Show error notification (with fallback icon)
    browser.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-48.png',
      title: 'TaskNotes Error',
      message: error.message
    });
  }
});

// Keyboard shortcuts removed to avoid conflicts with browser shortcuts

/**
 * Extract email data from Gmail page
 */
async function extractEmailData(tabId) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        // This function runs in the page context
        const subject = document.querySelector('h2[data-thread-id]')?.textContent;
        const senderElement = document.querySelector('.go span[email]');
        const sender = senderElement?.getAttribute('email') || 
                     senderElement?.textContent ||
                     document.querySelector('.go .qu')?.textContent;
        
        return { subject, sender };
      }
    });

    return results[0]?.result || null;
  } catch (error) {
    console.error('Failed to extract email data:', error);
    return null;
  }
}

/**
 * Show notification on the page (similar to Gmail integration)
 */
async function showPageNotification(tabId, message, type = 'info', taskId = null) {
  try {
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: (message, type, taskId) => {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'} !important;
          color: white !important;
          padding: 12px 20px !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-weight: 500 !important;
          z-index: 999999 !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
          max-width: 300px !important;
          word-wrap: break-word !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        `;
        
        // Add animation keyframes if not already present
        if (!document.querySelector('#tasknotes-notifications-styles')) {
          const styles = document.createElement('style');
          styles.id = 'tasknotes-notifications-styles';
          styles.textContent = `
            @keyframes slideInRight {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            @keyframes slideOutRight {
              from {
                transform: translateX(0);
                opacity: 1;
              }
              to {
                transform: translateX(100%);
                opacity: 0;
              }
            }
          `;
          document.head.appendChild(styles);
        }
        
        notification.textContent = message;
        
        // Set title and click behavior based on whether we have a task path
        if (taskId && taskId !== 'unknown' && type === 'success') {
          notification.title = 'Click to open task in Obsidian';
          notification.style.cursor = 'pointer';
          
          // Add click to open in Obsidian
          notification.addEventListener('click', () => {
            
            // Use the actual file path from the API response
            let obsidianUrl;
            if (taskId.includes('.md')) {
              const filePath = taskId.replace(/^TaskNotes\//, ''); // Remove TaskNotes/ prefix if present
              obsidianUrl = `obsidian://open?file=${encodeURIComponent(filePath)}`;
            } else {
              obsidianUrl = `obsidian://`;
            }
            
            // Create a temporary link and click it (better user gesture handling)
            const link = document.createElement('a');
            link.href = obsidianUrl;
            link.target = '_blank';
            link.style.display = 'none';
            document.body.appendChild(link);
            
            try {
              link.click();
              
              // Clean up
              setTimeout(() => {
                if (link.parentNode) {
                  link.parentNode.removeChild(link);
                }
              }, 100);
              
            } catch (error) {
              // Clean up the original link
              if (link.parentNode) {
                link.parentNode.removeChild(link);
              }
            }
            
            // Also dismiss the notification
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
              if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
              }
            }, 300);
          });
        } else {
          notification.title = 'Click to dismiss';
          
          // Add click to dismiss
          notification.addEventListener('click', () => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
              if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
              }
            }, 300);
          });
        }
        
        document.body.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
          if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
              if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
              }
            }, 300);
          }
        }, 4000);
        
        // Return success indicator
        return { success: true, notificationCreated: true };
      },
      args: [message, type, taskId]
    });
    
  } catch (error) {
    console.error('Failed to show page notification:', error);
    
    // Fallback: Show system notification with click instructions
    browser.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-48.png',
      title: 'TaskNotes - Task Created!',
      message: `${message}\n\nClick here to get Obsidian link`
    });
  }
}

/**
 * Handle messages from content scripts and popup
 */
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

  // Ensure API is initialized
  if (!api) {
    api = new TaskNotesAPI();
    api.initialize();
  }

  switch (request.action) {
    case 'createTask':
      api.createTask(request.taskData)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open for async response

    case 'testConnection':
      api.testConnection()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getTasks':
      api.getTasks(request.filters)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getStats':
      api.getStats()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getFilterOptions':
      api.getFilterOptions()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;


    case 'getCurrentTimeTracking':
      api.getActiveTimeTracking()
        .then(result => {
          if (result.success && result.data.activeSessions && result.data.activeSessions.length > 0) {
            const session = result.data.activeSessions[0];
            sendResponse({ 
              success: true, 
              data: {
                taskId: session.task.id,
                taskTitle: session.task.title,
                startTime: session.session.startTime,
                elapsedTime: session.elapsedMinutes * 60000 // Convert to milliseconds
              }
            });
          } else {
            sendResponse({ success: true, data: null });
          }
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

/**
 * Time tracking poller
 */

function startTimeTrackingPoller() {
  if (pollingInterval) return;
  
  console.log('Starting time tracking poller');
  
  // Poll every 5 seconds for time tracking updates
  pollingInterval = setInterval(async () => {
    try {
      // Get active time tracking sessions
      const response = await api.getActiveTimeTracking();
      
      if (response.success && response.data.activeSessions && response.data.activeSessions.length > 0) {
        const session = response.data.activeSessions[0];
        
        currentTimeTracking = {
          taskId: session.task.id,
          taskTitle: session.task.title,
          startTime: session.session.startTime,
          elapsedTime: session.elapsedMinutes * 60000 // Convert to milliseconds
        };
        
        console.log('Active time tracking detected:', currentTimeTracking);
      } else {
        currentTimeTracking = null;
        console.log('No active time tracking');
      }
    } catch (error) {
      console.error('Error polling time tracking:', error);
      currentTimeTracking = null;
    }
  }, 5000);
}

function stopTimeTrackingPoller() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  currentTimeTracking = null;
}


/**
 * Handle extension updates
 */
browser.runtime.onUpdateAvailable.addListener(() => {
  console.log('Extension update available');
  // Auto-reload the extension
  browser.runtime.reload();
});