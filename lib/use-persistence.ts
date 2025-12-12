"use client"

import { useCallback, useEffect, useState } from "react"
import { useAgentStore } from "./agent-store"

const USER_ID = "default" // In Produktion: Auth-System verwenden

export function usePersistence() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  const {
    globalConfig,
    agentConfigs,
    currentProject,
    projects,
    updateGlobalConfig,
    loadProject,
    getFiles,
    messages
  } = useAgentStore()

  // Lade Einstellungen beim Start
  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/settings?userId=${USER_ID}`)
      if (response.ok) {
        const data = await response.json()
        if (data.settings) {
          updateGlobalConfig({
            defaultModel: data.settings.defaultModel,
            autoReview: data.settings.autoReview,
            streaming: data.settings.streaming,
            theme: data.settings.theme,
            language: data.settings.language,
            openaiApiKey: data.settings.openaiApiKey || "",
            anthropicApiKey: data.settings.anthropicApiKey || "",
            openrouterApiKey: data.settings.openrouterApiKey || "",
            renderApiKey: data.settings.renderApiKey || "",
            githubToken: data.settings.githubToken || ""
          })
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error)
    }
  }, [updateGlobalConfig])

  // Lade Projekte beim Start
  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects?userId=${USER_ID}`)
      if (response.ok) {
        const data = await response.json()
        // Projekte werden im Store über loadProject geladen
        return data.projects
      }
    } catch (error) {
      console.error("Error loading projects:", error)
    }
    return []
  }, [])

  // Speichere Einstellungen
  const saveSettings = useCallback(async () => {
    setIsSyncing(true)
    setLastSyncError(null)
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: USER_ID,
          defaultModel: globalConfig.defaultModel,
          autoReview: globalConfig.autoReview,
          streaming: globalConfig.streaming,
          theme: globalConfig.theme,
          language: globalConfig.language,
          openaiApiKey: globalConfig.openaiApiKey,
          anthropicApiKey: globalConfig.anthropicApiKey,
          openrouterApiKey: globalConfig.openrouterApiKey,
          renderApiKey: globalConfig.renderApiKey,
          githubToken: globalConfig.githubToken,
          agentConfigs: agentConfigs
        })
      })
      
      if (!response.ok) {
        throw new Error("Fehler beim Speichern")
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unbekannter Fehler"
      setLastSyncError(msg)
      console.error("Error saving settings:", error)
    } finally {
      setIsSyncing(false)
    }
  }, [globalConfig, agentConfigs])

  // Speichere aktuelles Projekt
  const saveCurrentProject = useCallback(async () => {
    if (!currentProject) return

    setIsSyncing(true)
    setLastSyncError(null)
    try {
      // Speichere Projekt-Metadaten
      await fetch(`/api/projects/${currentProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentProject.name,
          description: currentProject.description,
          agentConfigs: currentProject.agentConfigs
        })
      })

      // Speichere Dateien
      const files = getFiles()
      if (files.length > 0) {
        await fetch(`/api/projects/${currentProject.id}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: files.map(f => ({
              path: f.path,
              content: f.content,
              language: f.language,
              status: f.status
            }))
          })
        })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unbekannter Fehler"
      setLastSyncError(msg)
      console.error("Error saving project:", error)
    } finally {
      setIsSyncing(false)
    }
  }, [currentProject, getFiles])

  // Erstelle neues Projekt auf dem Server
  const createServerProject = useCallback(async (name: string, description?: string) => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          userId: USER_ID,
          agentConfigs
        })
      })

      if (response.ok) {
        const data = await response.json()
        return data.project
      }
    } catch (error) {
      console.error("Error creating project:", error)
    }
    return null
  }, [agentConfigs])

  // Lösche Projekt auf dem Server
  const deleteServerProject = useCallback(async (projectId: string) => {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "DELETE"
      })
    } catch (error) {
      console.error("Error deleting project:", error)
    }
  }, [])

  // Initialisierung
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await loadSettings()
      await loadProjects()
      setIsLoading(false)
    }
    init()
  }, [loadSettings, loadProjects])

  // Auto-Save bei Änderungen (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoading) {
        saveSettings()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [globalConfig, agentConfigs, isLoading, saveSettings])

  // Auto-Save Projekt bei Änderungen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoading && currentProject) {
        saveCurrentProject()
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [currentProject, messages, isLoading, saveCurrentProject])

  return {
    isLoading,
    isSyncing,
    lastSyncError,
    saveSettings,
    saveCurrentProject,
    createServerProject,
    deleteServerProject,
    loadProjects
  }
}
