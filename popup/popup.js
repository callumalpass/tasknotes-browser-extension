/**
 * TaskNotes Extension Popup
 * Handles the popup interface for creating tasks and managing settings
 */

class TaskNotesPopup {
  constructor() {
    this.currentTab = null;
    this.settings = {};
    this.init();
  }

  async init() {
    console.log('Initializing TaskNotes popup');
    
    // Get current tab info
    this.currentTab = await this.getCurrentTab();
    
    // Load settings
    await this.loadSettings();
    
    // Load filter options (including priorities)
    await this.loadFilterOptions();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Test connection on startup
    this.testConnection();
    
    // Pre-fill form with current page info
    this.prefillTaskForm();
  }

  /**
   * Get current active tab
   */
  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    this.settings = await new Promise((resolve) => {
      chrome.storage.sync.get({
        apiPort: 8080,
        apiAuthToken: '',
        defaultTags: 'web',
        defaultPriority: 'Normal'
      }, resolve);
    });
    
    // Update UI with loaded settings
    document.getElementById('api-port').value = this.settings.apiPort;
    document.getElementById('auth-token').value = this.settings.apiAuthToken;
    document.getElementById('default-tags').value = this.settings.defaultTags;
    // Priority will be set after loading filter options
  }

  /**
   * Load filter options from API (including custom priorities)
   */
  async loadFilterOptions() {
    try {
      console.log('Loading filter options...');
      const response = await this.sendMessage({
        action: 'getFilterOptions'
      });

      if (response.success && response.data && response.data.success) {
        const filterOptions = response.data.data;
        console.log('Filter options loaded:', filterOptions);
        console.log('Priorities from API:', filterOptions.priorities);
        
        // Update priority dropdown with custom priorities
        this.updatePriorityDropdown(filterOptions.priorities || []);
      } else {
        console.warn('Failed to load filter options:', response);
        this.updatePriorityDropdown([]);
      }
    } catch (error) {
      console.error('Error loading filter options:', error);
      this.updatePriorityDropdown([]);
    }
  }

  /**
   * Update priority dropdown with custom priorities from API
   */
  updatePriorityDropdown(priorities) {
    const prioritySelect = document.getElementById('task-priority');
    
    // Clear existing options
    prioritySelect.innerHTML = '';
    
    if (priorities && priorities.length > 0) {
      // Use custom priorities from API
      console.log('Using custom priorities:', priorities);
      priorities.forEach(priority => {
        const option = document.createElement('option');
        option.value = priority.value || priority.id;
        option.textContent = priority.label || priority.name;
        prioritySelect.appendChild(option);
        console.log(`Added priority option: ${option.value} - ${option.textContent}`);
      });
    } else {
      // Fallback to default priorities if API unavailable
      console.log('Using fallback priorities');
      const defaultPriorities = [
        { value: 'low', name: 'Low' },
        { value: 'normal', name: 'Normal' },
        { value: 'high', name: 'High' },
        { value: 'critical', name: 'Critical' }
      ];
      
      defaultPriorities.forEach(priority => {
        const option = document.createElement('option');
        option.value = priority.value;
        option.textContent = priority.name;
        prioritySelect.appendChild(option);
      });
    }
    
    // Set default priority after populating options
    prioritySelect.value = this.settings.defaultPriority || 'normal';
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Task creation form
    document.getElementById('task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createTask();
    });

    // Quick actions
    document.getElementById('add-page-task').addEventListener('click', () => {
      this.addCurrentPage();
    });
    
    document.getElementById('view-stats').addEventListener('click', () => {
      this.viewStats();
    });

    // Settings
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Connection test
    document.getElementById('test-connection').addEventListener('click', () => {
      this.testConnection();
    });

    // Auto-save settings on change
    ['api-port', 'auth-token', 'default-tags'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.saveSettings();
      });
    });
  }

  /**
   * Pre-fill task form with current page information
   */
  prefillTaskForm() {
    if (this.currentTab) {
      const titleInput = document.getElementById('task-title');
      const notesInput = document.getElementById('task-notes');
      
      // Actually fill in the title field, not just placeholder
      titleInput.value = `Review: ${this.currentTab.title}`;
      titleInput.placeholder = `Review: ${this.currentTab.title}`;
      
      // Actually fill in the notes field, not just placeholder
      notesInput.value = `Source: ${this.currentTab.url}`;
      notesInput.placeholder = `Source: ${this.currentTab.url}`;
      
      // Pre-fill tags
      const tagsInput = document.getElementById('task-tags');
      tagsInput.value = this.settings.defaultTags;
    }
  }

  /**
   * Create task from form data
   */
  async createTask() {
    const createBtn = document.getElementById('create-task-btn');
    const originalText = createBtn.textContent;
    
    try {
      createBtn.textContent = 'Creating...';
      createBtn.disabled = true;

      // Get form data
      const title = document.getElementById('task-title').value.trim() ||
                   `Review: ${this.currentTab.title}`;
      const priority = document.getElementById('task-priority').value;
      const tags = document.getElementById('task-tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      const notes = document.getElementById('task-notes').value.trim() ||
                   `Source: ${this.currentTab.url}`;

      // Prepare task data
      const taskData = {
        title,
        priority,
        tags: tags.length > 0 ? tags : ['web'],
        notes: notes + `\n\nCreated from: ${this.currentTab.url}`
      };

      // Send to background script
      const response = await this.sendMessage({
        action: 'createTask',
        taskData
      });

      if (response.success) {
        this.showMessage('Task created successfully!', 'success');
        
        // Clear form
        document.getElementById('task-title').value = '';
        document.getElementById('task-notes').value = '';
        
        // Close popup after short delay
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(response.error || 'Failed to create task');
      }

    } catch (error) {
      console.error('Error creating task:', error);
      this.showMessage(error.message, 'error');
    } finally {
      createBtn.textContent = originalText;
      createBtn.disabled = false;
    }
  }

  /**
   * Add current page as a task
   */
  async addCurrentPage() {
    const btn = document.getElementById('add-page-task');
    const originalText = btn.textContent;
    
    try {
      btn.textContent = 'Adding...';
      btn.disabled = true;

      const taskData = {
        title: `Review: ${this.currentTab.title}`,
        priority: this.settings.defaultPriority,
        tags: this.settings.defaultTags.split(',').map(tag => tag.trim()),
        notes: `Source: ${this.currentTab.url}\n\nAdded from browser extension`
      };

      const response = await this.sendMessage({
        action: 'createTask',
        taskData
      });

      if (response.success) {
        this.showMessage('Page added to TaskNotes!', 'success');
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(response.error || 'Failed to add page');
      }

    } catch (error) {
      console.error('Error adding page:', error);
      this.showMessage(error.message, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  /**
   * View TaskNotes statistics
   */
  async viewStats() {
    const btn = document.getElementById('view-stats');
    const originalText = btn.textContent;
    
    try {
      btn.textContent = 'Loading...';
      btn.disabled = true;

      const response = await this.sendMessage({
        action: 'getStats'
      });

      if (response.success) {
        const stats = response.data.data;
        const message = `Tasks: ${stats.total} total, ${stats.active} active, ${stats.completed} completed, ${stats.overdue} overdue`;
        this.showMessage(message, 'info');
      } else {
        throw new Error(response.error || 'Failed to get stats');
      }

    } catch (error) {
      console.error('Error getting stats:', error);
      this.showMessage(error.message, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  /**
   * Test connection to TaskNotes API
   */
  async testConnection() {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = statusIndicator.querySelector('.status-text');
    const testBtn = document.getElementById('test-connection');
    
    // Set connecting state
    statusIndicator.className = 'status-indicator connecting';
    statusText.textContent = 'Connecting...';
    testBtn.disabled = true;

    try {
      const response = await this.sendMessage({
        action: 'testConnection'
      });

      if (response.success) {
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = 'Connected';
        this.showMessage('Connection successful!', 'success');
      } else {
        throw new Error(response.error || 'Connection failed');
      }

    } catch (error) {
      console.error('Connection test failed:', error);
      statusIndicator.className = 'status-indicator error';
      statusText.textContent = 'Disconnected';
      this.showMessage(`Connection failed: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings() {
    const settings = {
      apiPort: parseInt(document.getElementById('api-port').value) || 8080,
      apiAuthToken: document.getElementById('auth-token').value,
      defaultTags: document.getElementById('default-tags').value,
      defaultPriority: document.getElementById('task-priority').value
    };

    await new Promise((resolve) => {
      chrome.storage.sync.set(settings, resolve);
    });

    this.settings = settings;
    this.showMessage('Settings saved!', 'success');
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  /**
   * Show message to user
   */
  showMessage(text, type = 'info') {
    const messagesContainer = document.getElementById('messages');
    
    // Remove existing messages
    messagesContainer.innerHTML = '';
    
    // Create new message
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    messagesContainer.appendChild(message);
    
    // Auto-remove after 3 seconds (except for errors)
    if (type !== 'error') {
      setTimeout(() => {
        if (message.parentNode) {
          message.parentNode.removeChild(message);
        }
      }, 3000);
    }
  }
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new TaskNotesPopup();
  });
} else {
  new TaskNotesPopup();
}