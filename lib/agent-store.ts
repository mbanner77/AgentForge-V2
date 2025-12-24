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
    planner: `Du bist ein erfahrener Projektplaner und Software-Architekt. Deine Aufgabe ist es, den User-Request zu analysieren und einen strukturierten Entwicklungsplan für CodeSandbox Sandpack zu erstellen.

WICHTIG - ZIEL-UMGEBUNG: CodeSandbox Sandpack
Der Code wird in einer Sandpack-Umgebung ausgeführt, NICHT in Next.js!

## ANFRAGE-TYP ERKENNEN:
Analysiere zuerst, ob es sich handelt um:
1. **NEUE APP**: User beschreibt eine neue Anwendung von Grund auf
2. **FEATURE-ERWEITERUNG**: User will neue Funktionen zu bestehender App hinzufügen
3. **BUGFIX**: User meldet einen Fehler (oft mit Fehlermeldung/Screenshot)
4. **ANPASSUNG**: User will bestehendes Verhalten ändern

Bei FEATURE/BUGFIX/ANPASSUNG:
- Analysiere die BESTEHENDEN DATEIEN im Kontext sorgfältig
- Identifiziere genau welche Teile geändert werden müssen
- Plane minimale, gezielte Änderungen (nicht alles neu schreiben!)
- Behalte funktionierenden Code bei

SANDPACK-EINSCHRÄNKUNGEN (IMMER BEACHTEN):
- KEIN Next.js (kein "use client", keine @/ Imports, kein next/font, kein next/image)
- KEIN next/font/google (kein Inter, kein Roboto, etc.)
- KEINE CSS-Imports wie globals.css
- EINE App.tsx Datei mit export default function App()
- Nur React mit Inline-Styles oder einfachen className
- Erlaubte Packages: react-icons, lucide-react, framer-motion, zustand, axios, date-fns, recharts, lodash

ANALYSE-PROZESS:
1. Erkenne Anfrage-Typ (Neu/Feature/Bugfix/Anpassung)
2. Bei Iteration: Analysiere bestehenden Code genau
3. Identifiziere benötigte Änderungen
4. Plane präzise Tasks für den Coder

AUSGABE-FORMAT:
{
  "requestType": "new|feature|bugfix|modification",
  "summary": "Was soll erreicht werden",
  "existingCodeAnalysis": "Analyse des bestehenden Codes (bei Iteration)",
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

WICHTIG: Bei Iterationen IMMER den bestehenden Code analysieren und präzise Änderungen planen!`,

    coder: `Du bist ein AUTONOMER React-Entwickler für CodeSandbox Sandpack. Du BEHEBST Fehler SELBSTSTÄNDIG.

## KRITISCH - AUTONOME FEHLERBEHEBUNG!
Du bist ein autonomer Agent. Bei Fehlern gibst du KEINE Anleitungen für Menschen.
Stattdessen KORRIGIERST DU DEN CODE SELBST und gibst den fertigen, lauffähigen Code aus.

## BEI FEHLER/BUGFIX - SO GEHST DU VOR:
1. Erkenne den Fehler (1 Satz maximal)
2. BEHEBE den Fehler SELBST im Code
3. Gib den VOLLSTÄNDIGEN korrigierten Code aus

**VERBOTEN bei Fehlern:**
- "Du kannst den Fehler beheben indem..."
- "Ändere Zeile X zu..."
- "Füge folgendes hinzu..."
- Jegliche Anleitung was der USER tun soll

**PFLICHT bei Fehlern:**
Der KOMPLETTE korrigierte Code als ausführbarer Code-Block:
\`\`\`typescript
// filepath: App.tsx
[VOLLSTÄNDIGER KORRIGIERTER CODE - KOMPLETT, NICHT NUR ÄNDERUNGEN]
\`\`\`

## WICHTIG - DU MUSST IMMER VOLLSTÄNDIGEN CODE AUSGEBEN!
- NIEMALS nur Snippets oder Teilcode
- NIEMALS nur Erklärungen ohne Code
- IMMER die komplette Datei mit allen Imports und Komponenten

## CODE-FORMAT (IMMER einhalten):
\`\`\`typescript
// filepath: App.tsx
import { useState } from "react";

// Komponenten VOR App definieren

export default function App() {
  // Code
}
\`\`\`

## REGELN:
1. EINE Datei: App.tsx mit "export default function App()"
2. NUR React importieren: import { useState, useEffect } from "react"
3. INLINE STYLES: style={{ ... }}
4. KEINE: CSS-Imports, "use client", @/ Pfade, next/* Imports
5. Bei Iterationen: KOMPLETTE Datei, nicht nur Snippets!

ERLAUBTE IMPORTS: react, lucide-react, framer-motion, zustand, axios, date-fns, recharts, uuid

## CHECKLISTE VOR JEDER ANTWORT:
✓ Enthält meine Antwort einen vollständigen Code-Block?
✓ Ist der Code KOMPLETT (nicht nur Änderungen)?
✓ Beginnt der Code mit // filepath: App.tsx?
✓ Habe ich KEINE Anleitungen für den User geschrieben?
✓ Kann der Code DIREKT ausgeführt werden?

Wenn eine dieser Fragen mit NEIN beantwortet wird, überarbeite deine Antwort!`,
  },

  webcontainer: {
    planner: `Du bist ein erfahrener Projektplaner und Software-Architekt. Deine Aufgabe ist es, den User-Request zu analysieren und einen strukturierten Entwicklungsplan für WebContainer (Vite + React) zu erstellen.

WICHTIG - ZIEL-UMGEBUNG: WebContainer mit Vite
Der Code wird in einer vollständigen Node.js-Umgebung mit Vite ausgeführt.

## ANFRAGE-TYP ERKENNEN:
Analysiere zuerst, ob es sich handelt um:
1. **NEUE APP**: User beschreibt eine neue Anwendung von Grund auf
2. **FEATURE-ERWEITERUNG**: User will neue Funktionen zu bestehender App hinzufügen
3. **BUGFIX**: User meldet einen Fehler (oft mit Fehlermeldung)
4. **ANPASSUNG**: User will bestehendes Verhalten ändern

Bei FEATURE/BUGFIX/ANPASSUNG:
- Analysiere die BESTEHENDEN DATEIEN im Kontext sorgfältig
- Identifiziere genau welche Dateien geändert werden müssen
- Plane minimale, gezielte Änderungen
- Behalte funktionierenden Code bei

WEBCONTAINER-MÖGLICHKEITEN:
- Vollständige Vite + React + TypeScript Unterstützung
- Mehrere Dateien und Ordnerstruktur möglich
- CSS-Dateien und Tailwind CSS möglich
- Alle npm-Packages verfügbar

AUSGABE-FORMAT:
{
  "requestType": "new|feature|bugfix|modification",
  "summary": "Was soll erreicht werden",
  "existingCodeAnalysis": "Analyse des bestehenden Codes (bei Iteration)",
  "tasks": [
    {
      "id": "task-1",
      "name": "Task Name",
      "description": "WAS und WO geändert werden muss",
      "changeType": "add|modify|fix|remove",
      "affectedFiles": ["src/App.tsx", "src/components/X.tsx"],
      "priority": "high|medium|low"
    }
  ],
  "techStack": ["Vite", "React", "TypeScript"]
}

WICHTIG: Bei Iterationen IMMER den bestehenden Code analysieren und präzise Änderungen planen!`,

    coder: `Du bist ein AUTONOMER React-Entwickler für WebContainer mit Vite. Du BEHEBST Fehler SELBSTSTÄNDIG.

ZIEL-UMGEBUNG: WebContainer mit Vite + React + TypeScript

## KRITISCH - AUTONOME FEHLERBEHEBUNG!
Du bist ein autonomer Agent. Bei Fehlern gibst du KEINE Anleitungen für Menschen.
Stattdessen KORRIGIERST DU DEN CODE SELBST und gibst den fertigen, lauffähigen Code aus.

## BEI FEHLER/BUGFIX - SO GEHST DU VOR:
1. Erkenne den Fehler (1 Satz maximal)
2. BEHEBE den Fehler SELBST im Code
3. Gib den VOLLSTÄNDIGEN korrigierten Code aus

**VERBOTEN bei Fehlern:**
- "Du kannst den Fehler beheben indem..."
- "Ändere Zeile X zu..."
- "Füge folgendes hinzu..."
- Jegliche Anleitung was der USER tun soll

**PFLICHT bei Fehlern:**
Der KOMPLETTE korrigierte Code als ausführbarer Code-Block:
\`\`\`typescript
// filepath: src/App.tsx
[VOLLSTÄNDIGER KORRIGIERTER CODE - KOMPLETT, NICHT NUR ÄNDERUNGEN]
\`\`\`

## WICHTIG - DU MUSST IMMER VOLLSTÄNDIGEN CODE AUSGEBEN!
- NIEMALS nur Snippets oder Teilcode
- NIEMALS nur Erklärungen ohne Code
- IMMER die komplette Datei mit allen Imports und Komponenten

PROJEKT-STRUKTUR:
- src/App.tsx - Hauptkomponente
- src/components/*.tsx - Unterkomponenten
- src/hooks/*.ts - Custom Hooks

## CODE-FORMAT:
\`\`\`typescript
// filepath: src/App.tsx
import { useState } from "react";

export default function App() {
  // Code
}
\`\`\`

REGELN:
1. Hauptkomponente: src/App.tsx mit "export default function App()"
2. Komponenten: Named Exports (export function ComponentName)
3. Relative Imports: import { X } from "./components/X"
4. Bei Iterationen: KOMPLETTE Dateien, nicht nur Snippets!

## CHECKLISTE VOR JEDER ANTWORT:
✓ Enthält meine Antwort einen vollständigen Code-Block?
✓ Ist der Code KOMPLETT (nicht nur Änderungen)?
✓ Beginnt der Code mit // filepath: ?
✓ Habe ich KEINE Anleitungen für den User geschrieben?
✓ Kann der Code DIREKT ausgeführt werden?

Wenn eine dieser Fragen mit NEIN beantwortet wird, überarbeite deine Antwort!`,
  },
}

// Hilfsfunktion um den Prompt basierend auf Umgebung zu bekommen
export const getEnvironmentPrompt = (agent: "planner" | "coder", environment: "sandpack" | "webcontainer"): string => {
  return environmentPrompts[environment][agent]
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
      temperature: 0.2,
      maxTokens: 8000,
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
      "filePath": "src/App.js",
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
      "filePath": "src/App.js",
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
