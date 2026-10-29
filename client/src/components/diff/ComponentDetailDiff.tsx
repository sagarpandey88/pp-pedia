import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkle20Filled,
  Warning20Filled,
  Database20Regular,
  Flow20Regular,
  AppGeneric20Regular,
  Code20Regular,
  SlideSettings20Regular,
  Shield20Regular,
  Scales20Regular,
  FolderZip20Regular,
  Dismiss20Regular,
  Checkmark20Regular,
} from '@fluentui/react-icons';
import { Button, Badge, Spinner } from '@fluentui/react-components';
import { SolutionDiffResult } from '../../types/diff';
import { SelectedComponentInfo } from './ComponentDiffTree';
import { ActiveAIInfo, getAISettings } from '../../services/generator/docGenerator';
import { explainComponentDiffWithAI } from '../../services/diff/aiSummary';

interface ComponentDetailDiffProps {
  diff: SolutionDiffResult;
  selectedComponent: SelectedComponentInfo | null;
  aiInfo: ActiveAIInfo;
}

export const ComponentDetailDiff: React.FC<ComponentDetailDiffProps> = ({
  diff,
  selectedComponent,
  aiInfo,
}) => {
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  if (!selectedComponent) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center h-full shadow-lg">
        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
          <Database20Regular className="w-6 h-6" />
        </div>
        <h4 className="text-base font-semibold text-slate-200">No Component Selected</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Select any table, flow, script, app, or role from the Component Explorer on the left to inspect detailed schema, action, and code differences.
        </p>
      </div>
    );
  }

  const { category, id } = selectedComponent;

  // Find target item
  let itemData: any = null;
  let componentTitle = '';
  let componentTypeLabel = '';

  switch (category) {
    case 'entities':
      itemData = diff.entities.find((e) => e.logical_name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData ? `${itemData.display_name} (${itemData.logical_name})` : id;
      componentTypeLabel = 'Dataverse Table';
      break;
    case 'flows':
      itemData = diff.flows.find((f) => f.name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.display_name || id;
      componentTypeLabel = 'Cloud Flow';
      break;
    case 'canvasApps':
      itemData = diff.canvasApps.find((a) => a.name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.display_name || id;
      componentTypeLabel = 'Canvas App';
      break;
    case 'webResources':
      itemData = diff.webResources.find((w) => w.name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.display_name || itemData?.name || id;
      componentTypeLabel = `Web Resource (${itemData?.resource_type || 'Script'})`;
      break;
    case 'envVars':
      itemData = diff.envVars.find((v) => v.schema_name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.display_name || id;
      componentTypeLabel = 'Environment Variable';
      break;
    case 'securityRoles':
      itemData = diff.securityRoles.find((s) => s.name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.name || id;
      componentTypeLabel = 'Security Role';
      break;
    case 'businessRules':
      itemData = diff.businessRules.find((b) => b.id.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.name || id;
      componentTypeLabel = 'Business Rule';
      break;
    case 'optionSets':
      itemData = diff.optionSets.find((o) => o.name.toLowerCase() === id.toLowerCase());
      componentTitle = itemData?.display_name || id;
      componentTypeLabel = 'Option Set (Choice)';
      break;
  }

  if (!itemData) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center text-slate-400">
        Component data could not be found.
      </div>
    );
  }

  const handleExplainWithAI = async () => {
    setIsExplaining(true);
    setExplanationError(null);
    try {
      const settings = getAISettings();
      const explanation = await explainComponentDiffWithAI(componentTypeLabel, itemData, settings);
      setAiExplanation(explanation);
    } catch (err: any) {
      setExplanationError(err?.message || 'Failed to explain with AI.');
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col h-full overflow-hidden shadow-lg">
      {/* Detail Toolbar */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
              {componentTypeLabel}
            </span>
            <Badge
              appearance="filled"
              color={
                itemData.status === 'added'
                  ? 'success'
                  : itemData.status === 'removed'
                  ? 'danger'
                  : itemData.status === 'modified'
                  ? 'warning'
                  : 'informative'
              }
              size="small"
            >
              {itemData.status.toUpperCase()}
            </Badge>
            {itemData.isBreaking && (
              <Badge appearance="filled" color="danger" size="small">
                BREAKING
              </Badge>
            )}
          </div>
          <h3 className="text-base font-bold text-white mt-1 truncate" title={componentTitle}>
            {componentTitle}
          </h3>
        </div>

        {/* Explain with AI Button */}
        <div className="flex items-center gap-2">
          {aiInfo.provider !== 'offline' ? (
            <Button
              appearance="primary"
              size="small"
              icon={isExplaining ? <Spinner size="tiny" /> : <Sparkle20Filled />}
              disabled={isExplaining}
              onClick={handleExplainWithAI}
            >
              {isExplaining ? 'Analyzing...' : 'Explain with AI'}
            </Button>
          ) : (
            <span className="text-[11px] text-slate-500 italic">Configure AI key for semantic explanation</span>
          )}
        </div>
      </div>

      {/* AI Explanation Drawer (if generated) */}
      {aiExplanation && (
        <div className="p-4 bg-purple-950/20 border-b border-purple-500/30 text-xs text-purple-200 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold flex items-center gap-1.5 text-purple-300">
              <Sparkle20Filled className="w-3.5 h-3.5" />
              AI Component Analysis ({aiInfo.label})
            </span>
            <button
              onClick={() => setAiExplanation(null)}
              className="text-slate-400 hover:text-white"
            >
              <Dismiss20Regular className="w-4 h-4" />
            </button>
          </div>
          <div className="prose prose-invert prose-xs max-w-none leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {aiExplanation}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {explanationError && (
        <div className="p-3 bg-rose-950/30 border-b border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
          <span>{explanationError}</span>
          <button onClick={() => setExplanationError(null)} className="text-rose-400 hover:text-white">
            <Dismiss20Regular className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Breaking Reason Callout */}
        {itemData.isBreaking && itemData.breakingReason && (
          <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-3 flex items-start gap-2.5">
            <Warning20Filled className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-rose-200">Critical Breaking Change</div>
              <div className="text-xs text-rose-300 mt-0.5">{itemData.breakingReason}</div>
            </div>
          </div>
        )}

        {/* 1. Dataverse Table Detail */}
        {category === 'entities' && (
          <div className="space-y-6">
            {/* Columns Diff */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Attributes &amp; Columns ({itemData.attributes.length})
                </h4>
                <div className="text-xs text-slate-400 font-mono">
                  +{itemData.addedAttributesCount} / ~{itemData.modifiedAttributesCount} / -{itemData.removedAttributesCount}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Column</th>
                      <th className="py-2.5 px-3 font-semibold">Logical Name</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold">Type</th>
                      <th className="py-2.5 px-3 font-semibold">Required</th>
                      <th className="py-2.5 px-3 font-semibold">Changes / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {itemData.attributes.map((attr: any) => {
                      const typeChange = attr.propertyChanges.find((p: any) => p.propertyName === 'Type');
                      const reqChange = attr.propertyChanges.find((p: any) => p.propertyName === 'Required Level');

                      return (
                        <tr
                          key={attr.logical_name}
                          className={`hover:bg-slate-800/30 transition ${
                            attr.isBreaking ? 'bg-rose-950/15' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-medium text-slate-200">
                            {attr.display_name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {attr.logical_name}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                attr.status === 'added'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : attr.status === 'removed'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : attr.status === 'modified'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {attr.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {typeChange ? (
                              <span className="text-amber-300 font-mono">
                                {typeChange.baseValue} ➔ {typeChange.targetValue}
                              </span>
                            ) : (
                              attr.targetAttribute?.type || attr.baseAttribute?.type || '-'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {reqChange ? (
                              <span className="text-rose-300 font-mono">
                                {reqChange.baseValue} ➔ {reqChange.targetValue}
                              </span>
                            ) : (
                              attr.targetAttribute?.required_level || attr.baseAttribute?.required_level || 'None'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {attr.breakingReason ? (
                              <span className="text-rose-400 font-medium">{attr.breakingReason}</span>
                            ) : (
                              attr.propertyChanges
                                .map((p: any) => `${p.propertyName}: ${p.baseValue} ➔ ${p.targetValue}`)
                                .join(', ') || '-'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Relationships Diff */}
            {itemData.relationships.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Relationships ({itemData.relationships.length})
                </h4>
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Schema Name</th>
                        <th className="py-2 px-3 font-semibold">Type</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                        <th className="py-2 px-3 font-semibold">Target Entity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {itemData.relationships.map((rel: any) => (
                        <tr key={rel.schema_name}>
                          <td className="py-2 px-3 font-mono text-slate-200">{rel.schema_name}</td>
                          <td className="py-2 px-3 text-slate-300">{rel.relationship_type}</td>
                          <td className="py-2 px-3">
                            <span className="text-[10px] font-semibold text-slate-300">{rel.status}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-400">{rel.referencing_entity || rel.primary_entity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Cloud Flow Detail */}
        {category === 'flows' && (
          <div className="space-y-6">
            {/* Triggers Section */}
            {itemData.triggers.length > 0 && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Trigger Configuration
                </h4>
                {itemData.triggers.map((trig: any) => (
                  <div key={trig.name} className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-purple-300">{trig.name}</span>
                      <Badge appearance="tint" color={trig.status === 'modified' ? 'warning' : 'informative'}>
                        {trig.status}
                      </Badge>
                    </div>
                    {trig.propertyChanges.map((p: any) => (
                      <div key={p.propertyName} className="bg-slate-900 p-2 rounded border border-slate-800">
                        <span className="text-slate-400 font-semibold">{p.propertyName}: </span>
                        <span className="text-rose-300 font-mono">{p.baseValue}</span>
                        <span className="text-slate-500"> ➔ </span>
                        <span className="text-emerald-300 font-mono">{p.targetValue}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Connectors Section */}
            {(itemData.addedConnectors.length > 0 || itemData.removedConnectors.length > 0) && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Connectors Delta
                </h4>
                {itemData.addedConnectors.length > 0 && (
                  <div className="text-emerald-400">
                    <strong>+ Added Connectors: </strong> {itemData.addedConnectors.join(', ')}
                  </div>
                )}
                {itemData.removedConnectors.length > 0 && (
                  <div className="text-rose-400">
                    <strong>- Removed Connectors: </strong> {itemData.removedConnectors.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Flow Actions Diff */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Action Steps ({itemData.actions.length})
                </h4>
                <span className="text-xs font-mono text-slate-400">
                  +{itemData.addedActionsCount} / ~{itemData.modifiedActionsCount} / -{itemData.removedActionsCount}
                </span>
              </div>
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Action Name</th>
                      <th className="py-2 px-3 font-semibold">Type</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Modifications</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {itemData.actions.map((act: any) => (
                      <tr key={act.name} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-slate-200">{act.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{act.type}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              act.status === 'added'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : act.status === 'removed'
                                ? 'bg-rose-500/20 text-rose-300'
                                : act.status === 'modified'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {act.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {act.propertyChanges.map((p: any) => p.propertyName).join(', ') || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. Web Resource & Code Diff Detail */}
        {category === 'webResources' && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Resource Type:</span>
                <span className="font-semibold text-slate-200">{itemData.resource_type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Size Delta:</span>
                <span className="font-mono text-slate-200">
                  {itemData.sizeDeltaBytes >= 0 ? `+${itemData.sizeDeltaBytes}` : itemData.sizeDeltaBytes} bytes
                </span>
              </div>
              {itemData.deprecatedXrmIntroduced && (
                <div className="text-rose-400 font-semibold">
                  ⚠️ Deprecated Xrm.Page method calls were introduced in this script.
                </div>
              )}
              {itemData.directDomIntroduced && (
                <div className="text-rose-400 font-semibold">
                  ⚠️ Unsupported direct DOM manipulation was introduced in this script.
                </div>
              )}
            </div>

            {/* Line-by-line Code Diff */}
            {itemData.textDiffLines && itemData.textDiffLines.length > 0 ? (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Unified Code Diff ({itemData.textDiffLines.length} lines)
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-x-auto font-mono text-xs">
                  <div className="divide-y divide-slate-900">
                    {itemData.textDiffLines.map((line: any, idx: number) => {
                      const isAdd = line.type === 'added';
                      const isRem = line.type === 'removed';

                      return (
                        <div
                          key={idx}
                          className={`flex items-start px-2 py-0.5 leading-relaxed font-mono ${
                            isAdd
                              ? 'bg-emerald-950/30 text-emerald-300'
                              : isRem
                              ? 'bg-rose-950/30 text-rose-300'
                              : 'text-slate-400 hover:bg-slate-900/50'
                          }`}
                        >
                          <div className="w-8 flex-shrink-0 text-[10px] text-slate-600 select-none text-right pr-2">
                            {line.lineNumberBase || ''}
                          </div>
                          <div className="w-8 flex-shrink-0 text-[10px] text-slate-600 select-none text-right pr-2">
                            {line.lineNumberTarget || ''}
                          </div>
                          <div className="w-4 flex-shrink-0 font-bold select-none text-center">
                            {isAdd ? '+' : isRem ? '-' : ' '}
                          </div>
                          <pre className="flex-1 whitespace-pre-wrap font-mono text-xs overflow-x-auto">
                            {line.content || ' '}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic p-4 bg-slate-950/40 rounded-xl border border-slate-800 text-center">
                No text differences or script content available to compare.
              </div>
            )}
          </div>
        )}

        {/* 4. Canvas Apps Detail */}
        {category === 'canvasApps' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div>
                <div className="font-semibold text-slate-300 mb-1">Screens:</div>
                {itemData.addedScreens.length > 0 && (
                  <div className="text-emerald-400">+ Added: {itemData.addedScreens.join(', ')}</div>
                )}
                {itemData.removedScreens.length > 0 && (
                  <div className="text-rose-400">- Removed: {itemData.removedScreens.join(', ')}</div>
                )}
                {itemData.addedScreens.length === 0 && itemData.removedScreens.length === 0 && (
                  <div className="text-slate-400">No screen additions or removals.</div>
                )}
              </div>

              <div>
                <div className="font-semibold text-slate-300 mb-1">Data Sources:</div>
                {itemData.addedDataSources.length > 0 && (
                  <div className="text-emerald-400">+ Added: {itemData.addedDataSources.join(', ')}</div>
                )}
                {itemData.removedDataSources.length > 0 && (
                  <div className="text-rose-400">- Removed: {itemData.removedDataSources.join(', ')}</div>
                )}
                {itemData.addedDataSources.length === 0 && itemData.removedDataSources.length === 0 && (
                  <div className="text-slate-400">Data sources unchanged.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 5. Security Roles Detail */}
        {category === 'securityRoles' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Table Permissions Delta ({itemData.tablePrivilegeDiffs.length})
            </h4>
            {itemData.tablePrivilegeDiffs.length > 0 ? (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Table</th>
                      <th className="py-2 px-3 font-semibold">Privilege Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {itemData.tablePrivilegeDiffs.map((tPriv: any) => (
                      <tr key={tPriv.table}>
                        <td className="py-2.5 px-3 font-medium text-slate-200">{tPriv.table}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-2">
                            {tPriv.privilegeChanges.map((p: any) => (
                              <span
                                key={p.privilegeName}
                                className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                  p.isDowngrade
                                    ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
                                    : 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                                }`}
                              >
                                {p.privilegeName.toUpperCase()}: {p.baseLevel} ➔ {p.targetLevel}
                                {p.isDowngrade && ' (DOWNGRADE)'}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-400 p-4 bg-slate-950/40 rounded-xl border border-slate-800">
                Table privileges identical across both versions.
              </div>
            )}
          </div>
        )}

        {/* 6. Option Sets Detail */}
        {category === 'optionSets' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-slate-400 font-medium">
                Scope: <span className="text-slate-200">{itemData.is_global ? 'Global Choice' : 'Local Choice'}</span>
              </div>
              {itemData.addedOptions.length > 0 && (
                <div className="text-emerald-400">
                  <strong>+ Added Choices:</strong>{' '}
                  {itemData.addedOptions.map((o: any) => `${o.label} (${o.value})`).join(', ')}
                </div>
              )}
              {itemData.removedOptions.length > 0 && (
                <div className="text-rose-400">
                  <strong>- Removed Choices:</strong>{' '}
                  {itemData.removedOptions.map((o: any) => `${o.label} (${o.value})`).join(', ')}
                </div>
              )}
              {itemData.modifiedOptions.length > 0 && (
                <div className="text-amber-400">
                  <strong>~ Renamed Choices:</strong>{' '}
                  {itemData.modifiedOptions.map((m: any) => `${m.value}: ${m.baseLabel} ➔ ${m.targetLabel}`).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. Environment Variables Detail */}
        {category === 'envVars' && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Schema Name:</span>
              <span className="font-mono text-purple-300">{itemData.schema_name}</span>
            </div>
            {itemData.propertyChanges.map((p: any) => (
              <div key={p.propertyName} className="flex items-center justify-between">
                <span className="text-slate-400">{p.propertyName}:</span>
                <span className="font-mono text-amber-300">{p.baseValue} ➔ {p.targetValue}</span>
              </div>
            ))}
          </div>
        )}

        {/* 8. Business Rules Detail */}
        {category === 'businessRules' && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Associated Table:</span>
              <span className="font-mono text-slate-200">{itemData.table}</span>
            </div>
            {itemData.propertyChanges.map((p: any) => (
              <div key={p.propertyName} className="flex items-center justify-between">
                <span className="text-slate-400">{p.propertyName}:</span>
                <span className="font-mono text-amber-300">{p.baseValue} ➔ {p.targetValue}</span>
              </div>
            ))}
            {itemData.conditionsChanged && (
              <div className="text-amber-400">⚡ Rule conditions were modified.</div>
            )}
            {itemData.actionsChanged && (
              <div className="text-amber-400">⚡ Rule actions were modified.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

