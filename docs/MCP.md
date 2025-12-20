# MCP Integration (Model Context Protocol)

AgentForge unterstützt das Model Context Protocol (MCP) für erweiterte Tool-Integration.

## 📖 Was ist MCP?

MCP (Model Context Protocol) ist ein offenes Protokoll, das es LLMs ermöglicht, mit externen Tools und Services zu kommunizieren. AgentForge nutzt MCP, um Agenten mit spezialisierten Fähigkeiten auszustatten.

## 🔧 Verfügbare MCP Server

### Offizielle SAP MCP Server

| Server | Package | Tools | Beschreibung |
|--------|---------|-------|--------------|
| **CAP** | `@cap-js/mcp-server` | `search_model`, `search_docs` | SAP Cloud Application Programming Model |
| **UI5** | `@ui5/mcp-server` | `create_ui5_app`, `get_api_reference`, `run_ui5_linter` | SAPUI5/OpenUI5 Development |
| **Fiori** | `@sap-ux/fiori-mcp-server` | `search_fiori_docs`, `generate_fiori_app`, `add_annotation` | SAP Fiori Elements |
| **MDK** | `@sap/mdk-mcp-server` | `mdk-gen-project`, `mdk-gen-entity`, `mdk-manage` | Mobile Development Kit |

### Generische MCP Server

| Server | Package | Kategorie |
|--------|---------|-----------|
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Dateisystem |
| **GitHub** | `@modelcontextprotocol/server-github` | Version Control |
| **PostgreSQL** | `@modelcontextprotocol/server-postgres` | Datenbank |
| **Brave Search** | `@modelcontextprotocol/server-brave-search` | Web-Suche |
| **Puppeteer** | `@modelcontextprotocol/server-puppeteer` | Browser Automation |

## 📦 Installation

### Alle SAP MCP Server

```bash
npm install -g @cap-js/mcp-server @ui5/mcp-server @sap/mdk-mcp-server @sap-ux/fiori-mcp-server
```

### Einzelne Server

```bash
# CAP Server
npm install -g @cap-js/mcp-server

# UI5 Server
npm install -g @ui5/mcp-server

# Fiori Server
npm install -g @sap-ux/fiori-mcp-server

# MDK Server
npm install -g @sap/mdk-mcp-server
```

## ⚙️ Konfiguration

### VS Code (settings.json)

```json
{
  "mcp.servers": {
    "@cap-js/mcp-server": {
      "command": "npx",
      "args": ["@cap-js/mcp-server"],
      "env": {
        "CDS_PROJECT_PATH": "${workspaceFolder}"
      }
    },
    "@ui5/mcp-server": {
      "command": "npx",
      "args": ["@ui5/mcp-server"]
    },
    "@sap-ux/fiori-mcp-server": {
      "command": "npx",
      "args": ["@sap-ux/fiori-mcp-server"]
    },
    "@sap/mdk-mcp-server": {
      "command": "npx",
      "args": ["@sap/mdk-mcp-server"]
    }
  }
}
```

### Claude Desktop (config.json)

```json
{
  "mcpServers": {
    "cap": {
      "command": "npx",
      "args": ["@cap-js/mcp-server"],
      "env": {
        "CDS_PROJECT_PATH": "/path/to/project"
      }
    },
    "ui5": {
      "command": "npx",
      "args": ["@ui5/mcp-server"]
    }
  }
}
```

## 🔄 Demo vs Production Mode

### Demo Mode (Standard)

Im Demo-Mode werden MCP-Aufrufe simuliert. Dies ist ideal für:
- Entwicklung und Testing
- Demos ohne echte Server-Installation
- Schnelles Prototyping

```
MCP Call: search_model(query: "Books")
→ [Demo] CDS Model Search Results for "Books":
  - entity Books { ... }
  - entity Authors { ... }
```

### Production Mode

Im Production-Mode werden echte MCP Server aufgerufen:
1. MCP Server müssen installiert sein
2. In Admin → Customizing auf "Production" umschalten
3. Oder `MCP_MODE=production` als Umgebungsvariable setzen

## 🛠️ MCP Tools im Detail

### CAP MCP Server

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `search_model` | Durchsucht CDS-Modelle | `query`: Suchbegriff |
| `search_docs` | Sucht in CAP-Dokumentation | `query`: Suchanfrage |

**Beispiel:**
```json
{
  "tool": "search_model",
  "arguments": {
    "query": "Order"
  }
}
```

### UI5 MCP Server

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `create_ui5_app` | Erstellt neue UI5 App | `templateType`, `appName`, `namespace` |
| `get_api_reference` | API-Dokumentation | `symbol`: z.B. `sap.m.Button` |
| `get_guidelines` | Best Practices | `topic`: z.B. `data-binding` |
| `run_ui5_linter` | Code-Analyse | `projectPath` |
| `get_project_info` | Projekt-Metadaten | `projectPath` |
| `get_version_info` | Framework-Version | - |

### Fiori MCP Server

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `search_fiori_docs` | Fiori Dokumentation | `query` |
| `generate_fiori_app` | Generiert Fiori App | `templateType`, `projectPath`, `dataSource` |
| `add_annotation` | Fügt UI Annotations hinzu | `projectPath`, `annotationType` |

### MDK MCP Server

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `mdk-gen-project` | Neues MDK Projekt | `folderRootPath`, `templateType`, `offline` |
| `mdk-gen-entity` | Entity Pages | `folderRootPath`, `oDataEntitySets` |
| `mdk-gen-action` | MDK Actions | `folderRootPath`, `actionType` |
| `mdk-manage` | Build/Deploy/Validate | `folderRootPath`, `operation` |
| `mdk-docs` | Dokumentationssuche | `operation`, `query` |

## 📊 MCP Server Marketplace

Unter `/mcp` oder `/admin → MCP Server` findest du den MCP Server Marketplace:

- **Verfügbare Server**: Alle unterstützten MCP Server
- **Installierte Server**: Aktive Server in deinem Workspace
- **Kategorien**: Development, Database, Search, etc.

### Server installieren

1. Gehe zu `/admin`
2. Klicke auf **MCP Server** Tab
3. Suche den gewünschten Server
4. Klicke **Installieren**

### Server aktivieren

1. Gehe zu `/sap` → **Konfiguration** Tab
2. Aktiviere die gewünschten Server per Toggle
3. Konfiguration wird automatisch generiert

## 🔌 API Route

MCP-Aufrufe werden über die API Route `/api/mcp/general` abgewickelt:

```typescript
// POST /api/mcp/general
{
  "serverId": "cap",
  "capability": "search_model",
  "args": {
    "query": "Customer"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "entities": ["Customer", "CustomerOrder"],
    "services": ["CustomerService"]
  },
  "mode": "demo"
}
```

## 🐛 Troubleshooting

### MCP Server nicht gefunden

```bash
# Prüfe Installation
npm list -g @cap-js/mcp-server

# Neu installieren
npm install -g @cap-js/mcp-server
```

### Timeout bei MCP-Aufrufen

- Prüfe ob Server läuft
- Erhöhe Timeout in Konfiguration
- Prüfe Netzwerkverbindung

### Demo-Mode zeigt keine Ergebnisse

- Demo-Mode liefert simulierte Ergebnisse
- Für echte Ergebnisse: Production Mode aktivieren

## 📚 Weitere Ressourcen

- [MCP Specification](https://modelcontextprotocol.io/)
- [CAP MCP Server](https://github.com/cap-js/mcp-server)
- [UI5 MCP Server](https://github.com/UI5/mcp-server)
- [SAP MDK MCP Server](https://github.com/SAP/mdk-mcp-server)
