const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const activeWin = require('active-win'); // Updated from get-windows
const express = require('express');
const { BlinkDetector } = require('./services/blink-detector');
const { connectDB } = require('./db/mongodb');
const { app: expressApp } = require('./index');
require('dotenv').config(); // Load environment variables from .env file

let mainWindow;
let tray = null;
let activeWindowInterval;
let blinkDetector;
let server;
let isMonitoring = true;
let isAppQuitting = false;
let lastActiveWindow = null;
let lastActiveWindowTime = Date.now();
let isFocusMode = false;
let notificationWindow = null;
let focusPopupWindow = null;
let lastProcessedNotificationId = null;

async function createWindow() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start Express server
    const PORT = process.env.PORT || 5000;
    server = expressApp.listen(PORT, () => {
      console.log(`Express server running on port ${PORT}`);
    });

    // Get display dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Create the browser window and show it by default
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true, // Changed to true to show the window on startup
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    // Load the app - in development, load from the Vite dev server on port 8080
    const startUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:8080' 
      : `file://${path.join(__dirname, '../build/index.html')}`;
    
    console.log(`Loading application from: ${startUrl}`);
      
    mainWindow.loadURL(startUrl);

    // Open DevTools in development mode
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }

    // Initialize system tray
    createTray();
    
    // Start monitoring active windows
    startActiveWindowMonitoring();
    
    // Initialize blink detection
    initializeBlinkDetection();
    
    // Handle window close event - hide instead of closing
    mainWindow.on('close', (event) => {
      if (!isAppQuitting) {
        event.preventDefault();
        mainWindow.hide();
        showNotification("App Minimized", "Mindful Desktop Companion is still running in the system tray.");
        return false;
      }
      
      return true;
    });
    
    // Add minimize handler to hide to system tray
    mainWindow.on('minimize', (event) => {
      event.preventDefault();
      mainWindow.hide();
      showNotification("App Minimized", "Mindful Desktop Companion is still running in the system tray.");
    });
    
    // Create a hidden notification window that will be used to display notifications on top
    createNotificationWindow();
    
    // Create a hidden focus popup window for rich media popups - using the updated settings
    createFocusPopupWindow();
    
    // Test notification on startup
    setTimeout(() => {
      console.log("Sending test notification");
      showNotification("App Started", "Mindful Desktop Companion is now running.");
    }, 2000);
  } catch (error) {
    console.error("Error during startup:", error);
    app.exit(1);
  }
}

function createNotificationWindow() {
  // Get primary display size for positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  // Create a small always-on-top window for notifications
  notificationWindow = new BrowserWindow({
    width: 420,
    height: 150,
    x: Math.floor((width - 420) / 2),
    y: Math.floor((height - 150) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  // Load a blank HTML
  notificationWindow.loadURL('data:text/html;charset=utf-8,<html><body style="background: transparent;"></body></html>');
  
  // Hide the window when it loses focus (user clicks away)
  notificationWindow.on('blur', () => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.hide();
    }
  });
  
  console.log("Notification window created");
}

function createFocusPopupWindow() {
  // Get primary display size for positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  // Create a system-level always-on-top window for focus popups with exactly the requested settings
  focusPopupWindow = new BrowserWindow({
    width: 500,
    height: 400,
    x: Math.floor((width - 500) / 2),
    y: Math.floor((height - 400) / 2),
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Set additional properties for maximum visibility
  focusPopupWindow.setVisibleOnAllWorkspaces(true);
  focusPopupWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  
  // Load a blank HTML
  focusPopupWindow.loadURL('data:text/html;charset=utf-8,<html><body style="background: transparent;"></body></html>');
  
  // Set up event handlers
  focusPopupWindow.once('ready-to-show', () => {
    console.log("Focus popup window is ready to show");
  });
  
  focusPopupWindow.on('closed', () => {
    console.log("Focus popup window closed");
    focusPopupWindow = null;
  });
  
  console.log("Focus popup window created with system-level overlay settings");
}

function createTray() {
  try {
    // Use a proper icon path that works in production
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    console.log("Loading tray icon from:", iconPath);
    
    // Create native image from file
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
    
    // Create context menu
    updateTrayMenu();
    
    tray.setToolTip('Mindful Desktop Companion');
    
    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
    
    console.log("Tray icon created successfully");
  } catch (error) {
    console.error("Error creating tray icon:", error);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  
  try {
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? 'Hide App' : 'Show App', 
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
          }
        }
      },
      { 
        label: isMonitoring ? 'Pause Monitoring' : 'Resume Monitoring', 
        click: toggleMonitoring 
      },
      { 
        label: isFocusMode ? 'Disable Focus Mode' : 'Enable Focus Mode', 
        click: toggleFocusMode 
      },
      { 
        label: 'Show Test Notification', 
        click: () => showNotification("Test", "This is a test notification") 
      },
      { type: 'separator' },
      { label: 'Quit', click: () => {
        isAppQuitting = true;
        app.quit();
      }}
    ]);
    
    tray.setContextMenu(contextMenu);
  } catch (error) {
    console.error("Error updating tray menu:", error);
  }
}

function startActiveWindowMonitoring() {
  // Clear any existing interval
  if (activeWindowInterval) {
    clearInterval(activeWindowInterval);
  }
  
  activeWindowInterval = setInterval(async () => {
    if (!isMonitoring || isAppQuitting) {
      return;
    }
    
    try {
      const activeWindow = await activeWin();
      const now = Date.now();
      
      if (activeWindow) {
        // Calculate time spent in this window
        let timeInWindow = 0;
        if (lastActiveWindow && lastActiveWindow.owner?.path === activeWindow.owner?.path) {
          timeInWindow = now - lastActiveWindowTime;
        } else {
          lastActiveWindowTime = now;
        }
        
        lastActiveWindow = activeWindow;
        
        // Enhanced window info with better app detection
        const windowInfo = {
          title: activeWindow.title,
          owner: {
            name: activeWindow.owner?.name || 'Unknown',
            path: activeWindow.owner?.path || '',
            bundleId: activeWindow.owner?.bundleId || '',
            processId: activeWindow.owner?.processId || 0
          },
          appName: activeWindow.owner?.name || extractAppFromTitle(activeWindow.title),
          timeActive: timeInWindow,
          timestamp: now
        };
        
        // Send to renderer process with enhanced info
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('active-window-changed', windowInfo);
        }
      }
    } catch (error) {
      console.error('Error getting active window:', error);
    }
  }, 500); // Reduced interval for better responsiveness
}

// Helper function to extract app name from window title
function extractAppFromTitle(title) {
  if (!title) return 'Unknown';
  
  // Common patterns in window titles
  const appNameMatches = title.match(/^(.*?)(?:\s[-–—]\s|\s\|\s|\s:|\s\d|$)/);
  return appNameMatches?.[1]?.trim() || title.trim();
}

function initializeBlinkDetection() {
  try {
    blinkDetector = new BlinkDetector();
    blinkDetector.on('blink', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('blink-detected');
      }
    });
    
    if (isMonitoring) {
      blinkDetector.start();
    }
    
    // Set up automatic eye care reminders (20-20-20 rule)
    setInterval(() => {
      if (isMonitoring) {
        showNotification("Eye Care Reminder", "Remember to blink and look 20ft away for 20 seconds.");
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('eye-care-reminder');
        }
      }
    }, 20 * 60 * 1000); // Every 20 minutes
  } catch (error) {
    console.error("Error initializing blink detection:", error);
  }
}

function toggleMonitoring() {
  isMonitoring = !isMonitoring;
  
  if (!isMonitoring) {
    if (activeWindowInterval) {
      clearInterval(activeWindowInterval);
      activeWindowInterval = null;
    }
    
    if (blinkDetector) {
      blinkDetector.stop();
    }
  } else {
    startActiveWindowMonitoring();
    
    if (blinkDetector) {
      blinkDetector.start();
    }
  }
  
  // Update the tray menu to reflect the new state
  updateTrayMenu();
}

function toggleFocusMode() {
  isFocusMode = !isFocusMode;
  
  // Update the tray menu to reflect the new state
  updateTrayMenu();
  
  // Notify the renderer process about the focus mode change
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus-mode-changed', isFocusMode);
  }
  
  // Show notification
  showNotification(
    isFocusMode ? "Focus Mode Enabled" : "Focus Mode Disabled", 
    isFocusMode ? "You'll only have access to whitelisted apps" : "You now have access to all applications"
  );
}

// Improved function to show focus popup with rich media
function showFocusPopup(title, body, notificationId, mediaType = 'image', mediaContent = '') {
  try {
    console.log(`Showing focus popup: ${title} - ${body}`);
    
    if (notificationId && notificationId === lastProcessedNotificationId) {
      console.log(`Skipping duplicate notification with ID: ${notificationId}`);
      return;
    }
    
    const effectiveNotificationId = notificationId || `focus-popup-${Date.now()}`;
    lastProcessedNotificationId = effectiveNotificationId;
    
    if (!focusPopupWindow || focusPopupWindow.isDestroyed()) {
      createFocusPopupWindow();
    }
    
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    if (focusPopupWindow) {
      focusPopupWindow.setPosition(
        Math.floor((width - 500) / 2),
        Math.floor((height - 400) / 2)
      );
      
      const safeMediaContent = mediaContent || 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6';
      
      let mediaHtml = '';
      if (mediaType === 'image' && safeMediaContent) {
        const imgSrc = safeMediaContent.replace(/"/g, '\\"');
        mediaHtml = `
          <div class="media-container">
            <img src="${imgSrc}" alt="Focus reminder" class="media-content" 
                 onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1461749280684-dccba630e2f6'"/>
          </div>
        `;
      }
      
      const popupContent = `
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              background-color: rgba(0, 0, 0, 0.9);
              border-radius: 12px;
              overflow: hidden;
              color: white;
              display: flex;
              flex-direction: column;
              height: 100vh;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
              animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
              border: 2px solid rgba(255, 149, 0, 0.3);
            }
            .media-container {
              width: 100%;
              height: 220px;
              overflow: hidden;
              position: relative;
              background: linear-gradient(135deg, rgba(255, 149, 0, 0.1), rgba(0, 0, 0, 0.3));
            }
            .media-content {
              width: 100%;
              height: 100%;
              object-fit: cover;
              filter: brightness(0.8) contrast(1.1);
            }
            .content {
              padding: 24px;
              flex: 1;
              background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.95));
            }
            .title {
              font-size: 24px;
              font-weight: 700;
              margin-bottom: 12px;
              color: #FF9500;
              text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            }
            .body {
              font-size: 16px;
              opacity: 0.95;
              line-height: 1.6;
              color: #f0f0f0;
            }
            .button-container {
              display: flex;
              justify-content: flex-end;
              padding: 16px 24px 24px;
              background: rgba(0, 0, 0, 0.95);
            }
            .close-button {
              background: linear-gradient(135deg, #FF9500, #FF7A00);
              border: none;
              color: white;
              padding: 12px 20px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 600;
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px rgba(255, 149, 0, 0.3);
            }
            .close-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(255, 149, 0, 0.4);
            }
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
              }
              to {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
          </style>
        </head>
        <body>
          ${mediaHtml}
          <div class="content">
            <div class="title">${title}</div>
            <div class="body">${body}</div>
          </div>
          <div class="button-container">
            <button class="close-button" onclick="closeNotification()">Dismiss</button>
          </div>
          <script>
            setTimeout(() => {
              closeNotification();
            }, 8000);
            
            function closeNotification() {
              window.close();
            }
            
            document.body.addEventListener('click', (e) => {
              if (!e.target.classList.contains('close-button')) {
                closeNotification();
              }
            });
          </script>
        </body>
        </html>
      `;
      
      focusPopupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(popupContent)}`);
      focusPopupWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      focusPopupWindow.setSkipTaskbar(true);
      focusPopupWindow.setVisibleOnAllWorkspaces(true);
      focusPopupWindow.show();
      focusPopupWindow.moveTop();
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('focus-popup-displayed', {
          notificationId: effectiveNotificationId,
          status: 'displayed'
        });
      }
      
      console.log("Focus popup shown successfully");
    }
  } catch (error) {
    console.error("Error showing focus popup:", error);
    showNotification(title, body, notificationId);
  }
}

// Function to show center-screen notifications
function showNotification(title, body, notificationId = null) {
  try {
    console.log(`Showing notification: ${title} - ${body}`);
    
    // Check if we've already processed this notification ID to prevent duplicates
    if (notificationId && notificationId === lastProcessedNotificationId) {
      console.log(`Skipping duplicate notification with ID: ${notificationId}`);
      return;
    }
    
    // Update the last processed notification ID
    if (notificationId) {
      lastProcessedNotificationId = notificationId;
    }
    
    // Ensure the notification window exists
    if (!notificationWindow || notificationWindow.isDestroyed()) {
      createNotificationWindow();
    }
    
    // Get the primary display dimensions for exact center positioning
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    // Center the notification window
    if (notificationWindow) {
      // Position notification at the top center of the active window's screen
      notificationWindow.setPosition(
        Math.floor((width - 420) / 2),
        Math.floor((height - 150) / 5) // Position more towards the top for better visibility
      );
      
      // Create HTML content for the notification
      const notificationContent = `
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              background-color: rgba(0, 0, 0, 0.85);
              border-radius: 8px;
              overflow: hidden;
              color: white;
              display: flex;
              flex-direction: column;
              height: 100vh;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
              animation: fadeIn 0.3s ease-in;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .content {
              padding: 16px;
              flex: 1;
            }
            .title {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 8px;
              color: #FF9500;
            }
            .body {
              font-size: 14px;
              opacity: 0.9;
            }
            .button-container {
              display: flex;
              justify-content: flex-end;
              padding: 8px 16px 16px;
            }
            .close-button {
              background: rgba(255, 255, 255, 0.2);
              border: none;
              color: white;
              padding: 6px 12px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            }
            .close-button:hover {
              background: rgba(255, 255, 255, 0.3);
            }
            .notification-id {
              display: none;
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
          </style>
        </head>
        <body>
          <div class="content">
            <div class="title">${title}</div>
            <div class="body">${body}</div>
            <div class="notification-id">${notificationId || ''}</div>
          </div>
          <div class="button-container">
            <button class="close-button" onclick="closeNotification()">Dismiss</button>
          </div>
          <script>
            // Auto-close after 8 seconds
            const autoCloseTimeout = setTimeout(() => {
              closeNotification();
            }, 8000);
            
            function closeNotification() {
              clearTimeout(autoCloseTimeout);
              // Send notification ID back to main process when dismissed
              const notificationId = document.querySelector('.notification-id').textContent;
              if (notificationId) {
                window.electron.send('notification-dismissed', notificationId);
              }
              window.close();
            }
            
            // Allow clicking anywhere to close
            document.body.addEventListener('click', (e) => {
              if (!e.target.classList.contains('close-button')) {
                closeNotification();
              }
            });
          </script>
        </body>
        </html>
      `;
      
      // Load the notification content
      notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(notificationContent)}`);
      
      // Show the notification window
      notificationWindow.show();
      notificationWindow.focus();
      
      // Also send as a native notification (as fallback)
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: title,
          body: body,
          icon: path.join(__dirname, 'assets', 'icon.png'),
          silent: false,
        });
        
        notification.show();
        
        // Handle notification click - show main app window
        notification.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        });
        
        // Handle notification close
        notification.on('close', () => {
          if (notificationId) {
            // Notify renderer process that notification was dismissed
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('notification-dismissed', notificationId);
            }
          }
        });
      }
      
      console.log("Notification shown on top of all windows");
    } else {
      console.log("Notification window not available, falling back to native notification");
      
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: title,
          body: body
        });
        
        notification.show();
      }
    }
  } catch (error) {
    console.error("Error showing notification:", error);
    
    // Fallback to basic notification if error occurs
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: title,
        body: body
      });
      
      notification.show();
    }
  }
}

// Handle IPC events from the renderer
ipcMain.on('show-tray', () => {
  if (!tray) createTray();
});

ipcMain.on('hide-tray', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

ipcMain.on('set-tray-tooltip', (event, tooltip) => {
  if (tray) tray.setToolTip(tooltip);
});

// Add a new handler for setting tray icon
ipcMain.on('set-tray-icon', (event, iconType) => {
  if (!tray) return;
  
  let iconName = 'icon.png';
  if (iconType === 'active') iconName = 'icon-active.png';
  if (iconType === 'rest') iconName = 'icon-rest.png';
  
  const iconPath = path.join(__dirname, 'assets', iconName);
  try {
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray.setImage(trayIcon.resize({ width: 16, height: 16 }));
  } catch (error) {
    console.error(`Error setting tray icon ${iconType}:`, error);
  }
});

// Add handler for native notifications
ipcMain.on('show-native-notification', (event, {title, body, notificationId}) => {
  console.log(`IPC notification received: ${title} - ${body}`);
  showNotification(title, body, notificationId);
});

// Add handler for dismissing notifications
ipcMain.on('notification-dismissed', (event, notificationId) => {
  console.log(`Notification dismissed: ${notificationId}`);
  
  // Forward the dismissal to the renderer process
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notification-dismissed', notificationId);
  }
  
  // Update last processed notification ID to avoid reshowing
  lastProcessedNotificationId = notificationId;
});

// Add handler for focus mode toggle from renderer
ipcMain.on('toggle-focus-mode', (event, enableFocusMode) => {
  isFocusMode = enableFocusMode;
  updateTrayMenu();
  console.log(`Focus mode ${isFocusMode ? 'enabled' : 'disabled'} from renderer`);
});

// Add handler for focus mode popups (rich media)
ipcMain.on('show-focus-popup', (event, {title, body, notificationId, mediaType = 'image', mediaContent = ''}) => {
  console.log(`IPC focus popup received: ${title} - ${body}`);
  console.log(`Media details - Type: ${mediaType}, Content: ${mediaContent}`);
  showFocusPopup(title, body, notificationId, mediaType, mediaContent);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.isQuitting = true;
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
  app.isQuitting = true;
  if (server) {
    server.close();
  }
  
  // Clear interval to prevent further errors
  if (activeWindowInterval) {
    clearInterval(activeWindowInterval);
    activeWindowInterval = null;
  }
  
  // Clean up the notification window
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.destroy();
  }
  
  // Clean up the focus popup window
  if (focusPopupWindow && !focusPopupWindow.isDestroyed()) {
    focusPopupWindow.destroy();
  }
});

// Ensure the app doesn't quit when all windows are closed
app.on('window-all-closed', (event) => {
  if (process.platform !== 'darwin') {
    // Don't quit the app
    event.preventDefault();
  }
});

// Add IPC handlers
ipcMain.on('stabilize-window', () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Prevent window glitching by ensuring stable state
      const bounds = mainWindow.getBounds();
      mainWindow.setBounds(bounds);
      mainWindow.setResizable(true);
      
      // Brief delay to ensure stability
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.focus();
        }
      }, 50);
    }
  } catch (error) {
    console.error('Error stabilizing window:', error);
  }
});

// Enhanced focus popup with better error handling
ipcMain.on('show-focus-popup', (event, data) => {
  try {
    const { title, body, notificationId, mediaType = 'image', mediaContent = '' } = data;
    showFocusPopup(title, body, notificationId, mediaType, mediaContent);
  } catch (error) {
    console.error('Error handling show-focus-popup:', error);
  }
});
