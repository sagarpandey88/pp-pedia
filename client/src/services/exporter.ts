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
    } else if (doc.doc_type === 'env_vars') {
      filePath = 'configuration/environment-variables.md';
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
 * Exports all project documentation as a single consolidated Markdown file
 */
export function exportDocsAsSingleMarkdown(
  project: ProjectRecord,
  docs: DocumentRecord[]
): void {
  let combined = `# ${project.display_name} - Solution Architecture & Documentation\n\n`;
  combined += `> **Unique Name**: \`${project.unique_name}\` | **Version**: \`${project.version}\` | **Package**: ${
    project.is_managed ? 'Managed' : 'Unmanaged'
  } | **Publisher**: ${project.publisher_name || 'Standard'}\n\n`;

  combined += `## Table of Contents\n\n`;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const anchor = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    combined += `${i + 1}. [${doc.title}](#${anchor})\n`;
  }

  combined += `\n---\n\n`;

  for (const doc of docs) {
    combined += `${doc.content_markdown}\n\n---\n\n`;
  }

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

