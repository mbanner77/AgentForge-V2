"use client"

import { useEffect, useCallback } from "react"

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  description: string
  action: () => void
}

// Global shortcuts registry
const shortcuts: Map<string, KeyboardShortcut> = new Map()

// Generate unique key for shortcut
function getShortcutKey(shortcut: Omit<KeyboardShortcut, "description" | "action">): string {
  const parts: string[] = []
  if (shortcut.ctrl) parts.push("ctrl")
  if (shortcut.shift) parts.push("shift")
  if (shortcut.alt) parts.push("alt")
  if (shortcut.meta) parts.push("meta")
  parts.push(shortcut.key.toLowerCase())
  return parts.join("+")
}

// Register a shortcut
export function registerShortcut(shortcut: KeyboardShortcut): () => void {
  const key = getShortcutKey(shortcut)
  shortcuts.set(key, shortcut)
  return () => shortcuts.delete(key)
}

// Check if event matches shortcut
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    !!event.ctrlKey === !!shortcut.ctrl &&
    !!event.shiftKey === !!shortcut.shift &&
    !!event.altKey === !!shortcut.alt &&
    !!event.metaKey === !!shortcut.meta
  )
}

// Global keyboard event handler
function handleKeyDown(event: KeyboardEvent) {
  // Don't trigger shortcuts when typing in inputs
  const target = event.target as HTMLElement
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  ) {
    // Allow some shortcuts even in inputs
    if (!event.ctrlKey && !event.metaKey) {
      return
    }
  }

  for (const shortcut of shortcuts.values()) {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault()
      shortcut.action()
      return
    }
  }
}

// Hook to use keyboard shortcuts
export function useKeyboardShortcuts(newShortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const cleanups = newShortcuts.map(shortcut => registerShortcut(shortcut))
    return () => cleanups.forEach(cleanup => cleanup())
  }, [newShortcuts])
}

// Hook to initialize global keyboard listener
export function useGlobalKeyboardShortcuts() {
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}

// Hook for single shortcut
export function useKeyboardShortcut(
  shortcut: Omit<KeyboardShortcut, "action">,
  action: () => void,
  deps: any[] = []
) {
  const memoizedAction = useCallback(action, deps)

  useEffect(() => {
    const cleanup = registerShortcut({ ...shortcut, action: memoizedAction })
    return cleanup
  }, [shortcut.key, shortcut.ctrl, shortcut.shift, shortcut.alt, shortcut.meta, memoizedAction])
}

// Get all registered shortcuts (for help dialog)
export function getAllShortcuts(): KeyboardShortcut[] {
  return Array.from(shortcuts.values())
}

// Format shortcut for display
export function formatShortcut(shortcut: Omit<KeyboardShortcut, "description" | "action">): string {
  const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0
  const parts: string[] = []
  
  if (shortcut.ctrl) parts.push(isMac ? "⌃" : "Ctrl")
  if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt")
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift")
  if (shortcut.meta) parts.push(isMac ? "⌘" : "Win")
  
  // Format special keys
  let key = shortcut.key.toUpperCase()
  if (key === "ESCAPE") key = "Esc"
  if (key === "ENTER") key = "↵"
  if (key === "ARROWUP") key = "↑"
  if (key === "ARROWDOWN") key = "↓"
  if (key === "ARROWLEFT") key = "←"
  if (key === "ARROWRIGHT") key = "→"
  
  parts.push(key)
  
  return parts.join(isMac ? "" : "+")
}

// Default application shortcuts
export const DEFAULT_SHORTCUTS = {
  save: { key: "s", ctrl: true, description: "Projekt speichern" },
  newProject: { key: "n", ctrl: true, description: "Neues Projekt" },
  search: { key: "k", ctrl: true, description: "Suche öffnen" },
  settings: { key: ",", ctrl: true, description: "Einstellungen" },
  help: { key: "?", shift: true, description: "Hilfe anzeigen" },
  escape: { key: "Escape", description: "Dialog schließen" },
  run: { key: "Enter", ctrl: true, description: "Workflow starten" },
  toggleSidebar: { key: "b", ctrl: true, description: "Sidebar umschalten" },
  export: { key: "e", ctrl: true, shift: true, description: "Exportieren" },
  undo: { key: "z", ctrl: true, description: "Rückgängig" },
  redo: { key: "z", ctrl: true, shift: true, description: "Wiederholen" },
}
