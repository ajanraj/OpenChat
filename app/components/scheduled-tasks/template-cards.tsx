'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser } from '@/app/providers/user-provider';
import { api } from '@/convex/_generated/api';
import { getActiveTemplates } from '@/lib/templates/registry';
import { checkTemplatePrerequisites } from '@/lib/templates/prerequisites';
import { PrerequisiteChecker } from '@/app/components/templates/prerequisite-checker';
import { Check, Clock, Warning } from '@phosphor-icons/react';

export function TemplateCards() {
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Get user's connectors to check prerequisites
  const { data: userConnectors = [] } = useQuery({
    ...convexQuery(api.connectors.listUserConnectors, {}),
    enabled: Boolean(user),
  });

  // Get all available templates
  const templates = getActiveTemplates();

  // Filter templates based on search and category
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(new Set(templates.map(t => t.category)));

  const getTemplateStatus = (templateId: string) => {
    if (!user) return 'login-required';

    const prerequisites = checkTemplatePrerequisites(templateId, userConnectors);

    if (prerequisites.canUse) return 'ready';
    if (prerequisites.totalRequiredConnected > 0) return 'partial';
    return 'not-started';
  };

  const getStatusBadge = (status: string, templateId: string) => {
    const prerequisites = checkTemplatePrerequisites(templateId, userConnectors);

    switch (status) {
      case 'ready':
        return <Badge variant="success" className="gap-1"><Check className="h-3 w-3" />Ready</Badge>;
      case 'partial':
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="h-3 w-3" />
            {prerequisites.totalRequiredConnected}/{prerequisites.totalRequiredNeeded} Ready
          </Badge>
        );
      case 'not-started':
        return (
          <Badge variant="secondary" className="gap-1">
            <Warning className="h-3 w-3" />
            Setup Required
          </Badge>
        );
      case 'login-required':
        return <Badge variant="outline">Login Required</Badge>;
      default:
        return null;
    }
  };

  const handleUseTemplate = (templateId: string) => {
    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const prerequisites = checkTemplatePrerequisites(templateId, userConnectors);

    if (prerequisites.canUse) {
      // Go directly to task creation
      window.location.href = `/tasks/new/template?template=${templateId}`;
    } else {
      // Show prerequisite checker
      setSelectedTemplate(templateId);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-4">Background Agent Templates</h2>
        <p className="text-muted-foreground mb-6">
          Please sign in to use background agent templates
        </p>
        <Button onClick={() => window.location.href = '/auth'}>
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Agent Templates</h2>
          <p className="text-muted-foreground text-sm">
            Choose from pre-built templates to create intelligent background agents
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-3">
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filteredTemplates.map(template => {
          const status = getTemplateStatus(template.id);
          const prerequisites = checkTemplatePrerequisites(template.id, userConnectors);

          return (
            <Card key={template.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-xl">{template.icon}</div>
                  {getStatusBadge(status, template.id)}
                </div>
                <CardTitle className="text-base">{template.name}</CardTitle>
                <CardDescription className="text-sm">
                  {template.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-3 flex-1">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      REQUIRED TOOLS
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {template.requiredConnectors.map(connector => (
                        <Badge key={connector} variant="outline" className="text-xs">
                          {connector}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {template.optionalConnectors && template.optionalConnectors.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        OPTIONAL TOOLS
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {template.optionalConnectors.map(connector => (
                          <Badge key={connector} variant="secondary" className="text-xs">
                            {connector}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {template.estimatedExecutionTime}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {template.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                    {template.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{template.tags.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t">
                  <Button
                    className="w-full"
                    onClick={() => handleUseTemplate(template.id)}
                    variant={status === 'ready' ? 'default' : 'outline'}
                    size="sm"
                  >
                    {status === 'ready' ? 'Use Template' :
                     status === 'partial' ? 'Setup & Use' :
                     status === 'login-required' ? 'Sign In to Use' : 'Setup Required'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No templates found matching your criteria.
          </p>
        </div>
      )}

      {/* Prerequisite Checker Modal */}
      {selectedTemplate && (
        <PrerequisiteChecker
          templateId={selectedTemplate}
          isOpen={true}
          onClose={() => setSelectedTemplate(null)}
          onComplete={() => {
            window.location.href = `/tasks/new/template?template=${selectedTemplate}`;
          }}
          returnPath="/tasks"
        />
      )}
    </div>
  );
}