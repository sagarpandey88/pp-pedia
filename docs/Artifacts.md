## Summary

Below is a complete design blueprint for a **Power Platform Solution → Markdown + structured tables** documentation generator built for client-side RAG (PGLite + pgvector). It covers:

1. **Artifact inventory** – everything in a solution `.zip` worth documenting, and where it lives in the unpacked folder.
2. **Markdown schema** – a common front-matter header plus per-artifact sections, designed so each `##` section is a clean, self-describing chunk.
3. **Relational tables** – a normalized schema (fact/relationship tables) so the agent can answer *counting, filtering and "where" questions* with SQL rather than vector similarity.
4. **Question → query mapping** – how "How many flows use Power BI?", "Where are notifications sent?", "What are the business rules of X form?" are resolved.

The key architectural recommendation: use a **hybrid retrieval** model. Markdown chunks + embeddings handle *"explain / describe"* questions; the structured tables handle *"how many / which / where"* questions via text-to-SQL. Both are generated from the same intermediate JSON model.

---

## 1. Artifact Inventory

The solution component type list is defined by Dataverse's `componenttype` choice (e.g., 1 = Entity, 24/60 = Form, 26 = Saved Query, 29 = Workflow, 61 = Web Resource, 62 = Site Map, 300 = Canvas App, 371/372 = Connector, 380/381 = Environment Variable Definition/Value). When unpacked with `pac solution unpack` / `pac solution clone`, components land in predictable folders (`entities/`, `workflows/`, `modernflows/`, `canvasapps/`, `environmentvariabledefinitions/`, `connectors/`, `webresources/`, etc.).

### 1.1 Recommended artifact set

| # | Artifact (Markdown doc) | Component type | Source in unpacked solution | Priority |
|---|---|---|---|---|
| 1 | Solution overview | Solution / Publisher | `Other/Solution.xml` (or `solutions/*/solution.yml`) | Must |
| 2 | Table (entity) | 1 | `Entities/<Name>/Entity.xml` | Must |
| 3 | Column (attribute) | 2 | `Entities/<Name>/Entity.xml` → `<attributes>` | Must (embedded in table doc + rows) |
| 4 | Relationship (1:N, N:N) | 10 | `Other/Relationships/*.xml` or `entityrelationships/` | Must |
| 5 | Global choice (option set) | 9 | `OptionSets/*.xml` | Should |
| 6 | Alternate key | 14 | `Entities/<Name>/Entity.xml` → `<EntityKeys>` | Should |
| 7 | Form (Main, Quick Create, Quick View, Card) | 24 / 60 | `Entities/<Name>/FormXml/<type>/<guid>.xml` | Must |
| 8 | Business rule | 29 (category 2) | `Workflows/*.xaml` + `<Workflow>` entry in `customizations.xml` | Must |
| 9 | View (saved query) | 26 | `Entities/<Name>/SavedQueries/*.xml` | Must |
| 10 | Chart (visualization) | 59 | `Entities/<Name>/Visualizations/*.xml` | Should |
| 11 | Dashboard | 60 | `Dashboards/*.xml` | Should |
| 12 | Cloud flow (Power Automate) | 29 (category 5) | `Workflows/<Name>-<guid>.json` (or `modernflows/`) | Must |
| 13 | Classic workflow / action | 29 (category 0/3) | `Workflows/*.xaml` | Should |
| 14 | Business process flow | 29 (category 4) | `Workflows/*.xaml` + BPF entity | Should |
| 15 | Custom API / Custom action | Custom API | `CustomAPIs/` + `customizations.xml` | Should |
| 16 | Canvas app | 300 | `CanvasApps/*.msapp` → `pac canvas unpack` → `Src/*.fx.yaml`, `Connections/Connections.json`, `DataSources/*.json` | Must |
| 17 | Model-driven app + sitemap | AppModule / 62 | `AppModules/<Name>/AppModule.xml`, `AppModuleSiteMap/*.xml` | Must |
| 18 | Custom page | 300 (page) | `CanvasApps/` (type = custom page) | Should |
| 19 | PCF / custom control | 66 | `Controls/<Namespace.Name>/ControlManifest.xml` | Could |
| 20 | Connection reference | Connection Reference | `customizations.xml` → `<connectionreferences>` | Must |
| 21 | Custom connector | 371/372 | `Connectors/*.json` (OpenAPI) | Should |
| 22 | Environment variable | 380 / 381 | `environmentvariabledefinitions/<Name>/*.xml`, `environmentvariablevalues.json` | Must |
| 23 | Security role | 20 | `Roles/<guid>/RoleInfo.xml` (or `customizations.xml` → `<Roles>`) | Must |
| 24 | Column security profile | 70 | `FieldSecurityProfiles/` | Could |
| 25 | Web resource (JS/HTML/CSS/Images) | 61 | `WebResources/` | Should |
| 26 | Plugin assembly / step | 91 / 92 | `PluginAssemblies/`, `customizations.xml` → `<SdkMessageProcessingSteps>` | Should |
| 27 | Email template | 36 | `customizations.xml` → `<EmailTemplates>` | Should (feeds notifications) |
| 28 | Ribbon / command bar | 50 | `Entities/<Name>/RibbonDiff.xml`, `AppActions/` (modern commands) | Could |
| 29 | Copilot Studio agent (bot) | bot / botcomponent | `bots/`, `botcomponents/` | Could |
| 30 | Power BI report / dataset component | Power BI component | `powerbireports/`, `powerbidatasets/` | Could |
| 31 | Dependency graph | Derived | Computed from all of the above | Must |

---

## 2. Markdown Document Schema

### 2.1 Common front matter (every document)

Every doc starts with YAML front matter so that each chunk can be tagged in the vector store with **structured metadata for filtering** (`type`, `solution`, `tags`).

```markdown
---
doc_id: flow_a1b2c3d4
doc_type: cloud_flow            # table | form | business_rule | cloud_flow | canvas_app | ...
name: Notify Manager on Approval
logical_name: pub_NotifyManagerOnApproval
solution: ContosoExpenses
solution_version: 1.3.0.0
publisher_prefix: pub
primary_table: pub_expense      # if applicable
tags: [notification, email, teams, approval, power-bi]
connectors: [shared_office365, shared_teams, shared_powerbi]
generated_on: 2026-09-25
---
```

### 2.2 Section design rules (RAG-friendly)

- One artifact = one file; `##` headings are the chunk boundaries.
- The first line of every `##` section restates the artifact name and type ("Cloud flow **Notify Manager on Approval** – Triggers") so chunks are self-contained after splitting.
- Tables (pipe syntax) for lists of columns, steps, fields; prose for the "Purpose" and "Behaviour summary" sections (generated or extracted from descriptions).
- No raw XML/JSON in the body; expressions (Power Fx, WDL) go in fenced code blocks and are kept short.

### 2.3 Per-artifact schemas

#### Solution overview (`solution.md`)

```markdown
## Overview          – unique name, display name, version, publisher, managed/unmanaged, description
## Component inventory – table: type | count
## Apps              – list of canvas + model-driven apps with links
## Automation        – flows / workflows / BPFs / plugins summary
## Data model        – tables list with record counts of columns/forms/views
## Connectors used   – connector | # flows | # apps | connection references
## Environment variables – name | type | default | current
## Dependency highlights – cross-component dependency table
```

#### Table (`tables/<logical_name>.md`)

```markdown
## Overview          – display/plural name, logical name, ownership, type (standard/activity/virtual), 
                       description, audit/notes/attachments enabled, primary column
## Columns           – display | logical | type | required | description | choice values (inline) | calculated/rollup formula
## Relationships     – kind (1:N/N:1/N:N) | related table | lookup column | cascade behaviour
## Alternate keys    – key name | columns
## Forms             – form name | type | # tabs | # fields | business rules count
## Views             – view name | type (public/quick find/lookup) | columns | filter summary
## Business rules    – list (with links to business_rules/*.md)
## Charts            – name | type | group by | aggregate
## Used by           – flows, apps, plugins, workflows referencing this table
## Security          – role | C R W D A/A Assign Share depth
```

#### Form (`forms/<table>__<form_name>.md`)

```markdown
## Overview          – form name, type (Main/QuickCreate/QuickView/Card), table, state, description, form id
## Layout            – tab → section → field/control table (label | logical name | control type | required | read-only | visible by default)
## Subgrids & quick views – target table, view used
## Header & footer fields
## Business rules    – rule name | scope (form/entity/all forms) | conditions summary | actions summary
## Scripts (JS)      – web resource | event (OnLoad/OnSave/OnChange field) | function | parameters
## Related forms     – other forms on same table
```

#### Business rule (`business_rules/<table>__<rule_name>.md`)

```markdown
## Overview          – name, table, scope, state (active/draft), description
## Conditions        – IF (field | operator | value) with AND/OR grouping, in plain English
## Actions           – action type (Show error / Set value / Set visibility / Set required / Lock / Recommendation) 
                       | target field | value/message
## Else actions
## Fields involved   – read | written
## Applies to forms  – list
```

#### Cloud flow (`flows/<flow_name>.md`)

```markdown
## Overview          – name, state (on/off), type (automated / instant / scheduled), owner, description, 
                       created/modified, run-only users flag
## Trigger           – connector | operation (e.g. Dataverse "When a row is added, modified or deleted") 
                       | table | scope | filter attributes | schedule | conditions
## Connectors & connection references – connector | api name | connection reference logical name | # actions
## Actions           – ordered table: step name | connector | operation | inputs summary | scope/condition/loop nesting
## Notifications sent – channel (Email/Teams/Push/Approval/SMS) | recipients (static or dynamic expr) | subject | body summary
## Data touched      – table/list/entity | operation (Create/Read/Update/Delete/List)
## Environment variables used
## Child flows / called flows
## Error handling    – scopes with runAfter Failed/TimedOut, Terminate actions
## Dependencies      – tables, env vars, connection refs, child flows
```

#### Canvas app (`canvas_apps/<app_name>.md`)

```markdown
## Overview          – name, description, app version, form factor (tablet/phone), author, published on
## Data sources      – name | type (Dataverse / SharePoint / SQL / connector) | table/list | connection reference | env vars
## Connectors used
## Screens           – screen name | purpose (from description/comments) | # controls | navigations (to which screens)
## Key controls & formulas – notable Patch/Submit/Navigate/Notify/Office365Outlook.SendEmail calls per screen
## Flows called      – flow name | from screen/control
## Notifications     – Notify(), Office365Outlook.SendEmailV2, Teams.PostMessage, etc. with recipients/subject
## Components used   – canvas components, PCF controls
## Environment variables used
## App settings      – features / experimental flags
```

#### Model-driven app (`model_apps/<app_name>.md`)

```markdown
## Overview          – name, unique name, description, URL suffix, client type
## Navigation (sitemap) – area → group → subarea (entity / dashboard / URL / custom page)
## Included tables   – table | included forms | included views | included charts
## Included flows / BPFs / dashboards / custom pages
## Security roles with access
```

#### Environment variable, Connection reference, Security role, Web resource, Plugin step, Custom connector

```markdown
# Environment variable
## Overview  – schema name, display name, type (Text/Number/JSON/Bool/Data source/Secret), default value, current value (masked if secret)
## Used by   – flows | canvas apps | plugins | custom connectors

# Connection reference
## Overview  – logical name, display name, connector (api name), description
## Used by   – flow | step count ; canvas app

# Security role
## Overview  – name, business unit scope, description
## Table privileges – table | Create | Read | Write | Delete | Append | AppendTo | Assign | Share (depth: None/User/BU/Parent/Org)
## Misc privileges – e.g. prvExportToExcel, prvBulkDelete
## Assigned to apps

# Web resource
## Overview  – name, type (JS/HTML/CSS/PNG/SVG/RESX), description, size
## Functions exported (JS) – function name | parameters | forms/events that call it

# Plugin step
## Overview  – assembly, plugin type, message (Create/Update/…), table, stage (Pre-validation/Pre-op/Post-op), mode (sync/async), filtering attributes, images
```

---

## 3. Structured Tables for the AI Agent

Design principle: **facts as rows, links as junction tables**, plus a generic `component` and `component_dependency` table for graph queries. Store chunks and embeddings alongside.

### 3.1 Core & graph

```sql
CREATE TABLE solution (
  solution_id TEXT PRIMARY KEY, unique_name TEXT, display_name TEXT, version TEXT,
  publisher TEXT, prefix TEXT, is_managed BOOLEAN, description TEXT, exported_on TIMESTAMP
);

CREATE TABLE component (
  component_id TEXT PRIMARY KEY,           -- GUID or synthesized key
  solution_id TEXT REFERENCES solution,
  component_type TEXT,                     -- table|column|form|view|business_rule|cloud_flow|canvas_app|model_app|env_var|conn_ref|role|web_resource|plugin_step|...
  component_type_code INT,                 -- Dataverse componenttype (1, 24, 29, 300, 380 ...)
  logical_name TEXT, display_name TEXT, description TEXT,
  parent_component_id TEXT,                -- e.g. column → table, form → table
  state TEXT, created_on TIMESTAMP, modified_on TIMESTAMP,
  doc_path TEXT                            -- path of the generated markdown
);

CREATE TABLE component_dependency (
  from_component_id TEXT, to_component_id TEXT,
  dependency_kind TEXT,                    -- uses_table|uses_column|calls_flow|uses_env_var|uses_conn_ref|uses_web_resource|includes|triggered_by
  detail TEXT,
  PRIMARY KEY (from_component_id, to_component_id, dependency_kind)
);

CREATE TABLE tag (component_id TEXT, tag TEXT, PRIMARY KEY (component_id, tag));
```

### 3.2 Data model

```sql
CREATE TABLE dv_table (
  table_id TEXT PRIMARY KEY, logical_name TEXT, display_name TEXT, plural_name TEXT,
  ownership TEXT, table_type TEXT, primary_column TEXT, is_custom BOOLEAN,
  audit_enabled BOOLEAN, notes_enabled BOOLEAN, activities_enabled BOOLEAN, description TEXT
);

CREATE TABLE dv_column (
  column_id TEXT PRIMARY KEY, table_id TEXT REFERENCES dv_table,
  logical_name TEXT, display_name TEXT, data_type TEXT, format TEXT,
  required_level TEXT, max_length INT, min_value NUMERIC, max_value NUMERIC,
  is_custom BOOLEAN, is_calculated BOOLEAN, is_rollup BOOLEAN, formula TEXT,
  lookup_target TEXT, optionset_name TEXT, is_secured BOOLEAN, description TEXT
);

CREATE TABLE dv_choice_option (
  optionset_name TEXT, column_id TEXT, value INT, label TEXT, color TEXT, is_global BOOLEAN
);

CREATE TABLE dv_relationship (
  relationship_id TEXT PRIMARY KEY, schema_name TEXT, kind TEXT,          -- OneToMany|ManyToMany
  referenced_table TEXT, referencing_table TEXT, lookup_column TEXT,
  cascade_delete TEXT, cascade_assign TEXT, cascade_share TEXT, is_custom BOOLEAN
);

CREATE TABLE dv_key (key_id TEXT PRIMARY KEY, table_id TEXT, name TEXT, columns TEXT[]);
```

### 3.3 UI: forms, views, business rules

```sql
CREATE TABLE form (
  form_id TEXT PRIMARY KEY, table_id TEXT, name TEXT, form_type TEXT,   -- Main|QuickCreate|QuickView|Card|Dashboard
  is_default BOOLEAN, state TEXT, description TEXT
);

CREATE TABLE form_field (
  form_id TEXT, tab_name TEXT, section_name TEXT, column_logical_name TEXT, label TEXT,
  control_type TEXT, is_required BOOLEAN, is_readonly BOOLEAN, is_visible BOOLEAN, position INT
);

CREATE TABLE form_subgrid (form_id TEXT, name TEXT, target_table TEXT, view_id TEXT, relationship TEXT);

CREATE TABLE form_script (
  form_id TEXT, web_resource_name TEXT, event TEXT,                   -- OnLoad|OnSave|OnChange
  column_logical_name TEXT, function_name TEXT, parameters TEXT, enabled BOOLEAN
);

CREATE TABLE view (
  view_id TEXT PRIMARY KEY, table_id TEXT, name TEXT, view_type TEXT,     -- Public|QuickFind|Lookup|Associated|Advanced Find
  is_default BOOLEAN, columns TEXT[], filter_summary TEXT, fetchxml TEXT, sort TEXT
);

CREATE TABLE business_rule (
  rule_id TEXT PRIMARY KEY, table_id TEXT, name TEXT, scope TEXT,           -- Entity|AllForms|SpecificForm
  form_id TEXT, state TEXT, description TEXT, plain_english_summary TEXT
);

CREATE TABLE business_rule_condition (
  rule_id TEXT, condition_group INT, sequence INT, column_logical_name TEXT,
  operator TEXT, value TEXT, logical_join TEXT                              -- AND|OR
);

CREATE TABLE business_rule_action (
  rule_id TEXT, branch TEXT,                                               -- IF|ELSE
  action_type TEXT,                                                        -- ShowError|SetValue|SetVisibility|SetRequired|Lock|Unlock|Recommendation|SetDefault
  target_column TEXT, value TEXT, message TEXT
);
```

### 3.4 Automation: flows, workflows, plugins

```sql
CREATE TABLE flow (
  flow_id TEXT PRIMARY KEY, name TEXT, flow_kind TEXT,          -- cloud_flow|classic_workflow|action|bpf|desktop
  trigger_type TEXT,                                            -- Automated|Instant|Scheduled
  state TEXT, owner TEXT, description TEXT, primary_table TEXT,
  action_count INT, has_error_handling BOOLEAN, is_child_flow BOOLEAN
);

CREATE TABLE flow_trigger (
  flow_id TEXT, connector_api TEXT, operation_id TEXT, table_logical_name TEXT,
  message TEXT,                                                  -- Create|Update|Delete
  scope TEXT, filter_attributes TEXT[], filter_expression TEXT, schedule TEXT
);

CREATE TABLE flow_action (
  flow_id TEXT, action_name TEXT, sequence INT, parent_action TEXT,   -- Scope/Condition/Apply_to_each nesting
  action_type TEXT,                                                   -- OpenApiConnection|Compose|Condition|Foreach|Http|Workflow(child)|...
  connector_api TEXT, operation_id TEXT, connection_reference TEXT,
  table_logical_name TEXT, inputs_summary TEXT, run_after TEXT
);

CREATE TABLE flow_connector (                 -- one row per distinct connector per flow
  flow_id TEXT, connector_api TEXT,           -- shared_powerbi, shared_office365, shared_teams, shared_commondataserviceforapps...
  connector_display TEXT, connection_reference TEXT, action_count INT,
  PRIMARY KEY (flow_id, connector_api)
);

CREATE TABLE plugin_step (
  step_id TEXT PRIMARY KEY, assembly TEXT, plugin_type TEXT, message TEXT, table_logical_name TEXT,
  stage TEXT, mode TEXT, rank INT, filtering_attributes TEXT[], state TEXT, has_pre_image BOOLEAN, has_post_image BOOLEAN
);
```

### 3.5 Cross-cutting: notifications (the "where are notifications sent?" table)

A **unified notification table** populated from every source: flow actions, classic workflow Send Email steps, canvas app formulas, business rule error messages (optional), and plugin steps that reference email templates.

```sql
CREATE TABLE notification (
  notification_id TEXT PRIMARY KEY,
  source_component_id TEXT,                 -- flow / canvas app / workflow / plugin
  source_type TEXT, source_name TEXT, step_name TEXT,
  channel TEXT,                             -- Email|Teams Chat|Teams Channel|Adaptive Card|Push (Power Apps Notification)|Approval|SMS|In-app Notification|HTTP Webhook
  connector_api TEXT, operation_id TEXT,    -- shared_office365 / SendEmailV2, shared_teams / PostMessageToConversation, shared_flowpush / SendNotificationV2, shared_approvals ...
  recipients_static TEXT[],                 -- resolved literal addresses / channel names
  recipients_dynamic TEXT,                  -- expression, e.g. triggerOutputs()?['body/ownerid/emailaddress']
  recipient_kind TEXT,                      -- Owner|Manager|Static|Team|Queue|Expression
  subject TEXT, body_summary TEXT, template_name TEXT,
  condition_summary TEXT                    -- the Condition/Scope guarding the action
);
```

### 3.6 Apps, connectivity, security

```sql
CREATE TABLE canvas_app (
  app_id TEXT PRIMARY KEY, name TEXT, description TEXT, app_version TEXT, form_factor TEXT,
  screen_count INT, control_count INT, is_custom_page BOOLEAN
);
CREATE TABLE canvas_app_datasource (
  app_id TEXT, name TEXT, source_type TEXT, connector_api TEXT, table_or_list TEXT,
  connection_reference TEXT, env_var_dataset TEXT, env_var_table TEXT
);
CREATE TABLE canvas_app_screen (app_id TEXT, screen_name TEXT, control_count INT, navigates_to TEXT[], description TEXT);
CREATE TABLE canvas_app_formula_ref (      -- mined from .fx.yaml
  app_id TEXT, screen_name TEXT, control_name TEXT, property TEXT,
  ref_kind TEXT,                           -- Patch|SubmitForm|Navigate|Notify|Flow.Run|Connector.Call|Set|Collect
  target TEXT,                             -- table / flow / connector / screen
  formula_excerpt TEXT
);

CREATE TABLE model_app (app_id TEXT PRIMARY KEY, name TEXT, unique_name TEXT, description TEXT, url_suffix TEXT);
CREATE TABLE model_app_component (app_id TEXT, component_id TEXT, component_type TEXT);
CREATE TABLE sitemap_entry (app_id TEXT, area TEXT, group_name TEXT, subarea TEXT, target_type TEXT, target TEXT, position INT);

CREATE TABLE environment_variable (
  env_var_id TEXT PRIMARY KEY, schema_name TEXT, display_name TEXT, data_type TEXT,
  default_value TEXT, current_value TEXT, is_secret BOOLEAN, description TEXT
);

CREATE TABLE connection_reference (
  conn_ref_id TEXT PRIMARY KEY, logical_name TEXT, display_name TEXT, connector_api TEXT, description TEXT
);

CREATE TABLE security_role (role_id TEXT PRIMARY KEY, name TEXT, description TEXT, is_custom BOOLEAN);
CREATE TABLE role_privilege (
  role_id TEXT, table_logical_name TEXT, privilege TEXT,      -- Create|Read|Write|Delete|Append|AppendTo|Assign|Share|<misc prv name>
  depth TEXT                                                  -- None|Basic|Local|Deep|Global
);

CREATE TABLE web_resource (wr_id TEXT PRIMARY KEY, name TEXT, wr_type TEXT, size_bytes INT, description TEXT);
CREATE TABLE web_resource_function (wr_id TEXT, function_name TEXT, parameters TEXT, summary TEXT);
```

### 3.7 RAG storage

```sql
CREATE TABLE doc_chunk (
  chunk_id TEXT PRIMARY KEY, component_id TEXT REFERENCES component, doc_type TEXT,
  heading TEXT, content TEXT, token_count INT, metadata JSONB,   -- front matter + section
  embedding vector(768)                                           -- pgvector in PGLite
);
CREATE INDEX ON doc_chunk USING hnsw (embedding vector_cosine_ops);
```

---

## 4. Question → Retrieval Mapping

| Question | Strategy | Query sketch |
|---|---|---|
| How many flows use Power BI? | SQL | `SELECT COUNT(DISTINCT flow_id) FROM flow_connector WHERE connector_api = 'shared_powerbi';` |
| Which flows/apps use Power BI and how? | SQL + vector | Join `flow_connector` / `canvas_app_datasource`, then fetch chunks for "Actions" sections of those flows |
| Where are notifications sent? | SQL | `SELECT channel, recipient_kind, recipients_static, recipients_dynamic, source_name FROM notification;` grouped by channel |
| What are the business rules of X form? | SQL | `SELECT br.name, br.plain_english_summary FROM business_rule br JOIN form f ON br.form_id = f.form_id OR (br.scope='Entity' AND br.table_id=f.table_id) WHERE f.name ILIKE 'X';` then chunks for details |
| Which fields are required on the Expense main form? | SQL | `form_field WHERE is_required` |
| What happens when an Expense is approved? | Vector + graph | Embed query → chunks; expand via `flow_trigger.table_logical_name='pub_expense'` + `plugin_step` + `business_rule` |
| Who can delete Expenses? | SQL | `role_privilege WHERE table_logical_name='pub_expense' AND privilege='Delete'` |
| Which env vars does flow Y use? | SQL | `component_dependency WHERE dependency_kind='uses_env_var'` |
| Impact of removing column Z? | Graph | Recursive query on `component_dependency` to_component = column |

Practical tip for the agent: expose two tools — `run_sql(schema-aware)` for counting/filtering and `semantic_search(filter by doc_type/tags)` for explanations — and let the LLM route. Store a **schema description document** (column meanings + example queries) in the vector store so text-to-SQL is grounded.

---

## 5. Extraction Notes (what to parse for the hard fields)

- **Connector identification in flows**: `properties.connectionReferences.<key>.api.name` in the flow JSON (e.g. `shared_powerbi`, `shared_office365`, `shared_teams`, `shared_flowpush`, `shared_approvals`, `shared_commondataserviceforapps`). Each `OpenApiConnection` action's `inputs.host.connectionName` + `operationId` tells you which connector and operation.
- **Notification detection heuristics**: operation IDs such as `SendEmailV2`, `SendEmailNotification`, `PostMessageToConversation`, `PostCardToConversation`, `PostAdaptiveCardAndWaitForResponse`, `SendNotificationV2`, `StartAndWaitForAnApproval`; classic workflow XAML `SendEmail` steps; canvas `Notify()`, `Office365Outlook.SendEmailV2()`, `MicrosoftTeams.PostMessageToChannelV3()`.
- **Business rules**: stored as Workflow with `Category = 2`; the XAML in `Workflows/` plus the `clientdata` JSON hold conditions/actions. Translate condition/action nodes into plain English during generation (this is the single most valuable step for RAG quality).
- **Canvas apps**: unpack `.msapp` with `pac canvas unpack`; read `Src/*.fx.yaml` for formulas, `Connections/Connections.json` and `DataSources/*.json` for connectors/tables.
- **Environment variables**: definitions in `environmentvariabledefinitions/`, values in `environment_variable_values.json`; usage detected by `@parameters('<schema_name> (<prefix>_...)')` in flows and `Environment Variables` datasource references in canvas apps.
- **Dependencies**: build from parsed references, and optionally enrich by querying the Dataverse `Dependency` table / `RetrieveDependenciesForDelete` if you have live environment access.

---

## Sources

- [Dependency tracking for solution components – Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/alm/dependency-tracking-solution-components)
- [Solution Component (SolutionComponent) table reference – componenttype values – Microsoft Learn](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutioncomponent)
- [Solution YAML source control format reference – Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/alm/solution-source-control-yaml-format)
- [When to edit the customizations file – Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/alm/when-edit-customization-file)
- [Use environment variables in Power Platform solutions – Microsoft Learn](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/environmentvariables)

---

Would you like me to go deeper on any of these next steps?

- A **worked example** – a sample cloud flow JSON parsed into the `flow_*`, `notification` rows and the resulting Markdown file?
- The **business-rule XAML/clientdata → plain-English** translation logic in detail?
- A **TypeScript project structure** (parser modules per artifact, intermediate JSON model, PGLite loader with pgvector) to kick off implementation?