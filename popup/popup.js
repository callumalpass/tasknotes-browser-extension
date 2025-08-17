/**
 * TaskNotes Extension Popup
 * Handles the popup interface for creating tasks and managing settings
 */

// Browser polyfill is loaded via popup.html before this script

class TaskNotesPopup {
  constructor() {
    this.currentTab = null;
    this.settings = {};
    this.recentTasks = [];
    this.currentTrackingTask = null;
    this.trackingInterval = null;
    this.trackingStartTime = null;
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
    
    // Load recent tasks for time tracking
    this.loadRecentTasks();
    
    // Set up action bar
    this.setupActionBar();
    
    // Start time tracking sync
    this.startTimeTrackingSync();
  }

  /**
   * Get current active tab
   */
  async getCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      const stored = await browser.storage.sync.get(['apiPort', 'apiAuthToken', 'defaultTags', 'defaultStatus', 'defaultPriority']);
      this.settings = {
        apiPort: stored.apiPort || 8080,
        apiAuthToken: stored.apiAuthToken || '',
        defaultTags: stored.defaultTags || 'web',
        defaultStatus: stored.defaultStatus || 'open',
        defaultPriority: stored.defaultPriority || 'normal'
      };
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use defaults if loading fails
      this.settings = {
        apiPort: 8080,
        apiAuthToken: '',
        defaultTags: 'web',
        defaultStatus: 'open',
        defaultPriority: 'normal'
      };
    }
    
    // Update UI with loaded settings
    document.getElementById('api-port').value = this.settings.apiPort;
    document.getElementById('auth-token').value = this.settings.apiAuthToken;
    document.getElementById('default-tags').value = this.settings.defaultTags;
    // Priority will be set after loading filter options
  }

  /**
   * Load filter options from API (including custom priorities, statuses, etc.)
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
        
        // Update all dropdowns with custom values
        this.updateStatusDropdown(filterOptions.statuses || []);
        this.updatePriorityDropdown(filterOptions.priorities || []);
        this.setupAutoComplete('task-contexts', filterOptions.contexts || []);
        this.setupAutoComplete('task-projects', filterOptions.projects || []);
        this.setupAutoComplete('task-tags', filterOptions.tags || []);
      } else {
        console.warn('Failed to load filter options:', response);
        // Use fallback values
        this.updateStatusDropdown([]);
        this.updatePriorityDropdown([]);
      }
    } catch (error) {
      console.error('Error loading filter options:', error);
      // Use fallback values
      this.updateStatusDropdown([]);
      this.updatePriorityDropdown([]);
    }
  }

  /**
   * Update status dropdown with custom statuses from API
   */
  updateStatusDropdown(statuses) {
    const statusSelect = document.getElementById('task-status');
    
    // Clear existing options
    statusSelect.innerHTML = '';
    
    if (statuses && statuses.length > 0) {
      // Use custom statuses from API, sorted by order
      console.log('Using custom statuses:', statuses);
      const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
      
      sortedStatuses.forEach(status => {
        // Skip 'none' status as it's not valid for task creation
        if (status.value === 'none') return;
        
        const option = document.createElement('option');
        option.value = status.value;
        option.textContent = status.label;
        // Store color as data attribute for potential styling
        option.dataset.color = status.color;
        option.dataset.completed = status.isCompleted;
        statusSelect.appendChild(option);
      });
    } else {
      // Fallback to default statuses if API unavailable
      console.log('Using fallback statuses');
      const defaultStatuses = [
        { value: 'todo', label: 'To Do' },
        { value: 'open', label: 'Open' },
        { value: 'in-progress', label: 'In Progress' },
        { value: 'completed', label: 'Completed' }
      ];
      
      defaultStatuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status.value;
        option.textContent = status.label;
        statusSelect.appendChild(option);
      });
    }
    
    // Set default status
    statusSelect.value = this.settings.defaultStatus || 'open';
  }

  /**
   * Update priority dropdown with custom priorities from API
   */
  updatePriorityDropdown(priorities) {
    const prioritySelect = document.getElementById('task-priority');
    
    // Clear existing options
    prioritySelect.innerHTML = '';
    
    if (priorities && priorities.length > 0) {
      // Use custom priorities from API, sorted by weight
      console.log('Using custom priorities:', priorities);
      const sortedPriorities = [...priorities].sort((a, b) => a.weight - b.weight);
      
      sortedPriorities.forEach(priority => {
        // Skip 'none' priority as it's not valid for task creation
        if (priority.value === 'none') return;
        
        const option = document.createElement('option');
        option.value = priority.value;
        option.textContent = priority.label;
        // Store color as data attribute for potential styling
        option.dataset.color = priority.color;
        option.dataset.weight = priority.weight;
        prioritySelect.appendChild(option);
      });
    } else {
      // Fallback to default priorities if API unavailable
      console.log('Using fallback priorities');
      const defaultPriorities = [
        { value: 'low', label: 'Low' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' }
      ];
      
      defaultPriorities.forEach(priority => {
        const option = document.createElement('option');
        option.value = priority.value;
        option.textContent = priority.label;
        prioritySelect.appendChild(option);
      });
    }
    
    // Set default priority after populating options
    prioritySelect.value = this.settings.defaultPriority || 'normal';
  }

  /**
   * Setup autocomplete for input fields
   */
  setupAutoComplete(inputId, suggestions) {
    const input = document.getElementById(inputId);
    if (!input || !suggestions || suggestions.length === 0) return;
    
    // Filter out null values and ensure we have strings
    const validSuggestions = suggestions.filter(s => s && typeof s === 'string');
    if (validSuggestions.length === 0) return;
    
    // Create datalist for autocomplete
    const datalistId = `${inputId}-list`;
    let datalist = document.getElementById(datalistId);
    
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      input.parentElement.appendChild(datalist);
      input.setAttribute('list', datalistId);
    }
    
    // Clear existing options
    datalist.innerHTML = '';
    
    // Add suggestions as options
    validSuggestions.forEach(suggestion => {
      const option = document.createElement('option');
      option.value = suggestion;
      datalist.appendChild(option);
    });
    
    // Add placeholder to show example format
    if (inputId === 'task-contexts') {
      input.placeholder = validSuggestions.slice(0, 2).map(c => `@${c}`).join(', ') + '...';
    } else if (inputId === 'task-projects') {
      input.placeholder = validSuggestions.slice(0, 2).join(', ') + '...';
    } else if (inputId === 'task-tags') {
      input.placeholder = validSuggestions.slice(0, 3).join(', ') + '...';
    }
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
    
    // Time tracking controls
    document.getElementById('start-tracking-btn').addEventListener('click', () => {
      this.startTimeTracking();
    });
    
    document.getElementById('stop-tracking-btn').addEventListener('click', () => {
      this.stopTimeTracking();
    });
    
    document.getElementById('recent-task-select').addEventListener('change', (e) => {
      const selectedTaskId = e.target.value;
      if (selectedTaskId) {
        this.selectTaskForTracking(selectedTaskId);
      }
    });
    
    // Refresh tracking button
    document.getElementById('refresh-tracking-btn').addEventListener('click', () => {
      this.refreshTimeTracking();
    });
  }

  /**
   * Set up action bar interactions
   */
  setupActionBar() {
    const actionIcons = document.querySelectorAll('.action-icon');
    
    actionIcons.forEach(icon => {
      icon.addEventListener('click', (e) => {
        const type = icon.dataset.type;
        this.handleActionIconClick(type, icon);
      });
    });
  }
  
  /**
   * Handle action icon clicks
   */
  handleActionIconClick(type, iconElement) {
    switch(type) {
      case 'due-date':
        this.toggleDateInput('due', iconElement);
        break;
      case 'scheduled-date':
        this.toggleDateInput('scheduled', iconElement);
        break;
      case 'status':
        this.focusField('task-status');
        break;
      case 'priority':
        this.focusField('task-priority');
        break;
    }
  }
  
  /**
   * Toggle date input visibility
   */
  toggleDateInput(type, iconElement) {
    const dateInputsSection = document.querySelector('.date-inputs');
    const isVisible = dateInputsSection.classList.contains('visible');
    
    if (!isVisible) {
      dateInputsSection.style.display = 'block';
      dateInputsSection.classList.add('visible');
    }
    
    // Focus the appropriate input
    const inputId = type === 'due' ? 'task-due' : 'task-scheduled';
    document.getElementById(inputId).focus();
    
    // Update icon state
    this.updateActionIconStates();
  }
  
  /**
   * Focus a specific field
   */
  focusField(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.focus();
      if (field.tagName === 'SELECT') {
        field.click();
      }
    }
  }
  
  /**
   * Update action icon states based on form values
   */
  updateActionIconStates() {
    const dueDate = document.getElementById('task-due').value;
    const scheduledDate = document.getElementById('task-scheduled').value;
    const status = document.getElementById('task-status').value;
    const priority = document.getElementById('task-priority').value;
    
    // Update due date icon
    const dueDateIcon = document.querySelector('[data-type="due-date"]');
    if (dueDateIcon) {
      if (dueDate) {
        dueDateIcon.classList.add('has-value');
        dueDateIcon.title = `Due: ${new Date(dueDate).toLocaleString()}`;
      } else {
        dueDateIcon.classList.remove('has-value');
        dueDateIcon.title = 'Set due date';
      }
    }
    
    // Update scheduled date icon
    const scheduledIcon = document.querySelector('[data-type="scheduled-date"]');
    if (scheduledIcon) {
      if (scheduledDate) {
        scheduledIcon.classList.add('has-value');
        scheduledIcon.title = `Scheduled: ${new Date(scheduledDate).toLocaleString()}`;
      } else {
        scheduledIcon.classList.remove('has-value');
        scheduledIcon.title = 'Set scheduled date';
      }
    }
    
    // Update status icon
    const statusIcon = document.querySelector('[data-type="status"]');
    if (statusIcon) {
      if (status && status !== 'open') {
        statusIcon.classList.add('has-value');
        statusIcon.title = `Status: ${status}`;
      } else {
        statusIcon.classList.remove('has-value');
        statusIcon.title = 'Set status';
      }
    }
    
    // Update priority icon
    const priorityIcon = document.querySelector('[data-type="priority"]');
    if (priorityIcon) {
      if (priority && priority !== 'normal') {
        priorityIcon.classList.add('has-value');
        priorityIcon.title = `Priority: ${priority}`;
      } else {
        priorityIcon.classList.remove('has-value');
        priorityIcon.title = 'Set priority';
      }
    }
  }
  
  /**
   * Pre-fill task form with current page information
   */
  prefillTaskForm() {
    if (this.currentTab) {
      const titleInput = document.getElementById('task-title');
      const detailsInput = document.getElementById('task-details');
      
      // Actually fill in the title field, not just placeholder
      titleInput.value = `Review: ${this.currentTab.title}`;
      titleInput.placeholder = `Review: ${this.currentTab.title}`;
      
      // Actually fill in the details field, not just placeholder
      detailsInput.value = `Source: ${this.currentTab.url}`;
      detailsInput.placeholder = `Source: ${this.currentTab.url}`;
      
      // Pre-fill tags
      const tagsInput = document.getElementById('task-tags');
      tagsInput.value = this.settings.defaultTags;
      
      // Listen for changes to update action icons
      ['task-due', 'task-scheduled', 'task-status', 'task-priority'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
          this.updateActionIconStates();
        });
      });
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
      const status = document.getElementById('task-status').value;
      const priority = document.getElementById('task-priority').value;
      const contexts = document.getElementById('task-contexts').value
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
      const projects = document.getElementById('task-projects').value
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      const tags = document.getElementById('task-tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      const details = document.getElementById('task-details').value.trim() ||
                   `Source: ${this.currentTab.url}`;
      const dueDate = document.getElementById('task-due').value;
      const scheduledDate = document.getElementById('task-scheduled').value;
      const timeEstimate = parseInt(document.getElementById('task-time-estimate').value) || undefined;

      // Prepare task data
      const taskData = {
        title,
        status,
        priority,
        contexts: contexts.length > 0 ? contexts : [],
        projects: projects.length > 0 ? projects : [],
        tags: tags.length > 0 ? tags : ['web'],
        details: details + `\n\nCreated from: ${this.currentTab.url}`,
        due: dueDate || undefined,
        scheduled: scheduledDate || undefined,
        timeEstimate
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
        document.getElementById('task-details').value = '';
        document.getElementById('task-due').value = '';
        document.getElementById('task-scheduled').value = '';
        document.getElementById('task-contexts').value = '';
        document.getElementById('task-projects').value = '';
        document.getElementById('task-time-estimate').value = '';
        this.updateActionIconStates();
        
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
        details: `Source: ${this.currentTab.url}\n\nAdded from browser extension`
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
      defaultStatus: document.getElementById('task-status').value,
      defaultPriority: document.getElementById('task-priority').value
    };

    await browser.storage.sync.set(settings);

    this.settings = settings;
    this.showMessage('Settings saved!', 'success');
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    return browser.runtime.sendMessage(message);
  }

  /**
   * Load recent tasks for time tracking
   */
  async loadRecentTasks() {
    try {
      const response = await this.sendMessage({
        action: 'getTasks',
        filters: { status: 'open,in-progress', limit: 20 }
      });
      
      console.log('Recent tasks response:', response);
      
      if (response.success && response.data) {
        // Handle different response structures
        let tasksData = null;
        if (Array.isArray(response.data)) {
          tasksData = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          tasksData = response.data.data;
        } else if (response.data.tasks && Array.isArray(response.data.tasks)) {
          tasksData = response.data.tasks;
        }
        
        if (tasksData) {
          this.recentTasks = tasksData;
          this.updateRecentTasksDropdown();
        } else {
          console.warn('No valid tasks data found in response:', response.data);
          this.recentTasks = [];
          this.updateRecentTasksDropdown();
        }
      } else {
        console.warn('Failed to load recent tasks:', response);
        this.recentTasks = [];
        this.updateRecentTasksDropdown();
      }
    } catch (error) {
      console.error('Error loading recent tasks:', error);
      this.recentTasks = [];
      this.updateRecentTasksDropdown();
    }
  }
  
  /**
   * Update recent tasks dropdown
   */
  updateRecentTasksDropdown() {
    const select = document.getElementById('recent-task-select');
    select.innerHTML = '<option value="">Select a task...</option>';
    
    // Ensure recentTasks is an array before using forEach
    if (!Array.isArray(this.recentTasks)) {
      console.warn('recentTasks is not an array:', this.recentTasks);
      this.recentTasks = [];
    }
    
    this.recentTasks.forEach(task => {
      const option = document.createElement('option');
      option.value = task.id || task.path;
      option.textContent = task.title;
      if (task.priority === 'high' || task.priority === 'urgent') {
        option.textContent = `⭐ ${task.title}`;
      }
      select.appendChild(option);
    });
  }
  
  /**
   * Select a task for time tracking
   */
  selectTaskForTracking(taskId) {
    const task = this.recentTasks.find(t => (t.id || t.path) === taskId);
    if (task) {
      this.currentTrackingTask = task;
      // Enable start button
      document.getElementById('start-tracking-btn').disabled = false;
    }
  }
  
  /**
   * Start time tracking
   */
  async startTimeTracking() {
    if (!this.currentTrackingTask) {
      this.showMessage('Please select a task first', 'error');
      return;
    }
    
    try {
      // For now, we'll track locally since the API endpoint isn't available
      // In a real implementation, this would call the API
      this.trackingStartTime = Date.now();
      this.updateTimeTrackingDisplay();
      
      // Update UI
      document.getElementById('start-tracking-btn').disabled = true;
      document.getElementById('stop-tracking-btn').disabled = false;
      document.getElementById('recent-task-select').disabled = true;
      
      // Start timer
      this.trackingInterval = setInterval(() => {
        this.updateTimeTrackingDisplay();
      }, 1000);
      
      this.showMessage('Time tracking started', 'success');
    } catch (error) {
      console.error('Error starting time tracking:', error);
      this.showMessage('Failed to start tracking', 'error');
    }
  }
  
  /**
   * Stop time tracking
   */
  async stopTimeTracking() {
    if (!this.currentTrackingTask || !this.trackingStartTime) {
      return;
    }
    
    try {
      // Calculate elapsed time
      const elapsedMs = Date.now() - this.trackingStartTime;
      const elapsedMinutes = Math.round(elapsedMs / 60000);
      
      // In a real implementation, this would save to the API
      // For now, just show a message
      this.showMessage(`Tracked ${elapsedMinutes} minutes on "${this.currentTrackingTask.title}"`, 'success');
      
      // Reset tracking
      this.currentTrackingTask = null;
      this.trackingStartTime = null;
      if (this.trackingInterval) {
        clearInterval(this.trackingInterval);
        this.trackingInterval = null;
      }
      
      // Reset UI
      document.getElementById('start-tracking-btn').disabled = false;
      document.getElementById('stop-tracking-btn').disabled = true;
      document.getElementById('recent-task-select').disabled = false;
      document.getElementById('recent-task-select').value = '';
      
      this.updateTimeTrackingDisplay();
    } catch (error) {
      console.error('Error stopping time tracking:', error);
      this.showMessage('Failed to stop tracking', 'error');
    }
  }
  
  /**
   * Update time tracking display
   */
  updateTimeTrackingDisplay() {
    const statusDiv = document.getElementById('time-tracking-status');
    
    if (this.currentTrackingTask && this.trackingStartTime) {
      const elapsedMs = Date.now() - this.trackingStartTime;
      const seconds = Math.floor(elapsedMs / 1000) % 60;
      const minutes = Math.floor(elapsedMs / 60000) % 60;
      const hours = Math.floor(elapsedMs / 3600000);
      
      const timeStr = hours > 0 
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      statusDiv.classList.add('active');
      statusDiv.innerHTML = `
        <div class="task-name">${this.currentTrackingTask.title}</div>
        <div class="time-elapsed">${timeStr}</div>
      `;
    } else {
      statusDiv.classList.remove('active');
      statusDiv.innerHTML = '<p class="no-tracking">No active time tracking</p>';
    }
  }
  
  /**
   * Start time tracking sync (polling)
   */
  startTimeTrackingSync() {
    // Initial check
    this.refreshTimeTracking();
    
    // Set up polling every 5 seconds
    this.syncInterval = setInterval(() => {
      this.refreshTimeTracking();
    }, 5000);
    
    // Update sync status
    this.updateSyncStatus('active', 'Syncing every 5 seconds');
  }
  
  /**
   * Refresh time tracking from API
   */
  async refreshTimeTracking() {
    try {
      this.updateSyncStatus('checking', 'Checking for updates...');
      
      // Get current time tracking from API
      const response = await this.sendMessage({ action: 'getCurrentTimeTracking' });
      
      if (response.success) {
        this.handleTimeTrackingUpdate(response.data);
        this.updateSyncStatus('active', `Last checked: ${new Date().toLocaleTimeString()}`);
      } else {
        this.updateSyncStatus('active', 'No active tracking found');
      }
    } catch (error) {
      console.error('Error refreshing time tracking:', error);
      this.updateSyncStatus('active', 'Error syncing');
    }
  }
  
  /**
   * Update sync status indicator
   */
  updateSyncStatus(status, text) {
    const indicator = document.getElementById('sync-indicator');
    const textEl = indicator.querySelector('.sync-text');
    
    indicator.className = `sync-indicator ${status}`;
    textEl.textContent = text;
  }
  
  /**
   * Handle time tracking updates from API
   */
  handleTimeTrackingUpdate(data) {
    if (data) {
      // Update UI with active tracking
      this.currentTrackingTask = {
        id: data.taskId,
        title: data.taskTitle
      };
      this.trackingStartTime = new Date(data.startTime).getTime();
      
      // Update UI
      document.getElementById('start-tracking-btn').disabled = true;
      document.getElementById('stop-tracking-btn').disabled = false;
      document.getElementById('recent-task-select').disabled = true;
      
      // Start local timer update
      if (this.trackingInterval) {
        clearInterval(this.trackingInterval);
      }
      this.trackingInterval = setInterval(() => {
        this.updateTimeTrackingDisplay();
      }, 1000);
      
      this.updateTimeTrackingDisplay();
      
    } else {
      // No active tracking
      this.currentTrackingTask = null;
      this.trackingStartTime = null;
      
      if (this.trackingInterval) {
        clearInterval(this.trackingInterval);
        this.trackingInterval = null;
      }
      
      // Reset UI
      document.getElementById('start-tracking-btn').disabled = false;
      document.getElementById('stop-tracking-btn').disabled = true;
      document.getElementById('recent-task-select').disabled = false;
      document.getElementById('recent-task-select').value = '';
      
      this.updateTimeTrackingDisplay();
    }
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