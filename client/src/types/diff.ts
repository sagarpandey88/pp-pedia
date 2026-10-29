import {
  SolutionMetadata,
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
  OptionSetItem,
} from './solution';

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';
export type ChangeSeverity = 'breaking' | 'warning' | 'info';

export interface PropertyDiff<T = any> {
  propertyName: string;
  baseValue: T;
  targetValue: T;
}

export interface AttributeDiff {
  logical_name: string;
  schema_name?: string;
  display_name: string;
  status: DiffStatus;
  baseAttribute?: DataverseAttribute;
  targetAttribute?: DataverseAttribute;
  propertyChanges: PropertyDiff[];
  isBreaking: boolean;
  breakingReason?: string;
}

export interface RelationshipDiff {
  schema_name: string;
  status: DiffStatus;
  relationship_type: string;
  primary_entity: string;
  referencing_entity: string;
  propertyChanges: PropertyDiff[];
}

export interface EntityDiff {
  logical_name: string;
  display_name: string;
  status: DiffStatus;
  baseEntity?: DataverseEntity;
  targetEntity?: DataverseEntity;
  propertyChanges: PropertyDiff[];
  attributes: AttributeDiff[];
  relationships: RelationshipDiff[];
  addedAttributesCount: number;
  removedAttributesCount: number;
  modifiedAttributesCount: number;
  isBreaking: boolean;
  breakingReason?: string;
}

export interface FlowActionDiff {
  name: string;
  type: string;
  status: DiffStatus;
  baseAction?: FlowAction;
  targetAction?: FlowAction;
  propertyChanges: PropertyDiff[];
}

export interface FlowTriggerDiff {
  name: string;
  status: DiffStatus;
  baseTrigger?: FlowTrigger;
  targetTrigger?: FlowTrigger;
  propertyChanges: PropertyDiff[];
  isBreaking?: boolean;
  breakingReason?: string;
}

export interface FlowDiff {
  id: string;
  name: string;
  display_name: string;
  status: DiffStatus;
  baseFlow?: CloudFlow;
  targetFlow?: CloudFlow;
  propertyChanges: PropertyDiff[];
  triggers: FlowTriggerDiff[];
  actions: FlowActionDiff[];
  addedActionsCount: number;
  removedActionsCount: number;
  modifiedActionsCount: number;
  addedConnectors: string[];
  removedConnectors: string[];
  isBreaking: boolean;
  breakingReason?: string;
}

export interface CanvasAppDiff {
  name: string;
  display_name: string;
  status: DiffStatus;
  baseApp?: CanvasApp;
  targetApp?: CanvasApp;
  propertyChanges: PropertyDiff[];
  addedScreens: string[];
  removedScreens: string[];
  addedDataSources: string[];
  removedDataSources: string[];
}

export interface EnvVarDiff {
  schema_name: string;
  display_name: string;
  status: DiffStatus;
  baseVar?: EnvironmentVariable;
  targetVar?: EnvironmentVariable;
  propertyChanges: PropertyDiff[];
  isBreaking?: boolean;
}

export interface TextDiffLine {
  type: 'added' | 'removed' | 'unchanged';
  lineNumberBase?: number;
  lineNumberTarget?: number;
  content: string;
}

export interface WebResourceDiff {
  id: string;
  name: string;
  display_name?: string;
  resource_type: string;
  status: DiffStatus;
  baseResource?: WebResource;
  targetResource?: WebResource;
  propertyChanges: PropertyDiff[];
  sizeDeltaBytes: number;
  deprecatedXrmIntroduced: boolean;
  directDomIntroduced: boolean;
  textDiffLines?: TextDiffLine[];
  isBreaking: boolean;
  breakingReason?: string;
}

export interface BusinessRuleDiff {
  id: string;
  name: string;
  table: string;
  status: DiffStatus;
  baseRule?: BusinessRule;
  targetRule?: BusinessRule;
  propertyChanges: PropertyDiff[];
  conditionsChanged: boolean;
  actionsChanged: boolean;
}

export interface PrivilegeDiff {
  privilegeName: 'create' | 'read' | 'write' | 'delete' | 'append' | 'append_to' | 'assign' | 'share';
  baseLevel: string;
  targetLevel: string;
  isDowngrade: boolean;
}

export interface TablePrivilegeDiff {
  table: string;
  table_display_name?: string;
  status: DiffStatus;
  privilegeChanges: PrivilegeDiff[];
  isDowngrade: boolean;
}

export interface SecurityRoleDiff {
  id: string;
  name: string;
  status: DiffStatus;
  baseRole?: SecurityRole;
  targetRole?: SecurityRole;
  propertyChanges: PropertyDiff[];
  tablePrivilegeDiffs: TablePrivilegeDiff[];
  addedMiscPrivileges: string[];
  removedMiscPrivileges: string[];
  isBreaking: boolean;
  breakingReason?: string;
}

export interface OptionSetDiff {
  name: string;
  display_name?: string;
  is_global: boolean;
  status: DiffStatus;
  baseOptionSet?: OptionSet;
  targetOptionSet?: OptionSet;
  addedOptions: OptionSetItem[];
  removedOptions: OptionSetItem[];
  modifiedOptions: Array<{
    value: number;
    baseLabel: string;
    targetLabel: string;
  }>;
  isBreaking: boolean;
  breakingReason?: string;
}

export interface BreakingChangeItem {
  id: string;
  category: 'table' | 'column' | 'flow' | 'security' | 'code' | 'optionset';
  severity: ChangeSeverity;
  componentName: string;
  componentIdentifier: string;
  title: string;
  description: string;
  impactAssessment: string;
}

export interface DiffMetricSummary {
  totalComponentsBase: number;
  totalComponentsTarget: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  breakingChangesCount: number;
  warningsCount: number;
}

export interface SolutionDiffResult {
  baseMetadata: SolutionMetadata;
  targetMetadata: SolutionMetadata;
  versionChange: {
    from: string;
    to: string;
    isUpgrade: boolean;
  };
  metrics: DiffMetricSummary;
  entities: EntityDiff[];
  flows: FlowDiff[];
  canvasApps: CanvasAppDiff[];
  envVars: EnvVarDiff[];
  webResources: WebResourceDiff[];
  businessRules: BusinessRuleDiff[];
  securityRoles: SecurityRoleDiff[];
  optionSets: OptionSetDiff[];
  breakingChanges: BreakingChangeItem[];
  comparedAt: string;
}

