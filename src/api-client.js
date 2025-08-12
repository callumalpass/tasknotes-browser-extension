/**
 * TaskNotes API Client
 * Handles communication with the local TaskNotes HTTP API
 */

class TaskNotesAPI {
  constructor() {
    this.baseUrl = null;
    this.authToken = null;
    this.initialized = false;
  }

  /**
   * Initialize API client with settings from storage
   */
  async initialize() {
    try {
      const settings = await this.getSettings();
      this.baseUrl = `http://localhost:${settings.apiPort || 8080}/api`;
      this.authToken = settings.apiAuthToken || null;
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize TaskNotes API:', error);
      return false;
    }
  }

  /**
   * Get extension settings from Chrome storage
   */
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        apiPort: 8080,
        apiAuthToken: '',
        defaultTags: ['web'],
        defaultPriority: 'Normal'
      }, resolve);
    });
  }

  /**
   * Save extension settings to Chrome storage
   */
  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, resolve);
    });
  }

  /**
   * Make HTTP request to TaskNotes API
   */
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
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('TaskNotes API not accessible. Make sure Obsidian is running with API enabled.');
      }
      throw error;
    }
  }

  /**
   * Test API connection
   */
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

  /**
   * Create a new task
   */
  async createTask(taskData) {
    const settings = await this.getSettings();
    
    // Apply default settings
    const task = {
      tags: settings.defaultTags || ['web'],
      priority: settings.defaultPriority || 'Normal',
      ...taskData
    };

    console.log('Creating task:', task);
    const result = await this.request('/tasks', {
      method: 'POST',
      body: task
    });
    console.log('Task creation result:', result);
    return result;
  }

  /**
   * Get all tasks with optional filters
   */
  async getTasks(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query ? `/tasks?${query}` : '/tasks';
    return this.request(endpoint);
  }

  /**
   * Get task statistics
   */
  async getStats() {
    return this.request('/stats');
  }

  /**
   * Get available filter options
   */
  async getFilterOptions() {
    return this.request('/filter-options');
  }

  /**
   * Update a task
   */
  async updateTask(taskId, updates) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      body: updates
    });
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE'
    });
  }

  /**
   * Start time tracking for a task
   */
  async startTimeTracking(taskId) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/time/start`, {
      method: 'POST'
    });
  }

  /**
   * Stop time tracking for a task
   */
  async stopTimeTracking(taskId) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/time/stop`, {
      method: 'POST'
    });
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaskNotesAPI;
} else {
  window.TaskNotesAPI = TaskNotesAPI;
}