
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    // List of allowed channels to send data to main process
    const validSendChannels = [
      'show-tray', 
      'hide-tray', 
      'set-tray-tooltip', 
      'set-tray-icon',
      'show-native-notification',
      'toggle-focus-mode',
      'save-timer-settings',
      'get-active-window',
      'notification-dismissed', // Added channel to track dismissed notifications
      'show-focus-popup' // Added for rich media focus popups
    ];
    
    if (validSendChannels.includes(channel)) {
      console.log(`Sending IPC message: ${channel}`, data);
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`Attempted to send to unauthorized channel: ${channel}`);
    }
  },
  receive: (channel, func) => {
    // List of allowed channels to receive data from main process
    const validReceiveChannels = [
      'active-window-changed', 
      'blink-detected',
      'eye-care-reminder',
      'focus-mode-changed',
      'timer-settings-saved',
      'notification-dismissed',
      'show-focus-popup', // Add this to allowed channels
      'focus-popup-displayed' // New event to confirm popup was displayed
    ];
    
    if (validReceiveChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender` 
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return a function to remove the listener to avoid memory leaks
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      console.warn(`Attempted to receive from unauthorized channel: ${channel}`);
    }
  }
});

// Listen for active-window-changed from main and dispatch a custom event for the renderer
ipcRenderer.on('active-window-changed', (event, windowInfo) => {
  try {
    // Pass the complete window info object to the renderer
    window.dispatchEvent(new CustomEvent('active-window-changed', { 
      detail: windowInfo 
    }));
    
    console.log('Dispatched active-window-changed event with info:', windowInfo);
  } catch (error) {
    console.error('Error dispatching active-window-changed event:', error);
  }
});

// Listen for notification-dismissed from main and dispatch a custom event for the renderer
ipcRenderer.on('notification-dismissed', (event, notificationId) => {
  try {
    // Dispatch a custom event that our React components can listen to
    window.dispatchEvent(new CustomEvent('notification-dismissed', { 
      detail: notificationId 
    }));
    
    console.log('Dispatched notification-dismissed event with ID:', notificationId);
  } catch (error) {
    console.error('Error dispatching notification-dismissed event:', error);
  }
});

// Create a specific listener for focus mode popup events
ipcRenderer.on('show-focus-popup', (event, data) => {
  try {
    // Dispatch a custom event for this specific functionality
    window.dispatchEvent(new CustomEvent('show-focus-popup', { 
      detail: data 
    }));
    
    console.log('Dispatched show-focus-popup event:', data);
  } catch (error) {
    console.error('Error dispatching show-focus-popup event:', error);
  }
});

// Add new event listener for focus-popup-displayed confirmation
ipcRenderer.on('focus-popup-displayed', (event, data) => {
  try {
    window.dispatchEvent(new CustomEvent('focus-popup-displayed', { 
      detail: data 
    }));
    
    console.log('Focus popup display confirmed:', data);
  } catch (error) {
    console.error('Error dispatching focus-popup-displayed event:', error);
  }
});

console.log('Preload script loaded successfully');
