"use client"

// Internationalization (i18n) System

export type Locale = "de" | "en"

export interface TranslationKeys {
  // Common
  "common.save": string
  "common.cancel": string
  "common.delete": string
  "common.edit": string
  "common.create": string
  "common.loading": string
  "common.error": string
  "common.success": string
  "common.back": string
  "common.next": string
  "common.previous": string
  "common.search": string
  "common.filter": string
  "common.export": string
  "common.import": string
  "common.settings": string
  "common.close": string
  "common.confirm": string
  "common.yes": string
  "common.no": string

  // Auth
  "auth.login": string
  "auth.logout": string
  "auth.username": string
  "auth.password": string
  "auth.loginButton": string
  "auth.loginError": string
  "auth.logoutSuccess": string

  // Navigation
  "nav.home": string
  "nav.builder": string
  "nav.admin": string
  "nav.settings": string
  "nav.docs": string
  "nav.history": string
  "nav.logs": string

  // Builder
  "builder.newProject": string
  "builder.saveProject": string
  "builder.exportProject": string
  "builder.deploy": string
  "builder.workflow": string
  "builder.designer": string
  "builder.knowledgeBase": string
  "builder.chat.placeholder": string
  "builder.chat.welcome": string

  // Agents
  "agents.planner": string
  "agents.coder": string
  "agents.reviewer": string
  "agents.security": string
  "agents.executor": string

  // Workflow
  "workflow.start": string
  "workflow.stop": string
  "workflow.pause": string
  "workflow.resume": string
  "workflow.complete": string
  "workflow.failed": string
  "workflow.running": string

  // Settings
  "settings.general": string
  "settings.apiKeys": string
  "settings.agents": string
  "settings.appearance": string
  "settings.advanced": string
  "settings.language": string
  "settings.theme": string
  "settings.defaultModel": string

  // Admin
  "admin.marketplace": string
  "admin.mcpServers": string
  "admin.users": string
  "admin.install": string
  "admin.uninstall": string
  "admin.installed": string

  // Errors
  "error.generic": string
  "error.notFound": string
  "error.unauthorized": string
  "error.apiKeyMissing": string
  "error.networkError": string
}

const translations: Record<Locale, TranslationKeys> = {
  de: {
    // Common
    "common.save": "Speichern",
    "common.cancel": "Abbrechen",
    "common.delete": "Löschen",
    "common.edit": "Bearbeiten",
    "common.create": "Erstellen",
    "common.loading": "Laden...",
    "common.error": "Fehler",
    "common.success": "Erfolg",
    "common.back": "Zurück",
    "common.next": "Weiter",
    "common.previous": "Zurück",
    "common.search": "Suchen",
    "common.filter": "Filtern",
    "common.export": "Exportieren",
    "common.import": "Importieren",
    "common.settings": "Einstellungen",
    "common.close": "Schließen",
    "common.confirm": "Bestätigen",
    "common.yes": "Ja",
    "common.no": "Nein",

    // Auth
    "auth.login": "Anmelden",
    "auth.logout": "Abmelden",
    "auth.username": "Benutzername",
    "auth.password": "Passwort",
    "auth.loginButton": "Anmelden",
    "auth.loginError": "Ungültige Anmeldedaten",
    "auth.logoutSuccess": "Erfolgreich abgemeldet",

    // Navigation
    "nav.home": "Startseite",
    "nav.builder": "Builder",
    "nav.admin": "Admin",
    "nav.settings": "Einstellungen",
    "nav.docs": "Dokumentation",
    "nav.history": "Verlauf",
    "nav.logs": "Logs",

    // Builder
    "builder.newProject": "Neues Projekt",
    "builder.saveProject": "Projekt speichern",
    "builder.exportProject": "Projekt exportieren",
    "builder.deploy": "Deployen",
    "builder.workflow": "Workflow",
    "builder.designer": "Designer",
    "builder.knowledgeBase": "Wissen",
    "builder.chat.placeholder": "Beschreibe, was du bauen möchtest...",
    "builder.chat.welcome": "Willkommen bei AgentForge! Beschreibe mir, welche App du bauen möchtest.",

    // Agents
    "agents.planner": "Planner Agent",
    "agents.coder": "Coder Agent",
    "agents.reviewer": "Reviewer Agent",
    "agents.security": "Security Agent",
    "agents.executor": "Executor Agent",

    // Workflow
    "workflow.start": "Starten",
    "workflow.stop": "Stoppen",
    "workflow.pause": "Pausieren",
    "workflow.resume": "Fortsetzen",
    "workflow.complete": "Abgeschlossen",
    "workflow.failed": "Fehlgeschlagen",
    "workflow.running": "Läuft",

    // Settings
    "settings.general": "Allgemein",
    "settings.apiKeys": "API-Schlüssel",
    "settings.agents": "Agenten",
    "settings.appearance": "Darstellung",
    "settings.advanced": "Erweitert",
    "settings.language": "Sprache",
    "settings.theme": "Theme",
    "settings.defaultModel": "Standard-Modell",

    // Admin
    "admin.marketplace": "Marketplace",
    "admin.mcpServers": "MCP Server",
    "admin.users": "Benutzer",
    "admin.install": "Installieren",
    "admin.uninstall": "Deinstallieren",
    "admin.installed": "Installiert",

    // Errors
    "error.generic": "Ein Fehler ist aufgetreten",
    "error.notFound": "Nicht gefunden",
    "error.unauthorized": "Nicht autorisiert",
    "error.apiKeyMissing": "API-Schlüssel fehlt",
    "error.networkError": "Netzwerkfehler",
  },
  en: {
    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.create": "Create",
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.success": "Success",
    "common.back": "Back",
    "common.next": "Next",
    "common.previous": "Previous",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.export": "Export",
    "common.import": "Import",
    "common.settings": "Settings",
    "common.close": "Close",
    "common.confirm": "Confirm",
    "common.yes": "Yes",
    "common.no": "No",

    // Auth
    "auth.login": "Login",
    "auth.logout": "Logout",
    "auth.username": "Username",
    "auth.password": "Password",
    "auth.loginButton": "Sign In",
    "auth.loginError": "Invalid credentials",
    "auth.logoutSuccess": "Successfully logged out",

    // Navigation
    "nav.home": "Home",
    "nav.builder": "Builder",
    "nav.admin": "Admin",
    "nav.settings": "Settings",
    "nav.docs": "Documentation",
    "nav.history": "History",
    "nav.logs": "Logs",

    // Builder
    "builder.newProject": "New Project",
    "builder.saveProject": "Save Project",
    "builder.exportProject": "Export Project",
    "builder.deploy": "Deploy",
    "builder.workflow": "Workflow",
    "builder.designer": "Designer",
    "builder.knowledgeBase": "Knowledge",
    "builder.chat.placeholder": "Describe what you want to build...",
    "builder.chat.welcome": "Welcome to AgentForge! Describe what app you want to build.",

    // Agents
    "agents.planner": "Planner Agent",
    "agents.coder": "Coder Agent",
    "agents.reviewer": "Reviewer Agent",
    "agents.security": "Security Agent",
    "agents.executor": "Executor Agent",

    // Workflow
    "workflow.start": "Start",
    "workflow.stop": "Stop",
    "workflow.pause": "Pause",
    "workflow.resume": "Resume",
    "workflow.complete": "Complete",
    "workflow.failed": "Failed",
    "workflow.running": "Running",

    // Settings
    "settings.general": "General",
    "settings.apiKeys": "API Keys",
    "settings.agents": "Agents",
    "settings.appearance": "Appearance",
    "settings.advanced": "Advanced",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.defaultModel": "Default Model",

    // Admin
    "admin.marketplace": "Marketplace",
    "admin.mcpServers": "MCP Servers",
    "admin.users": "Users",
    "admin.install": "Install",
    "admin.uninstall": "Uninstall",
    "admin.installed": "Installed",

    // Errors
    "error.generic": "An error occurred",
    "error.notFound": "Not found",
    "error.unauthorized": "Unauthorized",
    "error.apiKeyMissing": "API key missing",
    "error.networkError": "Network error",
  },
}

// Get translation
export function t(key: keyof TranslationKeys, locale: Locale = "de"): string {
  return translations[locale][key] || key
}

// Hook for using translations
import { useAgentStore } from "./agent-store"

export function useTranslation() {
  const { globalConfig } = useAgentStore()
  const locale = globalConfig.language || "de"

  return {
    t: (key: keyof TranslationKeys) => t(key, locale),
    locale,
  }
}

export default translations
