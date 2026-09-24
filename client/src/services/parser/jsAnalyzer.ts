import { ComponentDependency, HardcodedLiteral } from '../../types/solution';

export interface JSAnalysisResult {
  detectedFunctions: string[];
  usesDeprecatedXrm: boolean;
  usesDirectDom: boolean;
  dependencies: ComponentDependency[];
  hardcodedLiterals: HardcodedLiteral[];
}

/**
 * Analyzes client-side JavaScript code from Power Platform Web Resources.
 * Extracts function signatures, deprecated APIs (Xrm.Page), direct DOM usage,
 * Dataverse attribute/entity dependencies, and hardcoded values.
 */
export function analyzeJavaScript(
  resourceName: string,
  jsCode: string
): JSAnalysisResult {
  const detectedFunctions: string[] = [];
  const dependencies: ComponentDependency[] = [];
  const hardcodedLiterals: HardcodedLiteral[] = [];

  if (!jsCode || !jsCode.trim()) {
    return {
      detectedFunctions: [],
      usesDeprecatedXrm: false,
      usesDirectDom: false,
      dependencies: [],
      hardcodedLiterals: [],
    };
  }

  const lines = jsCode.split('\n');

  // 1. Check for deprecated Xrm.Page
  const usesDeprecatedXrm = /\bXrm\.Page\b/.test(jsCode);

  // 2. Check for unsupported direct DOM manipulation in Unified Interface
  const usesDirectDom =
    /\bdocument\.(getElementById|getElementsByClassName|querySelector|querySelectorAll)\b/.test(
      jsCode
    ) || /\bwindow\.parent\b/.test(jsCode);

  // 3. Extract Function Definitions
  // Match standard: function myFunc(
  const funcDeclRegex = /\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = funcDeclRegex.exec(jsCode)) !== null) {
    if (match[1] && !detectedFunctions.includes(match[1])) {
      detectedFunctions.push(match[1]);
    }
  }

  // Match object namespace methods: myFunc: function( or myFunc: (
  const objMethodRegex = /\b([A-Za-z0-9_$]+)\s*:\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g;
  while ((match = objMethodRegex.exec(jsCode)) !== null) {
    if (match[1] && !detectedFunctions.includes(match[1]) && !['if', 'for', 'while', 'switch'].includes(match[1])) {
      detectedFunctions.push(match[1]);
    }
  }

  // Match assignment: MyNamespace.myFunc = function(
  const assignMethodRegex = /(?:[A-Za-z0-9_$]+\.)+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g;
  while ((match = assignMethodRegex.exec(jsCode)) !== null) {
    if (match[1] && !detectedFunctions.includes(match[1])) {
      detectedFunctions.push(match[1]);
    }
  }

  // 4. Line-by-line inspection for Dependencies and Literals
  const seenDeps = new Set<string>();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

    // formContext.getAttribute("...") or Xrm.Page.getAttribute("...")
    const attrRegex = /(?:formContext|Xrm\.Page|context\.getFormContext\(\))\s*\.getAttribute\(\s*["']([^"']+)["']\s*\)/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(line)) !== null) {
      const fieldName = attrMatch[1].toLowerCase();
      const isWrite = line.includes('.setValue') || line.includes('.setRequiredLevel');
      const opType = isWrite ? 'WRITE' : 'READ';
      const key = `${resourceName}|js|general|${fieldName}|${opType}`;

      if (!seenDeps.has(key)) {
        seenDeps.add(key);
        dependencies.push({
          id: `dep_js_${resourceName}_${dependencies.length}`,
          source_type: 'javascript',
          source_id: resourceName,
          source_name: resourceName,
          location_detail: `Line ${lineIdx + 1}`,
          target_entity: 'unknown_form_entity', // Bound at form level
          target_field: fieldName,
          operation_type: opType,
          context_snippet: line.slice(0, 150),
        });
      }
    }

    // formContext.getControl("...")
    const ctrlRegex = /(?:formContext|Xrm\.Page|context\.getFormContext\(\))\s*\.getControl\(\s*["']([^"']+)["']\s*\)/g;
    let ctrlMatch: RegExpExecArray | null;
    while ((ctrlMatch = ctrlRegex.exec(line)) !== null) {
      const fieldName = ctrlMatch[1].toLowerCase();
      const key = `${resourceName}|js|general|${fieldName}|READ`;
      if (!seenDeps.has(key)) {
        seenDeps.add(key);
        dependencies.push({
          id: `dep_js_${resourceName}_${dependencies.length}`,
          source_type: 'javascript',
          source_id: resourceName,
          source_name: resourceName,
          location_detail: `Line ${lineIdx + 1} (UI Control)`,
          target_entity: 'unknown_form_entity',
          target_field: fieldName,
          operation_type: 'READ',
          context_snippet: line.slice(0, 150),
        });
      }
    }

    // Xrm.WebApi.createRecord("entity", ...)
    const createRecordRegex = /Xrm\.WebApi(?:\.online)?\.createRecord\(\s*["']([^"']+)["']/g;
    let createMatch: RegExpExecArray | null;
    while ((createMatch = createRecordRegex.exec(line)) !== null) {
      const entityName = createMatch[1].toLowerCase();
      dependencies.push({
        id: `dep_js_${resourceName}_${dependencies.length}`,
        source_type: 'javascript',
        source_id: resourceName,
        source_name: resourceName,
        location_detail: `Line ${lineIdx + 1} (Xrm.WebApi.createRecord)`,
        target_entity: entityName,
        operation_type: 'WRITE',
        context_snippet: line.slice(0, 150),
      });
    }

    // Xrm.WebApi.updateRecord("entity", ...)
    const updateRecordRegex = /Xrm\.WebApi(?:\.online)?\.updateRecord\(\s*["']([^"']+)["']/g;
    let updateMatch: RegExpExecArray | null;
    while ((updateMatch = updateRecordRegex.exec(line)) !== null) {
      const entityName = updateMatch[1].toLowerCase();
      dependencies.push({
        id: `dep_js_${resourceName}_${dependencies.length}`,
        source_type: 'javascript',
        source_id: resourceName,
        source_name: resourceName,
        location_detail: `Line ${lineIdx + 1} (Xrm.WebApi.updateRecord)`,
        target_entity: entityName,
        operation_type: 'WRITE',
        context_snippet: line.slice(0, 150),
      });
    }

    // Xrm.WebApi.deleteRecord("entity", ...)
    const deleteRecordRegex = /Xrm\.WebApi(?:\.online)?\.deleteRecord\(\s*["']([^"']+)["']/g;
    let delMatch: RegExpExecArray | null;
    while ((delMatch = deleteRecordRegex.exec(line)) !== null) {
      const entityName = delMatch[1].toLowerCase();
      dependencies.push({
        id: `dep_js_${resourceName}_${dependencies.length}`,
        source_type: 'javascript',
        source_id: resourceName,
        source_name: resourceName,
        location_detail: `Line ${lineIdx + 1} (Xrm.WebApi.deleteRecord)`,
        target_entity: entityName,
        operation_type: 'DELETE',
        context_snippet: line.slice(0, 150),
      });
    }

    // Xrm.WebApi.retrieveRecord / retrieveMultipleRecords
    const retrieveRecordRegex = /Xrm\.WebApi(?:\.online)?\.retrieve(?:Multiple)?Records?\(\s*["']([^"']+)["']/g;
    let retMatch: RegExpExecArray | null;
    while ((retMatch = retrieveRecordRegex.exec(line)) !== null) {
      const entityName = retMatch[1].toLowerCase();
      dependencies.push({
        id: `dep_js_${resourceName}_${dependencies.length}`,
        source_type: 'javascript',
        source_id: resourceName,
        source_name: resourceName,
        location_detail: `Line ${lineIdx + 1} (Xrm.WebApi.retrieve)`,
        target_entity: entityName,
        operation_type: 'READ',
        context_snippet: line.slice(0, 150),
      });
    }

    // Check for hardcoded URLs
    const urlMatches = line.match(/https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+/g);
    if (urlMatches) {
      for (const u of urlMatches) {
        if (
          !u.includes('w3.org') &&
          !u.includes('microsoft.com/schemas') &&
          !u.includes('json-schema.org')
        ) {
          hardcodedLiterals.push({
            id: `lit_js_${resourceName}_${hardcodedLiterals.length}`,
            component_type: 'javascript',
            component_name: resourceName,
            literal_type: 'URL',
            value: u,
            code_context: `Line ${lineIdx + 1}: ${line.slice(0, 120)}`,
          });
        }
      }
    }

    // Check for hardcoded GUIDs
    const guidMatches = line.match(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g);
    if (guidMatches) {
      for (const g of guidMatches) {
        hardcodedLiterals.push({
          id: `lit_js_${resourceName}_${hardcodedLiterals.length}`,
          component_type: 'javascript',
          component_name: resourceName,
          literal_type: 'GUID',
          value: g,
          code_context: `Line ${lineIdx + 1}: ${line.slice(0, 120)}`,
        });
      }
    }
  }

  return {
    detectedFunctions,
    usesDeprecatedXrm,
    usesDirectDom,
    dependencies,
    hardcodedLiterals,
  };
}
