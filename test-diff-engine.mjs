import assert from 'assert';

console.log('--- Starting Solution Diff Engine Verification Test Suite ---');

// 1. Line-by-Line Text Diff Logic (LCS)
console.log('1. Testing Line-by-Line Code Diff (LCS)...');
function computeTextDiff(baseText = '', targetText = '') {
  if (baseText === targetText) {
    return baseText.split('\n').map((content, idx) => ({
      type: 'unchanged',
      lineNumberBase: idx + 1,
      lineNumberTarget: idx + 1,
      content,
    }));
  }

  const baseLines = baseText.split('\n');
  const targetLines = targetText.split('\n');
  const m = baseLines.length;
  const n = targetLines.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (baseLines[i - 1] === targetLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && baseLines[i - 1] === targetLines[j - 1]) {
      result.unshift({
        type: 'unchanged',
        lineNumberBase: i,
        lineNumberTarget: j,
        content: baseLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: 'added',
        lineNumberTarget: j,
        content: targetLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({
        type: 'removed',
        lineNumberBase: i,
        content: baseLines[i - 1],
      });
      i--;
    }
  }
  return result;
}

const baseJS = `function onLoad(ctx) {\n  var name = Xrm.Page.getAttribute('name').getValue();\n  console.log(name);\n}`;
const targetJS = `function onLoad(ctx) {\n  var formContext = ctx.getFormContext();\n  var name = formContext.getAttribute('name').getValue();\n  console.log(name);\n  console.log("Updated!");\n}`;

const diffLines = computeTextDiff(baseJS, targetJS);
assert(diffLines.length >= 4, 'Diff should produce at least 4 lines');
assert(diffLines.some((l) => l.type === 'added' && l.content.includes('formContext')), 'Should detect added formContext line');
assert(diffLines.some((l) => l.type === 'removed' && l.content.includes('Xrm.Page')), 'Should detect removed Xrm.Page line');
console.log('✓ Text diff computed correctly!');

// 2. Diff Engine Implementation Test
console.log('2. Testing AST Deep Diff & Breaking Changes Rules...');

const PRIVILEGE_RANK = {
  None: 0,
  User: 1,
  BU: 2,
  Parent: 3,
  Org: 4,
};

function comparePrivilege(privilegeName, baseLevel = 'None', targetLevel = 'None') {
  if (baseLevel === targetLevel) return null;
  const baseRank = PRIVILEGE_RANK[baseLevel] ?? 0;
  const targetRank = PRIVILEGE_RANK[targetLevel] ?? 0;
  return {
    privilegeName,
    baseLevel,
    targetLevel,
    isDowngrade: targetRank < baseRank,
  };
}

function computeSolutionDiff(baseAst, targetAst) {
  const breakingChanges = [];
  const baseMeta = baseAst.solution;
  const targetMeta = targetAst.solution;
  const isUpgrade = targetMeta.version.localeCompare(baseMeta.version, undefined, { numeric: true }) > 0;

  // 1. Entities
  const entityDiffs = [];
  const baseEntityMap = new Map((baseAst.entities || []).map((e) => [e.logical_name.toLowerCase(), e]));
  const targetEntityMap = new Map((targetAst.entities || []).map((e) => [e.logical_name.toLowerCase(), e]));
  const allEntityKeys = Array.from(new Set([...baseEntityMap.keys(), ...targetEntityMap.keys()])).sort();

  for (const key of allEntityKeys) {
    const baseEntity = baseEntityMap.get(key);
    const targetEntity = targetEntityMap.get(key);

    if (!baseEntity && targetEntity) {
      entityDiffs.push({
        logical_name: targetEntity.logical_name,
        display_name: targetEntity.display_name,
        status: 'added',
        targetEntity,
        isBreaking: false,
      });
    } else if (baseEntity && !targetEntity) {
      entityDiffs.push({
        logical_name: baseEntity.logical_name,
        display_name: baseEntity.display_name,
        status: 'removed',
        baseEntity,
        isBreaking: true,
        breakingReason: `Table '${baseEntity.display_name}' was removed.`,
      });
      breakingChanges.push({
        id: `break_entity_del_${baseEntity.logical_name}`,
        category: 'table',
        severity: 'breaking',
        componentName: baseEntity.display_name,
        componentIdentifier: baseEntity.logical_name,
        title: `Deleted Dataverse Table: ${baseEntity.display_name}`,
        description: `Table was deleted.`,
        impactAssessment: `Any queries will fail.`,
      });
    } else if (baseEntity && targetEntity) {
      const baseAttrMap = new Map((baseEntity.attributes || []).map((a) => [a.logical_name.toLowerCase(), a]));
      const targetAttrMap = new Map((targetEntity.attributes || []).map((a) => [a.logical_name.toLowerCase(), a]));
      const allAttrKeys = Array.from(new Set([...baseAttrMap.keys(), ...targetAttrMap.keys()])).sort();

      const attributeDiffs = [];
      let addedAttrs = 0;
      let removedAttrs = 0;
      let modifiedAttrs = 0;
      let tableHasBreaking = false;

      for (const aKey of allAttrKeys) {
        const bAttr = baseAttrMap.get(aKey);
        const tAttr = targetAttrMap.get(aKey);

        if (!bAttr && tAttr) {
          addedAttrs++;
          attributeDiffs.push({ logical_name: tAttr.logical_name, status: 'added', isBreaking: false });
        } else if (bAttr && !tAttr) {
          removedAttrs++;
          tableHasBreaking = true;
          attributeDiffs.push({ logical_name: bAttr.logical_name, status: 'removed', isBreaking: true });
          breakingChanges.push({
            id: `break_col_del_${baseEntity.logical_name}_${bAttr.logical_name}`,
            category: 'column',
            severity: 'breaking',
            componentName: `${baseEntity.display_name} -> ${bAttr.display_name}`,
            componentIdentifier: `${baseEntity.logical_name}.${bAttr.logical_name}`,
            title: `Deleted Column: ${bAttr.display_name}`,
            description: `Column was removed.`,
            impactAssessment: `Integrations reading this field will fail.`,
          });
        } else if (bAttr && tAttr) {
          const propChanges = [];
          let isColBreaking = false;
          if (bAttr.type !== tAttr.type) {
            propChanges.push({ propertyName: 'Type', baseValue: bAttr.type, targetValue: tAttr.type });
            isColBreaking = true;
          }
          if (bAttr.required_level !== tAttr.required_level) {
            propChanges.push({ propertyName: 'Required Level', baseValue: bAttr.required_level, targetValue: tAttr.required_level });
            if ((tAttr.required_level === 'ApplicationRequired' || tAttr.required_level === 'SystemRequired') &&
                (!bAttr.required_level || bAttr.required_level === 'None')) {
              isColBreaking = true;
            }
          }
          if (propChanges.length > 0) {
            modifiedAttrs++;
            if (isColBreaking) tableHasBreaking = true;
            attributeDiffs.push({ logical_name: tAttr.logical_name, status: 'modified', isBreaking: isColBreaking, propertyChanges: propChanges });
          } else {
            attributeDiffs.push({ logical_name: tAttr.logical_name, status: 'unchanged', isBreaking: false });
          }
        }
      }

      const isModified = addedAttrs > 0 || removedAttrs > 0 || modifiedAttrs > 0;
      entityDiffs.push({
        logical_name: targetEntity.logical_name,
        display_name: targetEntity.display_name,
        status: isModified ? 'modified' : 'unchanged',
        attributes: attributeDiffs,
        isBreaking: tableHasBreaking,
        addedAttributesCount: addedAttrs,
        removedAttributesCount: removedAttrs,
        modifiedAttributesCount: modifiedAttrs,
      });
    }
  }

  // 2. Flows
  const flowDiffs = [];
  const baseFlowMap = new Map((baseAst.flows || []).map((f) => [f.name.toLowerCase(), f]));
  const targetFlowMap = new Map((targetAst.flows || []).map((f) => [f.name.toLowerCase(), f]));
  const allFlowKeys = Array.from(new Set([...baseFlowMap.keys(), ...targetFlowMap.keys()])).sort();

  for (const fKey of allFlowKeys) {
    const baseFlow = baseFlowMap.get(fKey);
    const targetFlow = targetFlowMap.get(fKey);

    if (!baseFlow && targetFlow) {
      flowDiffs.push({ name: targetFlow.name, display_name: targetFlow.display_name, status: 'added', isBreaking: false });
    } else if (baseFlow && !targetFlow) {
      flowDiffs.push({ name: baseFlow.name, display_name: baseFlow.display_name, status: 'removed', isBreaking: true });
      breakingChanges.push({
        id: `break_flow_del_${baseFlow.name}`,
        category: 'flow',
        severity: 'breaking',
        title: `Deleted Cloud Flow: ${baseFlow.display_name}`,
        description: 'Flow was deleted',
        impactAssessment: 'Automations will stop working',
      });
    } else if (baseFlow && targetFlow) {
      const baseActionMap = new Map((baseFlow.actions || []).map((a) => [a.name.toLowerCase(), a]));
      const targetActionMap = new Map((targetFlow.actions || []).map((a) => [a.name.toLowerCase(), a]));
      let addedActions = 0;
      let removedActions = 0;
      let modifiedActions = 0;

      for (const [aKey] of targetActionMap) {
        if (!baseActionMap.has(aKey)) addedActions++;
      }
      for (const [aKey] of baseActionMap) {
        if (!targetActionMap.has(aKey)) removedActions++;
      }

      flowDiffs.push({
        name: targetFlow.name,
        display_name: targetFlow.display_name,
        status: (addedActions > 0 || removedActions > 0 || modifiedActions > 0) ? 'modified' : 'unchanged',
        addedActionsCount: addedActions,
        removedActionsCount: removedActions,
        modifiedActionsCount: modifiedActions,
        isBreaking: false,
      });
    }
  }

  // 3. Security Roles
  const secDiffs = [];
  const baseSecMap = new Map((baseAst.security_roles || []).map((s) => [s.name.toLowerCase(), s]));
  const targetSecMap = new Map((targetAst.security_roles || []).map((s) => [s.name.toLowerCase(), s]));
  const allSecKeys = Array.from(new Set([...baseSecMap.keys(), ...targetSecMap.keys()])).sort();

  for (const sKey of allSecKeys) {
    const baseRole = baseSecMap.get(sKey);
    const targetRole = targetSecMap.get(sKey);

    if (baseRole && targetRole) {
      let hasDowngrade = false;
      const bPriv = (baseRole.table_privileges || [])[0];
      const tPriv = (targetRole.table_privileges || [])[0];
      if (bPriv && tPriv) {
        const diff = comparePrivilege('delete', bPriv.delete, tPriv.delete);
        if (diff && diff.isDowngrade) {
          hasDowngrade = true;
          breakingChanges.push({
            id: `break_sec_downgrade_${targetRole.name}`,
            category: 'security',
            severity: 'breaking',
            title: `Security Role Privilege Downgraded: ${targetRole.name}`,
            description: `Privilege downgraded`,
            impactAssessment: `Access denied`,
          });
        }
      }
      secDiffs.push({
        name: targetRole.name,
        status: hasDowngrade ? 'modified' : 'unchanged',
        isBreaking: hasDowngrade,
      });
    }
  }

  // 4. Option Sets
  const optDiffs = [];
  const baseOpt = (baseAst.option_sets || [])[0];
  const targetOpt = (targetAst.option_sets || [])[0];
  if (baseOpt && targetOpt) {
    const baseItemMap = new Map(baseOpt.options.map((o) => [o.value, o]));
    const targetItemMap = new Map(targetOpt.options.map((o) => [o.value, o]));
    const removedOptions = [];
    for (const [val, o] of baseItemMap) {
      if (!targetItemMap.has(val)) removedOptions.push(o);
    }
    const isOptBreaking = removedOptions.length > 0;
    if (isOptBreaking) {
      breakingChanges.push({
        id: `break_opt_item_${targetOpt.name}`,
        category: 'optionset',
        severity: 'warning',
        title: `Option Values Removed: ${targetOpt.name}`,
        description: `${removedOptions.length} option(s) removed`,
        impactAssessment: `Blank labels on old records`,
      });
    }
    optDiffs.push({
      name: targetOpt.name,
      status: removedOptions.length > 0 ? 'modified' : 'unchanged',
      removedOptions,
      isBreaking: isOptBreaking,
    });
  }

  const allItems = [...entityDiffs, ...flowDiffs, ...secDiffs, ...optDiffs];
  const metrics = {
    addedCount: allItems.filter((i) => i.status === 'added').length,
    modifiedCount: allItems.filter((i) => i.status === 'modified').length,
    removedCount: allItems.filter((i) => i.status === 'removed').length,
    unchangedCount: allItems.filter((i) => i.status === 'unchanged').length,
    breakingChangesCount: breakingChanges.filter((b) => b.severity === 'breaking').length,
    warningsCount: breakingChanges.filter((b) => b.severity === 'warning').length,
  };

  return {
    baseMetadata: baseMeta,
    targetMetadata: targetMeta,
    versionChange: { from: baseMeta.version, to: targetMeta.version, isUpgrade },
    metrics,
    entities: entityDiffs,
    flows: flowDiffs,
    securityRoles: secDiffs,
    optionSets: optDiffs,
    breakingChanges,
  };
}

const baseAst = {
  solution: { unique_name: 'ContosoCore', display_name: 'Contoso Core Architecture', version: '1.0.0.0', is_managed: false },
  entities: [
    {
      logical_name: 'cr_invoice',
      display_name: 'Invoice',
      attributes: [
        { logical_name: 'cr_invoiceid', display_name: 'Invoice ID', type: 'Uniqueidentifier', required_level: 'SystemRequired' },
        { logical_name: 'cr_name', display_name: 'Invoice Number', type: 'String', required_level: 'ApplicationRequired' },
        { logical_name: 'cr_total_amount', display_name: 'Total Amount', type: 'Money', required_level: 'None' },
        { logical_name: 'cr_legacy_code', display_name: 'Legacy Code', type: 'String', required_level: 'None' },
      ],
    },
    { logical_name: 'cr_obsolete_log', display_name: 'Obsolete Log', attributes: [] }
  ],
  flows: [
    {
      name: 'ProcessInvoices',
      display_name: 'Process Invoices',
      actions: [{ name: 'GetCustomer' }, { name: 'SendEmail' }],
    }
  ],
  security_roles: [
    {
      name: 'Invoice Manager',
      table_privileges: [{ table: 'cr_invoice', delete: 'BU' }]
    }
  ],
  option_sets: [
    {
      name: 'cr_invoice_status',
      options: [{ value: 1, label: 'Draft' }, { value: 2, label: 'Approved' }, { value: 3, label: 'Deprecated' }]
    }
  ]
};

const targetAst = {
  solution: { unique_name: 'ContosoCore', display_name: 'Contoso Core Architecture', version: '2.0.0.0', is_managed: false },
  entities: [
    {
      logical_name: 'cr_invoice',
      display_name: 'Invoice',
      attributes: [
        { logical_name: 'cr_invoiceid', display_name: 'Invoice ID', type: 'Uniqueidentifier', required_level: 'SystemRequired' },
        { logical_name: 'cr_name', display_name: 'Invoice Number', type: 'String', required_level: 'ApplicationRequired' },
        { logical_name: 'cr_total_amount', display_name: 'Total Amount', type: 'Money', required_level: 'ApplicationRequired' }, // Tightened!
        { logical_name: 'cr_currency', display_name: 'Currency', type: 'Lookup', required_level: 'None' }, // Added!
      ],
    },
    { logical_name: 'cr_payment', display_name: 'Payment Record', attributes: [] } // Added table!
  ],
  flows: [
    {
      name: 'ProcessInvoices',
      display_name: 'Process Invoices',
      actions: [{ name: 'GetCustomer' }, { name: 'LogToAudit' }, { name: 'SendEmail' }], // Added action!
    }
  ],
  security_roles: [
    {
      name: 'Invoice Manager',
      table_privileges: [{ table: 'cr_invoice', delete: 'User' }] // Downgraded!
    }
  ],
  option_sets: [
    {
      name: 'cr_invoice_status',
      options: [{ value: 1, label: 'Draft' }, { value: 2, label: 'Approved' }] // Option 3 removed!
    }
  ]
};

const diff = computeSolutionDiff(baseAst, targetAst);

console.log('Metrics computed:');
console.log(JSON.stringify(diff.metrics, null, 2));

assert.strictEqual(diff.versionChange.from, '1.0.0.0');
assert.strictEqual(diff.versionChange.to, '2.0.0.0');
assert.strictEqual(diff.versionChange.isUpgrade, true);

// Table tests
const droppedTable = diff.entities.find((e) => e.logical_name === 'cr_obsolete_log');
assert(droppedTable && droppedTable.status === 'removed' && droppedTable.isBreaking, 'Dropped table should be breaking');

const addedTable = diff.entities.find((e) => e.logical_name === 'cr_payment');
assert(addedTable && addedTable.status === 'added', 'cr_payment should be added');

const modTable = diff.entities.find((e) => e.logical_name === 'cr_invoice');
assert(modTable && modTable.status === 'modified', 'cr_invoice should be modified');

const droppedCol = modTable.attributes.find((a) => a.logical_name === 'cr_legacy_code');
assert(droppedCol && droppedCol.status === 'removed' && droppedCol.isBreaking, 'Dropped column should be breaking');

const tightenedCol = modTable.attributes.find((a) => a.logical_name === 'cr_total_amount');
assert(tightenedCol && tightenedCol.status === 'modified' && tightenedCol.isBreaking, 'Tightened column should be breaking');

const addedCol = modTable.attributes.find((a) => a.logical_name === 'cr_currency');
assert(addedCol && addedCol.status === 'added', 'cr_currency should be added');

// Flow tests
const flow = diff.flows.find((f) => f.name === 'ProcessInvoices');
assert(flow && flow.status === 'modified' && flow.addedActionsCount === 1, 'Flow should have 1 added action');

// Security Role Downgrade test
const role = diff.securityRoles.find((s) => s.name === 'Invoice Manager');
assert(role && role.status === 'modified' && role.isBreaking, 'Role downgrade should be breaking');

// OptionSet test
const opt = diff.optionSets.find((o) => o.name === 'cr_invoice_status');
assert(opt && opt.status === 'modified' && opt.isBreaking, 'Removing option should be breaking');

// Breaking changes assertions
assert(diff.breakingChanges.length >= 4, `Expected at least 4 breaking changes, got ${diff.breakingChanges.length}`);
console.log(`✓ Detected ${diff.breakingChanges.length} breaking change and warning alerts!`);

console.log('--- All Solution Diff Engine Tests Passed Successfully! ---');

