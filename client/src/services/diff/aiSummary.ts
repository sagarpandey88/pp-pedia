import { SolutionDiffResult, BreakingChangeItem } from '../../types/diff';
import { AISettings, getActiveAIProvider } from '../generator/docGenerator';
import { TokenUsage } from '../../types/solution';
import { GoogleGenAI } from '@google/genai';

/**
 * Builds an LLM prompt summarizing key metrics and component changes for executive release notes.
 */
function buildExecutivePrompt(diff: SolutionDiffResult): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a Principal Microsoft Power Platform Solution Architect and ALM Release Engineer.
Your task is to analyze the difference between two versions of a Power Platform solution and write a concise, professional Executive Release Summary & Impact Analysis.
Use GitHub Flavored Markdown with emojis, clean tables, bullet points, and warning callouts (> [!WARNING]).
Focus heavily on breaking changes, blast radius, security impact, and deployment considerations.`;

  const breakingCount = diff.breakingChanges.filter((b) => b.severity === 'breaking').length;
  const warningCount = diff.breakingChanges.filter((b) => b.severity === 'warning').length;

  const userPrompt = `Compare Power Platform Solution:
- Base Version: ${diff.baseMetadata.display_name} v${diff.baseMetadata.version} (${diff.baseMetadata.is_managed ? 'Managed' : 'Unmanaged'})
- Target Version: ${diff.targetMetadata.display_name} v${diff.targetMetadata.version} (${diff.targetMetadata.is_managed ? 'Managed' : 'Unmanaged'})
- Compared At: ${diff.comparedAt}

Diff Statistics:
- Added Components: ${diff.metrics.addedCount}
- Modified Components: ${diff.metrics.modifiedCount}
- Removed Components: ${diff.metrics.removedCount}
- Unchanged Components: ${diff.metrics.unchangedCount}
- Detected Breaking Changes: ${breakingCount}
- Warnings / Non-breaking risks: ${warningCount}

Key Component Updates:
- Tables / Entities:
${diff.entities
  .filter((e) => e.status !== 'unchanged')
  .map(
    (e) =>
      `  * [${e.status.toUpperCase()}] ${e.display_name} (${e.logical_name}): +${e.addedAttributesCount} cols, -${e.removedAttributesCount} cols, ~${e.modifiedAttributesCount} cols`
  )
  .join('\n') || '  * None'}

- Cloud Flows:
${diff.flows
  .filter((f) => f.status !== 'unchanged')
  .map(
    (f) =>
      `  * [${f.status.toUpperCase()}] ${f.display_name}: +${f.addedActionsCount} actions, -${f.removedActionsCount} actions, ~${f.modifiedActionsCount} actions${
        f.addedConnectors.length ? `, added connectors: ${f.addedConnectors.join(', ')}` : ''
      }${f.removedConnectors.length ? `, removed connectors: ${f.removedConnectors.join(', ')}` : ''}`
  )
  .join('\n') || '  * None'}

- Canvas Apps:
${diff.canvasApps
  .filter((a) => a.status !== 'unchanged')
  .map(
    (a) =>
      `  * [${a.status.toUpperCase()}] ${a.display_name}: +${a.addedScreens.length} screens, -${a.removedScreens.length} screens`
  )
  .join('\n') || '  * None'}

- Environment Variables:
${diff.envVars
  .filter((v) => v.status !== 'unchanged')
  .map((v) => `  * [${v.status.toUpperCase()}] ${v.display_name} (${v.schema_name})`)
  .join('\n') || '  * None'}

- Web Resources / Scripts:
${diff.webResources
  .filter((w) => w.status !== 'unchanged')
  .map(
    (w) =>
      `  * [${w.status.toUpperCase()}] ${w.name} (${w.resource_type}): size delta ${w.sizeDeltaBytes} bytes${
        w.deprecatedXrmIntroduced ? ' [CRITICAL: Uses deprecated Xrm]' : ''
      }${w.directDomIntroduced ? ' [CRITICAL: Uses direct DOM]' : ''}`
  )
  .join('\n') || '  * None'}

- Security Roles:
${diff.securityRoles
  .filter((s) => s.status !== 'unchanged')
  .map(
    (s) =>
      `  * [${s.status.toUpperCase()}] ${s.name}: ${s.tablePrivilegeDiffs.length} table privilege changes${
        s.isBreaking ? ' [CRITICAL: Privilege downgrade]' : ''
      }`
  )
  .join('\n') || '  * None'}

Detected Risk Items & Breaking Changes:
${diff.breakingChanges
  .map(
    (b) =>
      `- [${b.severity.toUpperCase()}] ${b.title}: ${b.description}\n  Impact: ${b.impactAssessment}`
  )
  .join('\n') || '- None detected'}

Structure your response with:
## 📋 Executive Release Summary
Brief overview of what this version update represents (feature addition, refactoring, patch, schema overhaul).

## 🚨 Breaking Changes & High Risk Items
Detailed callouts for any deleted tables, removed/tightened columns, flow trigger changes, or security downgrades. If none, state that the release maintains backward compatibility.

## ⚡ Automation & Business Logic Changes
Summary of flow, business rule, and script changes with risk assessment.

## 🔒 Data Model & Security Evolution
Summary of tables, relationships, option sets, and permission changes.

## 🚀 ALM & Deployment Recommendations
Actionable deployment steps (e.g. pre-deployment checks, environment variable values to configure, rollback precautions).`;

  return { systemPrompt, userPrompt };
}

/**
 * Generates an executive diff summary using OpenAI or Google Gemini.
 */
export async function generateExecutiveDiffSummary(
  diff: SolutionDiffResult,
  settings: AISettings,
  onTokenUsage?: (usage: TokenUsage) => void
): Promise<string> {
  const provider = getActiveAIProvider(settings);
  if (provider === 'offline') {
    return generateDeterministicSummary(diff);
  }

  const { systemPrompt, userPrompt } = buildExecutivePrompt(diff);

  if (provider === 'google') {
    const ai = new GoogleGenAI({ apiKey: settings.googleApiKey });
    const response = await ai.models.generateContent({
      model: settings.googleModel || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      },
    });

    if (response?.usageMetadata) {
      onTokenUsage?.({
        promptTokens: response.usageMetadata.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata.totalTokenCount ?? 0,
        requests: 1,
      });
    }

    return response.text || generateDeterministicSummary(diff);
  }

  if (provider === 'openai') {
    const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    if (data?.usage) {
      onTokenUsage?.({
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
        requests: 1,
      });
    }

    return data.choices?.[0]?.message?.content || generateDeterministicSummary(diff);
  }

  return generateDeterministicSummary(diff);
}

/**
 * Generates an on-demand contextual explanation for a single component difference.
 */
export async function explainComponentDiffWithAI(
  componentType: string,
  componentDiff: any,
  settings: AISettings
): Promise<string> {
  const provider = getActiveAIProvider(settings);
  if (provider === 'offline') {
    return `*AI is currently in Offline mode. Configure an API key in Settings to receive on-demand semantic explanations.*`;
  }

  const systemPrompt = `You are a Power Platform technical expert. Explain the changes made to the following ${componentType} in simple, developer-friendly terms. Highlight why the change matters and what risks or benefits it brings.`;
  const userPrompt = `Component Type: ${componentType}
Component Diff Details:
${JSON.stringify(componentDiff, null, 2)}

Provide a concise 2-3 paragraph explanation covering:
1. What exactly changed.
2. The runtime or architectural consequence of this change.
3. Verification/testing recommendation.`;

  if (provider === 'google') {
    const ai = new GoogleGenAI({ apiKey: settings.googleApiKey });
    const response = await ai.models.generateContent({
      model: settings.googleModel || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      },
    });
    return response.text || 'No explanation generated.';
  }

  if (provider === 'openai') {
    const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No explanation generated.';
  }

  return 'AI Provider not configured.';
}

/**
 * Fallback deterministic summary generator when running offline without LLM keys.
 */
export function generateDeterministicSummary(diff: SolutionDiffResult): string {
  const breakingList = diff.breakingChanges.filter((b) => b.severity === 'breaking');
  const warningList = diff.breakingChanges.filter((b) => b.severity === 'warning');

  return `## 📊 Solution Version Comparison (Deterministic Summary)

> **Comparing:** \`${diff.baseMetadata.display_name} (v${diff.baseMetadata.version})\` ➔ \`${diff.targetMetadata.display_name} (v${diff.targetMetadata.version})\`  
> **Package Type:** Base is ${diff.baseMetadata.is_managed ? 'Managed' : 'Unmanaged'}, Target is ${diff.targetMetadata.is_managed ? 'Managed' : 'Unmanaged'}.

---

### 📈 Component Inventory Delta
| Status | Count | Description |
| :--- | :--- | :--- |
| 🟢 **Added** | **${diff.metrics.addedCount}** | Newly introduced tables, flows, apps, or resources |
| 🟡 **Modified** | **${diff.metrics.modifiedCount}** | Existing components with schema, action, or property changes |
| 🔴 **Removed** | **${diff.metrics.removedCount}** | Components deleted from the target solution |
| ⚪ **Unchanged** | **${diff.metrics.unchangedCount}** | Identical across both versions |

---

### 🚨 Breaking Changes & Potential Blockers (${breakingList.length})
${
  breakingList.length > 0
    ? breakingList
        .map(
          (b) =>
            `- 🔴 **${b.title}** (\`${b.componentIdentifier}\`)\n  - *Description:* ${b.description}\n  - *Impact:* ${b.impactAssessment}`
        )
        .join('\n')
    : '✅ **No breaking changes detected.** All existing tables, required columns, and roles appear compatible.'
}

---

### ⚠️ Warnings & Architectural Risks (${warningList.length})
${
  warningList.length > 0
    ? warningList
        .map(
          (w) =>
            `- 🟡 **${w.title}** (\`${w.componentIdentifier}\`)\n  - *Description:* ${w.description}\n  - *Impact:* ${w.impactAssessment}`
        )
        .join('\n')
    : '✅ **No architectural warnings flagged.**'
}

---

> [!TIP]
> **Enable AI for Deep Semantic Analysis**:
> Configure an OpenAI or Google Gemini API key in **Settings (⚙️)** to generate full executive release notes, automated changelogs, and on-demand component explanations.
`;
}

