# AgentForge - Agentic Coding System

Ein KI-gestütztes Coding-System mit Multi-Agenten-Architektur für automatische App-Generierung.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mbanner77/AgentForge-V2)

## 🚀 Features

### Core Features
- **Multi-Agenten-Workflow**: Planner, Coder, Reviewer, Executor, Deployer
- **Live-Preview**: Code in StackBlitz testen
- **Automatische Fehlerkorrektur**: Fehler werden automatisch erkannt und korrigiert
- **Persistenz**: Projekte und Einstellungen werden in PostgreSQL gespeichert

### Deployment-Optionen
- **🚀 Render.com**: One-Click Deploy mit automatischem Blueprint
- **🏢 SAP BTP**: Cloud Foundry Deployment mit MTA
- **📁 GitHub**: Repository-Erstellung und Push

### MCP Integration (Model Context Protocol)
- **Generischer MCP Support**: Alle MCP Server nutzbar
- **SAP MCP Server**: CAP, UI5, Fiori, MDK
- **Demo/Production Mode**: Umschaltbar im Admin-Bereich

### Admin & Customizing
- **Benutzer-Verwaltung**: Admin/User Rollen
- **Agenten-Marketplace**: Agenten installieren/deinstallieren
- **MCP Server Marketplace**: MCP Server verwalten
- **System Customizing**: Demo/Production Mode umschalten

## 📦 Installation

```bash
# Dependencies installieren
npm install

# Prisma Client generieren
npx prisma generate

# Entwicklungsserver starten
npm run dev
```

## 🗄️ Datenbank Setup (Lokal)

```bash
# PostgreSQL mit Docker starten
docker run --name agentforge-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=agentforge -p 5432:5432 -d postgres

# .env Datei erstellen
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentforge" > .env

# Datenbank migrieren
npx prisma db push
```

## ☁️ Deployment

### Option 1: Render.com (Empfohlen)

#### Via Blueprint
1. Klicke auf den **Deploy to Render** Button oben
2. Render erstellt automatisch:
   - Web Service (Next.js App)
   - PostgreSQL Datenbank

#### Via App
1. Öffne den Builder
2. Klicke auf **Deployen**
3. Wähle **Render** als Ziel
4. Blueprint wird automatisch generiert

### Option 2: SAP BTP

1. **Credentials konfigurieren**: Settings → API Keys → SAP BTP
2. Im Builder auf **Deployen** klicken
3. **SAP BTP** als Ziel wählen
4. MTA wird generiert und deployed

Voraussetzungen:
- BTP Account (Trial oder Enterprise)
- Cloud Foundry Environment aktiviert
- Space Developer Rolle

### Option 3: Manuell

```bash
# Build
npm run build

# Start
npm start
```

## 🔧 Umgebungsvariablen

| Variable | Beschreibung | Erforderlich |
|----------|-------------|--------------|
| `DATABASE_URL` | PostgreSQL Connection String | ✅ |
| `NODE_ENV` | `development` oder `production` | ✅ |
| `MCP_MODE` | `demo` oder `production` | ❌ |
| `NEXTAUTH_SECRET` | Secret für Auth | ❌ |

## 🛠️ API Keys (In der App konfigurieren)

Unter **Settings → API Keys**:

| Key | Verwendung |
|-----|------------|
| **OpenAI API Key** | GPT-4, GPT-4o Modelle |
| **Anthropic API Key** | Claude 3.5, Claude 3 Modelle |
| **OpenRouter API Key** | Alle Modelle über OpenRouter |
| **GitHub Token** | Repository-Erstellung (repo scope) |
| **Render API Key** | Automatisches Deployment |

Unter **Settings → SAP BTP Credentials**:

| Feld | Beschreibung |
|------|--------------|
| **API Endpoint** | Cloud Foundry API (z.B. `https://api.cf.eu10.hana.ondemand.com`) |
| **Organisation** | BTP Organisation |
| **Space** | Cloud Foundry Space |
| **Username** | BTP Benutzername |
| **Password** | BTP Passwort oder API Token |

## 🤖 MCP Server

### Offizielle SAP MCP Server

| Server | Package | Beschreibung |
|--------|---------|--------------|
| **CAP** | `@cap-js/mcp-server` | Cloud Application Programming Model |
| **UI5** | `@ui5/mcp-server` | SAPUI5/OpenUI5 Development |
| **Fiori** | `@sap-ux/fiori-mcp-server` | SAP Fiori Elements |
| **MDK** | `@sap/mdk-mcp-server` | Mobile Development Kit |

### Installation

```bash
# Alle SAP MCP Server installieren
npm install -g @cap-js/mcp-server @ui5/mcp-server @sap/mdk-mcp-server @sap-ux/fiori-mcp-server
```

### Demo vs Production Mode

| Modus | Beschreibung |
|-------|--------------|
| **Demo** | Simulierte MCP Responses, keine echten Server nötig |
| **Production** | Echte MCP Server Aufrufe, volle Funktionalität |

Umschalten unter: **Admin → Customizing → MCP Betriebsmodus**

## 📁 Projektstruktur

```
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── chat/          # LLM Chat API (OpenAI, Anthropic, OpenRouter)
│   │   ├── btp/           # SAP BTP Deployment API
│   │   ├── render/        # Render.com Deployment API
│   │   ├── mcp/           # MCP Server API
│   │   ├── projects/      # Projekt CRUD
│   │   └── settings/      # Einstellungen API
│   ├── admin/             # Admin Dashboard
│   ├── builder/           # Builder Page
│   ├── mcp/               # MCP Server Marketplace
│   ├── sap/               # SAP Integration
│   └── settings/          # Einstellungen
├── components/            # React Komponenten
│   ├── admin/             # Admin Dashboard UI
│   ├── builder/           # Builder UI
│   └── sap/               # SAP Integration UI
├── lib/                   # Utilities
│   ├── agent-store.ts     # Zustand Store
│   ├── agent-executor-real.ts # Workflow Executor
│   ├── btp-deployment.ts  # BTP Deployment Service
│   ├── render-deployment.ts # Render Deployment Service
│   ├── mcp-servers.ts     # MCP Server Definitionen
│   ├── sap-agents.ts      # SAP Agenten & MCP
│   └── types.ts           # TypeScript Types
├── prisma/                # Datenbank Schema
│   └── schema.prisma
└── render.yaml            # Render.com Blueprint
```

## 🔐 Authentifizierung

Standard-Login:
- **Username**: `admin`
- **Password**: `admin`

⚠️ **Wichtig**: Passwort nach erstem Login ändern!

## 📖 Weitere Dokumentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [MCP Integration](docs/MCP.md)
- [SAP Integration](docs/SAP.md)
- [API Reference](docs/API.md)

## 📝 Lizenz

RealCore Group GmbH
