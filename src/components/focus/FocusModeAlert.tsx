
import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusMode } from '@/contexts/FocusModeContext';

interface FocusModeAlertProps {
  appName: string;
  onDismiss: () => void;
  imageUrl?: string; // Custom image URL
}

export function FocusModeAlert({ 
  appName, 
  onDismiss,
  imageUrl = 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6'
}: FocusModeAlertProps) {
  const [isVisible, setIsVisible] = useState(true);
  const { dimInsteadOfBlock } = useFocusMode();
  const [imageError, setImageError] = useState(false);
  const [popupShown, setPopupShown] = useState(false);
  const notificationIdRef = useRef<string>(`focus-alert-${appName}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  
  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 8000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Tell the main process to show system overlay popup when this component mounts
  useEffect(() => {
    if (window.electron && !popupShown) {
      console.log("FocusModeAlert: Dispatching focus popup event for:", appName);
      console.log("Using image URL:", imageUrl);
      
      // Use the pre-generated notification ID
      const notificationId = notificationIdRef.current;
      
      // Preload the image to ensure it loads before displaying
      const img = new Image();
      img.onload = () => {
        // Once image is loaded, trigger the system-wide overlay popup
        window.electron.send('show-focus-popup', {
          title: "Focus Mode Alert", 
          body: `You're outside your focus zone. ${appName} is not in your whitelist.`,
          notificationId: notificationId,
          mediaType: 'image',
          mediaContent: imageUrl
        });
        
        setPopupShown(true);
      };
      
      img.onerror = () => {
        // If image fails to load, still show popup but with default image
        setImageError(true);
        window.electron.send('show-focus-popup', {
          title: "Focus Mode Alert", 
          body: `You're outside your focus zone. ${appName} is not in your whitelist.`,
          notificationId: notificationId,
          mediaType: 'image',
          mediaContent: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6'
        });
        
        setPopupShown(true);
      };
      
      // Start loading the image
      img.src = imageUrl;
      
      // Add listener for popup display confirmation
      const handlePopupDisplayed = (event: Event) => {
        const customEvent = event as CustomEvent;
        if (customEvent.detail && customEvent.detail.notificationId === notificationId) {
          console.log("Popup display confirmed:", customEvent.detail);
        }
      };
      
      window.addEventListener('focus-popup-displayed', handlePopupDisplayed);
      
      return () => {
        window.removeEventListener('focus-popup-displayed', handlePopupDisplayed);
      };
    }
  }, [appName, imageUrl, popupShown]);
  
  const handleDismiss = () => {
    setIsVisible(false);
    // Delay actual dismissal to allow animation to complete
    setTimeout(() => {
      onDismiss();
    }, 300);
  };
  
  const handleImageError = () => {
    console.log("Image failed to load:", imageUrl);
    setImageError(true);
  };
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50"
        >
          <div className="bg-black/85 text-white rounded-lg shadow-lg border border-white/10 overflow-hidden max-w-md">
            {/* Display custom image with fallback */}
            <div className="w-full h-40 bg-black/50 overflow-hidden">
              <img 
                src={!imageError ? imageUrl : 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6'} 
                onError={handleImageError}
                alt="Focus reminder" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-amber-400 font-bold text-lg mb-1">Focus Mode Alert</h3>
                  <p className="text-white/90">
                    You're outside your focus zone. <span className="font-semibold">{appName}</span> is not in your whitelist.
                  </p>
                  {dimInsteadOfBlock ? (
                    <p className="text-xs mt-1 text-white/70">
                      Your screen will be dimmed until you return to an allowed application.
                    </p>
                  ) : (
                    <p className="text-xs mt-1 text-white/70">
                      This application is blocked in Focus Mode.
                    </p>
                  )}
                </div>
                <button 
                  onClick={handleDismiss}
                  className="ml-4 text-white/70 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="bg-white/10 px-4 py-2 flex justify-end">
              <button 
                onClick={handleDismiss}
                className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
