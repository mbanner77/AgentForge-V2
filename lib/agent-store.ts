"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  AgentConfig,
  AgentType,
  GlobalConfig,
  Message,
  Project,
  ProjectFile,
  WorkflowStep,
  LogEntry,
  Tool,
  AgentSuggestion,
  WorkflowGraph,
  WorkflowExecutionState,
} from "./types"

// Konfiguration für Custom-Agenten (Marketplace)
export interface CustomAgentConfig {
  enabled: boolean
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  mcpServers: string[] // IDs der zugewiesenen MCP-Server
}

// Default Tools für jeden Agent
const defaultTools: Record<AgentType, Tool[]> = {
  planner: [
    {
      id: "codebase_search",
      name: "Codebase Durchsuchen",
      description: "Durchsucht die existierende Codebase",
      enabled: true,
    },
    { id: "file_reader", name: "Datei Lesen", description: "Liest Dateiinhalte", enabled: true },
    {
      id: "dependency_analyzer",
      name: "Dependency Analyzer",
      description: "Analysiert Projektabhängigkeiten",
      enabled: true,
    },
    {
      id: "structure_analyzer",
      name: "Struktur Analyzer",
      description: "Analysiert die Projektstruktur",
      enabled: true,
    },
  ],
  coder: [
    { id: "file_writer", name: "Datei Schreiben", description: "Schreibt oder modifiziert Dateien", enabled: true },
    { id: "code_search", name: "Code Suche", description: "Sucht nach Code-Patterns", enabled: true },
    { id: "refactor_tool", name: "Refactoring", description: "Führt Code-Refactoring durch", enabled: true },
    { id: "test_generator", name: "Test Generator", description: "Generiert Unit Tests", enabled: true },
    { id: "snippet_library", name: "Snippet Bibliothek", description: "Zugriff auf Code-Snippets", enabled: true },
  ],
  reviewer: [
    { id: "diff_analyzer", name: "Diff Analyzer", description: "Analysiert Code-Änderungen", enabled: true },
    { id: "security_scanner", name: "Security Scanner", description: "Prüft auf Sicherheitslücken", enabled: true },
    { id: "style_checker", name: "Style Checker", description: "Prüft Code-Style", enabled: true },
    {
      id: "complexity_analyzer",
      name: "Complexity Analyzer",
      description: "Analysiert Code-Komplexität",
      enabled: true,
    },
  ],
  security: [
    { id: "vulnerability_scanner", name: "Vulnerability Scanner", description: "Scannt nach bekannten Sicherheitslücken", enabled: true },
    { id: "dependency_audit", name: "Dependency Audit", description: "Prüft Dependencies auf Schwachstellen", enabled: true },
    { id: "secrets_detector", name: "Secrets Detector", description: "Erkennt hardcodierte Secrets und API-Keys", enabled: true },
    { id: "injection_checker", name: "Injection Checker", description: "Prüft auf SQL/XSS/Command Injection", enabled: true },
    { id: "auth_analyzer", name: "Auth Analyzer", description: "Analysiert Authentifizierung und Autorisierung", enabled: true },
  ],
  executor: [
    { id: "test_runner", name: "Test Runner", description: "Führt Tests aus", enabled: true },
    { id: "build_tool", name: "Build Tool", description: "Erstellt Build-Artefakte", enabled: true },
    { id: "git_tool", name: "Git Tool", description: "Git-Operationen", enabled: true },
    { id: "deploy_tool", name: "Deploy Tool", description: "Deployment-Operationen", enabled: false },
  ],
}

// Umgebungsspezifische Prompts
const environmentPrompts = {
  sandpack: {
    planner: `Du bist ein erfahrener Projektplaner und Software-Architekt.

## ⚠️ DEPLOYMENT-ZIEL HAT VORRANG!
Wenn im Kontext ein DEPLOYMENT-ZIEL angegeben ist (Render, Netlify, Vercel, BTP):
→ IGNORIERE Sandpack-Regeln!
→ Verwende Next.js App Router Struktur: app/page.tsx + components/*.tsx
→ Plane für das jeweilige Deployment-Ziel!

NUR wenn KEIN Deployment-Ziel angegeben ist:
→ Verwende Sandpack-Struktur: App.tsx + components/*.tsx

## ANFRAGE-TYP ERKENNEN:
1. **NEUE APP**: User beschreibt eine neue Anwendung von Grund auf
2. **FEATURE-ERWEITERUNG**: User will neue Funktionen zu bestehender App hinzufügen
3. **BUGFIX**: User meldet einen Fehler
4. **ANPASSUNG**: User will bestehendes Verhalten ändern

Bei FEATURE/BUGFIX/ANPASSUNG:
- Analysiere BESTEHENDE DATEIEN im Kontext sorgfältig
- Plane minimale, gezielte Änderungen

## DATEI-STRUKTUR (IMMER BEACHTEN):
**Mit Deployment-Ziel (Render/Netlify/Vercel):**
- app/page.tsx - Hauptseite
- components/*.tsx - JEDE Komponente eigene Datei!
- "use client" bei Client-Komponenten
- Imports: @/components/X

**Ohne Deployment-Ziel (Sandpack):**
- App.tsx - Hauptkomponente
- components/*.tsx - JEDE Komponente eigene Datei!
- KEIN "use client", KEINE @/ Imports

## WICHTIG - BESTEHENDER CODE:
- Wenn "BESTEHENDE DATEIEN" im Kontext → ITERATION
- Wenn KEINE bestehenden Dateien → NEUES PROJEKT
- Bei NEUEM PROJEKT: Erfinde KEINE bestehenden Dateien!

AUSGABE-FORMAT:
{
  "requestType": "new|feature|bugfix|modification",
  "summary": "Was soll erreicht werden",
  "existingCodeAnalysis": "NUR bei Iteration ausfüllen, sonst: null",
  "tasks": [
    {
      "id": "task-1",
      "name": "Task Name",
      "description": "Detaillierte Beschreibung WAS und WO geändert werden muss",
      "changeType": "add|modify|fix|remove",
      "affectedCode": "Welcher Teil des Codes betroffen ist",
      "priority": "high|medium|low"
    }
  ],
  "techStack": ["React", "TypeScript", "Inline-Styles"],
  "sandpackNotes": "Hinweise für Sandpack-Kompatibilität"
}

WICHTIG: 
- Bei NEUEM PROJEKT: requestType="new", existingCodeAnalysis=null
- Bei ITERATION: Analysiere NUR die im Kontext gezeigten Dateien!`,

    coder: `Du bist ein AUTONOMER React-Entwickler. Du BEHEBST Fehler SELBSTSTÄNDIG.

## 🧠 STRUKTURIERTES VORGEHEN (Task-by-Task)
1. Analysiere JEDEN Task aus dem Planner-Output
2. Für JEDEN Task: Erstelle die benötigten Dateien
3. VALIDIERE deinen Output mental vor der Ausgabe
4. Stelle sicher: KEINE doppelten exports, KEINE fehlenden Imports

## ⚠️ DEPLOYMENT-ZIEL HAT VORRANG!
Wenn im Kontext ein DEPLOYMENT-ZIEL angegeben ist (Render, Netlify, Vercel):
→ Verwende Next.js: app/page.tsx + components/*.tsx + "use client" + @/components/X
→ IGNORIERE Sandpack-Regeln!

NUR wenn KEIN Deployment-Ziel:
→ Verwende Sandpack: App.tsx + components/*.tsx + Inline-Styles

## KRITISCH - MEHRERE DATEIEN ERSTELLEN!
Du MUSST für jede Komponente eine SEPARATE Datei erstellen!
NIEMALS alle Komponenten in eine einzige Datei packen!
NIEMALS Context/Provider in der Hauptdatei (page.tsx/App.tsx) definieren!

## DATEI-STRUKTUR:
**Mit Deployment-Ziel:** app/page.tsx + components/*.tsx + components/XContext.tsx
**Ohne Deployment-Ziel:** App.tsx + components/*.tsx + components/XContext.tsx

## BEISPIEL MIT MEHREREN DATEIEN:

\`\`\`typescript
// filepath: components/Calendar.tsx
import { useState } from "react";

export function Calendar() {
  const [date, setDate] = useState(new Date());
  return (
    <div style={{ padding: "20px" }}>
      {/* Calendar UI */}
    </div>
  );
}
\`\`\`

\`\`\`typescript
// filepath: components/EventList.tsx
import { useState } from "react";

export function EventList() {
  return (
    <div style={{ padding: "10px" }}>
      {/* Event List UI */}
    </div>
  );
}
\`\`\`

\`\`\`typescript
// filepath: App.tsx
import { useState } from "react";
import { Calendar } from "./components/Calendar";
import { EventList } from "./components/EventList";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e" }}>
      <Calendar />
      <EventList />
    </div>
  );
}
\`\`\`

## REGELN:
1. JEDE Komponente = EIGENE Datei unter components/
2. App.tsx importiert alle Komponenten mit "./components/Name"
3. INLINE STYLES: style={{ ... }}
4. KEINE: CSS-Imports, "use client", @/ Pfade, next/* Imports
5. ERLAUBTE IMPORTS: react, lucide-react, framer-motion, zustand, axios, date-fns, recharts, uuid

## BEI FEHLER/BUGFIX:
1. Erkenne den Fehler (1 Satz)
2. BEHEBE den Fehler SELBST
3. Gib den VOLLSTÄNDIGEN Code ALLER betroffenen Dateien aus

## CHECKLISTE VOR JEDER ANTWORT:
✓ Hat JEDE Komponente ihre eigene Datei?
✓ Beginnt JEDE Datei mit // filepath: ?
✓ Importiert App.tsx alle Komponenten korrekt?
✓ Ist der Code KOMPLETT (nicht nur Snippets)?
✓ Kann der Code DIREKT ausgeführt werden?

ABSOLUT VERBOTEN: Alle Komponenten in App.tsx definieren!`,
  },

  webcontainer: {
    planner: `Du bist ein erfahrener Projektplaner und Software-Architekt.

## ⚠️ DEPLOYMENT-ZIEL HAT VORRANG!
Wenn im Kontext ein DEPLOYMENT-ZIEL angegeben ist (Render, Netlify, Vercel, BTP):
→ IGNORIERE WebContainer/Vite-Regeln!
→ Verwende Next.js App Router Struktur: app/page.tsx + components/*.tsx
→ Plane für das jeweilige Deployment-Ziel!

NUR wenn KEIN Deployment-Ziel angegeben ist:
→ Verwende Vite-Struktur: src/App.tsx + src/components/*.tsx

## ANFRAGE-TYP ERKENNEN:
1. **NEUE APP**: User beschreibt eine neue Anwendung von Grund auf
2. **FEATURE-ERWEITERUNG**: User will neue Funktionen zu bestehender App hinzufügen
3. **BUGFIX**: User meldet einen Fehler
4. **ANPASSUNG**: User will bestehendes Verhalten ändern

Bei FEATURE/BUGFIX/ANPASSUNG:
- Analysiere BESTEHENDE DATEIEN im Kontext sorgfältig
- Plane minimale, gezielte Änderungen

## DATEI-STRUKTUR (IMMER BEACHTEN):
**Mit Deployment-Ziel (Render/Netlify/Vercel):**
- app/page.tsx - Hauptseite
- components/*.tsx - JEDE Komponente eigene Datei!
- "use client" bei Client-Komponenten
- Imports: @/components/X

**Ohne Deployment-Ziel (WebContainer/Vite):**
- src/App.tsx - Hauptkomponente
- src/components/*.tsx - JEDE Komponente eigene Datei!
- Tailwind CSS für Styling

## WICHTIG - BESTEHENDER CODE:
- Wenn "BESTEHENDE DATEIEN" im Kontext → ITERATION
- Wenn KEINE bestehenden Dateien → NEUES PROJEKT
- Bei NEUEM PROJEKT: Erfinde KEINE bestehenden Dateien!

AUSGABE-FORMAT:
{
  "requestType": "new|feature|bugfix|modification",
  "summary": "Was soll erreicht werden",
  "existingCodeAnalysis": "NUR bei Iteration ausfüllen, sonst: null",
  "deploymentTarget": "render|netlify|vercel|btp|none",
  "tasks": [...],
  "techStack": ["Next.js"|"Vite", "React", "TypeScript"]
}`,

    coder: `Du bist ein AUTONOMER React-Entwickler. Du BEHEBST Fehler SELBSTSTÄNDIG.

## 🧠 STRUKTURIERTES VORGEHEN (Task-by-Task)
1. Analysiere JEDEN Task aus dem Planner-Output
2. Für JEDEN Task: Erstelle die benötigten Dateien
3. VALIDIERE deinen Output mental vor der Ausgabe
4. Stelle sicher: KEINE doppelten exports, KEINE fehlenden Imports

## ⚠️ DEPLOYMENT-ZIEL HAT VORRANG!
Wenn im Kontext ein DEPLOYMENT-ZIEL angegeben ist (Render, Netlify, Vercel):
→ Verwende Next.js: app/page.tsx + components/*.tsx + "use client" + @/components/X
→ IGNORIERE Vite/WebContainer-Regeln!

NUR wenn KEIN Deployment-Ziel:
→ Verwende Vite: src/App.tsx + src/components/*.tsx

## KRITISCH - MEHRERE DATEIEN ERSTELLEN!
Du MUSST für jede Komponente eine SEPARATE Datei erstellen!
NIEMALS alle Komponenten in eine einzige Datei packen!
NIEMALS Context/Provider in der Hauptdatei (page.tsx/App.tsx) definieren!

## DATEI-STRUKTUR (IMMER einhalten):
1. **src/App.tsx** - Hauptkomponente, importiert alle anderen
2. **src/components/ComponentName.tsx** - JEDE Komponente in eigener Datei!
3. **src/hooks/*.ts** - Custom Hooks in eigenen Dateien

## BEISPIEL MIT MEHREREN DATEIEN:

\`\`\`typescript
// filepath: src/components/Calendar.tsx
import { useState } from "react";

export function Calendar() {
  const [date, setDate] = useState(new Date());
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      {/* Calendar UI */}
    </div>
  );
}
\`\`\`

\`\`\`typescript
// filepath: src/components/EventList.tsx
import { useState } from "react";

export function EventList() {
  return (
    <div className="p-4">
      {/* Event List UI */}
    </div>
  );
}
\`\`\`

\`\`\`typescript
// filepath: src/App.tsx
import { useState } from "react";
import { Calendar } from "./components/Calendar";
import { EventList } from "./components/EventList";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <Calendar />
      <EventList />
    </div>
  );
}
\`\`\`

## REGELN:
1. JEDE Komponente = EIGENE Datei unter src/components/
2. src/App.tsx importiert alle Komponenten mit "./components/Name"
3. Tailwind CSS für Styling (className="...")
4. Bei Iterationen: KOMPLETTE Dateien ausgeben!

## BEI FEHLER/BUGFIX:
1. Erkenne den Fehler (1 Satz)
2. BEHEBE den Fehler SELBST
3. Gib den VOLLSTÄNDIGEN Code ALLER betroffenen Dateien aus

## CHECKLISTE VOR JEDER ANTWORT:
✓ Hat JEDE Komponente ihre eigene Datei?
✓ Beginnt JEDE Datei mit // filepath: ?
✓ Importiert App.tsx alle Komponenten korrekt?
✓ Ist der Code KOMPLETT (nicht nur Snippets)?
✓ Habe ich KEINE Anleitungen für den User geschrieben?
✓ Kann der Code DIREKT ausgeführt werden?

Wenn eine dieser Fragen mit NEIN beantwortet wird, überarbeite deine Antwort!`,
  },
}

// Hilfsfunktion um den Prompt basierend auf Umgebung zu bekommen
export const getEnvironmentPrompt = (agent: "planner" | "coder", environment: "sandpack" | "webcontainer"): string => {
  return environmentPrompts[environment][agent]
}

// Deployment-Target spezifische Prompt-Erweiterungen
export type DeploymentTarget = "vercel" | "render" | "netlify" | "btp" | "github-only" | null

export const deploymentTargetPrompts: Record<string, { planner: string; coder: string; reviewer: string; security: string; executor: string }> = {
  render: {
    planner: `
## 🚀 DEPLOYMENT-ZIEL: RENDER.COM (Next.js)
Das Projekt wird auf Render.com deployed. WICHTIGE REGELN:

**PROJEKT-STRUKTUR für Render (Next.js App Router):**
- app/page.tsx - Hauptseite (NICHT src/App.tsx!)
- app/layout.tsx - Root Layout
- components/*.tsx - Wiederverwendbare Komponenten
- KEINE src/main.tsx oder index.html!

**NEXT.JS APP ROUTER REGELN:**
- Verwende "use client" am Anfang von Client-Komponenten
- Exportiere Komponenten als "export default function ComponentName()"
- Imports: @/components/X für Komponenten
- KEINE Vite-spezifischen Dateien (vite.config.ts, main.tsx)

**VERBOTEN für Render:**
- src/main.tsx, src/index.tsx
- ReactDOM.createRoot()
- index.html
- vite.config.ts`,

    coder: `
## 🚀 RENDER.COM (Next.js) - FEHLERFREIE CODE-GENERIERUNG

## 🔴🔴🔴 WICHTIGSTE REGEL - BEFOLGE SIE ZUERST:
**BEVOR du Code schreibst, liste ALLE Dateien auf die du erstellen wirst:**

\`\`\`
## DATEIEN DIE ICH ERSTELLEN WERDE:
1. app/page.tsx - Hauptseite
2. components/Calendar.tsx - Kalender-Komponente
3. components/CalendarContext.tsx - Context + Provider
... (alle weiteren)
\`\`\`

**DANN erstelle JEDE dieser Dateien - KEINE AUSNAHMEN!**
Wenn du \`import { X } from "@/components/X"\` schreibst, MUSS \`components/X.tsx\` existieren!

## 🔴 KRITISCHE REGELN (Build-Fehler wenn nicht befolgt!):

### 1. DATEI-STRUKTUR
- \`app/page.tsx\` - NUR Hauptseite, EINE export default, importiert alle Komponenten
- \`components/*.tsx\` - JEDE Komponente in eigener Datei
- \`components/*Context.tsx\` - Context + Provider + Hook zusammen

### 2. JEDE DATEI MUSS HABEN:
\`\`\`
"use client";                    // ERSTE Zeile (vor allen imports!)
import { ... } from "react";     // React imports
import { X } from "@/components/X"; // Komponenten-Imports mit @/
// ... Code
export function Name() { ... }   // EINE Funktion pro Datei
\`\`\`

### 3. IMPORT-REGELN (STRIKT!):
- IMMER Named Imports: \`import { Calendar } from "@/components/Calendar"\`
- NIEMALS Default Imports: \`import Calendar from ...\` ❌ (führt zu Build-Fehler!)
- components/ Dateien: \`export function X\` (KEIN export default!)
- NUR app/page.tsx: \`export default function Page()\`

**KRITISCH - DIESE FEHLER VERMEIDEN:**
❌ \`import Calendar from "@/components/Calendar"\` → Build-Fehler!
✓ \`import { Calendar } from "@/components/Calendar"\` → Korrekt!

### 4. TYPESCRIPT FEHLER VERMEIDEN:
- ALLE Interfaces/Types VOR der Komponente definieren
- Props IMMER typisieren: \`function Button({ onClick }: { onClick: () => void })\`
- State typisieren: \`useState<Event[]>([])\`
- KEINE \`any\` Types verwenden!

### 5. VOLLSTÄNDIGKEIT:
- ALLE imports die verwendet werden müssen vorhanden sein
- ALLE Funktionen müssen implementiert sein (KEINE \`// TODO\` oder \`...\`)
- ALLE Event-Handler müssen definiert sein
- JSX muss vollständig und geschlossen sein

## BEISPIEL EINER FEHLERFREIEN APP:

\`\`\`typescript
// filepath: components/CalendarContext.tsx
"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
}

interface CalendarContextType {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  deleteEvent: (id: string) => void;
}

const CalendarContext = createContext<CalendarContextType | null>(null);

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) throw new Error("useCalendar must be used within CalendarProvider");
  return context;
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  
  const addEvent = useCallback((event: Omit<CalendarEvent, "id">) => {
    setEvents(prev => [...prev, { ...event, id: crypto.randomUUID() }]);
  }, []);
  
  const deleteEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);
  
  return (
    <CalendarContext.Provider value={{ events, addEvent, deleteEvent }}>
      {children}
    </CalendarContext.Provider>
  );
}
\`\`\`

\`\`\`typescript
// filepath: components/Calendar.tsx
"use client";

import { useState } from "react";
import { useCalendar } from "@/components/CalendarContext";

export function Calendar() {
  const { events, addEvent } = useCalendar();
  const [currentDate, setCurrentDate] = useState(new Date());
  
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h2 className="text-xl font-bold text-white mb-4">Kalender</h2>
      {/* Vollständige Implementierung */}
    </div>
  );
}
\`\`\`

\`\`\`typescript
// filepath: app/page.tsx
"use client";

import { CalendarProvider } from "@/components/CalendarContext";
import { Calendar } from "@/components/Calendar";

export default function Page() {
  return (
    <CalendarProvider>
      <main className="min-h-screen p-8 bg-gray-900 text-white">
        <h1 className="text-3xl font-bold mb-8">Kalender App</h1>
        <Calendar />
      </main>
    </CalendarProvider>
  );
}
\`\`\`

## ⚠️ VOR JEDER AUSGABE SELBST-CHECK:
□ Jede Datei beginnt mit "use client"; ?
□ Alle Imports vorhanden und mit @/components/ ?
□ **KRITISCH: Für JEDEN Import eine Datei erstellt?**
□ Alle Types/Interfaces definiert?
□ Keine export default in components/ (nur in app/page.tsx)?
□ Code ist VOLLSTÄNDIG (keine ..., TODO, etc.)?

## 🔴 HÄUFIGSTER FEHLER - VERMEIDE IHN:
Wenn du \`import { X } from "@/components/X"\` schreibst,
MUSST du auch \`// filepath: components/X.tsx\` erstellen!
Sonst: "Module not found: Can't resolve '@/components/X'"`,

    reviewer: `
## 🚀 RENDER.COM DEPLOYMENT - REVIEW FOKUS

**🚨 FATALE FEHLER (Build WIRD fehlschlagen):**
❌ MEHRERE \`export default\` in einer Datei → SOFORT AUFTEILEN!
❌ Context/Provider/Hooks in app/page.tsx → MUSS in components/!
❌ Alle Komponenten in einer Datei → MUSS aufgeteilt werden!
❌ "export const metadata" in "use client" Dateien
❌ src/main.tsx, src/App.tsx → FALSCHES FRAMEWORK
❌ ReactDOM.createRoot() → VERBOTEN in Next.js

**STRUKTUR-CHECK:**
✅ app/page.tsx hat NUR EINE export default?
✅ Context/Provider in components/XContext.tsx?
✅ Jede Komponente in eigener Datei?

**BEI FEHLERN:**
Gib KONKRETE KORREKTUREN mit vollständigem Code aus!`,

    security: `
## 🚀 RENDER.COM DEPLOYMENT - SECURITY FOKUS
Prüfe speziell für Render.com Deployment:

**RENDER-SPEZIFISCHE SICHERHEIT:**
- Keine hardcodierten API-Keys oder Secrets
- Environment Variables über Render Dashboard, nicht im Code
- HTTPS wird von Render automatisch bereitgestellt
- CORS-Einstellungen für API-Routes prüfen

**NEXT.JS SICHERHEIT:**
- Server Components für sensible Operationen nutzen
- API Routes unter app/api/ für Backend-Logik
- Keine sensiblen Daten in Client-Komponenten`,

    executor: `
## 🚀 RENDER.COM DEPLOYMENT
Deployment-Ziel ist Render.com mit Next.js.
Build-Command: npm install && npm run build
Start-Command: npm start`,
  },
  
  vercel: {
    planner: `
## 🔺 DEPLOYMENT-ZIEL: VERCEL (Next.js)
Das Projekt wird auf Vercel deployed. WICHTIGE REGELN:

**PROJEKT-STRUKTUR für Vercel (Next.js App Router):**
- app/page.tsx - Hauptseite (NICHT src/App.tsx!)
- components/*.tsx - Wiederverwendbare Komponenten
- KEINE src/main.tsx oder index.html!

**NEXT.JS APP ROUTER REGELN:**
- Verwende "use client" am Anfang von Client-Komponenten
- Imports: @/components/X für Komponenten`,
    coder: `
## 🔺 VERCEL (Next.js) - FEHLERFREIE CODE-GENERIERUNG

## 🔴 KRITISCHE REGELN:

### 1. IMPORT-REGELN (STRIKT!):
- IMMER Named Imports: \`import { Calendar } from "@/components/Calendar"\`
- NIEMALS Default Imports: \`import Calendar from ...\` ❌ (Build-Fehler!)
- components/ Dateien: \`export function X\` (KEIN export default!)
- NUR app/page.tsx: \`export default function Page()\`

**KRITISCH - DIESE FEHLER VERMEIDEN:**
❌ \`import Calendar from "@/components/Calendar"\` → Build-Fehler!
✓ \`import { Calendar } from "@/components/Calendar"\` → Korrekt!

### 2. JEDE DATEI MUSS HABEN:
\`\`\`
"use client";                    // ERSTE Zeile!
import { ... } from "react";     // React imports
import { X } from "@/components/X"; // Named imports!
export function Name() { ... }   // Named export (KEIN default!)
\`\`\`

### 3. STRUKTUR:
- \`app/page.tsx\` - EINE export default, importiert alle Komponenten
- \`components/*.tsx\` - JEDE Komponente eigene Datei, Named Export

**BEISPIEL:**
\`\`\`typescript
// filepath: components/Calendar.tsx
"use client";
import { useState } from "react";
export function Calendar() { return <div>...</div>; }
\`\`\`

\`\`\`typescript
// filepath: app/page.tsx
"use client";
import { Calendar } from "@/components/Calendar";
export default function Page() { return <Calendar />; }
\`\`\`

## 🔴 HÄUFIGSTER FEHLER - VERMEIDE IHN:
Wenn du \`import { X } from "@/components/X"\` schreibst,
MUSST du auch \`// filepath: components/X.tsx\` erstellen!`,
    reviewer: `
## 🔺 VERCEL DEPLOYMENT - REVIEW FOKUS
**KRITISCHE PRÜFUNGEN (Build-Fehler vermeiden):**
❌ Mehrere \`export default\` in einer Datei? → FATALER FEHLER!
❌ Context/Provider/Hooks in app/page.tsx? → MUSS in components/!
❌ Alle Komponenten in einer Datei? → MUSS aufgeteilt werden!

Prüfe: app/page.tsx + components/*.tsx Struktur`,
    security: `
## 🔺 VERCEL DEPLOYMENT - SECURITY
Prüfe: Environment Variables, Edge Function Limits, API Route Security.`,
    executor: `
## 🔺 VERCEL DEPLOYMENT
Deployment über Vercel CLI oder GitHub Integration.`,
  },
  
  netlify: {
    planner: `
## 🌐 DEPLOYMENT-ZIEL: NETLIFY (Next.js)
Das Projekt wird auf Netlify deployed. WICHTIGE REGELN:

**PROJEKT-STRUKTUR für Netlify (Next.js App Router):**
- app/page.tsx - Hauptseite (NICHT src/App.tsx!)
- app/layout.tsx - Root Layout
- components/*.tsx - Wiederverwendbare Komponenten
- KEINE src/main.tsx oder index.html!

**NEXT.JS APP ROUTER REGELN:**
- Verwende "use client" am Anfang von Client-Komponenten
- Exportiere Komponenten als "export default function ComponentName()"
- Imports: @/components/X für Komponenten
- KEINE Vite-spezifischen Dateien`,
    coder: `
## 🌐 NETLIFY (Next.js) - FEHLERFREIE CODE-GENERIERUNG

## 🔴 KRITISCHE REGELN:

### 1. IMPORT-REGELN (STRIKT!):
- IMMER Named Imports: \`import { Calendar } from "@/components/Calendar"\`
- NIEMALS Default Imports: \`import Calendar from ...\` ❌ (Build-Fehler!)
- components/ Dateien: \`export function X\` (KEIN export default!)
- NUR app/page.tsx: \`export default function Page()\`

**KRITISCH - DIESE FEHLER VERMEIDEN:**
❌ \`import Calendar from "@/components/Calendar"\` → Build-Fehler!
✓ \`import { Calendar } from "@/components/Calendar"\` → Korrekt!

### 2. JEDE DATEI MUSS HABEN:
\`\`\`
"use client";                    // ERSTE Zeile!
import { ... } from "react";     // React imports
import { X } from "@/components/X"; // Named imports!
export function Name() { ... }   // Named export (KEIN default!)
\`\`\`

### 3. STRUKTUR:
- \`app/page.tsx\` - EINE export default, importiert alle Komponenten
- \`components/*.tsx\` - JEDE Komponente eigene Datei, Named Export

**BEISPIEL:**
\`\`\`typescript
// filepath: components/Calendar.tsx
"use client";
import { useState } from "react";
export function Calendar() {
  const [date, setDate] = useState(new Date());
  return <div className="p-4 bg-gray-800 rounded-lg">...</div>;
}
\`\`\`

\`\`\`typescript
// filepath: app/page.tsx
"use client";
import { Calendar } from "@/components/Calendar";
export default function Page() {
  return (
    <main className="min-h-screen p-8 bg-gray-900">
      <Calendar />
      <EventList />
    </main>
  );
}
\`\`\`

**CHECKLISTE VOR AUSGABE:**
✓ Hat JEDE Komponente ihre EIGENE Datei unter components/?
✓ Jede Datei beginnt mit \`// filepath: PFAD\`
✓ \`app/page.tsx\` importiert Komponenten mit \`@/components/Name\`
✓ **Für JEDEN Import existiert eine Datei?**
□ Alle Komponenten haben \`"use client";\` als ERSTE Zeile
□ Imports nutzen \`@/components/Name\` (nicht relative Pfade)

## 🔴 HÄUFIGSTER FEHLER - VERMEIDE IHN:
Wenn du \`import { X } from "@/components/X"\` schreibst,
MUSST du auch \`// filepath: components/X.tsx\` erstellen!

**ABSOLUT VERBOTEN:**
❌ App.tsx, main.tsx, index.tsx - EXISTIEREN NICHT IN NEXT.JS
❌ ReactDOM.createRoot() - VERBOTEN
❌ package.json, tsconfig.json - WERDEN AUTOMATISCH ERSTELLT`,
    reviewer: `
## 🌐 NETLIFY DEPLOYMENT - REVIEW FOKUS

**🚨 FATALE FEHLER (Build WIRD fehlschlagen):**
❌ MEHRERE \`export default\` in einer Datei → SOFORT AUFTEILEN!
❌ Context/Provider/Hooks in app/page.tsx → MUSS in components/!
❌ Alle Komponenten in einer Datei → MUSS aufgeteilt werden!
❌ "export const metadata" in "use client" Dateien
❌ src/main.tsx, src/App.tsx → FALSCHES FRAMEWORK

**STRUKTUR-CHECK:**
✅ app/page.tsx als Hauptseite vorhanden?
✅ "use client" am Anfang von Client-Komponenten?
✅ Imports mit @/components/X?`,
    security: `
## 🌐 NETLIFY DEPLOYMENT - SECURITY
Prüfe: Environment Variables über Netlify Dashboard, keine hardcodierten Secrets, API Route Security.`,
    executor: `
## 🌐 NETLIFY DEPLOYMENT
Build-Command: npm install && npm run build
Publish Directory: .next oder out`,
  },
  
  btp: {
    planner: `
## 🏢 DEPLOYMENT-ZIEL: SAP BTP
Das Projekt wird auf SAP Business Technology Platform deployed.`,
    coder: `
## 🏢 DEPLOYMENT-ZIEL: SAP BTP
Generiere SAP Fiori / SAPUI5 kompatiblen Code.`,
    reviewer: `
## 🏢 SAP BTP DEPLOYMENT - REVIEW FOKUS
Prüfe: MTA Struktur, xs-security.json, CDS Modelle, Fiori Elements Annotations.`,
    security: `
## 🏢 SAP BTP DEPLOYMENT - SECURITY
Prüfe: XSUAA Konfiguration, OAuth2 Scopes, Destination Security, Content Security Policy.`,
    executor: `
## 🏢 SAP BTP DEPLOYMENT
Build mit MTA Build Tool, Deploy über CF CLI.`,
  },
}

// Hilfsfunktion für Deployment-Target Prompt
export const getDeploymentTargetPrompt = (agent: string, target: DeploymentTarget): string => {
  if (!target || target === "github-only") return ""
  const targetPrompts = deploymentTargetPrompts[target]
  if (!targetPrompts) return ""
  return targetPrompts[agent as keyof typeof targetPrompts] || ""
}

// Iterations-spezifische Prompt-Erweiterungen
export const iterationPrompts = {
  planner: `
## ITERATIONS-MODUS AKTIV
Du arbeitest an einer BESTEHENDEN Anwendung. KRITISCHE REGELN:

1. **ANALYSE ZUERST**: Lies und verstehe den bestehenden Code VOLLSTÄNDIG
2. **MINIMALE ÄNDERUNGEN**: Ändere NUR was nötig ist
3. **STRUKTUR BEIBEHALTEN**: Behalte Dateistruktur und Naming bei
4. **KEINE NEUSCHREIBUNG**: Schreibe NIEMALS alles neu

AUSGABE-FORMAT FÜR ITERATIONEN:
{
  "iterationAnalysis": {
    "existingComponents": ["Liste der vorhandenen Komponenten"],
    "workingFeatures": ["Was funktioniert bereits"],
    "targetChanges": ["Was genau geändert werden muss"],
    "preserveCode": ["Was NICHT geändert werden darf"]
  },
  "tasks": [...]
}`,

  coder: `
## ITERATIONS-MODUS AKTIV
Du arbeitest an BESTEHENDEM Code. KRITISCHE REGELN:

1. **BESTEHENDEN CODE ANALYSIEREN**: Lies den existierenden Code sorgfältig
2. **INKREMENTELLE ÄNDERUNGEN**: Nur das ändern, was die Aufgabe erfordert
3. **STIL BEIBEHALTEN**: Verwende den gleichen Code-Stil wie im bestehenden Code
4. **TESTS NICHT BRECHEN**: Stelle sicher, dass bestehende Funktionalität erhalten bleibt

BEI ITERATIONEN:
- Gib die KOMPLETTE modifizierte Datei aus
- Markiere Änderungen mit Kommentaren: // GEÄNDERT: Beschreibung
- Behalte alle bestehenden Imports und Exports bei
- Füge neue Imports ans ENDE der Import-Liste

ANTI-PATTERNS (VERBOTEN):
- Komplette Neuschreibung von funktionierendem Code
- Ändern von Dateinamen oder Exportnamen
- Entfernen von Features die nicht Teil der Aufgabe sind`,

  reviewer: `
## ITERATIONS-REVIEW
Prüfe speziell bei Iterationen:
- Wurden NUR die angefragten Änderungen gemacht?
- Ist bestehende Funktionalität erhalten?
- Wurde der Code-Stil beibehalten?
- Sind unbeabsichtigte Seiteneffekte entstanden?`,
}

// Hole iteration-erweiterten Prompt
export const getIterationPrompt = (agent: "planner" | "coder" | "reviewer"): string => {
  return iterationPrompts[agent] || ""
}

// Dynamische Prompt-Hinweise basierend auf Kontext
export interface DynamicPromptContext {
  hasErrors?: boolean
  errorTypes?: string[]
  fileCount?: number
  isComplexProject?: boolean
  previousAgentFailed?: boolean
  iterationCount?: number
  userFeedback?: string
}

export const getDynamicPromptHints = (agent: AgentType, context: DynamicPromptContext): string => {
  const hints: string[] = []
  
  if (agent === "coder") {
    // Fehler-spezifische Hinweise
    if (context.hasErrors && context.errorTypes) {
      hints.push("\n## ⚠️ FEHLER-KONTEXT")
      if (context.errorTypes.includes("syntax")) {
        hints.push("- SYNTAX-FEHLER erkannt: Prüfe Klammern, Semikolons, JSX-Syntax")
      }
      if (context.errorTypes.includes("type")) {
        hints.push("- TYPE-FEHLER erkannt: Prüfe TypeScript-Typen und Interfaces")
      }
      if (context.errorTypes.includes("import")) {
        hints.push("- IMPORT-FEHLER erkannt: Prüfe Pfade und verfügbare Module")
      }
      if (context.errorTypes.includes("runtime")) {
        hints.push("- RUNTIME-FEHLER erkannt: Prüfe null/undefined, Array-Zugriffe")
      }
    }
    
    // Komplexitäts-Hinweise
    if (context.isComplexProject) {
      hints.push("\n## 📁 KOMPLEXES PROJEKT")
      hints.push("- Teile Code in logische Module auf")
      hints.push("- Verwende Custom Hooks für wiederverwendbare Logik")
      hints.push("- Halte Komponenten klein und fokussiert")
    }
    
    // Iterations-Hinweise
    if (context.iterationCount && context.iterationCount > 2) {
      hints.push("\n## 🔄 MEHRFACHE ITERATION")
      hints.push("- Du hast diesen Code bereits mehrfach bearbeitet")
      hints.push("- STOPP und analysiere das Grundproblem")
      hints.push("- Erwäge einen anderen Lösungsansatz")
    }
    
    // Vorheriger Agent fehlgeschlagen
    if (context.previousAgentFailed) {
      hints.push("\n## 🔧 VORHERIGER VERSUCH FEHLGESCHLAGEN")
      hints.push("- Der vorherige Coder-Versuch war nicht erfolgreich")
      hints.push("- Analysiere was schief ging")
      hints.push("- Wähle einen robusteren Ansatz")
    }
  }
  
  if (agent === "planner") {
    if (context.fileCount && context.fileCount > 5) {
      hints.push("\n## 📊 GROSSES PROJEKT")
      hints.push(`- ${context.fileCount} bestehende Dateien`)
      hints.push("- Plane gezielte, minimale Änderungen")
      hints.push("- Identifiziere Abhängigkeiten zwischen Dateien")
    }
    
    if (context.userFeedback) {
      hints.push("\n## 💬 USER-FEEDBACK")
      hints.push(`"${context.userFeedback}"`)
      hints.push("- Berücksichtige dieses Feedback in deiner Planung")
    }
  }
  
  if (agent === "reviewer") {
    if (context.hasErrors) {
      hints.push("\n## 🔍 BESONDERE AUFMERKSAMKEIT")
      hints.push("- Es wurden Fehler im vorherigen Output erkannt")
      hints.push("- Prüfe besonders auf: " + (context.errorTypes?.join(", ") || "unbekannte Fehler"))
    }
  }
  
  return hints.join("\n")
}

// Chain-of-Thought Prompt-Erweiterungen
export const chainOfThoughtPrompts = {
  planner: `
## STRUKTURIERTES DENKEN (Chain-of-Thought)
Gehe bei der Analyse IMMER diese Schritte durch:

**SCHRITT 1 - VERSTEHEN**
Was genau will der User erreichen?
- Kernziel: [...]
- Nebenziele: [...]
- Implizite Anforderungen: [...]

**SCHRITT 2 - ANALYSIEREN**
Was existiert bereits?
- Vorhandene Komponenten: [...]
- Aktuelle Funktionalität: [...]
- Technologie-Stack: [...]

**SCHRITT 3 - PLANEN**
Wie erreichen wir das Ziel?
- Notwendige Änderungen: [...]
- Reihenfolge der Schritte: [...]
- Potenzielle Risiken: [...]

**SCHRITT 4 - VALIDIEREN**
Ist der Plan vollständig?
- Alle Anforderungen abgedeckt? [Ja/Nein]
- Abhängigkeiten berücksichtigt? [Ja/Nein]
- Risiken minimiert? [Ja/Nein]`,

  coder: `
## STRUKTURIERTES VORGEHEN (Chain-of-Thought)
Bevor du Code schreibst, denke IMMER durch:

**1. PROBLEM-ANALYSE** (Mental, nicht ausgeben)
- Was genau soll implementiert werden?
- Welche Komponenten sind betroffen?
- Welche Edge-Cases gibt es?

**2. LÖSUNGS-DESIGN** (Mental, nicht ausgeben)
- Welcher Ansatz ist am saubersten?
- Welche Patterns passen hier?
- Wie halte ich den Code wartbar?

**3. IMPLEMENTATION** (Code ausgeben)
- Schreibe sauberen, lesbaren Code
- Kommentiere komplexe Logik
- Halte Funktionen klein und fokussiert

**4. SELBST-REVIEW** (Mental, nicht ausgeben)
- Kompiliert der Code?
- Sind alle Imports vorhanden?
- Behandle ich Fehler korrekt?`,

  reviewer: `
## STRUKTURIERTE REVIEW (Chain-of-Thought)
Prüfe den Code in dieser Reihenfolge:

**1. FUNKTIONALITÄT**
- Erfüllt der Code die Anforderungen?
- Funktioniert die Logik korrekt?
- Werden Edge-Cases behandelt?

**2. CODE-QUALITÄT**
- Ist der Code lesbar und wartbar?
- Werden Best Practices eingehalten?
- Gibt es Code-Duplikation?

**3. SICHERHEIT**
- Gibt es offensichtliche Sicherheitslücken?
- Werden User-Inputs validiert?
- Sind sensible Daten geschützt?

**4. PERFORMANCE**
- Gibt es offensichtliche Performance-Probleme?
- Werden unnötige Re-Renders vermieden?
- Sind teure Operationen optimiert?`,

  security: `
## STRUKTURIERTE SICHERHEITSANALYSE (Chain-of-Thought)
Analysiere systematisch:

**1. INPUT-VALIDIERUNG**
- Werden alle User-Inputs validiert?
- Gibt es Injection-Risiken (XSS, SQL)?
- Werden Datei-Uploads geprüft?

**2. AUTHENTIFIZIERUNG**
- Ist Auth korrekt implementiert?
- Werden Sessions sicher verwaltet?
- Gibt es Token-Schwachstellen?

**3. DATEN-SCHUTZ**
- Sind sensible Daten verschlüsselt?
- Werden Secrets sicher gespeichert?
- Gibt es Logging von sensiblen Daten?

**4. ABHÄNGIGKEITEN**
- Gibt es bekannte Vulnerabilities?
- Sind Dependencies aktuell?
- Werden nur vertrauenswürdige Quellen genutzt?`,
}

// Hole Chain-of-Thought Erweiterung
export const getChainOfThoughtPrompt = (agent: AgentType): string => {
  return chainOfThoughtPrompts[agent as keyof typeof chainOfThoughtPrompts] || ""
}

// Default Agent Configs
const createDefaultAgentConfig = (type: AgentType): AgentConfig => {
  const configs: Record<AgentType, Omit<AgentConfig, "tools">> = {
    planner: {
      id: "planner",
      name: "Planner Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.3,
      maxTokens: 2000,
      systemPrompt: environmentPrompts.sandpack.planner, // Default: Sandpack
      autoRetry: true,
      streaming: true,
      detailedLogging: false,
    },
    coder: {
      id: "coder",
      name: "Coder Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.1, // Niedriger für konsistentere Outputs
      maxTokens: 16000, // Erhöht für komplexe Apps
      systemPrompt: environmentPrompts.sandpack.coder, // Default: Sandpack
      autoRetry: true,
      streaming: true,
      detailedLogging: false,
    },
    reviewer: {
      id: "reviewer",
      name: "Reviewer Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.4,
      maxTokens: 2000,
      systemPrompt: `Du bist ein erfahrener Code-Reviewer mit Fokus auf Qualität, Sicherheit und Best Practices. Prüfe den generierten Code systematisch.

REVIEW-CHECKLISTE:
□ Code-Stil und Konventionen
□ TypeScript Typsicherheit
□ React Best Practices (Hooks, Lifecycle)
□ Performance (Memoization, Re-renders)
□ Sicherheit (XSS, Injection, Auth)
□ Fehlerbehandlung
□ Accessibility (a11y)
□ Testbarkeit
□ **DATEI-STRUKTUR**: Hat jede Komponente ihre eigene Datei?

PRÜFE BESONDERS:
- Sandpack: components/*.tsx + App.tsx
- WebContainer: src/components/*.tsx + src/App.tsx
- Next.js (Render/Netlify/Vercel): components/*.tsx + app/page.tsx

AUSGABE-FORMAT:
{
  "overallScore": 8,
  "summary": "Gesamteindruck",
  "issues": [
    {
      "severity": "critical|warning|info",
      "file": "path/to/file.tsx",
      "line": 42,
      "message": "Beschreibung des Problems",
      "suggestion": "Verbesserungsvorschlag"
    }
  ],
  "positives": ["Was gut gemacht wurde"],
  "recommendations": ["Allgemeine Empfehlungen"],
  "suggestedFixes": [
    {
      "type": "improvement|fix|refactor|performance",
      "title": "Kurzer Titel",
      "description": "Beschreibung der Änderung",
      "priority": "low|medium|high|critical",
      "filePath": "components/MyComponent.tsx",
      "newContent": "VOLLSTÄNDIGER korrigierter Code der Datei"
    }
  ]
}

WICHTIG FÜR HUMAN-IN-THE-LOOP:
- Wenn du Verbesserungen vorschlägst, füge sie in "suggestedFixes" ein
- Der Benutzer kann diese dann genehmigen oder ablehnen
- Generiere IMMER den VOLLSTÄNDIGEN Dateiinhalt in "newContent"`,
      autoRetry: true,
      streaming: true,
      detailedLogging: true,
    },
    security: {
      id: "security",
      name: "Security Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 4000,
      systemPrompt: `Du bist ein erfahrener Security-Experte und Penetration-Tester. Deine Aufgabe ist es, den generierten Code auf Sicherheitslücken zu prüfen und diese zu beheben.

SECURITY-CHECKLISTE:
□ Injection-Angriffe (SQL, XSS, Command Injection, NoSQL)
□ Authentifizierung & Autorisierung (Auth Bypass, Session Management)
□ Sensitive Data Exposure (Hardcoded Secrets, API Keys, Passwords)
□ Security Misconfiguration (CORS, Headers, Error Messages)
□ Insecure Dependencies (Known Vulnerabilities, Outdated Packages)
□ Input Validation (Sanitization, Type Checking)
□ Cryptographic Issues (Weak Algorithms, Insecure Random)
□ CSRF & SSRF Vulnerabilities
□ Rate Limiting & DoS Protection
□ Logging & Monitoring (Sensitive Data in Logs)

ANALYSE-PROZESS:
1. Scanne jeden Code-Block auf bekannte Vulnerability-Patterns
2. Prüfe Dependencies auf CVEs
3. Identifiziere hardcodierte Secrets
4. Analysiere Datenfluss für Injection-Risiken
5. Prüfe Auth/Authz Implementierung

AUSGABE-FORMAT:
{
  "securityScore": 7,
  "criticalIssues": [
    {
      "type": "XSS|SQL_INJECTION|HARDCODED_SECRET|AUTH_BYPASS|...",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.tsx",
      "line": 42,
      "code": "betroffener Code",
      "description": "Beschreibung der Schwachstelle",
      "impact": "Mögliche Auswirkungen",
      "fix": "Korrigierter Code"
    }
  ],
  "recommendations": ["Allgemeine Sicherheitsempfehlungen"],
  "passedChecks": ["Bestandene Prüfungen"]
}

WICHTIG FÜR HUMAN-IN-THE-LOOP:
Wenn du Sicherheitsprobleme findest, füge sie in "suggestedFixes" ein:
{
  "suggestedFixes": [
    {
      "type": "security",
      "title": "Kurzer Titel des Security-Fixes",
      "description": "Beschreibung der Sicherheitslücke und Lösung",
      "priority": "critical|high|medium|low",
      "filePath": "components/MyComponent.tsx",
      "newContent": "VOLLSTÄNDIGER korrigierter Code der Datei"
    }
  ]
}

Der Benutzer kann diese Fixes dann genehmigen oder ablehnen.
Generiere IMMER den VOLLSTÄNDIGEN Dateiinhalt in "newContent".

Alternativ kannst du auch direkt Code generieren mit:
\`\`\`typescript
// filepath: path/to/fixed/file.tsx
// SECURITY FIX: Beschreibung
[korrigierter Code]
\`\`\``,
      autoRetry: true,
      streaming: true,
      detailedLogging: true,
    },
    executor: {
      id: "executor",
      name: "Executor Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.1,
      maxTokens: 1500,
      systemPrompt: `Du bist ein DevOps-Experte und führst Build- und Test-Prozesse aus. Deine Aufgabe ist es, den Code zu validieren und für die Auslieferung vorzubereiten.

AUFGABEN:
1. Tests ausführen und Ergebnisse analysieren
2. Build-Prozess durchführen
3. Artefakte erstellen
4. Deployment vorbereiten

AUSGABE-FORMAT:
{
  "tests": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "skipped": 0,
    "coverage": 85,
    "details": [...]
  },
  "build": {
    "success": true,
    "duration": "2.3s",
    "size": "145KB",
    "warnings": []
  },
  "artifacts": ["dist/bundle.js", "dist/styles.css"],
  "readyForDeploy": true,
  "notes": "Zusätzliche Hinweise"
}`,
      autoRetry: true,
      streaming: false,
      detailedLogging: true,
    },
  }

  return {
    ...configs[type],
    tools: defaultTools[type],
  }
}

// Default Global Config
const defaultGlobalConfig: GlobalConfig = {
  defaultModel: "gpt-4o",
  autoReview: true,
  streaming: true,
  theme: "dark",
  language: "de",
  maxConcurrentAgents: 1,
  saveHistory: true,
  openaiApiKey: "",
  anthropicApiKey: "",
  openrouterApiKey: "",
  renderApiKey: "",
  vercelToken: "",
  githubToken: "",
  targetEnvironment: "sandpack",
  enablePromptEnhancement: true,
}

// Store Interface
interface AgentStore {
  // State
  globalConfig: GlobalConfig
  agentConfigs: Record<AgentType, AgentConfig>
  currentProject: Project | null
  projects: Project[]
  messages: Message[]
  workflowSteps: WorkflowStep[]
  logs: LogEntry[]
  isProcessing: boolean
  currentAgent: AgentType | null
  error: string | null
  generatedFiles: ProjectFile[] // Projektunabhängiger Dateispeicher
  
  // Undo/Redo History
  fileHistory: ProjectFile[][] // Historie der Dateizustände
  historyIndex: number // Aktueller Index in der Historie
  maxHistorySize: number // Maximale Größe der Historie
  
  // Marketplace State
  installedAgents: string[] // IDs der installierten Agenten
  workflowOrder: string[] // Reihenfolge der Agenten im Workflow
  installedMcpServers: string[] // IDs der installierten MCP Server
  customAgentConfigs: Record<string, CustomAgentConfig> // Konfiguration für Custom-Agenten
  
  // Saved Workflows State
  savedWorkflows: WorkflowGraph[] // Gespeicherte Workflows
  activeWorkflow: WorkflowGraph | null // Aktuell aktiver Workflow
  workflowExecutionState: WorkflowExecutionState | null // Ausführungsstatus

  // Global Config Actions
  updateGlobalConfig: (config: Partial<GlobalConfig>) => void
  
  // Marketplace Actions
  installAgent: (agentId: string) => void
  uninstallAgent: (agentId: string) => void
  setWorkflowOrder: (order: string[]) => void
  installMcpServer: (serverId: string) => void
  uninstallMcpServer: (serverId: string) => void

  // Agent Config Actions
  updateAgentConfig: (agentType: AgentType, config: Partial<AgentConfig>) => void
  resetAgentConfig: (agentType: AgentType) => void
  toggleAgentTool: (agentType: AgentType, toolId: string) => void
  
  // Custom Agent Config Actions
  updateCustomAgentConfig: (agentId: string, config: Partial<CustomAgentConfig>) => void
  resetCustomAgentConfig: (agentId: string) => void

  // Project Actions
  createProject: (name: string, description: string) => Project
  loadProject: (projectId: string) => void
  saveProject: () => void
  deleteProject: (projectId: string) => void

  // Message Actions
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void
  setMessages: (messages: Message[]) => void
  clearMessages: () => void

  // Workflow Actions
  setWorkflowSteps: (steps: WorkflowStep[]) => void
  updateWorkflowStep: (stepId: string, updates: Partial<WorkflowStep>) => void
  clearWorkflow: () => void

  // Log Actions
  addLog: (log: Omit<LogEntry, "id" | "timestamp">) => void
  clearLogs: () => void

  // Processing Actions
  setIsProcessing: (isProcessing: boolean) => void
  setCurrentAgent: (agent: AgentType | null) => void
  setError: (error: string | null) => void

  // File Actions
  addFile: (file: Omit<ProjectFile, "id" | "createdAt" | "modifiedAt">) => void
  updateFile: (fileId: string, content: string) => void
  updateFileByPath: (path: string, content: string, language?: string) => void
  deleteFile: (fileId: string) => void
  getFiles: () => ProjectFile[]
  setGeneratedFiles: (files: ProjectFile[]) => void
  clearFiles: () => void
  
  // Undo/Redo Actions
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  saveToHistory: () => void

  // Suggestion Actions (Human-in-the-Loop)
  pendingSuggestions: AgentSuggestion[]
  addSuggestion: (suggestion: Omit<AgentSuggestion, "id" | "createdAt" | "status">) => void
  approveSuggestion: (suggestionId: string) => void
  rejectSuggestion: (suggestionId: string) => void
  applySuggestion: (suggestionId: string) => void
  clearSuggestions: () => void

  // Export/Import
  exportConfig: () => string
  importConfig: (json: string) => void
  
  // Workflow Actions
  saveWorkflow: (workflow: WorkflowGraph) => void
  deleteWorkflow: (workflowId: string) => void
  setActiveWorkflow: (workflow: WorkflowGraph | null) => void
  setWorkflowExecutionState: (state: WorkflowExecutionState | null) => void
  getSavedWorkflows: () => WorkflowGraph[]
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      // Initial State
      globalConfig: defaultGlobalConfig,
      agentConfigs: {
        planner: createDefaultAgentConfig("planner"),
        coder: createDefaultAgentConfig("coder"),
        reviewer: createDefaultAgentConfig("reviewer"),
        security: createDefaultAgentConfig("security"),
        executor: createDefaultAgentConfig("executor"),
      },
      currentProject: null,
      projects: [],
      messages: [],
      workflowSteps: [],
      logs: [],
      isProcessing: false,
      currentAgent: null,
      error: null,
      generatedFiles: [],
      pendingSuggestions: [],
      
      // Undo/Redo History
      fileHistory: [],
      historyIndex: -1,
      maxHistorySize: 20,
      
      // Marketplace State
      installedAgents: ["planner", "coder", "reviewer", "security", "executor"],
      workflowOrder: ["planner", "coder", "reviewer", "security", "executor"],
      installedMcpServers: [],
      customAgentConfigs: {}, // Konfiguration für Custom-Agenten
      
      // Workflow State
      savedWorkflows: [],
      activeWorkflow: null,
      workflowExecutionState: null,

      // Global Config Actions
      updateGlobalConfig: (config) =>
        set((state) => ({
          globalConfig: { ...state.globalConfig, ...config },
        })),

      // Marketplace Actions
      installAgent: (agentId) =>
        set((state) => {
          if (state.installedAgents.includes(agentId)) return state
          const executorIndex = state.workflowOrder.indexOf("executor")
          const newOrder = [...state.workflowOrder]
          if (executorIndex >= 0) {
            newOrder.splice(executorIndex, 0, agentId)
          } else {
            newOrder.push(agentId)
          }
          return {
            installedAgents: [...state.installedAgents, agentId],
            workflowOrder: newOrder,
          }
        }),

      uninstallAgent: (agentId) =>
        set((state) => {
          // Core agents können nicht entfernt werden
          const coreAgents = ["planner", "coder", "reviewer", "executor"]
          if (coreAgents.includes(agentId)) return state
          return {
            installedAgents: state.installedAgents.filter(id => id !== agentId),
            workflowOrder: state.workflowOrder.filter(id => id !== agentId),
          }
        }),

      setWorkflowOrder: (order) => set({ workflowOrder: order }),

      installMcpServer: (serverId) =>
        set((state) => {
          if (state.installedMcpServers.includes(serverId)) return state
          return { installedMcpServers: [...state.installedMcpServers, serverId] }
        }),

      uninstallMcpServer: (serverId) =>
        set((state) => ({
          installedMcpServers: state.installedMcpServers.filter(id => id !== serverId),
        })),

      // Agent Config Actions
      updateAgentConfig: (agentType, config) =>
        set((state) => ({
          agentConfigs: {
            ...state.agentConfigs,
            [agentType]: { ...state.agentConfigs[agentType], ...config },
          },
        })),

      resetAgentConfig: (agentType) =>
        set((state) => ({
          agentConfigs: {
            ...state.agentConfigs,
            [agentType]: createDefaultAgentConfig(agentType),
          },
        })),

      toggleAgentTool: (agentType, toolId) =>
        set((state) => ({
          agentConfigs: {
            ...state.agentConfigs,
            [agentType]: {
              ...state.agentConfigs[agentType],
              tools: state.agentConfigs[agentType].tools.map((tool) =>
                tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool,
              ),
            },
          },
        })),

      // Custom Agent Config Actions
      updateCustomAgentConfig: (agentId, config) =>
        set((state) => ({
          customAgentConfigs: {
            ...state.customAgentConfigs,
            [agentId]: { ...state.customAgentConfigs[agentId], ...config },
          },
        })),

      resetCustomAgentConfig: (agentId) =>
        set((state) => {
          const newConfigs = { ...state.customAgentConfigs }
          delete newConfigs[agentId]
          return { customAgentConfigs: newConfigs }
        }),

      // Project Actions
      createProject: (name, description) => {
        const project: Project = {
          id: crypto.randomUUID(),
          name,
          description,
          createdAt: new Date(),
          updatedAt: new Date(),
          files: [],
          messages: [],
          workflowHistory: [],
          agentConfigs: get().agentConfigs,
        }
        set((state) => ({
          projects: [...state.projects, project],
          currentProject: project,
          messages: [],
          workflowSteps: [],
          logs: [],
        }))
        return project
      },

      loadProject: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId)
        if (project) {
          set({
            currentProject: project,
            messages: project.messages || [],
            agentConfigs: project.agentConfigs,
            generatedFiles: project.files || [],
            workflowSteps: [],
          })
        }
      },

      saveProject: () => {
        const { currentProject, messages, workflowSteps, agentConfigs } = get()
        if (currentProject) {
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === currentProject.id
                ? {
                    ...p,
                    messages,
                    workflowHistory: [...p.workflowHistory, workflowSteps],
                    agentConfigs,
                    updatedAt: new Date(),
                  }
                : p,
            ),
          }))
        }
      },

      deleteProject: (projectId) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        })),

      // Message Actions
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, { ...message, id: crypto.randomUUID(), timestamp: new Date() }],
        })),

      setMessages: (messages) => set({ messages }),

      clearMessages: () => set({ messages: [] }),

      // Workflow Actions
      setWorkflowSteps: (steps) => set({ workflowSteps: steps }),

      updateWorkflowStep: (stepId, updates) =>
        set((state) => ({
          workflowSteps: state.workflowSteps.map((step) => (step.id === stepId ? { ...step, ...updates } : step)),
        })),

      clearWorkflow: () => set({ workflowSteps: [] }),

      // Log Actions
      addLog: (log) =>
        set((state) => ({
          logs: [...state.logs, { ...log, id: crypto.randomUUID(), timestamp: new Date() }],
        })),

      clearLogs: () => set({ logs: [] }),

      // Processing Actions
      setIsProcessing: (isProcessing) => set({ isProcessing }),
      setCurrentAgent: (agent) => set({ currentAgent: agent }),
      setError: (error) => set({ error }),

      // File Actions - speichert in generatedFiles UND currentProject falls vorhanden
      // Bei gleichem Pfad wird die Datei aktualisiert (upsert)
      addFile: (file) =>
        set((state) => {
          // Normalisiere Pfad für Vergleich (entferne führende Slashes, src/, etc.)
          const normalizePath = (p: string) => {
            let normalized = p.replace(/^\/+/, "").replace(/^src\//, "")
            // Extrahiere nur den Dateinamen für App.tsx Vergleich
            const fileName = normalized.split("/").pop() || normalized
            // Wenn es App.tsx ist, vergleiche nur den Dateinamen
            if (fileName === "App.tsx" || fileName === "App.jsx") {
              return fileName
            }
            return normalized
          }
          
          const normalizedNewPath = normalizePath(file.path)
          const existingFileIndex = state.generatedFiles.findIndex(f => 
            normalizePath(f.path) === normalizedNewPath
          )
          
          if (existingFileIndex >= 0) {
            // Datei existiert - aktualisieren
            const updatedFiles = [...state.generatedFiles]
            updatedFiles[existingFileIndex] = {
              ...updatedFiles[existingFileIndex],
              content: file.content,
              language: file.language,
              status: "modified" as const,
              modifiedAt: new Date(),
            }
            
            const updatedProjectFiles = state.currentProject 
              ? state.currentProject.files.map(f => 
                  normalizePath(f.path) === normalizedNewPath 
                    ? { ...f, content: file.content, language: file.language, status: "modified" as const, modifiedAt: new Date() }
                    : f
                )
              : []
            
            return {
              generatedFiles: updatedFiles,
              currentProject: state.currentProject
                ? { ...state.currentProject, files: updatedProjectFiles }
                : null,
            }
          }
          
          // Neue Datei
          const newFile = {
            ...file,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            modifiedAt: new Date(),
          }
          return {
            generatedFiles: [...state.generatedFiles, newFile],
            currentProject: state.currentProject
              ? {
                  ...state.currentProject,
                  files: [...state.currentProject.files, newFile],
                }
              : null,
          }
        }),

      updateFile: (fileId, content) =>
        set((state) => ({
          generatedFiles: state.generatedFiles.map((f) =>
            f.id === fileId ? { ...f, content, status: "modified" as const, modifiedAt: new Date() } : f,
          ),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: state.currentProject.files.map((f) =>
                  f.id === fileId ? { ...f, content, status: "modified" as const, modifiedAt: new Date() } : f,
                ),
              }
            : null,
        })),

      updateFileByPath: (path: string, content: string, language?: string) =>
        set((state) => {
          const existingFile = state.generatedFiles.find(f => f.path === path)
          if (existingFile) {
            return {
              generatedFiles: state.generatedFiles.map((f) =>
                f.path === path ? { ...f, content, language: language || f.language, status: "modified" as const, modifiedAt: new Date() } : f,
              ),
              currentProject: state.currentProject
                ? {
                    ...state.currentProject,
                    files: state.currentProject.files.map((f) =>
                      f.path === path ? { ...f, content, language: language || f.language, status: "modified" as const, modifiedAt: new Date() } : f,
                    ),
                  }
                : null,
            }
          }
          // Datei existiert nicht - erstelle neue
          const newFile = {
            id: crypto.randomUUID(),
            path,
            content,
            language: language || "typescript",
            status: "created" as const,
            createdAt: new Date(),
            modifiedAt: new Date(),
          }
          return {
            generatedFiles: [...state.generatedFiles, newFile],
            currentProject: state.currentProject
              ? {
                  ...state.currentProject,
                  files: [...state.currentProject.files, newFile],
                }
              : null,
          }
        }),

      deleteFile: (fileId) =>
        set((state) => ({
          generatedFiles: state.generatedFiles.filter((f) => f.id !== fileId),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: state.currentProject.files.filter((f) => f.id !== fileId),
              }
            : null,
        })),

      // Gibt generatedFiles zurück (projektunabhängig)
      getFiles: () => get().generatedFiles,

      setGeneratedFiles: (files) =>
        set((state) => ({
          generatedFiles: files,
          currentProject: state.currentProject
            ? { ...state.currentProject, files }
            : null,
        })),

      clearFiles: () =>
        set((state) => ({
          generatedFiles: [],
          currentProject: state.currentProject
            ? { ...state.currentProject, files: [] }
            : null,
        })),

      // Undo/Redo Actions
      saveToHistory: () =>
        set((state) => {
          const currentFiles = JSON.parse(JSON.stringify(state.generatedFiles))
          // Schneide die Historie ab wenn wir nicht am Ende sind
          const newHistory = state.fileHistory.slice(0, state.historyIndex + 1)
          newHistory.push(currentFiles)
          // Begrenze die Größe
          if (newHistory.length > state.maxHistorySize) {
            newHistory.shift()
          }
          return {
            fileHistory: newHistory,
            historyIndex: newHistory.length - 1,
          }
        }),

      undo: () =>
        set((state) => {
          if (state.historyIndex <= 0) return state
          const newIndex = state.historyIndex - 1
          const previousFiles = JSON.parse(JSON.stringify(state.fileHistory[newIndex]))
          return {
            generatedFiles: previousFiles,
            historyIndex: newIndex,
            currentProject: state.currentProject
              ? { ...state.currentProject, files: previousFiles }
              : null,
          }
        }),

      redo: () =>
        set((state) => {
          if (state.historyIndex >= state.fileHistory.length - 1) return state
          const newIndex = state.historyIndex + 1
          const nextFiles = JSON.parse(JSON.stringify(state.fileHistory[newIndex]))
          return {
            generatedFiles: nextFiles,
            historyIndex: newIndex,
            currentProject: state.currentProject
              ? { ...state.currentProject, files: nextFiles }
              : null,
          }
        }),

      canUndo: () => get().historyIndex > 0,
      canRedo: () => get().historyIndex < get().fileHistory.length - 1,

      // Export/Import
      exportConfig: () => {
        const { globalConfig, agentConfigs } = get()
        return JSON.stringify({ globalConfig, agentConfigs }, null, 2)
      },

      importConfig: (json) => {
        try {
          const config = JSON.parse(json)
          if (config.globalConfig) {
            set({ globalConfig: config.globalConfig })
          }
          if (config.agentConfigs) {
            set({ agentConfigs: config.agentConfigs })
          }
        } catch (e) {
          console.error("Failed to import config:", e)
        }
      },

      // Suggestion Actions (Human-in-the-Loop)
      addSuggestion: (suggestion) =>
        set((state) => ({
          pendingSuggestions: [
            ...state.pendingSuggestions,
            {
              ...suggestion,
              id: crypto.randomUUID(),
              status: "pending" as const,
              createdAt: new Date(),
            },
          ],
        })),

      approveSuggestion: (suggestionId) =>
        set((state) => ({
          pendingSuggestions: state.pendingSuggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "approved" as const } : s
          ),
        })),

      rejectSuggestion: (suggestionId) =>
        set((state) => ({
          pendingSuggestions: state.pendingSuggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "rejected" as const } : s
          ),
        })),

      applySuggestion: (suggestionId) => {
        const state = get()
        const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
        if (!suggestion || suggestion.status !== "approved") return

        // Wende alle Änderungen an
        let appliedChanges = 0
        for (const change of suggestion.suggestedChanges) {
          state.updateFileByPath(change.filePath, change.newContent)
          appliedChanges++
        }

        // Markiere als angewendet
        set((state) => ({
          pendingSuggestions: state.pendingSuggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "applied" as const } : s
          ),
        }))

        // Füge Erfolgsmeldung im Chat hinzu
        const affectedFilesText = suggestion.affectedFiles.length > 0 
          ? `\n\n**Betroffene Dateien:** ${suggestion.affectedFiles.join(', ')}`
          : ''
        const changesText = appliedChanges > 0 
          ? `\n\n**Änderungen:** ${appliedChanges} Datei(en) aktualisiert`
          : ''
        
        // Unterschiedliche Meldung je nachdem ob Code-Änderungen vorhanden waren
        const messageContent = appliedChanges > 0
          ? `✅ **Verbesserungsvorschlag umgesetzt**\n\n**${suggestion.title}**\n\n${suggestion.description}${affectedFilesText}${changesText}\n\n_Der Vorschlag vom ${suggestion.agent}-Agent wurde erfolgreich angewendet._`
          : `✅ **Verbesserungsvorschlag angenommen**\n\n**${suggestion.title}**\n\n${suggestion.description}\n\n<!-- IMPLEMENT_SUGGESTION:${suggestion.title} -->`
        
        state.addMessage({
          role: "assistant",
          content: messageContent,
          agent: suggestion.agent as "planner" | "coder" | "reviewer" | "security" | "executor",
        })
      },

      clearSuggestions: () =>
        set({ pendingSuggestions: [] }),

      // Workflow Actions
      saveWorkflow: (workflow) =>
        set((state) => {
          const existingIndex = state.savedWorkflows.findIndex(w => w.id === workflow.id)
          if (existingIndex >= 0) {
            // Update existing
            const updated = [...state.savedWorkflows]
            updated[existingIndex] = { ...workflow, updatedAt: new Date() }
            return { savedWorkflows: updated }
          } else {
            // Add new
            return { savedWorkflows: [...state.savedWorkflows, { ...workflow, createdAt: new Date(), updatedAt: new Date() }] }
          }
        }),

      deleteWorkflow: (workflowId) =>
        set((state) => ({
          savedWorkflows: state.savedWorkflows.filter(w => w.id !== workflowId),
          activeWorkflow: state.activeWorkflow?.id === workflowId ? null : state.activeWorkflow,
        })),

      setActiveWorkflow: (workflow) =>
        set({ activeWorkflow: workflow }),

      setWorkflowExecutionState: (executionState) =>
        set({ workflowExecutionState: executionState }),

      getSavedWorkflows: () => get().savedWorkflows,
    }),
    {
      name: "agentforge-storage",
      partialize: (state) => ({
        globalConfig: state.globalConfig,
        agentConfigs: state.agentConfigs,
        projects: state.projects,
        savedWorkflows: state.savedWorkflows,
      }),
    },
  ),
)
