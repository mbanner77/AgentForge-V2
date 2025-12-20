# API Reference

Vollständige Referenz aller AgentForge API Endpunkte.

## 🔐 Authentifizierung

Alle API-Aufrufe erfordern eine aktive Session (Cookie-basiert nach Login).

## 📡 API Endpunkte

---

## Chat API

### POST /api/chat

LLM Chat mit Unterstützung für OpenAI, Anthropic und OpenRouter.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Erstelle eine React App" }
  ],
  "model": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

**Response:**
```json
{
  "content": "Hier ist eine React App...",
  "model": "gpt-4o",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 500
  }
}
```

**Unterstützte Modelle:**

| Provider | Modelle |
|----------|---------|
| OpenAI | `gpt-4o`, `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo` |
| Anthropic | `claude-3-5-sonnet`, `claude-3-opus`, `claude-3-sonnet` |
| OpenRouter | Alle OpenRouter Modelle |

---

## Deployment APIs

### POST /api/render/deploy

Render.com Deployment mit Blueprint-Generierung.

**Actions:**

#### validate
```json
{
  "action": "validate",
  "apiKey": "rnd_..."
}
```

**Response:**
```json
{
  "valid": true,
  "mode": "production",
  "owners": [{ "id": "...", "name": "...", "email": "..." }]
}
```

#### generate-blueprint
```json
{
  "action": "generate-blueprint",
  "config": {
    "projectName": "my-app",
    "projectType": "nextjs",
    "region": "frankfurt",
    "plan": "free",
    "includeDatabase": true,
    "autoDeploy": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "blueprint": "services:\n  - type: web\n...",
  "filename": "render.yaml",
  "deployButtonUrl": "https://render.com/deploy?repo=..."
}
```

#### deploy
```json
{
  "action": "deploy",
  "config": {
    "projectName": "my-app",
    "projectType": "nextjs",
    "region": "frankfurt",
    "plan": "free"
  },
  "apiKey": "rnd_..."
}
```

**Response:**
```json
{
  "success": true,
  "mode": "demo",
  "serviceId": "srv-...",
  "serviceUrl": "https://my-app.onrender.com",
  "dashboardUrl": "https://dashboard.render.com/web/srv-...",
  "blueprint": "...",
  "logs": ["Erstelle Service...", "✓ Deployment erfolgreich"]
}
```

### GET /api/render/deploy

Render Konfigurationsoptionen.

**Response:**
```json
{
  "regions": [
    { "id": "frankfurt", "name": "Frankfurt, Germany", "code": "frankfurt" }
  ],
  "plans": [
    { "id": "free", "name": "Free", "price": "$0/mo", "ram": "512MB" }
  ],
  "projectTypes": [
    { "id": "nextjs", "name": "Next.js", "description": "React Framework" }
  ]
}
```

---

### POST /api/btp/deploy

SAP BTP Deployment.

**Actions:**

#### validate
```json
{
  "action": "validate",
  "credentials": {
    "apiEndpoint": "https://api.cf.eu10.hana.ondemand.com",
    "org": "my-org",
    "space": "dev",
    "username": "user@company.com",
    "password": "***"
  }
}
```

#### generate-mta
```json
{
  "action": "generate-mta",
  "config": {
    "appName": "my-app",
    "projectType": "fiori",
    "useHANA": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "mtaYaml": "_schema-version: \"3.2\"\n...",
  "xsSecurityJson": "{ \"xsappname\": \"my-app\" ... }"
}
```

#### build
```json
{
  "action": "build",
  "config": {
    "appName": "my-app",
    "projectType": "fiori",
    "projectPath": "./"
  }
}
```

#### deploy
```json
{
  "action": "deploy",
  "config": {
    "appName": "my-app",
    "projectType": "fiori",
    "credentials": { ... }
  }
}
```

**Response:**
```json
{
  "success": true,
  "mode": "production",
  "appUrl": "https://my-app.cfapps.eu10.hana.ondemand.com",
  "logs": ["cf login...", "cf deploy...", "✓ Deployment erfolgreich"]
}
```

---

## MCP API

### POST /api/mcp/general

Generischer MCP Server Aufruf.

**Request:**
```json
{
  "serverId": "cap",
  "capability": "search_model",
  "args": {
    "query": "Customer"
  }
}
```

**Response (Demo Mode):**
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

**Unterstützte Server:**

| serverId | Capabilities |
|----------|--------------|
| `cap` | `search_model`, `search_docs` |
| `ui5` | `create_ui5_app`, `get_api_reference`, `run_ui5_linter` |
| `fiori` | `search_fiori_docs`, `generate_fiori_app`, `add_annotation` |
| `mdk` | `mdk-gen-project`, `mdk-gen-entity`, `mdk-manage`, `mdk-docs` |
| `filesystem` | `read_file`, `write_file`, `list_directory` |
| `github` | `search_repositories`, `create_repository` |
| `postgres` | `query`, `list_tables` |

---

## Project APIs

### GET /api/projects

Liste aller Projekte.

**Response:**
```json
{
  "projects": [
    {
      "id": "abc123",
      "name": "My Project",
      "description": "...",
      "createdAt": "2024-12-20T10:00:00Z",
      "updatedAt": "2024-12-20T12:00:00Z"
    }
  ]
}
```

### POST /api/projects

Neues Projekt erstellen.

**Request:**
```json
{
  "name": "My Project",
  "description": "Beschreibung..."
}
```

### GET /api/projects/[id]

Projekt abrufen.

### PUT /api/projects/[id]

Projekt aktualisieren.

**Request:**
```json
{
  "name": "Updated Name",
  "files": [
    { "path": "/src/index.ts", "content": "..." }
  ],
  "messages": [...]
}
```

### DELETE /api/projects/[id]

Projekt löschen.

---

## Settings API

### GET /api/settings

Globale Einstellungen abrufen.

**Response:**
```json
{
  "defaultModel": "gpt-4o",
  "theme": "dark",
  "language": "de",
  "autoReview": true,
  "streaming": true
}
```

### PUT /api/settings

Einstellungen aktualisieren.

**Request:**
```json
{
  "defaultModel": "claude-3-5-sonnet",
  "theme": "dark"
}
```

---

## Error Responses

Alle API-Endpunkte liefern bei Fehlern:

```json
{
  "error": "Fehlerbeschreibung",
  "code": "ERROR_CODE"
}
```

**HTTP Status Codes:**

| Code | Beschreibung |
|------|--------------|
| 200 | Erfolg |
| 400 | Ungültige Anfrage |
| 401 | Nicht authentifiziert |
| 403 | Keine Berechtigung |
| 404 | Nicht gefunden |
| 500 | Server-Fehler |

---

## Rate Limits

| Endpunkt | Limit |
|----------|-------|
| `/api/chat` | 60 Requests/Minute |
| `/api/*/deploy` | 10 Requests/Minute |
| `/api/mcp/*` | 100 Requests/Minute |
| Andere | 120 Requests/Minute |

---

## Webhooks (geplant)

Zukünftig werden Webhooks für folgende Events unterstützt:

- `project.created`
- `project.updated`
- `deployment.started`
- `deployment.completed`
- `deployment.failed`
