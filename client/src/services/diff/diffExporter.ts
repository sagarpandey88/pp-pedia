import { SolutionDiffResult } from '../../types/diff';
import { ProjectRecord } from '../../types/db';
import { downloadBlob } from '../exporter';

/**
 * Exports the diff report as a structured Markdown document.
 */
export function exportDiffAsMarkdown(
  baseProject: ProjectRecord,
  targetProject: ProjectRecord,
  diff: SolutionDiffResult,
  executiveSummary?: string
): void {
  const filename = `SOLUTION_DIFF_${diff.baseMetadata.unique_name}_v${diff.baseMetadata.version}_to_v${diff.targetMetadata.version}.md`;

  let md = `# Solution Version Diff: ${diff.baseMetadata.display_name}\n\n`;
  md += `**Base Version:** \`${diff.baseMetadata.display_name} v${diff.baseMetadata.version}\` (${diff.baseMetadata.is_managed ? 'Managed' : 'Unmanaged'})\n`;
  md += `**Target Version:** \`${diff.targetMetadata.display_name} v${diff.targetMetadata.version}\` (${diff.targetMetadata.is_managed ? 'Managed' : 'Unmanaged'})\n`;
  md += `**Compared On:** ${new Date(diff.comparedAt).toLocaleString()}\n\n`;

  if (executiveSummary) {
    md += `## Executive Summary & Analysis\n\n${executiveSummary}\n\n---\n\n`;
  }

  md += `## Component Metrics Summary\n\n`;
  md += `| Category | Count |\n| :--- | :--- |\n`;
  md += `| 🟢 Added Components | ${diff.metrics.addedCount} |\n`;
  md += `| 🟡 Modified Components | ${diff.metrics.modifiedCount} |\n`;
  md += `| 🔴 Removed Components | ${diff.metrics.removedCount} |\n`;
  md += `| ⚪ Unchanged Components | ${diff.metrics.unchangedCount} |\n`;
  md += `| 🚨 Breaking Changes Flagged | ${diff.metrics.breakingChangesCount} |\n\n`;

  if (diff.breakingChanges.length > 0) {
    md += `## 🚨 Breaking Changes & Potential Blockers\n\n`;
    for (const b of diff.breakingChanges) {
      md += `### ${b.severity === 'breaking' ? '🔴' : '🟡'} ${b.title}\n`;
      md += `- **Component**: \`${b.componentIdentifier}\`\n`;
      md += `- **Description**: ${b.description}\n`;
      md += `- **Impact**: ${b.impactAssessment}\n\n`;
    }
  }

  // Tables
  const changedEntities = diff.entities.filter((e) => e.status !== 'unchanged');
  if (changedEntities.length > 0) {
    md += `## 🗄️ Dataverse Tables Delta\n\n`;
    for (const ent of changedEntities) {
      md += `### [${ent.status.toUpperCase()}] ${ent.display_name} (\`${ent.logical_name}\`)\n`;
      if (ent.attributes.some((a) => a.status !== 'unchanged')) {
        md += `\n**Column Changes:**\n\n`;
        md += `| Column | Logical Name | Status | Details |\n| :--- | :--- | :--- | :--- |\n`;
        for (const a of ent.attributes.filter((a) => a.status !== 'unchanged')) {
          const details = a.propertyChanges.map((p) => `${p.propertyName}: ${p.baseValue} ➔ ${p.targetValue}`).join(', ') || a.breakingReason || '-';
          md += `| ${a.display_name} | \`${a.logical_name}\` | **${a.status.toUpperCase()}** | ${details} |\n`;
        }
        md += `\n`;
      }
    }
  }

  // Flows
  const changedFlows = diff.flows.filter((f) => f.status !== 'unchanged');
  if (changedFlows.length > 0) {
    md += `## ⚡ Cloud Flows Delta\n\n`;
    for (const fl of changedFlows) {
      md += `### [${fl.status.toUpperCase()}] ${fl.display_name}\n`;
      md += `- **Status**: ${fl.status}\n`;
      md += `- **Actions Added**: ${fl.addedActionsCount}, **Removed**: ${fl.removedActionsCount}, **Modified**: ${fl.modifiedActionsCount}\n`;
      if (fl.addedConnectors.length > 0) {
        md += `- **Added Connectors**: ${fl.addedConnectors.join(', ')}\n`;
      }
      if (fl.removedConnectors.length > 0) {
        md += `- **Removed Connectors**: ${fl.removedConnectors.join(', ')}\n`;
      }
      md += `\n`;
    }
  }

  // Web Resources
  const changedWRs = diff.webResources.filter((w) => w.status !== 'unchanged');
  if (changedWRs.length > 0) {
    md += `## 📜 Web Resources & Client Scripts Delta\n\n`;
    for (const wr of changedWRs) {
      md += `### [${wr.status.toUpperCase()}] ${wr.name} (${wr.resource_type})\n`;
      md += `- **Size Delta**: ${wr.sizeDeltaBytes > 0 ? `+${wr.sizeDeltaBytes}` : wr.sizeDeltaBytes} bytes\n`;
      if (wr.deprecatedXrmIntroduced) md += `- ⚠️ **Deprecated Xrm.Page detected!**\n`;
      if (wr.directDomIntroduced) md += `- ⚠️ **Direct DOM manipulation detected!**\n`;
      md += `\n`;
    }
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * Exports the diff report as a machine-readable JSON AST diff.
 */
export function exportDiffAsJson(
  baseProject: ProjectRecord,
  targetProject: ProjectRecord,
  diff: SolutionDiffResult
): void {
  const filename = `solution_diff_${diff.baseMetadata.unique_name}_v${diff.baseMetadata.version}_to_v${diff.targetMetadata.version}.json`;
  const jsonContent = JSON.stringify(diff, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, filename);
}

