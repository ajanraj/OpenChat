'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/app/providers/user-provider';
import { api } from '@/convex/_generated/api';
import { getTemplateById } from '@/lib/templates/registry';
import { checkTemplatePrerequisites } from '@/lib/templates/prerequisites';
import { PrerequisiteChecker } from '@/app/components/templates/prerequisite-checker';
import { TimePicker } from '@/app/components/scheduled-tasks/time-picker';
import { ArrowLeft, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';

export default function CreateTemplateTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const templateId = searchParams.get('template');

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly'>('daily');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [weekday, setWeekday] = useState(1); // Monday
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPrerequisites, setShowPrerequisites] = useState(false);

  // Get user's connectors
  const { data: userConnectors = [] } = useQuery({
    ...convexQuery(api.connectors.listUserConnectors, {}),
    enabled: Boolean(user),
  });

  const template = templateId ? getTemplateById(templateId) : null;
  const prerequisites = template ? checkTemplatePrerequisites(templateId, userConnectors) : null;

  // Initialize form with template defaults
  useEffect(() => {
    if (template) {
      setTitle(template.name);
      setPrompt(template.defaultPrompt);
      setScheduleType(template.defaultSchedule.type);
      setScheduledTime(template.defaultSchedule.time);
      if (template.defaultSchedule.weekday !== undefined) {
        setWeekday(template.defaultSchedule.weekday);
      }
    }
  }, [template]);

  // Check prerequisites when component loads
  useEffect(() => {
    if (prerequisites && !prerequisites.canUse) {
      setShowPrerequisites(true);
    }
  }, [prerequisites]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!template || !prerequisites?.canUse) {
      toast.error('Prerequisites not met');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/templates/create-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          customizations: {
            title: title !== template.name ? title : undefined,
            prompt: prompt !== template.defaultPrompt ? prompt : undefined,
            schedule: (scheduleType !== template.defaultSchedule.type ||
                     scheduledTime !== template.defaultSchedule.time ||
                     (scheduleType === 'weekly' && weekday !== (template.defaultSchedule.weekday || 1)))
              ? { type: scheduleType, time: scheduledTime, weekday: scheduleType === 'weekly' ? weekday : undefined }
              : undefined,
            emailNotifications: emailNotifications !== true ? emailNotifications : undefined,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create template instance');
      }

      const result = await response.json();
      toast.success('Background agent created successfully!');
      router.push('/tasks');
    } catch (error) {
      console.error('Failed to create template instance:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create background agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!templateId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">No Template Selected</h1>
          <p className="text-muted-foreground mb-6">
            Please select a template from the templates page.
          </p>
          <Button onClick={() => router.push('/templates')}>
            Browse Templates
          </Button>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Template Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The requested template could not be found.
          </p>
          <Button onClick={() => router.push('/templates')}>
            Browse Templates
          </Button>
        </div>
      </div>
    );
  }

  const weekdays = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/templates')}
          className="mb-4 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Templates
        </Button>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{template.icon}</span>
          <h1 className="text-2xl font-bold">Setup {template.name}</h1>
        </div>
        <p className="text-muted-foreground">
          Configure your background agent with custom settings
        </p>
      </div>

      {/* Prerequisites Check */}
      {prerequisites && !prerequisites.canUse && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-yellow-800">Prerequisites Required</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-yellow-700 mb-3">
              You need to connect the required tools before creating this agent.
            </p>
            <Button
              size="sm"
              onClick={() => setShowPrerequisites(true)}
              variant="outline"
            >
              Setup Required Tools
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Template Info */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Template Information</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            {template.longDescription}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {template.category}
            </Badge>
            <Badge variant="outline">
              {template.estimatedExecutionTime}
            </Badge>
            {template.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                #{tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Settings</CardTitle>
            <CardDescription>
              Customize the agent name and behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Agent Name</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a custom name for your agent"
                required
              />
            </div>

            <div>
              <Label htmlFor="prompt">Instructions</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Customize the agent's instructions"
                rows={8}
                className="font-mono text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Modify these instructions to customize how your agent behaves
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Schedule Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              When should this agent run?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Frequency</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={scheduleType === 'daily' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScheduleType('daily')}
                >
                  Daily
                </Button>
                <Button
                  type="button"
                  variant={scheduleType === 'weekly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScheduleType('weekly')}
                >
                  Weekly
                </Button>
              </div>
            </div>

            {scheduleType === 'weekly' && (
              <div>
                <Label>Day of Week</Label>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md"
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label>Time</Label>
              <TimePicker
                value={scheduledTime}
                onChange={setScheduledTime}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              How should you be notified about results?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="email-notifications"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
              <Label htmlFor="email-notifications" className="text-sm">
                Send email notifications with results
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Connected Tools */}
        {prerequisites && (
          <Card>
            <CardHeader>
              <CardTitle>Connected Tools</CardTitle>
              <CardDescription>
                Tools that will be available to your agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {prerequisites.availableRequired.map(connector => (
                  <div key={connector} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm">{connector}</span>
                    <Badge variant="success" className="text-xs">Required</Badge>
                  </div>
                ))}
                {prerequisites.availableOptional.map(connector => (
                  <div key={connector} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm">{connector}</span>
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/templates')}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !prerequisites?.canUse}
            className="flex-1"
          >
            {isSubmitting ? 'Creating...' : 'Create Background Agent'}
          </Button>
        </div>
      </form>

      {/* Prerequisites Modal */}
      {showPrerequisites && (
        <PrerequisiteChecker
          templateId={templateId}
          isOpen={showPrerequisites}
          onClose={() => setShowPrerequisites(false)}
          onComplete={() => {
            setShowPrerequisites(false);
            // Refresh the page to update prerequisites
            window.location.reload();
          }}
          returnPath={`/tasks/new/template?template=${templateId}`}
        />
      )}
    </div>
  );
}