
import { TopNav } from "@/components/layout/TopNav";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Settings, Focus, Timer } from "lucide-react";
import { useState } from "react";
import { useFocusMode } from "@/contexts/FocusModeContext";
import { useSystemTray } from "@/hooks/use-system-tray";
import { cn } from "@/lib/utils";

export default function Index() {
  const [showSettings, setShowSettings] = useState(false);
  const { 
    isFocusMode, 
    toggleFocusMode,
    currentActiveApp,
    isCurrentAppWhitelisted
  } = useFocusMode();
  
  useSystemTray();

  if (showSettings) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">Settings</h1>
            <Button 
              variant="outline" 
              onClick={() => setShowSettings(false)}
            >
              Back to Dashboard
            </Button>
          </div>
          <SettingsPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor your productivity and manage focus settings
            </p>
          </div>
          <Button onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Focus Mode Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Focus Mode</CardTitle>
              <Focus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={isFocusMode} 
                  onCheckedChange={toggleFocusMode}
                />
                <span className="text-sm">
                  {isFocusMode ? "Active" : "Inactive"}
                </span>
              </div>
              {isFocusMode && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Current App:</div>
                  <div className={cn(
                    "flex items-center justify-between text-xs",
                    isCurrentAppWhitelisted ? "text-green-600" : "text-red-600"
                  )}>
                    <span>{currentActiveApp || "No app detected"}</span>
                    <Badge 
                      variant={isCurrentAppWhitelisted ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {isCurrentAppWhitelisted ? "Allowed" : "Blocked"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setShowSettings(true)}
                >
                  Configure Focus Mode
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setShowSettings(true)}
                >
                  Timer Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* App Usage Tracker */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">App Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Tracking your application usage patterns to help improve focus.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
