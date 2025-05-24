
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import SystemTrayService from '@/services/SystemTrayService';
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { FocusModeAlert } from '@/components/focus/FocusModeAlert';

interface FocusModeContextType {
  isFocusMode: boolean;
  toggleFocusMode: () => void;
  whitelist: string[];
  addToWhitelist: (app: string) => void;
  removeFromWhitelist: (app: string) => void;
  dimInsteadOfBlock: boolean;
  toggleDimOption: () => void;
  currentActiveApp: string | null;
  isCurrentAppWhitelisted: boolean;
}

const FocusModeContext = createContext<FocusModeContextType | undefined>(undefined);

export const useFocusMode = () => {
  const context = useContext(FocusModeContext);
  if (context === undefined) {
    throw new Error('useFocusMode must be used within a FocusModeProvider');
  }
  return context;
};

export const FocusModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [dimInsteadOfBlock, setDimInsteadOfBlock] = useState(true);
  const [lastActiveWindow, setLastActiveWindow] = useState<string | null>(null);
  const [previousActiveWindow, setPreviousActiveWindow] = useState<string | null>(null);
  const [lastNotificationDismissed, setLastNotificationDismissed] = useState<string | null>(null);
  const [showingAlert, setShowingAlert] = useState(false);
  const [currentAlertApp, setCurrentAlertApp] = useState<string | null>(null);
  const { toast: centerToast } = useToast();
  
  // Add tracking variables for real-time monitoring
  const [checkInterval, setCheckInterval] = useState<NodeJS.Timeout | null>(null);
  const [notificationShown, setNotificationShown] = useState<Record<string, boolean>>({});
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [wasInWhitelistedApp, setWasInWhitelistedApp] = useState(false);
  
  // Track when we switched from whitelisted app to non-whitelisted
  const [lastNotifiedApp, setLastNotifiedApp] = useState<string | null>(null);
  
  // New state for the Live Whitelist Match Preview feature
  const [currentActiveApp, setCurrentActiveApp] = useState<string | null>(null);
  const [isCurrentAppWhitelisted, setIsCurrentAppWhitelisted] = useState(false);
  
  // Enhanced window info from active-win
  const [activeWindowInfo, setActiveWindowInfo] = useState<any>(null);
  
  // User identifier for data separation
  const [userId, setUserId] = useState<string>(() => {
    const storedId = localStorage.getItem('focusModeUserId');
    if (storedId) return storedId;
    
    // Create new unique ID if none exists
    const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('focusModeUserId', newId);
    return newId;
  });
  
  // Load custom image from localStorage on initial mount
  useEffect(() => {
    // Load image based on user ID
    const savedImage = localStorage.getItem(`focusModeCustomImage-${userId}`);
    if (savedImage) {
      setCustomImage(savedImage);
    }
  }, [userId]);
  
  // Load saved whitelist from localStorage on initial mount
  useEffect(() => {
    const savedWhitelist = localStorage.getItem(`focusModeWhitelist-${userId}`);
    if (savedWhitelist) {
      try {
        setWhitelist(JSON.parse(savedWhitelist));
      } catch (e) {
        console.error("Failed to parse whitelist:", e);
        setWhitelist([]);
      }
    }
    
    const savedDimOption = localStorage.getItem(`focusModeDimOption-${userId}`);
    if (savedDimOption) {
      try {
        setDimInsteadOfBlock(JSON.parse(savedDimOption) === true);
      } catch (e) {
        console.error("Failed to parse dim option:", e);
      }
    }
    
    const savedFocusMode = localStorage.getItem(`focusModeEnabled-${userId}`);
    if (savedFocusMode === 'true') {
      setIsFocusMode(true);
    }
    
    // Register for active window change events using custom event listener
    const handleActiveWindowChanged = (event: CustomEvent<any>) => {
      const windowInfo = event.detail;
      
      // Extract the complete window info
      const newWindow = typeof windowInfo === 'string' ? windowInfo : windowInfo.title;
      
      // Store the complete window info
      setActiveWindowInfo(windowInfo);
      
      // Extract app name from window info for better matching
      let appName;
      if (typeof windowInfo === 'object') {
        // Get the most reliable identifier for the app
        appName = windowInfo.owner || windowInfo.appName || extractAppName(windowInfo.title);
        setCurrentActiveApp(appName);
      } else {
        appName = extractAppName(windowInfo);
        setCurrentActiveApp(appName);
      }
      
      console.log("Window changed to:", newWindow);
      console.log("App name detected:", appName);
      console.log("Complete window info:", windowInfo);
      
      // Update previous window info and current window info
      setPreviousActiveWindow(lastActiveWindow);
      setLastActiveWindow(newWindow);
      
      // Check if this app is whitelisted and update the state
      const isWhitelisted = isAppInWhitelist(appName, whitelist);
      setIsCurrentAppWhitelisted(isWhitelisted);
      
      console.log("Is whitelisted:", isWhitelisted);
    };
    
    // Track dismissed notifications
    const handleNotificationDismissed = (event: CustomEvent<string>) => {
      console.log("Notification dismissed:", event.detail);
      setLastNotificationDismissed(event.detail);
      
      // Only clear alert if it matches the one being dismissed
      if (currentAlertApp && event.detail.includes(currentAlertApp)) {
        setShowingAlert(false);
      }
    };
    
    window.addEventListener('active-window-changed', handleActiveWindowChanged as EventListener);
    window.addEventListener('notification-dismissed', handleNotificationDismissed as EventListener);
    
    // Request the current active window
    if (window.electron) {
      window.electron.send('get-active-window');
    }
    
    return () => {
      window.removeEventListener('active-window-changed', handleActiveWindowChanged as EventListener);
      window.removeEventListener('notification-dismissed', handleNotificationDismissed as EventListener);
      
      // Clear interval when unmounting
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [lastActiveWindow, currentAlertApp, checkInterval, userId, whitelist]);
  
  // Save whitelist whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(`focusModeWhitelist-${userId}`, JSON.stringify(whitelist));
    } catch (e) {
      console.error("Failed to save whitelist:", e);
    }
  }, [whitelist, userId]);
  
  // Save dim option whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(`focusModeDimOption-${userId}`, JSON.stringify(dimInsteadOfBlock));
    } catch (e) {
      console.error("Failed to save dim option:", e);
    }
  }, [dimInsteadOfBlock, userId]);
  
  // Save focus mode state
  useEffect(() => {
    try {
      localStorage.setItem(`focusModeEnabled-${userId}`, isFocusMode ? 'true' : 'false');
    } catch (e) {
      console.error("Failed to save focus mode state:", e);
    }
  }, [isFocusMode, userId]);
  
  // Start or stop real-time active window monitoring based on focus mode state
  useEffect(() => {
    // Clear any existing interval
    if (checkInterval) {
      clearInterval(checkInterval);
      setCheckInterval(null);
    }
    
    // Reset tracking state when focus mode changes
    setNotificationShown({});
    setWasInWhitelistedApp(false);
    setLastNotifiedApp(null);
    
    // Only start real-time monitoring if focus mode is active
    if (isFocusMode) {
      console.log("Starting real-time active window monitoring");
      
      // Check every 1.5 seconds - balanced between responsiveness and performance
      const interval = setInterval(() => {
        // Request current active window from electron main process
        if (window.electron) {
          window.electron.send('get-active-window');
        }
        
        // Check current window against whitelist if we have a lastActiveWindow value
        if (lastActiveWindow) {
          checkActiveWindowAgainstWhitelist(lastActiveWindow);
        }
      }, 1500);
      
      setCheckInterval(interval);
      
      // Initial check right away when focus mode is enabled
      if (lastActiveWindow) {
        checkActiveWindowAgainstWhitelist(lastActiveWindow);
      }
    } else {
      // Clear any alerts when focus mode is disabled
      setShowingAlert(false);
    }
    
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [isFocusMode]);
  
  // Effect to track app switches between whitelisted and non-whitelisted apps
  useEffect(() => {
    if (!isFocusMode || !lastActiveWindow) return;
    
    // Get app name from active window info if available, otherwise extract from title
    let currentAppName;
    if (activeWindowInfo && typeof activeWindowInfo === 'object') {
      currentAppName = activeWindowInfo.owner?.name || 
                       activeWindowInfo.appName || 
                       extractAppName(activeWindowInfo.title);
    } else {
      currentAppName = extractAppName(lastActiveWindow);
    }
    
    const isCurrentAppWhitelisted = isAppInWhitelist(currentAppName, whitelist);
    
    console.log(`App switched to: ${currentAppName}, Whitelisted: ${isCurrentAppWhitelisted}, Was in whitelisted: ${wasInWhitelistedApp}`);
    
    // If switching from whitelisted to non-whitelisted
    if (wasInWhitelistedApp && !isCurrentAppWhitelisted && currentAppName) {
      console.log(`Switching FROM whitelisted TO non-whitelisted app: ${currentAppName}`);
      // Always show notification when switching from whitelisted to non-whitelisted
      handleNonWhitelistedApp(currentAppName);
    }
    
    // Update tracking state for next comparison
    setWasInWhitelistedApp(isCurrentAppWhitelisted);
    
  }, [lastActiveWindow, isFocusMode, whitelist, activeWindowInfo]);
  
  // Function to check if active window is whitelisted and handle notifications
  const checkActiveWindowAgainstWhitelist = useCallback((windowTitle: string) => {
    if (!isFocusMode) return;
    
    // Get app name from active window info if available, otherwise extract from title
    let currentAppName;
    if (activeWindowInfo && typeof activeWindowInfo === 'object') {
      currentAppName = activeWindowInfo.owner?.name || 
                       activeWindowInfo.appName || 
                       extractAppName(activeWindowInfo.title);
    } else {
      currentAppName = extractAppName(windowTitle);
    }
    
    // Check if the current app is in the whitelist using improved matching
    const isCurrentAppWhitelisted = isAppInWhitelist(currentAppName, whitelist);
    
    console.log("Focus check:", currentAppName, "Whitelisted:", isCurrentAppWhitelisted);
    
    // Update the state for the Live Whitelist Match Preview feature
    setCurrentActiveApp(currentAppName);
    setIsCurrentAppWhitelisted(isCurrentAppWhitelisted);
    
    // If not whitelisted, show notification (with additional conditions)
    if (!isCurrentAppWhitelisted && currentAppName) {
      // Check if we need to show a notification (based on app switching pattern)
      const needToShowNotification = wasInWhitelistedApp || 
                                    (previousActiveWindow && 
                                     isAppInWhitelist(extractAppName(previousActiveWindow), whitelist));
      
      if (needToShowNotification && lastNotifiedApp !== currentAppName) {
        console.log("Showing notification for non-whitelisted app:", currentAppName);
        handleNonWhitelistedApp(currentAppName);
      }
    } 
    // If app is now whitelisted but we were showing an alert for it, clear the alert
    else if (showingAlert && currentAlertApp && isAppInWhitelist(currentAlertApp, whitelist)) {
      console.log("App is now whitelisted, clearing alert");
      setShowingAlert(false);
    }
    
    // If we're in a whitelisted app, we can reset the lastNotifiedApp
    // to ensure we'll get a notification next time we switch to a non-whitelisted app
    if (isCurrentAppWhitelisted) {
      if (lastNotifiedApp !== null) {
        setLastNotifiedApp(null);
      }
      
      // Also update the wasInWhitelistedApp state
      if (!wasInWhitelistedApp) {
        setWasInWhitelistedApp(true);
      }
    }
    
  }, [isFocusMode, whitelist, previousActiveWindow, wasInWhitelistedApp, showingAlert, currentAlertApp, lastNotifiedApp, activeWindowInfo]);
  
  // Extract the core app name from window title for more reliable matching
  const extractAppName = (windowTitle: string): string => {
    if (!windowTitle) return '';
    
    // Common patterns in window titles
    const appNameMatches = windowTitle.match(/^(.*?)(?:\s[-–—]\s|\s\|\s|\s:|\s\d|$)/);
    return appNameMatches?.[1]?.trim() || windowTitle.trim();
  };
  
  // Improved app matching against whitelist with better fuzzy matching
  const isAppInWhitelist = (appName: string, whitelist: string[]): boolean => {
    if (!appName) return false;
    
    const normalizedAppName = appName.toLowerCase();
    
    return whitelist.some(whitelistedApp => {
      const normalizedWhitelistedApp = whitelistedApp.toLowerCase();
      
      // Check exact matches
      if (normalizedAppName === normalizedWhitelistedApp) return true;
      
      // Check if app name contains the whitelist entry
      if (normalizedAppName.includes(normalizedWhitelistedApp)) return true;
      
      // Check if whitelist entry contains app name
      if (normalizedWhitelistedApp.includes(normalizedAppName)) return true;
      
      // Check for process names (chrome.exe, etc)
      if (normalizedAppName.includes('.exe') && 
          normalizedWhitelistedApp.includes(normalizedAppName.replace('.exe', ''))) {
        return true;
      }
      
      // Check for bundle IDs (com.google.Chrome, etc)
      if (activeWindowInfo && 
          activeWindowInfo.owner && 
          activeWindowInfo.owner.bundleId) {
        
        const bundleId = activeWindowInfo.owner.bundleId.toLowerCase();
        
        if (bundleId.includes(normalizedWhitelistedApp) || 
            normalizedWhitelistedApp.includes(bundleId.split('.').pop() || '')) {
          return true;
        }
      }
      
      return false;
    });
  };
  
  const toggleFocusMode = useCallback(() => {
    const newState = !isFocusMode;
    setIsFocusMode(newState);
    
    // Reset tracking state when toggling focus mode
    setNotificationShown({});
    setWasInWhitelistedApp(false);
    setLastNotifiedApp(null);
    
    // Notify user of mode change
    if (newState) {
      // Send to electron main process to update tray icon
      if (window.electron) {
        window.electron.send('toggle-focus-mode', true);
      }
      
      toast.success("Focus Mode activated", {
        description: "You'll be notified when using non-whitelisted apps",
      });
      
      // Immediately check current window against whitelist
      if (lastActiveWindow) {
        const currentAppName = extractAppName(lastActiveWindow);
        const isCurrentAppWhitelisted = isAppInWhitelist(currentAppName, whitelist);
        
        // Update tracking state based on current app
        setWasInWhitelistedApp(isCurrentAppWhitelisted);
        
        if (!isCurrentAppWhitelisted && currentAppName) {
          // Small delay to allow toast to show first
          setTimeout(() => {
            handleNonWhitelistedApp(currentAppName);
          }, 500);
        }
      }
    } else {
      // Send to electron main process to update tray icon
      if (window.electron) {
        window.electron.send('toggle-focus-mode', false);
      }
      
      // Clear any alert when disabling focus mode
      setShowingAlert(false);
      setCurrentAlertApp(null);
      
      toast.info("Focus Mode deactivated");
    }
  }, [isFocusMode, lastActiveWindow, whitelist]);
  
  const addToWhitelist = useCallback((app: string) => {
    if (!whitelist.includes(app) && app.trim() !== '') {
      setWhitelist(prev => [...prev, app]);
      toast.success(`Added ${app} to whitelist`);
      
      // If we're adding the current app to whitelist, clear any alert
      if (currentAlertApp === app) {
        setShowingAlert(false);
        setCurrentAlertApp(null);
        setLastNotifiedApp(null); // Reset notification tracking
      }
      
      // If the current active window matches this app, update wasInWhitelistedApp
      if (lastActiveWindow && extractAppName(lastActiveWindow) === app) {
        setWasInWhitelistedApp(true);
      }
      
      // Update the current app whitelist status for live preview
      if (currentActiveApp === app) {
        setIsCurrentAppWhitelisted(true);
      }
    }
  }, [whitelist, currentAlertApp, lastActiveWindow, currentActiveApp]);
  
  const removeFromWhitelist = useCallback((app: string) => {
    setWhitelist(prev => prev.filter(item => item !== app));
    toast.info(`Removed ${app} from whitelist`);
    
    // If we're removing the current app from whitelist and in focus mode,
    // check if we need to show an alert
    if (isFocusMode && lastActiveWindow) {
      const currentAppName = extractAppName(lastActiveWindow);
      if (currentAppName === app) {
        // Update tracking state - we're now in a non-whitelisted app
        setWasInWhitelistedApp(false);
        
        // Show notification for this newly non-whitelisted app
        setTimeout(() => {
          handleNonWhitelistedApp(currentAppName);
        }, 100);
        
        // Update the current app whitelist status for live preview
        setIsCurrentAppWhitelisted(false);
      }
    }
  }, [isFocusMode, lastActiveWindow]);
  
  const toggleDimOption = useCallback(() => {
    setDimInsteadOfBlock(prev => !prev);
  }, []);
  
  const handleNonWhitelistedApp = useCallback((appName: string) => {
    console.log("Handling non-whitelisted app:", appName);
    
    // Update tracking to remember we've shown notification for this app
    setLastNotifiedApp(appName);
    
    // Get the custom image from localStorage based on user ID
    const imageUrl = localStorage.getItem(`focusModeCustomImage-${userId}`) || 
                    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6';
    
    // Set current alert app name and show the alert
    setCurrentAlertApp(appName);
    setShowingAlert(true);
    
    // Mark this app as having had a notification shown
    setNotificationShown(prev => ({
      ...prev,
      [appName]: true
    }));
    
    // Create a unique notification ID with timestamp
    const notificationId = `focus-mode-${appName}-${Date.now()}`;
    
    // Send to Electron main process for system-level popup
    if (window.electron) {
      window.electron.send('show-focus-popup', {
        title: "Focus Mode Alert", 
        body: `You're outside your focus zone. ${appName} is not in your whitelist.`,
        notificationId: notificationId,
        mediaType: 'image',
        mediaContent: imageUrl
      });
    }
    
    // Show notification using the centered toast
    centerToast({
      title: "Focus Alert",
      description: `You're outside your focus zone. ${appName} is not in your whitelist`,
      duration: 5000,
    });
    
    // Send a native notification via Electron
    if (window.electron) {
      window.electron.send('show-native-notification', {
        title: "Focus Mode Alert", 
        body: `You're outside your focus zone. ${appName} is not in your whitelist`,
        notificationId: notificationId
      });
    }
    
    // If we're in dim mode, apply dimming effect to the screen
    if (dimInsteadOfBlock) {
      applyDimEffect();
    } else {
      // In a real implementation, this would block or force-close the app
      toast.error("Non-whitelisted app detected", {
        description: "Focus Mode is blocking this application"
      });
    }
  }, [centerToast, dimInsteadOfBlock, userId]);
  
  const applyDimEffect = useCallback(() => {
    // In a real implementation with Electron, we would create an overlay
    // For this demo, we'll show a dimming overlay in the web UI
    const existingOverlay = document.getElementById('focus-mode-dim-overlay');
    
    if (!existingOverlay) {
      const overlay = document.createElement('div');
      overlay.id = 'focus-mode-dim-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.style.zIndex = '9999';
      overlay.style.pointerEvents = 'none'; // Allow clicks to pass through
      overlay.style.transition = 'opacity 0.5s ease';
      
      document.body.appendChild(overlay);
      
      // Auto-remove after 3 seconds
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.style.opacity = '0';
          setTimeout(() => {
            if (overlay.parentNode) {
              overlay.parentNode.removeChild(overlay);
            }
          }, 500);
        }
      }, 3000);
    }
  }, []);
  
  // Handle dismissing the alert
  const handleAlertDismiss = useCallback(() => {
    setShowingAlert(false);
    setCurrentAlertApp(null);
  }, []);
  
  const value = {
    isFocusMode,
    toggleFocusMode,
    whitelist,
    addToWhitelist,
    removeFromWhitelist,
    dimInsteadOfBlock,
    toggleDimOption,
    currentActiveApp,
    isCurrentAppWhitelisted
  };
  
  // Get the custom image for the alert
  const alertImage = customImage || 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6';
  
  return (
    <FocusModeContext.Provider value={value}>
      {children}
      {showingAlert && currentAlertApp && (
        <FocusModeAlert 
          appName={currentAlertApp} 
          onDismiss={handleAlertDismiss} 
          imageUrl={alertImage}
        />
      )}
    </FocusModeContext.Provider>
  );
};
