
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useState, useEffect } from "react";
import { useTimer } from "@/contexts/TimerContext";
import { Slider } from "@/components/ui/slider";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { toast as sonnerToast } from "sonner";
import { FocusModeSettings } from "./FocusModeSettings";

const timerSettingsSchema = z.object({
  pomodoroDuration: z.number().min(1).max(120),
  pomodoroBreakDuration: z.number().min(1).max(60),
  eyeCareWorkDuration: z.number().min(1).max(120),
  eyeCareRestDuration: z.number().min(5).max(120),
});

type TimerSettingsValues = z.infer<typeof timerSettingsSchema>;

export function SettingsPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [username, setUsername] = useState(user?.name || "");
  const { 
    pomodoroDuration,
    pomodoroBreakDuration,
    eyeCareWorkDuration,
    eyeCareRestDuration,
    updateTimerSettings
  } = useTimer();

  useEffect(() => {
    if (user?.name) {
      setUsername(user.name);
    }
  }, [user]);

  const timerForm = useForm<TimerSettingsValues>({
    resolver: zodResolver(timerSettingsSchema),
    defaultValues: {
      pomodoroDuration,
      pomodoroBreakDuration,
      eyeCareWorkDuration: Math.floor(eyeCareWorkDuration / 60),
      eyeCareRestDuration,
    },
  });

  const onTimerSettingsSave = (data: TimerSettingsValues) => {
    updateTimerSettings({
      pomodoroDuration: data.pomodoroDuration,
      pomodoroBreakDuration: data.pomodoroBreakDuration,
      eyeCareWorkDuration: data.eyeCareWorkDuration * 60,
      eyeCareRestDuration: data.eyeCareRestDuration,
    });
    
    sonnerToast("Timer settings saved", {
      description: "Your timer preferences have been updated.",
    });
  };

  return (
    <Tabs defaultValue="timers" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="timers">Timer Settings</TabsTrigger>
        <TabsTrigger value="focus-mode">Focus Mode</TabsTrigger>
      </TabsList>
      
      <TabsContent value="timers">
        <Card>
          <CardHeader>
            <CardTitle>Timer Settings</CardTitle>
            <CardDescription>
              Customize your Pomodoro and Eye Care timer durations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...timerForm}>
              <form onSubmit={timerForm.handleSubmit(onTimerSettingsSave)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Pomodoro Timer</h3>
                  
                  <FormField
                    control={timerForm.control}
                    name="pomodoroDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Focus Duration (minutes)</FormLabel>
                        <div className="flex items-center space-x-4">
                          <FormControl>
                            <Slider
                              min={1}
                              max={120}
                              step={1}
                              value={[field.value]}
                              onValueChange={(vals) => field.onChange(vals[0])}
                            />
                          </FormControl>
                          <Input 
                            type="number" 
                            className="w-20" 
                            min={1}
                            max={120}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </div>
                        <FormDescription>
                          How long each focus session should last (1-120 minutes)
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={timerForm.control}
                    name="pomodoroBreakDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Break Duration (minutes)</FormLabel>
                        <div className="flex items-center space-x-4">
                          <FormControl>
                            <Slider
                              min={1}
                              max={60}
                              step={1}
                              value={[field.value]}
                              onValueChange={(vals) => field.onChange(vals[0])}
                            />
                          </FormControl>
                          <Input 
                            type="number" 
                            className="w-20" 
                            min={1}
                            max={60}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </div>
                        <FormDescription>
                          How long each break should last (1-60 minutes)
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Eye Care Timer</h3>
                  
                  <FormField
                    control={timerForm.control}
                    name="eyeCareWorkDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Duration (minutes)</FormLabel>
                        <div className="flex items-center space-x-4">
                          <FormControl>
                            <Slider
                              min={1}
                              max={120}
                              step={1}
                              value={[field.value]}
                              onValueChange={(vals) => field.onChange(vals[0])}
                            />
                          </FormControl>
                          <Input 
                            type="number" 
                            className="w-20" 
                            min={1}
                            max={120}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </div>
                        <FormDescription>
                          How long to work before taking an eye break (1-120 minutes)
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={timerForm.control}
                    name="eyeCareRestDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rest Duration (seconds)</FormLabel>
                        <div className="flex items-center space-x-4">
                          <FormControl>
                            <Slider
                              min={5}
                              max={120}
                              step={5}
                              value={[field.value]}
                              onValueChange={(vals) => field.onChange(vals[0])}
                            />
                          </FormControl>
                          <Input 
                            type="number" 
                            className="w-20" 
                            min={5}
                            max={120}
                            step={5}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </div>
                        <FormDescription>
                          How long each eye rest should last (5-120 seconds)
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
                
                <Button type="submit">Save Timer Settings</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="focus-mode">
        <FocusModeSettings />
      </TabsContent>
    </Tabs>
  );
}
