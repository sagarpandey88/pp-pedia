import JSZip from 'jszip';

export async function createSampleSolutionZip(): Promise<Blob> {
  const zip = new JSZip();

  // 1. solution.xml
  const solutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>ContosoCustomerSupport</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Contoso Customer Support &amp; Incident Management" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <Description description="Comprehensive enterprise service desk management solution for tracking incidents, escalations, SLAs, and customer accounts." languagecode="1033" />
    </Descriptions>
    <Version>2.1.0.4</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>contoso</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Contoso Technologies" languagecode="1033" />
      </LocalizedNames>
      <Descriptions>
        <Description description="Core Solutions Publisher" languagecode="1033" />
      </Descriptions>
      <EMailAddress>admin@contoso.com</EMailAddress>
      <SupportingWebsiteUrl>https://contoso.com/support</SupportingWebsiteUrl>
      <CustomizationPrefix>contoso</CustomizationPrefix>
      <CustomizationOptionValuePrefix>10000</CustomizationOptionValuePrefix>
    </Publisher>
    <RootComponents>
      <RootComponent type="1" schemaName="contoso_ticket" behavior="0" />
      <RootComponent type="1" schemaName="account" behavior="0" />
      <RootComponent type="1" schemaName="contact" behavior="0" />
      <RootComponent type="29" id="{77a6f23b-3bc1-4478-9a2c-e1f4095a8b72}" />
      <RootComponent type="300" schemaName="SupportDeskApp" />
      <RootComponent type="380" schemaName="contoso_SupportEscalationEmail" />
    </RootComponents>
  </SolutionManifest>
</ImportExportXml>`;
  zip.file('solution.xml', solutionXml);

  // 2. customizations.xml
  const customizationsXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities>
    <Entity>
      <Name LocalizedName="Support Ticket" OriginalName="Ticket">contoso_ticket</Name>
      <EntityInfo>
        <entity Name="contoso_ticket">
          <LocalizedNames>
            <LocalizedName description="Support Ticket" languagecode="1033" />
          </LocalizedNames>
          <Descriptions>
            <Description description="Service desk incident record for reporting and resolving customer technical issues." languagecode="1033" />
          </Descriptions>
          <attributes>
            <attribute PhysicalName="contoso_ticketid">
              <Type>primarykey</Type>
              <Name>contoso_ticketid</Name>
              <LogicalName>contoso_ticketid</LogicalName>
              <RequiredLevel>systemrequired</RequiredLevel>
              <DisplayNames>
                <DisplayName description="Ticket ID" languagecode="1033" />
              </DisplayNames>
              <Descriptions>
                <Description description="Unique record identifier for the support ticket." languagecode="1033" />
              </Descriptions>
            </attribute>
            <attribute PhysicalName="contoso_title">
              <Type>nvarchar</Type>
              <Name>contoso_title</Name>
              <LogicalName>contoso_title</LogicalName>
              <Format>text</Format>
              <RequiredLevel>required</RequiredLevel>
              <DisplayNames>
                <DisplayName description="Ticket Title" languagecode="1033" />
              </DisplayNames>
              <Descriptions>
                <Description description="Short summary of the issue reported by the customer." languagecode="1033" />
              </Descriptions>
            </attribute>
            <attribute PhysicalName="contoso_description">
              <Type>memo</Type>
              <Name>contoso_description</Name>
              <LogicalName>contoso_description</LogicalName>
              <RequiredLevel>recommended</RequiredLevel>
              <DisplayNames>
                <DisplayName description="Issue Details" languagecode="1033" />
              </DisplayNames>
              <Descriptions>
                <Description description="Detailed description and reproduction steps for the support issue." languagecode="1033" />
              </Descriptions>
            </attribute>
            <attribute PhysicalName="contoso_prioritycode">
              <Type>picklist</Type>
              <Name>contoso_prioritycode</Name>
              <LogicalName>contoso_prioritycode</LogicalName>
              <RequiredLevel>required</RequiredLevel>
              <DisplayNames>
                <DisplayName description="Priority" languagecode="1033" />
              </DisplayNames>
              <OptionSet Name="contoso_ticket_priority">
                <options>
                  <option value="1"><labels><label description="Low" languagecode="1033" /></labels></option>
                  <option value="2"><labels><label description="Medium" languagecode="1033" /></labels></option>
                  <option value="3"><labels><label description="High" languagecode="1033" /></labels></option>
                  <option value="4"><labels><label description="Critical (P1)" languagecode="1033" /></labels></option>
                </options>
              </OptionSet>
            </attribute>
            <attribute PhysicalName="contoso_statuscode">
              <Type>picklist</Type>
              <Name>contoso_statuscode</Name>
              <LogicalName>contoso_statuscode</LogicalName>
              <RequiredLevel>required</RequiredLevel>
              <DisplayNames>
                <DisplayName description="Ticket Status" languagecode="1033" />
              </DisplayNames>
              <OptionSet Name="contoso_ticket_status">
                <options>
                  <option value="1"><labels><label description="New / Unassigned" languagecode="1033" /></labels></option>
                  <option value="2"><labels><label description="In Investigation" languagecode="1033" /></labels></option>
                  <option value="3"><labels><label description="Waiting for Customer" languagecode="1033" /></labels></option>
                  <option value="4"><labels><label description="Resolved" languagecode="1033" /></labels></option>
                  <option value="5"><labels><label description="Closed" languagecode="1033" /></labels></option>
                </options>
              </OptionSet>
            </attribute>
            <attribute PhysicalName="contoso_customeraccountid">
              <Type>lookup</Type>
              <Name>contoso_customeraccountid</Name>
              <LogicalName>contoso_customeraccountid</LogicalName>
              <RequiredLevel>required</RequiredLevel>
              <LookupTypes>
                <LookupType id="1">account</LookupType>
              </LookupTypes>
              <DisplayNames>
                <DisplayName description="Customer Account" languagecode="1033" />
              </DisplayNames>
            </attribute>
            <attribute PhysicalName="contoso_primarycontactid">
              <Type>lookup</Type>
              <Name>contoso_primarycontactid</Name>
              <LogicalName>contoso_primarycontactid</LogicalName>
              <LookupTypes>
                <LookupType id="1">contact</LookupType>
              </LookupTypes>
              <DisplayNames>
                <DisplayName description="Primary Contact" languagecode="1033" />
              </DisplayNames>
            </attribute>
            <attribute PhysicalName="contoso_sladuedate">
              <Type>datetime</Type>
              <Name>contoso_sladuedate</Name>
              <LogicalName>contoso_sladuedate</LogicalName>
              <DisplayNames>
                <DisplayName description="SLA Target Due Date" languagecode="1033" />
              </DisplayNames>
            </attribute>
          </attributes>
        </entity>
      </EntityInfo>
      <OneToManyRelationships>
        <OneToManyRelationship Name="contoso_account_tickets">
          <ReferencingEntity>contoso_ticket</ReferencingEntity>
          <ReferencedEntity>account</ReferencedEntity>
          <ReferencingAttribute>contoso_customeraccountid</ReferencingAttribute>
          <CascadeAssign>NoCascade</CascadeAssign>
          <CascadeDelete>RemoveLink</CascadeDelete>
        </OneToManyRelationship>
        <OneToManyRelationship Name="contoso_contact_tickets">
          <ReferencingEntity>contoso_ticket</ReferencingEntity>
          <ReferencedEntity>contact</ReferencedEntity>
          <ReferencingAttribute>contoso_primarycontactid</ReferencingAttribute>
          <CascadeAssign>NoCascade</CascadeAssign>
          <CascadeDelete>RemoveLink</CascadeDelete>
        </OneToManyRelationship>
      </OneToManyRelationships>
    </Entity>
    <Entity>
      <Name LocalizedName="Account" OriginalName="Account">account</Name>
      <EntityInfo>
        <entity Name="account">
          <LocalizedNames>
            <LocalizedName description="Account" languagecode="1033" />
          </LocalizedNames>
          <Descriptions>
            <Description description="Business customer or client organization." languagecode="1033" />
          </Descriptions>
          <attributes>
            <attribute PhysicalName="accountid">
              <Type>primarykey</Type>
              <Name>accountid</Name>
              <LogicalName>accountid</LogicalName>
              <DisplayNames>
                <DisplayName description="Account ID" languagecode="1033" />
              </DisplayNames>
            </attribute>
            <attribute PhysicalName="name">
              <Type>nvarchar</Type>
              <Name>name</Name>
              <LogicalName>name</LogicalName>
              <DisplayNames>
                <DisplayName description="Account Name" languagecode="1033" />
              </DisplayNames>
            </attribute>
            <attribute PhysicalName="telephone1">
              <Type>nvarchar</Type>
              <Name>telephone1</Name>
              <LogicalName>telephone1</LogicalName>
              <DisplayNames>
                <DisplayName description="Main Phone" languagecode="1033" />
              </DisplayNames>
            </attribute>
          </attributes>
        </entity>
      </EntityInfo>
    </Entity>
    <Entity>
      <Name LocalizedName="Contact" OriginalName="Contact">contact</Name>
      <EntityInfo>
        <entity Name="contact">
          <LocalizedNames>
            <LocalizedName description="Contact" languagecode="1033" />
          </LocalizedNames>
          <Descriptions>
            <Description description="Individual contact person affiliated with a customer account." languagecode="1033" />
          </Descriptions>
          <attributes>
            <attribute PhysicalName="contactid">
              <Type>primarykey</Type>
              <Name>contactid</Name>
              <LogicalName>contactid</LogicalName>
              <DisplayNames>
                <DisplayName description="Contact ID" languagecode="1033" />
              </DisplayNames>
            </attribute>
            <attribute PhysicalName="fullname">
              <Type>nvarchar</Type>
              <Name>fullname</Name>
              <LogicalName>fullname</LogicalName>
              <DisplayNames>
                <DisplayName description="Full Name" languagecode="1033" />
              </DisplayNames>
            </attribute>
            <attribute PhysicalName="emailaddress1">
              <Type>nvarchar</Type>
              <Name>emailaddress1</Name>
              <LogicalName>emailaddress1</LogicalName>
              <DisplayNames>
                <DisplayName description="Email Address" languagecode="1033" />
              </DisplayNames>
            </attribute>
          </attributes>
        </entity>
      </EntityInfo>
    </Entity>
  </Entities>
  <OptionSets>
    <OptionSet Name="contoso_ticket_severity">
      <LocalizedNames>
        <LocalizedName description="Global Ticket Severity" languagecode="1033" />
      </LocalizedNames>
      <options>
        <option value="100"><labels><label description="Sev-1 Outage" languagecode="1033" /></labels></option>
        <option value="200"><labels><label description="Sev-2 Major Degradation" languagecode="1033" /></labels></option>
        <option value="300"><labels><label description="Sev-3 Minor Issue" languagecode="1033" /></labels></option>
      </options>
    </OptionSet>
  </OptionSets>
  <WebResources>
    <WebResource>
      <WebResourceId>{a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d}</WebResourceId>
      <Name>contoso_ticket_validation.js</Name>
      <DisplayName>Ticket Form Validation Scripts</DisplayName>
      <Description>Enforces SLA deadlines, validates priority changes, and checks customer account balance.</Description>
      <WebResourceType>3</WebResourceType>
      <FileName>/WebResources/contoso_ticket_validation.js</FileName>
    </WebResource>
  </WebResources>
  <AppModuleSiteMap>
    <SiteMap>
      <Area Id="SupportArea" Title="Customer Support">
        <Group Id="TicketGroup" Title="Operations">
          <SubArea Id="TicketsSub" Entity="contoso_ticket" Title="Support Incidents" />
          <SubArea Id="AccountsSub" Entity="account" Title="Accounts" />
          <SubArea Id="ContactsSub" Entity="contact" Title="Contacts" />
        </Group>
      </Area>
    </SiteMap>
  </AppModuleSiteMap>
  <Workflows>
    <Workflow WorkflowId="{d3a2c5e1-7489-4e09-9f7b-99f123456789}" Name="Require Issue Details for Critical Tickets">
      <LocalizedNames>
        <LocalizedName description="Require Issue Details for Critical Tickets" languagecode="1033" />
      </LocalizedNames>
      <Descriptions>
        <Description description="Enforces issue details requirement and validates reproduction steps when ticket priority is set to Critical (P1)." languagecode="1033" />
      </Descriptions>
      <Category>2</Category>
      <PrimaryEntity>contoso_ticket</PrimaryEntity>
      <Scope>4</Scope>
      <StateCode>1</StateCode>
      <StatusCode>2</StatusCode>
      <ClientData><![CDATA[{"rules":[{"conditions":[{"field":"contoso_prioritycode","operator":"equals","value":"4"}],"actions":[{"actionType":"Set required","targetField":"contoso_description","valueOrMessage":"Business Required"},{"actionType":"Show error","targetField":"contoso_description","valueOrMessage":"Critical tickets must have detailed reproduction steps in Issue Details."}],"elseActions":[{"actionType":"Set required","targetField":"contoso_description","valueOrMessage":"Optional / Not Required"}]}]}]]></ClientData>
    </Workflow>
  </Workflows>
  <Roles>
    <Role id="{f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c}" name="Customer Support Representative" description="Provides read and write access to customer tickets, accounts, and contacts within the business unit.">
      <BusinessUnitId>{bu-guid-001}</BusinessUnitId>
      <RolePrivileges>
        <RolePrivilege name="prvCreatecontoso_ticket" level="Local" />
        <RolePrivilege name="prvReadcontoso_ticket" level="Deep" />
        <RolePrivilege name="prvWritecontoso_ticket" level="Local" />
        <RolePrivilege name="prvDeletecontoso_ticket" level="Basic" />
        <RolePrivilege name="prvAppendcontoso_ticket" level="Local" />
        <RolePrivilege name="prvAppendTocontoso_ticket" level="Local" />
        <RolePrivilege name="prvAssigncontoso_ticket" level="Basic" />
        <RolePrivilege name="prvSharecontoso_ticket" level="Basic" />
        <RolePrivilege name="prvReadaccount" level="Local" />
        <RolePrivilege name="prvReadcontact" level="Local" />
        <RolePrivilege name="prvExportToExcel" level="Global" />
      </RolePrivileges>
    </Role>
    <Role id="{a2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d}" name="Support Administrator" description="Full organization-level administrative privileges over ticketing operations.">
      <RolePrivileges>
        <RolePrivilege name="prvCreatecontoso_ticket" level="Global" />
        <RolePrivilege name="prvReadcontoso_ticket" level="Global" />
        <RolePrivilege name="prvWritecontoso_ticket" level="Global" />
        <RolePrivilege name="prvDeletecontoso_ticket" level="Global" />
        <RolePrivilege name="prvAppendcontoso_ticket" level="Global" />
        <RolePrivilege name="prvAppendTocontoso_ticket" level="Global" />
        <RolePrivilege name="prvAssigncontoso_ticket" level="Global" />
        <RolePrivilege name="prvSharecontoso_ticket" level="Global" />
        <RolePrivilege name="prvExportToExcel" level="Global" />
        <RolePrivilege name="prvBulkDelete" level="Global" />
      </RolePrivileges>
    </Role>
  </Roles>
  <AppModules>
    <AppModule>
      <UniqueName>contoso_support_hub</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Customer Care Hub" languagecode="1033" />
      </LocalizedNames>
      <AppModuleRoles>
        <AppModuleRole roleid="{f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c}" />
        <AppModuleRole roleid="{a2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d}" />
      </AppModuleRoles>
    </AppModule>
  </AppModules>
</ImportExportXml>`;
  zip.file('customizations.xml', customizationsXml);

  // 2.5 WebResources/contoso_ticket_validation.js
  const scriptContent = `// Contoso Ticket Form Validation Scripts
var Contoso = window.Contoso || {};
Contoso.Ticket = {
  onLoad: function (executionContext) {
    var formContext = executionContext.getFormContext();
    var title = formContext.getAttribute("contoso_title").getValue();
    console.log("Ticket loaded: " + title);

    // Modernization check: legacy API usage
    if (typeof Xrm !== "undefined" && Xrm.Page) {
      console.warn("Using legacy Xrm.Page context");
    }
  },

  onPriorityChange: function (executionContext) {
    var formContext = executionContext.getFormContext();
    var priority = formContext.getAttribute("contoso_prioritycode").getValue();

    // Field impact demo: setting resolution notes required
    if (priority === 4) {
      formContext.getAttribute("contoso_resolutionnotes").setRequiredLevel("required");
    } else {
      formContext.getAttribute("contoso_resolutionnotes").setRequiredLevel("none");
    }
  },

  onSave: function (executionContext) {
    var formContext = executionContext.getFormContext();
    var status = formContext.getAttribute("contoso_statuscode").getValue();

    if (status === 3) {
      // Direct WebApi mutation
      Xrm.WebApi.updateRecord("contoso_ticket", formContext.data.entity.getId(), {
        contoso_resolutionnotes: "Resolved via ticket script automation"
      });
    }
  }
};
`;
  zip.file('WebResources/contoso_ticket_validation.js', scriptContent);

  // 3. Workflows/EscalateOverdueTickets.json
  const flowJson = {
    properties: {
      displayName: 'Escalate Overdue Critical Incidents',
      state: 'Activated',
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        triggers: {
          Recurrence_Hourly_Check: {
            type: 'Recurrence',
            recurrence: {
              frequency: 'Hour',
              interval: 1,
            },
          },
        },
        actions: {
          List_Overdue_Tickets: {
            type: 'OpenApiConnection',
            inputs: {
              host: { connectionName: 'shared_commondataserviceforapps' },
              parameters: {
                entityName: 'contoso_tickets',
                filter: "contoso_statuscode ne 4 and contoso_sladuedate lt utcNow() and contoso_prioritycode eq 4",
              },
            },
            runAfter: {},
          },
          For_Each_Overdue_Ticket: {
            type: 'Foreach',
            inputs: "@outputs('List_Overdue_Tickets')?['body/value']",
            actions: {
              Send_Teams_Emergency_Alert: {
                type: 'OpenApiConnection',
                inputs: {
                  host: { connectionName: 'shared_teams' },
                  parameters: {
                    channelId: 'service-desk-emergencies',
                    message: "Overdue Critical SLA Ticket: @{items('For_Each_Overdue_Ticket')?['contoso_title']}",
                  },
                },
                runAfter: {},
              },
              Send_Escalation_Manager_Email: {
                type: 'OpenApiConnection',
                inputs: {
                  host: { connectionName: 'shared_office365' },
                  parameters: {
                    to: "@{parameters('contoso_SupportEscalationEmail')}",
                    subject: "URGENT SLA BREACH: Ticket @{items('For_Each_Overdue_Ticket')?['contoso_ticketid']}",
                  },
                },
                runAfter: {
                  Send_Teams_Emergency_Alert: ['Succeeded'],
                },
              },
            },
            runAfter: {
              List_Overdue_Tickets: ['Succeeded'],
            },
          },
        },
        connectionReferences: {
          shared_commondataserviceforapps: {
            connection: { name: 'shared_commondataserviceforapps' },
            id: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
          },
          shared_teams: {
            connection: { name: 'shared_teams' },
            id: '/providers/Microsoft.PowerApps/apis/shared_teams',
          },
          shared_office365: {
            connection: { name: 'shared_office365' },
            id: '/providers/Microsoft.PowerApps/apis/shared_office365',
          },
        },
      },
    },
  };
  zip.file('Workflows/EscalateOverdueTickets.json', JSON.stringify(flowJson, null, 2));

  // 3.5 Workflows/SyncSupportMetricsToPowerBI.json
  const powerBiFlowJson = {
    properties: {
      displayName: 'Sync Support Metrics to Power BI Dashboard',
      state: 'Activated',
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        triggers: {
          When_Ticket_Created_Or_Updated: {
            type: 'OpenApiConnection',
            inputs: {
              host: { connectionName: 'shared_commondataserviceforapps' },
              parameters: {
                entityName: 'contoso_ticket',
                filter: "contoso_prioritycode eq 4",
              },
            },
          },
        },
        actions: {
          Add_Rows_To_PowerBI_Dataset: {
            type: 'OpenApiConnection',
            inputs: {
              host: {
                apiId: '/providers/Microsoft.PowerApps/apis/shared_powerbi',
                connectionName: 'shared_powerbi',
                operationId: 'AddRowsToDataset',
              },
              parameters: {
                groupId: 'me',
                datasetId: '9b1deb4d-3b7d-4b69-9df3-7052e635da88',
                table: 'DailyIncidentSLA',
                rows: {
                  TicketId: "@triggerOutputs()?['body/contoso_ticketid']",
                  Title: "@triggerOutputs()?['body/contoso_title']",
                  Priority: "@triggerOutputs()?['body/contoso_prioritycode']",
                  Status: "@triggerOutputs()?['body/contoso_statuscode']",
                },
              },
            },
          },
        },
        connectionReferences: {
          shared_powerbi: {
            connection: { name: 'shared_powerbi' },
            id: '/providers/Microsoft.PowerApps/apis/shared_powerbi',
          },
          shared_commondataserviceforapps: {
            connection: { name: 'shared_commondataserviceforapps' },
            id: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
          },
        },
      },
    },
  };
  zip.file('Workflows/SyncSupportMetricsToPowerBI.json', JSON.stringify(powerBiFlowJson, null, 2));

  // 4. CanvasApps/SupportDeskApp.msapp
  const msappZip = new JSZip();
  msappZip.file(
    'References/DataSources.json',
    JSON.stringify({
      DataSources: [
        { Name: 'contoso_tickets' },
        { Name: 'accounts' },
        { Name: 'contacts' },
        { Name: 'Office365Users' },
      ],
    })
  );
  msappZip.file(
    'Src/IncidentQueueScreen.fx.yaml',
    `IncidentQueueScreen As screen:
    QueueHeader As label:
        Text: ="Active Incidents Queue"
    TicketGallery As gallery.galleryVertical:
        Items: =Filter(contoso_tickets, contoso_statuscode <> 4)
    SearchTicketInput As text:
        Default: =""
    AssignToMeButton As button:
        OnSelect: =Patch(contoso_tickets, TicketGallery.Selected, { 'Owner': User() })
`
  );
  msappZip.file(
    'Src/TicketDetailScreen.fx.yaml',
    `TicketDetailScreen As screen:
    DetailHeader As label:
        Text: =TicketGallery.Selected.contoso_title
    StatusDropdown As dropdown:
        Items: =Choices(contoso_tickets.contoso_statuscode)
    SaveResolutionButton As button:
        OnSelect: =SubmitForm(EditFormTicket)
`
  );
  const msappBytes = await msappZip.generateAsync({ type: 'uint8array' });
  zip.file('CanvasApps/SupportDeskApp.msapp', msappBytes);

  // 5. environmentvariabledefinitions.json
  const envDefs = [
    {
      schemaname: 'contoso_SupportEscalationEmail',
      displayname: 'Support Escalation Manager Email',
      type: 'String',
      defaultvalue: 'support-duty-manager@contoso.com',
      description: 'Distribution email address receiving emergency incident escalation notifications.',
    },
    {
      schemaname: 'contoso_SLAHoursThreshold',
      displayname: 'Default Critical SLA Hours Threshold',
      type: 'Number',
      defaultvalue: '4',
      description: 'Maximum permitted hours before a Sev-1 / Critical ticket is considered in breach of SLA.',
    },
  ];
  zip.file('environmentvariabledefinitions.json', JSON.stringify(envDefs, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}

