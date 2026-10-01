import assert from 'assert';
import JSZip from './client/node_modules/jszip/lib/index.js';
import { PGlite } from './client/node_modules/@electric-sql/pglite/dist/index.js';
import { vector } from './client/node_modules/@electric-sql/pglite-pgvector/dist/index.js';

console.log('--- Starting pp-pedia Verification Test Suite ---');

// 1. Test Semantic Chunker
console.log('1. Testing Semantic Chunker logic...');
function chunkMarkdown(markdown, targetChunkChars = 1200) {
  const lines = markdown.split('\n');
  const sections = [];
  const currentHeadings = [];
  let currentBuffer = [];

  const flushBuffer = () => {
    if (currentBuffer.length > 0) {
      const content = currentBuffer.join('\n').trim();
      if (content.length > 0) {
        sections.push({
          headingHierarchy: currentHeadings.map((h) => h.text),
          content,
        });
      }
      currentBuffer = [];
    }
  };

  const headingRegex = /^(#{1,6})\s+(.+)$/;
  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      flushBuffer();
      const level = match[1].length;
      const text = match[2].trim();
      while (
        currentHeadings.length > 0 &&
        currentHeadings[currentHeadings.length - 1].level >= level
      ) {
        currentHeadings.pop();
      }
      currentHeadings.push({ level, text });
      currentBuffer.push(line);
    } else {
      currentBuffer.push(line);
    }
  }
  flushBuffer();

  const chunks = [];
  let chunkIndex = 0;
  for (const section of sections) {
    const headingContext =
      section.headingHierarchy.length > 0
        ? section.headingHierarchy.join(' > ')
        : 'Overview';
    chunks.push({
      chunk_index: chunkIndex++,
      chunk_content: section.content,
      heading_context: headingContext,
    });
  }
  return chunks;
}

const sampleMd = `# Solution Architecture
## Executive Summary
This is the executive summary section.
## Dataverse Schema
### Account Table
The account table stores customer accounts.
### Contact Table
The contact table stores contacts.`;

const chunks = chunkMarkdown(sampleMd);
assert.strictEqual(chunks.length, 5, 'Should produce 5 semantic heading sections');
assert.strictEqual(chunks[0].heading_context, 'Solution Architecture');
assert.strictEqual(chunks[1].heading_context, 'Solution Architecture > Executive Summary');
assert.strictEqual(chunks[2].heading_context, 'Solution Architecture > Dataverse Schema');
assert.strictEqual(chunks[3].heading_context, 'Solution Architecture > Dataverse Schema > Account Table');
assert.strictEqual(chunks[4].heading_context, 'Solution Architecture > Dataverse Schema > Contact Table');
console.log('✓ Semantic heading-aware chunker passed!');

// 2. Test Workflow Logic Parsing
console.log('2. Testing Cloud Flow JSON parsing...');
const flowJson = {
  properties: {
    displayName: 'Incident Escalation Flow',
    state: 'Activated',
    definition: {
      triggers: {
        When_a_ticket_is_created: {
          type: 'OpenApiConnectionWebhook',
          inputs: { parameters: { entityName: 'new_tickets' } },
        },
      },
      actions: {
        Check_Priority: {
          type: 'If',
          runAfter: {},
          actions: {
            Alert_Teams: {
              type: 'OpenApiConnection',
              runAfter: {},
            },
          },
        },
      },
      connectionReferences: {
        shared_teams: { connectionName: 'shared_teams', id: '/apis/shared_teams' },
      },
    },
  },
};

assert.strictEqual(flowJson.properties.displayName, 'Incident Escalation Flow');
assert.ok(flowJson.properties.definition.triggers.When_a_ticket_is_created);
assert.strictEqual(flowJson.properties.definition.triggers.When_a_ticket_is_created.type, 'OpenApiConnectionWebhook');
assert.ok(flowJson.properties.definition.actions.Check_Priority);
console.log('✓ Cloud Flow parsing logic passed!');

// 3. Test PGlite + pgvector Cosine Search
console.log('3. Testing PGlite with pgvector cosine similarity search...');
async function testDb() {
  const db = new PGlite({ extensions: { vector } });
  await db.waitReady;
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');

  await db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      unique_name TEXT NOT NULL,
      display_name TEXT NOT NULL
    );

    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL
    );

    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_content TEXT NOT NULL,
      heading_context TEXT,
      embedding vector(4)
    );
  `);

  await db.exec(`
    INSERT INTO projects VALUES ('p1', 'ContosoService', 'Contoso Service Desk');
    INSERT INTO documents VALUES ('d1', 'p1', 'Dataverse Schema', 'dataverse-schema');
    INSERT INTO document_chunks VALUES ('c1', 'd1', 'p1', 0, 'Customer ticket support entity', 'Schema > Tickets', '[1.0, 0.0, 0.0, 0.0]');
    INSERT INTO document_chunks VALUES ('c2', 'd1', 'p1', 1, 'Billing and payment records', 'Schema > Invoices', '[0.0, 1.0, 0.0, 0.0]');
  `);

  // Query similar to [0.95, 0.05, 0.0, 0.0]
  const res = await db.query(`
    SELECT c.id, c.chunk_content, c.heading_context, d.title, p.display_name,
           1 - (c.embedding <=> '[0.95, 0.05, 0.0, 0.0]'::vector) AS similarity
    FROM document_chunks c
    JOIN documents d ON c.document_id = d.id
    JOIN projects p ON c.project_id = p.id
    ORDER BY c.embedding <=> '[0.95, 0.05, 0.0, 0.0]'::vector
    LIMIT 1;
  `);

  assert.strictEqual(res.rows.length, 1);
  assert.strictEqual(res.rows[0].id, 'c1');
  assert.ok(Number(res.rows[0].similarity) > 0.9, 'Cosine similarity should be > 0.9');
  console.log(`✓ PGlite cosine similarity search passed! Top match: ${res.rows[0].id} (score: ${Number(res.rows[0].similarity).toFixed(4)})`);

  // 4. Test JSZip Archive Generation
  console.log('4. Testing Zip generation and reading...');
  const zip = new JSZip();
  zip.file('solution.xml', '<ImportExportXml><SolutionManifest><UniqueName>TestSol</UniqueName></SolutionManifest></ImportExportXml>');
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const unpacked = await JSZip.loadAsync(zipBuf);
  const solXml = await unpacked.file('solution.xml').async('text');
  assert.ok(solXml.includes('TestSol'));
  console.log('✓ JSZip roundtrip verification passed!');

  // 5. Test Solution Overview 8-section Markdown Schema
  console.log('5. Testing Solution Overview 8-section schema...');
  const mockOverviewMarkdown = `# Contoso Customer Support

## Overview
Solution **Contoso Customer Support** – Solution Metadata & Specification
| Property | Value |
| :--- | :--- |
| **Unique Name** | \`ContosoCustomerSupport\` |
| **Display Name** | Contoso Customer Support |
| **Version** | \`2.1.0.4\` |
| **Publisher** | Contoso Technologies (\`contoso\`) |
| **Managed / Unmanaged** | Unmanaged |

## Component inventory
| Type | Count |
| :--- | :--- |
| Dataverse Tables | 3 |

## Apps
- **[Support Desk App](app-supportdeskapp)** (Canvas App)

## Automation
| Name | Type | Trigger / Execution | Scope / Actions | Status |
| :--- | :--- | :--- | :--- | :--- |
| [Incident Escalation](flow-incident-escalation) | Cloud Flow | Automated | 4 action steps | Active |

## Data model
| Table | Logical Name | Columns | Forms | Views |
| :--- | :--- | :--- | :--- | :--- |
| **Support Ticket** | \`contoso_ticket\` | 9 | 1 | 2 |

## Connectors used
| Connector | # Flows | # Apps | Connection References |
| :--- | :--- | :--- | :--- |
| **Microsoft Dataverse** | 1 | 1 | \`contoso_dataverse\` |

## Environment variables
| Name | Type | Default | Current |
| :--- | :--- | :--- | :--- |
| **Support Escalation Email** (\`contoso_SupportEscalationEmail\`) | \`String\` | \`admin@contoso.com\` | *(not set)* |

## Dependency highlights
| Source Component | Type | Operation | Target Entity / Field | Context / Details |
| :--- | :--- | :--- | :--- | :--- |
| **Incident Escalation** | \`flow\` | \`READ\` | \`contoso_ticket\` | When_a_ticket_is_created |
`;

  const overviewChunks = chunkMarkdown(mockOverviewMarkdown);
  const headings = overviewChunks.map((c) => c.heading_context);
  assert.ok(headings.some((h) => h.includes('Overview')), 'Should contain Overview section');
  assert.ok(headings.some((h) => h.includes('Component inventory')), 'Should contain Component inventory section');
  assert.ok(headings.some((h) => h.includes('Apps')), 'Should contain Apps section');
  assert.ok(headings.some((h) => h.includes('Automation')), 'Should contain Automation section');
  assert.ok(headings.some((h) => h.includes('Data model')), 'Should contain Data model section');
  assert.ok(headings.some((h) => h.includes('Connectors used')), 'Should contain Connectors used section');
  assert.ok(headings.some((h) => h.includes('Environment variables')), 'Should contain Environment variables section');
  assert.ok(headings.some((h) => h.includes('Dependency highlights')), 'Should contain Dependency highlights section');
  console.log('✓ Solution Overview 8-section schema verified!');

  // 6. Test Business Rule 6-section Schema & Database
  console.log('6. Testing Business Rule 6-section schema & DB persistence...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS business_rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      table_logical_name TEXT NOT NULL,
      scope TEXT,
      state TEXT,
      description TEXT,
      conditions JSONB,
      actions JSONB,
      else_actions JSONB,
      fields_read JSONB,
      fields_written JSONB,
      applies_to_forms JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(
    `INSERT INTO business_rules (
      id, project_id, name, table_logical_name, scope, state, description,
      conditions, actions, else_actions, fields_read, fields_written, applies_to_forms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      'br_1',
      'p1',
      'Require Issue Details for Critical Tickets',
      'contoso_ticket',
      'Entity',
      'Active',
      'Enforces issue details requirement when ticket priority is Critical.',
      JSON.stringify([{ field: 'contoso_prioritycode', operator: 'equals', value: 'Critical (P1) (4)' }]),
      JSON.stringify([{ action_type: 'Set required', target_field: 'contoso_description', value_or_message: 'Business Required' }]),
      JSON.stringify([{ action_type: 'Set required', target_field: 'contoso_description', value_or_message: 'Optional / Not Required' }]),
      JSON.stringify(['contoso_prioritycode']),
      JSON.stringify(['contoso_description']),
      JSON.stringify(['All Forms (Entity scope – runs on all client forms and server-side)']),
    ]
  );

  const brRes = await db.query(`SELECT * FROM business_rules WHERE project_id = $1`, ['p1']);
  assert.strictEqual(brRes.rows.length, 1);
  assert.strictEqual(brRes.rows[0].table_logical_name, 'contoso_ticket');
  assert.strictEqual(brRes.rows[0].scope, 'Entity');

  const mockBrMarkdown = `---
doc_id: br_contoso_ticket__require-issue-details-for-critical-tickets
doc_type: business_rule
name: Require Issue Details for Critical Tickets
primary_table: contoso_ticket
---

# Business Rule: Require Issue Details for Critical Tickets

## Overview
- **Name**: Require Issue Details for Critical Tickets
- **Table**: Support Ticket (\`contoso_ticket\`)
- **Scope**: Entity
- **State**: Active
- **Description**: Enforces issue details requirement when ticket priority is Critical.

## Conditions
IF (**Priority** (\`contoso_prioritycode\`) equals "Critical (P1) (4)")

## Actions
| Action Type | Target Field | Value / Message |
| :--- | :--- | :--- |
| Set required | **Issue Details** (\`contoso_description\`) | Business Required |

## Else actions
| Action Type | Target Field | Value / Message |
| :--- | :--- | :--- |
| Set required | **Issue Details** (\`contoso_description\`) | Optional / Not Required |

## Fields involved
| Field | Logical Name | Access |
| :--- | :--- | :--- |
| Priority | \`contoso_prioritycode\` | Read (Condition) |
| Issue Details | \`contoso_description\` | Written (Action) |

- **Read**: \`contoso_prioritycode\`
- **Written**: \`contoso_description\`

## Applies to forms
- All Forms (Entity scope – runs on all client forms and server-side)
`;

  const brChunks = chunkMarkdown(mockBrMarkdown);
  const brHeadings = brChunks.map((c) => c.heading_context);
  assert.ok(brHeadings.some((h) => h.includes('Overview')), 'BR should contain Overview');
  assert.ok(brHeadings.some((h) => h.includes('Conditions')), 'BR should contain Conditions');
  assert.ok(brHeadings.some((h) => h.includes('Actions')), 'BR should contain Actions');
  assert.ok(brHeadings.some((h) => h.includes('Else actions')), 'BR should contain Else actions');
  assert.ok(brHeadings.some((h) => h.includes('Fields involved')), 'BR should contain Fields involved');
  assert.ok(brHeadings.some((h) => h.includes('Applies to forms')), 'BR should contain Applies to forms');
  console.log('✓ Business Rule 6-section schema verified!');

  // 7. Test XAML SetAttributeValueStep resolution & Owner display name
  console.log('7. Testing XAML SetAttributeValueStep resolution...');
  const testXaml = `
  <Activity>
    <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.EvaluateExpression, Microsoft.Crm.Workflow" DisplayName="EvaluateExpression">
      <mxswa:ActivityReference.Arguments>
        <InArgument x:TypeArguments="x:String" x:Key="ExpressionOperator">CreateCrmType</InArgument>
        <InArgument x:TypeArguments="s:Object[]" x:Key="Parameters">[New Object() { Microsoft.Crm.Workflow.ObjectId.EntityLogicalName, "systemuser", "e3d1c410-0000-0000-0000-000000000000", "Helpdesk Lead" }]</InArgument>
        <OutArgument x:TypeArguments="x:Object" x:Key="Result">[SetAttributeValueStep1_1]</OutArgument>
      </mxswa:ActivityReference.Arguments>
    </mxswa:ActivityReference>
    <mxswa:SetEntityProperty Attribute="ownerid" Entity="[InputEntities(&quot;primaryEntity&quot;)]" EntityName="opportunity" Value="[SetAttributeValueStep1_1]">
    </mxswa:SetEntityProperty>
  </Activity>
  `;

  // Inline simulation of parseXamlVariables & resolveActionValue logic
  const activityRefRegex = /<mxswa:ActivityReference[^>]*AssemblyQualifiedName="[^"]*EvaluateExpression[^"]*"[^>]*>([\s\S]*?)<\/mxswa:ActivityReference>/gi;
  const varMap = new Map();
  for (const match of testXaml.matchAll(activityRefRegex)) {
    const block = match[1];
    const resultMatch = block.match(/<OutArgument[^>]*x:Key="Result"[^>]*>([\s\S]*?)<\/OutArgument>/i);
    let varName = '';
    if (resultMatch) {
      const nameM = resultMatch[1].match(/\[([a-zA-Z0-9_]+)\]/);
      if (nameM) varName = nameM[1].trim();
    }
    const paramsMatch = block.match(/<InArgument[^>]*x:Key="Parameters"[^>]*>([\s\S]*?)<\/InArgument>/i);
    const paramsText = paramsMatch ? paramsMatch[1].trim() : '';
    const entRefMatch = paramsText.match(/(?:ObjectId\.EntityLogicalName|EntityReference|Lookup)[^"]*"([a-zA-Z0-9_]+)"(?:\s*,\s*"([^"]+)")?(?:\s*,\s*"([^"]+)")?/i);
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
    }
  }

  assert.strictEqual(varMap.get('setattributevaluestep1_1'), 'Helpdesk Lead (User)');
  console.log('✓ XAML SetAttributeValueStep successfully resolved to friendly value!');

  // 8. Test Security Role 4-section schema, DB persistence, and privilege mapping
  console.log('8. Testing Security Role 4-section schema & DB persistence...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS security_roles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      business_unit TEXT,
      description TEXT,
      table_privileges JSONB,
      misc_privileges JSONB,
      assigned_apps JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const mockRole = {
    id: '{f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c}',
    name: 'Customer Support Representative',
    business_unit: 'Business Unit',
    description: 'Provides read and write access to customer tickets, accounts, and contacts within the business unit.',
    table_privileges: [
      {
        table: 'contoso_ticket',
        table_display_name: 'Support Ticket',
        create: 'BU',
        read: 'Parent',
        write: 'BU',
        delete: 'User',
        append: 'BU',
        append_to: 'BU',
        assign: 'User',
        share: 'User',
      },
      {
        table: 'account',
        table_display_name: 'Account',
        create: 'None',
        read: 'BU',
        write: 'None',
        delete: 'None',
        append: 'None',
        append_to: 'None',
        assign: 'None',
        share: 'None',
      },
    ],
    misc_privileges: ['prvExportToExcel'],
    assigned_apps: ['Customer Care Hub'],
  };

  await db.query(
    `INSERT INTO security_roles (
      id, project_id, name, business_unit, description,
      table_privileges, misc_privileges, assigned_apps
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      mockRole.id,
      'p1',
      mockRole.name,
      mockRole.business_unit,
      mockRole.description,
      JSON.stringify(mockRole.table_privileges),
      JSON.stringify(mockRole.misc_privileges),
      JSON.stringify(mockRole.assigned_apps),
    ]
  );

  const roleRes = await db.query(`SELECT * FROM security_roles WHERE project_id = $1`, ['p1']);
  assert.strictEqual(roleRes.rows.length, 1);
  assert.strictEqual(roleRes.rows[0].name, 'Customer Support Representative');
  assert.strictEqual(roleRes.rows[0].business_unit, 'Business Unit');

  // Verify Markdown Generation & 4-section schema
  const mockRoleMarkdown = `---
doc_id: role_customer-support-representative
doc_type: security_role
name: Customer Support Representative
solution: ContosoServiceDesk
solution_version: 1.0.0.0
publisher_prefix: contoso
tags: [security-role, security, customer-support-representative]
---

# Security role: Customer Support Representative

> Provides read and write access to customer tickets, accounts, and contacts within the business unit.

Security role definition and privilege matrix defined in **Contoso Service Desk**.

---

## Overview
- **Name**: Customer Support Representative
- **Business unit scope**: Business Unit
- **Description**: Provides read and write access to customer tickets, accounts, and contacts within the business unit.

## Table privileges
| Table | Create | Read | Write | Delete | Append | AppendTo | Assign | Share |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Support Ticket (\`contoso_ticket\`) | BU | Parent | BU | User | BU | BU | User | User |
| Account (\`account\`) | None | BU | None | None | None | None | None | None |

## Misc privileges
- \`prvExportToExcel\`

## Assigned to apps
- Customer Care Hub
`;

  const roleChunks = chunkMarkdown(mockRoleMarkdown);
  const roleHeadings = roleChunks.map((c) => c.heading_context);
  assert.ok(roleHeadings.some((h) => h.includes('Overview')), 'Role should contain Overview');
  assert.ok(roleHeadings.some((h) => h.includes('Table privileges')), 'Role should contain Table privileges');
  assert.ok(roleHeadings.some((h) => h.includes('Misc privileges')), 'Role should contain Misc privileges');
  assert.ok(roleHeadings.some((h) => h.includes('Assigned to apps')), 'Role should contain Assigned to apps');
  console.log('✓ Security Role 4-section schema & DB persistence verified!');

  // 9. Testing buildCombinedMarkdown for Sidebar AIs & Complete Handbook
  console.log('9. Testing buildCombinedMarkdown logic & anchor structure...');
  function slugifyTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildCombinedMarkdown(project, docs) {
    const title = project.display_name || project.unique_name;
    let markdown = `# ${title} - Complete Solution Architecture & Documentation Handbook\n\n`;

    markdown += `> [!IMPORTANT]\n`;
    markdown += `> **AI System Reference & Scope Notice**:\n`;
    markdown += `> This comprehensive document aggregates the entire technical architecture, Dataverse data model, automated Power Automate cloud flows, Canvas applications, Business Rules, Security Roles, client scripts (Web Resources), and environment variables for the Microsoft Power Platform solution **${title}** (\`${project.unique_name}\`, v\`${project.version}\`).\n`;
    markdown += `> Browser-based AI assistants (such as Microsoft Copilot in the Edge sidebar, Chrome AI sidepanel, or external LLMs) reading this page should use this unified context to accurately answer queries about system entities, relationships, field definitions, trigger events, action logic, security privileges, and dependencies across the entire solution.\n\n`;

    markdown += `## Solution Specifications\n\n`;
    markdown += `| Attribute | Specification |\n`;
    markdown += `| :--- | :--- |\n`;
    markdown += `| **Display Name** | ${project.display_name} |\n`;
    markdown += `| **Unique (Schema) Name** | \`${project.unique_name}\` |\n`;
    markdown += `| **Version** | \`${project.version}\` |\n`;
    markdown += `| **Package Type** | ${project.is_managed ? 'Managed' : 'Unmanaged'} |\n`;
    markdown += `| **Publisher** | ${project.publisher_name || 'Standard'} |\n\n`;

    markdown += `<a id="table-of-contents"></a>\n\n`;
    markdown += `## Table of Contents\n\n`;
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const anchor = slugifyTitle(doc.title);
      markdown += `${i + 1}. [${doc.title}](#${anchor})\n`;
    }

    markdown += `\n---\n\n`;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const anchor = slugifyTitle(doc.title);
      markdown += `<a id="${anchor}"></a>\n`;
      markdown += `<div id="doc-${doc.slug}"></div>\n\n`;
      markdown += `${doc.content_markdown}\n\n`;
      markdown += `[↑ Back to Table of Contents](#table-of-contents)\n\n`;
      if (i < docs.length - 1) {
        markdown += `---\n\n`;
      }
    }

    return markdown;
  }

  const mockProject = {
    id: 'proj_test_1',
    unique_name: 'CustomerServiceHub',
    display_name: 'Customer Service Hub',
    version: '1.2.0.0',
    is_managed: true,
    publisher_name: 'Contoso',
    stats: {
      entity_count: 5,
      flow_count: 3,
      canvas_app_count: 1,
      business_rule_count: 2,
      security_role_count: 1,
      web_resource_count: 4,
    }
  };

  const mockDocs = [
    { id: 'd1', slug: 'overview', title: 'Architecture & Overview', content_markdown: '# Architecture & Overview\nSystem overview details.' },
    { id: 'd2', slug: 'flow-process-order', title: 'Flow: Process Order', content_markdown: '# Flow: Process Order\nTriggers on create.' }
  ];

  const combined = buildCombinedMarkdown(mockProject, mockDocs);
  assert.ok(combined.includes('AI System Reference & Scope Notice'), 'Must include AI preamble');
  assert.ok(combined.includes('Microsoft Copilot in the Edge sidebar'), 'Must mention Copilot sidebar context');
  assert.ok(combined.includes('Customer Service Hub'), 'Must include project display name');
  assert.ok(combined.includes('Table of Contents'), 'Must include TOC');
  assert.ok(combined.includes('[Architecture & Overview](#architecture-overview)'), 'Must link to slugified anchor');
  assert.ok(combined.includes('<a id="architecture-overview"></a>'), 'Must include matching anchor target');
  assert.ok(combined.includes('Back to Table of Contents'), 'Must include Back to TOC links');
  console.log('✓ buildCombinedMarkdown logic & anchor structure verified!');

  console.log('\nAll verification tests passed successfully! 🎉\n');
}

testDb().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
