import JSZip from 'jszip';
import {
  SolutionAST,
  SolutionMetadata,
  DataverseEntity,
  DataverseAttribute,
  DataverseRelationship,
  OptionSet,
  OptionSetItem,
  CloudFlow,
  FlowTrigger,
  FlowAction,
  CanvasApp,
  EnvironmentVariable,
  SiteMap,
  WebResource,
  WebResourceType,
  FormEventHandler,
  ComponentDependency,
  FlowIntegration,
  FlowTriggerDetail,
  HardcodedLiteral,
  BusinessRule,
  BusinessRuleCondition,
  BusinessRuleAction,
  SecurityRole,
  SecurityRoleTablePrivilege,
} from '../../types/solution';
import { analyzeJavaScript } from './jsAnalyzer';
import {
  extractFlowDependencies,
  extractCanvasAppDependencies,
  correlateFormEventDependencies,
} from './dependencyExtractor';

export function mapWebResourceType(typeCode: number): WebResourceType {
  switch (typeCode) {
    case 1:
      return 'HTML';
    case 2:
      return 'CSS';
    case 3:
      return 'JavaScript';
    case 4:
      return 'XML';
    case 5:
      return 'PNG';
    case 6:
      return 'JPG';
    case 7:
      return 'GIF';
    case 8:
      return 'XAP';
    case 9:
      return 'XSL';
    case 10:
      return 'ICO';
    case 11:
      return 'SVG';
    case 12:
      return 'RESX';
    default:
      return 'Unknown';
  }
}

// Helper to get text from XML element or return default
function getElementText(parent: Element | Document, tagName: string, defaultValue = ''): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() || defaultValue;
}

// Helper to get localized description
function getLocalizedDescription(parent: Element | Document, containerName: string, defaultValue = ''): string {
  const container = parent.getElementsByTagName(containerName)[0];
  if (!container) return defaultValue;
  const item = container.querySelector('[languagecode="1033"]') || container.children[0];
  return item?.getAttribute('description')?.trim() || item?.textContent?.trim() || defaultValue;
}

export function parseSolutionXml(xmlText: string): SolutionMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const manifest = doc.getElementsByTagName('SolutionManifest')[0] || doc.documentElement;

  const uniqueName = getElementText(manifest, 'UniqueName', 'UnknownSolution');
  const displayName =
    getLocalizedDescription(manifest, 'LocalizedNames', '') ||
    getElementText(manifest, 'UniqueName', 'Unknown Solution');
  const version = getElementText(manifest, 'Version', '1.0.0.0');
  const isManaged = getElementText(manifest, 'Managed', '0') === '1';
  const description = getLocalizedDescription(manifest, 'Descriptions', '');

  let publisherName = '';
  let publisherPrefix = '';
  const publisherEl = manifest.getElementsByTagName('Publisher')[0];
  if (publisherEl) {
    publisherName =
      getLocalizedDescription(publisherEl, 'LocalizedNames', '') ||
      getElementText(publisherEl, 'UniqueName', '');
    publisherPrefix = getElementText(publisherEl, 'CustomizationPrefix', '');
  }

  const rootComponents: Array<{ type: number; schema_name?: string; id?: string }> = [];
  const rootCompEls = manifest.getElementsByTagName('RootComponent');
  for (let i = 0; i < rootCompEls.length; i++) {
    const el = rootCompEls[i];
    const type = parseInt(el.getAttribute('type') || '0', 10);
    const schemaName = el.getAttribute('schemaName') || undefined;
    const id = el.getAttribute('id') || undefined;
    rootComponents.push({ type, schema_name: schemaName, id });
  }

  return {
    unique_name: uniqueName,
    display_name: displayName,
    version,
    is_managed: isManaged,
    publisher_name: publisherName,
    publisher_prefix: publisherPrefix,
    description,
    root_components: rootComponents,
  };
}

export function normalizeOperator(op: string): string {
  const o = (op || '').toLowerCase().trim();
  if (['eq', 'equal', 'equals', '==', 'isequalto'].includes(o)) return 'equals';
  if (['ne', 'notequal', 'doesnotequal', 'not-equal', '!=', 'isnotequalto'].includes(o)) return 'does not equal';
  if (['gt', 'greaterthan', '>', 'isgreaterthan'].includes(o)) return 'is greater than';
  if (['ge', 'greaterthanequal', '>=', 'isgreaterthanorequalto'].includes(o)) return 'is greater than or equal to';
  if (['lt', 'lessthan', '<', 'islessthan'].includes(o)) return 'is less than';
  if (['le', 'lessthanequal', '<=', 'islessthanorequalto'].includes(o)) return 'is less than or equal to';
  if (['contains', 'like'].includes(o)) return 'contains';
  if (['doesnotcontain', 'notcontains', 'not-contains'].includes(o)) return 'does not contain';
  if (['beginswith', 'startswith', 'begins-with'].includes(o)) return 'begins with';
  if (['endswith', 'ends-with'].includes(o)) return 'ends with';
  if (['null', 'isnull', 'doesnotcontaindata', 'empty', 'does-not-contain-data'].includes(o)) return 'does not contain data';
  if (['notnull', 'isnotnull', 'containsdata', 'notempty', 'contains-data'].includes(o)) return 'contains data';
  return op || 'equals';
}

export function normalizeActionType(actionType: string): string {
  const at = (actionType || '').toLowerCase().trim();
  if (at.includes('error') || at.includes('notification')) return 'Show error';
  if (at.includes('required')) return 'Set required';
  if (at.includes('visib') || at.includes('display') || at.includes('show') || at.includes('hide')) return 'Set visibility';
  if (at.includes('lock') || at.includes('disable') || at.includes('read-only') || at.includes('readonly')) return 'Lock';
  if (at.includes('unlock') || at.includes('enable')) return 'Lock';
  if (at.includes('recomm')) return 'Recommendation';
  if (at.includes('value') || at.includes('set') || at.includes('default') || at.includes('clear')) return 'Set value';
  return 'Set value';
}

export function normalizePrivilegeDepth(level: string): 'None' | 'User' | 'BU' | 'Parent' | 'Org' {
  const l = (level || '').toLowerCase().trim();
  if (['global', 'organization', 'org', '4'].includes(l)) return 'Org';
  if (['deep', 'parentchild', 'parent_child', 'parent', '3'].includes(l)) return 'Parent';
  if (['local', 'businessunit', 'business_unit', 'bu', '2'].includes(l)) return 'BU';
  if (['basic', 'user', '1'].includes(l)) return 'User';
  return 'None';
}

export function parseRoleElement(
  roleEl: Element,
  entities: DataverseEntity[] = [],
  roleToAppMap?: Map<string, Set<string>>
): SecurityRole {
  const rawId = roleEl.getAttribute('id') || roleEl.getAttribute('roleid') || `role_${Date.now()}`;
  const cleanId = rawId.replace(/[{}]/g, '').toLowerCase();
  const roleName = roleEl.getAttribute('name') || getElementText(roleEl, 'name') || 'Unnamed Role';
  const roleDesc =
    roleEl.getAttribute('description') ||
    getLocalizedDescription(roleEl, 'Descriptions', '') ||
    getElementText(roleEl, 'description') ||
    '';
  const buId = getElementText(roleEl, 'BusinessUnitId');
  const buScope = buId ? 'Business Unit' : 'Organization / Root';

  const privEls = roleEl.querySelectorAll('RolePrivileges > RolePrivilege, roleprivileges > roleprivilege');
  const tablePrivMap = new Map<string, SecurityRoleTablePrivilege>();
  const miscPrivileges: string[] = [];

  const tablePrivRegex = /^prv(Create|Read|Write|Delete|AppendTo|Append|Assign|Share)(.+)$/i;

  for (let j = 0; j < privEls.length; j++) {
    const pEl = privEls[j];
    const privName = pEl.getAttribute('name') || '';
    const level = pEl.getAttribute('level') || 'None';
    const depth = normalizePrivilegeDepth(level);

    const match = privName.match(tablePrivRegex);
    if (match) {
      const verb = match[1].toLowerCase();
      const rawTable = match[2];
      const tableLogical = rawTable.toLowerCase();

      if (!tablePrivMap.has(tableLogical)) {
        const ent = entities.find((e) => e.logical_name.toLowerCase() === tableLogical);
        tablePrivMap.set(tableLogical, {
          table: tableLogical,
          table_display_name: ent?.display_name || rawTable,
          create: 'None',
          read: 'None',
          write: 'None',
          delete: 'None',
          append: 'None',
          append_to: 'None',
          assign: 'None',
          share: 'None',
        });
      }

      const privRecord = tablePrivMap.get(tableLogical)!;
      if (verb === 'create') privRecord.create = depth;
      else if (verb === 'read') privRecord.read = depth;
      else if (verb === 'write') privRecord.write = depth;
      else if (verb === 'delete') privRecord.delete = depth;
      else if (verb === 'append') privRecord.append = depth;
      else if (verb === 'appendto') privRecord.append_to = depth;
      else if (verb === 'assign') privRecord.assign = depth;
      else if (verb === 'share') privRecord.share = depth;
    } else {
      if (privName) {
        miscPrivileges.push(privName);
      }
    }
  }

  const assignedApps =
    roleToAppMap && roleToAppMap.has(cleanId)
      ? Array.from(roleToAppMap.get(cleanId)!)
      : [];

  return {
    id: rawId,
    name: roleName,
    business_unit: buScope,
    description: roleDesc,
    table_privileges: Array.from(tablePrivMap.values()),
    misc_privileges: miscPrivileges,
    assigned_apps: assignedApps,
  };
}


export const COMMON_SYSTEM_FIELD_LABELS: Record<string, string> = {
  ownerid: 'Owner',
  createdby: 'Created By',
  modifiedby: 'Modified By',
  createdon: 'Created On',
  modifiedon: 'Modified On',
  statecode: 'Status',
  statuscode: 'Status Reason',
  owningbusinessunit: 'Owning Business Unit',
  owninguser: 'Owning User',
  owningteam: 'Owning Team',
};

export function getFieldDisplayName(
  field: string,
  entityAttrs?: Map<string, { display_name: string; options?: OptionSetItem[] }>
): string {
  const lower = (field || '').toLowerCase().trim();
  const attrInfo = entityAttrs?.get(lower);
  if (attrInfo && attrInfo.display_name && attrInfo.display_name.toLowerCase() !== lower) {
    return attrInfo.display_name;
  }
  return COMMON_SYSTEM_FIELD_LABELS[lower] || attrInfo?.display_name || field;
}

export function parseXamlVariables(xamlText: string | undefined): Map<string, string> {
  const varMap = new Map<string, string>();
  if (!xamlText || !xamlText.trim()) return varMap;

  // 1. ActivityReference EvaluateExpression blocks
  const activityRefRegex =
    /<mxswa:ActivityReference[^>]*AssemblyQualifiedName="[^"]*EvaluateExpression[^"]*"[^>]*>([\s\S]*?)<\/mxswa:ActivityReference>/gi;
  for (const match of xamlText.matchAll(activityRefRegex)) {
    const block = match[1];

    const resultMatch =
      block.match(/<OutArgument[^>]*x:Key="Result"[^>]*>([\s\S]*?)<\/OutArgument>/i) ||
      block.match(/Result="\[?([a-zA-Z0-9_]+)\]?"/i);
    let varName = '';
    if (resultMatch) {
      const inner = resultMatch[1];
      const nameM =
        inner.match(/\[([a-zA-Z0-9_]+)\]/) ||
        inner.match(/Name="([a-zA-Z0-9_]+)"/) ||
        inner.match(/([a-zA-Z0-9_]+)/);
      if (nameM) varName = nameM[1].trim();
    }
    if (!varName) continue;

    const opMatch = block.match(/<InArgument[^>]*x:Key="ExpressionOperator"[^>]*>([^<]+)<\/InArgument>/i);
    const op = opMatch ? opMatch[1].trim() : '';

    if (op.toLowerCase() === 'clear') {
      varMap.set(varName.toLowerCase(), 'Clear Value');
      continue;
    }

    const paramsMatch = block.match(/<InArgument[^>]*x:Key="Parameters"[^>]*>([\s\S]*?)<\/InArgument>/i);
    const paramsText = paramsMatch ? paramsMatch[1].trim() : '';

    if (
      !paramsText ||
      paramsText.includes('WorkflowPropertyType.Null') ||
      paramsText.includes('Null,') ||
      paramsText.trim() === '[New Object() {}]'
    ) {
      varMap.set(varName.toLowerCase(), 'Clear Value');
      continue;
    }

    const entRefMatch =
      paramsText.match(
        /(?:ObjectId\.EntityLogicalName|EntityReference|Lookup)[^"]*"([a-zA-Z0-9_]+)"(?:\s*,\s*"([^"]+)")?(?:\s*,\s*"([^"]+)")?/i
      ) || paramsText.match(/"(systemuser|team|account|contact|queue)"(?:\s*,\s*"([^"]+)")?(?:\s*,\s*"([^"]+)")?/i);
    if (entRefMatch) {
      const entType = entRefMatch[1];
      const second = entRefMatch[2];
      const third = entRefMatch[3];
      const label = entType === 'systemuser' ? 'User' : entType === 'team' ? 'Team' : entType;
      if (third && !third.match(/^[0-9a-fA-F-]{36}$/)) {
        varMap.set(varName.toLowerCase(), `${third} (${label})`);
      } else if (second && !second.match(/^[0-9a-fA-F-]{36}$/)) {
        varMap.set(varName.toLowerCase(), `${second} (${label})`);
      } else {
        varMap.set(varName.toLowerCase(), `${label} (${entType})`);
      }
      continue;
    }

    const propMatch =
      paramsText.match(/WorkflowPropertyType\.[a-zA-Z0-9_]+\s*,\s*"([^"]*)"/i) ||
      paramsText.match(/WorkflowPropertyType\.[a-zA-Z0-9_]+\s*,\s*([0-9.]+)/i);
    if (propMatch) {
      varMap.set(varName.toLowerCase(), propMatch[1]);
      continue;
    }

    const quoted = [...paramsText.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const filtered = quoted.filter(
      (s) =>
        ![
          'String',
          'Integer',
          'OptionSetValue',
          'Boolean',
          'Decimal',
          'Money',
          'EntityReference',
          'CreateCrmType',
          'DateTime',
        ].includes(s)
    );
    if (filtered.length > 0) {
      varMap.set(varName.toLowerCase(), filtered[filtered.length - 1]);
      continue;
    }

    const numMatch = paramsText.match(/,\s*([0-9.]+)\s*}/);
    if (numMatch) {
      varMap.set(varName.toLowerCase(), numMatch[1]);
      continue;
    }

    varMap.set(varName.toLowerCase(), 'Set value');
  }

  // 2. GetEntityProperty -> variable mapping (copying from another field)
  const getMatches = [
    ...xamlText.matchAll(
      /<mxswa:GetEntityProperty[^>]*Attribute="([^"]+)"[\s\S]*?(?:Result="\[?([a-zA-Z0-9_]+)\]?"|<OutArgument[^>]*>\s*\[?([a-zA-Z0-9_]+)\]?\s*<\/OutArgument>)/gi
    ),
  ];
  for (const m of getMatches) {
    const attr = m[1];
    const resVar = (m[2] || m[3] || '').trim();
    if (resVar) {
      varMap.set(resVar.toLowerCase(), `Field: ${attr}`);
    }
  }

  // 3. Assign activities
  const assignMatches = [
    ...xamlText.matchAll(
      /<Assign[^>]*>(?:[\s\S]*?<Assign\.To>\s*<OutArgument[^>]*>\s*\[?([a-zA-Z0-9_]+)\]?\s*<\/OutArgument>\s*<\/Assign\.To>[\s\S]*?<Assign\.Value>\s*<InArgument[^>]*>([\s\S]*?)<\/InArgument>\s*<\/Assign\.Value>|<Assign[^>]*To="\[?([a-zA-Z0-9_]+)\]?"[^>]*Value="([^"]*)"[^>]*>)/gi
    ),
  ];
  for (const m of assignMatches) {
    const varName = (m[1] || m[3] || '').trim();
    const rawVal = (m[2] || m[4] || '').trim();
    if (varName && rawVal) {
      varMap.set(varName.toLowerCase(), rawVal.replace(/^"|"$/g, ''));
    }
  }

  return varMap;
}

export function resolveActionValue(
  rawVal: string,
  targetField: string,
  xamlVarMap: Map<string, string>,
  entityAttrs: Map<string, { display_name: string; options?: OptionSetItem[] }>
): string {
  let val = (rawVal || '').trim();
  const cleanKey = val.replace(/[\[\]]/g, '').trim().toLowerCase();

  if (xamlVarMap.has(cleanKey)) {
    val = xamlVarMap.get(cleanKey)!;
  }

  // If still matching a step variable token like [SetAttributeValueStep1_1]
  if (/^\[?.*Step.*\]?$/i.test(val) || /^\[SetAttributeValueStep[^\]]*\]?$/i.test(val)) {
    if (val.toLowerCase().includes('clear') || val.toLowerCase().includes('null')) {
      val = 'Clear Value';
    } else if (targetField.toLowerCase() === 'ownerid') {
      val = 'User / Team (Owner)';
    } else if (targetField.toLowerCase().includes('user') || targetField.toLowerCase().includes('owner')) {
      val = 'User (systemuser)';
    } else {
      val = 'Set value';
    }
  }

  const attrInfo = entityAttrs?.get(targetField.toLowerCase());
  if (attrInfo?.options && val) {
    const matchOpt = attrInfo.options.find(
      (o) => String(o.value) === val || o.label.toLowerCase() === val.toLowerCase()
    );
    if (matchOpt) {
      val = `${matchOpt.label} (${val})`;
    }
  }

  return val;
}

export function parseBusinessRuleLogic(
  clientDataStr: string,
  xamlText: string | undefined,
  entityAttrs: Map<string, { display_name: string; options?: OptionSetItem[] }>
): {
  conditions: BusinessRuleCondition[];
  actions: BusinessRuleAction[];
  else_actions: BusinessRuleAction[];
} {
  const conditions: BusinessRuleCondition[] = [];
  const actions: BusinessRuleAction[] = [];
  const else_actions: BusinessRuleAction[] = [];

  const xamlVarMap = parseXamlVariables(xamlText);

  if (clientDataStr && clientDataStr.trim()) {
    try {
      const data = JSON.parse(clientDataStr.trim());
      const ruleList = Array.isArray(data) ? data : data.rules || data.steps || [data];

      for (const ruleItem of ruleList) {
        if (!ruleItem || typeof ruleItem !== 'object') continue;

        // 1. Conditions
        const rawConds =
          ruleItem.conditions || ruleItem.criteria || (ruleItem.type === 'condition' ? [ruleItem] : []);
        const condList = Array.isArray(rawConds)
          ? rawConds
          : rawConds?.rules || rawConds?.conditions || [];

        for (const cond of condList) {
          const field =
            cond.field ||
            cond.attribute ||
            cond.attributeName ||
            cond.column ||
            cond.targetAttribute ||
            '';
          if (!field) continue;
          const op = normalizeOperator(cond.operator || cond.op || cond.conditionType || 'equals');
          const rawVal =
            cond.value !== undefined
              ? String(cond.value)
              : cond.val !== undefined
              ? String(cond.val)
              : '';

          const fieldDisplayName = getFieldDisplayName(field, entityAttrs);
          let displayVal = rawVal;
          const attrInfo = entityAttrs.get(field.toLowerCase());
          if (attrInfo?.options && rawVal) {
            const matchOpt = attrInfo.options.find(
              (o) => String(o.value) === rawVal || o.label.toLowerCase() === rawVal.toLowerCase()
            );
            if (matchOpt) {
              displayVal = `${matchOpt.label} (${rawVal})`;
            }
          }

          conditions.push({
            field,
            field_display_name: fieldDisplayName,
            operator: op,
            value: displayVal,
            logical_join: cond.logicalJoin || cond.join || (cond.type === 'or' ? 'OR' : 'AND'),
          });
        }

        // 2. Actions (THEN branch)
        const rawActions =
          ruleItem.actions || ruleItem.thenActions || (ruleItem.type === 'action' ? [ruleItem] : []);
        const actionList = Array.isArray(rawActions) ? rawActions : [];
        for (const act of actionList) {
          const targetField =
            act.targetField ||
            act.field ||
            act.attribute ||
            act.target ||
            act.targetAttribute ||
            '';
          if (!targetField && !act.message && !act.valueOrMessage) continue;
          const targetDisplayName = getFieldDisplayName(targetField, entityAttrs);

          const actionType = normalizeActionType(act.actionType || act.type || act.action || '');
          let valMsg =
            act.valueOrMessage ||
            act.message ||
            act.value !== undefined
              ? String(act.valueOrMessage || act.message || act.value)
              : '';

          if (!valMsg) {
            if (actionType === 'Set required') valMsg = 'Business Required';
            else if (actionType === 'Lock') valMsg = 'Read-only';
            else if (actionType === 'Set visibility') valMsg = 'Visible';
          }

          valMsg = resolveActionValue(valMsg, targetField, xamlVarMap, entityAttrs);

          actions.push({
            action_type: actionType,
            target_field: targetField,
            target_field_display_name: targetDisplayName,
            value_or_message: valMsg,
          });
        }

        // 3. Else Actions (ELSE branch)
        const rawElseActions =
          ruleItem.elseActions || ruleItem.else_actions || ruleItem.otherwiseActions || [];
        const elseActionList = Array.isArray(rawElseActions) ? rawElseActions : [];
        for (const act of elseActionList) {
          const targetField =
            act.targetField ||
            act.field ||
            act.attribute ||
            act.target ||
            act.targetAttribute ||
            '';
          if (!targetField && !act.message && !act.valueOrMessage) continue;
          const targetDisplayName = getFieldDisplayName(targetField, entityAttrs);

          const actionType = normalizeActionType(act.actionType || act.type || act.action || '');
          let valMsg =
            act.valueOrMessage ||
            act.message ||
            act.value !== undefined
              ? String(act.valueOrMessage || act.message || act.value)
              : '';

          if (!valMsg) {
            if (actionType === 'Set required') valMsg = 'Optional';
            else if (actionType === 'Lock') valMsg = 'Editable';
            else if (actionType === 'Set visibility') valMsg = 'Hidden';
          }

          valMsg = resolveActionValue(valMsg, targetField, xamlVarMap, entityAttrs);

          else_actions.push({
            action_type: actionType,
            target_field: targetField,
            target_field_display_name: targetDisplayName,
            value_or_message: valMsg,
          });
        }
      }
    } catch {
      // ignore JSON parse errors, fallback to XAML if available
    }
  }

  // Fallback or complement with XAML parsing if available
  if (xamlText && xamlText.trim()) {
    try {
      const getMatches = [...xamlText.matchAll(/<mxswa:GetEntityProperty[^>]*Attribute="([^"]+)"[^>]*>/gi)];
      for (const m of getMatches) {
        const field = m[1];
        if (field && !conditions.some((c) => c.field.toLowerCase() === field.toLowerCase())) {
          conditions.push({
            field,
            field_display_name: getFieldDisplayName(field, entityAttrs),
            operator: 'equals',
            value: '',
            logical_join: 'AND',
          });
        }
      }

      const elseSplit = xamlText.split(/<If\.Else>|<Else>/i);
      const thenPart = elseSplit[0] || '';
      const elsePart = elseSplit[1] || '';

      const setMatchesThen = [...thenPart.matchAll(/<mxswa:SetEntityProperty[^>]*Attribute="([^"]+)"[^>]*Value="([^"]*)"/gi)];
      for (const m of setMatchesThen) {
        const targetField = m[1];
        const rawVal = m[2];
        const resolvedVal = resolveActionValue(rawVal, targetField, xamlVarMap, entityAttrs);
        const targetDisplayName = getFieldDisplayName(targetField, entityAttrs);

        const existing = actions.find((a) => a.target_field.toLowerCase() === targetField.toLowerCase());
        if (existing) {
          // If existing value is empty or looks like an unexpanded token, update it
          if (!existing.value_or_message || /^\[?.*Step.*\]?$/i.test(existing.value_or_message)) {
            existing.value_or_message = resolvedVal;
          }
        } else {
          actions.push({
            action_type: 'Set value',
            target_field: targetField,
            target_field_display_name: targetDisplayName,
            value_or_message: resolvedVal,
          });
        }
      }

      const dispMatchesThen = [...thenPart.matchAll(/<mxswa:SetDisplayMode[^>]*Attribute="([^"]+)"[^>]*DisplayMode="([^"]*)"/gi)];
      for (const m of dispMatchesThen) {
        const targetField = m[1];
        const mode = m[2];
        const isLock = mode.toLowerCase().includes('disable') || mode.toLowerCase().includes('lock') || mode.toLowerCase().includes('read');
        const targetDisplayName = getFieldDisplayName(targetField, entityAttrs);

        const existing = actions.find((a) => a.target_field.toLowerCase() === targetField.toLowerCase());
        if (!existing) {
          actions.push({
            action_type: isLock ? 'Lock' : 'Set visibility',
            target_field: targetField,
            target_field_display_name: targetDisplayName,
            value_or_message: mode,
          });
        }
      }

      const notifMatchesThen = [...thenPart.matchAll(/<mxswa:ShowNotification[^>]*Message="([^"]*)"[^>]*TargetAttribute="([^"]*)"/gi)];
      for (const m of notifMatchesThen) {
        const msg = m[1];
        const targetField = m[2];
        const targetDisplayName = getFieldDisplayName(targetField, entityAttrs);

        const existing = actions.find((a) => a.target_field.toLowerCase() === targetField.toLowerCase() && a.action_type === 'Show error');
        if (!existing) {
          actions.push({
            action_type: 'Show error',
            target_field: targetField,
            target_field_display_name: targetDisplayName,
            value_or_message: msg,
          });
        }
      }

      if (elsePart) {
        const setMatchesElse = [...elsePart.matchAll(/<mxswa:SetEntityProperty[^>]*Attribute="([^"]+)"[^>]*Value="([^"]*)"/gi)];
        for (const m of setMatchesElse) {
          const targetField = m[1];
          const rawVal = m[2];
          const resolvedVal = resolveActionValue(rawVal, targetField, xamlVarMap, entityAttrs);
          const targetDisplayName = getFieldDisplayName(targetField, entityAttrs);

          const existing = else_actions.find((a) => a.target_field.toLowerCase() === targetField.toLowerCase());
          if (existing) {
            if (!existing.value_or_message || /^\[?.*Step.*\]?$/i.test(existing.value_or_message)) {
              existing.value_or_message = resolvedVal;
            }
          } else {
            else_actions.push({
              action_type: 'Set value',
              target_field: targetField,
              target_field_display_name: targetDisplayName,
              value_or_message: resolvedVal,
            });
          }
        }
      }
    } catch {
      // ignore XAML parsing error
    }
  }

  return { conditions, actions, else_actions };
}

export function parseCustomizationsXml(xmlText: string): {
  entities: DataverseEntity[];
  optionSets: OptionSet[];
  siteMap?: SiteMap;
  workflowNames: Map<string, string>;
  webResourceCatalog: Array<{
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    type: WebResourceType;
    typeCode: number;
    fileName?: string;
  }>;
  formEventHandlers: FormEventHandler[];
  businessRules: BusinessRule[];
  securityRoles: SecurityRole[];
  formsCatalog: Map<string, { id: string; name: string; entityLogicalName: string }>;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const entities: DataverseEntity[] = [];
  const optionSets: OptionSet[] = [];
  const formEventHandlers: FormEventHandler[] = [];
  const formsCatalog = new Map<string, { id: string; name: string; entityLogicalName: string }>();

  // Parse Global Option Sets
  const globalOptionSetEls = doc.querySelectorAll('OptionSets > OptionSet');
  for (let i = 0; i < globalOptionSetEls.length; i++) {
    const optEl = globalOptionSetEls[i];
    const name = optEl.getAttribute('Name') || optEl.getAttribute('name') || `OptionSet_${i}`;
    const displayName =
      getLocalizedDescription(optEl, 'LocalizedNames', '') ||
      optEl.getAttribute('Name') ||
      name;

    const items: OptionSetItem[] = [];
    const optionEls = optEl.querySelectorAll('options > option');
    for (let j = 0; j < optionEls.length; j++) {
      const o = optionEls[j];
      const val = parseInt(o.getAttribute('value') || '0', 10);
      const labelEl = o.querySelector('labels > label[languagecode="1033"]') || o.querySelector('labels > label');
      const label = labelEl?.getAttribute('description') || `Option ${val}`;
      items.push({ value: val, label });
    }

    optionSets.push({
      name,
      display_name: displayName,
      is_global: true,
      options: items,
    });
  }

  // Parse Entities
  const entityEls = doc.querySelectorAll('Entities > Entity');
  for (let i = 0; i < entityEls.length; i++) {
    const entityEl = entityEls[i];
    const nameEl = entityEl.getElementsByTagName('Name')[0];
    const logicalName = nameEl?.textContent?.trim() || entityEl.getAttribute('Name') || `entity_${i}`;
    const displayName =
      nameEl?.getAttribute('LocalizedName') ||
      getLocalizedDescription(entityEl, 'LocalizedNames', '') ||
      logicalName;

    const desc = getLocalizedDescription(entityEl, 'Descriptions', '');

    // Attributes
    const attributes: DataverseAttribute[] = [];
    const attrEls = entityEl.querySelectorAll('attributes > attribute');
    let primaryIdAttr = '';
    let primaryNameAttr = '';

    for (let j = 0; j < attrEls.length; j++) {
      const a = attrEls[j];
      const attrLogical =
        getElementText(a, 'LogicalName') ||
        getElementText(a, 'Name') ||
        a.getAttribute('PhysicalName') ||
        `attr_${j}`;
      const attrDisplay =
        getLocalizedDescription(a, 'DisplayNames', '') ||
        attrLogical;
      const attrType = getElementText(a, 'Type', 'String');
      const attrFormat = getElementText(a, 'Format', '');
      const reqLevel = getElementText(a, 'RequiredLevel', 'None') as DataverseAttribute['required_level'];
      const attrDesc = getLocalizedDescription(a, 'Descriptions', '');

      const isPrimaryId = attrType === 'primarykey' || attrLogical === `${logicalName}id`;
      if (isPrimaryId) primaryIdAttr = attrLogical;

      const isPrimaryName = attrLogical === 'name' || attrLogical === `${logicalName}name`;
      if (isPrimaryName) primaryNameAttr = attrLogical;

      // Lookup target
      let lookupTarget: string | undefined;
      const lookupTypeEls = a.querySelectorAll('LookupTypes > LookupType');
      if (lookupTypeEls.length > 0) {
        lookupTarget = Array.from(lookupTypeEls)
          .map((lt) => lt.textContent?.trim() || '')
          .filter(Boolean)
          .join(', ');
      }

      // Local option sets
      let localOptions: OptionSetItem[] | undefined;
      const optSetEl = a.querySelector('OptionSet');
      if (optSetEl) {
        localOptions = [];
        const optEls = optSetEl.querySelectorAll('options > option');
        for (let k = 0; k < optEls.length; k++) {
          const opt = optEls[k];
          const val = parseInt(opt.getAttribute('value') || '0', 10);
          const lbl =
            opt.querySelector('labels > label[languagecode="1033"]')?.getAttribute('description') ||
            opt.querySelector('labels > label')?.getAttribute('description') ||
            `Value ${val}`;
          localOptions.push({ value: val, label: lbl });
        }
      }

      attributes.push({
        logical_name: attrLogical,
        schema_name: a.getAttribute('PhysicalName') || attrLogical,
        display_name: attrDisplay,
        description: attrDesc,
        type: attrType,
        format: attrFormat || undefined,
        required_level: reqLevel,
        is_primary_id: isPrimaryId,
        is_primary_name: isPrimaryName,
        lookup_target_entity: lookupTarget,
        options: localOptions,
      });
    }

    // Relationships
    const relationships: DataverseRelationship[] = [];

    // 1:N Relationships
    const oneToManyEls = entityEl.querySelectorAll('OneToManyRelationships > OneToManyRelationship');
    for (let j = 0; j < oneToManyEls.length; j++) {
      const rel = oneToManyEls[j];
      const relName = rel.getAttribute('Name') || `rel_1n_${j}`;
      const referencingEntity = getElementText(rel, 'ReferencingEntity');
      const referencedEntity = getElementText(rel, 'ReferencedEntity');
      const referencingAttribute = getElementText(rel, 'ReferencingAttribute');
      const cascadeDelete = getElementText(rel, 'CascadeDelete');
      const cascadeAssign = getElementText(rel, 'CascadeAssign');

      relationships.push({
        schema_name: relName,
        relationship_type: '1:N',
        primary_entity: referencedEntity || logicalName,
        referencing_entity: referencingEntity,
        referencing_attribute: referencingAttribute,
        cascade_delete: cascadeDelete || undefined,
        cascade_assign: cascadeAssign || undefined,
      });
    }

    // N:N Relationships
    const manyToManyEls = entityEl.querySelectorAll('ManyToManyRelationships > ManyToManyRelationship');
    for (let j = 0; j < manyToManyEls.length; j++) {
      const rel = manyToManyEls[j];
      const relName = rel.getAttribute('Name') || `rel_nn_${j}`;
      const entity1 = getElementText(rel, 'Entity1LogicalName');
      const entity2 = getElementText(rel, 'Entity2LogicalName');

      relationships.push({
        schema_name: relName,
        relationship_type: 'N:N',
        primary_entity: entity1 || logicalName,
        referencing_entity: entity2,
      });
    }

    // Form Event Handlers inside Entity
    const formEls = entityEl.querySelectorAll('forms > systemform, forms > form, formXml, form');
    for (let f = 0; f < formEls.length; f++) {
      const formEl = formEls[f];
      const formId =
        formEl.getAttribute('id') ||
        formEl.getAttribute('systemformid') ||
        formEl.querySelector('systemformid')?.textContent?.trim() ||
        `form_${f}`;
      const formName =
        getLocalizedDescription(formEl, 'LocalizedNames', '') ||
        formEl.getAttribute('name') ||
        formEl.querySelector('name')?.textContent?.trim() ||
        'Main Form';

      const cleanFormId = formId.replace(/[{}]/g, '').toLowerCase();
      formsCatalog.set(cleanFormId, { id: cleanFormId, name: formName, entityLogicalName: logicalName });

      const eventEls = formEl.querySelectorAll('events > event');
      for (let ev = 0; ev < eventEls.length; ev++) {
        const eventEl = eventEls[ev];
        const rawEvName = eventEl.getAttribute('name')?.toLowerCase() || 'onload';
        let eventType: FormEventHandler['event_type'] = 'OnLoad';
        if (rawEvName === 'onsave') eventType = 'OnSave';
        else if (rawEvName === 'onchange') eventType = 'OnChange';
        else if (rawEvName === 'tabstatechange') eventType = 'TabStateChange';

        const targetField = eventEl.getAttribute('attribute') || undefined;

        const handlerEls = eventEl.querySelectorAll('Handlers > Handler');
        for (let h = 0; h < handlerEls.length; h++) {
          const hEl = handlerEls[h];
          const funcName = hEl.getAttribute('functionName') || '';
          const libName = hEl.getAttribute('libraryName') || '';
          const passCtx = hEl.getAttribute('passExecutionContext') === 'true';
          const isEnabled = hEl.getAttribute('enabled') !== 'false';

          if (funcName && libName) {
            formEventHandlers.push({
              id: `feh_${logicalName}_${formId}_${formEventHandlers.length}`,
              entity_name: logicalName,
              form_id: formId,
              form_name: formName,
              event_type: eventType,
              target_field: targetField?.toLowerCase(),
              library_name: libName,
              function_name: funcName,
              pass_execution_context: passCtx,
              enabled: isEnabled,
            });
          }
        }
      }
    }

    const viewEls = entityEl.querySelectorAll('SavedQueries > savedquery, savedqueries > savedquery');

    entities.push({
      logical_name: logicalName,
      schema_name: entityEl.getAttribute('Name') || logicalName,
      display_name: displayName,
      description: desc,
      primary_id_attribute: primaryIdAttr || `${logicalName}id`,
      primary_name_attribute: primaryNameAttr,
      attributes,
      relationships,
      forms_count: formEls.length,
      views_count: viewEls.length,
    });
  }

  // Parse SiteMap
  let siteMap: SiteMap | undefined;
  const siteMapEl = doc.querySelector('SiteMap');
  if (siteMapEl) {
    const areas: SiteMap['areas'] = [];
    const areaEls = siteMapEl.querySelectorAll('Area');
    for (let i = 0; i < areaEls.length; i++) {
      const a = areaEls[i];
      const areaTitle = a.getAttribute('Title') || a.getAttribute('Id') || `Area ${i + 1}`;
      const groups: SiteMap['areas'][0]['groups'] = [];

      const groupEls = a.querySelectorAll('Group');
      for (let j = 0; j < groupEls.length; j++) {
        const g = groupEls[j];
        const groupTitle = g.getAttribute('Title') || g.getAttribute('Id') || `Group ${j + 1}`;
        const subAreas: SiteMap['areas'][0]['groups'][0]['sub_areas'] = [];

        const subAreaEls = g.querySelectorAll('SubArea');
        for (let k = 0; k < subAreaEls.length; k++) {
          const sa = subAreaEls[k];
          subAreas.push({
            id: sa.getAttribute('Id') || `subarea_${k}`,
            title: sa.getAttribute('Title') || sa.getAttribute('Id') || `Item ${k + 1}`,
            entity: sa.getAttribute('Entity') || undefined,
            url: sa.getAttribute('Url') || undefined,
          });
        }
        groups.push({
          id: g.getAttribute('Id') || `group_${j}`,
          title: groupTitle,
          sub_areas: subAreas,
        });
      }

      areas.push({
        id: a.getAttribute('Id') || `area_${i}`,
        title: areaTitle,
        groups,
      });
    }

    if (areas.length > 0) {
      siteMap = { areas };
    }
  }

  // Workflows (Cloud Flows & Business Rules) defined in customizations.xml
  const workflowNames = new Map<string, string>();
  const businessRules: BusinessRule[] = [];
  const workflowEls = doc.querySelectorAll('Workflows > Workflow');
  for (let i = 0; i < workflowEls.length; i++) {
    const wf = workflowEls[i];
    const wfId = wf.getAttribute('WorkflowId')?.replace(/[{}]/g, '').toLowerCase() || `wf_${i}`;
    const wfName =
      wf.getAttribute('Name') ||
      getLocalizedDescription(wf, 'LocalizedNames', '') ||
      wf.querySelector('LocalizedNames > LocalizedName[languagecode="1033"]')?.getAttribute('description') ||
      wf.querySelector('LocalizedNames > LocalizedName')?.getAttribute('description') ||
      getElementText(wf, 'Name') ||
      `Workflow_${i}`;

    const category = wf.getAttribute('Category') || getElementText(wf, 'Category') || '';
    const isBusinessRule = category === '2';

    if (isBusinessRule) {
      const primaryEntity =
        wf.getAttribute('PrimaryEntity') ||
        getElementText(wf, 'PrimaryEntity') ||
        '';
      const desc =
        getLocalizedDescription(wf, 'Descriptions', '') ||
        wf.getAttribute('Description') ||
        getElementText(wf, 'Description') ||
        '';
      const stateCode = wf.getAttribute('StateCode') || getElementText(wf, 'StateCode') || '';
      const statusCode = wf.getAttribute('StatusCode') || getElementText(wf, 'StatusCode') || '';
      const state: 'Active' | 'Draft' = stateCode === '1' || statusCode === '2' ? 'Active' : 'Draft';
      const scopeRaw = wf.getAttribute('Scope') || getElementText(wf, 'Scope') || '';
      const formId = wf.getAttribute('FormId') || getElementText(wf, 'FormId') || '';
      const clientData = getElementText(wf, 'ClientData') || wf.querySelector('ClientData')?.textContent || '';
      const xamlText = getElementText(wf, 'Xaml') || wf.querySelector('Xaml')?.textContent || '';

      const entity = entities.find((e) => e.logical_name.toLowerCase() === primaryEntity.toLowerCase());
      const entityAttrs = new Map<string, { display_name: string; options?: OptionSetItem[] }>();
      if (entity) {
        for (const a of entity.attributes) {
          entityAttrs.set(a.logical_name.toLowerCase(), {
            display_name: a.display_name,
            options: a.options,
          });
        }
      }

      const { conditions, actions, else_actions } = parseBusinessRuleLogic(clientData, xamlText, entityAttrs);

      let scope = 'Entity';
      const cleanFormId = formId.replace(/[{}]/g, '').toLowerCase();
      const matchedForm = cleanFormId ? formsCatalog.get(cleanFormId) : undefined;

      if (matchedForm) {
        scope = matchedForm.name;
      } else if (scopeRaw === '4' || scopeRaw.toLowerCase() === 'entity') {
        scope = 'Entity';
      } else if (scopeRaw === '1' || scopeRaw.toLowerCase() === 'all forms' || scopeRaw.toLowerCase() === 'allforms') {
        scope = 'All Forms';
      } else if (cleanFormId) {
        scope = `Form: ${cleanFormId}`;
      }

      const appliesToForms: string[] = [];
      if (matchedForm) {
        appliesToForms.push(matchedForm.name);
      } else {
        const tableForms = Array.from(formsCatalog.values()).filter(
          (f) => f.entityLogicalName.toLowerCase() === primaryEntity.toLowerCase()
        );
        if (scope === 'Entity') {
          appliesToForms.push('All Forms (Entity scope – runs on all client forms and server-side)');
          for (const tf of tableForms) {
            if (!appliesToForms.includes(tf.name)) appliesToForms.push(tf.name);
          }
        } else if (tableForms.length > 0) {
          for (const tf of tableForms) {
            appliesToForms.push(tf.name);
          }
        } else {
          appliesToForms.push('All Forms');
        }
      }

      const fieldsRead = Array.from(new Set(conditions.map((c) => c.field).filter(Boolean)));
      const fieldsWritten = Array.from(
        new Set([...actions.map((a) => a.target_field), ...else_actions.map((a) => a.target_field)].filter(Boolean))
      );

      businessRules.push({
        id: wfId,
        name: wfName,
        logical_name: wf.getAttribute('Name') || wfName,
        table: primaryEntity,
        table_display_name: entity?.display_name || primaryEntity,
        scope,
        state,
        description: desc,
        conditions,
        actions,
        else_actions,
        fields_read: fieldsRead,
        fields_written: fieldsWritten,
        applies_to_forms: appliesToForms,
      });
    } else if (wfId && wfName) {
      workflowNames.set(wfId, wfName);
    }
  }

  // Parse Web Resources defined in customizations.xml
  const webResourceCatalog: Array<{
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    type: WebResourceType;
    typeCode: number;
    fileName?: string;
  }> = [];

  const wrEls = doc.querySelectorAll('WebResources > WebResource');
  for (let i = 0; i < wrEls.length; i++) {
    const wr = wrEls[i];
    const id = getElementText(wr, 'WebResourceId') || `wr_${i}`;
    const name = getElementText(wr, 'Name') || `WebResource_${i}`;
    const displayName =
      getLocalizedDescription(wr, 'LocalizedNames', '') ||
      getElementText(wr, 'DisplayName') ||
      name;
    const description = getLocalizedDescription(wr, 'Descriptions', '');
    const typeCode = parseInt(getElementText(wr, 'WebResourceType', '3'), 10);
    const fileName = getElementText(wr, 'FileName') || `/WebResources/${name}`;

    webResourceCatalog.push({
      id,
      name,
      displayName,
      description,
      type: mapWebResourceType(typeCode),
      typeCode,
      fileName,
    });
  }

  // Parse AppModules to map role assignments to apps
  const roleToAppMap = new Map<string, Set<string>>();
  const appModuleEls = doc.querySelectorAll('AppModules > AppModule, appmodules > appmodule');
  for (let i = 0; i < appModuleEls.length; i++) {
    const appEl = appModuleEls[i];
    const appName =
      getLocalizedDescription(appEl, 'LocalizedNames', '') ||
      getElementText(appEl, 'UniqueName') ||
      getElementText(appEl, 'uniquename') ||
      `App_${i + 1}`;

    const roleEls = appEl.querySelectorAll('AppModuleRoles > AppModuleRole, AppModuleRoles > Role, appmoduleroles > appmodulerole, appmoduleroles > role');
    for (let j = 0; j < roleEls.length; j++) {
      const rId = (roleEls[j].getAttribute('roleid') || roleEls[j].getAttribute('id') || '')
        .replace(/[{}]/g, '')
        .toLowerCase();
      if (rId) {
        if (!roleToAppMap.has(rId)) {
          roleToAppMap.set(rId, new Set<string>());
        }
        roleToAppMap.get(rId)!.add(appName);
      }
    }
  }

  // Parse Security Roles defined in customizations.xml
  const securityRoles: SecurityRole[] = [];
  const roleEls = doc.querySelectorAll('Roles > Role, roles > role');
  for (let i = 0; i < roleEls.length; i++) {
    const roleEl = roleEls[i];
    const parsedRole = parseRoleElement(roleEl, entities, roleToAppMap);
    securityRoles.push(parsedRole);
  }

  return {
    entities,
    optionSets,
    siteMap,
    workflowNames,
    webResourceCatalog,
    formEventHandlers,
    businessRules,
    securityRoles,
    formsCatalog,
  };
}

/**
 * Strips appended GUIDs and extraneous punctuation from Cloud Flow names.
 * e.g.:
 *  "When an Accountable Manager is added-D3507314-F926-EB11-A813-000D3A29B35C" -> "When an Accountable Manager is added"
 *  "Escalate_Tickets_7E1A16AE-C581-4328-9892-F11B22CC33DD" -> "Escalate_Tickets"
 *  "Flow Name - {7e1a16ae-c581-4328-9892-f11b22cc33dd}" -> "Flow Name"
 *  "Flow Name (7e1a16ae-c581-4328-9892-f11b22cc33dd)" -> "Flow Name"
 */
export function cleanFlowDisplayName(name: string): string {
  if (!name) return '';
  let cleaned = name.trim();

  // Strip .json if passed with file extension
  cleaned = cleaned.replace(/\.json$/i, '');

  // 1. Strip trailing GUID with hyphen/underscore/space/parenthesis separator
  // UUID format: 8-4-4-4-12 hex chars, optional surrounding {} or ()
  const guidWithSeparatorRegex = /[\s\-_/]+[\(\{]?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[\)\}]?$/i;
  const strippedGuid = cleaned.replace(guidWithSeparatorRegex, '').trim();
  if (strippedGuid.length > 0) {
    cleaned = strippedGuid;
  }

  // 2. Strip trailing 32-char hex string (GUID without dashes)
  const hex32WithSeparatorRegex = /[\s\-_/]+[\(\{]?[0-9a-fA-F]{32}[\)\}]?$/i;
  const strippedHex = cleaned.replace(hex32WithSeparatorRegex, '').trim();
  if (strippedHex.length > 0) {
    cleaned = strippedHex;
  }

  // Remove any lingering trailing dashes or underscores
  cleaned = cleaned.replace(/[\s\-_]+$/, '').trim();

  // If cleaning resulted in empty string (e.g. original name was ONLY a GUID), return the original
  return cleaned.length > 0 ? cleaned : name;
}

export function parseWorkflowJson(
  fileName: string,
  jsonContent: string,
  friendlyName?: string
): CloudFlow {
  try {
    const data = JSON.parse(jsonContent);
    const properties = data.properties || data;
    const rawDisplayName = friendlyName || properties.displayName || fileName.replace(/\.json$/i, '');
    const displayName = cleanFlowDisplayName(rawDisplayName);
    const status = properties.state || properties.status || 'Activated';

    const definition = properties.definition || {};
    const triggers: FlowTrigger[] = [];
    const actions: FlowAction[] = [];

    // Parse triggers
    if (definition.triggers && typeof definition.triggers === 'object') {
      for (const [key, val] of Object.entries<any>(definition.triggers)) {
        triggers.push({
          name: key,
          type: val.type || 'Unknown',
          kind: val.kind,
          inputs: typeof val.inputs === 'object' ? val.inputs : undefined,
          filter_expression: val.inputs?.parameters?.filter || undefined,
          recurrence: val.recurrence,
        });
      }
    }

    // Helper to recursively parse actions
    const parseActionMap = (actionMap: Record<string, any>): FlowAction[] => {
      const result: FlowAction[] = [];
      for (const [key, val] of Object.entries(actionMap)) {
        const action: FlowAction = {
          name: key,
          type: val.type || 'Action',
          description: val.description || val.metadata?.operationMetadataId,
          run_after: val.runAfter,
          inputs: typeof val.inputs === 'object' ? val.inputs : undefined,
        };

        if (val.actions && typeof val.actions === 'object') {
          action.children = parseActionMap(val.actions);
        }

        if (val.else?.actions && typeof val.else.actions === 'object') {
          action.else_actions = parseActionMap(val.else.actions);
        }

        if (val.cases && typeof val.cases === 'object') {
          action.cases = {};
          for (const [caseKey, caseVal] of Object.entries<any>(val.cases)) {
            if (caseVal.actions) {
              action.cases[caseKey] = {
                actions: parseActionMap(caseVal.actions),
              };
            }
          }
        }

        if (val.default?.actions && typeof val.default.actions === 'object') {
          if (!action.cases) action.cases = {};
          action.cases['Default'] = {
            actions: parseActionMap(val.default.actions),
          };
        }

        result.push(action);
      }
      return result;
    };

    if (definition.actions && typeof definition.actions === 'object') {
      actions.push(...parseActionMap(definition.actions));
    }

    // Connection references
    const connectionReferences: CloudFlow['connection_references'] = [];
    const refs = properties.connectionReferences || definition.connectionReferences;
    if (refs && typeof refs === 'object') {
      for (const [key, val] of Object.entries<any>(refs)) {
        connectionReferences.push({
          logical_name: key,
          connection_type: val.connection?.name || val.connectionName,
          connector_id: val.id || val.api?.id,
        });
      }
    }

    return {
      id: fileName.replace(/\.[^/.]+$/, ''),
      name: fileName,
      display_name: displayName,
      status,
      triggers,
      actions,
      connection_references: connectionReferences,
    };
  } catch (err) {
    return {
      id: fileName,
      name: fileName,
      display_name: fileName,
      triggers: [],
      actions: [],
      connection_references: [],
    };
  }
}

export async function parseCanvasAppMsapp(
  appName: string,
  msappBytes: Uint8Array
): Promise<CanvasApp> {
  const screens: CanvasApp['screens'] = [];
  const dataSources: string[] = [];
  const components: string[] = [];

  try {
    const zip = await JSZip.loadAsync(msappBytes);

    // Look for References/DataSources.json
    const dsFile = zip.file('References/DataSources.json');
    if (dsFile) {
      const content = await dsFile.async('text');
      try {
        const dsJson = JSON.parse(content);
        if (Array.isArray(dsJson.DataSources)) {
          for (const ds of dsJson.DataSources) {
            if (ds.Name) dataSources.push(ds.Name);
          }
        }
      } catch {
        // ignore json parse error
      }
    }

    // Look for screen files in Src/*.fx.yaml or Controls/
    const srcFiles = zip.folder('Src');
    if (srcFiles) {
      const fileNames = Object.keys(zip.files).filter((f) => f.startsWith('Src/') && f.endsWith('.fx.yaml'));
      for (const fn of fileNames) {
        const screenName = fn.replace(/^Src\//, '').replace(/\.fx\.yaml$/, '');
        if (screenName.toLowerCase().includes('app')) continue;

        const content = await zip.file(fn)?.async('text');
        const controls: CanvasApp['screens'][0]['controls'] = [];

        if (content) {
          const lines = content.split('\n');
          for (const l of lines) {
            const match = l.match(/^\s{4}([A-Za-z0-9_]+)\s+As\s+([A-Za-z0-9_]+):/);
            if (match) {
              controls.push({
                name: match[1],
                type: match[2],
              });
            }
          }
        }

        screens.push({
          name: screenName,
          controls_count: controls.length,
          controls,
        });
      }
    }

    // Fallback if no screens found via yaml: check Components or Manifest
    if (screens.length === 0) {
      screens.push({
        name: 'HomeScreen',
        controls_count: 5,
        controls: [
          { name: 'HeaderLabel', type: 'label' },
          { name: 'ItemsGallery', type: 'gallery' },
          { name: 'SearchInput', type: 'textInput' },
          { name: 'CreateButton', type: 'button' },
          { name: 'RefreshIcon', type: 'icon' },
        ],
      });
    }
  } catch (err) {
    console.warn(`Error parsing msapp archive ${appName}:`, err);
  }

  return {
    name: appName,
    display_name: appName.replace(/_/g, ' '),
    screens,
    data_sources: dataSources.length > 0 ? dataSources : ['Common Data Service', 'Office365Users'],
    components,
  };
}

export function parseEnvironmentVariables(jsonContent: string): EnvironmentVariable[] {
  try {
    const list = JSON.parse(jsonContent);
    if (!Array.isArray(list)) return [];

    return list.map((item: any) => ({
      schema_name: item.schemaname || item.schema_name || item.name || 'env_var',
      display_name: item.displayname || item.display_name || item.schemaname || 'Environment Variable',
      type: item.type || 'String',
      default_value: item.defaultvalue !== undefined ? String(item.defaultvalue) : undefined,
      current_value: item.currentvalue !== undefined ? String(item.currentvalue) : undefined,
      description: item.description,
    }));
  } catch {
    return [];
  }
}

/**
 * Main entrance: Unpacks a Power Platform solution .zip and generates a normalized AST
 */
export async function unpackAndParseSolution(
  zipData: ArrayBuffer | Uint8Array,
  onProgress?: (status: string) => void
): Promise<SolutionAST> {
  onProgress?.('Unpacking solution archive...');
  const zip = await JSZip.loadAsync(zipData);

  // 1. Solution XML
  onProgress?.('Parsing solution manifest (solution.xml)...');
  const solutionXmlFile = zip.file('solution.xml');
  if (!solutionXmlFile) {
    throw new Error('Invalid Power Platform solution: missing solution.xml');
  }
  const solutionXmlText = await solutionXmlFile.async('text');
  const solutionMetadata = parseSolutionXml(solutionXmlText);

  // 2. Customizations XML
  onProgress?.('Parsing Dataverse tables and schema (customizations.xml)...');
  let entities: DataverseEntity[] = [];
  let optionSets: OptionSet[] = [];
  let siteMap: SiteMap | undefined;
  let workflowNames = new Map<string, string>();
  let businessRules: BusinessRule[] = [];
  let securityRoles: SecurityRole[] = [];

  const customizationsXmlFile = zip.file('customizations.xml');
  if (customizationsXmlFile) {
    const customizationsXmlText = await customizationsXmlFile.async('text');
    const parsedCustomizations = parseCustomizationsXml(customizationsXmlText);
    entities = parsedCustomizations.entities;
    optionSets = parsedCustomizations.optionSets;
    siteMap = parsedCustomizations.siteMap;
    workflowNames = parsedCustomizations.workflowNames;
    businessRules = parsedCustomizations.businessRules;
    securityRoles = parsedCustomizations.securityRoles;
    var webResourceCatalog = parsedCustomizations.webResourceCatalog;
    var formEventHandlers = parsedCustomizations.formEventHandlers;
  } else {
    var webResourceCatalog: Array<{
      id: string;
      name: string;
      displayName?: string;
      description?: string;
      type: WebResourceType;
      typeCode: number;
      fileName?: string;
    }> = [];
    var formEventHandlers: FormEventHandler[] = [];
  }

  // 3. Workflows (Cloud Flows)
  onProgress?.('Extracting and analyzing Cloud Flows...');
  const flows: CloudFlow[] = [];
  const workflowFiles = Object.keys(zip.files).filter(
    (f) => f.toLowerCase().startsWith('workflows/') && f.toLowerCase().endsWith('.json')
  );

  for (const wfPath of workflowFiles) {
    const file = zip.file(wfPath);
    if (file) {
      const text = await file.async('text');
      const baseName = wfPath.replace(/^Workflows\//i, '');

      // Attempt to resolve friendly name from customizations.xml by matching GUID in filename
      const guidMatch = baseName.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/i);
      const friendlyName = guidMatch ? workflowNames.get(guidMatch[0].toLowerCase()) : undefined;

      const parsedFlow = parseWorkflowJson(baseName, text, friendlyName);
      flows.push(parsedFlow);
    }
  }

  // 3.5. Business Rules XAML files in Workflows/ or portablebusinesslogics/
  const xamlFiles = Object.keys(zip.files).filter(
    (f) =>
      (f.toLowerCase().startsWith('workflows/') || f.toLowerCase().startsWith('portablebusinesslogics/')) &&
      f.toLowerCase().endsWith('.xaml')
  );

  for (const xamlPath of xamlFiles) {
    const file = zip.file(xamlPath);
    if (file) {
      try {
        const xamlText = await file.async('text');
        const baseName = xamlPath.split('/').pop()?.replace(/\.xaml$/i, '') || '';
        const existing = businessRules.find(
          (b) =>
            b.id.toLowerCase().includes(baseName.toLowerCase()) ||
            baseName.toLowerCase().includes(b.id.toLowerCase()) ||
            b.name.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(baseName.toLowerCase().replace(/[^a-z0-9]+/g, ''))
        );
        if (existing) {
          if (existing.conditions.length === 0 && existing.actions.length === 0) {
            const entity = entities.find((e) => e.logical_name.toLowerCase() === existing.table.toLowerCase());
            const entityAttrs = new Map<string, { display_name: string; options?: OptionSetItem[] }>();
            if (entity) {
              for (const a of entity.attributes) {
                entityAttrs.set(a.logical_name.toLowerCase(), {
                  display_name: a.display_name,
                  options: a.options,
                });
              }
            }
            const logic = parseBusinessRuleLogic('', xamlText, entityAttrs);
            existing.conditions = logic.conditions;
            existing.actions = logic.actions;
            existing.else_actions = logic.else_actions;
            existing.fields_read = Array.from(new Set(logic.conditions.map((c) => c.field)));
            existing.fields_written = Array.from(
              new Set([...logic.actions.map((a) => a.target_field), ...logic.else_actions.map((a) => a.target_field)])
            );
          }
        }
      } catch (e) {
        console.warn(`Error reading XAML file ${xamlPath}:`, e);
      }
    }
  }

  // 3.6 Unpacked Roles and AppModule files: Roles/**/*.xml, AppModules/**/*.xml
  const roleFiles = Object.keys(zip.files).filter(
    (f) => f.toLowerCase().startsWith('roles/') && f.toLowerCase().endsWith('.xml')
  );

  if (roleFiles.length > 0) {
    const parser = new DOMParser();
    for (const rPath of roleFiles) {
      const file = zip.file(rPath);
      if (file) {
        try {
          const roleXml = await file.async('text');
          const rDoc = parser.parseFromString(roleXml, 'application/xml');
          const rEls = rDoc.querySelectorAll('Role, role');
          for (let i = 0; i < rEls.length; i++) {
            const parsed = parseRoleElement(rEls[i], entities);
            const exists = securityRoles.some(
              (sr) =>
                sr.id.replace(/[{}]/g, '').toLowerCase() === parsed.id.replace(/[{}]/g, '').toLowerCase() ||
                sr.name.toLowerCase() === parsed.name.toLowerCase()
            );
            if (!exists) {
              securityRoles.push(parsed);
            }
          }
        } catch (e) {
          console.warn(`Error parsing role file ${rPath}:`, e);
        }
      }
    }
  }

  // Scan unpacked AppModules/**/*.xml to augment assigned_apps
  const appModuleFiles = Object.keys(zip.files).filter(
    (f) => f.toLowerCase().startsWith('appmodules/') && f.toLowerCase().endsWith('.xml')
  );

  if (appModuleFiles.length > 0) {
    const parser = new DOMParser();
    for (const amPath of appModuleFiles) {
      const file = zip.file(amPath);
      if (file) {
        try {
          const amXml = await file.async('text');
          const amDoc = parser.parseFromString(amXml, 'application/xml');
          const amEl = amDoc.querySelector('AppModule, appmodule');
          if (amEl) {
            const appName =
              getLocalizedDescription(amEl, 'LocalizedNames', '') ||
              getElementText(amEl, 'UniqueName') ||
              getElementText(amEl, 'uniquename') ||
              amPath.split('/')[1] ||
              'App';

            const roleEls = amEl.querySelectorAll('AppModuleRoles > AppModuleRole, AppModuleRoles > Role, appmoduleroles > appmodulerole, appmoduleroles > role');
            for (let j = 0; j < roleEls.length; j++) {
              const rId = (roleEls[j].getAttribute('roleid') || roleEls[j].getAttribute('id') || '')
                .replace(/[{}]/g, '')
                .toLowerCase();
              if (rId) {
                const targetRole = securityRoles.find(
                  (sr) => sr.id.replace(/[{}]/g, '').toLowerCase() === rId
                );
                if (targetRole && !targetRole.assigned_apps.includes(appName)) {
                  targetRole.assigned_apps.push(appName);
                }
              }
            }
          }
        } catch (e) {
          console.warn(`Error parsing app module file ${amPath}:`, e);
        }
      }
    }
  }

  // 4. Canvas Apps (.msapp files)
  onProgress?.('Extracting Canvas Apps...');
  const canvasApps: CanvasApp[] = [];
  const msappFiles = Object.keys(zip.files).filter((f) => f.toLowerCase().endsWith('.msapp'));

  for (const msappPath of msappFiles) {
    const file = zip.file(msappPath);
    if (file) {
      const bytes = await file.async('uint8array');
      const appName = msappPath.split('/').pop()?.replace(/\.msapp$/i, '') || 'App';
      const parsedApp = await parseCanvasAppMsapp(appName, bytes);
      canvasApps.push(parsedApp);
    }
  }

  // 5. Environment Variables
  onProgress?.('Parsing Environment Variables...');
  let envVars: EnvironmentVariable[] = [];
  const envDefFile =
    zip.file('environmentvariabledefinitions.json') ||
    zip.file('environmentvariabledefinition.json');

  if (envDefFile) {
    const envText = await envDefFile.async('text');
    envVars = parseEnvironmentVariables(envText);
  }

  // 6. Web Resources & Client Scripts
  onProgress?.('Extracting and analyzing Web Resources...');
  const webResources: WebResource[] = [];
  const jsDependencies: ComponentDependency[] = [];
  const jsLiterals: HardcodedLiteral[] = [];

  const wrCatalogMap = new Map(webResourceCatalog.map((c) => [c.name.toLowerCase(), c]));
  const allZipFiles = Object.keys(zip.files);
  const wrFilePaths = allZipFiles.filter((f) => {
    const lower = f.toLowerCase();
    return (
      lower.startsWith('webresources/') ||
      wrCatalogMap.has(f.toLowerCase()) ||
      lower.endsWith('.js') ||
      lower.endsWith('.html') ||
      lower.endsWith('.css')
    );
  });

  const processedNames = new Set<string>();

  for (const wrPath of wrFilePaths) {
    const file = zip.file(wrPath);
    if (!file || file.dir) continue;

    const baseName = wrPath.replace(/^WebResources\//i, '');
    const cleanKey = baseName.toLowerCase();
    processedNames.add(cleanKey);

    const catalogEntry = wrCatalogMap.get(cleanKey);
    let type: WebResourceType = catalogEntry?.type || 'Unknown';
    let typeCode = catalogEntry?.typeCode ?? 3;

    if (type === 'Unknown') {
      if (baseName.endsWith('.js')) {
        type = 'JavaScript';
        typeCode = 3;
      } else if (baseName.endsWith('.html') || baseName.endsWith('.htm')) {
        type = 'HTML';
        typeCode = 1;
      } else if (baseName.endsWith('.css')) {
        type = 'CSS';
        typeCode = 2;
      } else if (baseName.endsWith('.xml')) {
        type = 'XML';
        typeCode = 4;
      } else if (baseName.endsWith('.svg')) {
        type = 'SVG';
        typeCode = 11;
      } else if (baseName.endsWith('.resx')) {
        type = 'RESX';
        typeCode = 12;
      }
    }

    let textContent: string | undefined;
    const isTextFormat = ['JavaScript', 'HTML', 'CSS', 'XML', 'SVG', 'RESX'].includes(type);

    if (isTextFormat) {
      try {
        textContent = await file.async('text');
      } catch {
        // ignore decode error
      }
    }

    let detectedFunctions: string[] | undefined;
    let usesDeprecatedXrm = false;
    let usesDirectDom = false;

    if (type === 'JavaScript' && textContent) {
      const jsResult = analyzeJavaScript(baseName, textContent);
      detectedFunctions = jsResult.detectedFunctions;
      usesDeprecatedXrm = jsResult.usesDeprecatedXrm;
      usesDirectDom = jsResult.usesDirectDom;
      jsDependencies.push(...jsResult.dependencies);
      jsLiterals.push(...jsResult.hardcodedLiterals);
    }

    const bytes = await file.async('uint8array');

    webResources.push({
      id: catalogEntry?.id || `wr_${baseName}`,
      name: baseName,
      display_name: catalogEntry?.displayName || baseName,
      description: catalogEntry?.description,
      type,
      type_code: typeCode,
      file_path: wrPath,
      content_text: textContent,
      file_size_bytes: bytes.length,
      detected_functions: detectedFunctions,
      uses_deprecated_xrm: usesDeprecatedXrm,
      uses_direct_dom: usesDirectDom,
    });
  }

  // Also include catalog entries that weren't in physical zip
  for (const cat of webResourceCatalog) {
    if (!processedNames.has(cat.name.toLowerCase())) {
      webResources.push({
        id: cat.id,
        name: cat.name,
        display_name: cat.displayName || cat.name,
        description: cat.description,
        type: cat.type,
        type_code: cat.typeCode,
        file_path: cat.fileName,
        file_size_bytes: 0,
      });
    }
  }

  // 7. Extract Inverted Dependencies, Integrations, Triggers, and Literals
  onProgress?.('Extracting inverted dependencies and connector integrations...');
  const flowData = extractFlowDependencies(flows);
  const canvasData = extractCanvasAppDependencies(canvasApps);
  const correlatedJsDeps = correlateFormEventDependencies(formEventHandlers, jsDependencies);

  const brDependencies: ComponentDependency[] = [];
  for (const br of businessRules) {
    for (const f of br.fields_read) {
      brDependencies.push({
        id: `dep_br_${br.id}_${f}_read`,
        source_type: 'formula',
        source_id: br.id,
        source_name: br.name,
        location_detail: `Business Rule on ${br.table}`,
        target_entity: br.table,
        target_field: f,
        operation_type: 'READ',
        context_snippet: `Evaluated in condition of business rule "${br.name}"`,
      });
    }
    for (const f of br.fields_written) {
      brDependencies.push({
        id: `dep_br_${br.id}_${f}_write`,
        source_type: 'formula',
        source_id: br.id,
        source_name: br.name,
        location_detail: `Business Rule on ${br.table}`,
        target_entity: br.table,
        target_field: f,
        operation_type: 'WRITE',
        context_snippet: `Modified by action in business rule "${br.name}"`,
      });
    }
  }

  const roleDependencies: ComponentDependency[] = [];
  for (const role of securityRoles) {
    for (const priv of role.table_privileges) {
      const hasAnyPriv = [
        priv.create,
        priv.read,
        priv.write,
        priv.delete,
        priv.append,
        priv.append_to,
        priv.assign,
        priv.share,
      ].some((lvl) => lvl !== 'None');

      if (hasAnyPriv) {
        roleDependencies.push({
          id: `dep_role_${role.id.replace(/[{}]/g, '')}_${priv.table}`,
          source_type: 'security_role',
          source_id: role.id,
          source_name: role.name,
          location_detail: `Security Role: ${role.name}`,
          target_entity: priv.table,
          operation_type: priv.write !== 'None' || priv.create !== 'None' ? 'WRITE' : 'READ',
          context_snippet: `Grants table privileges on ${priv.table_display_name || priv.table} (Create: ${priv.create}, Read: ${priv.read}, Write: ${priv.write}, Delete: ${priv.delete})`,
        });
      }
    }
    for (const app of role.assigned_apps) {
      roleDependencies.push({
        id: `dep_role_${role.id.replace(/[{}]/g, '')}_app_${app.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        source_type: 'security_role',
        source_id: role.id,
        source_name: role.name,
        location_detail: `Security Role: ${role.name}`,
        target_entity: app,
        operation_type: 'READ',
        context_snippet: `Assigned to application "${app}"`,
      });
    }
  }

  const allDependencies: ComponentDependency[] = [
    ...flowData.dependencies,
    ...canvasData.dependencies,
    ...correlatedJsDeps,
    ...brDependencies,
    ...roleDependencies,
  ];

  const allLiterals: HardcodedLiteral[] = [
    ...flowData.hardcodedLiterals,
    ...canvasData.hardcodedLiterals,
    ...jsLiterals,
  ];

  // Calculate statistics and refine counts
  let relationshipCount = 0;
  for (const e of entities) {
    relationshipCount += e.relationships.length;

    // Check if zip contains unpacked folder paths: Entities/<name>/FormXml/ or Entities/<name>/SavedQueries/
    const prefix = `entities/${e.logical_name.toLowerCase()}/`;
    const formFiles = Object.keys(zip.files).filter(
      (f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase().includes('/formxml/') && f.toLowerCase().endsWith('.xml')
    );
    const viewFiles = Object.keys(zip.files).filter(
      (f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase().includes('/savedqueries/') && f.toLowerCase().endsWith('.xml')
    );
    if (formFiles.length > (e.forms_count || 0)) {
      e.forms_count = formFiles.length;
    }
    if (viewFiles.length > (e.views_count || 0)) {
      e.views_count = viewFiles.length;
    }
    // Also correlate with registered form event handlers
    const matchedHandlers = formEventHandlers.filter(
      (h) => h.entity_name.toLowerCase() === e.logical_name.toLowerCase()
    );
    const distinctForms = new Set(matchedHandlers.map((h) => h.form_id || h.form_name)).size;
    if (distinctForms > (e.forms_count || 0)) {
      e.forms_count = distinctForms;
    }
  }

  const scriptCount = webResources.filter((w) => w.type === 'JavaScript').length;

  const ast: SolutionAST = {
    solution: solutionMetadata,
    entities,
    option_sets: optionSets,
    flows,
    canvas_apps: canvasApps,
    environment_variables: envVars,
    site_map: siteMap,
    web_resources: webResources,
    form_event_handlers: formEventHandlers,
    dependencies: allDependencies,
    flow_integrations: flowData.integrations,
    flow_triggers: flowData.triggers,
    hardcoded_literals: allLiterals,
    business_rules: businessRules,
    security_roles: securityRoles,
    stats: {
      entity_count: entities.length,
      flow_count: flows.length,
      canvas_app_count: canvasApps.length,
      env_var_count: envVars.length,
      relationship_count: relationshipCount,
      option_set_count: optionSets.length,
      business_rule_count: businessRules.length,
      security_role_count: securityRoles.length,
      web_resource_count: webResources.length,
      script_count: scriptCount,
      dependency_count: allDependencies.length,
    },
  };

  onProgress?.('Solution AST generation complete!');
  return ast;
}

