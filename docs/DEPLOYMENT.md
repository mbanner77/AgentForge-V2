# Deployment Guide

AgentForge unterstützt mehrere Deployment-Optionen für generierte Apps.

## 🚀 Deployment-Ziele

### 1. Render.com

**Empfohlen für**: Web-Apps, Next.js, Node.js Projekte

#### Automatisches Deployment via Builder

1. Öffne den Builder (`/builder`)
2. Klicke auf **Deployen** (grüner Button)
3. Wähle **Render** als Deployment-Ziel
4. Gib einen Projektnamen ein
5. Klicke **Deploy zu Render**

Was passiert:
- GitHub Repository wird erstellt
- `render.yaml` Blueprint wird generiert
- App wird zu Render.com deployed

#### Generierter Blueprint (render.yaml)

```yaml
services:
  - type: web
    name: mein-projekt
    runtime: node
    region: frankfurt
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
    autoDeploy: true
    healthCheckPath: /
```

#### Manuelles Deployment

1. Blueprint generieren: **Admin → Customizing → Render Deployment**
2. `render.yaml` in dein Repository kopieren
3. In Render Dashboard: **New → Blueprint → Repository verbinden**

#### Render Plans

| Plan | Preis | RAM | CPU |
|------|-------|-----|-----|
| Free | $0/mo | 512MB | Shared |
| Starter | $7/mo | 512MB | 0.5 CPU |
| Standard | $25/mo | 2GB | 1 CPU |
| Pro | $85/mo | 4GB | 2 CPU |

---

### 2. SAP BTP (Business Technology Platform)

**Empfohlen für**: SAP Fiori Apps, CAP Projekte, Enterprise Apps

#### Voraussetzungen

- SAP BTP Account (Trial oder Enterprise)
- Cloud Foundry Environment aktiviert
- Mindestens Space Developer Rolle
- (Optional) HANA Cloud für Datenpersistenz

#### Credentials konfigurieren

1. Gehe zu **Settings → API Keys → SAP BTP Credentials**
2. Konfiguriere:
   - **API Endpoint**: z.B. `https://api.cf.eu10.hana.ondemand.com`
   - **Organisation**: Deine BTP Org
   - **Space**: z.B. `dev`
   - **Username**: BTP Login
   - **Password**: BTP Passwort oder API Token

#### Deployment via Builder

1. Öffne den Builder
2. Klicke **Deployen**
3. Wähle **SAP BTP** als Ziel
4. Klicke **Deploy zu BTP**

Was passiert:
- `mta.yaml` wird generiert
- `xs-security.json` wird generiert
- MTA wird gebaut
- App wird zu Cloud Foundry deployed

#### Generierte MTA Konfiguration (mta.yaml)

```yaml
_schema-version: "3.2"
ID: mein-projekt
version: 1.0.0

modules:
  - name: mein-projekt
    type: approuter.nodejs
    path: .
    parameters:
      disk-quota: 256M
      memory: 256M
    requires:
      - name: mein-projekt-uaa

resources:
  - name: mein-projekt-uaa
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: ./xs-security.json
```

#### BTP Regionen

| Region | API Endpoint |
|--------|--------------|
| EU10 (Frankfurt) | `https://api.cf.eu10.hana.ondemand.com` |
| EU20 (Amsterdam) | `https://api.cf.eu20.hana.ondemand.com` |
| US10 (Virginia) | `https://api.cf.us10.hana.ondemand.com` |
| AP10 (Sydney) | `https://api.cf.ap10.hana.ondemand.com` |
| AP21 (Singapore) | `https://api.cf.ap21.hana.ondemand.com` |

---

### 3. GitHub Only

**Empfohlen für**: Lokale Entwicklung, CI/CD Pipelines

1. Öffne den Builder
2. Klicke **Deployen**
3. Wähle **GitHub** als Ziel
4. Repository wird erstellt ohne weiteres Deployment

---

## 🔧 Admin Customizing

### Demo vs Production Mode

Unter **Admin → Customizing** kannst du zwischen Modi wechseln:

| Modus | Beschreibung |
|-------|--------------|
| **Demo** | Simulierte Deployments, keine echten API-Calls |
| **Production** | Echte Deployments zu Render/BTP |

### Deployment direkt im Admin

1. Gehe zu **Admin → Customizing**
2. Scrolle zu **Render Deployment** oder **SAP BTP Deployment**
3. Konfiguriere und deploye direkt

---

## 📊 Deployment Status

Während des Deployments werden Live-Logs angezeigt:

```
Erstelle GitHub Repository...
✓ GitHub Repository erstellt: https://github.com/user/projekt
Generiere Render Blueprint...
✓ render.yaml Blueprint generiert
Deploye zu Render.com...
→ npm install
→ npm run build
✓ Build erfolgreich
→ Container wird erstellt
✓ Deployment erfolgreich!

🚀 App URL: https://mein-projekt.onrender.com
```

---

## 🔑 Erforderliche API Keys

| Deployment-Ziel | Erforderliche Keys |
|-----------------|-------------------|
| **Render** | GitHub Token, (optional) Render API Key |
| **SAP BTP** | BTP Credentials (Endpoint, Org, Space, User, Pass) |
| **GitHub Only** | GitHub Token |

---

## 🐛 Troubleshooting

### Render Deployment fehlgeschlagen

- Prüfe ob GitHub Token korrekt ist
- Prüfe ob Repository-Name gültig ist (keine Sonderzeichen)
- Prüfe Render API Key (falls konfiguriert)

### BTP Deployment fehlgeschlagen

- Prüfe BTP Credentials in Settings
- Prüfe ob Cloud Foundry aktiviert ist
- Prüfe Space Developer Berechtigung
- Prüfe ob genug Quota vorhanden ist

### GitHub Repository existiert bereits

- Wähle einen anderen Projektnamen
- Oder lösche das existierende Repository
