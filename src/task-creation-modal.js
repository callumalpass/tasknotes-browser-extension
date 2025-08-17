/**
 * TaskCreationModal - Reusable task creation component
 * Can be embedded in content scripts to show a popup for task creation
 */
class TaskCreationModal {
  constructor(options = {}) {
    this.options = {
      prefillData: {},
      onComplete: () => {},
      onCancel: () => {},
      ...options
    };
    
    this.modal = null;
    this.settings = {};
    this.isVisible = false;
    this.initialized = false;
    
    // Initialize asynchronously but track completion
    this.initPromise = this.init();
  }

  /**
   * Initialize the modal component
   */
  async init() {
    await this.loadSettings();
    this.createModalHTML();
    this.setupEventListeners();
    this.loadFilterOptions();
    this.initialized = true;
  }

  /**
   * Load extension settings
   */
  async loadSettings() {
    this.settings = await new Promise((resolve) => {
      chrome.storage.sync.get({
        apiPort: 8080,
        apiAuthToken: '',
        defaultTags: 'web',
        defaultStatus: 'open',
        defaultPriority: 'normal'
      }, resolve);
    });
  }

  /**
   * Create the modal HTML structure
   */
  createModalHTML() {
    const modalHTML = `
      <div id="tasknotes-modal-overlay" class="tasknotes-modal-overlay">
        <div class="tasknotes-modal-container">
          <div class="tasknotes-modal-header">
            <img src="${chrome.runtime.getURL('icons/tasknotes-icon-32.svg')}" alt="TaskNotes" class="tasknotes-logo">
            <h2>Create Task</h2>
            <button class="tasknotes-close-btn" type="button">×</button>
          </div>
          
          <div class="tasknotes-modal-content">
            <form id="tasknotes-task-form">
              <div class="tasknotes-form-group">
                <label for="tasknotes-task-title">Title:</label>
                <input type="text" id="tasknotes-task-title" placeholder="Task title..." required>
              </div>
              
              <!-- Action Bar -->
              <div class="tasknotes-action-bar">
                <div class="tasknotes-action-icon" data-type="due-date" title="Set due date">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
                <div class="tasknotes-action-icon" data-type="scheduled-date" title="Set scheduled date">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                    <circle cx="12" cy="16" r="2"></circle>
                    <path d="M12 14v-2"></path>
                  </svg>
                </div>
                <div class="tasknotes-action-icon" data-type="status" title="Set status">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </div>
                <div class="tasknotes-action-icon" data-type="priority" title="Set priority">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                </div>
              </div>
              
              <!-- Hidden date inputs -->
              <div class="tasknotes-date-inputs" style="display: none;">
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-due">Due Date:</label>
                  <input type="datetime-local" id="tasknotes-task-due">
                </div>
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-scheduled">Scheduled Date:</label>
                  <input type="datetime-local" id="tasknotes-task-scheduled">
                </div>
              </div>
              
              <div class="tasknotes-form-row">
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-status">Status:</label>
                  <select id="tasknotes-task-status">
                    <option value="todo">To Do</option>
                    <option value="open" selected>Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-priority">Priority:</label>
                  <select id="tasknotes-task-priority">
                    <option value="low">Low</option>
                    <option value="normal" selected>Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              
              <div class="tasknotes-form-row">
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-contexts">Contexts:</label>
                  <input type="text" id="tasknotes-task-contexts" placeholder="@home, @work">
                </div>
                
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-projects">Projects:</label>
                  <input type="text" id="tasknotes-task-projects" placeholder="Project names">
                </div>
              </div>
              
              <div class="tasknotes-form-row">
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-tags">Tags:</label>
                  <input type="text" id="tasknotes-task-tags" placeholder="web, urgent">
                </div>
                
                <div class="tasknotes-form-group">
                  <label for="tasknotes-task-time-estimate">Time Estimate (min):</label>
                  <input type="number" id="tasknotes-task-time-estimate" min="0" placeholder="30">
                </div>
              </div>
              
              <div class="tasknotes-form-group">
                <label for="tasknotes-task-details">Details:</label>
                <textarea id="tasknotes-task-details" placeholder="Additional details..." rows="4"></textarea>
              </div>
              
              <div class="tasknotes-modal-buttons">
                <button type="button" class="tasknotes-btn tasknotes-btn-secondary" id="tasknotes-cancel-btn">
                  Cancel
                </button>
                <button type="submit" class="tasknotes-btn tasknotes-btn-primary" id="tasknotes-create-btn">
                  Create Task
                </button>
              </div>
            </form>
          </div>
          
          <div id="tasknotes-messages" class="tasknotes-messages"></div>
        </div>
      </div>
    `;

    // Create modal element
    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHTML;
    this.modal = modalElement.firstElementChild;
    
    // Add styles
    this.injectStyles();
    
    // Add to DOM but keep hidden
    document.body.appendChild(this.modal);
  }

  /**
   * Inject necessary CSS styles
   */
  injectStyles() {
    if (document.getElementById('tasknotes-modal-styles')) return;
    
    const styles = `
      <style id="tasknotes-modal-styles">
        .tasknotes-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          display: none;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
        }
        
        .tasknotes-modal-overlay.visible {
          display: flex;
        }
        
        .tasknotes-modal-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          animation: modalSlideIn 0.3s ease;
        }
        
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .tasknotes-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          border-bottom: 1px solid #e3e5e8;
          background: #f8f9fa;
          border-radius: 12px 12px 0 0;
        }
        
        .tasknotes-logo {
          width: 24px;
          height: 24px;
        }
        
        .tasknotes-modal-header h2 {
          flex: 1;
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }
        
        .tasknotes-close-btn {
          background: none;
          border: none;
          font-size: 24px;
          color: #6b7280;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        
        .tasknotes-close-btn:hover {
          background: #e5e7eb;
          color: #374151;
        }
        
        .tasknotes-modal-content {
          padding: 20px;
        }
        
        .tasknotes-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
        }
        
        .tasknotes-form-row {
          display: flex;
          gap: 16px;
        }
        
        .tasknotes-form-row .tasknotes-form-group {
          flex: 1;
        }
        
        .tasknotes-form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .tasknotes-form-group input,
        .tasknotes-form-group select,
        .tasknotes-form-group textarea {
          padding: 10px 12px;
          border: 1px solid #e3e5e8;
          border-radius: 6px;
          font-size: 14px;
          background: #f8f9fa;
          color: #1f2937;
          transition: all 0.2s ease;
        }
        
        .tasknotes-form-group input:focus,
        .tasknotes-form-group select:focus,
        .tasknotes-form-group textarea:focus {
          outline: none;
          border-color: #2563eb;
          background: white;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }
        
        .tasknotes-form-group textarea {
          resize: vertical;
          min-height: 80px;
          font-family: inherit;
        }
        
        .tasknotes-action-bar {
          display: flex;
          gap: 8px;
          padding: 8px;
          margin: 16px 0;
          background: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #e3e5e8;
        }
        
        .tasknotes-action-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #6b7280;
          background: transparent;
        }
        
        .tasknotes-action-icon:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #1f2937;
        }
        
        .tasknotes-action-icon.has-value {
          color: #2563eb;
          background: rgba(37, 99, 235, 0.1);
        }
        
        .tasknotes-date-inputs {
          padding: 16px;
          background: #f8f9fa;
          border-radius: 6px;
          margin-bottom: 16px;
        }
        
        .tasknotes-date-inputs.visible {
          display: block !important;
        }
        
        .tasknotes-modal-buttons {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #e3e5e8;
        }
        
        .tasknotes-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        
        .tasknotes-btn:hover {
          transform: translateY(-1px);
        }
        
        .tasknotes-btn:active {
          transform: translateY(0);
        }
        
        .tasknotes-btn-primary {
          background: #2563eb;
          color: white;
        }
        
        .tasknotes-btn-primary:hover {
          background: #1d4ed8;
        }
        
        .tasknotes-btn-secondary {
          background: transparent;
          color: #374151;
          border: 1px solid #e3e5e8;
        }
        
        .tasknotes-btn-secondary:hover {
          background: #f3f4f6;
        }
        
        .tasknotes-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        
        .tasknotes-messages {
          margin: 0 20px 20px;
        }
        
        .tasknotes-message {
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 14px;
          margin-bottom: 8px;
          animation: slideIn 0.3s ease;
        }
        
        .tasknotes-message.success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        
        .tasknotes-message.error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .tasknotes-modal-container {
            background: #1e1e1e;
            color: #dcddde;
          }
          
          .tasknotes-modal-header {
            background: #2d2d2d;
            border-bottom-color: #3e3e3e;
          }
          
          .tasknotes-modal-header h2 {
            color: #dcddde;
          }
          
          .tasknotes-close-btn {
            color: #a3a6aa;
          }
          
          .tasknotes-close-btn:hover {
            background: #3e3e3e;
            color: #dcddde;
          }
          
          .tasknotes-form-group input,
          .tasknotes-form-group select,
          .tasknotes-form-group textarea {
            background: #2d2d2d;
            border-color: #3e3e3e;
            color: #dcddde;
          }
          
          .tasknotes-form-group input:focus,
          .tasknotes-form-group select:focus,
          .tasknotes-form-group textarea:focus {
            background: #252525;
            border-color: #5865f2;
          }
          
          .tasknotes-action-bar {
            background: #2d2d2d;
            border-color: #3e3e3e;
          }
          
          .tasknotes-date-inputs {
            background: #2d2d2d;
          }
          
          .tasknotes-modal-buttons {
            border-top-color: #3e3e3e;
          }
          
          .tasknotes-btn-secondary {
            color: #dcddde;
            border-color: #3e3e3e;
          }
          
          .tasknotes-btn-secondary:hover {
            background: #3e3e3e;
          }
        }
      </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Form submission
    this.modal.querySelector('#tasknotes-task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createTask();
    });

    // Close button
    this.modal.querySelector('.tasknotes-close-btn').addEventListener('click', () => {
      this.hide();
    });

    // Cancel button
    this.modal.querySelector('#tasknotes-cancel-btn').addEventListener('click', () => {
      this.hide();
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    // Action bar icons
    this.modal.querySelectorAll('.tasknotes-action-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        const type = icon.dataset.type;
        this.handleActionIconClick(type, icon);
      });
    });

    // Update action icons when form values change
    ['tasknotes-task-due', 'tasknotes-task-scheduled', 'tasknotes-task-status', 'tasknotes-task-priority'].forEach(id => {
      const element = this.modal.querySelector(`#${id}`);
      if (element) {
        element.addEventListener('change', () => {
          this.updateActionIconStates();
        });
      }
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
        this.focusField('tasknotes-task-status');
        break;
      case 'priority':
        this.focusField('tasknotes-task-priority');
        break;
    }
  }

  /**
   * Toggle date input visibility
   */
  toggleDateInput(type, iconElement) {
    const dateInputsSection = this.modal.querySelector('.tasknotes-date-inputs');
    const isVisible = dateInputsSection.classList.contains('visible');
    
    if (!isVisible) {
      dateInputsSection.style.display = 'block';
      dateInputsSection.classList.add('visible');
    }
    
    // Focus the appropriate input
    const inputId = type === 'due' ? 'tasknotes-task-due' : 'tasknotes-task-scheduled';
    this.modal.querySelector(`#${inputId}`).focus();
    
    // Update icon state
    this.updateActionIconStates();
  }

  /**
   * Focus a specific field
   */
  focusField(fieldId) {
    const field = this.modal.querySelector(`#${fieldId}`);
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
    const dueDate = this.modal.querySelector('#tasknotes-task-due').value;
    const scheduledDate = this.modal.querySelector('#tasknotes-task-scheduled').value;
    const status = this.modal.querySelector('#tasknotes-task-status').value;
    const priority = this.modal.querySelector('#tasknotes-task-priority').value;
    
    // Update due date icon
    const dueDateIcon = this.modal.querySelector('[data-type="due-date"]');
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
    const scheduledIcon = this.modal.querySelector('[data-type="scheduled-date"]');
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
    const statusIcon = this.modal.querySelector('[data-type="status"]');
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
    const priorityIcon = this.modal.querySelector('[data-type="priority"]');
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
   * Load filter options from API
   */
  async loadFilterOptions() {
    try {
      const response = await this.sendMessage({
        action: 'getFilterOptions'
      });

      if (response.success && response.data && response.data.success) {
        const filterOptions = response.data.data;
        this.updateStatusDropdown(filterOptions.statuses || []);
        this.updatePriorityDropdown(filterOptions.priorities || []);
        this.setupAutoComplete('tasknotes-task-contexts', filterOptions.contexts || []);
        this.setupAutoComplete('tasknotes-task-projects', filterOptions.projects || []);
        this.setupAutoComplete('tasknotes-task-tags', filterOptions.tags || []);
      }
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  }

  /**
   * Update status dropdown with custom statuses
   */
  updateStatusDropdown(statuses) {
    const statusSelect = this.modal.querySelector('#tasknotes-task-status');
    statusSelect.innerHTML = '';
    
    if (statuses && statuses.length > 0) {
      const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
      sortedStatuses.forEach(status => {
        if (status.value === 'none') return;
        const option = document.createElement('option');
        option.value = status.value;
        option.textContent = status.label;
        statusSelect.appendChild(option);
      });
    } else {
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
    
    statusSelect.value = this.settings.defaultStatus || 'open';
  }

  /**
   * Update priority dropdown with custom priorities
   */
  updatePriorityDropdown(priorities) {
    const prioritySelect = this.modal.querySelector('#tasknotes-task-priority');
    prioritySelect.innerHTML = '';
    
    if (priorities && priorities.length > 0) {
      const sortedPriorities = [...priorities].sort((a, b) => a.weight - b.weight);
      sortedPriorities.forEach(priority => {
        if (priority.value === 'none') return;
        const option = document.createElement('option');
        option.value = priority.value;
        option.textContent = priority.label;
        prioritySelect.appendChild(option);
      });
    } else {
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
    
    prioritySelect.value = this.settings.defaultPriority || 'normal';
  }

  /**
   * Setup autocomplete for input fields
   */
  setupAutoComplete(inputId, suggestions) {
    const input = this.modal.querySelector(`#${inputId}`);
    if (!input || !suggestions || suggestions.length === 0) return;
    
    const validSuggestions = suggestions.filter(s => s && typeof s === 'string');
    if (validSuggestions.length === 0) return;
    
    const datalistId = `${inputId}-list`;
    let datalist = document.getElementById(datalistId);
    
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      input.parentElement.appendChild(datalist);
      input.setAttribute('list', datalistId);
    }
    
    datalist.innerHTML = '';
    validSuggestions.forEach(suggestion => {
      const option = document.createElement('option');
      option.value = suggestion;
      datalist.appendChild(option);
    });
  }

  /**
   * Show the modal with prefilled data
   */
  async show() {
    // Wait for initialization to complete
    await this.initPromise;
    
    this.prefillForm();
    this.modal.classList.add('visible');
    this.isVisible = true;
    
    // Focus title field
    setTimeout(() => {
      this.modal.querySelector('#tasknotes-task-title').focus();
    }, 100);
  }

  /**
   * Hide the modal
   */
  hide() {
    this.modal.classList.remove('visible');
    this.isVisible = false;
    this.options.onCancel();
  }

  /**
   * Prefill form with provided data
   */
  prefillForm() {
    const data = this.options.prefillData;
    
    if (data.title) {
      this.modal.querySelector('#tasknotes-task-title').value = data.title;
    }
    
    if (data.details) {
      this.modal.querySelector('#tasknotes-task-details').value = data.details;
    }
    
    if (data.tags) {
      const tagsValue = Array.isArray(data.tags) ? data.tags.join(', ') : data.tags;
      this.modal.querySelector('#tasknotes-task-tags').value = tagsValue;
    }
    
    if (data.contexts) {
      const contextsValue = Array.isArray(data.contexts) ? data.contexts.join(', ') : data.contexts;
      this.modal.querySelector('#tasknotes-task-contexts').value = contextsValue;
    }
    
    if (data.projects) {
      const projectsValue = Array.isArray(data.projects) ? data.projects.join(', ') : data.projects;
      this.modal.querySelector('#tasknotes-task-projects').value = projectsValue;
    }
    
    if (data.priority) {
      this.modal.querySelector('#tasknotes-task-priority').value = data.priority;
    }
    
    if (data.status) {
      this.modal.querySelector('#tasknotes-task-status').value = data.status;
    }
    
    if (data.due) {
      this.modal.querySelector('#tasknotes-task-due').value = data.due;
    }
    
    if (data.scheduled) {
      this.modal.querySelector('#tasknotes-task-scheduled').value = data.scheduled;
    }
    
    if (data.timeEstimate) {
      this.modal.querySelector('#tasknotes-task-time-estimate').value = data.timeEstimate;
    }
    
    this.updateActionIconStates();
  }

  /**
   * Create task from form data
   */
  async createTask() {
    const createBtn = this.modal.querySelector('#tasknotes-create-btn');
    const originalText = createBtn.textContent;
    
    try {
      createBtn.textContent = 'Creating...';
      createBtn.disabled = true;

      // Get form data
      const title = this.modal.querySelector('#tasknotes-task-title').value.trim();
      const status = this.modal.querySelector('#tasknotes-task-status').value;
      const priority = this.modal.querySelector('#tasknotes-task-priority').value;
      const contexts = this.modal.querySelector('#tasknotes-task-contexts').value
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
      const projects = this.modal.querySelector('#tasknotes-task-projects').value
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      const tags = this.modal.querySelector('#tasknotes-task-tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      const details = this.modal.querySelector('#tasknotes-task-details').value.trim();
      const dueDate = this.modal.querySelector('#tasknotes-task-due').value;
      const scheduledDate = this.modal.querySelector('#tasknotes-task-scheduled').value;
      const timeEstimate = parseInt(this.modal.querySelector('#tasknotes-task-time-estimate').value) || undefined;

      if (!title) {
        throw new Error('Title is required');
      }

      // Prepare task data
      const taskData = {
        title,
        status,
        priority,
        contexts: contexts.length > 0 ? contexts : [],
        projects: projects.length > 0 ? projects : [],
        tags: tags.length > 0 ? tags : ['web'],
        details,
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
        this.options.onComplete(taskData);
        
        // Close modal after short delay
        setTimeout(() => {
          this.hide();
        }, 1500);
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
    const messagesContainer = this.modal.querySelector('#tasknotes-messages');
    
    // Remove existing messages
    messagesContainer.innerHTML = '';
    
    // Create new message
    const message = document.createElement('div');
    message.className = `tasknotes-message ${type}`;
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

  /**
   * Destroy the modal and clean up
   */
  destroy() {
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
    
    const styles = document.getElementById('tasknotes-modal-styles');
    if (styles && styles.parentNode) {
      styles.parentNode.removeChild(styles);
    }
  }
}

// Make TaskCreationModal globally available
window.TaskCreationModal = TaskCreationModal;

// Export for use in content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaskCreationModal;
}