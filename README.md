# AgentForge - Agentic Coding System

Ein KI-gestütztes Coding-System mit Multi-Agenten-Architektur für automatische App-Generierung.

## 🚀 Features

- **Multi-Agenten-Workflow**: Planner, Coder, Reviewer, Executor
- **Live-Preview**: Code in StackBlitz testen
- **Automatische Fehlerkorrektur**: Fehler werden automatisch erkannt und korrigiert
- **GitHub Integration**: Projekte direkt zu GitHub pushen
- **Render.com Deployment**: One-Click Deploy mit Blueprint
- **Persistenz**: Projekte und Einstellungen werden in PostgreSQL gespeichert

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

## ☁️ Deployment auf Render.com

### Option 1: Blueprint (Empfohlen)

1. Pushe dieses Repository zu GitHub
2. Gehe zu [Render Dashboard](https://dashboard.render.com)
3. Klicke auf **New** → **Blueprint**
4. Verbinde dein GitHub Repository
5. Render erstellt automatisch:
   - Web Service (Next.js App)
   - PostgreSQL Datenbank

### Option 2: Manuell

1. **PostgreSQL Datenbank erstellen**:
   - Render Dashboard → New → PostgreSQL
   - Name: `agentforge-db`
   - Region: Frankfurt

2. **Web Service erstellen**:
   - Render Dashboard → New → Web Service
   - Repository verbinden
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npm start`
   - Environment Variables:
     - `DATABASE_URL`: (von PostgreSQL kopieren)
     - `NODE_ENV`: `production`

## 🔧 Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL Connection String |
| `NODE_ENV` | `development` oder `production` |
| `NEXTAUTH_SECRET` | Secret für Auth (optional) |
| `NEXTAUTH_URL` | App URL (optional) |

## 🛠️ API Keys (In der App konfigurieren)

Die folgenden API Keys werden in der App unter **Einstellungen → Global** konfiguriert:

- **OpenAI API Key**: Für GPT-4 Modelle
- **Anthropic API Key**: Für Claude Modelle
- **GitHub Token**: Für Repository-Erstellung (repo scope)
- **Render API Key**: Für automatisches Deployment

## 📁 Projektstruktur

```
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── chat/          # LLM Chat API
│   │   ├── deploy/        # Render.com Deploy API
│   │   ├── projects/      # Projekt CRUD
│   │   └── settings/      # Einstellungen API
│   └── builder/           # Builder Page
├── components/            # React Komponenten
│   └── builder/           # Builder UI
├── lib/                   # Utilities
│   ├── agent-store.ts     # Zustand Store
│   ├── agent-executor-real.ts # Workflow Executor
│   ├── db.ts              # Prisma Client
│   └── use-persistence.ts # Auto-Save Hook
├── prisma/                # Datenbank Schema
│   └── schema.prisma
└── render.yaml            # Render.com Blueprint
```

## 📝 Lizenz

RealCore Group GmbH
