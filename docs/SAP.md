# SAP Integration

AgentForge bietet umfassende SAP-Integration für die Entwicklung von Fiori, CAP, UI5 und MDK Anwendungen.

## 🏢 Übersicht

AgentForge unterstützt die Entwicklung und das Deployment von SAP-Anwendungen durch:

- **SAP MCP Server**: Offizielle MCP Server für CAP, UI5, Fiori, MDK
- **SAP Agenten**: Spezialisierte Agenten für SAP-Entwicklung
- **BTP Deployment**: Direktes Deployment zu SAP Business Technology Platform

## 🤖 SAP Agenten

### SAP CAP Developer

**Expertise:**
- CDS (Core Data Services) Modellierung
- CAP Node.js und Java Runtime
- Service Handler und Custom Logic
- HANA und SQLite Persistenz
- OData V4 Services

**MCP Server:** `@cap-js/mcp-server`

**Beispiel-Prompt:**
```
Erstelle ein CAP Projekt mit einem Bookshop Service. 
Es soll Bücher und Autoren verwalten können.
```

### SAP UI5 Developer

**Expertise:**
- SAPUI5 Controls und Custom Controls
- MVC Pattern und Component-based Architecture
- Data Binding (One-Way, Two-Way, Expression)
- OData V2/V4 Models
- TypeScript mit UI5

**MCP Server:** `@ui5/mcp-server`

**Beispiel-Prompt:**
```
Erstelle eine UI5 Master-Detail App für Kundenaufträge.
```

### SAP Fiori Developer

**Expertise:**
- Fiori Elements Templates (List Report, Object Page)
- OData Annotations (UI, Common, Capabilities)
- Flexible Programming Model (FPM)
- SAP Fiori Tools Extension

**MCP Server:** `@sap-ux/fiori-mcp-server`, `@ui5/mcp-server`

**Beispiel-Prompt:**
```
Generiere eine Fiori Elements List Report App 
für die Anzeige von Bestellungen mit Filterung.
```

### SAP MDK Developer

**Expertise:**
- MDK Metadata-driven Development
- Offline Synchronization
- SAP Mobile Services Integration
- Cross-Platform Apps (iOS, Android, Web)

**MCP Server:** `@sap/mdk-mcp-server`

**Beispiel-Prompt:**
```
Erstelle eine MDK Mobile App für Zeiterfassung mit Offline-Sync.
```

## ☁️ SAP BTP Deployment

### Konfiguration

1. Gehe zu **Settings → API Keys → SAP BTP Credentials**
2. Konfiguriere:

| Feld | Beispiel | Beschreibung |
|------|----------|--------------|
| **API Endpoint** | `https://api.cf.eu10.hana.ondemand.com` | Cloud Foundry API |
| **Organisation** | `my-company-trial` | BTP Organisation |
| **Space** | `dev` | Cloud Foundry Space |
| **Username** | `user@company.com` | BTP Login |
| **Password** | `***` | Passwort oder API Token |

### Deployment-Prozess

```
┌─────────────────────────────────────────────────────────┐
│                 BTP Deployment Flow                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Validate Credentials                                 │
│     └─→ Prüft API Endpoint, Org, Space                  │
│                                                          │
│  2. Generate MTA Configuration                           │
│     └─→ mta.yaml, xs-security.json                      │
│                                                          │
│  3. Build MTA Archive                                    │
│     └─→ mbt build → .mtar Datei                         │
│                                                          │
│  4. Deploy to Cloud Foundry                              │
│     └─→ cf login → cf deploy                            │
│                                                          │
│  5. App is Live! 🚀                                      │
│     └─→ https://app.cfapps.eu10.hana.ondemand.com       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Generierte Dateien

#### mta.yaml

```yaml
_schema-version: "3.2"
ID: my-fiori-app
version: 1.0.0

modules:
  - name: my-fiori-app
    type: approuter.nodejs
    path: .
    parameters:
      disk-quota: 256M
      memory: 256M
    requires:
      - name: my-fiori-app-uaa

resources:
  - name: my-fiori-app-uaa
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: ./xs-security.json
```

#### xs-security.json

```json
{
  "xsappname": "my-fiori-app",
  "tenant-mode": "dedicated",
  "scopes": [
    {
      "name": "$XSAPPNAME.user",
      "description": "User access"
    },
    {
      "name": "$XSAPPNAME.admin",
      "description": "Admin access"
    }
  ],
  "role-templates": [
    {
      "name": "User",
      "scope-references": ["$XSAPPNAME.user"]
    },
    {
      "name": "Admin",
      "scope-references": ["$XSAPPNAME.admin"]
    }
  ]
}
```

### BTP Services

| Service | Beschreibung |
|---------|--------------|
| **XSUAA** | Authentication & Authorization |
| **Destination** | Backend-Verbindungen |
| **HTML5 Repository** | UI5/Fiori App Hosting |
| **HANA Cloud** | Datenbank |
| **Connectivity** | On-Premise Verbindungen |

## 🔧 SAP Integration Page

Unter `/sap` findest du die SAP Integration Page mit:

### Agenten Tab
- Alle SAP Agenten mit Beschreibung
- Auswahl für Builder-Integration
- Capabilities-Übersicht

### MCP Server Tab
- Offizielle SAP MCP Server
- Status-Prüfung (installiert/nicht installiert)
- Aktivierung per Toggle
- Repository-Links

### Konfiguration Tab
- VS Code Konfiguration generieren
- Claude Desktop Konfiguration generieren
- Installationsanleitungen
- Schnellinstallation-Befehl

## 📋 Installationsanleitungen

### CAP MCP Server

```bash
# Voraussetzungen
# - Node.js >= 18
# - CAP Projekt mit package.json
# - @sap/cds installiert

# Installation
npm install -g @cap-js/mcp-server

# VS Code Konfiguration
{
  "mcp.servers": {
    "@cap-js/mcp-server": {
      "command": "npx",
      "args": ["@cap-js/mcp-server"]
    }
  }
}
```

### UI5 MCP Server

```bash
# Voraussetzungen
# - Node.js >= 20.17.0 oder >= 22.9.0
# - npm >= 8.0.0

# Installation
npm install -g @ui5/mcp-server
```

### Fiori MCP Server

```bash
# Voraussetzungen
# - Node.js >= 18
# - @sap/ux-specification

# Installation
npm install -g @sap-ux/fiori-mcp-server
```

### MDK MCP Server

```bash
# Voraussetzungen
# - Node.js >= 18
# - MDK CLI installiert
# - SAP Mobile Services Zugang

# Installation
npm install -g @sap/mdk-mcp-server
```

## 🔌 API Endpunkte

### BTP Deploy API

```typescript
// POST /api/btp/deploy
{
  "action": "validate" | "generate-mta" | "build" | "deploy" | "status",
  "config": {
    "appName": "my-app",
    "projectType": "cap" | "fiori",
    "useHANA": false,
    "credentials": {
      "apiEndpoint": "https://api.cf.eu10.hana.ondemand.com",
      "org": "my-org",
      "space": "dev",
      "username": "user@company.com",
      "password": "***"
    }
  }
}
```

### MCP General API

```typescript
// POST /api/mcp/general
{
  "serverId": "cap" | "ui5" | "fiori" | "mdk",
  "capability": "search_model" | "create_ui5_app" | ...,
  "args": { ... }
}
```

## 🐛 Troubleshooting

### BTP Login fehlgeschlagen

- Prüfe API Endpoint (korrekte Region?)
- Prüfe Username/Password
- Prüfe ob 2FA aktiv ist (API Token verwenden)

### MTA Build fehlgeschlagen

- Prüfe ob `mbt` installiert ist: `npm install -g mbt`
- Prüfe mta.yaml Syntax
- Prüfe ob alle Abhängigkeiten vorhanden sind

### App nicht erreichbar nach Deployment

- Prüfe App-Status in BTP Cockpit
- Prüfe Logs: `cf logs app-name --recent`
- Prüfe ob alle Services gebunden sind

## 📚 Weitere Ressourcen

- [SAP CAP Documentation](https://cap.cloud.sap/docs/)
- [SAPUI5 Documentation](https://ui5.sap.com/)
- [SAP Fiori Tools](https://help.sap.com/docs/SAP_FIORI_tools)
- [SAP MDK Documentation](https://help.sap.com/docs/SAP_MOBILE_DEVELOPMENT_KIT)
- [SAP BTP Documentation](https://help.sap.com/docs/btp)
