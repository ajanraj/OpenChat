import type { ConnectorType } from '../types';
import type { Connector } from '../connector-utils';
import { getTemplateById, type TemplateDefinition } from './registry';

export type PrerequisiteCheckResult = {
  templateId: string;
  template: TemplateDefinition | null;
  canUse: boolean;
  missingRequired: ConnectorType[];
  availableRequired: ConnectorType[];
  availableOptional: ConnectorType[];
  missingOptional: ConnectorType[];
  totalRequiredConnected: number;
  totalRequiredNeeded: number;
  completionPercentage: number;
};

export type ConnectorConnectionState = {
  type: ConnectorType;
  isConnected: boolean;
  isEnabled: boolean;
  displayName?: string;
  connectionId?: string;
};

/**
 * Check if a user meets the prerequisites for using a specific template
 */
export function checkTemplatePrerequisites(
  templateId: string,
  userConnectors: Connector[]
): PrerequisiteCheckResult {
  const template = getTemplateById(templateId);

  if (!template) {
    return {
      templateId,
      template: null,
      canUse: false,
      missingRequired: [],
      availableRequired: [],
      availableOptional: [],
      missingOptional: [],
      totalRequiredConnected: 0,
      totalRequiredNeeded: 0,
      completionPercentage: 0,
    };
  }

  // Get connectors that are both connected and enabled
  const enabledConnectorTypes = userConnectors
    .filter(connector => connector.isConnected && connector.enabled !== false)
    .map(connector => connector.type);

  // Check required connectors
  const availableRequired = template.requiredConnectors.filter(type =>
    enabledConnectorTypes.includes(type)
  );

  const missingRequired = template.requiredConnectors.filter(type =>
    !enabledConnectorTypes.includes(type)
  );

  // Check optional connectors
  const availableOptional = (template.optionalConnectors || []).filter(type =>
    enabledConnectorTypes.includes(type)
  );

  const missingOptional = (template.optionalConnectors || []).filter(type =>
    !enabledConnectorTypes.includes(type)
  );

  const totalRequiredNeeded = template.requiredConnectors.length;
  const totalRequiredConnected = availableRequired.length;
  const completionPercentage = totalRequiredNeeded > 0
    ? Math.round((totalRequiredConnected / totalRequiredNeeded) * 100)
    : 100;

  return {
    templateId,
    template,
    canUse: missingRequired.length === 0,
    missingRequired,
    availableRequired,
    availableOptional,
    missingOptional,
    totalRequiredConnected,
    totalRequiredNeeded,
    completionPercentage,
  };
}

/**
 * Get the connection state for all connectors relevant to a template
 */
export function getTemplateConnectorStates(
  templateId: string,
  userConnectors: Connector[]
): ConnectorConnectionState[] {
  const template = getTemplateById(templateId);
  if (!template) return [];

  const allRelevantConnectors = [
    ...template.requiredConnectors,
    ...(template.optionalConnectors || [])
  ];

  return allRelevantConnectors.map(type => {
    const connector = userConnectors.find(c => c.type === type);

    return {
      type,
      isConnected: connector?.isConnected ?? false,
      isEnabled: connector?.enabled ?? true,
      displayName: connector?.displayName,
      connectionId: connector?.connectionId,
    };
  });
}

/**
 * Check prerequisites for multiple templates at once
 */
export function checkMultipleTemplatePrerequisites(
  templateIds: string[],
  userConnectors: Connector[]
): Record<string, PrerequisiteCheckResult> {
  const results: Record<string, PrerequisiteCheckResult> = {};

  for (const templateId of templateIds) {
    results[templateId] = checkTemplatePrerequisites(templateId, userConnectors);
  }

  return results;
}

/**
 * Get templates that the user can currently use (all prerequisites met)
 */
export function getUsableTemplates(
  templateIds: string[],
  userConnectors: Connector[]
): string[] {
  return templateIds.filter(templateId => {
    const result = checkTemplatePrerequisites(templateId, userConnectors);
    return result.canUse;
  });
}

/**
 * Get templates that the user is partially ready for (some but not all prerequisites met)
 */
export function getPartiallyReadyTemplates(
  templateIds: string[],
  userConnectors: Connector[]
): string[] {
  return templateIds.filter(templateId => {
    const result = checkTemplatePrerequisites(templateId, userConnectors);
    return !result.canUse && result.totalRequiredConnected > 0;
  });
}

/**
 * Get templates that the user hasn't started setting up (no prerequisites met)
 */
export function getNotStartedTemplates(
  templateIds: string[],
  userConnectors: Connector[]
): string[] {
  return templateIds.filter(templateId => {
    const result = checkTemplatePrerequisites(templateId, userConnectors);
    return !result.canUse && result.totalRequiredConnected === 0;
  });
}

/**
 * Generate a user-friendly description of what's needed for a template
 */
export function getPrerequisiteDescription(result: PrerequisiteCheckResult): string {
  if (!result.template) {
    return 'Template not found';
  }

  if (result.canUse) {
    const optionalCount = result.availableOptional.length;
    const totalOptional = result.missingOptional.length + optionalCount;

    if (optionalCount > 0 && totalOptional > optionalCount) {
      return `Ready to use! You have ${result.totalRequiredConnected} required connections. Consider connecting ${result.missingOptional.length} more optional tools for enhanced functionality.`;
    }
    return `Ready to use! You have all ${result.totalRequiredConnected} required connections.`;
  }

  if (result.totalRequiredConnected === 0) {
    return `Connect ${result.missingRequired.length} required ${result.missingRequired.length === 1 ? 'tool' : 'tools'}: ${result.missingRequired.join(', ')}`;
  }

  return `${result.totalRequiredConnected}/${result.totalRequiredNeeded} connections ready. Still need: ${result.missingRequired.join(', ')}`;
}

/**
 * Generate URL for connecting missing connectors with return path to template
 */
export function generateConnectionUrl(
  connectorType: ConnectorType,
  templateId: string,
  returnPath?: string
): string {
  const baseUrl = '/settings/connectors';
  const params = new URLSearchParams({
    connect: connectorType,
    template: templateId,
  });

  if (returnPath) {
    params.set('return', returnPath);
  }

  return `${baseUrl}?${params.toString()}`;
}