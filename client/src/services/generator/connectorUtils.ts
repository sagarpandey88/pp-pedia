/**
 * Utility functions for humanizing and formatting Power Platform connector identifiers
 * and connection references.
 */

import { ConnectionReference } from '../../types/solution';

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
