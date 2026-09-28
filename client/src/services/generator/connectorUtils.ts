/**
 * Utility functions for humanizing and formatting Power Platform connector identifiers
 * and connection references.
 */

import { ConnectionReference, SolutionAST } from '../../types/solution';
import { cleanFlowDisplayName } from '../parser/solutionParser';

// Known Power Platform connector families and canonical brandings
const KNOWN_CONNECTOR_BRANDS: Record<string, string> = {
  commondataservice: 'Microsoft Dataverse (Common Data Service)',
  commondataserviceforapps: 'Microsoft Dataverse (Common Data Service)',
  dataverse: 'Microsoft Dataverse',
  office365: 'Office 365 Outlook',
  office365users: 'Office 365 Users',
  office365groups: 'Office 365 Groups',
  sharepointonline: 'SharePoint Online',
  teams: 'Microsoft Teams',
  excelonlinebusiness: 'Excel Online (Business)',
  sql: 'SQL Server',
  azureblob: 'Azure Blob Storage',
  servicebus: 'Azure Service Bus',
  approvals: 'Power Automate Approvals',
  planner: 'Microsoft Planner',
  onedriveforbusiness: 'OneDrive for Business',
  powerbi: 'Power BI',
  powerplatformcli: 'Power Platform CLI',
  wordonlinebusiness: 'Word Online (Business)',
  flow: 'Power Automate',
};

/**
 * Strips provider prefixes and path segments from a connector API ID.
 * e.g.:
 *  "/providers/Microsoft.PowerApps/apis/shared_office365" -> "office365"
 *  "shared_commondataserviceforapps" -> "commondataserviceforapps"
 */
export function extractBaseConnectorName(connectorId?: string): string {
  if (!connectorId) return '';
  return connectorId
    .split('/')
    .pop()!
    .replace(/^shared_/, '')
    .trim()
    .toLowerCase();
}

/**
 * Converts a raw connector identifier or internal name into a clean, human-readable title.
 * e.g.:
 *  "shared_office365" -> "Office 365 Outlook"
 *  "shared_azureblob" -> "Azure Blob Storage"
 *  "custom_invoice_processing_api" -> "Invoice Processing Api"
 */
export function humanizeConnectorName(connectorId?: string): string {
  if (!connectorId) return 'Default Connection';

  const base = extractBaseConnectorName(connectorId);
  if (!base) return 'Standard Connection';

  // Check known brand dictionary
  if (KNOWN_CONNECTOR_BRANDS[base]) {
    return KNOWN_CONNECTOR_BRANDS[base];
  }

  // Generic decomposition: split camelCase, underscores, hyphens, and digit boundaries
  const words = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9]+)/g, '$1 $2')
    .replace(/([0-9]+)([a-zA-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return base;

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Formats a ConnectionReference into a rich, self-describing documentation line.
 * Includes both human-readable branding and technical identifiers so that both
 * dense embeddings and full-text search match queries naturally.
 */
export function formatConnectionReference(ref: ConnectionReference): string {
  const friendlyName = humanizeConnectorName(ref.connector_id || ref.connection_type || ref.logical_name);
  const technicalId = ref.connector_id || ref.connection_type || 'standard';
  const logical = ref.logical_name;

  return `- **${friendlyName}** (\`${logical}\`): Connector ID \`${technicalId}\``;
}

export interface ConnectorSummaryItem {
  connectorName: string;
  flowCount: number;
  appCount: number;
  connectionReferences: string[];
}

/**
 * Aggregates connector usage across all Cloud Flows and Canvas Apps in the solution AST,
 * identifying flow counts, app counts, and associated connection references.
 */
export function extractConnectorsSummary(ast: SolutionAST): ConnectorSummaryItem[] {
  const map = new Map<
    string,
    {
      flows: Set<string>;
      apps: Set<string>;
      refs: Set<string>;
    }
  >();

  const getOrCreate = (name: string) => {
    let entry = map.get(name);
    if (!entry) {
      entry = {
        flows: new Set<string>(),
        apps: new Set<string>(),
        refs: new Set<string>(),
      };
      map.set(name, entry);
    }
    return entry;
  };

  // 1. From flows and their connection references
  for (const flow of ast.flows) {
    const flowIdentifier = cleanFlowDisplayName(flow.display_name || flow.name);

    if (flow.connection_references && flow.connection_references.length > 0) {
      for (const ref of flow.connection_references) {
        const connName = humanizeConnectorName(ref.connector_id || ref.connection_type || ref.logical_name);
        const entry = getOrCreate(connName);
        entry.flows.add(flowIdentifier);
        if (ref.logical_name) {
          entry.refs.add(ref.logical_name);
        }
      }
    }
  }

  // 2. From flow integrations (detected action API connections)
  if (ast.flow_integrations) {
    for (const int of ast.flow_integrations) {
      const connName = humanizeConnectorName(int.connector_id || int.connector_name);
      const entry = getOrCreate(connName);
      entry.flows.add(int.flow_name);
    }
  }

  // 3. From canvas apps data sources
  const entityNames = new Set(ast.entities.map((e) => e.logical_name.toLowerCase()));
  for (const app of ast.canvas_apps) {
    const appIdentifier = app.display_name || app.name;
    for (const ds of app.data_sources) {
      const dsLower = ds.toLowerCase();
      if (
        dsLower === 'common data service' ||
        dsLower === 'commondataservice' ||
        dsLower === 'dataverse' ||
        entityNames.has(dsLower)
      ) {
        const entry = getOrCreate('Microsoft Dataverse');
        entry.apps.add(appIdentifier);
      } else {
        const connName = humanizeConnectorName(ds);
        const entry = getOrCreate(connName);
        entry.apps.add(appIdentifier);
      }
    }
  }

  const results: ConnectorSummaryItem[] = [];
  for (const [name, data] of map.entries()) {
    results.push({
      connectorName: name,
      flowCount: data.flows.size,
      appCount: data.apps.size,
      connectionReferences: Array.from(data.refs).sort(),
    });
  }

  // Sort by flow count + app count descending
  results.sort((a, b) => b.flowCount + b.appCount - (a.flowCount + a.appCount));
  return results;
}

