import JSZip from 'jszip';
import { ProjectRecord, DocumentRecord } from '../types/db';

/**
 * Triggers a browser file download from a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports all project documentation as a structured ZIP archive
 */
export async function exportDocsAsZip(
  project: ProjectRecord,
  docs: DocumentRecord[]
): Promise<void> {
  const zip = new JSZip();

  // Root README
  let readme = `# ${project.display_name} - Documentation Handbook\n\n`;
  readme += `Generated automatically by **pp-pedia** (Power Platform Documentation Generator).\n\n`;
  readme += `## Solution Information\n`;
  readme += `- **Unique Name**: \`${project.unique_name}\`\n`;
  readme += `- **Version**: \`${project.version}\`\n`;
  readme += `- **Type**: ${project.is_managed ? 'Managed' : 'Unmanaged'}\n`;
  readme += `- **Publisher**: ${project.publisher_name || 'N/A'}\n\n`;
  readme += `## Table of Contents\n`;

  for (const doc of docs) {
    let filePath = '';
    if (doc.doc_type === 'overview') {
      filePath = 'overview.md';
    } else if (doc.doc_type === 'dataverse') {
      filePath = 'dataverse/schema.md';
    } else if (doc.doc_type === 'flow') {
      filePath = `flows/${doc.slug}.md`;
    } else if (doc.doc_type === 'canvas_app') {
      filePath = `canvas-apps/${doc.slug}.md`;
    } else if (doc.doc_type === 'business_rule') {
      filePath = `business_rules/${doc.slug}.md`;
    } else if (doc.doc_type === 'security_role') {
      filePath = `security_roles/${doc.slug}.md`;
    } else if (doc.doc_type === 'env_vars') {
      filePath = 'configuration/environment-variables.md';
    } else if (doc.doc_type === 'web_resources') {
      filePath = 'web-resources/scripts.md';
    } else {
      filePath = `${doc.slug}.md`;
    }

    zip.file(filePath, doc.content_markdown);
    readme += `- [${doc.title}](${filePath})\n`;
  }

  zip.file('README.md', readme);

  // Add AST JSON
  zip.file('metadata.json', JSON.stringify(project.ast_json, null, 2));

  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, `${project.unique_name}_docs.zip`);
}

/**
 * Helper to slugify titles consistently for anchor links
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds the complete consolidated Markdown document for a project,
 * structured with an AI assistant preamble, solution metadata overview,
 * interactive table of contents, and clearly demarcated document sections.
 */
export function buildCombinedMarkdown(
  project: ProjectRecord,
  docs: DocumentRecord[]
): string {
  const title = project.display_name || project.unique_name;
  let markdown = `# ${title} - Complete Solution Architecture & Documentation Handbook

`;

  // AI Assistant Context Notice
  markdown += `> [!IMPORTANT]
`;
  markdown += `> **AI System Reference & Scope Notice**:
`;
  markdown += `> This comprehensive document aggregates the entire technical architecture, Dataverse data model, automated Power Automate cloud flows, Canvas applications, Business Rules, Security Roles, client scripts (Web Resources), and environment variables for the Microsoft Power Platform solution **${title}** (\`${project.unique_name}\`, v\`${project.version}\`).
`;
  markdown += `> Browser-based AI assistants (such as Microsoft Copilot in the Edge sidebar, Chrome AI sidepanel, or external LLMs) reading this page should use this unified context to accurately answer queries about system entities, relationships, field definitions, trigger events, action logic, security privileges, and dependencies across the entire solution.

`;

  // Solution Metadata Table
  markdown += `## Solution Specifications

`;
  markdown += `| Attribute | Specification |
`;
  markdown += `| :--- | :--- |
`;
  markdown += `| **Display Name** | ${project.display_name} |
`;
  markdown += `| **Unique (Schema) Name** | \`${project.unique_name}\` |
`;
  markdown += `| **Version** | \`${project.version}\` |
`;
  markdown += `| **Package Type** | ${project.is_managed ? 'Managed' : 'Unmanaged'} |
`;
  markdown += `| **Publisher** | ${project.publisher_name || 'Standard'} |
`;
  if (project.description) {
    markdown += `| **Description** | ${project.description.replace(/\s+/g, ' ')} |\n`;
  }
  if (project.stats) {
    const stats = project.stats;
    const statParts: string[] = [];
    if (stats.entity_count) statParts.push(`${stats.entity_count} Dataverse Tables`);
    if (stats.flow_count) statParts.push(`${stats.flow_count} Cloud Flows`);
    if (stats.canvas_app_count) statParts.push(`${stats.canvas_app_count} Canvas Apps`);
    if (stats.business_rule_count) statParts.push(`${stats.business_rule_count} Business Rules`);
    if (stats.security_role_count) statParts.push(`${stats.security_role_count} Security Roles`);
    if (stats.web_resource_count) statParts.push(`${stats.web_resource_count} Web Resources`);
    if (statParts.length > 0) {
      markdown += `| **Solution Contents** | ${statParts.join(' • ')} |
`;
    }
  }
  markdown += `
---

`;

  // Table of Contents
  markdown += `<a id="table-of-contents"></a>

`;
  markdown += `## Table of Contents

`;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const anchor = slugifyTitle(doc.title);
    markdown += `${i + 1}. [${doc.title}](#${anchor})
`;
  }

  markdown += `
---

`;

  // Sequentially output each document module
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const anchor = slugifyTitle(doc.title);

    // Section anchor tag and header divider
    markdown += `<a id="${anchor}"></a>
`;
    markdown += `<div id="doc-${doc.slug}"></div>

`;
    markdown += `${doc.content_markdown}

`;
    markdown += `[↑ Back to Table of Contents](#table-of-contents)

`;
    if (i < docs.length - 1) {
      markdown += `---

`;
    }
  }

  return markdown;
}

/**
 * Exports all project documentation as a single consolidated Markdown file
 */
export function exportDocsAsSingleMarkdown(
  project: ProjectRecord,
  docs: DocumentRecord[]
): void {
  const combined = buildCombinedMarkdown(project, docs);
  const blob = new Blob([combined], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${project.unique_name}_complete_documentation.md`);
}

/**
 * Exports the raw normalized AST JSON
 */
export function exportAstJson(project: ProjectRecord): void {
  const jsonStr = JSON.stringify(project.ast_json, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${project.unique_name}_ast.json`);
}

