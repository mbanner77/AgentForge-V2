// SAP Agenten und MCP-Server-Konfiguration
// Ermöglicht die Anbindung an SAP-Systeme über MCP (Model Context Protocol)

import type { Tool } from "./types"

// === SAP MCP SERVER TYPEN ===

export type SAPSystemType = 
  | "S4HANA" 
  | "S4HANA_CLOUD" 
  | "ECC" 
  | "BTP" 
  | "CPI" 
  | "ARIBA" 
  | "SUCCESSFACTORS" 
  | "CONCUR"
  | "FIELDGLASS"
  | "SIGNAVIO"
  | "BUILD"

export type SAPConnectionType = "RFC" | "ODATA" | "REST" | "SOAP" | "BAPI" | "IDOC"

export interface SAPCredentials {
  type: "basic" | "oauth2" | "certificate" | "apikey"
  username?: string
  password?: string
  clientId?: string
  clientSecret?: string
  tokenUrl?: string
  certificate?: string
  privateKey?: string
  apiKey?: string
}

export interface SAPSystemConfig {
  id: string
  name: string
  description?: string
  systemType: SAPSystemType
  host: string
  port?: number
  client?: string // SAP Mandant
  systemId?: string // SAP System ID (SID)
  instanceNumber?: string
  connectionType: SAPConnectionType
  credentials: SAPCredentials
  ssl: boolean
  proxy?: {
    host: string
    port: number
    username?: string
    password?: string
  }
  timeout?: number // in Sekunden
  language?: string // z.B. "DE", "EN"
  tags?: string[]
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

// === SAP MCP SERVER DEFINITIONEN ===

export interface SAPMCPServer {
  id: string
  name: string
  description: string
  serverType: "official" | "community" | "custom"
  version: string
  capabilities: SAPMCPCapability[]
  supportedSystems: SAPSystemType[]
  configSchema: SAPMCPConfigSchema
  installCommand?: string
  documentation?: string
  repository?: string
}

export interface SAPMCPCapability {
  id: string
  name: string
  description: string
  category: "read" | "write" | "execute" | "monitor" | "admin"
}

export interface SAPMCPConfigSchema {
  required: string[]
  properties: Record<string, {
    type: "string" | "number" | "boolean" | "array" | "object"
    description: string
    default?: unknown
    enum?: string[]
  }>
}

// Bekannte SAP MCP Server
export const SAP_MCP_SERVERS: SAPMCPServer[] = [
  {
    id: "sap-cap-mcp",
    name: "SAP CAP MCP Server",
    description: "MCP Server für SAP Cloud Application Programming Model (CAP)",
    serverType: "official",
    version: "1.0.0",
    capabilities: [
      { id: "cds-read", name: "CDS Entities lesen", description: "Liest CDS Entitäten", category: "read" },
      { id: "cds-write", name: "CDS Entities schreiben", description: "Schreibt CDS Entitäten", category: "write" },
      { id: "cds-deploy", name: "CDS Deploy", description: "Deployed CDS Modelle", category: "execute" },
      { id: "cds-compile", name: "CDS Compile", description: "Kompiliert CDS Modelle", category: "execute" },
    ],
    supportedSystems: ["BTP", "S4HANA_CLOUD"],
    configSchema: {
      required: ["projectPath"],
      properties: {
        projectPath: { type: "string", description: "Pfad zum CAP-Projekt" },
        profile: { type: "string", description: "CAP Profil", default: "development" },
      },
    },
    installCommand: "npm install @sap/cds-dk",
    documentation: "https://cap.cloud.sap/docs/",
    repository: "https://github.com/SAP/cds-dk",
  },
  {
    id: "sap-btp-mcp",
    name: "SAP BTP MCP Server",
    description: "MCP Server für SAP Business Technology Platform",
    serverType: "official",
    version: "1.0.0",
    capabilities: [
      { id: "btp-services", name: "BTP Services", description: "Verwaltet BTP Services", category: "admin" },
      { id: "btp-destinations", name: "Destinations", description: "Konfiguriert Destinations", category: "admin" },
      { id: "btp-deploy", name: "Deploy", description: "Deployed Apps auf BTP", category: "execute" },
      { id: "btp-logs", name: "Logs", description: "Liest Application Logs", category: "monitor" },
    ],
    supportedSystems: ["BTP"],
    configSchema: {
      required: ["subaccount", "region"],
      properties: {
        subaccount: { type: "string", description: "BTP Subaccount ID" },
        region: { type: "string", description: "BTP Region", enum: ["eu10", "eu20", "us10", "us20", "ap10", "ap20"] },
        cfApiEndpoint: { type: "string", description: "Cloud Foundry API Endpoint" },
      },
    },
    documentation: "https://help.sap.com/docs/btp",
  },
  {
    id: "sap-odata-mcp",
    name: "SAP OData MCP Server",
    description: "Generischer MCP Server für SAP OData Services",
    serverType: "official",
    version: "1.0.0",
    capabilities: [
      { id: "odata-read", name: "OData Read", description: "Liest OData Entitäten", category: "read" },
      { id: "odata-write", name: "OData Write", description: "Schreibt OData Entitäten", category: "write" },
      { id: "odata-batch", name: "OData Batch", description: "Führt Batch-Operationen aus", category: "execute" },
      { id: "odata-metadata", name: "OData Metadata", description: "Liest Service Metadata", category: "read" },
    ],
    supportedSystems: ["S4HANA", "S4HANA_CLOUD", "ECC", "BTP"],
    configSchema: {
      required: ["serviceUrl"],
      properties: {
        serviceUrl: { type: "string", description: "OData Service URL" },
        version: { type: "string", description: "OData Version", enum: ["v2", "v4"], default: "v4" },
        csrfProtection: { type: "boolean", description: "CSRF Token verwenden", default: true },
      },
    },
  },
  {
    id: "sap-rfc-mcp",
    name: "SAP RFC MCP Server",
    description: "MCP Server für SAP RFC/BAPI Aufrufe",
    serverType: "official",
    version: "1.0.0",
    capabilities: [
      { id: "rfc-call", name: "RFC Call", description: "Ruft RFC-Funktionsbausteine auf", category: "execute" },
      { id: "bapi-call", name: "BAPI Call", description: "Ruft BAPIs auf", category: "execute" },
      { id: "rfc-metadata", name: "RFC Metadata", description: "Liest Funktionsbaustein-Metadaten", category: "read" },
      { id: "rfc-table", name: "RFC Table Read", description: "Liest SAP Tabellen", category: "read" },
    ],
    supportedSystems: ["S4HANA", "ECC"],
    configSchema: {
      required: ["ashost", "sysnr", "client"],
      properties: {
        ashost: { type: "string", description: "SAP Application Server Host" },
        sysnr: { type: "string", description: "SAP System Number" },
        client: { type: "string", description: "SAP Mandant" },
        lang: { type: "string", description: "Anmeldesprache", default: "DE" },
        poolSize: { type: "number", description: "Connection Pool Größe", default: 5 },
      },
    },
    installCommand: "npm install node-rfc",
  },
  {
    id: "sap-cpi-mcp",
    name: "SAP CPI MCP Server",
    description: "MCP Server für SAP Cloud Platform Integration",
    serverType: "official",
    version: "1.0.0",
    capabilities: [
      { id: "cpi-iflows", name: "Integration Flows", description: "Verwaltet Integration Flows", category: "admin" },
      { id: "cpi-deploy", name: "Deploy iFlow", description: "Deployed Integration Flows", category: "execute" },
      { id: "cpi-monitor", name: "Message Monitor", description: "Überwacht Nachrichten", category: "monitor" },
      { id: "cpi-artifacts", name: "Artifacts", description: "Verwaltet Artifacts", category: "admin" },
    ],
    supportedSystems: ["CPI", "BTP"],
    configSchema: {
      required: ["tenantUrl", "tokenUrl"],
      properties: {
        tenantUrl: { type: "string", description: "CPI Tenant URL" },
        tokenUrl: { type: "string", description: "OAuth Token URL" },
        packageId: { type: "string", description: "Integration Package ID" },
      },
    },
  },
  {
    id: "sap-hana-mcp",
    name: "SAP HANA MCP Server",
    description: "MCP Server für SAP HANA Datenbank",
    serverType: "official",
    version: "1.0.0",
    capabilities: [
      { id: "hana-query", name: "SQL Query", description: "Führt SQL Queries aus", category: "read" },
      { id: "hana-procedure", name: "Procedure Call", description: "Ruft Stored Procedures auf", category: "execute" },
      { id: "hana-calc-view", name: "Calculation View", description: "Liest Calculation Views", category: "read" },
      { id: "hana-admin", name: "Admin", description: "HANA Administration", category: "admin" },
    ],
    supportedSystems: ["S4HANA", "S4HANA_CLOUD", "BTP"],
    configSchema: {
      required: ["host", "port"],
      properties: {
        host: { type: "string", description: "HANA Host" },
        port: { type: "number", description: "HANA Port", default: 443 },
        schema: { type: "string", description: "Default Schema" },
        encrypt: { type: "boolean", description: "SSL Verschlüsselung", default: true },
      },
    },
    installCommand: "npm install @sap/hana-client",
  },
  {
    id: "sap-fiori-mcp",
    name: "SAP Fiori MCP Server",
    description: "MCP Server für SAP Fiori/UI5 Entwicklung",
    serverType: "community",
    version: "1.0.0",
    capabilities: [
      { id: "fiori-generate", name: "Generate App", description: "Generiert Fiori Apps", category: "execute" },
      { id: "fiori-deploy", name: "Deploy App", description: "Deployed Fiori Apps", category: "execute" },
      { id: "fiori-test", name: "OPA Tests", description: "Führt OPA5 Tests aus", category: "execute" },
      { id: "fiori-analyze", name: "App Analyzer", description: "Analysiert Fiori Apps", category: "read" },
    ],
    supportedSystems: ["S4HANA", "S4HANA_CLOUD", "BTP"],
    configSchema: {
      required: ["projectPath"],
      properties: {
        projectPath: { type: "string", description: "Pfad zum Fiori-Projekt" },
        ui5Version: { type: "string", description: "UI5 Version", default: "latest" },
        theme: { type: "string", description: "UI5 Theme", default: "sap_horizon" },
      },
    },
    installCommand: "npm install @sap/ux-ui5-tooling",
  },
  {
    id: "sap-abap-mcp",
    name: "SAP ABAP MCP Server",
    description: "MCP Server für ABAP Entwicklung (ADT)",
    serverType: "community",
    version: "1.0.0",
    capabilities: [
      { id: "abap-read", name: "ABAP Read", description: "Liest ABAP Objekte", category: "read" },
      { id: "abap-write", name: "ABAP Write", description: "Schreibt ABAP Objekte", category: "write" },
      { id: "abap-activate", name: "ABAP Activate", description: "Aktiviert ABAP Objekte", category: "execute" },
      { id: "abap-transport", name: "Transport", description: "Verwaltet Transporte", category: "admin" },
    ],
    supportedSystems: ["S4HANA", "S4HANA_CLOUD", "ECC"],
    configSchema: {
      required: ["adtUrl"],
      properties: {
        adtUrl: { type: "string", description: "ADT Service URL" },
        package: { type: "string", description: "ABAP Package" },
        transportRequest: { type: "string", description: "Transport Request" },
      },
    },
  },
]

// === SAP AGENTEN DEFINITIONEN ===

export type SAPAgentType = 
  | "sap-consultant"
  | "sap-abap-developer"
  | "sap-fiori-developer"
  | "sap-integration-specialist"
  | "sap-basis-admin"
  | "sap-security-consultant"
  | "sap-data-analyst"
  | "sap-functional-consultant"

export interface SAPAgentConfig {
  id: SAPAgentType
  name: string
  description: string
  icon: string
  category: "development" | "consulting" | "administration" | "integration" | "analytics"
  defaultSystemTypes: SAPSystemType[]
  defaultMCPServers: string[]
  tools: Tool[]
  systemPrompt: string
  temperature: number
  maxTokens: number
  capabilities: string[]
}

// SAP-spezifische Tools
export const SAP_TOOLS: Record<string, Tool> = {
  // ABAP Tools
  abap_code_analyzer: {
    id: "abap_code_analyzer",
    name: "ABAP Code Analyzer",
    description: "Analysiert ABAP Code auf Best Practices und Performance",
    enabled: true,
  },
  abap_transport_manager: {
    id: "abap_transport_manager",
    name: "Transport Manager",
    description: "Verwaltet SAP Transporte und Transportaufträge",
    enabled: true,
  },
  abap_debugger: {
    id: "abap_debugger",
    name: "ABAP Debugger",
    description: "Remote Debugging von ABAP Code",
    enabled: true,
  },
  
  // Fiori Tools
  fiori_generator: {
    id: "fiori_generator",
    name: "Fiori Generator",
    description: "Generiert Fiori Elements und Freestyle Apps",
    enabled: true,
  },
  ui5_analyzer: {
    id: "ui5_analyzer",
    name: "UI5 Analyzer",
    description: "Analysiert UI5 Apps auf Performance und Best Practices",
    enabled: true,
  },
  
  // Integration Tools
  cpi_flow_designer: {
    id: "cpi_flow_designer",
    name: "CPI Flow Designer",
    description: "Erstellt und modifiziert Integration Flows",
    enabled: true,
  },
  idoc_analyzer: {
    id: "idoc_analyzer",
    name: "IDoc Analyzer",
    description: "Analysiert IDoc-Strukturen und Mappings",
    enabled: true,
  },
  
  // Data Tools
  hana_query_builder: {
    id: "hana_query_builder",
    name: "HANA Query Builder",
    description: "Erstellt optimierte HANA SQL Queries",
    enabled: true,
  },
  cds_modeler: {
    id: "cds_modeler",
    name: "CDS Modeler",
    description: "Modelliert CDS Views und Entitäten",
    enabled: true,
  },
  
  // Admin Tools
  system_monitor: {
    id: "system_monitor",
    name: "System Monitor",
    description: "Überwacht SAP Systemperformance",
    enabled: true,
  },
  user_admin: {
    id: "user_admin",
    name: "User Administration",
    description: "Verwaltet SAP Benutzer und Rollen",
    enabled: true,
  },
  
  // Analysis Tools
  bw_query_designer: {
    id: "bw_query_designer",
    name: "BW Query Designer",
    description: "Erstellt BW/4HANA Queries",
    enabled: true,
  },
  datasphere_modeler: {
    id: "datasphere_modeler",
    name: "Datasphere Modeler",
    description: "Modelliert SAP Datasphere Objekte",
    enabled: true,
  },
}

// SAP Agenten Konfigurationen
export const SAP_AGENTS: SAPAgentConfig[] = [
  {
    id: "sap-consultant",
    name: "SAP Consultant",
    description: "Allgemeiner SAP Berater für Anforderungsanalyse und Lösungsdesign",
    icon: "👔",
    category: "consulting",
    defaultSystemTypes: ["S4HANA", "S4HANA_CLOUD", "BTP"],
    defaultMCPServers: ["sap-odata-mcp"],
    tools: [SAP_TOOLS.system_monitor],
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: [
      "Anforderungsanalyse",
      "Lösungsdesign",
      "Best Practice Beratung",
      "Prozessoptimierung",
    ],
    systemPrompt: `Du bist ein erfahrener SAP Consultant mit umfassendem Wissen über SAP-Produkte und -Lösungen.

Deine Aufgaben:
- Analysiere Geschäftsanforderungen und übersetze sie in SAP-Lösungen
- Empfehle passende SAP-Module und -Technologien
- Erkläre SAP Best Practices und Standards
- Unterstütze bei der Prozessoptimierung
- Bewerte Customizing-Anforderungen vs. Standard

Antworte strukturiert mit:
1. Anforderungsverständnis
2. Lösungsempfehlung
3. Technische Überlegungen
4. Nächste Schritte`,
  },
  {
    id: "sap-abap-developer",
    name: "SAP ABAP Developer",
    description: "Spezialist für ABAP-Entwicklung und -Optimierung",
    icon: "💻",
    category: "development",
    defaultSystemTypes: ["S4HANA", "ECC"],
    defaultMCPServers: ["sap-rfc-mcp", "sap-abap-mcp"],
    tools: [
      SAP_TOOLS.abap_code_analyzer,
      SAP_TOOLS.abap_transport_manager,
      SAP_TOOLS.abap_debugger,
    ],
    temperature: 0.3,
    maxTokens: 4000,
    capabilities: [
      "ABAP Entwicklung",
      "ABAP OO",
      "CDS Views",
      "BADI/Enhancement",
      "Performance-Optimierung",
    ],
    systemPrompt: `Du bist ein Senior ABAP Entwickler mit Expertise in modernem ABAP und S/4HANA.

Deine Expertise:
- ABAP 7.4+ Syntax und ABAP Objects
- CDS Views und AMDP
- Clean ABAP und Best Practices
- Performance-Optimierung
- RAP (RESTful ABAP Programming Model)
- Enhancement Framework (BADIs, User Exits)

Bei Code-Anfragen:
1. Schreibe sauberen, dokumentierten Code
2. Nutze moderne ABAP Syntax
3. Berücksichtige Performance
4. Erkläre die Implementierung
5. Weise auf mögliche Probleme hin

Formatiere ABAP Code immer mit korrekter Einrückung.`,
  },
  {
    id: "sap-fiori-developer",
    name: "SAP Fiori Developer",
    description: "Experte für Fiori/UI5 Entwicklung",
    icon: "🎨",
    category: "development",
    defaultSystemTypes: ["S4HANA", "S4HANA_CLOUD", "BTP"],
    defaultMCPServers: ["sap-fiori-mcp", "sap-odata-mcp"],
    tools: [
      SAP_TOOLS.fiori_generator,
      SAP_TOOLS.ui5_analyzer,
    ],
    temperature: 0.4,
    maxTokens: 4000,
    capabilities: [
      "Fiori Elements",
      "SAPUI5 Freestyle",
      "Fiori Launchpad",
      "OData Integration",
      "Responsive Design",
    ],
    systemPrompt: `Du bist ein erfahrener SAP Fiori/UI5 Entwickler.

Deine Expertise:
- Fiori Elements (List Report, Object Page, Overview Page)
- SAPUI5 Freestyle Entwicklung
- OData Service Integration
- Fiori Launchpad Konfiguration
- SAP Build Apps
- UI5 Web Components

Bei Entwicklungsanfragen:
1. Wähle den passenden Ansatz (Elements vs. Freestyle)
2. Generiere vollständigen, lauffähigen Code
3. Berücksichtige Responsive Design
4. Implementiere Best Practices
5. Dokumentiere Annotations für Fiori Elements

Nutze aktuelle UI5 Patterns und Syntax.`,
  },
  {
    id: "sap-integration-specialist",
    name: "SAP Integration Specialist",
    description: "Experte für SAP Integrationsszenarien",
    icon: "🔗",
    category: "integration",
    defaultSystemTypes: ["CPI", "BTP", "S4HANA"],
    defaultMCPServers: ["sap-cpi-mcp", "sap-odata-mcp"],
    tools: [
      SAP_TOOLS.cpi_flow_designer,
      SAP_TOOLS.idoc_analyzer,
    ],
    temperature: 0.4,
    maxTokens: 4000,
    capabilities: [
      "SAP CPI/Integration Suite",
      "API Management",
      "IDoc/RFC Integration",
      "Event Mesh",
      "B2B Integration",
    ],
    systemPrompt: `Du bist ein SAP Integration Spezialist mit Fokus auf SAP Integration Suite.

Deine Expertise:
- SAP Cloud Platform Integration (CPI)
- SAP API Management
- IDoc und RFC Schnittstellen
- Event-Driven Architecture
- B2B Integration (EDI, AS2)
- SAP Event Mesh

Bei Integrationsanfragen:
1. Analysiere die Integrationsanforderung
2. Empfehle passende Integrationsmuster
3. Erstelle Integration Flow Designs
4. Berücksichtige Error Handling
5. Implementiere Monitoring und Logging

Liefere konkrete Lösungsdesigns und Konfigurationen.`,
  },
  {
    id: "sap-basis-admin",
    name: "SAP Basis Administrator",
    description: "Experte für SAP Systemadministration",
    icon: "🔧",
    category: "administration",
    defaultSystemTypes: ["S4HANA", "ECC", "BTP"],
    defaultMCPServers: ["sap-rfc-mcp", "sap-btp-mcp"],
    tools: [
      SAP_TOOLS.system_monitor,
      SAP_TOOLS.user_admin,
    ],
    temperature: 0.3,
    maxTokens: 3000,
    capabilities: [
      "System Administration",
      "Performance Tuning",
      "Transport Management",
      "User Management",
      "System Monitoring",
    ],
    systemPrompt: `Du bist ein erfahrener SAP Basis Administrator.

Deine Expertise:
- SAP System Administration
- Performance Monitoring und Tuning
- Transport Management System (TMS)
- Benutzer- und Berechtigungsverwaltung
- System-Upgrades und Patches
- HANA Administration
- Cloud ALM

Bei Admin-Anfragen:
1. Analysiere das Problem oder die Anforderung
2. Gib schrittweise Anleitungen
3. Weise auf Risiken und Vorsichtsmaßnahmen hin
4. Empfehle Monitoring-Maßnahmen
5. Dokumentiere durchgeführte Änderungen`,
  },
  {
    id: "sap-security-consultant",
    name: "SAP Security Consultant",
    description: "Experte für SAP Sicherheit und Berechtigungen",
    icon: "🔒",
    category: "administration",
    defaultSystemTypes: ["S4HANA", "ECC", "BTP"],
    defaultMCPServers: ["sap-rfc-mcp"],
    tools: [
      SAP_TOOLS.user_admin,
    ],
    temperature: 0.3,
    maxTokens: 3000,
    capabilities: [
      "Berechtigungskonzepte",
      "Rollendesign",
      "SoD-Analyse",
      "Security Audit",
      "Identity Management",
    ],
    systemPrompt: `Du bist ein SAP Security Consultant mit Fokus auf Berechtigungen und Compliance.

Deine Expertise:
- SAP Berechtigungskonzepte
- Rollendesign und -optimierung
- Segregation of Duties (SoD)
- SAP GRC Access Control
- Identity and Access Management
- Security Audit und Compliance

Bei Security-Anfragen:
1. Analysiere die Sicherheitsanforderung
2. Empfehle Best Practice Lösungen
3. Berücksichtige Compliance-Anforderungen
4. Erstelle Berechtigungskonzepte
5. Identifiziere potenzielle Risiken

Beachte immer das Prinzip der minimalen Berechtigung.`,
  },
  {
    id: "sap-data-analyst",
    name: "SAP Data Analyst",
    description: "Experte für SAP Analytics und Reporting",
    icon: "📊",
    category: "analytics",
    defaultSystemTypes: ["S4HANA", "BTP"],
    defaultMCPServers: ["sap-hana-mcp", "sap-odata-mcp"],
    tools: [
      SAP_TOOLS.hana_query_builder,
      SAP_TOOLS.cds_modeler,
      SAP_TOOLS.bw_query_designer,
      SAP_TOOLS.datasphere_modeler,
    ],
    temperature: 0.4,
    maxTokens: 4000,
    capabilities: [
      "SAP Analytics Cloud",
      "HANA Modellierung",
      "CDS Views",
      "Embedded Analytics",
      "SAP Datasphere",
    ],
    systemPrompt: `Du bist ein SAP Data Analyst und Analytics Experte.

Deine Expertise:
- SAP Analytics Cloud (SAC)
- HANA Modellierung und Calculation Views
- Embedded Analytics mit CDS Views
- SAP Datasphere
- BW/4HANA
- SAP S/4HANA Analytics

Bei Analytics-Anfragen:
1. Verstehe die Reportanforderung
2. Empfehle passende Analytics-Lösung
3. Erstelle optimierte Datenmodelle
4. Berücksichtige Performance
5. Implementiere Best Practices für Visualisierung

Liefere konkrete SQL, CDS oder Modellierungsvorschläge.`,
  },
  {
    id: "sap-functional-consultant",
    name: "SAP Functional Consultant",
    description: "Experte für SAP Modulkonfiguration",
    icon: "⚙️",
    category: "consulting",
    defaultSystemTypes: ["S4HANA", "S4HANA_CLOUD"],
    defaultMCPServers: ["sap-odata-mcp"],
    tools: [SAP_TOOLS.system_monitor],
    temperature: 0.5,
    maxTokens: 4000,
    capabilities: [
      "FI/CO Konfiguration",
      "MM/SD Prozesse",
      "PP/PM Module",
      "Customizing",
      "Prozessberatung",
    ],
    systemPrompt: `Du bist ein erfahrener SAP Functional Consultant.

Deine Expertise:
- SAP S/4HANA Module (FI, CO, MM, SD, PP, PM, etc.)
- Customizing und Konfiguration
- Geschäftsprozesse und Best Practices
- SAP Standard vs. Custom Development
- Migration und Transformation

Bei Funktionalen Anfragen:
1. Analysiere die Geschäftsanforderung
2. Erkläre relevante SAP Standardprozesse
3. Empfehle Customizing-Einstellungen
4. Zeige Transaktionscodes und Menüpfade
5. Weise auf Abhängigkeiten hin

Gib konkrete Customizing-Anleitungen mit IMG-Pfaden.`,
  },
]

// === SAP SYSTEM CONNECTION MANAGER ===

export class SAPSystemConnectionManager {
  private systems: Map<string, SAPSystemConfig> = new Map()
  private activeConnections: Map<string, boolean> = new Map()
  
  // System registrieren
  registerSystem(config: SAPSystemConfig): void {
    this.systems.set(config.id, config)
  }
  
  // System abrufen
  getSystem(id: string): SAPSystemConfig | undefined {
    return this.systems.get(id)
  }
  
  // Alle Systeme
  getAllSystems(): SAPSystemConfig[] {
    return Array.from(this.systems.values())
  }
  
  // Systeme nach Typ filtern
  getSystemsByType(type: SAPSystemType): SAPSystemConfig[] {
    return this.getAllSystems().filter(s => s.systemType === type)
  }
  
  // Verbindung testen
  async testConnection(systemId: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const system = this.systems.get(systemId)
    if (!system) {
      return { success: false, message: "System nicht gefunden" }
    }
    
    const startTime = Date.now()
    
    try {
      // Simulierte Verbindungsprüfung
      // In Produktion: Echte Verbindung zum SAP System
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const latency = Date.now() - startTime
      this.activeConnections.set(systemId, true)
      
      return {
        success: true,
        message: `Verbindung zu ${system.name} erfolgreich`,
        latency,
      }
    } catch (error) {
      this.activeConnections.set(systemId, false)
      return {
        success: false,
        message: `Verbindungsfehler: ${error}`,
      }
    }
  }
  
  // Verbindungsstatus
  isConnected(systemId: string): boolean {
    return this.activeConnections.get(systemId) || false
  }
  
  // System aktualisieren
  updateSystem(id: string, updates: Partial<SAPSystemConfig>): boolean {
    const system = this.systems.get(id)
    if (!system) return false
    
    this.systems.set(id, {
      ...system,
      ...updates,
      updatedAt: new Date(),
    })
    return true
  }
  
  // System löschen
  deleteSystem(id: string): boolean {
    this.activeConnections.delete(id)
    return this.systems.delete(id)
  }
  
  // Export
  export(): SAPSystemConfig[] {
    return this.getAllSystems().map(s => ({
      ...s,
      credentials: { ...s.credentials, password: "***", clientSecret: "***", privateKey: "***" },
    }))
  }
}

// === SAP AGENT MANAGER ===

export class SAPAgentManager {
  private customConfigs: Map<string, Partial<SAPAgentConfig>> = new Map()
  private systemAssignments: Map<string, string[]> = new Map() // agentId -> systemIds
  private mcpAssignments: Map<string, string[]> = new Map() // agentId -> mcpServerIds
  
  // Alle SAP Agenten abrufen
  getAgents(): SAPAgentConfig[] {
    return SAP_AGENTS.map(agent => ({
      ...agent,
      ...this.customConfigs.get(agent.id),
    }))
  }
  
  // Agent nach ID
  getAgent(id: SAPAgentType): SAPAgentConfig | undefined {
    const base = SAP_AGENTS.find(a => a.id === id)
    if (!base) return undefined
    
    return {
      ...base,
      ...this.customConfigs.get(id),
    }
  }
  
  // Agent konfigurieren
  configureAgent(id: SAPAgentType, config: Partial<SAPAgentConfig>): void {
    this.customConfigs.set(id, {
      ...this.customConfigs.get(id),
      ...config,
    })
  }
  
  // Systeme zuweisen
  assignSystems(agentId: SAPAgentType, systemIds: string[]): void {
    this.systemAssignments.set(agentId, systemIds)
  }
  
  // MCP Server zuweisen
  assignMCPServers(agentId: SAPAgentType, serverIds: string[]): void {
    this.mcpAssignments.set(agentId, serverIds)
  }
  
  // Zugewiesene Systeme abrufen
  getAssignedSystems(agentId: SAPAgentType): string[] {
    return this.systemAssignments.get(agentId) || []
  }
  
  // Zugewiesene MCP Server abrufen
  getAssignedMCPServers(agentId: SAPAgentType): string[] {
    const agent = SAP_AGENTS.find(a => a.id === agentId)
    return this.mcpAssignments.get(agentId) || agent?.defaultMCPServers || []
  }
  
  // Agenten nach Kategorie filtern
  getAgentsByCategory(category: SAPAgentConfig["category"]): SAPAgentConfig[] {
    return this.getAgents().filter(a => a.category === category)
  }
  
  // Agent-Prompt mit System-Kontext generieren
  generatePromptWithContext(
    agentId: SAPAgentType,
    systems: SAPSystemConfig[],
    userPrompt: string
  ): string {
    const agent = this.getAgent(agentId)
    if (!agent) return userPrompt
    
    const systemContext = systems.length > 0
      ? `\n\nVerfügbare SAP Systeme:\n${systems.map(s => 
          `- ${s.name} (${s.systemType}, ${s.host})`
        ).join("\n")}`
      : ""
    
    return `${agent.systemPrompt}${systemContext}\n\n---\n\nBenutzeranfrage: ${userPrompt}`
  }
  
  // Konfiguration exportieren
  export(): { customConfigs: [string, Partial<SAPAgentConfig>][]; assignments: { systems: [string, string[]][]; mcp: [string, string[]][] } } {
    return {
      customConfigs: Array.from(this.customConfigs.entries()),
      assignments: {
        systems: Array.from(this.systemAssignments.entries()),
        mcp: Array.from(this.mcpAssignments.entries()),
      },
    }
  }
  
  // Konfiguration importieren
  import(data: ReturnType<SAPAgentManager["export"]>): void {
    this.customConfigs = new Map(data.customConfigs)
    this.systemAssignments = new Map(data.assignments.systems)
    this.mcpAssignments = new Map(data.assignments.mcp)
  }
}

// === HELPER FUNKTIONEN ===

// MCP Server für System-Typ finden
export function getMCPServersForSystemType(systemType: SAPSystemType): SAPMCPServer[] {
  return SAP_MCP_SERVERS.filter(s => s.supportedSystems.includes(systemType))
}

// Passende Agenten für System-Typ finden
export function getAgentsForSystemType(systemType: SAPSystemType): SAPAgentConfig[] {
  return SAP_AGENTS.filter(a => a.defaultSystemTypes.includes(systemType))
}

// Verbindungs-URL generieren
export function generateConnectionUrl(system: SAPSystemConfig): string {
  const protocol = system.ssl ? "https" : "http"
  const port = system.port ? `:${system.port}` : ""
  return `${protocol}://${system.host}${port}`
}

// Default System-Konfiguration erstellen
export function createDefaultSystemConfig(
  name: string,
  systemType: SAPSystemType,
  host: string
): SAPSystemConfig {
  return {
    id: `sap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    systemType,
    host,
    connectionType: systemType === "BTP" || systemType === "S4HANA_CLOUD" ? "ODATA" : "RFC",
    credentials: { type: "basic" },
    ssl: true,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
