import {
  CloudFlow,
  CanvasApp,
  ComponentDependency,
  FlowIntegration,
  FlowTriggerDetail,
  HardcodedLiteral,
  FormEventHandler,
} from '../../types/solution';

// Known premium connector patterns
const PREMIUM_CONNECTOR_PATTERNS = [
  'powerbi',
  'sql',
  'oracle',
  'sap',
  'salesforce',
  'http',
  'servicebus',
  'azureblob',
  'azurequeues',
  'commondataservice',
  'commondataserviceforapps',
  'dataverse',
  'custom',
];

export function isConnectorPremium(connectorId: string): boolean {
  const lower = connectorId.toLowerCase();
  return PREMIUM_CONNECTOR_PATTERNS.some((p) => lower.includes(p));
}

export function getFriendlyConnectorName(connectorId: string): string {
  const lower = connectorId.toLowerCase();
  if (lower.includes('powerbi')) return 'Power BI';
  if (lower.includes('commondataserviceforapps') || lower.includes('commondataservice') || lower.includes('dataverse')) {
    return 'Microsoft Dataverse';
  }
  if (lower.includes('office365') || lower.includes('office365users')) return 'Office 365 Users';
  if (lower.includes('sharepointonline') || lower.includes('sharepoint')) return 'SharePoint';
  if (lower.includes('teams')) return 'Microsoft Teams';
  if (lower.includes('sql')) return 'SQL Server';
  if (lower.includes('http')) return 'HTTP';
  if (lower.includes('excelonlinebusiness')) return 'Excel Online (Business)';
  if (lower.includes('approvals')) return 'Approvals';
  if (lower.includes('onedriveforbusiness')) return 'OneDrive for Business';

  // Fallback: extract last segment
  const parts = connectorId.split('/');
  return parts[parts.length - 1] || connectorId;
}

export interface ExtractedFlowData {
  dependencies: ComponentDependency[];
  integrations: FlowIntegration[];
  triggers: FlowTriggerDetail[];
  hardcodedLiterals: HardcodedLiteral[];
}

/**
 * Extracts Dataverse entity/column dependencies, connector integrations, trigger details,
 * and hardcoded values across all Cloud Flows in the solution.
 */
export function extractFlowDependencies(flows: CloudFlow[]): ExtractedFlowData {
  const dependencies: ComponentDependency[] = [];
  const integrations: FlowIntegration[] = [];
  const triggers: FlowTriggerDetail[] = [];
  const hardcodedLiterals: HardcodedLiteral[] = [];

  for (const flow of flows) {
    const flowName = flow.display_name || flow.name;

    // 1. Process Connection References
    const connMap = new Map<string, string>(); // refName -> connectorId
    for (const ref of flow.connection_references) {
      if (ref.logical_name && ref.connector_id) {
        connMap.set(ref.logical_name, ref.connector_id);
      }
    }

    // 2. Process Triggers
    for (const trig of flow.triggers) {
      const inputs = trig.inputs || {};
      const params = (inputs as any).parameters || {};
      const tableName = params.entityName || (inputs as any).entityName || undefined;
      const filterExpr = trig.filter_expression || params.filter || undefined;
      const hasFilter = Boolean(filterExpr && filterExpr.trim().length > 0);
      const selectCols = params.selectColumns
        ? String(params.selectColumns).split(',').map((s) => s.trim().toLowerCase())
        : undefined;

      triggers.push({
        id: `trig_${flow.id}_${trig.name}`,
        flow_id: flow.id,
        flow_name: flowName,
        trigger_type: trig.type || 'OpenApiConnection',
        table_name: tableName,
        change_type: (inputs as any).changeType || trig.kind,
        filter_expression: filterExpr,
        has_filter: hasFilter,
        select_columns: selectCols,
      });

      if (tableName) {
        // Table trigger dependency
        dependencies.push({
          id: `dep_flw_${flow.id}_trig_${dependencies.length}`,
          source_type: 'flow',
          source_id: flow.id,
          source_name: flowName,
          location_detail: `Trigger: ${trig.name}`,
          target_entity: tableName.toLowerCase(),
          operation_type: 'TRIGGER_FILTER',
          context_snippet: filterExpr ? `Filter: ${filterExpr}` : `Monitors ${tableName}`,
        });

        // Column-level trigger filter dependencies
        if (selectCols) {
          for (const col of selectCols) {
            dependencies.push({
              id: `dep_flw_${flow.id}_trig_${dependencies.length}`,
              source_type: 'flow',
              source_id: flow.id,
              source_name: flowName,
              location_detail: `Trigger: ${trig.name} (Select Column)`,
              target_entity: tableName.toLowerCase(),
              target_field: col,
              operation_type: 'TRIGGER_FILTER',
              context_snippet: `Trigger Select Column: ${col}`,
            });
          }
        }
      }
    }

    // 3. Process Actions Recursively
    const seenActions = new Set<string>();

    const analyzeAction = (action: any, parentName = '') => {
      const actionName = action.name || 'Action';
      const actionKey = `${flow.id}_${actionName}`;
      if (seenActions.has(actionKey)) return;
      seenActions.add(actionKey);

      const inputs = action.inputs || {};
      const host = inputs.host || {};
      const apiId =
        host.apiId ||
        (host.connectionReference ? connMap.get(host.connectionReference) : '') ||
        '';
      const operationId = host.operationId || action.type || '';

      // Check if this action uses a connector
      if (apiId || host.connectionReference) {
        const fullConnectorId = apiId || host.connectionReference || 'unknown';
        const friendlyName = getFriendlyConnectorName(fullConnectorId);
        const isPrem = isConnectorPremium(fullConnectorId);

        integrations.push({
          id: `int_${flow.id}_${integrations.length}`,
          flow_id: flow.id,
          flow_name: flowName,
          connector_id: fullConnectorId,
          connector_name: friendlyName,
          operation_id: operationId,
          action_name: actionName,
          is_premium: isPrem,
        });
      }

      // Check if action interacts with Dataverse
      const isDataverse =
        apiId.toLowerCase().includes('commondataservice') ||
        apiId.toLowerCase().includes('dataverse') ||
        operationId.toLowerCase().includes('record') ||
        operationId.toLowerCase().includes('entity');

      const params = inputs.parameters || {};
      const targetEntity = params.entityName || inputs.entityName;

      if (targetEntity && typeof targetEntity === 'string') {
        const entityLower = targetEntity.toLowerCase();
        let opType: ComponentDependency['operation_type'] = 'READ';
        const opLower = operationId.toLowerCase();

        if (opLower.includes('create') || opLower.includes('add') || opLower.includes('new')) {
          opType = 'WRITE';
        } else if (opLower.includes('update') || opLower.includes('patch') || opLower.includes('modify')) {
          opType = 'WRITE';
        } else if (opLower.includes('delete') || opLower.includes('remove')) {
          opType = 'DELETE';
        }

        // Table-level dependency
        dependencies.push({
          id: `dep_flw_${flow.id}_${dependencies.length}`,
          source_type: 'flow',
          source_id: flow.id,
          source_name: flowName,
          location_detail: `Action: ${actionName} (${operationId})`,
          target_entity: entityLower,
          operation_type: opType,
          context_snippet: `Operation: ${operationId}`,
        });

        // Field-level dependencies in payload
        const itemBody = params.item || params.record || {};
        if (typeof itemBody === 'object' && itemBody !== null) {
          for (const [fieldKey, fieldVal] of Object.entries(itemBody)) {
            if (fieldKey.startsWith('@')) continue;
            dependencies.push({
              id: `dep_flw_${flow.id}_${dependencies.length}`,
              source_type: 'flow',
              source_id: flow.id,
              source_name: flowName,
              location_detail: `Action: ${actionName} (Field write)`,
              target_entity: entityLower,
              target_field: fieldKey.toLowerCase(),
              operation_type: 'WRITE',
              context_snippet: `${fieldKey} = ${String(fieldVal).slice(0, 100)}`,
            });
          }
        }
      }

      // Scan action inputs for hardcoded GUIDs and URLs
      const jsonStr = JSON.stringify(inputs);
      const urlMatches = jsonStr.match(/https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+/g);
      if (urlMatches) {
        for (const u of urlMatches) {
          if (!u.includes('w3.org') && !u.includes('microsoft.com/schemas') && !u.includes('azure.com')) {
            hardcodedLiterals.push({
              id: `lit_flw_${flow.id}_${hardcodedLiterals.length}`,
              component_type: 'flow',
              component_name: flowName,
              literal_type: 'URL',
              value: u,
              code_context: `Action: ${actionName}`,
            });
          }
        }
      }

      const guidMatches = jsonStr.match(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g);
      if (guidMatches) {
        for (const g of guidMatches) {
          hardcodedLiterals.push({
            id: `lit_flw_${flow.id}_${hardcodedLiterals.length}`,
            component_type: 'flow',
            component_name: flowName,
            literal_type: 'GUID',
            value: g,
            code_context: `Action: ${actionName}`,
          });
        }
      }

      // Recurse into children
      if (action.children && Array.isArray(action.children)) {
        for (const child of action.children) analyzeAction(child, actionName);
      }
      if (action.else_actions && Array.isArray(action.else_actions)) {
        for (const child of action.else_actions) analyzeAction(child, `${actionName} (Else)`);
      }
      if (action.cases && typeof action.cases === 'object') {
        for (const [caseName, caseObj] of Object.entries<any>(action.cases)) {
          if (caseObj.actions && Array.isArray(caseObj.actions)) {
            for (const child of caseObj.actions) analyzeAction(child, `${actionName} (Case: ${caseName})`);
          }
        }
      }
    };

    for (const action of flow.actions) {
      analyzeAction(action);
    }
  }

  return { dependencies, integrations, triggers, hardcodedLiterals };
}

/**
 * Extracts Canvas App dependencies and hardcoded values from screens and controls.
 */
export function extractCanvasAppDependencies(
  apps: CanvasApp[]
): { dependencies: ComponentDependency[]; hardcodedLiterals: HardcodedLiteral[] } {
  const dependencies: ComponentDependency[] = [];
  const hardcodedLiterals: HardcodedLiteral[] = [];

  for (const app of apps) {
    const appName = app.display_name || app.name;

    // Data sources
    for (const ds of app.data_sources) {
      dependencies.push({
        id: `dep_app_${app.name}_${dependencies.length}`,
        source_type: 'canvas_app',
        source_id: app.name,
        source_name: appName,
        location_detail: `Data Source Connection`,
        target_entity: ds.toLowerCase(),
        operation_type: 'READ',
        context_snippet: `Data Source: ${ds}`,
      });
    }

    // Inspect screens
    for (const screen of app.screens) {
      for (const ctrl of screen.controls) {
        if (ctrl.properties) {
          for (const [propName, propVal] of Object.entries(ctrl.properties)) {
            const valStr = String(propVal);

            // Check for Patch(Entity, ...)
            const patchMatch = valStr.match(/Patch\(\s*([A-Za-z0-9_]+)/i);
            if (patchMatch) {
              dependencies.push({
                id: `dep_app_${app.name}_${dependencies.length}`,
                source_type: 'canvas_app',
                source_id: app.name,
                source_name: appName,
                location_detail: `Screen: ${screen.name} > Control: ${ctrl.name}.${propName}`,
                target_entity: patchMatch[1].toLowerCase(),
                operation_type: 'WRITE',
                context_snippet: valStr.slice(0, 150),
              });
            }

            // Check for SubmitForm(...)
            const formMatch = valStr.match(/SubmitForm\(\s*([A-Za-z0-9_]+)/i);
            if (formMatch) {
              dependencies.push({
                id: `dep_app_${app.name}_${dependencies.length}`,
                source_type: 'canvas_app',
                source_id: app.name,
                source_name: appName,
                location_detail: `Screen: ${screen.name} > Control: ${ctrl.name}.${propName}`,
                target_entity: formMatch[1].toLowerCase(),
                operation_type: 'WRITE',
                context_snippet: valStr.slice(0, 150),
              });
            }

            // Check for hardcoded URLs
            const urlMatches = valStr.match(/https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+/g);
            if (urlMatches) {
              for (const u of urlMatches) {
                hardcodedLiterals.push({
                  id: `lit_app_${app.name}_${hardcodedLiterals.length}`,
                  component_type: 'canvas_app',
                  component_name: appName,
                  literal_type: 'URL',
                  value: u,
                  code_context: `${screen.name} > ${ctrl.name}.${propName}`,
                });
              }
            }
          }
        }
      }
    }
  }

  return { dependencies, hardcodedLiterals };
}

/**
 * Correlates form event handlers with JavaScript dependencies:
 * if a script dependency has target_entity = 'unknown_form_entity',
 * map it to the actual entity of the form where the script is registered!
 */
export function correlateFormEventDependencies(
  formHandlers: FormEventHandler[],
  jsDependencies: ComponentDependency[]
): ComponentDependency[] {
  const libraryToEntities = new Map<string, Set<string>>();

  for (const h of formHandlers) {
    if (h.library_name && h.entity_name) {
      const cleanLib = h.library_name.toLowerCase().replace(/^\$webresource:/i, '');
      if (!libraryToEntities.has(cleanLib)) {
        libraryToEntities.set(cleanLib, new Set());
      }
      libraryToEntities.get(cleanLib)!.add(h.entity_name.toLowerCase());
    }
  }

  const result: ComponentDependency[] = [];

  for (const dep of jsDependencies) {
    if (dep.target_entity === 'unknown_form_entity') {
      const cleanSource = dep.source_name.toLowerCase().replace(/^\/?webresources\//i, '');
      const entities = libraryToEntities.get(cleanSource);

      if (entities && entities.size > 0) {
        for (const ent of entities) {
          result.push({
            ...dep,
            id: `${dep.id}_${ent}`,
            target_entity: ent,
          });
        }
      } else {
        result.push(dep);
      }
    } else {
      result.push(dep);
    }
  }

  return result;
}
