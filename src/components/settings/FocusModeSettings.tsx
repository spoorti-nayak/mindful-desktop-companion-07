
import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFocusMode } from "@/contexts/FocusModeContext";
import { X, Plus, Upload, Image, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FocusModeSettings() {
  const { 
    isFocusMode, 
    toggleFocusMode, 
    whitelist, 
    addToWhitelist, 
    removeFromWhitelist,
    dimInsteadOfBlock,
    toggleDimOption,
    currentActiveApp,
    isCurrentAppWhitelisted
  } = useFocusMode();
  
  const [newApp, setNewApp] = useState("");
  
  // Custom image upload state
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // User identifier for data separation
  const [userId, setUserId] = useState<string>(() => {
    const storedId = localStorage.getItem('focusModeUserId');
    return storedId || '';
  });
  
  // Effect to get user ID on mount
  useEffect(() => {
    const storedId = localStorage.getItem('focusModeUserId');
    if (storedId) {
      setUserId(storedId);
    } else {
      const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('focusModeUserId', newId);
      setUserId(newId);
    }
  }, []);
  
  const handleAddToWhitelist = () => {
    if (newApp.trim()) {
      addToWhitelist(newApp.trim());
      setNewApp("");
    } else if (currentActiveApp) {
      // If no app name is entered but there is a current active app, add that
      addToWhitelist(currentActiveApp);
    }
  };
  
  const handleAddCurrentApp = () => {
    if (currentActiveApp) {
      addToWhitelist(currentActiveApp);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file is an image
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }
      
      // Create URL for the uploaded file
      const imageUrl = URL.createObjectURL(file);
      setCustomImage(imageUrl);
      
      // Save to localStorage with user-specific key
      try {
        localStorage.setItem(`focusModeCustomImage-${userId}`, imageUrl);
      } catch (e) {
        console.error("Failed to save custom image:", e);
      }
      
      setShowImageDialog(false);
    }
  };
  
  // Load custom image from localStorage on component mount
  React.useEffect(() => {
    if (!userId) return;
    
    const savedImage = localStorage.getItem(`focusModeCustomImage-${userId}`);
    if (savedImage) {
      setCustomImage(savedImage);
    }
  }, [userId]);
  
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const clearCustomImage = () => {
    setCustomImage(null);
    localStorage.removeItem(`focusModeCustomImage-${userId}`);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus Mode</CardTitle>
        <CardDescription>
          Control which applications and websites you can access during focus sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="focus-mode">Enable Focus Mode</Label>
            <p className="text-sm text-muted-foreground">
              Block or dim non-whitelisted apps and websites
            </p>
          </div>
          <Switch 
            id="focus-mode" 
            checked={isFocusMode} 
            onCheckedChange={toggleFocusMode}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="dim-mode">Dim instead of block</Label>
            <p className="text-sm text-muted-foreground">
              Dim screen when using non-whitelisted apps instead of blocking them
            </p>
          </div>
          <Switch 
            id="dim-mode" 
            checked={dimInsteadOfBlock} 
            onCheckedChange={toggleDimOption}
          />
        </div>
        
        {/* Live Whitelist Match Preview */}
        <div className="space-y-2">
          <Label>Current App Status</Label>
          <div className={cn(
            "p-3 rounded-lg border flex items-center justify-between",
            currentActiveApp ? 
              isCurrentAppWhitelisted ? 
                "bg-green-100/10 border-green-500/30" : 
                "bg-red-100/10 border-red-500/30" :
              "bg-gray-100/10 border-gray-500/30"
          )}>
            <div>
              <p className="text-sm font-medium">
                {currentActiveApp || "No active window detected"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {currentActiveApp ? 
                  isCurrentAppWhitelisted ? 
                    "This app is allowed in Focus Mode" : 
                    "This app is blocked in Focus Mode" :
                  "Waiting for app detection"}
              </p>
            </div>
            <div>
              {currentActiveApp ? (
                isCurrentAppWhitelisted ? (
                  <Badge className="bg-green-500 text-white">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Allowed
                  </Badge>
                ) : (
                  <div className="flex flex-col items-end space-y-2">
                    <Badge className="bg-red-500 text-white">
                      <XCircle className="h-3 w-3 mr-1" />
                      Blocked
                    </Badge>
                    {!isCurrentAppWhitelisted && (
                      <Button 
                        onClick={handleAddCurrentApp}
                        variant="outline"
                        size="sm"
                        className="border-green-500 text-green-500 hover:bg-green-500/10"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Whitelist
                      </Button>
                    )}
                  </div>
                )
              ) : (
                <Badge variant="outline">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not detected
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        {/* Custom notification image section */}
        <div className="space-y-2">
          <Label>Focus Mode Notification Image</Label>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">
                Custom image for focus mode notifications
              </p>
            </div>
            <Button 
              onClick={() => setShowImageDialog(true)}
              variant="outline"
              size="sm"
            >
              <Image className="h-4 w-4 mr-2" />
              {customImage ? 'Change Image' : 'Set Image'}
            </Button>
          </div>
          
          {customImage && (
            <div className="mt-2 relative">
              <img 
                src={customImage} 
                alt="Custom notification" 
                className="w-full h-32 object-cover rounded-md border border-border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 rounded-full"
                onClick={clearCustomImage}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        
        <div className="space-y-4">
          <Label>Manage Whitelist</Label>
          
          <div className="flex space-x-2">
            <Input 
              placeholder="Add application or website name" 
              value={newApp}
              onChange={(e) => setNewApp(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddToWhitelist();
                }
              }}
            />
            <Button onClick={handleAddToWhitelist}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {whitelist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No apps in whitelist. Add apps that you want to allow during Focus Mode.
              </p>
            ) : (
              whitelist.map((app) => (
                <div 
                  key={app} 
                  className={cn(
                    "flex items-center justify-between rounded p-2",
                    currentActiveApp && currentActiveApp.toLowerCase().includes(app.toLowerCase()) ? 
                      "bg-green-100/10 border border-green-500/30" : 
                      "bg-secondary/50"
                  )}
                >
                  <span>{app}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => removeFromWhitelist(app)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Hidden file input for image upload */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        
        <AlertDialog open={showImageDialog} onOpenChange={setShowImageDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Upload Custom Image</AlertDialogTitle>
              <AlertDialogDescription>
                Choose an image to show on focus mode notifications.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="flex items-center justify-center p-6 border-2 border-dashed border-muted-foreground/20 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                 onClick={triggerFileInput}>
              <div className="text-center space-y-2">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to select an image, or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, GIF up to 5MB
                </p>
              </div>
            </div>
            
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
