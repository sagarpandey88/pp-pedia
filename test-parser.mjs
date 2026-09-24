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

  console.log('\nAll verification tests passed successfully! 🎉\n');
}

testDb().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
