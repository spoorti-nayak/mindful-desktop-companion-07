import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import SystemTrayService from '@/services/SystemTrayService';
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { FocusModeAlert } from '@/components/focus/FocusModeAlert';
import { useAuth } from '@/contexts/AuthContext';

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
  const [showingAlert, setShowingAlert] = useState(false);
  const [currentAlertApp, setCurrentAlertApp] = useState<string | null>(null);
  const { toast: centerToast } = useToast();
  
  // Enhanced tracking for better popup control
  const [lastNotifiedApp, setLastNotifiedApp] = useState<string | null>(null);
  const [currentActiveApp, setCurrentActiveApp] = useState<string | null>(null);
  const [isCurrentAppWhitelisted, setIsCurrentAppWhitelisted] = useState(false);
  const [activeWindowInfo, setActiveWindowInfo] = useState<any>(null);
  
  // Get user from auth context with fallback
  const auth = useAuth();
  const userId = auth?.user?.id || (() => {
    const storedId = localStorage.getItem('focusModeUserId');
    if (storedId) return storedId;
    
    const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('focusModeUserId', newId);
    return newId;
  })();
  
  // Load saved settings from localStorage on initial mount
  useEffect(() => {
    if (!userId) return;
    
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
    
    // Register for active window change events
    const handleActiveWindowChanged = (event: CustomEvent<any>) => {
      const windowInfo = event.detail;
      console.log("Window changed event:", windowInfo);
      
      // Store the complete window info
      setActiveWindowInfo(windowInfo);
      
      // Extract app information with improved detection
      const appName = extractAppName(windowInfo);
      setCurrentActiveApp(appName);
      setLastActiveWindow(typeof windowInfo === 'string' ? windowInfo : windowInfo.title);
      
      // Check whitelist status with enhanced matching
      const isWhitelisted = isAppInWhitelist(appName, whitelist);
      setIsCurrentAppWhitelisted(isWhitelisted);
      
      console.log("App detected:", appName, "Whitelisted:", isWhitelisted);
    };
    
    // Track dismissed notifications
    const handleNotificationDismissed = (event: CustomEvent<string>) => {
      console.log("Notification dismissed:", event.detail);
      
      if (currentAlertApp && event.detail.includes(currentAlertApp)) {
        setShowingAlert(false);
        setCurrentAlertApp(null);
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
    };
  }, [currentAlertApp, userId, whitelist]);
  
  // Save settings whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(`focusModeWhitelist-${userId}`, JSON.stringify(whitelist));
    } catch (e) {
      console.error("Failed to save whitelist:", e);
    }
  }, [whitelist, userId]);
  
  useEffect(() => {
    try {
      localStorage.setItem(`focusModeDimOption-${userId}`, JSON.stringify(dimInsteadOfBlock));
    } catch (e) {
      console.error("Failed to save dim option:", e);
    }
  }, [dimInsteadOfBlock, userId]);
  
  useEffect(() => {
    try {
      localStorage.setItem(`focusModeEnabled-${userId}`, isFocusMode ? 'true' : 'false');
    } catch (e) {
      console.error("Failed to save focus mode state:", e);
    }
  }, [isFocusMode, userId]);
  
  // Enhanced app name extraction with better process detection
  const extractAppName = (windowInfo: any): string => {
    if (!windowInfo) return '';
    
    if (typeof windowInfo === 'string') {
      return normalizeAppName(windowInfo);
    }
    
    // Priority order: executable name > bundle ID > owner name > title
    const candidates = [
      windowInfo.owner?.path ? getExecutableName(windowInfo.owner.path) : null,
      windowInfo.owner?.bundleId ? getBundleAppName(windowInfo.owner.bundleId) : null,
      windowInfo.owner?.name,
      windowInfo.appName,
      windowInfo.title
    ].filter(Boolean);
    
    return candidates.length > 0 ? normalizeAppName(candidates[0]) : '';
  };
  
  // Extract executable name from path
  const getExecutableName = (path: string): string => {
    if (!path) return '';
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || '';
  };
  
  // Extract app name from bundle ID
  const getBundleAppName = (bundleId: string): string => {
    if (!bundleId) return '';
    const parts = bundleId.split('.');
    return parts[parts.length - 1] || bundleId;
  };
  
  // Normalize app names for consistent matching
  const normalizeAppName = (name: string): string => {
    if (!name) return '';
    
    // Remove common suffixes and normalize
    return name
      .toLowerCase()
      .replace(/\.exe$/, '')
      .replace(/\.app$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  // Enhanced fuzzy matching for whitelist
  const isAppInWhitelist = (appName: string, whitelist: string[]): boolean => {
    if (!appName) return false;
    
    const normalizedAppName = normalizeAppName(appName);
    
    return whitelist.some(whitelistedApp => {
      const normalizedWhitelistedApp = normalizeAppName(whitelistedApp);
      
      // Exact match
      if (normalizedAppName === normalizedWhitelistedApp) return true;
      
      // Partial match (both directions)
      if (normalizedAppName.includes(normalizedWhitelistedApp) || 
          normalizedWhitelistedApp.includes(normalizedAppName)) return true;
      
      // Word-based matching for compound names
      const appWords = normalizedAppName.split(/[-_\s]+/);
      const whitelistWords = normalizedWhitelistedApp.split(/[-_\s]+/);
      
      return appWords.some(appWord => 
        whitelistWords.some(whitelistWord => 
          appWord.includes(whitelistWord) || whitelistWord.includes(appWord)
        )
      );
    });
  };
  
  // Monitor focus mode state and handle app switches
  useEffect(() => {
    if (!isFocusMode || !currentActiveApp) return;
    
    // Never show popup for our own app
    const normalizedCurrentApp = normalizeAppName(currentActiveApp);
    if (normalizedCurrentApp.includes('mindful') || 
        normalizedCurrentApp.includes('electron') ||
        normalizedCurrentApp.includes('desktop-companion')) {
      return;
    }
    
    const isWhitelisted = isAppInWhitelist(currentActiveApp, whitelist);
    
    // Show popup only when switching to a different non-whitelisted app
    if (!isWhitelisted && currentActiveApp !== lastNotifiedApp) {
      console.log(`Switching to non-whitelisted app: ${currentActiveApp}`);
      handleNonWhitelistedApp(currentActiveApp);
      setLastNotifiedApp(currentActiveApp);
    } else if (isWhitelisted && showingAlert && currentAlertApp === currentActiveApp) {
      // Clear alert if current app becomes whitelisted
      setShowingAlert(false);
      setCurrentAlertApp(null);
    }
  }, [isFocusMode, currentActiveApp, whitelist, lastNotifiedApp, showingAlert, currentAlertApp]);
  
  const toggleFocusMode = useCallback(() => {
    const newState = !isFocusMode;
    
    // Prevent window glitching by stabilizing before state change
    if (window.electron) {
      window.electron.send('stabilize-window');
    }
    
    setIsFocusMode(newState);
    setLastNotifiedApp(null); // Reset notification tracking
    
    if (newState) {
      if (window.electron) {
        window.electron.send('toggle-focus-mode', true);
      }
      
      toast.success("Focus Mode activated", {
        description: "You'll be notified when using non-whitelisted apps",
      });
      
      // Check current app immediately
      if (currentActiveApp) {
        const isWhitelisted = isAppInWhitelist(currentActiveApp, whitelist);
        if (!isWhitelisted) {
          setTimeout(() => {
            handleNonWhitelistedApp(currentActiveApp);
            setLastNotifiedApp(currentActiveApp);
          }, 500);
        }
      }
    } else {
      if (window.electron) {
        window.electron.send('toggle-focus-mode', false);
      }
      
      setShowingAlert(false);
      setCurrentAlertApp(null);
      toast.info("Focus Mode deactivated");
    }
  }, [isFocusMode, currentActiveApp, whitelist]);
  
  const addToWhitelist = useCallback((app: string) => {
    if (!whitelist.includes(app) && app.trim() !== '') {
      // Prevent UI flicker by batching state updates
      setTimeout(() => {
        setWhitelist(prev => [...prev, app]);
        toast.success(`Added ${app} to whitelist`);
        
        // Clear alert if adding current app
        if (currentAlertApp === app || (currentActiveApp && normalizeAppName(currentActiveApp) === normalizeAppName(app))) {
          setShowingAlert(false);
          setCurrentAlertApp(null);
          setLastNotifiedApp(null);
        }
        
        // Update current app status
        if (currentActiveApp && normalizeAppName(currentActiveApp) === normalizeAppName(app)) {
          setIsCurrentAppWhitelisted(true);
        }
      }, 0);
    }
  }, [whitelist, currentAlertApp, currentActiveApp]);
  
  const removeFromWhitelist = useCallback((app: string) => {
    // Prevent UI flicker by batching state updates
    setTimeout(() => {
      setWhitelist(prev => prev.filter(item => item !== app));
      toast.info(`Removed ${app} from whitelist`);
      
      // Check if current app is affected
      if (isFocusMode && currentActiveApp && normalizeAppName(currentActiveApp) === normalizeAppName(app)) {
        setIsCurrentAppWhitelisted(false);
        setTimeout(() => {
          handleNonWhitelistedApp(currentActiveApp);
          setLastNotifiedApp(currentActiveApp);
        }, 100);
      }
    }, 0);
  }, [isFocusMode, currentActiveApp]);
  
  const toggleDimOption = useCallback(() => {
    setDimInsteadOfBlock(prev => !prev);
  }, []);
  
  const handleNonWhitelistedApp = useCallback((appName: string) => {
    console.log("Handling non-whitelisted app:", appName);
    
    // Get custom image and text from localStorage (no fallback image)
    const customImage = localStorage.getItem(`focusModeCustomImage-${userId}`);
    const customText = localStorage.getItem(`focusModeCustomText-${userId}`) || '';
    
    setCurrentAlertApp(appName);
    setShowingAlert(true);
    
    const notificationId = `focus-mode-${appName}-${Date.now()}`;
    
    // Send to Electron for system-level popup
    if (window.electron) {
      const popupData: any = {
        title: "Focus Mode Alert", 
        body: `You're outside your focus zone. ${appName} is not in your whitelist.`,
        notificationId: notificationId,
        customText: customText
      };
      
      // Only include image if one is actually set by user
      if (customImage) {
        popupData.mediaType = 'image';
        popupData.mediaContent = customImage;
      } else {
        popupData.mediaType = 'text';
        popupData.mediaContent = '';
      }
      
      window.electron.send('show-focus-popup', popupData);
    }
    
    let toastDescription = `You're outside your focus zone. ${appName} is not in your whitelist`;
    if (customText) {
      toastDescription += `\n\n${customText}`;
    }
    
    centerToast({
      title: "Focus Alert",
      description: toastDescription,
      duration: 5000,
    });
    
    if (dimInsteadOfBlock) {
      applyDimEffect();
    }
  }, [centerToast, dimInsteadOfBlock, userId]);
  
  const applyDimEffect = useCallback(() => {
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
      overlay.style.pointerEvents = 'none';
      overlay.style.transition = 'opacity 0.5s ease';
      
      document.body.appendChild(overlay);
      
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
  
  // Get the custom image for the alert (no fallback)
  const customImage = localStorage.getItem(`focusModeCustomImage-${userId}`);
  
  return (
    <FocusModeContext.Provider value={value}>
      {children}
      {showingAlert && currentAlertApp && (
        <FocusModeAlert 
          appName={currentAlertApp} 
          onDismiss={handleAlertDismiss} 
          imageUrl={customImage || undefined}
        />
      )}
    </FocusModeContext.Provider>
  );
};
