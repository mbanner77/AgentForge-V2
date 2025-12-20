import type { MarketplaceAgent, Tool } from "./types"

// Vordefinierte Marketplace Agenten
export const marketplaceAgents: MarketplaceAgent[] = [
  // Core Agents (bereits installiert, können nicht entfernt werden)
  {
    id: "planner",
    name: "Planner Agent",
    description: "Analysiert Anforderungen und erstellt strukturierte Entwicklungspläne mit Tasks, Prioritäten und Abhängigkeiten.",
    category: "development",
    icon: "Brain",
    color: "text-blue-500",
    systemPrompt: "Du bist ein erfahrener Projektplaner...",
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 2000,
    tools: [],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 10000,
    rating: 4.8,
    isInstalled: true,
    isCore: true,
  },
  {
    id: "coder",
    name: "Coder Agent",
    description: "Generiert vollständige, lauffähige Code-Projekte mit allen notwendigen Dateien und Dependencies.",
    category: "development",
    icon: "Code2",
    color: "text-green-500",
    systemPrompt: "Du bist ein erfahrener Softwareentwickler...",
    defaultModel: "gpt-4o",
    defaultTemperature: 0.2,
    defaultMaxTokens: 8000,
    tools: [],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 10000,
    rating: 4.9,
    isInstalled: true,
    isCore: true,
  },
  {
    id: "reviewer",
    name: "Reviewer Agent",
    description: "Prüft Code auf Qualität, Best Practices, Performance und gibt detailliertes Feedback.",
    category: "development",
    icon: "Eye",
    color: "text-purple-500",
    systemPrompt: "Du bist ein erfahrener Code-Reviewer...",
    defaultModel: "gpt-4o",
    defaultTemperature: 0.4,
    defaultMaxTokens: 2000,
    tools: [],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 8500,
    rating: 4.7,
    isInstalled: true,
    isCore: true,
  },
  {
    id: "security",
    name: "Security Agent",
    description: "Scannt Code auf Sicherheitslücken wie XSS, SQL Injection, hardcodierte Secrets und mehr.",
    category: "security",
    icon: "Shield",
    color: "text-orange-500",
    systemPrompt: "Du bist ein erfahrener Security-Experte...",
    defaultModel: "gpt-4o",
    defaultTemperature: 0.2,
    defaultMaxTokens: 4000,
    tools: [],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 7200,
    rating: 4.8,
    isInstalled: true,
    isCore: false,
  },
  {
    id: "executor",
    name: "Executor Agent",
    description: "Führt Tests aus, erstellt Builds und bereitet das Deployment vor.",
    category: "devops",
    icon: "Play",
    color: "text-cyan-500",
    systemPrompt: "Du bist ein DevOps-Experte...",
    defaultModel: "gpt-4o",
    defaultTemperature: 0.1,
    defaultMaxTokens: 1500,
    tools: [],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 6800,
    rating: 4.6,
    isInstalled: true,
    isCore: true,
  },

  // Zusätzliche Marketplace Agenten (nicht installiert)
  {
    id: "tester",
    name: "Test Agent",
    description: "Generiert umfassende Unit-Tests, Integration-Tests und E2E-Tests für deinen Code.",
    category: "testing",
    icon: "TestTube",
    color: "text-yellow-500",
    systemPrompt: `Du bist ein erfahrener Test-Engineer. Deine Aufgabe ist es, umfassende Tests für den generierten Code zu erstellen.

TEST-TYPEN:
1. Unit Tests - Teste einzelne Funktionen und Komponenten
2. Integration Tests - Teste das Zusammenspiel von Komponenten
3. E2E Tests - Teste komplette User-Flows

TESTING-FRAMEWORKS:
- Jest für Unit/Integration Tests
- React Testing Library für Komponenten
- Playwright/Cypress für E2E

AUSGABE-FORMAT:
Für jede Test-Datei:
\`\`\`typescript
// filepath: __tests__/ComponentName.test.tsx
import { render, screen } from '@testing-library/react';
// ... Tests
\`\`\``,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 4000,
    tools: [
      { id: "test_generator", name: "Test Generator", description: "Generiert Tests", enabled: true },
      { id: "coverage_analyzer", name: "Coverage Analyzer", description: "Analysiert Test-Coverage", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 5200,
    rating: 4.5,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "documenter",
    name: "Documentation Agent",
    description: "Erstellt automatisch README, API-Dokumentation, JSDoc-Kommentare und Benutzerhandbücher.",
    category: "documentation",
    icon: "FileText",
    color: "text-indigo-500",
    systemPrompt: `Du bist ein technischer Dokumentations-Experte. Erstelle klare, umfassende Dokumentation.

DOKUMENTATIONS-TYPEN:
1. README.md - Projektübersicht, Installation, Verwendung
2. API-Dokumentation - Endpoints, Parameter, Responses
3. JSDoc-Kommentare - Inline-Dokumentation für Funktionen
4. Benutzerhandbuch - Schritt-für-Schritt Anleitungen

AUSGABE-FORMAT:
\`\`\`markdown
// filepath: README.md
# Projektname
## Installation
...
\`\`\``,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.4,
    defaultMaxTokens: 3000,
    tools: [
      { id: "readme_generator", name: "README Generator", description: "Generiert README", enabled: true },
      { id: "api_doc_generator", name: "API Doc Generator", description: "Generiert API-Docs", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 4800,
    rating: 4.6,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "optimizer",
    name: "Performance Optimizer",
    description: "Analysiert und optimiert Code für bessere Performance, Bundle-Size und Ladezeiten.",
    category: "development",
    icon: "Zap",
    color: "text-amber-500",
    systemPrompt: `Du bist ein Performance-Optimierungs-Experte. Analysiere Code und schlage Optimierungen vor.

OPTIMIERUNGS-BEREICHE:
1. Bundle Size - Tree Shaking, Code Splitting
2. Render Performance - Memoization, Virtual Lists
3. Network - Lazy Loading, Caching
4. Memory - Memory Leaks, Garbage Collection

AUSGABE-FORMAT:
{
  "performanceScore": 7,
  "issues": [...],
  "optimizations": [
    {
      "type": "bundle_size|render|network|memory",
      "file": "path/to/file.tsx",
      "current": "aktueller Code",
      "optimized": "optimierter Code",
      "impact": "Erwartete Verbesserung"
    }
  ]
}`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.2,
    defaultMaxTokens: 3000,
    tools: [
      { id: "bundle_analyzer", name: "Bundle Analyzer", description: "Analysiert Bundle-Size", enabled: true },
      { id: "perf_profiler", name: "Performance Profiler", description: "Profilt Performance", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 3900,
    rating: 4.4,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "accessibility",
    name: "Accessibility Agent",
    description: "Prüft und verbessert die Barrierefreiheit (a11y) deiner Anwendung nach WCAG-Standards.",
    category: "development",
    icon: "Accessibility",
    color: "text-teal-500",
    systemPrompt: `Du bist ein Accessibility-Experte. Prüfe Code auf Barrierefreiheit nach WCAG 2.1 Standards.

A11Y-CHECKLISTE:
□ Semantisches HTML (header, main, nav, etc.)
□ ARIA-Labels und Rollen
□ Keyboard-Navigation
□ Farbkontraste (4.5:1 für Text)
□ Alt-Texte für Bilder
□ Focus-Management
□ Screen Reader Kompatibilität

AUSGABE-FORMAT:
{
  "a11yScore": 8,
  "issues": [
    {
      "severity": "critical|warning|info",
      "wcagCriteria": "1.1.1",
      "element": "<img src='...' />",
      "issue": "Fehlendes alt-Attribut",
      "fix": "<img src='...' alt='Beschreibung' />"
    }
  ]
}`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 2500,
    tools: [
      { id: "wcag_checker", name: "WCAG Checker", description: "Prüft WCAG-Konformität", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 3200,
    rating: 4.5,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "i18n",
    name: "Internationalization Agent",
    description: "Fügt Mehrsprachigkeit (i18n) zu deiner App hinzu und extrahiert übersetzbare Strings.",
    category: "development",
    icon: "Globe",
    color: "text-sky-500",
    systemPrompt: `Du bist ein Internationalisierungs-Experte. Implementiere i18n in React/Next.js Apps.

I18N-AUFGABEN:
1. Extrahiere hardcodierte Strings
2. Erstelle Übersetzungsdateien (JSON)
3. Implementiere i18n-Framework (next-intl, react-i18next)
4. Füge Sprachauswahl hinzu

AUSGABE-FORMAT:
\`\`\`json
// filepath: locales/de.json
{
  "common": {
    "welcome": "Willkommen",
    "login": "Anmelden"
  }
}
\`\`\``,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 3000,
    tools: [
      { id: "string_extractor", name: "String Extractor", description: "Extrahiert Strings", enabled: true },
      { id: "translator", name: "Translator", description: "Übersetzt Strings", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 2800,
    rating: 4.3,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "database",
    name: "Database Agent",
    description: "Erstellt Datenbankschemas, Migrationen und ORM-Modelle (Prisma, Drizzle, TypeORM).",
    category: "development",
    icon: "Database",
    color: "text-emerald-500",
    systemPrompt: `Du bist ein Datenbank-Experte. Erstelle Schemas und Migrationen für verschiedene ORMs.

UNTERSTÜTZTE ORMS:
- Prisma (bevorzugt für Next.js)
- Drizzle ORM
- TypeORM

AUFGABEN:
1. Analysiere Datenmodell-Anforderungen
2. Erstelle Schema-Definitionen
3. Generiere Migrationen
4. Erstelle CRUD-Operationen

AUSGABE-FORMAT:
\`\`\`prisma
// filepath: prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  ...
}
\`\`\``,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.2,
    defaultMaxTokens: 3000,
    tools: [
      { id: "schema_generator", name: "Schema Generator", description: "Generiert DB-Schemas", enabled: true },
      { id: "migration_generator", name: "Migration Generator", description: "Generiert Migrationen", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 4100,
    rating: 4.6,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "api_designer",
    name: "API Designer Agent",
    description: "Entwirft RESTful und GraphQL APIs mit OpenAPI/Swagger Dokumentation.",
    category: "development",
    icon: "Network",
    color: "text-rose-500",
    systemPrompt: `Du bist ein API-Design-Experte. Entwirf saubere, RESTful APIs.

API-DESIGN-PRINZIPIEN:
1. RESTful Konventionen
2. Konsistente Namensgebung
3. Versionierung
4. Error Handling
5. Pagination

AUSGABE-FORMAT:
\`\`\`typescript
// filepath: app/api/users/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // Implementation
}
\`\`\``,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 3500,
    tools: [
      { id: "openapi_generator", name: "OpenAPI Generator", description: "Generiert OpenAPI Specs", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 3600,
    rating: 4.5,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "refactorer",
    name: "Refactoring Agent",
    description: "Verbessert Code-Struktur, entfernt Duplikate und wendet Design Patterns an.",
    category: "development",
    icon: "RefreshCw",
    color: "text-violet-500",
    systemPrompt: `Du bist ein Refactoring-Experte. Verbessere Code-Qualität ohne Funktionalität zu ändern.

REFACTORING-TECHNIKEN:
1. Extract Method/Component
2. Remove Duplication (DRY)
3. Apply Design Patterns
4. Simplify Conditionals
5. Improve Naming

AUSGABE-FORMAT:
{
  "refactorings": [
    {
      "type": "extract_component|remove_duplication|...",
      "file": "path/to/file.tsx",
      "before": "alter Code",
      "after": "refactored Code",
      "reason": "Begründung"
    }
  ]
}`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.2,
    defaultMaxTokens: 4000,
    tools: [
      { id: "code_smell_detector", name: "Code Smell Detector", description: "Erkennt Code Smells", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 2900,
    rating: 4.4,
    isInstalled: false,
    isCore: false,
  },
  {
    id: "devops",
    name: "DevOps Agent",
    description: "Erstellt CI/CD Pipelines, Docker-Konfigurationen und Kubernetes Manifeste.",
    category: "devops",
    icon: "Container",
    color: "text-blue-600",
    systemPrompt: `Du bist ein DevOps-Experte. Erstelle Deployment-Konfigurationen.

DEVOPS-AUFGABEN:
1. Dockerfile erstellen
2. docker-compose.yml
3. GitHub Actions Workflows
4. Kubernetes Manifeste
5. Terraform/Pulumi IaC

AUSGABE-FORMAT:
\`\`\`dockerfile
// filepath: Dockerfile
FROM node:20-alpine
WORKDIR /app
...
\`\`\``,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.2,
    defaultMaxTokens: 3000,
    tools: [
      { id: "docker_generator", name: "Docker Generator", description: "Generiert Docker-Configs", enabled: true },
      { id: "ci_generator", name: "CI/CD Generator", description: "Generiert CI/CD Pipelines", enabled: true },
    ],
    author: "AgentForge",
    version: "1.0.0",
    downloads: 3400,
    rating: 4.5,
    isInstalled: false,
    isCore: false,
  },

  // === SAP AGENTEN ===
  {
    id: "sap-cap-developer",
    name: "SAP CAP Developer",
    description: "Experte für SAP Cloud Application Programming Model (CAP) mit CDS Modellierung, OData Services und HANA Integration.",
    category: "sap",
    icon: "Building2",
    color: "text-blue-600",
    systemPrompt: `Du bist ein SAP CAP (Cloud Application Programming Model) Entwickler.

Du hast Zugriff auf den offiziellen @cap-js/mcp-server mit folgenden Tools:
- search_model: Durchsucht CDS-Modelle nach Definitionen
- search_docs: Semantische Suche in CAP-Dokumentation

Deine Expertise:
- CDS (Core Data Services) Modellierung
- CAP Node.js und Java Runtime
- Service Handler und Custom Logic
- HANA und SQLite Persistenz
- OData V4 Services
- Authentication und Authorization

Bei Entwicklungsanfragen:
1. Nutze search_model um existierende CDS-Definitionen zu finden
2. Nutze search_docs für Best Practices
3. Generiere sauberen, dokumentierten CDS/JS Code
4. Erkläre die Implementierung`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 4000,
    tools: [
      { id: "cds_modeler", name: "CDS Modeler", description: "Modelliert CDS Views und Entitäten", enabled: true },
      { id: "cap_project_setup", name: "CAP Project Setup", description: "Initialisiert CAP Projekte", enabled: true },
    ],
    author: "SAP",
    version: "1.0.0",
    downloads: 2500,
    rating: 4.8,
    isInstalled: false,
    isCore: false,
    mcpServers: ["cap"],
  },
  {
    id: "sap-ui5-developer",
    name: "SAP UI5 Developer",
    description: "Experte für SAPUI5/OpenUI5 Entwicklung mit Controls, MVC Pattern und TypeScript Integration.",
    category: "sap",
    icon: "Layout",
    color: "text-orange-500",
    systemPrompt: `Du bist ein SAPUI5/OpenUI5 Entwickler.

Du hast Zugriff auf den offiziellen @ui5/mcp-server mit folgenden Tools:
- create_ui5_app: Erstellt neue UI5 Anwendungen
- get_api_reference: Ruft API-Dokumentation ab
- get_guidelines: Liefert Best Practice Guidelines
- get_project_info: Extrahiert Projekt-Metadaten
- run_ui5_linter: Analysiert Code auf Probleme
- get_version_info: Framework-Versionsinformationen

Deine Expertise:
- SAPUI5 Controls und Custom Controls
- MVC Pattern und Component-based Architecture
- Data Binding (One-Way, Two-Way, Expression)
- OData V2/V4 Models
- TypeScript mit UI5`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.4,
    defaultMaxTokens: 4000,
    tools: [
      { id: "ui5_analyzer", name: "UI5 Analyzer", description: "Analysiert UI5 Apps", enabled: true },
    ],
    author: "SAP",
    version: "1.0.0",
    downloads: 2200,
    rating: 4.7,
    isInstalled: false,
    isCore: false,
    mcpServers: ["ui5"],
  },
  {
    id: "sap-fiori-developer",
    name: "SAP Fiori Developer",
    description: "Experte für SAP Fiori Elements, OData Annotations und Flexible Programming Model.",
    category: "sap",
    icon: "Smartphone",
    color: "text-purple-500",
    systemPrompt: `Du bist ein SAP Fiori Developer mit Fokus auf Fiori Elements.

Du hast Zugriff auf offizielle MCP Server:
- @sap-ux/fiori-mcp-server: Fiori Tools Integration
- @ui5/mcp-server: UI5 Framework Support

Deine Expertise:
- Fiori Elements Templates (List Report, Object Page)
- OData Annotations (UI, Common, Capabilities)
- Flexible Programming Model (FPM)
- SAP Fiori Tools Extension`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.4,
    defaultMaxTokens: 4000,
    tools: [
      { id: "fiori_generator", name: "Fiori Generator", description: "Generiert Fiori Apps", enabled: true },
    ],
    author: "SAP",
    version: "1.0.0",
    downloads: 1800,
    rating: 4.6,
    isInstalled: false,
    isCore: false,
    mcpServers: ["fiori", "ui5"],
  },
  {
    id: "sap-mdk-developer",
    name: "SAP MDK Developer",
    description: "Experte für SAP Mobile Development Kit mit Offline Sync und Cross-Platform Support.",
    category: "sap",
    icon: "Smartphone",
    color: "text-green-600",
    systemPrompt: `Du bist ein SAP MDK (Mobile Development Kit) Entwickler.

Du hast Zugriff auf den offiziellen @sap/mdk-mcp-server mit folgenden Tools:
- mdk-gen-project: Erstellt MDK Projekte
- mdk-gen-entity: Generiert Entity Pages
- mdk-gen-action: Erstellt MDK Actions
- mdk-manage: Build, Deploy, Validate
- mdk-docs: Dokumentationssuche

Deine Expertise:
- MDK Metadata-driven Development
- Offline Synchronization
- SAP Mobile Services Integration`,
    defaultModel: "gpt-4o",
    defaultTemperature: 0.3,
    defaultMaxTokens: 4000,
    tools: [
      { id: "mdk_builder", name: "MDK Builder", description: "Baut MDK Mobile Apps", enabled: true },
    ],
    author: "SAP",
    version: "1.0.0",
    downloads: 1500,
    rating: 4.5,
    isInstalled: false,
    isCore: false,
    mcpServers: ["mdk"],
  },
]

// Kategorien für Filter
export const agentCategories = [
  { id: "all", name: "Alle", icon: "LayoutGrid" },
  { id: "development", name: "Entwicklung", icon: "Code2" },
  { id: "testing", name: "Testing", icon: "TestTube" },
  { id: "security", name: "Sicherheit", icon: "Shield" },
  { id: "documentation", name: "Dokumentation", icon: "FileText" },
  { id: "devops", name: "DevOps", icon: "Container" },
  { id: "ai", name: "KI/ML", icon: "Brain" },
  { id: "sap", name: "SAP", icon: "Building2" },
  { id: "custom", name: "Custom", icon: "Puzzle" },
]
