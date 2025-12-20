// SAP Workflow Templates für den Workflow Designer

export interface SAPWorkflowNode {
  id: string
  type: "start" | "end" | "agent" | "condition" | "human" | "parallel" | "merge" | "loop"
  position: { x: number; y: number }
  data: {
    label: string
    description?: string
    agentType?: string
    config?: Record<string, unknown>
  }
}

export interface SAPWorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  condition?: string
}

export interface SAPWorkflowGraph {
  id: string
  name: string
  description?: string
  nodes: SAPWorkflowNode[]
  edges: SAPWorkflowEdge[]
}

export interface SAPWorkflowTemplate {
  id: string
  name: string
  description: string
  category: "sap"
  icon: string
  workflow: SAPWorkflowGraph
}

// CAP Full-Stack Development Workflow
export const CAP_FULLSTACK_WORKFLOW: SAPWorkflowTemplate = {
  id: "sap-cap-fullstack",
  name: "CAP Full-Stack Entwicklung",
  description: "Kompletter Workflow für SAP CAP Anwendungen mit CDS Modellierung, Services und UI",
  category: "sap",
  icon: "🏗️",
  workflow: {
    id: "sap-cap-fullstack",
    name: "CAP Full-Stack Entwicklung",
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 100, y: 200 },
        data: { label: "Start" },
      },
      {
        id: "requirements",
        type: "agent",
        position: { x: 250, y: 200 },
        data: {
          label: "Anforderungsanalyse",
          agentType: "planner",
          config: {
            systemPrompt: "Analysiere die Anforderungen für die SAP CAP Anwendung. Identifiziere Entitäten, Services und Geschäftslogik.",
          },
        },
      },
      {
        id: "cds-model",
        type: "agent",
        position: { x: 400, y: 200 },
        data: {
          label: "CDS Datenmodell",
          agentType: "sap-cap-developer",
          config: {
            systemPrompt: "Erstelle das CDS Datenmodell basierend auf den Anforderungen. Nutze den CAP MCP Server für Best Practices.",
            mcpTools: ["search_docs", "search_model"],
          },
        },
      },
      {
        id: "service-def",
        type: "agent",
        position: { x: 550, y: 200 },
        data: {
          label: "Service Definition",
          agentType: "sap-cap-developer",
          config: {
            systemPrompt: "Definiere die CDS Services mit Projektionen, Actions und Functions.",
            mcpTools: ["search_docs"],
          },
        },
      },
      {
        id: "service-impl",
        type: "agent",
        position: { x: 700, y: 200 },
        data: {
          label: "Service Handler",
          agentType: "coder",
          config: {
            systemPrompt: "Implementiere die Service Handler in JavaScript/TypeScript mit der CAP Laufzeit.",
          },
        },
      },
      {
        id: "ui-creation",
        type: "agent",
        position: { x: 850, y: 200 },
        data: {
          label: "Fiori UI",
          agentType: "sap-fiori-developer",
          config: {
            systemPrompt: "Erstelle eine Fiori Elements UI für die CAP Services.",
            mcpTools: ["search_fiori_docs", "generate_fiori_app"],
          },
        },
      },
      {
        id: "review",
        type: "agent",
        position: { x: 1000, y: 200 },
        data: {
          label: "Code Review",
          agentType: "reviewer",
          config: {
            systemPrompt: "Überprüfe den gesamten Code auf CAP Best Practices, Sicherheit und Performance.",
          },
        },
      },
      {
        id: "end",
        type: "end",
        position: { x: 1150, y: 200 },
        data: { label: "Ende" },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "requirements" },
      { id: "e2", source: "requirements", target: "cds-model" },
      { id: "e3", source: "cds-model", target: "service-def" },
      { id: "e4", source: "service-def", target: "service-impl" },
      { id: "e5", source: "service-impl", target: "ui-creation" },
      { id: "e6", source: "ui-creation", target: "review" },
      { id: "e7", source: "review", target: "end" },
    ],
  },
}

// UI5 Application Workflow
export const UI5_APP_WORKFLOW: SAPWorkflowTemplate = {
  id: "sap-ui5-app",
  name: "UI5 Anwendung",
  description: "Workflow für SAPUI5 Freestyle Anwendungen mit MVC Pattern",
  category: "sap",
  icon: "🎨",
  workflow: {
    id: "sap-ui5-app",
    name: "UI5 Anwendung",
    nodes: [
      { id: "start", type: "start", position: { x: 100, y: 200 }, data: { label: "Start" } },
      { id: "design", type: "agent", position: { x: 250, y: 200 }, data: { label: "UI Design", agentType: "planner", config: { systemPrompt: "Plane die UI5 Anwendungsstruktur, Views und Controller." } } },
      { id: "ui5-scaffold", type: "agent", position: { x: 400, y: 200 }, data: { label: "Projekt Setup", agentType: "sap-ui5-developer", config: { systemPrompt: "Erstelle die UI5 Projektstruktur mit manifest.json und Component.js.", mcpTools: ["create_ui5_app", "get_guidelines"] } } },
      { id: "views", type: "agent", position: { x: 550, y: 200 }, data: { label: "XML Views", agentType: "sap-ui5-developer", config: { systemPrompt: "Erstelle die XML Views mit UI5 Controls.", mcpTools: ["get_api_reference"] } } },
      { id: "controllers", type: "agent", position: { x: 700, y: 200 }, data: { label: "Controller", agentType: "coder", config: { systemPrompt: "Implementiere die JavaScript Controller mit Event Handling und Data Binding." } } },
      { id: "lint", type: "agent", position: { x: 850, y: 200 }, data: { label: "UI5 Linting", agentType: "sap-ui5-developer", config: { systemPrompt: "Führe UI5 Linting durch und behebe Probleme.", mcpTools: ["run_ui5_linter"] } } },
      { id: "end", type: "end", position: { x: 1000, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "design" },
      { id: "e2", source: "design", target: "ui5-scaffold" },
      { id: "e3", source: "ui5-scaffold", target: "views" },
      { id: "e4", source: "views", target: "controllers" },
      { id: "e5", source: "controllers", target: "lint" },
      { id: "e6", source: "lint", target: "end" },
    ],
  },
}

// Fiori Elements Workflow
export const FIORI_ELEMENTS_WORKFLOW: SAPWorkflowTemplate = {
  id: "sap-fiori-elements",
  name: "Fiori Elements App",
  description: "Workflow für SAP Fiori Elements Anwendungen mit OData und Annotations",
  category: "sap",
  icon: "📱",
  workflow: {
    id: "sap-fiori-elements",
    name: "Fiori Elements App",
    nodes: [
      { id: "start", type: "start", position: { x: 100, y: 200 }, data: { label: "Start" } },
      { id: "odata-analysis", type: "agent", position: { x: 250, y: 200 }, data: { label: "OData Analyse", agentType: "planner", config: { systemPrompt: "Analysiere den OData Service und identifiziere die benötigten Entity Sets." } } },
      { id: "fiori-gen", type: "agent", position: { x: 400, y: 200 }, data: { label: "App Generation", agentType: "sap-fiori-developer", config: { systemPrompt: "Generiere die Fiori Elements Anwendung mit dem passenden Template.", mcpTools: ["generate_fiori_app", "search_fiori_docs"] } } },
      { id: "annotations", type: "agent", position: { x: 550, y: 200 }, data: { label: "UI Annotations", agentType: "sap-fiori-developer", config: { systemPrompt: "Erstelle UI Annotations für LineItem, HeaderInfo, Facets etc.", mcpTools: ["add_annotation"] } } },
      { id: "extensions", type: "agent", position: { x: 700, y: 200 }, data: { label: "Custom Extensions", agentType: "coder", config: { systemPrompt: "Implementiere Custom Extensions für spezielle Anforderungen." } } },
      { id: "end", type: "end", position: { x: 850, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "odata-analysis" },
      { id: "e2", source: "odata-analysis", target: "fiori-gen" },
      { id: "e3", source: "fiori-gen", target: "annotations" },
      { id: "e4", source: "annotations", target: "extensions" },
      { id: "e5", source: "extensions", target: "end" },
    ],
  },
}

// MDK Mobile App Workflow
export const MDK_MOBILE_WORKFLOW: SAPWorkflowTemplate = {
  id: "sap-mdk-mobile",
  name: "MDK Mobile App",
  description: "Workflow für SAP Mobile Development Kit Anwendungen",
  category: "sap",
  icon: "📲",
  workflow: {
    id: "sap-mdk-mobile",
    name: "MDK Mobile App",
    nodes: [
      { id: "start", type: "start", position: { x: 100, y: 200 }, data: { label: "Start" } },
      { id: "mobile-design", type: "agent", position: { x: 250, y: 200 }, data: { label: "Mobile Design", agentType: "planner", config: { systemPrompt: "Plane die mobile App Architektur mit Offline-Anforderungen." } } },
      { id: "mdk-project", type: "agent", position: { x: 400, y: 200 }, data: { label: "MDK Projekt", agentType: "sap-mdk-developer", config: { systemPrompt: "Erstelle das MDK Projekt mit der passenden Konfiguration.", mcpTools: ["mdk-gen-project"] } } },
      { id: "entities", type: "agent", position: { x: 550, y: 200 }, data: { label: "Entity Pages", agentType: "sap-mdk-developer", config: { systemPrompt: "Generiere Entity Pages für die OData Entity Sets.", mcpTools: ["mdk-gen-entity", "mdk-docs"] } } },
      { id: "actions", type: "agent", position: { x: 700, y: 200 }, data: { label: "MDK Actions", agentType: "sap-mdk-developer", config: { systemPrompt: "Erstelle MDK Actions für Navigation, CRUD und Custom Logic.", mcpTools: ["mdk-gen-action"] } } },
      { id: "validation", type: "agent", position: { x: 850, y: 200 }, data: { label: "Validierung", agentType: "sap-mdk-developer", config: { systemPrompt: "Validiere das MDK Projekt und behebe Probleme.", mcpTools: ["mdk-manage"] } } },
      { id: "end", type: "end", position: { x: 1000, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "mobile-design" },
      { id: "e2", source: "mobile-design", target: "mdk-project" },
      { id: "e3", source: "mdk-project", target: "entities" },
      { id: "e4", source: "entities", target: "actions" },
      { id: "e5", source: "actions", target: "validation" },
      { id: "e6", source: "validation", target: "end" },
    ],
  },
}

// All SAP Workflow Templates
export const SAP_WORKFLOW_TEMPLATES: SAPWorkflowTemplate[] = [
  CAP_FULLSTACK_WORKFLOW,
  UI5_APP_WORKFLOW,
  FIORI_ELEMENTS_WORKFLOW,
  MDK_MOBILE_WORKFLOW,
]

// Get template by ID
export function getSAPWorkflowTemplate(id: string): SAPWorkflowTemplate | undefined {
  return SAP_WORKFLOW_TEMPLATES.find(t => t.id === id)
}

// Get all SAP workflow templates
export function getAllSAPWorkflowTemplates(): SAPWorkflowTemplate[] {
  return SAP_WORKFLOW_TEMPLATES
}
