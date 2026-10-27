import {
  SolutionAST,
  DataverseEntity,
  DataverseAttribute,
  DataverseRelationship,
  CloudFlow,
  FlowTrigger,
  FlowAction,
  CanvasApp,
  EnvironmentVariable,
  WebResource,
  BusinessRule,
  SecurityRole,
  SecurityRoleTablePrivilege,
  OptionSet,
} from '../../types/solution';
import {
  SolutionDiffResult,
  DiffMetricSummary,
  EntityDiff,
  AttributeDiff,
  RelationshipDiff,
  FlowDiff,
  FlowTriggerDiff,
  FlowActionDiff,
  CanvasAppDiff,
  EnvVarDiff,
  WebResourceDiff,
  BusinessRuleDiff,
  SecurityRoleDiff,
  TablePrivilegeDiff,
  PrivilegeDiff,
  OptionSetDiff,
  BreakingChangeItem,
  PropertyDiff,
} from '../../types/diff';
import { computeTextDiff } from './textDiff';

const PRIVILEGE_RANK: Record<string, number> = {
  None: 0,
  User: 1,
  BU: 2,
  Parent: 3,
  Org: 4,
};

function comparePrivilege(
  privilegeName: 'create' | 'read' | 'write' | 'delete' | 'append' | 'append_to' | 'assign' | 'share',
  baseLevel: string = 'None',
  targetLevel: string = 'None'
): PrivilegeDiff | null {
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

/**
 * Computes deep deterministic differences between two SolutionAST versions.
 */
export function computeSolutionDiff(
  baseAst: SolutionAST,
  targetAst: SolutionAST
): SolutionDiffResult {
  const breakingChanges: BreakingChangeItem[] = [];

  // 1. Solution Metadata
  const baseMeta = baseAst.solution;
  const targetMeta = targetAst.solution;
  const isUpgrade = targetMeta.version.localeCompare(baseMeta.version, undefined, { numeric: true }) > 0;

  // 2. Dataverse Entities Diff
  const entityDiffs: EntityDiff[] = [];
  const baseEntityMap = new Map<string, DataverseEntity>(
    (baseAst.entities || []).map((e) => [e.logical_name.toLowerCase(), e])
  );
  const targetEntityMap = new Map<string, DataverseEntity>(
    (targetAst.entities || []).map((e) => [e.logical_name.toLowerCase(), e])
  );

  const allEntityKeys = Array.from(
    new Set([...baseEntityMap.keys(), ...targetEntityMap.keys()])
  ).sort();

  for (const key of allEntityKeys) {
    const baseEntity = baseEntityMap.get(key);
    const targetEntity = targetEntityMap.get(key);

    if (!baseEntity && targetEntity) {
      entityDiffs.push({
        logical_name: targetEntity.logical_name,
        display_name: targetEntity.display_name,
        status: 'added',
        targetEntity,
        propertyChanges: [],
        attributes: (targetEntity.attributes || []).map((a) => ({
          logical_name: a.logical_name,
          schema_name: a.schema_name,
          display_name: a.display_name,
          status: 'added',
          targetAttribute: a,
          propertyChanges: [],
          isBreaking: false,
        })),
        relationships: (targetEntity.relationships || []).map((r) => ({
          schema_name: r.schema_name,
          status: 'added',
          relationship_type: r.relationship_type,
          primary_entity: r.primary_entity,
          referencing_entity: r.referencing_entity,
          propertyChanges: [],
        })),
        addedAttributesCount: (targetEntity.attributes || []).length,
        removedAttributesCount: 0,
        modifiedAttributesCount: 0,
        isBreaking: false,
      });
    } else if (baseEntity && !targetEntity) {
      entityDiffs.push({
        logical_name: baseEntity.logical_name,
        display_name: baseEntity.display_name,
        status: 'removed',
        baseEntity,
        propertyChanges: [],
        attributes: (baseEntity.attributes || []).map((a) => ({
          logical_name: a.logical_name,
          schema_name: a.schema_name,
          display_name: a.display_name,
          status: 'removed',
          baseAttribute: a,
          propertyChanges: [],
          isBreaking: true,
          breakingReason: `Table '${baseEntity.display_name}' was removed from the solution.`,
        })),
        relationships: [],
        addedAttributesCount: 0,
        removedAttributesCount: (baseEntity.attributes || []).length,
        modifiedAttributesCount: 0,
        isBreaking: true,
        breakingReason: `Table '${baseEntity.display_name}' (${baseEntity.logical_name}) was deleted or removed from the solution.`,
      });

      breakingChanges.push({
        id: `break_entity_del_${baseEntity.logical_name}`,
        category: 'table',
        severity: 'breaking',
        componentName: baseEntity.display_name,
        componentIdentifier: baseEntity.logical_name,
        title: `Deleted Dataverse Table: ${baseEntity.display_name}`,
        description: `Table '${baseEntity.display_name}' (${baseEntity.logical_name}) is present in the base solution but missing in the target version.`,
        impactAssessment: `Any flows, canvas apps, model-driven forms, plugins, or reporting queries referencing this table will fail immediately upon deployment.`,
      });
    } else if (baseEntity && targetEntity) {
      // Both exist: check attributes and property changes
      const propChanges: PropertyDiff[] = [];
      if (baseEntity.display_name !== targetEntity.display_name) {
        propChanges.push({
          propertyName: 'Display Name',
          baseValue: baseEntity.display_name,
          targetValue: targetEntity.display_name,
        });
      }
      if (baseEntity.description !== targetEntity.description) {
        propChanges.push({
          propertyName: 'Description',
          baseValue: baseEntity.description,
          targetValue: targetEntity.description,
        });
      }

      // Attributes diff
      const baseAttrMap = new Map((baseEntity.attributes || []).map((a) => [a.logical_name.toLowerCase(), a]));
      const targetAttrMap = new Map((targetEntity.attributes || []).map((a) => [a.logical_name.toLowerCase(), a]));
      const allAttrKeys = Array.from(new Set([...baseAttrMap.keys(), ...targetAttrMap.keys()])).sort();

      const attributeDiffs: AttributeDiff[] = [];
      let addedAttrs = 0;
      let removedAttrs = 0;
      let modifiedAttrs = 0;
      let tableHasBreaking = false;
      let tableBreakingReason: string | undefined;

      for (const aKey of allAttrKeys) {
        const bAttr = baseAttrMap.get(aKey);
        const tAttr = targetAttrMap.get(aKey);

        if (!bAttr && tAttr) {
          addedAttrs++;
          attributeDiffs.push({
            logical_name: tAttr.logical_name,
            schema_name: tAttr.schema_name,
            display_name: tAttr.display_name,
            status: 'added',
            targetAttribute: tAttr,
            propertyChanges: [],
            isBreaking: false,
          });
        } else if (bAttr && !tAttr) {
          removedAttrs++;
          tableHasBreaking = true;
          tableBreakingReason = `Column '${bAttr.display_name}' was removed.`;
          attributeDiffs.push({
            logical_name: bAttr.logical_name,
            schema_name: bAttr.schema_name,
            display_name: bAttr.display_name,
            status: 'removed',
            baseAttribute: bAttr,
            propertyChanges: [],
            isBreaking: true,
            breakingReason: `Column '${bAttr.display_name}' (${bAttr.logical_name}) was deleted.`,
          });

          breakingChanges.push({
            id: `break_col_del_${baseEntity.logical_name}_${bAttr.logical_name}`,
            category: 'column',
            severity: 'breaking',
            componentName: `${baseEntity.display_name} -> ${bAttr.display_name}`,
            componentIdentifier: `${baseEntity.logical_name}.${bAttr.logical_name}`,
            title: `Deleted Column: ${bAttr.display_name} on ${baseEntity.display_name}`,
            description: `Column '${bAttr.display_name}' (${bAttr.logical_name}) on table '${baseEntity.display_name}' was removed.`,
            impactAssessment: `Any integration, cloud flow, power app, or business rule reading/writing to this field will encounter runtime schema errors.`,
          });
        } else if (bAttr && tAttr) {
          const attrPropChanges: PropertyDiff[] = [];
          let isColBreaking = false;
          let colBreakingReason: string | undefined;

          if (bAttr.type !== tAttr.type) {
            attrPropChanges.push({ propertyName: 'Type', baseValue: bAttr.type, targetValue: tAttr.type });
            isColBreaking = true;
            colBreakingReason = `Data type changed from '${bAttr.type}' to '${tAttr.type}'.`;
          }
          if (bAttr.required_level !== tAttr.required_level) {
            attrPropChanges.push({ propertyName: 'Required Level', baseValue: bAttr.required_level || 'None', targetValue: tAttr.required_level || 'None' });
            if ((tAttr.required_level === 'ApplicationRequired' || tAttr.required_level === 'SystemRequired') &&
                (!bAttr.required_level || bAttr.required_level === 'None' || bAttr.required_level === 'Recommended')) {
              isColBreaking = true;
              colBreakingReason = `Field requirement tightened to '${tAttr.required_level}'. Existing create operations omitting this field will fail.`;
            }
          }
          if (bAttr.lookup_target_entity !== tAttr.lookup_target_entity) {
            attrPropChanges.push({ propertyName: 'Lookup Target', baseValue: bAttr.lookup_target_entity, targetValue: tAttr.lookup_target_entity });
            isColBreaking = true;
            colBreakingReason = `Lookup target entity changed from '${bAttr.lookup_target_entity}' to '${tAttr.lookup_target_entity}'.`;
          }
          if (bAttr.display_name !== tAttr.display_name) {
            attrPropChanges.push({ propertyName: 'Display Name', baseValue: bAttr.display_name, targetValue: tAttr.display_name });
          }

          if (attrPropChanges.length > 0) {
            modifiedAttrs++;
            if (isColBreaking) {
              tableHasBreaking = true;
              tableBreakingReason = colBreakingReason;
              breakingChanges.push({
                id: `break_col_mod_${baseEntity.logical_name}_${bAttr.logical_name}`,
                category: 'column',
                severity: 'breaking',
                componentName: `${baseEntity.display_name} -> ${bAttr.display_name}`,
                componentIdentifier: `${baseEntity.logical_name}.${bAttr.logical_name}`,
                title: `Breaking Column Modification: ${bAttr.display_name}`,
                description: colBreakingReason || 'Column requirement or type was modified in a breaking manner.',
                impactAssessment: `Existing downstream integrations or records may fail validation constraints.`,
              });
            }
            attributeDiffs.push({
              logical_name: tAttr.logical_name,
              schema_name: tAttr.schema_name,
              display_name: tAttr.display_name,
              status: 'modified',
              baseAttribute: bAttr,
              targetAttribute: tAttr,
              propertyChanges: attrPropChanges,
              isBreaking: isColBreaking,
              breakingReason: colBreakingReason,
            });
          } else {
            attributeDiffs.push({
              logical_name: tAttr.logical_name,
              schema_name: tAttr.schema_name,
              display_name: tAttr.display_name,
              status: 'unchanged',
              baseAttribute: bAttr,
              targetAttribute: tAttr,
              propertyChanges: [],
              isBreaking: false,
            });
          }
        }
      }

      // Relationships diff
      const baseRelMap = new Map((baseEntity.relationships || []).map((r) => [r.schema_name.toLowerCase(), r]));
      const targetRelMap = new Map((targetEntity.relationships || []).map((r) => [r.schema_name.toLowerCase(), r]));
      const allRelKeys = Array.from(new Set([...baseRelMap.keys(), ...targetRelMap.keys()])).sort();
      const relationshipDiffs: RelationshipDiff[] = [];

      for (const rKey of allRelKeys) {
        const bRel = baseRelMap.get(rKey);
        const tRel = targetRelMap.get(rKey);

        if (!bRel && tRel) {
          relationshipDiffs.push({
            schema_name: tRel.schema_name,
            status: 'added',
            relationship_type: tRel.relationship_type,
            primary_entity: tRel.primary_entity,
            referencing_entity: tRel.referencing_entity,
            propertyChanges: [],
          });
        } else if (bRel && !tRel) {
          relationshipDiffs.push({
            schema_name: bRel.schema_name,
            status: 'removed',
            relationship_type: bRel.relationship_type,
            primary_entity: bRel.primary_entity,
            referencing_entity: bRel.referencing_entity,
            propertyChanges: [],
          });
        } else if (bRel && tRel) {
          const relProps: PropertyDiff[] = [];
          if (bRel.cascade_delete !== tRel.cascade_delete) {
            relProps.push({ propertyName: 'Cascade Delete', baseValue: bRel.cascade_delete, targetValue: tRel.cascade_delete });
          }
          if (bRel.cascade_assign !== tRel.cascade_assign) {
            relProps.push({ propertyName: 'Cascade Assign', baseValue: bRel.cascade_assign, targetValue: tRel.cascade_assign });
          }
          relationshipDiffs.push({
            schema_name: tRel.schema_name,
            status: relProps.length > 0 ? 'modified' : 'unchanged',
            relationship_type: tRel.relationship_type,
            primary_entity: tRel.primary_entity,
            referencing_entity: tRel.referencing_entity,
            propertyChanges: relProps,
          });
        }
      }

      const isModified =
        propChanges.length > 0 ||
        addedAttrs > 0 ||
        removedAttrs > 0 ||
        modifiedAttrs > 0 ||
        relationshipDiffs.some((r) => r.status !== 'unchanged');

      entityDiffs.push({
        logical_name: targetEntity.logical_name,
        display_name: targetEntity.display_name,
        status: isModified ? 'modified' : 'unchanged',
        baseEntity,
        targetEntity,
        propertyChanges: propChanges,
        attributes: attributeDiffs,
        relationships: relationshipDiffs,
        addedAttributesCount: addedAttrs,
        removedAttributesCount: removedAttrs,
        modifiedAttributesCount: modifiedAttrs,
        isBreaking: tableHasBreaking,
        breakingReason: tableBreakingReason,
      });
    }
  }

  // 3. Cloud Flows Diff
  const flowDiffs: FlowDiff[] = [];
  const baseFlowMap = new Map((baseAst.flows || []).map((f) => [f.name.toLowerCase(), f]));
  const targetFlowMap = new Map((targetAst.flows || []).map((f) => [f.name.toLowerCase(), f]));
  const allFlowKeys = Array.from(new Set([...baseFlowMap.keys(), ...targetFlowMap.keys()])).sort();

  for (const fKey of allFlowKeys) {
    const baseFlow = baseFlowMap.get(fKey);
    const targetFlow = targetFlowMap.get(fKey);

    if (!baseFlow && targetFlow) {
      flowDiffs.push({
        id: targetFlow.id,
        name: targetFlow.name,
        display_name: targetFlow.display_name || targetFlow.name,
        status: 'added',
        targetFlow,
        propertyChanges: [],
        triggers: (targetFlow.triggers || []).map((t) => ({
          name: t.name,
          status: 'added',
          targetTrigger: t,
          propertyChanges: [],
        })),
        actions: (targetFlow.actions || []).map((a) => ({
          name: a.name,
          type: a.type,
          status: 'added',
          targetAction: a,
          propertyChanges: [],
        })),
        addedActionsCount: (targetFlow.actions || []).length,
        removedActionsCount: 0,
        modifiedActionsCount: 0,
        addedConnectors: (targetFlow.connection_references || []).map((c) => c.connector_id || c.logical_name),
        removedConnectors: [],
        isBreaking: false,
      });
    } else if (baseFlow && !targetFlow) {
      flowDiffs.push({
        id: baseFlow.id,
        name: baseFlow.name,
        display_name: baseFlow.display_name || baseFlow.name,
        status: 'removed',
        baseFlow,
        propertyChanges: [],
        triggers: [],
        actions: [],
        addedActionsCount: 0,
        removedActionsCount: (baseFlow.actions || []).length,
        modifiedActionsCount: 0,
        addedConnectors: [],
        removedConnectors: (baseFlow.connection_references || []).map((c) => c.connector_id || c.logical_name),
        isBreaking: true,
        breakingReason: `Cloud Flow '${baseFlow.display_name || baseFlow.name}' was removed.`,
      });

      breakingChanges.push({
        id: `break_flow_del_${baseFlow.name}`,
        category: 'flow',
        severity: 'breaking',
        componentName: baseFlow.display_name || baseFlow.name,
        componentIdentifier: baseFlow.name,
        title: `Deleted Cloud Flow: ${baseFlow.display_name || baseFlow.name}`,
        description: `Cloud Flow '${baseFlow.display_name || baseFlow.name}' was deleted in the target solution.`,
        impactAssessment: `Automations dependent on this flow or users relying on child flow calls will experience breakage.`,
      });
    } else if (baseFlow && targetFlow) {
      const flowPropChanges: PropertyDiff[] = [];
      let flowIsBreaking = false;
      let flowBreakingReason: string | undefined;

      // Triggers diff
      const triggerDiffs: FlowTriggerDiff[] = [];
      const baseTrigger = baseFlow.triggers?.[0];
      const targetTrigger = targetFlow.triggers?.[0];

      if (baseTrigger && targetTrigger) {
        const trigProps: PropertyDiff[] = [];
        if (baseTrigger.type !== targetTrigger.type) {
          trigProps.push({ propertyName: 'Trigger Type', baseValue: baseTrigger.type, targetValue: targetTrigger.type });
        }
        if (baseTrigger.filter_expression !== targetTrigger.filter_expression) {
          trigProps.push({ propertyName: 'Filter Expression', baseValue: baseTrigger.filter_expression || '(none)', targetValue: targetTrigger.filter_expression || '(none)' });
          // If a filter expression was removed on a Dataverse trigger, risk of runaway executions
          if (baseTrigger.filter_expression && !targetTrigger.filter_expression) {
            flowIsBreaking = true;
            flowBreakingReason = `Trigger filter expression was removed, creating risk of infinite triggering loops.`;
            breakingChanges.push({
              id: `break_flow_trigger_${targetFlow.name}`,
              category: 'flow',
              severity: 'warning',
              componentName: targetFlow.display_name || targetFlow.name,
              componentIdentifier: targetFlow.name,
              title: `Removed Trigger Filter Expression: ${targetFlow.display_name || targetFlow.name}`,
              description: `The OData filter expression on trigger '${targetTrigger.name}' was removed in target version.`,
              impactAssessment: `The flow will now trigger on every update to the table, significantly increasing run volume and risk of throttling or recursion.`,
            });
          }
        }
        triggerDiffs.push({
          name: targetTrigger.name,
          status: trigProps.length > 0 ? 'modified' : 'unchanged',
          baseTrigger,
          targetTrigger,
          propertyChanges: trigProps,
          isBreaking: flowIsBreaking,
          breakingReason: flowBreakingReason,
        });
      }

      // Actions diff
      const baseActionMap = new Map((baseFlow.actions || []).map((a) => [a.name.toLowerCase(), a]));
      const targetActionMap = new Map((targetFlow.actions || []).map((a) => [a.name.toLowerCase(), a]));
      const allActionKeys = Array.from(new Set([...baseActionMap.keys(), ...targetActionMap.keys()])).sort();

      const actionDiffs: FlowActionDiff[] = [];
      let addedActions = 0;
      let removedActions = 0;
      let modifiedActions = 0;

      for (const aKey of allActionKeys) {
        const bAct = baseActionMap.get(aKey);
        const tAct = targetActionMap.get(aKey);

        if (!bAct && tAct) {
          addedActions++;
          actionDiffs.push({
            name: tAct.name,
            type: tAct.type,
            status: 'added',
            targetAction: tAct,
            propertyChanges: [],
          });
        } else if (bAct && !tAct) {
          removedActions++;
          actionDiffs.push({
            name: bAct.name,
            type: bAct.type,
            status: 'removed',
            baseAction: bAct,
            propertyChanges: [],
          });
        } else if (bAct && tAct) {
          const actProps: PropertyDiff[] = [];
          if (bAct.type !== tAct.type) {
            actProps.push({ propertyName: 'Action Type', baseValue: bAct.type, targetValue: tAct.type });
          }
          if (JSON.stringify(bAct.inputs) !== JSON.stringify(tAct.inputs)) {
            actProps.push({ propertyName: 'Inputs/Parameters', baseValue: 'Configured', targetValue: 'Modified' });
          }
          if (actProps.length > 0) {
            modifiedActions++;
            actionDiffs.push({
              name: tAct.name,
              type: tAct.type,
              status: 'modified',
              baseAction: bAct,
              targetAction: tAct,
              propertyChanges: actProps,
            });
          } else {
            actionDiffs.push({
              name: tAct.name,
              type: tAct.type,
              status: 'unchanged',
              baseAction: bAct,
              targetAction: tAct,
              propertyChanges: [],
            });
          }
        }
      }

      // Connector reference diff
      const baseConns = new Set((baseFlow.connection_references || []).map((c) => c.connector_id || c.logical_name));
      const targetConns = new Set((targetFlow.connection_references || []).map((c) => c.connector_id || c.logical_name));
      const addedConnectors = Array.from(targetConns).filter((c) => !baseConns.has(c));
      const removedConnectors = Array.from(baseConns).filter((c) => !targetConns.has(c));

      const isFlowModified =
        triggerDiffs.some((t) => t.status !== 'unchanged') ||
        addedActions > 0 ||
        removedActions > 0 ||
        modifiedActions > 0 ||
        addedConnectors.length > 0 ||
        removedConnectors.length > 0;

      flowDiffs.push({
        id: targetFlow.id,
        name: targetFlow.name,
        display_name: targetFlow.display_name || targetFlow.name,
        status: isFlowModified ? 'modified' : 'unchanged',
        baseFlow,
        targetFlow,
        propertyChanges: flowPropChanges,
        triggers: triggerDiffs,
        actions: actionDiffs,
        addedActionsCount: addedActions,
        removedActionsCount: removedActions,
        modifiedActionsCount: modifiedActions,
        addedConnectors,
        removedConnectors,
        isBreaking: flowIsBreaking,
        breakingReason: flowBreakingReason,
      });
    }
  }

  // 4. Canvas Apps Diff
  const canvasDiffs: CanvasAppDiff[] = [];
  const baseAppMap = new Map((baseAst.canvas_apps || []).map((a) => [a.name.toLowerCase(), a]));
  const targetAppMap = new Map((targetAst.canvas_apps || []).map((a) => [a.name.toLowerCase(), a]));
  const allAppKeys = Array.from(new Set([...baseAppMap.keys(), ...targetAppMap.keys()])).sort();

  for (const aKey of allAppKeys) {
    const baseApp = baseAppMap.get(aKey);
    const targetApp = targetAppMap.get(aKey);

    if (!baseApp && targetApp) {
      canvasDiffs.push({
        name: targetApp.name,
        display_name: targetApp.display_name,
        status: 'added',
        targetApp,
        propertyChanges: [],
        addedScreens: (targetApp.screens || []).map((s) => s.name),
        removedScreens: [],
        addedDataSources: targetApp.data_sources || [],
        removedDataSources: [],
      });
    } else if (baseApp && !targetApp) {
      canvasDiffs.push({
        name: baseApp.name,
        display_name: baseApp.display_name,
        status: 'removed',
        baseApp,
        propertyChanges: [],
        addedScreens: [],
        removedScreens: (baseApp.screens || []).map((s) => s.name),
        addedDataSources: [],
        removedDataSources: baseApp.data_sources || [],
      });
    } else if (baseApp && targetApp) {
      const baseScreens = new Set((baseApp.screens || []).map((s) => s.name));
      const targetScreens = new Set((targetApp.screens || []).map((s) => s.name));
      const addedScreens = Array.from(targetScreens).filter((s) => !baseScreens.has(s));
      const removedScreens = Array.from(baseScreens).filter((s) => !targetScreens.has(s));

      const baseDS = new Set(baseApp.data_sources || []);
      const targetDS = new Set(targetApp.data_sources || []);
      const addedDataSources = Array.from(targetDS).filter((d) => !baseDS.has(d));
      const removedDataSources = Array.from(baseDS).filter((d) => !targetDS.has(d));

      const isAppMod =
        addedScreens.length > 0 ||
        removedScreens.length > 0 ||
        addedDataSources.length > 0 ||
        removedDataSources.length > 0;

      canvasDiffs.push({
        name: targetApp.name,
        display_name: targetApp.display_name,
        status: isAppMod ? 'modified' : 'unchanged',
        baseApp,
        targetApp,
        propertyChanges: [],
        addedScreens,
        removedScreens,
        addedDataSources,
        removedDataSources,
      });
    }
  }

  // 5. Environment Variables Diff
  const envVarDiffs: EnvVarDiff[] = [];
  const baseEnvMap = new Map((baseAst.environment_variables || []).map((v) => [v.schema_name.toLowerCase(), v]));
  const targetEnvMap = new Map((targetAst.environment_variables || []).map((v) => [v.schema_name.toLowerCase(), v]));
  const allEnvKeys = Array.from(new Set([...baseEnvMap.keys(), ...targetEnvMap.keys()])).sort();

  for (const vKey of allEnvKeys) {
    const baseVar = baseEnvMap.get(vKey);
    const targetVar = targetEnvMap.get(vKey);

    if (!baseVar && targetVar) {
      envVarDiffs.push({
        schema_name: targetVar.schema_name,
        display_name: targetVar.display_name,
        status: 'added',
        targetVar,
        propertyChanges: [],
      });
    } else if (baseVar && !targetVar) {
      envVarDiffs.push({
        schema_name: baseVar.schema_name,
        display_name: baseVar.display_name,
        status: 'removed',
        baseVar,
        propertyChanges: [],
        isBreaking: true,
      });
      breakingChanges.push({
        id: `break_env_del_${baseVar.schema_name}`,
        category: 'column',
        severity: 'warning',
        componentName: baseVar.display_name,
        componentIdentifier: baseVar.schema_name,
        title: `Removed Environment Variable: ${baseVar.display_name}`,
        description: `Environment variable '${baseVar.display_name}' (${baseVar.schema_name}) was deleted.`,
        impactAssessment: `Any flows or apps relying on this environment variable for configuration will need updates.`,
      });
    } else if (baseVar && targetVar) {
      const vProps: PropertyDiff[] = [];
      let isVarBreaking = false;
      if (baseVar.type !== targetVar.type) {
        vProps.push({ propertyName: 'Type', baseValue: baseVar.type, targetValue: targetVar.type });
        isVarBreaking = true;
      }
      if (baseVar.default_value !== targetVar.default_value) {
        vProps.push({ propertyName: 'Default Value', baseValue: baseVar.default_value, targetValue: targetVar.default_value });
      }
      envVarDiffs.push({
        schema_name: targetVar.schema_name,
        display_name: targetVar.display_name,
        status: vProps.length > 0 ? 'modified' : 'unchanged',
        baseVar,
        targetVar,
        propertyChanges: vProps,
        isBreaking: isVarBreaking,
      });
    }
  }

  // 6. Web Resources & Scripts Diff
  const wrDiffs: WebResourceDiff[] = [];
  const baseWRMap = new Map((baseAst.web_resources || []).map((w) => [w.name.toLowerCase(), w]));
  const targetWRMap = new Map((targetAst.web_resources || []).map((w) => [w.name.toLowerCase(), w]));
  const allWRKeys = Array.from(new Set([...baseWRMap.keys(), ...targetWRMap.keys()])).sort();

  for (const wKey of allWRKeys) {
    const baseWR = baseWRMap.get(wKey);
    const targetWR = targetWRMap.get(wKey);

    if (!baseWR && targetWR) {
      wrDiffs.push({
        id: targetWR.id,
        name: targetWR.name,
        display_name: targetWR.display_name || targetWR.name,
        resource_type: targetWR.type,
        status: 'added',
        targetResource: targetWR,
        propertyChanges: [],
        sizeDeltaBytes: targetWR.file_size_bytes,
        deprecatedXrmIntroduced: Boolean(targetWR.uses_deprecated_xrm),
        directDomIntroduced: Boolean(targetWR.uses_direct_dom),
        isBreaking: Boolean(targetWR.uses_deprecated_xrm || targetWR.uses_direct_dom),
        breakingReason: targetWR.uses_deprecated_xrm
          ? 'Uses deprecated Xrm.Page APIs'
          : targetWR.uses_direct_dom
          ? 'Uses unsupported direct DOM manipulation'
          : undefined,
      });
    } else if (baseWR && !targetWR) {
      wrDiffs.push({
        id: baseWR.id,
        name: baseWR.name,
        display_name: baseWR.display_name || baseWR.name,
        resource_type: baseWR.type,
        status: 'removed',
        baseResource: baseWR,
        propertyChanges: [],
        sizeDeltaBytes: -baseWR.file_size_bytes,
        deprecatedXrmIntroduced: false,
        directDomIntroduced: false,
        isBreaking: true,
        breakingReason: `Web resource '${baseWR.name}' was deleted. Form event handlers bound to it may fail.`,
      });
    } else if (baseWR && targetWR) {
      const wrProps: PropertyDiff[] = [];
      const deprecatedIntro = !baseWR.uses_deprecated_xrm && Boolean(targetWR.uses_deprecated_xrm);
      const directDomIntro = !baseWR.uses_direct_dom && Boolean(targetWR.uses_direct_dom);
      const sizeDelta = (targetWR.file_size_bytes || 0) - (baseWR.file_size_bytes || 0);

      if (baseWR.type !== targetWR.type) {
        wrProps.push({ propertyName: 'Resource Type', baseValue: baseWR.type, targetValue: targetWR.type });
      }
      if (deprecatedIntro) {
        wrProps.push({ propertyName: 'Deprecated Xrm', baseValue: 'Clean', targetValue: 'Deprecated APIs Used' });
      }
      if (directDomIntro) {
        wrProps.push({ propertyName: 'Direct DOM Access', baseValue: 'Clean', targetValue: 'Direct DOM Detected' });
      }

      let textDiffLines = undefined;
      const hasContentChange = baseWR.content_text !== targetWR.content_text;
      if (hasContentChange && (baseWR.content_text || targetWR.content_text)) {
        textDiffLines = computeTextDiff(baseWR.content_text || '', targetWR.content_text || '');
      }

      const isMod = wrProps.length > 0 || hasContentChange || Math.abs(sizeDelta) > 0;
      const isBreaking = deprecatedIntro || directDomIntro;

      if (isBreaking) {
        breakingChanges.push({
          id: `break_wr_${targetWR.name}`,
          category: 'code',
          severity: 'warning',
          componentName: targetWR.name,
          componentIdentifier: targetWR.name,
          title: `Non-Compliant Client Script Introduced: ${targetWR.name}`,
          description: deprecatedIntro
            ? `Deprecated Xrm.Page references were added to ${targetWR.name}.`
            : `Direct DOM manipulation (document.getElementById, etc.) was added to ${targetWR.name}.`,
          impactAssessment: `May cause client-side runtime errors in Modern Fluent Unified Interface forms.`,
        });
      }

      wrDiffs.push({
        id: targetWR.id,
        name: targetWR.name,
        display_name: targetWR.display_name || targetWR.name,
        resource_type: targetWR.type,
        status: isMod ? 'modified' : 'unchanged',
        baseResource: baseWR,
        targetResource: targetWR,
        propertyChanges: wrProps,
        sizeDeltaBytes: sizeDelta,
        deprecatedXrmIntroduced: deprecatedIntro,
        directDomIntroduced: directDomIntro,
        textDiffLines,
        isBreaking,
        breakingReason: isBreaking ? 'Introduced deprecated or unsupported DOM script methods' : undefined,
      });
    }
  }

  // 7. Business Rules Diff
  const brDiffs: BusinessRuleDiff[] = [];
  const baseBRMap = new Map((baseAst.business_rules || []).map((b) => [b.id.toLowerCase(), b]));
  const targetBRMap = new Map((targetAst.business_rules || []).map((b) => [b.id.toLowerCase(), b]));
  const allBRKeys = Array.from(new Set([...baseBRMap.keys(), ...targetBRMap.keys()])).sort();

  for (const bKey of allBRKeys) {
    const baseBR = baseBRMap.get(bKey);
    const targetBR = targetBRMap.get(bKey);

    if (!baseBR && targetBR) {
      brDiffs.push({
        id: targetBR.id,
        name: targetBR.name,
        table: targetBR.table,
        status: 'added',
        targetRule: targetBR,
        propertyChanges: [],
        conditionsChanged: false,
        actionsChanged: false,
      });
    } else if (baseBR && !targetBR) {
      brDiffs.push({
        id: baseBR.id,
        name: baseBR.name,
        table: baseBR.table,
        status: 'removed',
        baseRule: baseBR,
        propertyChanges: [],
        conditionsChanged: false,
        actionsChanged: false,
      });
    } else if (baseBR && targetBR) {
      const brProps: PropertyDiff[] = [];
      if (baseBR.scope !== targetBR.scope) {
        brProps.push({ propertyName: 'Scope', baseValue: baseBR.scope, targetValue: targetBR.scope });
      }
      if (baseBR.state !== targetBR.state) {
        brProps.push({ propertyName: 'State', baseValue: baseBR.state, targetValue: targetBR.state });
      }
      const condsChanged = JSON.stringify(baseBR.conditions) !== JSON.stringify(targetBR.conditions);
      const actsChanged = JSON.stringify(baseBR.actions) !== JSON.stringify(targetBR.actions);

      brDiffs.push({
        id: targetBR.id,
        name: targetBR.name,
        table: targetBR.table,
        status: (brProps.length > 0 || condsChanged || actsChanged) ? 'modified' : 'unchanged',
        baseRule: baseBR,
        targetRule: targetBR,
        propertyChanges: brProps,
        conditionsChanged: condsChanged,
        actionsChanged: actsChanged,
      });
    }
  }

  // 8. Security Roles Diff
  const secDiffs: SecurityRoleDiff[] = [];
  const baseSecMap = new Map((baseAst.security_roles || []).map((s) => [s.name.toLowerCase(), s]));
  const targetSecMap = new Map((targetAst.security_roles || []).map((s) => [s.name.toLowerCase(), s]));
  const allSecKeys = Array.from(new Set([...baseSecMap.keys(), ...targetSecMap.keys()])).sort();

  for (const sKey of allSecKeys) {
    const baseRole = baseSecMap.get(sKey);
    const targetRole = targetSecMap.get(sKey);

    if (!baseRole && targetRole) {
      secDiffs.push({
        id: targetRole.id,
        name: targetRole.name,
        status: 'added',
        targetRole,
        propertyChanges: [],
        tablePrivilegeDiffs: [],
        addedMiscPrivileges: targetRole.misc_privileges || [],
        removedMiscPrivileges: [],
        isBreaking: false,
      });
    } else if (baseRole && !targetRole) {
      secDiffs.push({
        id: baseRole.id,
        name: baseRole.name,
        status: 'removed',
        baseRole,
        propertyChanges: [],
        tablePrivilegeDiffs: [],
        addedMiscPrivileges: [],
        removedMiscPrivileges: baseRole.misc_privileges || [],
        isBreaking: true,
        breakingReason: `Security Role '${baseRole.name}' was removed. Users assigned only to this role will lose access.`,
      });
      breakingChanges.push({
        id: `break_sec_del_${baseRole.name}`,
        category: 'security',
        severity: 'breaking',
        componentName: baseRole.name,
        componentIdentifier: baseRole.name,
        title: `Deleted Security Role: ${baseRole.name}`,
        description: `Security Role '${baseRole.name}' was removed.`,
        impactAssessment: `Users assigned to this role will lose access to Dataverse tables and applications upon solution import.`,
      });
    } else if (baseRole && targetRole) {
      const tablePrivDiffs: TablePrivilegeDiff[] = [];
      const basePrivMap = new Map((baseRole.table_privileges || []).map((p) => [p.table.toLowerCase(), p]));
      const targetPrivMap = new Map((targetRole.table_privileges || []).map((p) => [p.table.toLowerCase(), p]));
      const allTableKeys = Array.from(new Set([...basePrivMap.keys(), ...targetPrivMap.keys()])).sort();

      let hasDowngrade = false;

      for (const tKey of allTableKeys) {
        const bPriv = basePrivMap.get(tKey);
        const tPriv = targetPrivMap.get(tKey);

        if (bPriv && tPriv) {
          const privChanges: PrivilegeDiff[] = [];
          const ops: Array<'create' | 'read' | 'write' | 'delete' | 'append' | 'append_to' | 'assign' | 'share'> = [
            'create', 'read', 'write', 'delete', 'append', 'append_to', 'assign', 'share',
          ];
          for (const op of ops) {
            const diff = comparePrivilege(op, bPriv[op], tPriv[op]);
            if (diff) {
              privChanges.push(diff);
              if (diff.isDowngrade) hasDowngrade = true;
            }
          }
          if (privChanges.length > 0) {
            tablePrivDiffs.push({
              table: tPriv.table,
              table_display_name: tPriv.table_display_name,
              status: 'modified',
              privilegeChanges: privChanges,
              isDowngrade: privChanges.some((p) => p.isDowngrade),
            });
          }
        }
      }

      const baseMisc = new Set(baseRole.misc_privileges || []);
      const targetMisc = new Set(targetRole.misc_privileges || []);
      const addedMiscPrivileges = Array.from(targetMisc).filter((p) => !baseMisc.has(p));
      const removedMiscPrivileges = Array.from(baseMisc).filter((p) => !targetMisc.has(p));

      if (hasDowngrade) {
        breakingChanges.push({
          id: `break_sec_downgrade_${targetRole.name}`,
          category: 'security',
          severity: 'breaking',
          componentName: targetRole.name,
          componentIdentifier: targetRole.name,
          title: `Security Role Privilege Downgraded: ${targetRole.name}`,
          description: `One or more table permissions were downgraded (e.g. Org/BU to User/None) in role '${targetRole.name}'.`,
          impactAssessment: `Users may experience 'Access Denied' privilege exceptions on record operations previously permitted.`,
        });
      }

      secDiffs.push({
        id: targetRole.id,
        name: targetRole.name,
        status: (tablePrivDiffs.length > 0 || addedMiscPrivileges.length > 0 || removedMiscPrivileges.length > 0) ? 'modified' : 'unchanged',
        baseRole,
        targetRole,
        propertyChanges: [],
        tablePrivilegeDiffs: tablePrivDiffs,
        addedMiscPrivileges,
        removedMiscPrivileges,
        isBreaking: hasDowngrade,
        breakingReason: hasDowngrade ? 'Contains downgraded table permissions' : undefined,
      });
    }
  }

  // 9. Option Sets (Choices) Diff
  const optDiffs: OptionSetDiff[] = [];
  const baseOptMap = new Map((baseAst.option_sets || []).map((o) => [o.name.toLowerCase(), o]));
  const targetOptMap = new Map((targetAst.option_sets || []).map((o) => [o.name.toLowerCase(), o]));
  const allOptKeys = Array.from(new Set([...baseOptMap.keys(), ...targetOptMap.keys()])).sort();

  for (const oKey of allOptKeys) {
    const baseOpt = baseOptMap.get(oKey);
    const targetOpt = targetOptMap.get(oKey);

    if (!baseOpt && targetOpt) {
      optDiffs.push({
        name: targetOpt.name,
        display_name: targetOpt.display_name,
        is_global: targetOpt.is_global,
        status: 'added',
        targetOptionSet: targetOpt,
        addedOptions: targetOpt.options || [],
        removedOptions: [],
        modifiedOptions: [],
        isBreaking: false,
      });
    } else if (baseOpt && !targetOpt) {
      optDiffs.push({
        name: baseOpt.name,
        display_name: baseOpt.display_name,
        is_global: baseOpt.is_global,
        status: 'removed',
        baseOptionSet: baseOpt,
        addedOptions: [],
        removedOptions: baseOpt.options || [],
        modifiedOptions: [],
        isBreaking: true,
        breakingReason: `Choice OptionSet '${baseOpt.name}' was removed.`,
      });
      breakingChanges.push({
        id: `break_opt_del_${baseOpt.name}`,
        category: 'optionset',
        severity: 'breaking',
        componentName: baseOpt.display_name || baseOpt.name,
        componentIdentifier: baseOpt.name,
        title: `Deleted OptionSet: ${baseOpt.display_name || baseOpt.name}`,
        description: `OptionSet '${baseOpt.display_name || baseOpt.name}' was deleted in the target solution.`,
        impactAssessment: `Any choice column referencing this option set will encounter schema or data binding errors.`,
      });
    } else if (baseOpt && targetOpt) {
      const baseItemMap = new Map((baseOpt.options || []).map((i) => [i.value, i]));
      const targetItemMap = new Map((targetOpt.options || []).map((i) => [i.value, i]));

      const addedOptions: any[] = [];
      const removedOptions: any[] = [];
      const modifiedOptions: any[] = [];

      for (const [val, item] of targetItemMap) {
        if (!baseItemMap.has(val)) {
          addedOptions.push(item);
        } else {
          const bItem = baseItemMap.get(val)!;
          if (bItem.label !== item.label) {
            modifiedOptions.push({ value: val, baseLabel: bItem.label, targetLabel: item.label });
          }
        }
      }

      for (const [val, item] of baseItemMap) {
        if (!targetItemMap.has(val)) {
          removedOptions.push(item);
        }
      }

      const isOptBreaking = removedOptions.length > 0;
      if (isOptBreaking) {
        breakingChanges.push({
          id: `break_opt_item_${targetOpt.name}`,
          category: 'optionset',
          severity: 'warning',
          componentName: targetOpt.display_name || targetOpt.name,
          componentIdentifier: targetOpt.name,
          title: `Option Values Removed: ${targetOpt.display_name || targetOpt.name}`,
          description: `${removedOptions.length} option value(s) (${removedOptions.map((o) => `${o.label}: ${o.value}`).join(', ')}) were removed from '${targetOpt.name}'.`,
          impactAssessment: `Historical records containing these choice values will display raw integer values or blank labels.`,
        });
      }

      optDiffs.push({
        name: targetOpt.name,
        display_name: targetOpt.display_name,
        is_global: targetOpt.is_global,
        status: (addedOptions.length > 0 || removedOptions.length > 0 || modifiedOptions.length > 0) ? 'modified' : 'unchanged',
        baseOptionSet: baseOpt,
        targetOptionSet: targetOpt,
        addedOptions,
        removedOptions,
        modifiedOptions,
        isBreaking: isOptBreaking,
        breakingReason: isOptBreaking ? 'Existing choice option values were deleted' : undefined,
      });
    }
  }

  // Aggregate Metrics
  const allDiffItems = [
    ...entityDiffs,
    ...flowDiffs,
    ...canvasDiffs,
    ...envVarDiffs,
    ...wrDiffs,
    ...brDiffs,
    ...secDiffs,
    ...optDiffs,
  ];

  const addedCount = allDiffItems.filter((i) => i.status === 'added').length;
  const removedCount = allDiffItems.filter((i) => i.status === 'removed').length;
  const modifiedCount = allDiffItems.filter((i) => i.status === 'modified').length;
  const unchangedCount = allDiffItems.filter((i) => i.status === 'unchanged').length;

  const totalBase = (baseAst.entities?.length || 0) +
    (baseAst.flows?.length || 0) +
    (baseAst.canvas_apps?.length || 0) +
    (baseAst.environment_variables?.length || 0) +
    (baseAst.web_resources?.length || 0) +
    (baseAst.business_rules?.length || 0) +
    (baseAst.security_roles?.length || 0) +
    (baseAst.option_sets?.length || 0);

  const totalTarget = (targetAst.entities?.length || 0) +
    (targetAst.flows?.length || 0) +
    (targetAst.canvas_apps?.length || 0) +
    (targetAst.environment_variables?.length || 0) +
    (targetAst.web_resources?.length || 0) +
    (targetAst.business_rules?.length || 0) +
    (targetAst.security_roles?.length || 0) +
    (targetAst.option_sets?.length || 0);

  const metrics: DiffMetricSummary = {
    totalComponentsBase: totalBase,
    totalComponentsTarget: totalTarget,
    addedCount,
    removedCount,
    modifiedCount,
    unchangedCount,
    breakingChangesCount: breakingChanges.filter((b) => b.severity === 'breaking').length,
    warningsCount: breakingChanges.filter((b) => b.severity === 'warning').length,
  };

  return {
    baseMetadata: baseMeta,
    targetMetadata: targetMeta,
    versionChange: {
      from: baseMeta.version,
      to: targetMeta.version,
      isUpgrade,
    },
    metrics,
    entities: entityDiffs,
    flows: flowDiffs,
    canvasApps: canvasDiffs,
    envVars: envVarDiffs,
    webResources: wrDiffs,
    businessRules: brDiffs,
    securityRoles: secDiffs,
    optionSets: optDiffs,
    breakingChanges,
    comparedAt: new Date().toISOString(),
  };
}

