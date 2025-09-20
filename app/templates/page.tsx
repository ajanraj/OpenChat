'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser } from '@/app/providers/user-provider';
import { api } from '@/convex/_generated/api';
import { getActiveTemplates, type TemplateDefinition } from '@/lib/templates/registry';
import { checkTemplatePrerequisites } from '@/lib/templates/prerequisites';
import { PrerequisiteChecker } from '@/app/components/templates/prerequisite-checker';
import { CheckIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function TemplatesPage() {
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

  const getTemplateStatus = (template: TemplateDefinition) => {
    if (!user) return 'login-required';

    const prerequisites = checkTemplatePrerequisites(template.id, userConnectors);

    if (prerequisites.canUse) return 'ready';
    if (prerequisites.totalRequiredConnected > 0) return 'partial';
    return 'not-started';
  };

  const getStatusBadge = (status: string, template: TemplateDefinition) => {
    const prerequisites = checkTemplatePrerequisites(template.id, userConnectors);

    switch (status) {
      case 'ready':
        return <Badge variant="success" className="gap-1"><CheckIcon className="h-3 w-3" />Ready</Badge>;
      case 'partial':
        return (
          <Badge variant="warning" className="gap-1">
            <ClockIcon className="h-3 w-3" />
            {prerequisites.totalRequiredConnected}/{prerequisites.totalRequiredNeeded} Ready
          </Badge>
        );
      case 'not-started':
        return (
          <Badge variant="secondary" className="gap-1">
            <ExclamationTriangleIcon className="h-3 w-3" />
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
      // Redirect to login
      window.location.href = '/auth';
      return;
    }

    const prerequisites = checkTemplatePrerequisites(templateId, userConnectors);

    if (prerequisites.canUse) {
      // Go directly to task creation
      window.location.href = `/tasks/new?template=${templateId}`;
    } else {
      // Show prerequisite checker
      setSelectedTemplate(templateId);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Background Agent Templates</h1>
          <p className="text-muted-foreground mb-8">
            Please sign in to use background agent templates
          </p>
          <Button asChild>
            <Link href="/auth">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Background Agent Templates</h1>
        <p className="text-muted-foreground mb-6">
          Choose from pre-built automation templates to create intelligent background agents
          that work with your connected tools.
        </p>

        {/* Search and Filters */}
        <div className="flex gap-4 mb-6">
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.map(template => {
          const status = getTemplateStatus(template);
          const prerequisites = checkTemplatePrerequisites(template.id, userConnectors);

          return (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="text-2xl mb-2">{template.icon}</div>
                  {getStatusBadge(status, template)}
                </div>
                <CardTitle className="text-lg">{template.name}</CardTitle>
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
                    <ClockIcon className="h-3 w-3" />
                    {template.estimatedExecutionTime}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {template.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t">
                  <Button
                    className="w-full"
                    onClick={() => handleUseTemplate(template.id)}
                    variant={status === 'ready' ? 'default' : 'outline'}
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
        <div className="text-center py-12">
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
            // Redirect to task creation after prerequisites are met
            window.location.href = `/tasks/new?template=${selectedTemplate}`;
          }}
        />
      )}
    </div>
  );
}