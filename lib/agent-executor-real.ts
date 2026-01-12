"use client"

import { useCallback } from "react"
import { useAgentStore, getEnvironmentPrompt, getIterationPrompt, getDeploymentTargetPrompt, type DeploymentTarget } from "./agent-store"
import { sendChatRequest, getProviderFromModel } from "./api-client"
import type { AgentType, Message, WorkflowStep, ProjectFile, AgentSuggestion } from "./types"
import { marketplaceAgents } from "./marketplace-agents"
import { getMcpServerById } from "./mcp-servers"
import { getBestPracticesForRequest, getCriticalBestPractices } from "./best-practices-knowledge"
import { componentLibrary, getRecommendedComponents, generateComponentFiles } from "./component-library"

// RAG-Kontext für Agenten abrufen (mit Agent-spezifischer Filterung)
async function fetchRagContext(
  query: string, 
  apiKey: string, 
  agentId?: string,
  provider: "openai" | "openrouter" = "openai"
): Promise<string> {
  if (!apiKey) return ""
  
  // Coder bekommt mehr Kontext für bessere Code-Generierung
  const maxTokens = agentId === "coder" ? 4000 : 2000
  
  try {
    const response = await fetch("/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        apiKey,
        buildContext: true,
        maxTokens,
        agentId,
        provider,
      }),
    })
    
    if (!response.ok) return ""
    
    const data = await response.json()
    return data.context || ""
  } catch (error) {
    console.warn("[RAG] Fehler beim Abrufen des Kontexts:", error)
    return ""
  }
}

// Intelligente Fehlertyp-Erkennung für bessere Korrektur
type ErrorType = 'syntax' | 'import' | 'type' | 'runtime' | 'undefined' | 'component' | 'hook' | 'unknown'

function analyzeErrorType(errorMessage: string): ErrorType {
  const lower = errorMessage.toLowerCase()
  
  if (lower.includes('unexpected token') || lower.includes('syntax error') || lower.includes("')' expected")) {
    return 'syntax'
  }
  if (lower.includes('module not found') || lower.includes('cannot find module') || lower.includes('failed to resolve import')) {
    return 'import'
  }
  if (lower.includes('type') && (lower.includes('is not assignable') || lower.includes('property') || lower.includes('missing'))) {
    return 'type'
  }
  if (lower.includes('is not defined') || lower.includes('is undefined') || lower.includes("cannot read property")) {
    return 'undefined'
  }
  if (lower.includes('invalid hook call') || lower.includes('hooks can only be called')) {
    return 'hook'
  }
  if (lower.includes('component') || lower.includes('jsx') || lower.includes('element type')) {
    return 'component'
  }
  if (lower.includes('runtime') || lower.includes('at runtime')) {
    return 'runtime'
  }
  return 'unknown'
}

function getErrorHint(errorType: ErrorType): string {
  const hints: Record<ErrorType, string> = {
    syntax: '💡 SYNTAX-FEHLER: Prüfe Klammern, Semikolons und JSX-Syntax genau.',
    import: '💡 IMPORT-FEHLER: Prüfe ob die importierte Datei existiert und der Pfad korrekt ist. Erstelle fehlende Dateien!',
    type: '💡 TYPE-FEHLER: Prüfe TypeScript-Typen und Interface-Definitionen.',
    undefined: '💡 UNDEFINED-FEHLER: Variable/Funktion ist nicht definiert. Prüfe Imports und Deklarationen.',
    hook: '💡 HOOK-FEHLER: React Hooks dürfen nur in Funktionskomponenten aufgerufen werden. Prüfe "use client" Direktive.',
    component: '💡 COMPONENT-FEHLER: Prüfe ob Komponente korrekt exportiert wird und JSX-Syntax stimmt.',
    runtime: '💡 RUNTIME-FEHLER: Fehler tritt zur Laufzeit auf. Prüfe Datentypen und null-Checks.',
    unknown: '💡 Analysiere den Fehler genau und behebe die Ursache.',
  }
  return hints[errorType]
}

// Code-Statistik Berechnung für Feedback nach Generierung
interface CodeStats {
  totalFiles: number
  totalLines: number
  components: number
  hooks: number
  hasTypeScript: boolean
  hasTailwind: boolean
  hasRouter: boolean
}

// Contextual Hints - Intelligente Tipps basierend auf Code-Analyse
interface ContextualHint {
  type: 'improvement' | 'warning' | 'suggestion'
  message: string
  action?: string
}

// Intelligente Code-Vervollständigung Hints
interface CompletionHint {
  trigger: string
  suggestion: string
  code: string
  category: 'hook' | 'component' | 'pattern' | 'utility'
}

function getCompletionHints(currentCode: string): CompletionHint[] {
  const hints: CompletionHint[] = []
  
  // Wenn useState ohne useEffect - Side Effects vorschlagen
  if (currentCode.includes('useState') && !currentCode.includes('useEffect')) {
    hints.push({
      trigger: 'useEffect',
      suggestion: 'Side Effect für State-Synchronisation',
      code: `useEffect(() => {\n  // Wird ausgeführt wenn sich der State ändert\n}, [dependency])`,
      category: 'hook'
    })
  }
  
  // Wenn Form vorhanden - Validierung vorschlagen
  if (currentCode.includes('<form') && !currentCode.includes('validate')) {
    hints.push({
      trigger: 'validation',
      suggestion: 'Formular-Validierung hinzufügen',
      code: `const validate = (data) => {\n  const errors = {}\n  if (!data.field) errors.field = 'Pflichtfeld'\n  return errors\n}`,
      category: 'utility'
    })
  }
  
  // Wenn Liste ohne Pagination
  if (currentCode.includes('.map(') && !currentCode.includes('page') && !currentCode.includes('slice')) {
    hints.push({
      trigger: 'pagination',
      suggestion: 'Pagination für lange Listen',
      code: `const [page, setPage] = useState(1)\nconst itemsPerPage = 10\nconst paginatedItems = items.slice((page-1)*itemsPerPage, page*itemsPerPage)`,
      category: 'pattern'
    })
  }
  
  // Wenn async ohne Loading State
  if ((currentCode.includes('fetch(') || currentCode.includes('async')) && !currentCode.includes('loading')) {
    hints.push({
      trigger: 'loading',
      suggestion: 'Loading State für async Operationen',
      code: `const [isLoading, setIsLoading] = useState(false)\n// In async function:\nsetIsLoading(true)\ntry { await ... } finally { setIsLoading(false) }`,
      category: 'pattern'
    })
  }
  
  // Wenn Button ohne Disabled State
  if (currentCode.includes('<button') && currentCode.includes('onClick') && !currentCode.includes('disabled')) {
    hints.push({
      trigger: 'disabled',
      suggestion: 'Disabled State für Button',
      code: `<button disabled={isLoading || !isValid} className="disabled:opacity-50">`,
      category: 'component'
    })
  }
  
  return hints.slice(0, 3)
}

// Auto-Dependency Detection
interface DependencySuggestion {
  package: string
  reason: string
  installCommand: string
}

function detectRequiredDependencies(files: { path: string; content: string }[]): DependencySuggestion[] {
  const suggestions: DependencySuggestion[] = []
  const allContent = files.map(f => f.content).join('\n')
  
  // Charts
  if ((allContent.includes('Chart') || allContent.includes('graph') || allContent.includes('BarChart')) && 
      !allContent.includes('recharts')) {
    suggestions.push({
      package: 'recharts',
      reason: 'Für Charts und Graphen',
      installCommand: 'npm install recharts'
    })
  }
  
  // Animationen
  if (allContent.includes('animate') || allContent.includes('motion') || allContent.includes('transition')) {
    if (!allContent.includes('framer-motion')) {
      suggestions.push({
        package: 'framer-motion',
        reason: 'Für flüssige Animationen',
        installCommand: 'npm install framer-motion'
      })
    }
  }
  
  // Date Handling
  if (allContent.includes('Date') || allContent.includes('calendar') || allContent.includes('format')) {
    if (!allContent.includes('date-fns') && !allContent.includes('dayjs')) {
      suggestions.push({
        package: 'date-fns',
        reason: 'Für Datums-Formatierung',
        installCommand: 'npm install date-fns'
      })
    }
  }
  
  // Icons
  if (allContent.includes('Icon') || allContent.includes('icon')) {
    if (!allContent.includes('lucide-react')) {
      suggestions.push({
        package: 'lucide-react',
        reason: 'Für Icons',
        installCommand: 'npm install lucide-react'
      })
    }
  }
  
  // State Management
  if ((allContent.match(/useState/g) || []).length > 8 && !allContent.includes('zustand')) {
    suggestions.push({
      package: 'zustand',
      reason: 'Für komplexes State Management',
      installCommand: 'npm install zustand'
    })
  }
  
  return suggestions.slice(0, 3)
}

// Smart Component Templates basierend auf Kontext
interface ComponentTemplate {
  name: string
  description: string
  code: string
  dependencies: string[]
}

function getSmartComponentTemplates(projectType: ProjectType): ComponentTemplate[] {
  const templates: ComponentTemplate[] = []
  
  // Allgemeine Templates
  templates.push({
    name: 'SearchInput',
    description: 'Suchfeld mit Debounce',
    code: `const SearchInput = ({ onSearch, placeholder = "Suchen..." }) => {
  const [value, setValue] = useState('')
  
  useEffect(() => {
    const timer = setTimeout(() => onSearch(value), 300)
    return () => clearTimeout(timer)
  }, [value, onSearch])
  
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
    />
  )
}`,
    dependencies: ['react']
  })
  
  // Projekttyp-spezifische Templates
  if (projectType === 'todo') {
    templates.push({
      name: 'TodoItem',
      description: 'Todo-Element mit Checkbox',
      code: `const TodoItem = ({ todo, onToggle, onDelete }) => (
  <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow">
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={() => onToggle(todo.id)}
      className="w-5 h-5"
    />
    <span className={todo.completed ? 'line-through text-gray-400' : ''}>
      {todo.text}
    </span>
    <button onClick={() => onDelete(todo.id)} className="ml-auto text-red-500">
      ✕
    </button>
  </div>
)`,
      dependencies: ['react']
    })
  }
  
  if (projectType === 'dashboard') {
    templates.push({
      name: 'StatCard',
      description: 'KPI-Karte mit Icon und Trend',
      code: `const StatCard = ({ title, value, change, icon: Icon }) => (
  <div className="p-6 bg-white rounded-xl shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 text-sm">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <p className={change >= 0 ? 'text-green-500' : 'text-red-500'}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </p>
      </div>
      {Icon && <Icon className="w-8 h-8 text-blue-500" />}
    </div>
  </div>
)`,
      dependencies: ['react', 'lucide-react']
    })
  }
  
  if (projectType === 'ecommerce') {
    templates.push({
      name: 'ProductCard',
      description: 'Produkt-Karte mit Bild und Preis',
      code: `const ProductCard = ({ product, onAddToCart }) => (
  <div className="bg-white rounded-xl shadow overflow-hidden">
    <img src={product.image} alt={product.name} className="w-full h-48 object-cover" />
    <div className="p-4">
      <h3 className="font-semibold">{product.name}</h3>
      <p className="text-gray-500 text-sm mt-1">{product.description}</p>
      <div className="flex justify-between items-center mt-4">
        <span className="text-xl font-bold">{product.price}€</span>
        <button
          onClick={() => onAddToCart(product)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          In den Warenkorb
        </button>
      </div>
    </div>
  </div>
)`,
      dependencies: ['react']
    })
  }
  
  return templates.slice(0, 3)
}

// Smart Context Awareness - Analysiert bestehenden Code für intelligentere Vorschläge
interface CodeContext {
  hasState: boolean
  hasEffects: boolean
  hasAPI: boolean
  hasRouting: boolean
  hasAuth: boolean
  hasForms: boolean
  dataStructures: string[]
  usedLibraries: string[]
}

function analyzeCodeContext(files: { path: string; content: string }[]): CodeContext {
  const allContent = files.map(f => f.content).join('\n')
  
  // Erkenne verwendete Datenstrukturen
  const dataStructures: string[] = []
  if (allContent.includes('interface') || allContent.includes('type ')) {
    const matches = allContent.match(/(?:interface|type)\s+(\w+)/g) || []
    dataStructures.push(...matches.map(m => m.replace(/^(interface|type)\s+/, '')))
  }
  
  // Erkenne verwendete Libraries
  const usedLibraries: string[] = []
  if (allContent.includes('from "react"') || allContent.includes("from 'react'")) usedLibraries.push('react')
  if (allContent.includes('recharts')) usedLibraries.push('recharts')
  if (allContent.includes('framer-motion')) usedLibraries.push('framer-motion')
  if (allContent.includes('zustand')) usedLibraries.push('zustand')
  if (allContent.includes('axios') || allContent.includes('fetch(')) usedLibraries.push('http-client')
  if (allContent.includes('date-fns') || allContent.includes('dayjs')) usedLibraries.push('date-library')
  
  return {
    hasState: allContent.includes('useState') || allContent.includes('useReducer'),
    hasEffects: allContent.includes('useEffect'),
    hasAPI: allContent.includes('fetch(') || allContent.includes('axios'),
    hasRouting: allContent.includes('useRouter') || allContent.includes('next/navigation'),
    hasAuth: allContent.includes('auth') || allContent.includes('login') || allContent.includes('session'),
    hasForms: allContent.includes('<form') || allContent.includes('onSubmit'),
    dataStructures: [...new Set(dataStructures)].slice(0, 5),
    usedLibraries: [...new Set(usedLibraries)],
  }
}

// Generiert kontextbewusste Vorschläge basierend auf Code-Analyse
function getContextAwareSuggestions(context: CodeContext, projectType: ProjectType): string[] {
  const suggestions: string[] = []
  
  // Basierend auf vorhandenen Features
  if (context.hasState && !context.hasEffects) {
    suggestions.push('"Füge Side-Effects mit useEffect hinzu (z.B. für API-Calls)"')
  }
  
  if (context.hasForms && !context.hasAPI) {
    suggestions.push('"Verbinde das Formular mit einem Backend/API"')
  }
  
  if (context.hasAPI && !context.hasState) {
    suggestions.push('"Füge State-Management für API-Daten hinzu"')
  }
  
  if (!context.usedLibraries.includes('framer-motion') && context.hasState) {
    suggestions.push('"Füge Animationen mit Framer Motion hinzu"')
  }
  
  if (context.dataStructures.length > 0) {
    suggestions.push(`"Erweitere ${context.dataStructures[0]} um neue Felder"`)
  }
  
  return suggestions.slice(0, 2)
}

// Intelligente Komponenten-Vorschläge basierend auf App-Analyse
interface ComponentSuggestion {
  name: string
  description: string
  reason: string
  prompt: string
}

function suggestMissingComponents(files: { path: string; content: string }[], projectType: ProjectType): ComponentSuggestion[] {
  const suggestions: ComponentSuggestion[] = []
  const allContent = files.map(f => f.content).join('\n')
  const existingComponents = files.filter(f => f.path.includes('components/')).map(f => f.path)
  
  // Allgemeine fehlende Komponenten
  if (!allContent.includes('Header') && !existingComponents.some(p => p.includes('Header'))) {
    suggestions.push({
      name: 'Header',
      description: 'Navigation und Branding',
      reason: 'Jede App braucht eine Header-Komponente',
      prompt: 'Füge eine Header-Komponente mit Logo und Navigation hinzu'
    })
  }
  
  if (!allContent.includes('Footer') && files.length > 3) {
    suggestions.push({
      name: 'Footer',
      description: 'Links und Copyright',
      reason: 'Für professionelle Apps empfohlen',
      prompt: 'Füge eine Footer-Komponente mit Links und Copyright hinzu'
    })
  }
  
  if (!allContent.includes('Loading') && !allContent.includes('Skeleton') && allContent.includes('useState')) {
    suggestions.push({
      name: 'LoadingSpinner',
      description: 'Loading-Indikator',
      reason: 'Für bessere UX bei async Operationen',
      prompt: 'Füge eine LoadingSpinner-Komponente für Loading-States hinzu'
    })
  }
  
  if (!allContent.includes('Modal') && !allContent.includes('Dialog') && files.length > 4) {
    suggestions.push({
      name: 'Modal',
      description: 'Dialog/Popup',
      reason: 'Nützlich für Bestätigungen und Formulare',
      prompt: 'Füge eine wiederverwendbare Modal-Komponente hinzu'
    })
  }
  
  // Projekttyp-spezifische Komponenten
  if (projectType === 'todo' && !allContent.includes('TodoItem')) {
    suggestions.push({
      name: 'TodoItem',
      description: 'Einzelnes Todo-Element',
      reason: 'Bessere Struktur für Todo-Apps',
      prompt: 'Extrahiere TodoItem als separate Komponente mit Checkbox und Delete-Button'
    })
  }
  
  if (projectType === 'ecommerce' && !allContent.includes('ProductCard')) {
    suggestions.push({
      name: 'ProductCard',
      description: 'Produkt-Anzeige',
      reason: 'Wiederverwendbar für Produktlisten',
      prompt: 'Füge eine ProductCard-Komponente mit Bild, Titel, Preis und Add-to-Cart hinzu'
    })
  }
  
  if (projectType === 'dashboard' && !allContent.includes('StatCard')) {
    suggestions.push({
      name: 'StatCard',
      description: 'KPI-Anzeige',
      reason: 'Für Dashboard-Metriken',
      prompt: 'Füge eine StatCard-Komponente für KPI-Anzeigen mit Icon und Trend hinzu'
    })
  }
  
  return suggestions.slice(0, 3)
}

// Automatische Code-Dokumentation generieren
function generateCodeDocumentation(files: { path: string; content: string }[]): string {
  const docs: string[] = []
  
  for (const file of files) {
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.ts')) continue
    
    const content = file.content
    
    // Finde exportierte Komponenten/Funktionen
    const exports = content.match(/export\s+(default\s+)?(?:function|const|class)\s+(\w+)/g) || []
    const props = content.match(/interface\s+(\w+Props)/g) || []
    const hooks = content.match(/function\s+(use\w+)/g) || []
    
    if (exports.length > 0 || hooks.length > 0) {
      docs.push(`### ${file.path}`)
      
      exports.forEach(exp => {
        const name = exp.replace(/export\s+(default\s+)?(?:function|const|class)\s+/, '')
        docs.push(`- **${name}**: Exportierte Komponente/Funktion`)
      })
      
      hooks.forEach(hook => {
        const name = hook.replace('function ', '')
        docs.push(`- **${name}**: Custom Hook`)
      })
      
      props.forEach(prop => {
        const name = prop.replace('interface ', '')
        docs.push(`- **${name}**: Props Interface`)
      })
    }
  }
  
  return docs.length > 0 ? docs.join('\n') : 'Keine dokumentierbaren Elemente gefunden.'
}

// Smart Refactoring Vorschläge
interface SmartRefactoringSuggestion {
  type: 'extract' | 'simplify' | 'rename' | 'split'
  file: string
  description: string
  priority: 'low' | 'medium' | 'high'
}

function generateSmartRefactoringSuggestions(files: { path: string; content: string }[]): SmartRefactoringSuggestion[] {
  const suggestions: SmartRefactoringSuggestion[] = []
  
  for (const file of files) {
    const content = file.content
    const lines = content.split('\n')
    
    // Große Dateien splitten
    if (lines.length > 200) {
      suggestions.push({
        type: 'split',
        file: file.path,
        description: `Datei hat ${lines.length} Zeilen - in kleinere Module aufteilen`,
        priority: 'high'
      })
    }
    
    // Duplizierter Code (einfache Erkennung)
    const codeBlocks = content.match(/\{[^{}]{50,}\}/g) || []
    const uniqueBlocks = new Set(codeBlocks)
    if (codeBlocks.length > uniqueBlocks.size + 2) {
      suggestions.push({
        type: 'extract',
        file: file.path,
        description: 'Mögliche Code-Duplikation erkannt - in Funktion extrahieren',
        priority: 'medium'
      })
    }
    
    // Zu viele Props
    const propsMatch = content.match(/\(\s*\{[^}]{200,}\}\s*\)/g)
    if (propsMatch) {
      suggestions.push({
        type: 'simplify',
        file: file.path,
        description: 'Viele Props - erwäge Gruppierung oder Context',
        priority: 'medium'
      })
    }
    
    // Lange Funktionen
    const longFunctions = content.match(/(?:function|const)\s+\w+[^{]*\{[^}]{500,}\}/g)
    if (longFunctions && longFunctions.length > 0) {
      suggestions.push({
        type: 'extract',
        file: file.path,
        description: 'Lange Funktion erkannt - in kleinere Funktionen aufteilen',
        priority: 'medium'
      })
    }
  }
  
  return suggestions.slice(0, 5)
}

// Change-Summary für Iterationen - Was wurde geändert?
interface ChangeSummary {
  filesAdded: string[]
  filesModified: string[]
  featuresAdded: string[]
  componentsAdded: string[]
}

function generateChangeSummary(
  oldFiles: { path: string; content: string }[],
  newFiles: { path: string; content: string }[]
): ChangeSummary {
  const oldPaths = new Set(oldFiles.map(f => f.path))
  const newPaths = new Set(newFiles.map(f => f.path))
  
  const filesAdded = newFiles
    .filter(f => !oldPaths.has(f.path))
    .map(f => f.path)
  
  const filesModified = newFiles
    .filter(f => {
      const oldFile = oldFiles.find(o => o.path === f.path)
      return oldFile && oldFile.content !== f.content
    })
    .map(f => f.path)
  
  // Erkenne hinzugefügte Features
  const featuresAdded: string[] = []
  const allNewContent = newFiles.map(f => f.content).join('\n')
  const allOldContent = oldFiles.map(f => f.content).join('\n')
  
  if (allNewContent.includes('useState') && !allOldContent.includes('useState')) {
    featuresAdded.push('State Management')
  }
  if (allNewContent.includes('useEffect') && !allOldContent.includes('useEffect')) {
    featuresAdded.push('Side Effects')
  }
  if (allNewContent.includes('localStorage') && !allOldContent.includes('localStorage')) {
    featuresAdded.push('Daten-Persistenz')
  }
  if (allNewContent.includes('filter(') && !allOldContent.includes('filter(')) {
    featuresAdded.push('Filter-Funktion')
  }
  if ((allNewContent.includes('dark') || allNewContent.includes('theme')) && 
      !allOldContent.includes('dark') && !allOldContent.includes('theme')) {
    featuresAdded.push('Dark Mode')
  }
  
  // Erkenne neue Komponenten
  const componentsAdded = filesAdded
    .filter(p => p.includes('components/'))
    .map(p => p.split('/').pop()?.replace('.tsx', '') || '')
    .filter(Boolean)
  
  return { filesAdded, filesModified, featuresAdded, componentsAdded }
}

// Import-Validierung: Prüft ob alle importierten Dateien existieren
interface MissingImport {
  sourceFile: string
  importPath: string
  missingFile: string
}

function validateImports(files: { path: string; content: string }[]): MissingImport[] {
  const missingImports: MissingImport[] = []
  const existingPaths = new Set(files.map(f => f.path.toLowerCase()))
  
  for (const file of files) {
    // Finde alle relativen Imports
    const importRegex = /from\s+["'](\.\/.+?|\.\.\/.*?)["']/g
    let match
    
    while ((match = importRegex.exec(file.content)) !== null) {
      const importPath = match[1]
      
      // Ignoriere externe Packages
      if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue
      
      // Berechne den erwarteten Dateipfad
      const baseDir = file.path.split('/').slice(0, -1).join('/')
      let resolvedPath = importPath
      
      // Entferne ./ vom Anfang
      if (resolvedPath.startsWith('./')) {
        resolvedPath = resolvedPath.substring(2)
      }
      
      // Kombiniere mit Base-Directory
      const fullPath = baseDir ? `${baseDir}/${resolvedPath}` : resolvedPath
      
      // Prüfe verschiedene Dateiendungen
      const possiblePaths = [
        fullPath,
        `${fullPath}.tsx`,
        `${fullPath}.ts`,
        `${fullPath}/index.tsx`,
        `${fullPath}/index.ts`
      ]
      
      const exists = possiblePaths.some(p => existingPaths.has(p.toLowerCase()))
      
      if (!exists) {
        missingImports.push({
          sourceFile: file.path,
          importPath: importPath,
          missingFile: `${fullPath}.tsx`
        })
      }
    }
  }
  
  return missingImports
}

// Generiere fehlende Dateien automatisch als leere Komponenten
function generateMissingFilePrompt(missingImports: MissingImport[]): string {
  if (missingImports.length === 0) return ''
  
  const fileList = [...new Set(missingImports.map(m => m.missingFile))].join(', ')
  
  return `
🔴 FEHLENDE DATEIEN ERKANNT! Diese importierten Dateien existieren NICHT:
${missingImports.map(m => `- "${m.missingFile}" (importiert in ${m.sourceFile})`).join('\n')}

Du MUSST diese Dateien JETZT erstellen! Für jede fehlende Datei:
1. Erstelle die Datei mit dem korrekten Pfad
2. Implementiere die Komponente/Funktion die importiert wird
3. Exportiere sie korrekt

ERSTELLE JETZT: ${fileList}
`
}

// Case-Sensitivity Validierung für Deployments
interface CaseSensitivityIssue {
  file: string
  importedAs: string
  actualName: string
  fixPrompt: string
}

function validateCaseSensitivity(files: { path: string; content: string }[]): CaseSensitivityIssue[] {
  const issues: CaseSensitivityIssue[] = []
  const fileNames = new Map<string, string>() // lowercase -> actual
  
  // Sammle alle Dateinamen
  for (const file of files) {
    const fileName = file.path.split('/').pop() || ''
    fileNames.set(fileName.toLowerCase(), fileName)
  }
  
  // Prüfe alle Imports
  for (const file of files) {
    const importMatches = file.content.matchAll(/from\s+["'](@\/components\/|\.\/components\/)([^"']+)["']/g)
    
    for (const match of importMatches) {
      const importedName = match[2]
      const expectedFile = `${importedName}.tsx`
      const actualFile = fileNames.get(expectedFile.toLowerCase())
      
      if (actualFile && actualFile !== expectedFile) {
        issues.push({
          file: file.path,
          importedAs: importedName,
          actualName: actualFile.replace('.tsx', ''),
          fixPrompt: `CASE-SENSITIVITY FEHLER: Import "${importedName}" stimmt nicht mit Dateiname "${actualFile}" überein. Benenne die Datei in "${importedName}.tsx" um ODER ändere den Import zu "${actualFile.replace('.tsx', '')}".`
        })
      }
    }
  }
  
  return issues
}

// Erweiterte Error-Analyse mit Lösungsvorschlägen
interface ErrorAnalysis {
  errorType: 'syntax' | 'runtime' | 'type' | 'import' | 'case-sensitivity' | 'unknown'
  severity: 'low' | 'medium' | 'high' | 'critical'
  possibleCauses: string[]
  suggestedFixes: string[]
  autoFixPrompt?: string
}

function analyzeError(errorMessage: string): ErrorAnalysis {
  const lowerError = errorMessage.toLowerCase()
  
  // Case-Sensitivity Fehler (PRIORITÄT - häufig bei Deployments!)
  if (lowerError.includes('differs from file name') && lowerError.includes('only in casing')) {
    return {
      errorType: 'case-sensitivity',
      severity: 'critical',
      possibleCauses: ['Dateiname und Import haben unterschiedliche Groß/Kleinschreibung', 'Linux-Server sind case-sensitive'],
      suggestedFixes: ['Dateiname in PascalCase umbenennen (z.B. SearchBar.tsx)', 'Import-Pfad exakt an Dateiname anpassen'],
      autoFixPrompt: 'CASE-SENSITIVITY FEHLER! Der Dateiname stimmt nicht mit dem Import überein. Benenne ALLE Komponenten-Dateien in PascalCase um (z.B. SearchBar.tsx, ContactList.tsx) und passe die Imports entsprechend an. Dateiname und Import müssen EXAKT übereinstimmen!'
    }
  }
  
  // FEHLENDE DATEI - "Failed to resolve import" (HÄUFIGSTER FEHLER!)
  if (lowerError.includes('failed to resolve import') || lowerError.includes('does the file exist')) {
    // Extrahiere den fehlenden Dateipfad aus der Fehlermeldung
    const importMatch = errorMessage.match(/import\s+["']([^"']+)["']/)
    const missingFile = importMatch ? importMatch[1] : 'unbekannt'
    
    return {
      errorType: 'import',
      severity: 'critical',
      possibleCauses: [
        'Die importierte Datei wurde nicht erstellt',
        'Der Import-Pfad ist falsch',
        'Die Datei hat einen anderen Namen als erwartet'
      ],
      suggestedFixes: [
        'Erstelle die fehlende Datei mit dem korrekten Pfad',
        'Prüfe ob der Import-Pfad korrekt ist',
        'Stelle sicher dass die Komponente exportiert wird'
      ],
      autoFixPrompt: `KRITISCHER FEHLER: Die Datei "${missingFile}" existiert NICHT aber wird importiert!

Du MUSST diese Datei JETZT erstellen:
1. Erstelle die Datei mit EXAKT diesem Pfad: ${missingFile}.tsx
2. Implementiere die Komponente/Funktion die dort erwartet wird
3. Exportiere sie mit "export function/const ComponentName"

WICHTIG: Gib ALLE Dateien aus - auch die bereits existierenden - damit nichts fehlt!
Prüfe JEDEN Import und stelle sicher dass die Datei existiert!`
    }
  }
  
  // Import-Fehler (allgemein)
  if (lowerError.includes('cannot find module') || lowerError.includes('module not found')) {
    return {
      errorType: 'import',
      severity: 'high',
      possibleCauses: ['Fehlender Import', 'Falscher Pfad', 'Package nicht installiert'],
      suggestedFixes: ['Import-Pfad prüfen', 'Fehlende Datei erstellen', 'Package installieren'],
      autoFixPrompt: 'Prüfe und korrigiere alle Imports. Erstelle fehlende Dateien.'
    }
  }
  
  // Type-Fehler
  if (lowerError.includes('type') && (lowerError.includes('not assignable') || lowerError.includes('missing'))) {
    return {
      errorType: 'type',
      severity: 'medium',
      possibleCauses: ['Falscher Typ', 'Fehlende Property', 'Inkompatible Typen'],
      suggestedFixes: ['Interface anpassen', 'Typ korrigieren', 'Optional markieren'],
      autoFixPrompt: 'Korrigiere die TypeScript Typen und Interfaces.'
    }
  }
  
  // Syntax-Fehler
  if (lowerError.includes('syntax') || lowerError.includes('unexpected token') || lowerError.includes('parsing')) {
    return {
      errorType: 'syntax',
      severity: 'critical',
      possibleCauses: ['Fehlende Klammer', 'Falsche Syntax', 'Unvollständiger Code'],
      suggestedFixes: ['Klammern prüfen', 'Syntax korrigieren', 'Code vervollständigen'],
      autoFixPrompt: 'Korrigiere den Syntax-Fehler. Prüfe alle Klammern und Semikolons.'
    }
  }
  
  // Runtime-Fehler
  if (lowerError.includes('undefined') || lowerError.includes('null') || lowerError.includes('is not a function')) {
    return {
      errorType: 'runtime',
      severity: 'high',
      possibleCauses: ['Variable nicht initialisiert', 'Objekt ist null/undefined', 'Falsche Funktion'],
      suggestedFixes: ['Optional Chaining verwenden', 'Default-Wert setzen', 'Null-Check hinzufügen'],
      autoFixPrompt: 'Füge Null-Checks und Optional Chaining hinzu. Initialisiere alle Variablen.'
    }
  }
  
  return {
    errorType: 'unknown',
    severity: 'medium',
    possibleCauses: ['Unbekannter Fehler'],
    suggestedFixes: ['Code überprüfen', 'Konsole für Details prüfen'],
    autoFixPrompt: 'Analysiere und behebe den Fehler.'
  }
}

// Automatische Code-Prüfung vor Ausgabe
interface CodeValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  autoFixSuggestions: string[]
}

function validateCodeBeforeOutput(files: { path: string; content: string }[]): CodeValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const autoFixSuggestions: string[] = []
  
  // 1. Import-Validierung
  const missingImports = validateImports(files)
  if (missingImports.length > 0) {
    errors.push(`${missingImports.length} fehlende Dateien: ${missingImports.map(m => m.missingFile).join(', ')}`)
    autoFixSuggestions.push(`Erstelle: ${missingImports.map(m => m.missingFile).join(', ')}`)
  }
  
  // 2. Case-Sensitivity Prüfung
  const caseIssues = validateCaseSensitivity(files)
  if (caseIssues.length > 0) {
    errors.push(`Case-Sensitivity Probleme: ${caseIssues.map(c => c.importedAs).join(', ')}`)
    autoFixSuggestions.push('Benenne Dateien in PascalCase um')
  }
  
  // 3. Export-Prüfung
  for (const file of files) {
    if (file.path.includes('components/') && !file.content.includes('export')) {
      errors.push(`${file.path}: Kein Export gefunden`)
      autoFixSuggestions.push(`Füge 'export' zu ${file.path} hinzu`)
    }
  }
  
  // 4. React Hooks Regeln
  for (const file of files) {
    // Hooks außerhalb von Komponenten
    if (file.content.includes('useState') || file.content.includes('useEffect')) {
      const hasComponent = file.content.includes('function') || file.content.includes('const')
      if (!hasComponent) {
        warnings.push(`${file.path}: Hooks müssen in Komponenten verwendet werden`)
      }
    }
    
    // useEffect ohne Dependencies
    const effectMatches = file.content.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]+\}\s*\)/g)
    if (effectMatches) {
      warnings.push(`${file.path}: useEffect ohne Dependency Array gefunden`)
    }
  }
  
  // 5. Doppelte Komponenten-Namen
  const componentNames = new Map<string, string[]>()
  for (const file of files) {
    const matches = file.content.matchAll(/export\s+(?:function|const)\s+(\w+)/g)
    for (const match of matches) {
      const name = match[1]
      if (!componentNames.has(name)) {
        componentNames.set(name, [])
      }
      componentNames.get(name)!.push(file.path)
    }
  }
  for (const [name, paths] of componentNames) {
    if (paths.length > 1) {
      errors.push(`Doppelte Komponente "${name}" in: ${paths.join(', ')}`)
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    autoFixSuggestions
  }
}

// Intelligente Follow-Up Fragen basierend auf Kontext (erweitert)
interface SmartFollowUpQuestion {
  question: string
  context: string
  priority: 'low' | 'medium' | 'high'
}

function generateSmartFollowUpQuestions(
  userRequest: string,
  files: { path: string; content: string }[],
  projectType: ProjectType
): SmartFollowUpQuestion[] {
  const questions: SmartFollowUpQuestion[] = []
  const lowerRequest = userRequest.toLowerCase()
  const allContent = files.map(f => f.content).join('\n')
  
  // Wenn Formular erwähnt aber keine Validierung
  if ((lowerRequest.includes('form') || lowerRequest.includes('formular')) && 
      !allContent.includes('validate') && !allContent.includes('zod')) {
    questions.push({
      question: 'Soll ich Formular-Validierung hinzufügen?',
      context: 'Formular ohne Validierung erkannt',
      priority: 'high'
    })
  }
  
  // Wenn Daten aber kein Persistenz
  if ((lowerRequest.includes('speicher') || lowerRequest.includes('daten')) && 
      !allContent.includes('localStorage') && !allContent.includes('fetch')) {
    questions.push({
      question: 'Sollen die Daten persistent gespeichert werden (localStorage/Backend)?',
      context: 'Keine Datenpersistenz erkannt',
      priority: 'medium'
    })
  }
  
  // Wenn Liste aber keine Pagination
  if (allContent.includes('.map(') && !allContent.includes('page') && 
      (lowerRequest.includes('liste') || lowerRequest.includes('list'))) {
    questions.push({
      question: 'Soll ich Pagination für lange Listen hinzufügen?',
      context: 'Liste ohne Pagination',
      priority: 'low'
    })
  }
  
  // Projekttyp-spezifische Fragen
  if (projectType === 'ecommerce' && !allContent.includes('cart')) {
    questions.push({
      question: 'Soll ich einen Warenkorb hinzufügen?',
      context: 'E-Commerce ohne Warenkorb',
      priority: 'high'
    })
  }
  
  if (projectType === 'dashboard' && !allContent.includes('Chart') && !allContent.includes('recharts')) {
    questions.push({
      question: 'Soll ich Charts/Grafiken für das Dashboard hinzufügen?',
      context: 'Dashboard ohne Visualisierungen',
      priority: 'medium'
    })
  }
  
  return questions.slice(0, 3)
}

// Erweiterte Iteration-Logik mit Kontext
interface IterationContext {
  iterationCount: number
  previousErrors: string[]
  previousRequests: string[]
  unchangedFiles: string[]
  improvedAreas: string[]
}

function analyzeIterationContext(
  currentFiles: { path: string; content: string }[],
  previousFiles: { path: string; content: string }[],
  errorHistory: string[]
): IterationContext {
  // Finde unveränderte Dateien
  const unchangedFiles: string[] = []
  for (const current of currentFiles) {
    const prev = previousFiles.find(p => p.path === current.path)
    if (prev && prev.content === current.content) {
      unchangedFiles.push(current.path)
    }
  }
  
  // Analysiere verbesserte Bereiche
  const improvedAreas: string[] = []
  const currentContent = currentFiles.map(f => f.content).join('\n')
  const prevContent = previousFiles.map(f => f.content).join('\n')
  
  if (!prevContent.includes('loading') && currentContent.includes('loading')) {
    improvedAreas.push('Loading States')
  }
  if (!prevContent.includes('try') && currentContent.includes('try')) {
    improvedAreas.push('Error Handling')
  }
  if (!prevContent.includes('aria-') && currentContent.includes('aria-')) {
    improvedAreas.push('Accessibility')
  }
  
  return {
    iterationCount: errorHistory.length,
    previousErrors: errorHistory.slice(-3),
    previousRequests: [],
    unchangedFiles,
    improvedAreas
  }
}

// Generiere intelligenten Iteration-Prompt
function generateIterationPrompt(context: IterationContext, currentError?: string): string {
  let prompt = ''
  
  // Wenn derselbe Fehler mehrfach auftritt
  if (currentError && context.previousErrors.includes(currentError)) {
    prompt += `
⚠️ ACHTUNG: Dieser Fehler trat bereits auf und wurde nicht korrekt behoben!
Vorherige Versuche waren nicht erfolgreich. Bitte:
1. Analysiere das Problem GRÜNDLICH
2. Prüfe ALLE Dateien auf Konsistenz
3. Stelle sicher dass ALLE Imports existieren
4. Gib ALLE Dateien vollständig aus

`
  }
  
  // Wenn zu viele Iterationen
  if (context.iterationCount > 3) {
    prompt += `
🔄 Dies ist bereits Iteration ${context.iterationCount + 1}.
Konzentriere dich auf:
- NUR den aktuellen Fehler beheben
- Keine neuen Features hinzufügen
- Vollständige, lauffähige Dateien

`
  }
  
  // Wenn Dateien unverändert blieben (Problem nicht gefunden)
  if (context.unchangedFiles.length > 0 && context.iterationCount > 1) {
    prompt += `
📁 Diese Dateien blieben unverändert obwohl der Fehler besteht:
${context.unchangedFiles.map(f => `- ${f}`).join('\n')}
Prüfe ob der Fehler in einer dieser Dateien liegt!

`
  }
  
  return prompt
}

// Erkennt wiederkehrende Fehler-Muster
interface ErrorPattern {
  pattern: string
  occurrences: number
  suggestedAction: string
}

function detectErrorPatterns(errorHistory: string[]): ErrorPattern[] {
  const patterns: ErrorPattern[] = []
  const errorCounts = new Map<string, number>()
  
  for (const error of errorHistory) {
    // Normalisiere Fehler für Vergleich
    const normalized = error
      .replace(/['"][^'"]+['"]/g, '"X"')
      .replace(/\d+/g, 'N')
      .substring(0, 100)
    
    errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1)
  }
  
  for (const [pattern, count] of errorCounts) {
    if (count >= 2) {
      let suggestedAction = 'Analysiere das wiederkehrende Problem'
      
      if (pattern.includes('import') || pattern.includes('resolve')) {
        suggestedAction = 'Prüfe ALLE Imports und erstelle fehlende Dateien'
      } else if (pattern.includes('type') || pattern.includes('Type')) {
        suggestedAction = 'Korrigiere TypeScript Typen und Interfaces'
      } else if (pattern.includes('undefined') || pattern.includes('null')) {
        suggestedAction = 'Füge Null-Checks und Default-Werte hinzu'
      }
      
      patterns.push({ pattern, occurrences: count, suggestedAction })
    }
  }
  
  return patterns
}

// Smart Error Prevention - Häufige Fehler vorab erkennen
interface PotentialIssue {
  type: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
  prevention: string
}

function detectPotentialIssues(files: { path: string; content: string }[]): PotentialIssue[] {
  const issues: PotentialIssue[] = []
  
  for (const file of files) {
    const lines = file.content.split('\n')
    
    // 1. Async ohne await
    if (file.content.includes('async') && !file.content.includes('await')) {
      issues.push({
        type: 'warning',
        message: 'async Funktion ohne await',
        file: file.path,
        prevention: 'Entferne async oder füge await hinzu'
      })
    }
    
    // 2. console.log in Produktion
    const consoleCount = (file.content.match(/console\.(log|warn|error)/g) || []).length
    if (consoleCount > 3) {
      issues.push({
        type: 'info',
        message: `${consoleCount} console Statements gefunden`,
        file: file.path,
        prevention: 'Entferne console Statements für Produktion'
      })
    }
    
    // 3. Hardcoded Strings die übersetzt werden sollten
    const hardcodedStrings = file.content.match(/["'](Fehler|Error|Erfolgreich|Success|Laden|Loading)["']/g)
    if (hardcodedStrings && hardcodedStrings.length > 2) {
      issues.push({
        type: 'info',
        message: 'Hardcoded UI-Texte gefunden',
        file: file.path,
        prevention: 'Erwäge i18n für Mehrsprachigkeit'
      })
    }
    
    // 4. Fehlende Key Props in Listen
    if (file.content.includes('.map(') && !file.content.includes('key=')) {
      issues.push({
        type: 'error',
        message: 'map() ohne key prop',
        file: file.path,
        prevention: 'Füge key={uniqueId} zu jedem Element hinzu'
      })
    }
    
    // 5. useEffect mit fehlenden Dependencies
    const effectRegex = /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\s*\]\s*\)/g
    const effectContent = file.content.match(effectRegex)
    if (effectContent) {
      for (const effect of effectContent) {
        // Prüfe ob State-Variablen im Effect verwendet werden
        const usedVars = effect.match(/\b(set\w+|use\w+)\b/g)
        if (usedVars && usedVars.length > 0) {
          issues.push({
            type: 'warning',
            message: 'useEffect mit leerem Dependency Array verwendet State',
            file: file.path,
            prevention: 'Füge verwendete Variablen zum Dependency Array hinzu'
          })
        }
      }
    }
  }
  
  return issues.slice(0, 5)
}

// Code-Qualitäts-Feedback in Echtzeit
interface QualityFeedback {
  category: 'structure' | 'performance' | 'security' | 'maintainability' | 'ux'
  score: number
  feedback: string
  improvement?: string
}

function generateQualityFeedback(files: { path: string; content: string }[]): QualityFeedback[] {
  const feedback: QualityFeedback[] = []
  const allContent = files.map(f => f.content).join('\n')
  
  // Struktur-Bewertung
  const componentCount = files.filter(f => f.path.includes('components/')).length
  const avgLinesPerFile = files.reduce((sum, f) => sum + f.content.split('\n').length, 0) / files.length
  
  feedback.push({
    category: 'structure',
    score: componentCount > 0 && avgLinesPerFile < 200 ? 90 : componentCount > 0 ? 70 : 50,
    feedback: componentCount > 0 
      ? `${componentCount} Komponenten, Ø ${Math.round(avgLinesPerFile)} Zeilen/Datei`
      : 'Keine Komponenten-Struktur erkannt',
    improvement: avgLinesPerFile > 200 ? 'Große Dateien in kleinere Module aufteilen' : undefined
  })
  
  // Performance-Bewertung
  const hasUseMemo = allContent.includes('useMemo')
  const hasUseCallback = allContent.includes('useCallback')
  const hasLazyLoading = allContent.includes('lazy(') || allContent.includes('Suspense')
  const perfScore = (hasUseMemo ? 30 : 0) + (hasUseCallback ? 30 : 0) + (hasLazyLoading ? 40 : 0)
  
  feedback.push({
    category: 'performance',
    score: Math.max(50, perfScore),
    feedback: perfScore > 60 ? 'Performance-Optimierungen vorhanden' : 'Basis-Performance',
    improvement: !hasUseMemo ? 'useMemo für teure Berechnungen nutzen' : undefined
  })
  
  // Security-Bewertung
  const hasDangerousHtml = allContent.includes('dangerouslySetInnerHTML')
  const hasHardcodedSecrets = /['"]sk-[a-zA-Z0-9]+['"]|['"]api[_-]?key['"].*[:=].*['"][^'"]+['"]/i.test(allContent)
  const securityScore = 100 - (hasDangerousHtml ? 30 : 0) - (hasHardcodedSecrets ? 50 : 0)
  
  feedback.push({
    category: 'security',
    score: securityScore,
    feedback: securityScore === 100 ? 'Keine offensichtlichen Sicherheitsprobleme' : 'Sicherheitsrisiken erkannt',
    improvement: hasDangerousHtml ? 'dangerouslySetInnerHTML vermeiden' : 
                 hasHardcodedSecrets ? 'Secrets in Umgebungsvariablen auslagern' : undefined
  })
  
  // Maintainability-Bewertung
  const hasTypes = allContent.includes('interface') || allContent.includes('type ')
  const hasComments = (allContent.match(/\/\/|\/\*|\*\//g) || []).length > 5
  const hasConsistentNaming = !allContent.match(/const [a-z]+[A-Z].*=.*useState/g) // camelCase für State
  const maintScore = (hasTypes ? 40 : 0) + (hasComments ? 30 : 0) + (hasConsistentNaming ? 30 : 0)
  
  feedback.push({
    category: 'maintainability',
    score: Math.max(40, maintScore),
    feedback: hasTypes ? 'TypeScript Typen vorhanden' : 'Typisierung fehlt',
    improvement: !hasTypes ? 'Interfaces für Props und State definieren' : undefined
  })
  
  // UX-Bewertung
  const hasLoadingStates = allContent.includes('loading') || allContent.includes('Skeleton')
  const hasErrorStates = allContent.includes('error') && allContent.includes('Error')
  const hasEmptyStates = allContent.includes('empty') || allContent.includes('keine') || allContent.includes('No ')
  const uxScore = (hasLoadingStates ? 35 : 0) + (hasErrorStates ? 35 : 0) + (hasEmptyStates ? 30 : 0)
  
  feedback.push({
    category: 'ux',
    score: Math.max(30, uxScore),
    feedback: uxScore > 70 ? 'Gute UX-States implementiert' : 'UX-States verbesserungswürdig',
    improvement: !hasLoadingStates ? 'Loading States für async Operationen' : 
                 !hasErrorStates ? 'Error States für Fehlerbehandlung' : undefined
  })
  
  return feedback
}

// Automatische Architektur-Empfehlungen
interface ArchitectureRecommendation {
  type: 'pattern' | 'structure' | 'separation' | 'optimization'
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  codeExample?: string
}

function generateArchitectureRecommendations(files: { path: string; content: string }[]): ArchitectureRecommendation[] {
  const recommendations: ArchitectureRecommendation[] = []
  const allContent = files.map(f => f.content).join('\n')
  
  // Check für fehlende Custom Hooks
  const stateCount = (allContent.match(/useState/g) || []).length
  const hookFiles = files.filter(f => f.path.includes('/hooks/'))
  
  if (stateCount > 5 && hookFiles.length === 0) {
    recommendations.push({
      type: 'separation',
      title: 'Custom Hooks extrahieren',
      description: `${stateCount} useState gefunden aber keine Custom Hooks. Extrahiere wiederverwendbare Logik.`,
      priority: 'medium',
      codeExample: `// hooks/useFormState.ts
export function useFormState<T>(initial: T) {
  const [data, setData] = useState(initial)
  const [errors, setErrors] = useState({})
  return { data, setData, errors, setErrors }
}`
    })
  }
  
  // Check für Context Usage
  const propsCount = (allContent.match(/props\./g) || []).length
  const hasContext = allContent.includes('createContext') || allContent.includes('useContext')
  
  if (propsCount > 20 && !hasContext) {
    recommendations.push({
      type: 'pattern',
      title: 'React Context einführen',
      description: 'Viele Props werden durchgereicht. Context kann Prop Drilling reduzieren.',
      priority: 'medium'
    })
  }
  
  // Check für Service Layer
  const fetchCount = (allContent.match(/fetch\(|axios\./g) || []).length
  const hasServiceLayer = files.some(f => f.path.includes('/services/') || f.path.includes('/api/'))
  
  if (fetchCount > 3 && !hasServiceLayer) {
    recommendations.push({
      type: 'structure',
      title: 'Service Layer einführen',
      description: 'API-Aufrufe in separaten Service-Dateien organisieren.',
      priority: 'high',
      codeExample: `// services/api.ts
export const api = {
  async getItems() { return fetch('/api/items').then(r => r.json()) },
  async createItem(data) { return fetch('/api/items', { method: 'POST', body: JSON.stringify(data) }) }
}`
    })
  }
  
  // Check für Error Boundary
  const hasErrorBoundary = allContent.includes('ErrorBoundary') || allContent.includes('error.tsx')
  if (!hasErrorBoundary && files.length > 5) {
    recommendations.push({
      type: 'pattern',
      title: 'Error Boundary hinzufügen',
      description: 'Fehler in Komponenten abfangen für bessere Stabilität.',
      priority: 'medium'
    })
  }
  
  return recommendations.slice(0, 4)
}

// Smart Refactoring Detector
interface RefactoringOpportunity {
  type: 'extract-component' | 'extract-hook' | 'simplify' | 'dry' | 'modernize'
  file: string
  description: string
  benefit: string
  effort: 'low' | 'medium' | 'high'
}

function detectRefactoringOpportunities(files: { path: string; content: string }[]): RefactoringOpportunity[] {
  const opportunities: RefactoringOpportunity[] = []
  
  for (const file of files) {
    const lines = file.content.split('\n')
    
    // Lange Dateien → Extract Components
    if (lines.length > 250) {
      opportunities.push({
        type: 'extract-component',
        file: file.path,
        description: `Datei hat ${lines.length} Zeilen`,
        benefit: 'Bessere Lesbarkeit und Wiederverwendbarkeit',
        effort: 'medium'
      })
    }
    
    // Mehrere useState → Extract Hook
    const useStateMatches = file.content.match(/useState/g)
    if (useStateMatches && useStateMatches.length > 4) {
      opportunities.push({
        type: 'extract-hook',
        file: file.path,
        description: `${useStateMatches.length} useState Aufrufe`,
        benefit: 'Logik kapseln und wiederverwenden',
        effort: 'low'
      })
    }
    
    // Verschachtelte Ternaries → Simplify
    if (file.content.match(/\?.*\?.*\?/)) {
      opportunities.push({
        type: 'simplify',
        file: file.path,
        description: 'Verschachtelte Ternary-Operatoren',
        benefit: 'Bessere Lesbarkeit',
        effort: 'low'
      })
    }
    
    // Class Components → Modernize
    if (file.content.includes('extends Component') || file.content.includes('extends React.Component')) {
      opportunities.push({
        type: 'modernize',
        file: file.path,
        description: 'Class Component gefunden',
        benefit: 'Zu Function Component mit Hooks migrieren',
        effort: 'medium'
      })
    }
  }
  
  // DRY - Duplizierter Code über Dateien
  const codeBlocks = new Map<string, string[]>()
  for (const file of files) {
    const blocks = file.content.match(/\{[^{}]{100,300}\}/g) || []
    for (const block of blocks) {
      const normalized = block.replace(/\s+/g, ' ')
      if (!codeBlocks.has(normalized)) {
        codeBlocks.set(normalized, [])
      }
      codeBlocks.get(normalized)!.push(file.path)
    }
  }
  
  for (const [_, paths] of codeBlocks) {
    if (paths.length > 1) {
      opportunities.push({
        type: 'dry',
        file: paths[0],
        description: `Ähnlicher Code in ${paths.length} Dateien`,
        benefit: 'Code-Duplikation eliminieren',
        effort: 'medium'
      })
      break // Nur eine DRY-Warnung
    }
  }
  
  return opportunities.slice(0, 5)
}

// Performance-Analyse
interface PerformanceIssue {
  type: 'render' | 'memory' | 'bundle' | 'network'
  severity: 'low' | 'medium' | 'high'
  description: string
  solution: string
  file?: string
}

function analyzePerformance(files: { path: string; content: string }[]): PerformanceIssue[] {
  const issues: PerformanceIssue[] = []
  
  for (const file of files) {
    // Inline Objects in JSX (cause re-renders)
    if (file.content.match(/style=\{\{/g)?.length || 0 > 5) {
      issues.push({
        type: 'render',
        severity: 'medium',
        description: 'Viele inline style Objects',
        solution: 'Style Objects außerhalb der Komponente definieren',
        file: file.path
      })
    }
    
    // Inline Functions in JSX
    const inlineFunctions = file.content.match(/onClick=\{\(\)\s*=>/g)
    if (inlineFunctions && inlineFunctions.length > 3) {
      issues.push({
        type: 'render',
        severity: 'medium',
        description: `${inlineFunctions.length} inline onClick Handler`,
        solution: 'useCallback für Event Handler nutzen',
        file: file.path
      })
    }
    
    // Large Arrays in State
    if (file.content.match(/useState\(\[[\s\S]{500,}\]\)/)) {
      issues.push({
        type: 'memory',
        severity: 'medium',
        description: 'Großes Array im State initialisiert',
        solution: 'Große Daten lazy laden oder paginieren',
        file: file.path
      })
    }
    
    // Missing Keys in map
    if (file.content.includes('.map(') && !file.content.includes('key=')) {
      issues.push({
        type: 'render',
        severity: 'high',
        description: 'map() ohne key prop',
        solution: 'Eindeutige key für jedes Element setzen',
        file: file.path
      })
    }
  }
  
  // Bundle Size - große Imports
  const allContent = files.map(f => f.content).join('\n')
  if (allContent.includes("import moment") || allContent.includes("from 'moment'")) {
    issues.push({
      type: 'bundle',
      severity: 'medium',
      description: 'moment.js importiert (groß)',
      solution: 'date-fns oder dayjs als leichtere Alternative'
    })
  }
  
  if (allContent.includes("import _ from 'lodash'") || allContent.includes('import * as _ from')) {
    issues.push({
      type: 'bundle',
      severity: 'medium',
      description: 'Gesamtes lodash importiert',
      solution: 'Nur benötigte Funktionen importieren: import { debounce } from "lodash"'
    })
  }
  
  return issues.slice(0, 5)
}

// Projekt-Health-Check - Umfassende Analyse
interface HealthCheckResult {
  overall: 'healthy' | 'warning' | 'critical'
  score: number
  checks: { name: string; status: 'pass' | 'warn' | 'fail'; message: string }[]
}

function performHealthCheck(files: { path: string; content: string }[]): HealthCheckResult {
  const checks: { name: string; status: 'pass' | 'warn' | 'fail'; message: string }[] = []
  let score = 100
  
  const allContent = files.map(f => f.content).join('\n')
  
  // Check 1: TypeScript Usage
  const hasTypeScript = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'))
  checks.push({
    name: 'TypeScript',
    status: hasTypeScript ? 'pass' : 'warn',
    message: hasTypeScript ? 'TypeScript wird verwendet' : 'Erwäge TypeScript für Typsicherheit'
  })
  if (!hasTypeScript) score -= 10
  
  // Check 2: Error Handling
  const hasErrorHandling = allContent.includes('try') && allContent.includes('catch')
  checks.push({
    name: 'Error Handling',
    status: hasErrorHandling ? 'pass' : 'warn',
    message: hasErrorHandling ? 'Error Handling vorhanden' : 'Füge try/catch für Fehlerbehandlung hinzu'
  })
  if (!hasErrorHandling) score -= 10
  
  // Check 3: Loading States
  const hasLoadingStates = allContent.includes('loading') || allContent.includes('isLoading') || allContent.includes('Skeleton')
  checks.push({
    name: 'Loading States',
    status: hasLoadingStates ? 'pass' : 'warn',
    message: hasLoadingStates ? 'Loading States implementiert' : 'Füge Loading States für bessere UX hinzu'
  })
  if (!hasLoadingStates) score -= 5
  
  // Check 4: Accessibility
  const hasA11y = allContent.includes('aria-') || allContent.includes('role=')
  checks.push({
    name: 'Accessibility',
    status: hasA11y ? 'pass' : 'warn',
    message: hasA11y ? 'Accessibility Attribute vorhanden' : 'Füge aria-labels hinzu'
  })
  if (!hasA11y) score -= 10
  
  // Check 5: Console Logs
  const consoleLogs = (allContent.match(/console\.(log|warn|error)/g) || []).length
  checks.push({
    name: 'Console Logs',
    status: consoleLogs < 3 ? 'pass' : consoleLogs < 10 ? 'warn' : 'fail',
    message: consoleLogs < 3 ? 'Wenig Console Logs' : `${consoleLogs} Console Logs - vor Production entfernen`
  })
  if (consoleLogs >= 10) score -= 15
  else if (consoleLogs >= 3) score -= 5
  
  // Check 6: Component Structure
  const componentFiles = files.filter(f => f.path.includes('components/'))
  checks.push({
    name: 'Komponenten-Struktur',
    status: componentFiles.length > 0 ? 'pass' : 'warn',
    message: componentFiles.length > 0 ? `${componentFiles.length} Komponenten in /components` : 'Extrahiere Komponenten in /components Ordner'
  })
  if (componentFiles.length === 0 && files.length > 2) score -= 10
  
  // Determine overall health
  let overall: 'healthy' | 'warning' | 'critical'
  if (score >= 80) overall = 'healthy'
  else if (score >= 50) overall = 'warning'
  else overall = 'critical'
  
  return { overall, score, checks }
}

// Erweiterte Prompt-Intelligenz - Interpretiert User-Anfragen besser
interface InterpretedRequest {
  type: 'create' | 'extend' | 'fix' | 'refactor' | 'style' | 'feature' | 'question'
  confidence: number
  suggestedActions: string[]
  clarificationNeeded?: string
  detectedEntities: string[]
}

function interpretUserRequest(request: string, existingFiles: { path: string; content: string }[]): InterpretedRequest {
  const lower = request.toLowerCase()
  const hasFiles = existingFiles.length > 0
  
  // Erkenne Request-Typ
  let type: InterpretedRequest['type'] = 'create'
  let confidence = 0.7
  
  // Fix/Error Keywords
  if (lower.match(/fehler|error|bug|fix|korrigier|beheb|funktioniert nicht|geht nicht|broken/)) {
    type = 'fix'
    confidence = 0.9
  }
  // Extend/Add Keywords
  else if (lower.match(/füge.*hinzu|add|erweitere|ergänze|hinzufügen|neue.*funktion|implementiere/)) {
    type = 'extend'
    confidence = 0.85
  }
  // Style/Design Keywords
  else if (lower.match(/design|style|aussehen|schöner|modern|ui|ux|farbe|layout/)) {
    type = 'style'
    confidence = 0.85
  }
  // Refactor Keywords
  else if (lower.match(/refactor|aufräumen|verbessern|optimier|clean|struktur/)) {
    type = 'refactor'
    confidence = 0.8
  }
  // Question Keywords
  else if (lower.match(/wie|warum|was|kannst du|ist es möglich|erklär/)) {
    type = 'question'
    confidence = 0.75
  }
  // Feature Keywords
  else if (lower.match(/feature|funktion|möglichkeit|option/)) {
    type = 'feature'
    confidence = 0.8
  }
  // Create wenn keine Files existieren
  else if (!hasFiles) {
    type = 'create'
    confidence = 0.9
  }
  
  // Erkenne Entities (Komponenten, Features, etc.)
  const detectedEntities: string[] = []
  
  // UI-Komponenten
  const uiPatterns = [
    'button', 'form', 'input', 'modal', 'dialog', 'sidebar', 'navbar', 'header', 'footer',
    'card', 'list', 'table', 'grid', 'calendar', 'chart', 'graph', 'dashboard',
    'menu', 'dropdown', 'tabs', 'accordion', 'carousel', 'slider', 'pagination'
  ]
  for (const pattern of uiPatterns) {
    if (lower.includes(pattern)) detectedEntities.push(pattern)
  }
  
  // Features
  const featurePatterns = [
    'suche', 'search', 'filter', 'sort', 'login', 'auth', 'upload', 'download',
    'dark mode', 'theme', 'notification', 'toast', 'drag', 'drop', 'export', 'import'
  ]
  for (const pattern of featurePatterns) {
    if (lower.includes(pattern)) detectedEntities.push(pattern)
  }
  
  // Generiere Vorschläge basierend auf Typ
  const suggestedActions: string[] = []
  
  switch (type) {
    case 'fix':
      suggestedActions.push('Fehler analysieren und Ursache identifizieren')
      suggestedActions.push('Minimale Änderung zur Behebung')
      suggestedActions.push('Alle betroffenen Dateien vollständig ausgeben')
      break
    case 'extend':
      suggestedActions.push('Bestehenden Code analysieren')
      suggestedActions.push('Neue Komponente/Funktion hinzufügen')
      suggestedActions.push('Integration in bestehende Struktur')
      break
    case 'style':
      suggestedActions.push('Premium Design System anwenden')
      suggestedActions.push('Konsistente Farben und Abstände')
      suggestedActions.push('Hover/Active States hinzufügen')
      break
    case 'create':
      suggestedActions.push('Projektstruktur planen')
      suggestedActions.push('Alle Komponenten erstellen')
      suggestedActions.push('Premium Design von Anfang an')
      break
  }
  
  // Prüfe ob Klärung nötig ist
  let clarificationNeeded: string | undefined
  if (confidence < 0.7) {
    clarificationNeeded = 'Bitte präzisiere deine Anfrage'
  }
  if (type === 'extend' && detectedEntities.length === 0) {
    clarificationNeeded = 'Was genau soll hinzugefügt werden?'
  }
  
  return { type, confidence, suggestedActions, clarificationNeeded, detectedEntities }
}

// Automatische Code-Snippets für häufige Patterns
interface CodeSnippet {
  name: string
  description: string
  code: string
  imports: string[]
}

function getCodeSnippetsForPattern(pattern: string): CodeSnippet[] {
  const snippets: Record<string, CodeSnippet[]> = {
    'search': [{
      name: 'SearchInput mit Debounce',
      description: 'Suchfeld mit 300ms Debounce',
      code: `const [searchTerm, setSearchTerm] = useState('')
const [debouncedTerm, setDebouncedTerm] = useState('')

useEffect(() => {
  const timer = setTimeout(() => setDebouncedTerm(searchTerm), 300)
  return () => clearTimeout(timer)
}, [searchTerm])

const filteredItems = items.filter(item => 
  item.name.toLowerCase().includes(debouncedTerm.toLowerCase())
)`,
      imports: ['useState', 'useEffect']
    }],
    'modal': [{
      name: 'Modal Component',
      description: 'Wiederverwendbares Modal',
      code: `function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-zinc-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}`,
      imports: []
    }],
    'toast': [{
      name: 'Toast Notification',
      description: 'Einfache Toast-Benachrichtigung',
      code: `const [toasts, setToasts] = useState([])

const showToast = (message, type = 'info') => {
  const id = Date.now()
  setToasts(prev => [...prev, { id, message, type }])
  setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
}

// In JSX:
<div className="fixed bottom-4 right-4 space-y-2">
  {toasts.map(toast => (
    <div key={toast.id} className={\`px-4 py-3 rounded-xl \${
      toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
      toast.type === 'error' ? 'bg-red-500/20 text-red-400' :
      'bg-blue-500/20 text-blue-400'
    }\`}>{toast.message}</div>
  ))}
</div>`,
      imports: ['useState']
    }],
    'loading': [{
      name: 'Loading Skeleton',
      description: 'Animierte Skeleton-Loader',
      code: `function Skeleton({ className }) {
  return (
    <div className={\`animate-pulse bg-zinc-800 rounded \${className}\`} />
  )
}

// Verwendung:
{isLoading ? (
  <div className="space-y-3">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-20 w-full" />
  </div>
) : (
  <ActualContent />
)}`,
      imports: []
    }],
    'form': [{
      name: 'Form mit Validierung',
      description: 'Kontrolliertes Formular',
      code: `const [formData, setFormData] = useState({ name: '', email: '' })
const [errors, setErrors] = useState({})

const validate = () => {
  const newErrors = {}
  if (!formData.name) newErrors.name = 'Name ist erforderlich'
  if (!formData.email) newErrors.email = 'Email ist erforderlich'
  else if (!/\\S+@\\S+\\.\\S+/.test(formData.email)) newErrors.email = 'Email ungültig'
  setErrors(newErrors)
  return Object.keys(newErrors).length === 0
}

const handleSubmit = (e) => {
  e.preventDefault()
  if (validate()) {
    // Submit logic
  }
}`,
      imports: ['useState']
    }],
    'pagination': [{
      name: 'Pagination',
      description: 'Einfache Seiten-Navigation',
      code: `const [currentPage, setCurrentPage] = useState(1)
const itemsPerPage = 10

const totalPages = Math.ceil(items.length / itemsPerPage)
const paginatedItems = items.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
)

// In JSX:
<div className="flex gap-2 justify-center mt-6">
  <button 
    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
    disabled={currentPage === 1}
    className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-50"
  >←</button>
  <span className="px-3 py-1">{currentPage} / {totalPages}</span>
  <button
    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
    disabled={currentPage === totalPages}
    className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-50"
  >→</button>
</div>`,
      imports: ['useState']
    }],
    'darkmode': [{
      name: 'Dark Mode Toggle',
      description: 'Theme Switcher',
      code: `const [isDark, setIsDark] = useState(true)

useEffect(() => {
  document.documentElement.classList.toggle('dark', isDark)
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}, [isDark])

// Button:
<button 
  onClick={() => setIsDark(!isDark)}
  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
>
  {isDark ? '☀️' : '🌙'}
</button>`,
      imports: ['useState', 'useEffect']
    }]
  }
  
  return snippets[pattern] || []
}

// Smart State Management Empfehlungen
interface StateRecommendation {
  current: string
  recommendation: string
  reason: string
  codeExample?: string
}

function analyzeStateManagement(files: { path: string; content: string }[]): StateRecommendation[] {
  const recommendations: StateRecommendation[] = []
  const allContent = files.map(f => f.content).join('\n')
  
  const useStateCount = (allContent.match(/useState/g) || []).length
  const useContextCount = (allContent.match(/useContext/g) || []).length
  const useReducerCount = (allContent.match(/useReducer/g) || []).length
  const zustandCount = (allContent.match(/create\(|useStore/g) || []).length
  
  // Zu viele useState → useReducer empfehlen
  if (useStateCount > 8 && useReducerCount === 0) {
    recommendations.push({
      current: `${useStateCount} useState Aufrufe`,
      recommendation: 'useReducer für komplexen State',
      reason: 'Zentralisiert State-Logik und macht Updates vorhersehbarer',
      codeExample: `const [state, dispatch] = useReducer(reducer, initialState)
// dispatch({ type: 'ADD_ITEM', payload: item })`
    })
  }
  
  // Prop Drilling → Context empfehlen
  const propsDepth = (allContent.match(/props\./g) || []).length
  if (propsDepth > 15 && useContextCount === 0) {
    recommendations.push({
      current: 'Props werden durchgereicht',
      recommendation: 'React Context für globalen State',
      reason: 'Vermeidet Prop Drilling durch Komponenten-Hierarchie'
    })
  }
  
  // Viel State + Context → Zustand empfehlen
  if (useStateCount > 12 && useContextCount > 0 && zustandCount === 0) {
    recommendations.push({
      current: 'Viel lokaler State + Context',
      recommendation: 'Zustand für State Management',
      reason: 'Einfacher als Redux, performanter als Context bei häufigen Updates',
      codeExample: `const useStore = create((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] }))
}))`
    })
  }
  
  // Async State ohne React Query
  const fetchCount = (allContent.match(/fetch\(|axios/g) || []).length
  if (fetchCount > 3 && !allContent.includes('useQuery')) {
    recommendations.push({
      current: `${fetchCount} API-Aufrufe`,
      recommendation: 'Custom Hook für Data Fetching',
      reason: 'Kapselt Loading, Error und Caching-Logik'
    })
  }
  
  return recommendations.slice(0, 3)
}

// Code Complexity Score - Bewertet die Komplexität des Codes
function calculateComplexityScore(files: { path: string; content: string }[]): { score: number; level: string; details: string[] } {
  let complexity = 0
  const details: string[] = []
  
  for (const file of files) {
    const content = file.content
    
    // Zähle Komplexitätsfaktoren
    const conditionals = (content.match(/if\s*\(|switch\s*\(|\?\s*:/g) || []).length
    const loops = (content.match(/for\s*\(|while\s*\(|\.map\(|\.forEach\(/g) || []).length
    const functions = (content.match(/function\s+\w+|=>\s*{|=>\s*\(/g) || []).length
    const hooks = (content.match(/use[A-Z]\w+/g) || []).length
    
    complexity += conditionals * 2
    complexity += loops * 3
    complexity += functions * 1
    complexity += hooks * 1
  }
  
  // Normalisiere auf 0-100
  const normalizedScore = Math.min(100, Math.round(complexity / files.length))
  
  let level: string
  if (normalizedScore < 20) {
    level = 'Einfach'
    details.push('✅ Gut wartbarer Code')
  } else if (normalizedScore < 40) {
    level = 'Moderat'
    details.push('✅ Angemessene Komplexität')
  } else if (normalizedScore < 60) {
    level = 'Komplex'
    details.push('⚠️ Erwäge Refactoring')
  } else {
    level = 'Sehr komplex'
    details.push('❌ Dringend vereinfachen')
  }
  
  return { score: normalizedScore, level, details }
}

// Intelligente Komponenten-Generierung mit Best Practices
interface ComponentBlueprint {
  name: string
  props: { name: string; type: string; required: boolean }[]
  hooks: string[]
  structure: string
  styling: string
}

function generateComponentBlueprint(componentType: string, projectType: string): ComponentBlueprint {
  const blueprints: Record<string, ComponentBlueprint> = {
    'list': {
      name: 'ItemList',
      props: [
        { name: 'items', type: 'Item[]', required: true },
        { name: 'onItemClick', type: '(item: Item) => void', required: false },
        { name: 'emptyMessage', type: 'string', required: false }
      ],
      hooks: ['useState for selection', 'useMemo for filtering'],
      structure: `
<div className="space-y-2">
  {items.length === 0 ? (
    <EmptyState message={emptyMessage} />
  ) : (
    items.map(item => (
      <div key={item.id} onClick={() => onItemClick?.(item)}
           className="p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/50 cursor-pointer transition-colors">
        {/* Item content */}
      </div>
    ))
  )}
</div>`,
      styling: 'bg-zinc-900/50 hover:bg-zinc-800/50 rounded-xl transition-colors'
    },
    'form': {
      name: 'DataForm',
      props: [
        { name: 'onSubmit', type: '(data: FormData) => void', required: true },
        { name: 'initialData', type: 'Partial<FormData>', required: false },
        { name: 'isLoading', type: 'boolean', required: false }
      ],
      hooks: ['useState for formData', 'useState for errors', 'useCallback for handlers'],
      structure: `
<form onSubmit={handleSubmit} className="space-y-4">
  <div>
    <label className="block text-sm text-zinc-400 mb-1">Name</label>
    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
           className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl" />
    {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
  </div>
  <button type="submit" disabled={isLoading}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl font-semibold">
    {isLoading ? 'Wird gespeichert...' : 'Speichern'}
  </button>
</form>`,
      styling: 'space-y-4'
    },
    'card': {
      name: 'InfoCard',
      props: [
        { name: 'title', type: 'string', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'icon', type: 'ReactNode', required: false },
        { name: 'actions', type: 'ReactNode', required: false }
      ],
      hooks: [],
      structure: `
<div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all">
  <div className="flex items-start gap-4">
    {icon && <div className="text-blue-500">{icon}</div>}
    <div className="flex-1">
      <h3 className="font-semibold text-lg">{title}</h3>
      {description && <p className="text-zinc-400 mt-1">{description}</p>}
    </div>
  </div>
  {actions && <div className="mt-4 pt-4 border-t border-zinc-800">{actions}</div>}
</div>`,
      styling: 'bg-zinc-900/50 border-zinc-800 rounded-2xl hover:border-zinc-700'
    },
    'modal': {
      name: 'Modal',
      props: [
        { name: 'isOpen', type: 'boolean', required: true },
        { name: 'onClose', type: '() => void', required: true },
        { name: 'title', type: 'string', required: true },
        { name: 'children', type: 'ReactNode', required: true }
      ],
      hooks: ['useEffect for escape key', 'useCallback for onClose'],
      structure: `
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg">✕</button>
      </div>
      {children}
    </div>
  </div>
)}`,
      styling: 'bg-zinc-900 border-zinc-800 rounded-2xl shadow-2xl'
    },
    'dashboard-stat': {
      name: 'StatCard',
      props: [
        { name: 'label', type: 'string', required: true },
        { name: 'value', type: 'string | number', required: true },
        { name: 'change', type: 'number', required: false },
        { name: 'icon', type: 'ReactNode', required: false }
      ],
      hooks: [],
      structure: `
<div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
  <div className="flex justify-between items-start">
    <div>
      <p className="text-zinc-400 text-sm">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {change !== undefined && (
        <p className={change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </p>
      )}
    </div>
    {icon && <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">{icon}</div>}
  </div>
</div>`,
      styling: 'bg-zinc-900/50 border-zinc-800 rounded-2xl'
    }
  }
  
  return blueprints[componentType] || blueprints['card']
}

// Auto-Fix für häufige React-Fehler
interface AutoFix {
  errorPattern: RegExp
  fix: string
  explanation: string
  codeTransform?: (code: string) => string
}

const reactAutoFixes: AutoFix[] = [
  {
    errorPattern: /Objects are not valid as a React child/i,
    fix: 'Objekt zu String konvertieren',
    explanation: 'React kann keine Objekte direkt rendern. Verwende JSON.stringify() oder extrahiere spezifische Properties.',
    codeTransform: (code) => code.replace(/\{(\w+)\}/g, '{JSON.stringify($1)}')
  },
  {
    errorPattern: /Each child in a list should have a unique "key" prop/i,
    fix: 'Key prop hinzufügen',
    explanation: 'Jedes Element in einer Liste braucht eine eindeutige key prop.',
    codeTransform: (code) => code.replace(/\.map\((\w+)\s*=>/g, '.map(($1, index) =>')
  },
  {
    errorPattern: /Cannot read propert.*of undefined/i,
    fix: 'Optional Chaining verwenden',
    explanation: 'Die Variable ist undefined. Verwende ?. für sicheren Zugriff.',
    codeTransform: (code) => code.replace(/(\w+)\.(\w+)/g, '$1?.$2')
  },
  {
    errorPattern: /Hooks can only be called inside.*function component/i,
    fix: 'Hook in Komponente verschieben',
    explanation: 'Hooks müssen am Anfang einer Funktionskomponente aufgerufen werden.'
  },
  {
    errorPattern: /Too many re-renders/i,
    fix: 'State-Update aus Render entfernen',
    explanation: 'setState wird direkt im Render aufgerufen. Verschiebe es in useEffect oder Event-Handler.'
  },
  {
    errorPattern: /Maximum update depth exceeded/i,
    fix: 'useEffect Dependencies prüfen',
    explanation: 'Endlosschleife durch fehlende oder falsche Dependencies im useEffect.'
  },
  {
    errorPattern: /Cannot update a component.*while rendering/i,
    fix: 'Update in useEffect verschieben',
    explanation: 'Parent-State wird während Child-Render aktualisiert. Verwende useEffect.'
  }
]

function getAutoFixForError(errorMessage: string): AutoFix | null {
  for (const fix of reactAutoFixes) {
    if (fix.errorPattern.test(errorMessage)) {
      return fix
    }
  }
  return null
}

// Smart Import Management
interface ImportSuggestion {
  module: string
  imports: string[]
  reason: string
}

function analyzeRequiredImports(code: string): ImportSuggestion[] {
  const suggestions: ImportSuggestion[] = []
  
  // React Hooks
  const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer']
  const usedHooks = hooks.filter(hook => code.includes(hook) && !code.includes(`import.*${hook}`))
  if (usedHooks.length > 0) {
    suggestions.push({
      module: 'react',
      imports: usedHooks,
      reason: 'React Hooks werden verwendet'
    })
  }
  
  // Lucide Icons
  const iconPattern = /<([A-Z][a-z]+(?:[A-Z][a-z]+)*)\s/g
  const potentialIcons = [...code.matchAll(iconPattern)].map(m => m[1])
  const commonIcons = ['Search', 'Plus', 'Trash', 'Edit', 'Check', 'X', 'Menu', 'Settings', 'User', 'Home']
  const usedIcons = potentialIcons.filter(icon => commonIcons.includes(icon))
  if (usedIcons.length > 0 && !code.includes('lucide-react')) {
    suggestions.push({
      module: 'lucide-react',
      imports: usedIcons,
      reason: 'Lucide Icons werden verwendet'
    })
  }
  
  // Framer Motion
  if ((code.includes('animate') || code.includes('motion.')) && !code.includes('framer-motion')) {
    suggestions.push({
      module: 'framer-motion',
      imports: ['motion', 'AnimatePresence'],
      reason: 'Animationen werden verwendet'
    })
  }
  
  // Date-fns
  if ((code.includes('format(') || code.includes('parseISO') || code.includes('addDays')) && !code.includes('date-fns')) {
    suggestions.push({
      module: 'date-fns',
      imports: ['format', 'parseISO'],
      reason: 'Datums-Formatierung wird verwendet'
    })
  }
  
  return suggestions
}

// Generiere vollständige Import-Statements
function generateImportStatements(suggestions: ImportSuggestion[]): string {
  return suggestions.map(s => 
    `import { ${s.imports.join(', ')} } from "${s.module}";`
  ).join('\n')
}

// Erweiterte Code-Dokumentation
interface DocumentationBlock {
  type: 'component' | 'function' | 'hook' | 'type'
  name: string
  description: string
  params?: { name: string; type: string; description: string }[]
  returns?: string
  example?: string
}

function generateDocumentation(code: string, componentName: string): DocumentationBlock {
  // Analysiere Code für automatische Dokumentation
  const propsMatch = code.match(/interface\s+\w*Props\s*\{([^}]+)\}/)
  const params: DocumentationBlock['params'] = []
  
  if (propsMatch) {
    const propsContent = propsMatch[1]
    const propLines = propsContent.split('\n').filter(l => l.includes(':'))
    for (const line of propLines) {
      const match = line.match(/(\w+)\??:\s*([^;]+)/)
      if (match) {
        params.push({
          name: match[1],
          type: match[2].trim(),
          description: `${match[1]} prop`
        })
      }
    }
  }
  
  return {
    type: 'component',
    name: componentName,
    description: `${componentName} Komponente`,
    params,
    example: `<${componentName} ${params.map(p => `${p.name}={...}`).join(' ')} />`
  }
}

function formatDocumentation(doc: DocumentationBlock): string {
  let result = `/**\n * ${doc.description}\n`
  if (doc.params && doc.params.length > 0) {
    result += ` *\n`
    for (const param of doc.params) {
      result += ` * @param ${param.name} - ${param.description} (${param.type})\n`
    }
  }
  if (doc.returns) {
    result += ` * @returns ${doc.returns}\n`
  }
  if (doc.example) {
    result += ` *\n * @example\n * ${doc.example}\n`
  }
  result += ` */`
  return result
}

// Intelligente Fehler-Prävention beim Code-Schreiben
interface PreventionRule {
  name: string
  check: (code: string) => boolean
  message: string
  autoFix: string
}

const codePreventionRules: PreventionRule[] = [
  {
    name: 'Missing useClient',
    check: (code) => (code.includes('useState') || code.includes('useEffect') || code.includes('onClick')) && !code.includes('"use client"'),
    message: 'Client-Komponente ohne "use client" Direktive',
    autoFix: 'Füge "use client" am Anfang der Datei hinzu'
  },
  {
    name: 'Async in useEffect',
    check: (code) => /useEffect\(\s*async/.test(code),
    message: 'useEffect Callback darf nicht async sein',
    autoFix: 'Erstelle eine async Funktion innerhalb von useEffect und rufe sie auf'
  },
  {
    name: 'setState in render',
    check: (code) => {
      const hasSetState = code.includes('setState') || /set[A-Z]\w+\(/.test(code)
      const inRender = !code.includes('onClick') && !code.includes('useEffect') && !code.includes('onChange')
      return hasSetState && inRender && code.split('\n').length < 20
    },
    message: 'State-Update möglicherweise im Render',
    autoFix: 'Verschiebe setState in useEffect oder Event-Handler'
  },
  {
    name: 'Empty dependency array with state',
    check: (code) => {
      const hasEmptyDeps = /useEffect\([^)]+,\s*\[\s*\]\s*\)/.test(code)
      const usesState = /\[.*set[A-Z]/.test(code)
      return hasEmptyDeps && usesState
    },
    message: 'useEffect mit leerem Array verwendet möglicherweise State',
    autoFix: 'Prüfe ob Dependencies im Array fehlen'
  },
  {
    name: 'Direct DOM manipulation',
    check: (code) => code.includes('document.getElementById') || code.includes('document.querySelector'),
    message: 'Direkte DOM-Manipulation in React vermeiden',
    autoFix: 'Verwende useRef stattdessen'
  },
  {
    name: 'Index as key',
    check: (code) => /key=\{.*index.*\}/.test(code) && code.includes('.map('),
    message: 'Index als Key kann zu Problemen führen',
    autoFix: 'Verwende eine eindeutige ID als Key'
  }
]

function checkCodeForPreventions(code: string): PreventionRule[] {
  return codePreventionRules.filter(rule => rule.check(code))
}

// Automatische Accessibility-Verbesserungen
interface A11yImprovement {
  element: string
  issue: string
  fix: string
  priority: 'critical' | 'important' | 'recommended'
}

function analyzeAccessibility(code: string): A11yImprovement[] {
  const improvements: A11yImprovement[] = []
  
  // Buttons ohne Text oder aria-label
  if (code.match(/<button[^>]*>\s*<[^/]/)) {
    improvements.push({
      element: 'button',
      issue: 'Button enthält nur Icon ohne beschreibenden Text',
      fix: 'Füge aria-label="Beschreibung" hinzu',
      priority: 'critical'
    })
  }
  
  // Images ohne alt
  if (code.match(/<img[^>]*(?!alt=)[^>]*>/)) {
    improvements.push({
      element: 'img',
      issue: 'Bild ohne alt-Attribut',
      fix: 'Füge alt="Beschreibung" hinzu',
      priority: 'critical'
    })
  }
  
  // Links ohne href
  if (code.match(/<a[^>]*(?!href)[^>]*>/)) {
    improvements.push({
      element: 'a',
      issue: 'Link ohne href-Attribut',
      fix: 'Füge href hinzu oder verwende button',
      priority: 'important'
    })
  }
  
  // Form inputs ohne label
  if (code.includes('<input') && !code.includes('<label') && !code.includes('aria-label')) {
    improvements.push({
      element: 'input',
      issue: 'Input ohne zugehöriges Label',
      fix: 'Füge <label> oder aria-label hinzu',
      priority: 'critical'
    })
  }
  
  // Fehlende Semantik
  if (code.includes('<div') && !code.includes('<main') && !code.includes('<section') && !code.includes('<article')) {
    improvements.push({
      element: 'div',
      issue: 'Fehlende semantische HTML-Elemente',
      fix: 'Verwende main, section, article, nav, header, footer',
      priority: 'recommended'
    })
  }
  
  // Fehlende Fokus-Styles
  if (code.includes('outline: none') || code.includes('outline-none')) {
    improvements.push({
      element: 'focus',
      issue: 'Fokus-Outline entfernt ohne Alternative',
      fix: 'Füge focus:ring-2 oder ähnliches hinzu',
      priority: 'important'
    })
  }
  
  // Color contrast (vereinfacht)
  if (code.includes('text-gray-400') && code.includes('bg-gray-300')) {
    improvements.push({
      element: 'text',
      issue: 'Möglicherweise schlechter Farbkontrast',
      fix: 'Prüfe Kontrast mit WCAG-Richtlinien',
      priority: 'important'
    })
  }
  
  return improvements
}

// Smart Component Composition - Erkennt Komponenten die zusammengehören
interface CompositionSuggestion {
  name: string
  reason: string
  components: string[]
  example: string
}

function suggestComponentComposition(files: { path: string; content: string }[]): CompositionSuggestion[] {
  const suggestions: CompositionSuggestion[] = []
  const allContent = files.map(f => f.content).join('\n')
  
  // List + Item Pattern
  if (allContent.includes('.map(') && !files.some(f => f.path.includes('Item'))) {
    suggestions.push({
      name: 'List-Item Pattern',
      reason: 'Liste ohne separate Item-Komponente',
      components: ['ItemList', 'ListItem'],
      example: `// ItemList.tsx
export function ItemList({ items }) {
  return items.map(item => <ListItem key={item.id} {...item} />)
}

// ListItem.tsx  
export function ListItem({ title, description }) {
  return <div>...</div>
}`
    })
  }
  
  // Form + Input Pattern
  if (allContent.includes('<form') && (allContent.match(/<input/g)?.length ?? 0) > 2 && !files.some(f => f.path.includes('Input'))) {
    suggestions.push({
      name: 'Form-Input Pattern',
      reason: 'Formular mit vielen Inputs ohne wiederverwendbare Input-Komponente',
      components: ['Form', 'FormInput', 'FormLabel'],
      example: `// FormInput.tsx
export function FormInput({ label, error, ...props }) {
  return (
    <div>
      <label>{label}</label>
      <input {...props} />
      {error && <span className="text-red-400">{error}</span>}
    </div>
  )
}`
    })
  }
  
  // Card Pattern
  if ((allContent.match(/className="[^"]*rounded[^"]*p-[46][^"]*"/g)?.length ?? 0) > 3) {
    suggestions.push({
      name: 'Card Pattern',
      reason: 'Ähnliche Card-Styles wiederholen sich',
      components: ['Card', 'CardHeader', 'CardContent', 'CardFooter'],
      example: `// Card.tsx
export function Card({ children, className }) {
  return (
    <div className={\`bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 \${className}\`}>
      {children}
    </div>
  )
}`
    })
  }
  
  // Modal/Dialog Pattern
  if (allContent.includes('fixed inset-0') && !files.some(f => f.path.includes('Modal') || f.path.includes('Dialog'))) {
    suggestions.push({
      name: 'Modal Pattern',
      reason: 'Overlay-Code ohne wiederverwendbare Modal-Komponente',
      components: ['Modal', 'ModalHeader', 'ModalContent', 'ModalFooter'],
      example: `// Modal.tsx - siehe Blueprint`
    })
  }
  
  return suggestions.slice(0, 3)
}

// Erweiterte Code-Optimierungsvorschläge
interface CodeOptimization {
  type: 'performance' | 'readability' | 'maintainability' | 'bundle-size'
  title: string
  current: string
  suggested: string
  impact: 'low' | 'medium' | 'high'
}

function analyzeCodeOptimizations(files: { path: string; content: string }[]): CodeOptimization[] {
  const suggestions: CodeOptimization[] = []
  const allContent = files.map(f => f.content).join('\n')
  
  // Performance: Inline functions in JSX
  const inlineHandlerCount = (allContent.match(/onClick=\{\(\)\s*=>/g) || []).length
  if (inlineHandlerCount > 5) {
    suggestions.push({
      type: 'performance',
      title: 'Inline Event Handler',
      current: `${inlineHandlerCount} inline onClick Handler`,
      suggested: 'Extrahiere Handler mit useCallback',
      impact: 'medium'
    })
  }
  
  // Performance: Missing useMemo for expensive operations
  if (allContent.includes('.filter(') && allContent.includes('.map(') && !allContent.includes('useMemo')) {
    suggestions.push({
      type: 'performance',
      title: 'Fehlende Memoization',
      current: 'filter + map ohne useMemo',
      suggested: 'Wrape teure Operationen in useMemo',
      impact: 'medium'
    })
  }
  
  // Bundle Size: Large imports
  if (allContent.includes("from 'lodash'") && !allContent.includes("from 'lodash/")) {
    suggestions.push({
      type: 'bundle-size',
      title: 'Lodash Bundle',
      current: "import { x } from 'lodash'",
      suggested: "import x from 'lodash/x'",
      impact: 'high'
    })
  }
  
  // Readability: Magic numbers
  const magicNumbers = allContent.match(/(?<![a-zA-Z0-9_])\d{3,}(?![a-zA-Z0-9_])/g) || []
  if (magicNumbers.length > 3) {
    suggestions.push({
      type: 'readability',
      title: 'Magic Numbers',
      current: `${magicNumbers.length} hardcoded Zahlen`,
      suggested: 'Extrahiere in benannte Konstanten',
      impact: 'low'
    })
  }
  
  // Maintainability: Long files
  for (const file of files) {
    const lines = file.content.split('\n').length
    if (lines > 300) {
      suggestions.push({
        type: 'maintainability',
        title: 'Lange Datei',
        current: `${file.path}: ${lines} Zeilen`,
        suggested: 'Teile in kleinere Komponenten/Module auf',
        impact: 'high'
      })
    }
  }
  
  // Performance: Re-renders durch Object/Array Literals
  if ((allContent.match(/style=\{\{/g)?.length ?? 0) > 10) {
    suggestions.push({
      type: 'performance',
      title: 'Inline Style Objects',
      current: 'Viele style={{...}} in JSX',
      suggested: 'Definiere Styles außerhalb oder nutze Tailwind',
      impact: 'medium'
    })
  }
  
  return suggestions.slice(0, 5)
}

// Intelligente Code-Completion Vorschläge
interface CompletionSuggestion {
  trigger: string
  completion: string
  description: string
  category: 'hook' | 'component' | 'utility' | 'pattern'
}

function getSmartCompletions(currentCode: string, cursorContext: string): CompletionSuggestion[] {
  const completions: CompletionSuggestion[] = []
  const lower = cursorContext.toLowerCase()
  
  // Hook Completions
  if (lower.includes('usestate') || lower.includes('state')) {
    completions.push({
      trigger: 'useState',
      completion: `const [value, setValue] = useState<string>('')`,
      description: 'State mit Typ',
      category: 'hook'
    })
    completions.push({
      trigger: 'useStateArray',
      completion: `const [items, setItems] = useState<Item[]>([])`,
      description: 'Array State',
      category: 'hook'
    })
  }
  
  if (lower.includes('useeffect') || lower.includes('effect')) {
    completions.push({
      trigger: 'useEffect',
      completion: `useEffect(() => {\n  // Effect logic\n  return () => {\n    // Cleanup\n  }\n}, [dependency])`,
      description: 'Effect mit Cleanup',
      category: 'hook'
    })
    completions.push({
      trigger: 'useEffectFetch',
      completion: `useEffect(() => {\n  const fetchData = async () => {\n    try {\n      const res = await fetch(url)\n      const data = await res.json()\n      setData(data)\n    } catch (err) {\n      setError(err)\n    }\n  }\n  fetchData()\n}, [])`,
      description: 'Data Fetching Effect',
      category: 'hook'
    })
  }
  
  // Component Patterns
  if (lower.includes('button') || lower.includes('btn')) {
    completions.push({
      trigger: 'Button',
      completion: `<button\n  onClick={handleClick}\n  disabled={isLoading}\n  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold hover:scale-[1.02] transition-all"\n>\n  {isLoading ? 'Laden...' : 'Klicken'}\n</button>`,
      description: 'Premium Button',
      category: 'component'
    })
  }
  
  if (lower.includes('input') || lower.includes('field')) {
    completions.push({
      trigger: 'Input',
      completion: `<input\n  type="text"\n  value={value}\n  onChange={(e) => setValue(e.target.value)}\n  placeholder="Eingabe..."\n  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 outline-none transition-colors"\n/>`,
      description: 'Premium Input',
      category: 'component'
    })
  }
  
  if (lower.includes('card')) {
    completions.push({
      trigger: 'Card',
      completion: `<div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all">\n  <h3 className="font-semibold text-lg">{title}</h3>\n  <p className="text-zinc-400 mt-2">{description}</p>\n</div>`,
      description: 'Premium Card',
      category: 'component'
    })
  }
  
  // Utility Patterns
  if (lower.includes('fetch') || lower.includes('api')) {
    completions.push({
      trigger: 'fetchWrapper',
      completion: `const fetchData = async <T>(url: string): Promise<T> => {\n  const res = await fetch(url)\n  if (!res.ok) throw new Error('Fetch failed')\n  return res.json()\n}`,
      description: 'Typed Fetch Wrapper',
      category: 'utility'
    })
  }
  
  if (lower.includes('debounce')) {
    completions.push({
      trigger: 'useDebounce',
      completion: `function useDebounce<T>(value: T, delay: number): T {\n  const [debouncedValue, setDebouncedValue] = useState(value)\n  useEffect(() => {\n    const timer = setTimeout(() => setDebouncedValue(value), delay)\n    return () => clearTimeout(timer)\n  }, [value, delay])\n  return debouncedValue\n}`,
      description: 'Debounce Hook',
      category: 'utility'
    })
  }
  
  return completions.slice(0, 5)
}

// Test-Generierung Hints
interface TestSuggestion {
  componentName: string
  testCases: string[]
  mockData?: string
}

function generateTestHints(files: { path: string; content: string }[]): TestSuggestion[] {
  const suggestions: TestSuggestion[] = []
  
  for (const file of files) {
    if (!file.path.includes('components/')) continue
    
    const componentMatch = file.content.match(/export\s+function\s+(\w+)/)
    if (!componentMatch) continue
    
    const componentName = componentMatch[1]
    const testCases: string[] = []
    
    // Analysiere Komponente für Test-Vorschläge
    if (file.content.includes('onClick')) {
      testCases.push(`it('should handle click event', () => { ... })`)
    }
    if (file.content.includes('useState')) {
      testCases.push(`it('should update state correctly', () => { ... })`)
    }
    if (file.content.includes('.map(')) {
      testCases.push(`it('should render list items', () => { ... })`)
    }
    if (file.content.includes('loading') || file.content.includes('isLoading')) {
      testCases.push(`it('should show loading state', () => { ... })`)
    }
    if (file.content.includes('error') || file.content.includes('Error')) {
      testCases.push(`it('should handle error state', () => { ... })`)
    }
    if (file.content.includes('<form') || file.content.includes('onSubmit')) {
      testCases.push(`it('should submit form correctly', () => { ... })`)
      testCases.push(`it('should validate form inputs', () => { ... })`)
    }
    
    if (testCases.length > 0) {
      suggestions.push({ componentName, testCases })
    }
  }
  
  return suggestions.slice(0, 5)
}

// Smart Deployment Checks
interface DeploymentIssue {
  type: 'error' | 'warning' | 'info'
  category: 'env' | 'build' | 'config' | 'security'
  message: string
  fix: string
}

function checkDeploymentReadiness(files: { path: string; content: string }[]): DeploymentIssue[] {
  const issues: DeploymentIssue[] = []
  const allContent = files.map(f => f.content).join('\n')
  const filePaths = files.map(f => f.path)
  
  // ENV Checks
  if (allContent.includes('process.env.') && !filePaths.some(p => p.includes('.env'))) {
    issues.push({
      type: 'warning',
      category: 'env',
      message: 'Umgebungsvariablen verwendet aber keine .env Datei',
      fix: 'Erstelle .env.example mit den benötigten Variablen'
    })
  }
  
  // Hardcoded URLs
  if (allContent.match(/https?:\/\/localhost/)) {
    issues.push({
      type: 'error',
      category: 'config',
      message: 'Hardcoded localhost URL gefunden',
      fix: 'Verwende Umgebungsvariablen für URLs'
    })
  }
  
  // API Keys exposed
  if (allContent.match(/['"]sk-[a-zA-Z0-9]{20,}['"]/)) {
    issues.push({
      type: 'error',
      category: 'security',
      message: 'API Key im Code gefunden',
      fix: 'Verschiebe API Keys in Umgebungsvariablen'
    })
  }
  
  // Missing build files
  if (!filePaths.some(p => p.includes('package.json'))) {
    issues.push({
      type: 'warning',
      category: 'build',
      message: 'Keine package.json gefunden',
      fix: 'Erstelle package.json mit Dependencies'
    })
  }
  
  // Console logs
  const consoleLogs = (allContent.match(/console\.(log|warn|error)/g) || []).length
  if (consoleLogs > 5) {
    issues.push({
      type: 'warning',
      category: 'build',
      message: `${consoleLogs} Console-Statements gefunden`,
      fix: 'Entferne Console-Logs vor Deployment'
    })
  }
  
  // Missing error handling
  if (allContent.includes('fetch(') && !allContent.includes('catch')) {
    issues.push({
      type: 'warning',
      category: 'build',
      message: 'Fetch ohne Error Handling',
      fix: 'Füge try/catch für API-Aufrufe hinzu'
    })
  }
  
  // TypeScript any
  const anyCount = (allContent.match(/:\s*any\b/g) || []).length
  if (anyCount > 3) {
    issues.push({
      type: 'info',
      category: 'build',
      message: `${anyCount} 'any' Types gefunden`,
      fix: 'Ersetze any durch konkrete Typen'
    })
  }
  
  return issues
}

// Erweiterte Projektstruktur-Analyse
interface ProjectStructure {
  hasComponents: boolean
  hasHooks: boolean
  hasUtils: boolean
  hasTypes: boolean
  hasStyles: boolean
  hasTests: boolean
  missingRecommended: string[]
  score: number
}

function analyzeProjectStructure(files: { path: string; content: string }[]): ProjectStructure {
  const paths = files.map(f => f.path)
  
  const hasComponents = paths.some(p => p.includes('/components/'))
  const hasHooks = paths.some(p => p.includes('/hooks/'))
  const hasUtils = paths.some(p => p.includes('/utils/') || p.includes('/lib/'))
  const hasTypes = paths.some(p => p.includes('/types/') || p.includes('.d.ts'))
  const hasStyles = paths.some(p => p.includes('.css') || p.includes('styles'))
  const hasTests = paths.some(p => p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__'))
  
  const missingRecommended: string[] = []
  if (!hasComponents && files.length > 2) missingRecommended.push('/components/')
  if (!hasHooks && files.some(f => (f.content.match(/useState/g) || []).length > 3)) missingRecommended.push('/hooks/')
  if (!hasUtils && files.some(f => f.content.includes('function') && !f.path.includes('component'))) missingRecommended.push('/utils/')
  if (!hasTypes && files.some(f => f.content.includes('interface') || f.content.includes('type '))) missingRecommended.push('/types/')
  
  // Score berechnen
  let score = 50 // Basis
  if (hasComponents) score += 15
  if (hasHooks) score += 10
  if (hasUtils) score += 10
  if (hasTypes) score += 10
  if (hasTests) score += 5
  score -= missingRecommended.length * 5
  
  return {
    hasComponents,
    hasHooks,
    hasUtils,
    hasTypes,
    hasStyles,
    hasTests,
    missingRecommended,
    score: Math.max(0, Math.min(100, score))
  }
}

// ============================================
// DESIGN-VALIDIERUNG - Erkennt und verhindert schlechte UI-Patterns
// ============================================

interface DesignViolation {
  type: 'critical' | 'warning' | 'suggestion'
  pattern: string
  problem: string
  fix: string
  autoFixCode?: string
}

interface DesignValidationResult {
  isValid: boolean
  score: number
  violations: DesignViolation[]
  autoFixPrompt?: string
}

// Schlechte Design-Patterns die erkannt werden müssen
const badDesignPatterns: { 
  pattern: RegExp
  type: DesignViolation['type']
  problem: string
  fix: string
  context?: string[]
}[] = [
  // ============================================
  // KRITISCH: VERBOTENE DEMO-KOMPONENTEN
  // ============================================
  {
    pattern: /Demo[-\s]?[Zz]ähler|Demo[-\s]?Counter|DemoCounter/i,
    type: 'critical',
    problem: 'VERBOTEN: Demo-Zähler generiert - wurde nicht angefordert!',
    fix: 'ENTFERNE diese Komponente komplett - nur angeforderte Features generieren!'
  },
  {
    pattern: /Hello\s*World/i,
    type: 'critical',
    problem: 'VERBOTEN: Hello World generiert - wurde nicht angefordert!',
    fix: 'ENTFERNE diese Komponente komplett - nur angeforderte Features generieren!'
  },
  {
    pattern: /function\s+(Counter|DemoCounter|TestCounter|ClickCounter)\s*\(/i,
    type: 'critical',
    problem: 'VERBOTEN: Counter-Demo-Komponente generiert!',
    fix: 'ENTFERNE diese Komponente - nur angeforderte Features generieren!'
  },
  {
    pattern: /useState<number>\(\s*0\s*\)[\s\S]*setCount[\s\S]*count\s*\+\s*1/,
    type: 'warning',
    problem: 'Verdächtiger Counter-Pattern erkannt - möglicherweise Demo-Code',
    fix: 'Prüfe ob dieser Counter angefordert wurde, sonst entfernen'
  },
  {
    pattern: /<button[^>]*>\s*(Klick\s*mich|Click\s*me|Test|Demo)\s*<\/button>/i,
    type: 'warning',
    problem: 'Test/Demo Button erkannt - möglicherweise nicht angefordert',
    fix: 'Prüfe ob dieser Button zur App gehört, sonst entfernen'
  },
  // ============================================
  // KRITISCH: "NUR TEXT" OHNE STYLING
  // ============================================
  {
    pattern: /<div>\s*\{[^}]+\}\s*<\/div>/,
    type: 'critical',
    problem: 'Nur Text in div ohne jegliches Styling - sieht rudimentär aus',
    fix: 'Füge className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl" hinzu'
  },
  {
    pattern: /<p>\s*\{[^}]+\}\s*<\/p>/,
    type: 'warning',
    problem: 'Text ohne Styling-Klassen',
    fix: 'Füge className="text-zinc-400" oder "text-lg font-medium" hinzu'
  },
  {
    pattern: /<span>\s*\{[^}]+\}\s*<\/span>/,
    type: 'warning',
    problem: 'Span ohne Styling',
    fix: 'Füge className mit Farbe und Font hinzu'
  },
  {
    pattern: /<h[1-6]>\s*\{[^}]+\}\s*<\/h[1-6]>/,
    type: 'warning',
    problem: 'Heading ohne Styling',
    fix: 'Füge className="text-2xl font-bold" oder Gradient hinzu'
  },
  // ============================================
  // KRITISCH: LISTEN OHNE VISUELLE STRUKTUR  
  // ============================================
  {
    pattern: /\.map\([^)]+\)\s*=>\s*\(\s*<div>\s*\{/,
    type: 'critical',
    problem: 'Liste rendert nur Text ohne visuelle Struktur (Cards, Borders, etc.)',
    fix: 'Wrape Items in styled Cards: className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl"'
  },
  {
    pattern: /\.map\([^)]+\)\s*=>\s*<li>\s*\{/,
    type: 'critical',
    problem: 'Einfache Textliste ohne Styling',
    fix: 'Verwende styled div statt li: className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50"'
  },
  {
    pattern: /\.map\([^)]+\)\s*=>\s*\{[^}]+\}/,
    type: 'warning',
    problem: 'Map gibt möglicherweise nur Text ohne Wrapper zurück',
    fix: 'Wrape Rückgabe in styled Container'
  },
  // ============================================
  // KRITISCH: FEHLENDE CONTAINER-STRUKTUR
  // ============================================
  {
    pattern: /<div>\s*<div>\s*<div>/,
    type: 'warning',
    problem: 'Verschachtelte divs ohne Styling - keine visuelle Hierarchie',
    fix: 'Füge className zu jedem div für klare visuelle Struktur hinzu'
  },
  {
    pattern: /return\s*\(\s*<>\s*[^<]*</,
    type: 'warning',
    problem: 'Fragment als Root ohne Container-Styling',
    fix: 'Verwende div mit min-h-screen bg-zinc-950 p-6'
  },
  // ============================================
  // KALENDER SPEZIFISCH
  // ============================================
  {
    pattern: /calendar|kalender/i,
    type: 'critical',
    problem: 'Kalender erkannt - MUSS 7-Spalten Grid haben',
    fix: 'Verwende grid grid-cols-7 für Wochenansicht',
    context: ['calendar', 'kalender']
  },
  // ============================================
  // FORMULARE OHNE STYLING
  // ============================================
  {
    pattern: /<input[^>]*\/?>(?![^>]*className)/,
    type: 'critical',
    problem: 'Input ohne Styling - sieht wie Standard-HTML aus',
    fix: 'Füge className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl" hinzu'
  },
  {
    pattern: /<button[^>]*>(?![^>]*className)/,
    type: 'critical',
    problem: 'Button ohne Styling',
    fix: 'Füge className="px-6 py-3 bg-blue-600 rounded-xl font-semibold" hinzu'
  },
  {
    pattern: /<select[^>]*>(?![^>]*className)/,
    type: 'critical',
    problem: 'Select ohne Styling',
    fix: 'Füge className="px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl" hinzu'
  },
  {
    pattern: /<textarea[^>]*>(?![^>]*className)/,
    type: 'critical',
    problem: 'Textarea ohne Styling',
    fix: 'Füge className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl" hinzu'
  },
  // ============================================
  // TABELLEN OHNE STYLING
  // ============================================
  {
    pattern: /<table[^>]*>(?![^>]*className)/,
    type: 'critical',
    problem: 'Tabelle ohne Styling',
    fix: 'Füge className="w-full" und style tbody/tr/td hinzu'
  },
  {
    pattern: /<tr[^>]*>(?![^>]*className)/,
    type: 'warning',
    problem: 'Table Row ohne Styling',
    fix: 'Füge className="border-b border-zinc-800 hover:bg-zinc-800/30" hinzu'
  },
  // ============================================
  // INTERAKTIVE ELEMENTE
  // ============================================
  {
    pattern: /onClick[^}]*className="[^"]*"(?![^"]*hover)/,
    type: 'warning',
    problem: 'Klickbares Element ohne Hover-State',
    fix: 'Füge hover:bg-zinc-800/50 und transition-colors hinzu'
  },
  {
    pattern: /onClick[^}]*(?!className)/,
    type: 'critical',
    problem: 'Klickbares Element komplett ohne Styling',
    fix: 'Füge className mit Hover-State und Cursor hinzu'
  },
  // ============================================
  // LAYOUT-PROBLEME
  // ============================================
  {
    pattern: /className="[^"]*(?:rounded|border)[^"]*"(?![^"]*p-)/,
    type: 'warning',
    problem: 'Element mit Border/Rounded aber ohne Padding',
    fix: 'Füge p-4 oder p-6 hinzu'
  },
  {
    pattern: /<button[^>]*className="[^"]*p-1[^"]*"/,
    type: 'warning',
    problem: 'Button mit zu kleinem Touch-Target',
    fix: 'Verwende mindestens p-2'
  },
  {
    pattern: /bg-white[^}]*text-white|bg-black[^}]*text-black/,
    type: 'critical',
    problem: 'Text nicht lesbar (gleiche Farbe wie Hintergrund)',
    fix: 'Verwende kontrastierende Farben'
  },
  // ============================================
  // FEHLENDE VISUELLE ELEMENTE
  // ============================================
  {
    pattern: /<main[^>]*className="[^"]*"(?![^"]*bg-)/,
    type: 'warning',
    problem: 'Main ohne Hintergrundfarbe',
    fix: 'Füge bg-zinc-950 oder bg-zinc-900 hinzu'
  },
  {
    pattern: /<main[^>]*className="[^"]*"(?![^"]*min-h)/,
    type: 'suggestion',
    problem: 'Main ohne min-height',
    fix: 'Füge min-h-screen hinzu'
  }
]

// Erweiterte Design-Analyse für "nur Text" Probleme
function analyzeTextOnlyDesign(content: string): DesignViolation[] {
  const violations: DesignViolation[] = []
  
  // Zähle styled vs unstyled Elemente
  const totalDivs = (content.match(/<div/g) || []).length
  const styledDivs = (content.match(/<div[^>]*className/g) || []).length
  const unstyledRatio = totalDivs > 0 ? (totalDivs - styledDivs) / totalDivs : 0
  
  if (unstyledRatio > 0.3 && totalDivs > 5) {
    violations.push({
      type: 'critical',
      pattern: 'unstyled-ratio',
      problem: `${Math.round(unstyledRatio * 100)}% der divs haben kein Styling - App sieht rudimentär aus`,
      fix: 'Füge Tailwind-Klassen zu allen Containern hinzu'
    })
  }
  
  // Prüfe auf fehlende visuelle Hierarchie
  const hasCards = content.includes('rounded-') && content.includes('border')
  const hasBackgrounds = content.includes('bg-zinc') || content.includes('bg-gray') || content.includes('bg-slate')
  const hasSpacing = content.includes('space-y') || content.includes('gap-')
  const hasShadows = content.includes('shadow-')
  
  if (!hasCards && content.includes('.map(')) {
    violations.push({
      type: 'critical',
      pattern: 'no-cards',
      problem: 'Liste ohne Card-Styling - Items haben keine visuelle Trennung',
      fix: 'Wrape Items in: className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"'
    })
  }
  
  if (!hasBackgrounds && totalDivs > 3) {
    violations.push({
      type: 'warning',
      pattern: 'no-backgrounds',
      problem: 'Keine Hintergrundfarben - fehlende visuelle Tiefe',
      fix: 'Füge bg-zinc-900/50 oder bg-zinc-800/50 zu Containern hinzu'
    })
  }
  
  if (!hasSpacing && content.includes('.map(')) {
    violations.push({
      type: 'warning',
      pattern: 'no-spacing',
      problem: 'Fehlende Abstände zwischen Elementen',
      fix: 'Füge space-y-4 oder gap-4 zum Container hinzu'
    })
  }
  
  // Prüfe auf "nackte" Text-Ausgabe
  const nakedTextMatches = content.match(/>\s*\{[a-zA-Z_][a-zA-Z0-9_.]*\}\s*</g) || []
  if (nakedTextMatches.length > 5) {
    violations.push({
      type: 'warning',
      pattern: 'naked-text',
      problem: `${nakedTextMatches.length} Stellen mit Text ohne umgebendes Styling`,
      fix: 'Wrape Text in styled spans oder paragraphs'
    })
  }
  
  return violations
}

function validateDesign(files: { path: string; content: string }[]): DesignValidationResult {
  const violations: DesignViolation[] = []
  let score = 100
  
  for (const file of files) {
    if (!file.path.match(/\.(tsx|jsx)$/)) continue
    
    const content = file.content
    const isCalendarFile = content.toLowerCase().includes('calendar') || content.toLowerCase().includes('kalender')
    
    // Spezielle Kalender-Validierung
    if (isCalendarFile) {
      // KRITISCH: Kalender MUSS grid-cols-7 haben
      if (!content.includes('grid-cols-7')) {
        violations.push({
          type: 'critical',
          pattern: 'missing-grid-cols-7',
          problem: 'Kalender ohne 7-Spalten Grid! Tage werden vertikal statt horizontal angezeigt.',
          fix: 'MUSS grid grid-cols-7 verwenden: <div className="grid grid-cols-7 gap-1">'
        })
        score -= 30
      }
      
      // Kalender sollte aspect-square haben
      if (!content.includes('aspect-square')) {
        violations.push({
          type: 'warning',
          pattern: 'missing-aspect-square',
          problem: 'Kalender-Zellen ohne gleichmäßige Größe',
          fix: 'Füge aspect-square zu den Tag-Zellen hinzu'
        })
        score -= 10
      }
      
      // Wochentage-Header prüfen
      if (!content.match(/\["?Mo"?.*"?So"?\]|grid-cols-7[^}]*\["Mo"/)) {
        violations.push({
          type: 'warning',
          pattern: 'missing-weekday-header',
          problem: 'Kalender ohne Wochentage-Header (Mo-So)',
          fix: 'Füge Wochentage-Header hinzu: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]'
        })
        score -= 5
      }
    }
    
    // "Nur Text" Design-Analyse
    const textOnlyViolations = analyzeTextOnlyDesign(content)
    for (const violation of textOnlyViolations) {
      if (!violations.some(v => v.pattern === violation.pattern)) {
        violations.push(violation)
        score -= violation.type === 'critical' ? 25 : violation.type === 'warning' ? 10 : 5
      }
    }
    
    // Allgemeine Pattern-Prüfung
    for (const pattern of badDesignPatterns) {
      // Skip context-spezifische Patterns wenn Context nicht passt
      if (pattern.context && !pattern.context.some(ctx => content.toLowerCase().includes(ctx))) {
        continue
      }
      
      if (pattern.pattern.test(content)) {
        // Bereits hinzugefügte Violations nicht doppeln
        if (!violations.some(v => v.problem === pattern.problem)) {
          violations.push({
            type: pattern.type,
            pattern: pattern.pattern.toString(),
            problem: pattern.problem,
            fix: pattern.fix
          })
          score -= pattern.type === 'critical' ? 20 : pattern.type === 'warning' ? 10 : 5
        }
      }
    }
    
    // Positive Checks (erhöhen Score)
    if (content.includes('hover:')) score += 2
    if (content.includes('transition')) score += 2
    if (content.includes('rounded-')) score += 2
    if (content.includes('shadow-')) score += 1
    if (content.includes('backdrop-blur')) score += 2
    if (content.includes('bg-gradient')) score += 3
    if (content.includes('border-zinc')) score += 2
  }
  
  // Generiere Auto-Fix Prompt wenn kritische Violations
  let autoFixPrompt: string | undefined
  const criticalViolations = violations.filter(v => v.type === 'critical')
  if (criticalViolations.length > 0) {
    autoFixPrompt = `
⚠️ DESIGN-PROBLEME ERKANNT - BITTE KORRIGIEREN:

${criticalViolations.map(v => `❌ ${v.problem}
   → FIX: ${v.fix}`).join('\n\n')}

WICHTIG: Diese Probleme MÜSSEN behoben werden bevor der Code ausgegeben wird!
`
  }
  
  return {
    isValid: violations.filter(v => v.type === 'critical').length === 0,
    score: Math.max(0, Math.min(100, score)),
    violations,
    autoFixPrompt
  }
}

// Komponenten-spezifische Design-Templates
const componentDesignTemplates: Record<string, string> = {
  calendar: `
// KALENDER TEMPLATE - IMMER 7-SPALTEN GRID!
<div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
  {/* Header */}
  <div className="flex justify-between items-center mb-6">
    <button className="p-2 hover:bg-zinc-800 rounded-xl">←</button>
    <h2 className="text-xl font-bold">{month} {year}</h2>
    <button className="p-2 hover:bg-zinc-800 rounded-xl">→</button>
  </div>
  {/* Wochentage */}
  <div className="grid grid-cols-7 gap-1 mb-2">
    {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => (
      <div key={d} className="text-center text-xs text-zinc-500 py-2">{d}</div>
    ))}
  </div>
  {/* Tage - KRITISCH: grid-cols-7! */}
  <div className="grid grid-cols-7 gap-1">
    {blanks.map((_, i) => <div key={i} className="aspect-square" />)}
    {days.map(day => (
      <div key={day} className="aspect-square p-1 rounded-xl border border-zinc-800 hover:bg-zinc-800/50 cursor-pointer">
        <span className="text-sm font-medium">{day}</span>
      </div>
    ))}
  </div>
</div>`,

  list: `
// LISTE TEMPLATE
<div className="space-y-2">
  {items.map(item => (
    <div key={item.id} className="flex items-center gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <div className="flex-1">
        <h3 className="font-medium">{item.title}</h3>
        <p className="text-sm text-zinc-400">{item.description}</p>
      </div>
    </div>
  ))}
</div>`,

  card: `
// CARD TEMPLATE
<div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all">
  <h3 className="text-lg font-semibold mb-2">{title}</h3>
  <p className="text-zinc-400">{description}</p>
</div>`,

  form: `
// FORM TEMPLATE
<form onSubmit={handleSubmit} className="space-y-4">
  <div>
    <label className="block text-sm text-zinc-400 mb-1">{label}</label>
    <input 
      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-blue-500 outline-none transition-colors"
    />
  </div>
  <button className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl font-semibold hover:scale-[1.02] transition-all">
    Speichern
  </button>
</form>`,

  modal: `
// MODAL TEMPLATE
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {children}
    </div>
  </div>
)}`,

  dashboard: `
// DASHBOARD STATS TEMPLATE - IMMER GRID!
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {stats.map(stat => (
    <div key={stat.label} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
      <p className="text-sm text-zinc-400">{stat.label}</p>
      <p className="text-3xl font-bold mt-1">{stat.value}</p>
    </div>
  ))}
</div>`,

  table: `
// TABLE TEMPLATE
<div className="overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr className="border-b border-zinc-800">
        {columns.map(col => (
          <th key={col} className="text-left py-3 px-4 text-sm text-zinc-400">{col}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
          {/* cells */}
        </tr>
      ))}
    </tbody>
  </table>
</div>`
}

function getDesignTemplateForComponent(componentType: string): string | undefined {
  return componentDesignTemplates[componentType.toLowerCase()]
}

// ============================================
// PARTIAL EDITS: Nur geänderte Dateien neu generieren
// ============================================

interface FileChange {
  path: string
  type: 'create' | 'modify' | 'delete'
  reason: string
}

// Analysiere welche Dateien basierend auf dem Request geändert werden müssen
function analyzeRequiredChanges(
  userRequest: string, 
  existingFiles: { path: string; content: string }[]
): FileChange[] {
  const changes: FileChange[] = []
  const requestLower = userRequest.toLowerCase()
  
  // Keywords für verschiedene Änderungsarten
  const createKeywords = ['erstelle', 'create', 'add', 'füge hinzu', 'neue', 'new', 'baue', 'build']
  const modifyKeywords = ['ändere', 'modify', 'update', 'fix', 'korrigiere', 'verbessere', 'improve', 'anpasse']
  const deleteKeywords = ['lösche', 'delete', 'entferne', 'remove']
  
  const isCreate = createKeywords.some(k => requestLower.includes(k))
  const isModify = modifyKeywords.some(k => requestLower.includes(k))
  const isDelete = deleteKeywords.some(k => requestLower.includes(k))
  
  // Erkenne erwähnte Komponenten/Dateien im Request
  const mentionedComponents: string[] = []
  const componentPatterns = [
    /(\w+)[\s-]?komponente/gi,
    /(\w+)[\s-]?component/gi,
    /(\w+)\.tsx/gi,
    /in\s+(\w+)/gi,
  ]
  
  for (const pattern of componentPatterns) {
    let match
    while ((match = pattern.exec(userRequest)) !== null) {
      mentionedComponents.push(match[1])
    }
  }
  
  // Wenn spezifische Komponenten erwähnt werden
  if (mentionedComponents.length > 0) {
    for (const comp of mentionedComponents) {
      const existingFile = existingFiles.find(f => 
        f.path.toLowerCase().includes(comp.toLowerCase())
      )
      
      if (existingFile) {
        if (isDelete) {
          changes.push({ path: existingFile.path, type: 'delete', reason: `${comp} soll entfernt werden` })
        } else {
          changes.push({ path: existingFile.path, type: 'modify', reason: `${comp} soll geändert werden` })
        }
      } else if (isCreate) {
        changes.push({ path: `components/${comp}.tsx`, type: 'create', reason: `${comp} soll erstellt werden` })
      }
    }
  }
  
  // Wenn keine spezifischen Komponenten, aber generelle Änderung
  if (changes.length === 0 && isModify) {
    // Finde die Hauptdatei (page.tsx oder App.tsx)
    const mainFile = existingFiles.find(f => 
      f.path.includes('page.tsx') || f.path.includes('App.tsx')
    )
    if (mainFile) {
      changes.push({ path: mainFile.path, type: 'modify', reason: 'Hauptkomponente anpassen' })
    }
  }
  
  return changes
}

// Generiere Partial-Edit Prompt für nur geänderte Dateien
function generatePartialEditPrompt(
  changes: FileChange[],
  existingFiles: { path: string; content: string }[]
): string {
  if (changes.length === 0) return ''
  
  const fileContexts = changes
    .filter(c => c.type !== 'create')
    .map(c => {
      const file = existingFiles.find(f => f.path === c.path)
      if (!file) return ''
      return `### ${c.path} (${c.type}: ${c.reason})
\`\`\`typescript
${file.content}
\`\`\``
    })
    .filter(Boolean)
    .join('\n\n')

  return `
## 🎯 PARTIAL EDIT MODE - Nur diese Dateien ändern:

${changes.map(c => `- **${c.path}** → ${c.type.toUpperCase()}: ${c.reason}`).join('\n')}

${fileContexts}

## WICHTIG:
1. Gib NUR die geänderten Dateien aus
2. Behalte alle anderen Dateien unverändert
3. Gib bei Modifikationen den VOLLSTÄNDIGEN neuen Code der Datei aus
4. Bei DELETE: Gib die Datei NICHT aus
`
}

// App-Typ Erkennung für Komponenten-Bibliothek
function detectAppType(userRequest: string, files: { path: string; content: string }[]): string | null {
  const allContent = (userRequest + ' ' + files.map(f => f.content).join(' ')).toLowerCase()
  
  if (allContent.includes('crm') || allContent.includes('kontakt') || allContent.includes('contact') || allContent.includes('kunde')) {
    return 'crm'
  }
  if (allContent.includes('calendar') || allContent.includes('kalender') || allContent.includes('termin') || allContent.includes('event')) {
    return 'calendar'
  }
  if (allContent.includes('dashboard') || allContent.includes('analytics') || allContent.includes('statistik') || allContent.includes('chart')) {
    return 'dashboard'
  }
  if (allContent.includes('chat') || allContent.includes('message') || allContent.includes('nachricht')) {
    return 'chat'
  }
  if (allContent.includes('todo') || allContent.includes('task') || allContent.includes('aufgabe')) {
    return 'todo'
  }
  if (allContent.includes('shop') || allContent.includes('ecommerce') || allContent.includes('warenkorb') || allContent.includes('product')) {
    return 'ecommerce'
  }
  return null
}

// Projekttyp-Erkennung für angepasste Vorschläge
type ProjectType = 'todo' | 'ecommerce' | 'dashboard' | 'chat' | 'blog' | 'portfolio' | 'form' | 'unknown'

function detectProjectType(files: { path: string; content: string }[]): ProjectType {
  const allContent = files.map(f => f.content.toLowerCase()).join(' ')
  
  // Erkenne App-Typ basierend auf Keywords
  if (allContent.includes('todo') || allContent.includes('task') || allContent.includes('aufgabe')) {
    return 'todo'
  }
  if (allContent.includes('cart') || allContent.includes('warenkorb') || allContent.includes('product') || allContent.includes('checkout')) {
    return 'ecommerce'
  }
  if (allContent.includes('dashboard') || allContent.includes('chart') || allContent.includes('analytics') || allContent.includes('statistik')) {
    return 'dashboard'
  }
  if (allContent.includes('message') || allContent.includes('chat') || allContent.includes('nachricht')) {
    return 'chat'
  }
  if (allContent.includes('blog') || allContent.includes('post') || allContent.includes('artikel')) {
    return 'blog'
  }
  if (allContent.includes('portfolio') || allContent.includes('projekt') || allContent.includes('about me')) {
    return 'portfolio'
  }
  if (allContent.includes('form') || allContent.includes('formular') || allContent.includes('submit')) {
    return 'form'
  }
  return 'unknown'
}

// Projekttyp-spezifische Verbesserungsvorschläge
function getProjectTypeSpecificSuggestions(projectType: ProjectType): string[] {
  const suggestions: Record<ProjectType, string[]> = {
    todo: [
      '"Füge Prioritäten (hoch/mittel/niedrig) hinzu"',
      '"Füge Fälligkeitsdaten mit Kalender hinzu"',
      '"Füge Kategorien/Tags für Aufgaben hinzu"',
    ],
    ecommerce: [
      '"Füge eine Produktsuche mit Filtern hinzu"',
      '"Implementiere Warenkorb-Persistenz"',
      '"Füge Produktbewertungen hinzu"',
    ],
    dashboard: [
      '"Füge einen Datumsbereich-Filter hinzu"',
      '"Exportiere Charts als PNG/PDF"',
      '"Füge Real-Time Updates hinzu"',
    ],
    chat: [
      '"Füge Emoji-Picker hinzu"',
      '"Implementiere Nachrichtensuche"',
      '"Füge Lesebestätigungen hinzu"',
    ],
    blog: [
      '"Füge Kategorien und Tags hinzu"',
      '"Implementiere Kommentarfunktion"',
      '"Füge Social Sharing Buttons hinzu"',
    ],
    portfolio: [
      '"Füge Kontaktformular hinzu"',
      '"Implementiere Projektfilter"',
      '"Füge Animationen beim Scrollen hinzu"',
    ],
    form: [
      '"Füge mehrstufige Form-Validierung hinzu"',
      '"Implementiere Auto-Save für Formulare"',
      '"Füge Fortschrittsanzeige hinzu"',
    ],
    unknown: [
      '"Verbessere das Design"',
      '"Füge mehr Interaktivität hinzu"',
      '"Optimiere die Performance"',
    ],
  }
  return suggestions[projectType]
}

// Intelligente Follow-Up Fragen basierend auf generiertem Code
function generateFollowUpQuestions(files: { path: string; content: string }[], isFirstGeneration: boolean): string[] {
  const questions: string[] = []
  
  // Erkenne Projekttyp für spezifische Vorschläge
  const projectType = detectProjectType(files)
  
  // Analysiere was die App enthält
  const hasSearch = files.some(f => f.content.includes('search') || f.content.includes('filter'))
  const hasDarkMode = files.some(f => f.content.includes('dark') || f.content.includes('theme'))
  const hasLocalStorage = files.some(f => f.content.includes('localStorage'))
  const hasList = files.some(f => f.content.includes('.map(') && f.content.includes('key='))
  const hasForm = files.some(f => f.content.includes('<form') || f.content.includes('onSubmit'))
  const hasAnimation = files.some(f => f.content.includes('transition') || f.content.includes('animate'))
  const hasExport = files.some(f => f.content.includes('download') || f.content.includes('export'))
  const hasPagination = files.some(f => f.content.includes('page') && f.content.includes('setPage'))
  
  if (isFirstGeneration) {
    // Projekttyp-spezifische Vorschläge zuerst
    if (projectType !== 'unknown') {
      const typeSpecific = getProjectTypeSpecificSuggestions(projectType)
      questions.push(...typeSpecific.slice(0, 2))
    }
    
    // Allgemeine Vorschläge falls noch Platz
    if (!hasSearch && hasList && questions.length < 3) {
      questions.push('"Füge eine Suchfunktion hinzu"')
    }
    if (!hasDarkMode && questions.length < 3) {
      questions.push('"Füge einen Dark Mode Toggle hinzu"')
    }
    if (!hasLocalStorage && questions.length < 3) {
      questions.push('"Speichere die Daten im localStorage"')
    }
  } else {
    // Projekttyp-spezifische Vorschläge für Iterationen
    if (projectType !== 'unknown') {
      const typeSpecific = getProjectTypeSpecificSuggestions(projectType)
      questions.push(typeSpecific[Math.floor(Math.random() * typeSpecific.length)])
    }
    
    if (!hasExport && hasList) {
      questions.push('"Export als CSV hinzufügen"')
    }
    questions.push('"Das Design weiter verbessern"')
  }
  
  return questions.slice(0, 3)
}

function generateContextualHints(files: { path: string; content: string }[]): ContextualHint[] {
  const hints: ContextualHint[] = []
  
  // Prüfe auf fehlende Best Practices
  const hasUseClient = files.some(f => f.content.includes('"use client"') || f.content.includes("'use client'"))
  const hasErrorBoundary = files.some(f => f.content.includes('ErrorBoundary') || f.content.includes('error.tsx'))
  const hasLoading = files.some(f => f.path.includes('loading.tsx') || f.content.includes('Skeleton') || f.content.includes('Loading'))
  const hasLocalStorage = files.some(f => f.content.includes('localStorage'))
  const hasUseState = files.some(f => f.content.includes('useState'))
  const hasUseEffect = files.some(f => f.content.includes('useEffect'))
  const hasForm = files.some(f => f.content.includes('<form') || f.content.includes('onSubmit'))
  const hasValidation = files.some(f => f.content.includes('required') || f.content.includes('validate') || f.content.includes('zod'))
  
  // Verbesserungsvorschläge
  if (hasUseState && !hasLocalStorage) {
    hints.push({
      type: 'suggestion',
      message: 'Daten werden nicht persistent gespeichert',
      action: 'Füge localStorage Persistenz hinzu'
    })
  }
  
  if (!hasLoading && files.length > 3) {
    hints.push({
      type: 'suggestion',
      message: 'Keine Loading-States gefunden',
      action: 'Füge Skeleton/Loading Komponenten hinzu'
    })
  }
  
  if (!hasErrorBoundary && files.length > 5) {
    hints.push({
      type: 'suggestion',
      message: 'Keine Error-Behandlung gefunden',
      action: 'Füge Error Boundary hinzu'
    })
  }
  
  if (hasForm && !hasValidation) {
    hints.push({
      type: 'warning',
      message: 'Formular ohne Validierung erkannt',
      action: 'Füge Formular-Validierung hinzu'
    })
  }
  
  if (hasUseEffect) {
    const effectCount = files.reduce((sum, f) => sum + (f.content.match(/useEffect/g)?.length || 0), 0)
    if (effectCount > 5) {
      hints.push({
        type: 'improvement',
        message: `${effectCount} useEffect Hooks gefunden - prüfe ob alle nötig sind`,
        action: 'Refaktoriere Effects oder nutze React Query'
      })
    }
  }
  
  // Prüfe auf große Komponenten
  for (const file of files) {
    const lines = file.content.split('\n').length
    if (lines > 200 && file.path.endsWith('.tsx')) {
      hints.push({
        type: 'improvement',
        message: `${file.path} ist sehr groß (${lines} Zeilen)`,
        action: 'Extrahiere Komponenten in separate Dateien'
      })
    }
  }
  
  return hints.slice(0, 3) // Max 3 Hints
}

// Automatische Code-Optimierung Vorschläge
interface OptimizationSuggestion {
  type: 'performance' | 'readability' | 'security' | 'accessibility'
  severity: 'low' | 'medium' | 'high'
  file: string
  suggestion: string
  autoFixPrompt?: string
}

function generateOptimizationSuggestions(files: { path: string; content: string }[]): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = []
  
  for (const file of files) {
    const content = file.content
    const lines = content.split('\n')
    
    // Performance Optimierungen
    if (content.includes('useEffect') && !content.includes('useCallback') && content.includes('.map(')) {
      suggestions.push({
        type: 'performance',
        severity: 'medium',
        file: file.path,
        suggestion: 'Event-Handler in Listen sollten mit useCallback optimiert werden',
        autoFixPrompt: 'Optimiere die Performance: Wrap Event-Handler in useCallback'
      })
    }
    
    if ((content.match(/useState/g) || []).length > 5) {
      suggestions.push({
        type: 'readability',
        severity: 'low',
        file: file.path,
        suggestion: 'Viele useState Hooks - erwäge useReducer oder Zustand zusammenzufassen',
        autoFixPrompt: 'Refaktoriere: Fasse mehrere useState zu useReducer zusammen'
      })
    }
    
    // Security
    if (content.includes('dangerouslySetInnerHTML')) {
      suggestions.push({
        type: 'security',
        severity: 'high',
        file: file.path,
        suggestion: 'dangerouslySetInnerHTML kann XSS-Angriffe ermöglichen',
        autoFixPrompt: 'Entferne dangerouslySetInnerHTML und verwende sichere Alternativen'
      })
    }
    
    // Accessibility
    if (content.includes('<img') && !content.includes('alt=')) {
      suggestions.push({
        type: 'accessibility',
        severity: 'medium',
        file: file.path,
        suggestion: 'Bilder ohne alt-Attribut sind nicht barrierefrei',
        autoFixPrompt: 'Füge alt-Attribute zu allen Bildern hinzu'
      })
    }
    
    if (content.includes('<button') && content.includes('onClick') && !content.includes('aria-')) {
      suggestions.push({
        type: 'accessibility',
        severity: 'low',
        file: file.path,
        suggestion: 'Buttons sollten aria-labels haben wenn nur Icons',
      })
    }
    
    // Inline Styles zu Tailwind
    if ((content.match(/style=\{\{/g) || []).length > 3) {
      suggestions.push({
        type: 'readability',
        severity: 'low',
        file: file.path,
        suggestion: 'Viele Inline-Styles - erwäge Tailwind CSS Klassen',
        autoFixPrompt: 'Konvertiere Inline-Styles zu Tailwind CSS Klassen'
      })
    }
  }
  
  return suggestions.slice(0, 5)
}

// Code Quality Score - Bewertet die Qualität des generierten Codes
function calculateCodeQualityScore(files: { path: string; content: string }[]): { score: number; details: string[] } {
  let score = 100
  const details: string[] = []
  
  // Positive Faktoren
  const hasTypeScript = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'))
  const hasUseClient = files.some(f => f.content.includes('"use client"'))
  const hasTailwind = files.some(f => f.content.includes('className='))
  const hasErrorHandling = files.some(f => f.content.includes('try') && f.content.includes('catch'))
  const hasComments = files.some(f => f.content.includes('//') || f.content.includes('/*'))
  const hasProperExports = files.every(f => !f.path.endsWith('.tsx') || f.content.includes('export'))
  
  if (hasTypeScript) { score += 5; details.push('✅ TypeScript verwendet') }
  if (hasUseClient) { score += 3; details.push('✅ Client-Direktiven korrekt') }
  if (hasTailwind) { score += 3; details.push('✅ Tailwind CSS Styling') }
  if (hasErrorHandling) { score += 5; details.push('✅ Error Handling vorhanden') }
  if (hasProperExports) { score += 3; details.push('✅ Exports korrekt') }
  
  // Negative Faktoren
  for (const file of files) {
    const lines = file.content.split('\n')
    
    // Zu lange Dateien
    if (lines.length > 300) {
      score -= 10
      details.push(`⚠️ ${file.path}: Zu groß (${lines.length} Zeilen)`)
    }
    
    // Console.log in Production
    const consoleLogs = (file.content.match(/console\.(log|warn|error)/g) || []).length
    if (consoleLogs > 3) {
      score -= 5
      details.push(`⚠️ ${file.path}: ${consoleLogs} console Aufrufe`)
    }
    
    // Any Types
    const anyTypes = (file.content.match(/:\s*any/g) || []).length
    if (anyTypes > 2) {
      score -= 5
      details.push(`⚠️ ${file.path}: ${anyTypes} 'any' Types`)
    }
    
    // Fehlende Keys in Maps
    if (file.content.includes('.map(') && !file.content.includes('key=')) {
      score -= 3
      details.push(`⚠️ ${file.path}: Möglicherweise fehlende Keys in .map()`)
    }
  }
  
  // Score begrenzen
  score = Math.max(0, Math.min(100, score))
  
  return { score, details: details.slice(0, 5) }
}

function calculateCodeStats(files: { path: string; content: string }[]): CodeStats {
  let totalLines = 0
  let components = 0
  let hooks = 0
  let hasTypeScript = false
  let hasTailwind = false
  let hasRouter = false
  
  for (const file of files) {
    totalLines += file.content.split('\n').length
    
    // TypeScript check
    if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
      hasTypeScript = true
    }
    
    // Tailwind check
    if (file.content.includes('className=') || file.path.includes('tailwind')) {
      hasTailwind = true
    }
    
    // Router check
    if (file.content.includes('useRouter') || file.content.includes('next/navigation')) {
      hasRouter = true
    }
    
    // Component count (function components)
    const componentMatches = file.content.match(/export\s+(default\s+)?function\s+[A-Z]/g)
    if (componentMatches) {
      components += componentMatches.length
    }
    
    // Hook count (custom hooks)
    const hookMatches = file.content.match(/function\s+use[A-Z]/g)
    if (hookMatches) {
      hooks += hookMatches.length
    }
  }
  
  return {
    totalFiles: files.length,
    totalLines,
    components,
    hooks,
    hasTypeScript,
    hasTailwind,
    hasRouter,
  }
}

// Dependency-Analyse: Extrahiert installierte Pakete aus package.json
function analyzeDependencies(packageJsonContent: string): { dependencies: string[], devDependencies: string[], scripts: Record<string, string> } {
  try {
    const pkg = JSON.parse(packageJsonContent)
    return {
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
      scripts: pkg.scripts || {},
    }
  } catch {
    return { dependencies: [], devDependencies: [], scripts: {} }
  }
}

// Code-Pattern-Suche: Findet bestimmte Patterns in den bestehenden Dateien
function searchCodePatterns(files: { path: string; content: string }[], patterns: string[]): { pattern: string; matches: { file: string; line: number; context: string }[] }[] {
  const results: { pattern: string; matches: { file: string; line: number; context: string }[] }[] = []
  
  for (const pattern of patterns) {
    const matches: { file: string; line: number; context: string }[] = []
    const regex = new RegExp(pattern, 'gi')
    
    for (const file of files) {
      const lines = file.content.split('\n')
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          matches.push({
            file: file.path,
            line: index + 1,
            context: line.trim().substring(0, 100),
          })
        }
        regex.lastIndex = 0 // Reset regex
      })
    }
    
    if (matches.length > 0) {
      results.push({ pattern, matches: matches.slice(0, 5) }) // Max 5 Matches pro Pattern
    }
  }
  
  return results
}

// Komponenten-Analyse: Findet alle React-Komponenten in den Dateien
function analyzeComponents(files: { path: string; content: string }[]): { name: string; file: string; hasState: boolean; hasEffects: boolean; props: string[]; type: 'function' | 'arrow' | 'class' }[] {
  const components: { name: string; file: string; hasState: boolean; hasEffects: boolean; props: string[]; type: 'function' | 'arrow' | 'class' }[] = []
  
  for (const file of files) {
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.jsx')) continue
    
    // Finde Funktions-Komponenten: export function Name() oder export default function Name()
    const funcMatches = file.content.matchAll(/export\s+(default\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)
    for (const match of funcMatches) {
      const name = match[2]
      const propsStr = match[3]
      
      components.push({
        name,
        file: file.path,
        hasState: file.content.includes('useState'),
        hasEffects: file.content.includes('useEffect'),
        props: propsStr ? propsStr.split(',').map(p => p.trim().split(':')[0].replace(/[{}]/g, '').trim()).filter(Boolean) : [],
        type: 'function',
      })
    }
    
    // Finde Arrow-Function Komponenten: export const Name = () => oder const Name: React.FC = ()
    const arrowMatches = file.content.matchAll(/(?:export\s+)?const\s+(\w+)(?::\s*(?:React\.)?FC[^=]*)?\s*=\s*(?:\([^)]*\)|[^=])\s*=>/g)
    for (const match of arrowMatches) {
      const name = match[1]
      // Prüfe ob es eine Komponente ist (startet mit Großbuchstabe und gibt JSX zurück)
      if (name[0] === name[0].toUpperCase() && (file.content.includes(`<`) || file.content.includes('return'))) {
        // Vermeide Duplikate
        if (!components.some(c => c.name === name && c.file === file.path)) {
          components.push({
            name,
            file: file.path,
            hasState: file.content.includes('useState'),
            hasEffects: file.content.includes('useEffect'),
            props: [],
            type: 'arrow',
          })
        }
      }
    }
    
    // Finde forwardRef Komponenten: forwardRef<Type, Props>((props, ref) => ...)
    const forwardRefMatches = file.content.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:React\.)?forwardRef/g)
    for (const match of forwardRefMatches) {
      const name = match[1]
      if (!components.some(c => c.name === name && c.file === file.path)) {
        components.push({
          name,
          file: file.path,
          hasState: file.content.includes('useState'),
          hasEffects: file.content.includes('useEffect'),
          props: [],
          type: 'arrow',
        })
      }
    }
  }
  
  return components
}

// INTELLIGENTES CONTEXT WINDOW MANAGEMENT
// Priorisiert wichtige Dateien und kürzt unwichtige
interface ContextPriority {
  file: string
  priority: number // 1-10, höher = wichtiger
  reason: string
}

function prioritizeFilesForContext(
  files: { path: string; content: string }[],
  userRequest: string,
  maxChars: number
): { prioritizedFiles: { path: string; content: string; truncated: boolean }[]; totalChars: number; droppedFiles: string[] } {
  // Berechne Priorität für jede Datei
  const priorities: ContextPriority[] = files.map(f => {
    let priority = 5 // Basis
    const path = f.path.toLowerCase()
    const request = userRequest.toLowerCase()
    
    // Hauptdateien haben höchste Priorität
    if (path.includes('page.tsx') || path.includes('app.tsx')) priority += 3
    if (path.includes('layout.tsx')) priority += 2
    
    // Dateien die im Request erwähnt werden
    const fileName = path.split('/').pop() || ''
    if (request.includes(fileName.replace('.tsx', '').replace('.ts', ''))) priority += 4
    
    // Context/Provider sind wichtig für Architektur-Verständnis
    if (f.content.includes('createContext') || f.content.includes('Provider')) priority += 2
    
    // Komponenten unter components/ sind wichtig
    if (path.includes('components/')) priority += 1
    
    // Konfigurationsdateien niedriger
    if (path.includes('config') || path.includes('.json')) priority -= 2
    
    // Sehr lange Dateien abwerten
    if (f.content.length > 5000) priority -= 1
    if (f.content.length > 10000) priority -= 2
    
    return { file: f.path, priority: Math.max(1, Math.min(10, priority)), reason: '' }
  })
  
  // Sortiere nach Priorität (höchste zuerst)
  const sortedFiles = [...files].sort((a, b) => {
    const prioA = priorities.find(p => p.file === a.path)?.priority || 5
    const prioB = priorities.find(p => p.file === b.path)?.priority || 5
    return prioB - prioA
  })
  
  // Füge Dateien hinzu bis maxChars erreicht
  const result: { path: string; content: string; truncated: boolean }[] = []
  let totalChars = 0
  const droppedFiles: string[] = []
  
  for (const file of sortedFiles) {
    const fileChars = file.content.length + file.path.length + 50 // Header overhead
    
    if (totalChars + fileChars <= maxChars) {
      // Datei passt komplett
      result.push({ path: file.path, content: file.content, truncated: false })
      totalChars += fileChars
    } else if (totalChars < maxChars * 0.9) {
      // Datei kürzen wenn noch Platz
      const availableChars = maxChars - totalChars - 100
      if (availableChars > 500) {
        const truncatedContent = file.content.substring(0, availableChars) + '\n// ... (gekürzt)'
        result.push({ path: file.path, content: truncatedContent, truncated: true })
        totalChars += availableChars + 100
      } else {
        droppedFiles.push(file.path)
      }
    } else {
      droppedFiles.push(file.path)
    }
  }
  
  return { prioritizedFiles: result, totalChars, droppedFiles }
}

// PLANNER-OUTPUT PARSER: Extrahiert strukturierte Tasks
interface PlannerTask {
  id: string
  name: string
  description: string
  changeType: 'add' | 'modify' | 'fix' | 'remove'
  affectedFiles: string[]
  priority: 'high' | 'medium' | 'low'
}

function parsePlannerOutput(plannerContent: string): { tasks: PlannerTask[]; summary: string; requestType: string } {
  let tasks: PlannerTask[] = []
  let summary = ''
  let requestType = 'new'
  
  // Versuche JSON zu parsen
  try {
    const jsonMatch = plannerContent.match(/\{[\s\S]*"tasks"[\s\S]*\}/g)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        tasks = parsed.tasks.map((t: Record<string, unknown>, i: number) => ({
          id: (t.id as string) || `task-${i + 1}`,
          name: (t.name as string) || 'Unbenannter Task',
          description: (t.description as string) || '',
          changeType: (t.changeType as 'add' | 'modify' | 'fix' | 'remove') || 'add',
          affectedFiles: (t.affectedFiles as string[]) || (t.affectedCode ? [t.affectedCode as string] : []),
          priority: (t.priority as 'high' | 'medium' | 'low') || 'medium',
        }))
      }
      summary = (parsed.summary as string) || ''
      requestType = (parsed.requestType as string) || 'new'
    }
  } catch {
    // Fallback: Extrahiere Tasks aus Markdown
    const taskMatches = plannerContent.matchAll(/(?:task|aufgabe|schritt)\s*[-:]?\s*\d*\.?\s*(.+?)(?:\n|$)/gi)
    let taskNum = 1
    for (const match of taskMatches) {
      tasks.push({
        id: `task-${taskNum++}`,
        name: match[1].trim(),
        description: '',
        changeType: 'add',
        affectedFiles: [],
        priority: 'medium',
      })
    }
  }
  
  return { tasks, summary, requestType }
}

// RESPONSE CACHE für wiederholte Anfragen
const responseCache = new Map<string, { content: string; files: ParsedCodeFile[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 Minuten

function getCacheKey(agentType: string, request: string, context: string): string {
  // Einfacher Hash
  const str = `${agentType}:${request}:${context.substring(0, 500)}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

function getFromCache(key: string): { content: string; files: ParsedCodeFile[] } | null {
  const cached = responseCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache] Hit für Key: ${key}`)
    return { content: cached.content, files: cached.files }
  }
  if (cached) {
    responseCache.delete(key) // Abgelaufen
  }
  return null
}

function setCache(key: string, content: string, files: ParsedCodeFile[]): void {
  // Begrenze Cache-Größe
  if (responseCache.size > 50) {
    const oldest = responseCache.keys().next().value
    if (oldest) responseCache.delete(oldest)
  }
  responseCache.set(key, { content, files, timestamp: Date.now() })
}

// ============================================================
// ERROR EXPLANATION SYSTEM
// Erklärt Build-Fehler verständlich und gibt konkrete Lösungen
// ============================================================

interface ErrorExplanation {
  title: string
  explanation: string
  solution: string
  codeExample?: string
  severity: 'error' | 'warning' | 'info'
}

function explainBuildError(errorMessage: string): ErrorExplanation {
  const error = errorMessage.toLowerCase()
  
  // Module not found
  if (error.includes("module not found") || error.includes("can't resolve")) {
    const moduleMatch = errorMessage.match(/['"](@\/[^'"]+|\.\/[^'"]+)['"]/)?.[1] || 'unbekannt'
    return {
      title: '📦 Modul nicht gefunden',
      explanation: `Die Datei "${moduleMatch}" wird importiert, existiert aber nicht im Projekt.`,
      solution: 'Erstelle die fehlende Datei oder korrigiere den Import-Pfad.',
      codeExample: `// Erstelle: ${moduleMatch.replace('@/components/', 'components/')}.tsx\n"use client";\n\nexport function ${moduleMatch.split('/').pop()}() {\n  return <div>...</div>;\n}`,
      severity: 'error'
    }
  }
  
  // No default export
  if (error.includes("does not contain a default export")) {
    const moduleMatch = errorMessage.match(/['"]([^'"]+)['"]/)?.[1] || ''
    return {
      title: '📤 Falscher Export-Typ',
      explanation: 'Du verwendest "import X from" aber die Datei hat keinen "export default".',
      solution: 'Ändere den Import zu Named Import: import { X } from "..."',
      codeExample: `// FALSCH:\nimport Calendar from "@/components/Calendar";\n\n// RICHTIG:\nimport { Calendar } from "@/components/Calendar";`,
      severity: 'error'
    }
  }
  
  // Multiple exports
  if (error.includes("multiple default exports") || error.includes("duplicate export")) {
    return {
      title: '📤 Doppelter Export',
      explanation: 'Eine Datei hat mehrere "export default" Statements.',
      solution: 'Entferne alle bis auf einen export default, oder nutze Named Exports.',
      codeExample: `// FALSCH:\nexport default function A() {}\nexport default function B() {}\n\n// RICHTIG:\nexport function A() {}\nexport function B() {}`,
      severity: 'error'
    }
  }
  
  // use client missing
  if (error.includes("usestate") || error.includes("useeffect") || error.includes("createcontext")) {
    if (error.includes("server component") || error.includes("client component")) {
      return {
        title: '🔄 Server/Client Mismatch',
        explanation: 'Hooks wie useState/useEffect funktionieren nur in Client Components.',
        solution: 'Füge "use client" als ERSTE Zeile der Datei hinzu.',
        codeExample: `// ERSTE Zeile der Datei:\n"use client";\n\nimport { useState } from "react";\n\nexport function MyComponent() {\n  const [state, setState] = useState(...);\n}`,
        severity: 'error'
      }
    }
  }
  
  // TypeScript errors
  if (error.includes("type error") || error.includes("typescript")) {
    if (error.includes("property") && error.includes("does not exist")) {
      return {
        title: '📝 TypeScript Property Fehler',
        explanation: 'Ein Property existiert nicht auf dem angegebenen Typ.',
        solution: 'Prüfe ob das Property richtig geschrieben ist oder erweitere den Typ.',
        severity: 'error'
      }
    }
    if (error.includes("argument of type")) {
      return {
        title: '📝 TypeScript Argument Fehler',
        explanation: 'Ein Funktionsargument hat den falschen Typ.',
        solution: 'Passe den Typ des Arguments an oder caste es korrekt.',
        severity: 'error'
      }
    }
  }
  
  // JSX errors
  if (error.includes("jsx") || error.includes("adjacent jsx elements")) {
    return {
      title: '🏷️ JSX Struktur Fehler',
      explanation: 'JSX erfordert ein einzelnes Root-Element.',
      solution: 'Umschließe mehrere Elemente mit <> ... </> (Fragment) oder einem <div>.',
      codeExample: `// FALSCH:\nreturn (\n  <div>A</div>\n  <div>B</div>\n);\n\n// RICHTIG:\nreturn (\n  <>\n    <div>A</div>\n    <div>B</div>\n  </>\n);`,
      severity: 'error'
    }
  }
  
  // Import errors
  if (error.includes("cannot find module") || error.includes("cannot resolve")) {
    return {
      title: '📦 Import Fehler',
      explanation: 'Ein npm-Paket oder eine Datei konnte nicht gefunden werden.',
      solution: 'Prüfe ob das Paket installiert ist (npm install) oder der Pfad korrekt ist.',
      severity: 'error'
    }
  }
  
  // Syntax errors
  if (error.includes("syntax error") || error.includes("unexpected token")) {
    return {
      title: '⚠️ Syntax Fehler',
      explanation: 'Der Code enthält einen Syntaxfehler (z.B. fehlende Klammer, Semikolon).',
      solution: 'Prüfe die markierte Zeile auf fehlende oder falsche Zeichen.',
      severity: 'error'
    }
  }
  
  // Next.js specific
  if (error.includes("metadata") && error.includes("client")) {
    return {
      title: '🔺 Next.js Metadata Fehler',
      explanation: '"export const metadata" funktioniert nicht in Client Components.',
      solution: 'Entferne "use client" oder verschiebe metadata in eine Server Component.',
      severity: 'error'
    }
  }
  
  if (error.includes("getserversideprops") || error.includes("getstaticprops")) {
    return {
      title: '🔺 Veraltete Next.js API',
      explanation: 'getServerSideProps/getStaticProps sind im App Router nicht verfügbar.',
      solution: 'Nutze Server Components oder generateStaticParams stattdessen.',
      severity: 'error'
    }
  }
  
  // Default
  return {
    title: '❓ Build Fehler',
    explanation: errorMessage.substring(0, 200),
    solution: 'Prüfe die Fehlermeldung und den betroffenen Code.',
    severity: 'error'
  }
}

// Erklärt Validierungs-Issues verständlich
function explainValidationIssue(issue: string): ErrorExplanation {
  const lower = issue.toLowerCase()
  
  if (lower.includes('import') && lower.includes('nicht erstellt')) {
    const fileMatch = issue.match(/"([^"]+)"/)?.[1] || ''
    return {
      title: '📦 Fehlende Datei',
      explanation: `Du importierst "${fileMatch}", aber diese Datei wurde nicht erstellt.`,
      solution: `Erstelle die Datei ${fileMatch.replace('@/components/', 'components/')}.tsx`,
      codeExample: `// filepath: ${fileMatch.replace('@/', '')}.tsx\n"use client";\n\nexport function ${fileMatch.split('/').pop()}() {\n  return <div>Komponente</div>;\n}`,
      severity: 'error'
    }
  }
  
  if (lower.includes('export default') && lower.includes('kein')) {
    return {
      title: '📤 Export Mismatch',
      explanation: 'Du nutzt "import X from" aber die Datei hat "export function X" (Named Export).',
      solution: 'Ändere zu: import { X } from "..."',
      codeExample: `// Ändere von:\nimport Calendar from "@/components/Calendar";\n\n// Zu:\nimport { Calendar } from "@/components/Calendar";`,
      severity: 'error'
    }
  }
  
  if (lower.includes('use client')) {
    return {
      title: '🔄 use client fehlt',
      explanation: 'Diese Datei verwendet Client-Features (useState, onClick, etc.) ohne "use client".',
      solution: 'Füge "use client"; als ERSTE Zeile hinzu.',
      codeExample: `"use client";\n\nimport { useState } from "react";\n// ... rest of code`,
      severity: 'error'
    }
  }
  
  if (lower.includes('memory leak') || lower.includes('clearinterval') || lower.includes('removeeventlistener')) {
    return {
      title: '🧠 Memory Leak',
      explanation: 'Timer oder Event Listener werden nicht aufgeräumt.',
      solution: 'Füge Cleanup in useEffect return hinzu.',
      codeExample: `useEffect(() => {\n  const interval = setInterval(...);\n  return () => clearInterval(interval); // Cleanup!\n}, []);`,
      severity: 'error'
    }
  }
  
  if (lower.includes('eval') || lower.includes('sql injection') || lower.includes('xss')) {
    return {
      title: '🔒 Sicherheitsrisiko',
      explanation: 'Der Code enthält potenziell unsichere Operationen.',
      solution: 'Vermeide eval(), innerHTML und dynamische SQL Queries.',
      severity: 'error'
    }
  }
  
  return {
    title: '⚠️ Code-Problem',
    explanation: issue,
    solution: 'Prüfe den betroffenen Code.',
    severity: 'warning'
  }
}

// ============================================================
// TEST GENERATION SYSTEM
// Generiert Unit Tests für React Komponenten
// ============================================================

interface GeneratedTest {
  filename: string
  content: string
  framework: 'jest' | 'vitest'
}

function generateTestsForComponent(
  componentName: string,
  componentCode: string,
  filePath: string
): GeneratedTest {
  // Analysiere Komponente
  const hasState = componentCode.includes('useState')
  const hasEffect = componentCode.includes('useEffect')
  const hasProps = componentCode.includes('props') || componentCode.match(/function\s+\w+\s*\(\s*\{/)
  const hasContext = componentCode.includes('useContext')
  const hasEvents = componentCode.includes('onClick') || componentCode.includes('onChange') || componentCode.includes('onSubmit')
  
  // Extrahiere Props
  const propsMatch = componentCode.match(/interface\s+(\w+Props)\s*\{([^}]+)\}/)
  const propsInterface = propsMatch ? propsMatch[0] : ''
  
  // Generiere Test
  const testPath = filePath.replace('.tsx', '.test.tsx').replace('.jsx', '.test.jsx')
  const importPath = filePath.replace('components/', '@/components/').replace('.tsx', '').replace('.jsx', '')
  
  let testContent = `import { render, screen${hasEvents ? ', fireEvent' : ''}${hasState ? ', waitFor' : ''} } from '@testing-library/react';
import { ${componentName} } from '${importPath}';

describe('${componentName}', () => {
  // Basic Render Test
  it('sollte ohne Fehler rendern', () => {
    render(<${componentName} ${hasProps ? '/* TODO: Props hinzufügen */' : ''}/>);
  });
`

  if (hasProps) {
    testContent += `
  // Props Test
  it('sollte Props korrekt anzeigen', () => {
    // TODO: Passe Props an
    render(<${componentName} />);
    // expect(screen.getByText('...')).toBeInTheDocument();
  });
`
  }

  if (hasState) {
    testContent += `
  // State Test
  it('sollte State korrekt aktualisieren', async () => {
    render(<${componentName} ${hasProps ? '/* Props */' : ''}/>);
    // TODO: Interaktion die State ändert
    // await waitFor(() => {
    //   expect(screen.getByText('...')).toBeInTheDocument();
    // });
  });
`
  }

  if (hasEvents) {
    testContent += `
  // Event Handler Test
  it('sollte auf Benutzer-Interaktion reagieren', () => {
    ${hasEvents && componentCode.includes('onClick') ? 'const handleClick = jest.fn();' : ''}
    render(<${componentName} ${hasProps ? '/* Props */' : ''}/>);
    
    // TODO: Finde und klicke Element
    // const button = screen.getByRole('button');
    // fireEvent.click(button);
    // expect(handleClick).toHaveBeenCalled();
  });
`
  }

  if (hasContext) {
    testContent += `
  // Context Test
  it('sollte mit Context Provider funktionieren', () => {
    // TODO: Wrape mit Context Provider
    // render(
    //   <ContextProvider>
    //     <${componentName} />
    //   </ContextProvider>
    // );
  });
`
  }

  // Snapshot Test
  testContent += `
  // Snapshot Test
  it('sollte dem Snapshot entsprechen', () => {
    const { container } = render(<${componentName} ${hasProps ? '/* Props */' : ''}/>);
    expect(container).toMatchSnapshot();
  });
});
`

  return {
    filename: testPath,
    content: testContent,
    framework: 'jest'
  }
}

// Generiert Tests für alle Komponenten im Projekt
function generateTestsForProject(files: ParsedCodeFile[]): GeneratedTest[] {
  const tests: GeneratedTest[] = []
  
  for (const file of files) {
    // Nur .tsx/.jsx Dateien
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.jsx')) continue
    
    // Überspringe Test-Dateien
    if (file.path.includes('.test.') || file.path.includes('.spec.')) continue
    
    // Überspringe page.tsx und layout.tsx
    if (file.path.includes('page.tsx') || file.path.includes('layout.tsx')) continue
    
    // Finde Komponenten-Namen
    const componentMatch = file.content.match(/export\s+(?:default\s+)?function\s+(\w+)/)
    if (!componentMatch) continue
    
    const componentName = componentMatch[1]
    const test = generateTestsForComponent(componentName, file.content, file.path)
    tests.push(test)
  }
  
  return tests
}

// ============================================================
// DIFF PREVIEW SYSTEM
// Zeigt Änderungen zwischen alter und neuer Version
// ============================================================

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber: number
}

interface FileDiff {
  path: string
  oldContent: string
  newContent: string
  lines: DiffLine[]
  additions: number
  deletions: number
  isNew: boolean
  isDeleted: boolean
}

function generateDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const diffLines: DiffLine[] = []
  
  // Einfacher Diff-Algorithmus (für komplexere Fälle könnte man diff-match-patch nutzen)
  const maxLines = Math.max(oldLines.length, newLines.length)
  
  let oldIndex = 0
  let newIndex = 0
  let lineNumber = 1
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex]
    const newLine = newLines[newIndex]
    
    if (oldLine === newLine) {
      diffLines.push({ type: 'unchanged', content: oldLine || '', lineNumber: lineNumber++ })
      oldIndex++
      newIndex++
    } else if (oldLine === undefined) {
      diffLines.push({ type: 'added', content: newLine, lineNumber: lineNumber++ })
      newIndex++
    } else if (newLine === undefined) {
      diffLines.push({ type: 'removed', content: oldLine, lineNumber: lineNumber++ })
      oldIndex++
    } else {
      // Zeile wurde geändert - zeige als removed + added
      diffLines.push({ type: 'removed', content: oldLine, lineNumber: lineNumber })
      diffLines.push({ type: 'added', content: newLine, lineNumber: lineNumber++ })
      oldIndex++
      newIndex++
    }
  }
  
  return diffLines
}

function generateFileDiffs(
  existingFiles: { path: string; content: string }[],
  newFiles: ParsedCodeFile[]
): FileDiff[] {
  const diffs: FileDiff[] = []
  const existingMap = new Map(existingFiles.map(f => [f.path, f.content]))
  
  // Neue oder geänderte Dateien
  for (const newFile of newFiles) {
    const oldContent = existingMap.get(newFile.path) || ''
    const isNew = !existingMap.has(newFile.path)
    
    if (isNew || oldContent !== newFile.content) {
      const lines = generateDiff(oldContent, newFile.content)
      const additions = lines.filter(l => l.type === 'added').length
      const deletions = lines.filter(l => l.type === 'removed').length
      
      diffs.push({
        path: newFile.path,
        oldContent,
        newContent: newFile.content,
        lines,
        additions,
        deletions,
        isNew,
        isDeleted: false
      })
    }
  }
  
  return diffs
}

function formatDiffForDisplay(diff: FileDiff): string {
  let output = `## ${diff.isNew ? '🆕' : '📝'} ${diff.path}\n`
  output += `+${diff.additions} -${diff.deletions}\n\n`
  output += '```diff\n'
  
  for (const line of diff.lines.slice(0, 50)) { // Limitiere auf 50 Zeilen
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
    output += `${prefix} ${line.content}\n`
  }
  
  if (diff.lines.length > 50) {
    output += `\n... und ${diff.lines.length - 50} weitere Zeilen\n`
  }
  
  output += '```\n'
  return output
}

// ============================================================
// REFACTORING SUGGESTIONS SYSTEM
// Schlägt Code-Verbesserungen vor
// ============================================================

interface RefactoringSuggestion {
  type: 'extract_component' | 'extract_hook' | 'split_file' | 'rename' | 'simplify' | 'remove_duplication'
  title: string
  description: string
  file: string
  priority: 'high' | 'medium' | 'low'
  codeExample?: string
}

function analyzeForRefactoring(files: ParsedCodeFile[]): RefactoringSuggestion[] {
  const suggestions: RefactoringSuggestion[] = []
  
  for (const file of files) {
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.jsx')) continue
    
    const lines = file.content.split('\n').length
    const componentCount = (file.content.match(/export\s+(?:default\s+)?function\s+\w+/g) || []).length
    const useStateCount = (file.content.match(/useState/g) || []).length
    const useEffectCount = (file.content.match(/useEffect/g) || []).length
    
    // 1. Datei zu groß
    if (lines > 200) {
      suggestions.push({
        type: 'split_file',
        title: '📁 Datei aufteilen',
        description: `${file.path} hat ${lines} Zeilen. Erwäge, sie in kleinere Module aufzuteilen.`,
        file: file.path,
        priority: lines > 400 ? 'high' : 'medium'
      })
    }
    
    // 2. Zu viele Komponenten in einer Datei
    if (componentCount > 2) {
      suggestions.push({
        type: 'extract_component',
        title: '🧩 Komponenten extrahieren',
        description: `${file.path} enthält ${componentCount} Komponenten. Jede sollte in einer eigenen Datei sein.`,
        file: file.path,
        priority: 'high',
        codeExample: `// Erstelle separate Dateien:\n// components/ComponentA.tsx\n// components/ComponentB.tsx`
      })
    }
    
    // 3. Zu viel State - Hook extrahieren
    if (useStateCount > 5) {
      suggestions.push({
        type: 'extract_hook',
        title: '🪝 Custom Hook extrahieren',
        description: `${file.path} hat ${useStateCount}x useState. Erwäge einen Custom Hook.`,
        file: file.path,
        priority: 'medium',
        codeExample: `// hooks/use${file.path.split('/').pop()?.replace('.tsx', '')}State.ts\nexport function use${file.path.split('/').pop()?.replace('.tsx', '')}State() {\n  const [state1, setState1] = useState(...);\n  // ...\n  return { state1, setState1, ... };\n}`
      })
    }
    
    // 4. Zu viele Effects
    if (useEffectCount > 3) {
      suggestions.push({
        type: 'extract_hook',
        title: '🪝 Effects in Hook auslagern',
        description: `${file.path} hat ${useEffectCount}x useEffect. Erwäge, sie in einen Custom Hook zu verschieben.`,
        file: file.path,
        priority: 'medium'
      })
    }
    
    // 5. Inline Styles zu CSS
    const inlineStyleCount = (file.content.match(/style=\{\{/g) || []).length
    if (inlineStyleCount > 5) {
      suggestions.push({
        type: 'simplify',
        title: '🎨 Inline Styles zu Tailwind/CSS',
        description: `${file.path} hat ${inlineStyleCount}x inline styles. Nutze Tailwind-Klassen stattdessen.`,
        file: file.path,
        priority: 'low'
      })
    }
    
    // 6. Duplizierter Code erkennen (vereinfacht)
    const functionBodies = file.content.match(/\{[^{}]{50,200}\}/g) || []
    const uniqueBodies = new Set(functionBodies)
    if (functionBodies.length > uniqueBodies.size + 2) {
      suggestions.push({
        type: 'remove_duplication',
        title: '♻️ Duplizierung entfernen',
        description: `${file.path} enthält möglicherweise duplizierten Code. Erwäge eine gemeinsame Funktion.`,
        file: file.path,
        priority: 'medium'
      })
    }
    
    // 7. Lange Funktionen
    const longFunctions = file.content.match(/function\s+\w+[^{]*\{[^}]{500,}/g) || []
    if (longFunctions.length > 0) {
      suggestions.push({
        type: 'simplify',
        title: '📏 Lange Funktion vereinfachen',
        description: `${file.path} hat ${longFunctions.length} sehr lange Funktion(en). Erwäge, sie aufzuteilen.`,
        file: file.path,
        priority: 'medium'
      })
    }
  }
  
  // Sortiere nach Priorität
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  
  return suggestions
}

// ============================================================
// DEPENDENCY GRAPH SYSTEM
// Visualisiert Import-Beziehungen
// ============================================================

interface DependencyNode {
  path: string
  imports: string[]
  importedBy: string[]
  isExternal: boolean
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  edges: { from: string; to: string }[]
  circularDeps: string[][]
}

function buildDependencyGraph(files: ParsedCodeFile[]): DependencyGraph {
  const nodes = new Map<string, DependencyNode>()
  const edges: { from: string; to: string }[] = []
  
  // Initialisiere Nodes
  for (const file of files) {
    nodes.set(file.path, {
      path: file.path,
      imports: [],
      importedBy: [],
      isExternal: false
    })
  }
  
  // Analysiere Imports
  for (const file of files) {
    const importMatches = file.content.matchAll(/import\s+(?:\{[^}]+\}|\w+)\s+from\s+["']([^"']+)["']/g)
    
    for (const match of importMatches) {
      const importPath = match[1]
      const isLocal = importPath.startsWith('@/') || importPath.startsWith('./') || importPath.startsWith('../')
      
      if (isLocal) {
        // Normalisiere Pfad
        let normalizedPath = importPath
          .replace('@/components/', 'components/')
          .replace('@/', '')
          .replace('./', '')
          .replace('../', '')
        
        if (!normalizedPath.endsWith('.tsx') && !normalizedPath.endsWith('.ts')) {
          normalizedPath += '.tsx'
        }
        
        // Finde passende Datei
        const targetFile = files.find(f => 
          f.path === normalizedPath || 
          f.path.endsWith(normalizedPath) ||
          f.path.includes(normalizedPath.replace('.tsx', ''))
        )
        
        if (targetFile) {
          const node = nodes.get(file.path)
          if (node) {
            node.imports.push(targetFile.path)
          }
          
          const targetNode = nodes.get(targetFile.path)
          if (targetNode) {
            targetNode.importedBy.push(file.path)
          }
          
          edges.push({ from: file.path, to: targetFile.path })
        }
      }
    }
  }
  
  // Erkenne zirkuläre Dependencies
  const circularDeps: string[][] = []
  
  function findCircular(start: string, visited: Set<string>, path: string[]): void {
    if (visited.has(start)) {
      const cycleStart = path.indexOf(start)
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart)
        // Prüfe ob dieser Zyklus schon gefunden wurde
        const cycleKey = [...cycle].sort().join(',')
        const existingKeys = circularDeps.map(c => [...c].sort().join(','))
        if (!existingKeys.includes(cycleKey)) {
          circularDeps.push(cycle)
        }
      }
      return
    }
    
    visited.add(start)
    path.push(start)
    
    const node = nodes.get(start)
    if (node) {
      for (const imp of node.imports) {
        findCircular(imp, new Set(visited), [...path])
      }
    }
  }
  
  for (const [path] of nodes) {
    findCircular(path, new Set(), [])
  }
  
  return { nodes, edges, circularDeps }
}

function formatDependencyGraph(graph: DependencyGraph): string {
  let output = '## 🔗 Dependency Graph\n\n'
  
  // Zeige Dateien mit meisten Imports (potenzielle "God Files")
  const sortedByImports = [...graph.nodes.values()]
    .sort((a, b) => b.imports.length - a.imports.length)
    .slice(0, 5)
  
  if (sortedByImports.length > 0) {
    output += '### 📥 Meiste Imports:\n'
    for (const node of sortedByImports) {
      if (node.imports.length > 0) {
        output += `- **${node.path}** (${node.imports.length} Imports)\n`
      }
    }
    output += '\n'
  }
  
  // Zeige Dateien die am meisten importiert werden (Core-Dateien)
  const sortedByImportedBy = [...graph.nodes.values()]
    .sort((a, b) => b.importedBy.length - a.importedBy.length)
    .slice(0, 5)
  
  if (sortedByImportedBy.length > 0) {
    output += '### 📤 Meistgenutzte Module:\n'
    for (const node of sortedByImportedBy) {
      if (node.importedBy.length > 0) {
        output += `- **${node.path}** (von ${node.importedBy.length} Dateien genutzt)\n`
      }
    }
    output += '\n'
  }
  
  // Zeige zirkuläre Dependencies
  if (graph.circularDeps.length > 0) {
    output += '### ⚠️ Zirkuläre Dependencies:\n'
    for (const cycle of graph.circularDeps) {
      output += `- ${cycle.join(' → ')} → ${cycle[0]}\n`
    }
    output += '\n'
  }
  
  return output
}

// ============================================================
// FIND MISSING IMPORTS
// Findet alle Imports die auf nicht-existierende Dateien verweisen
// ============================================================

interface MissingFileInfo {
  path: string
  componentName: string
  importedFrom: string
}

function findMissingImports(files: ParsedCodeFile[]): MissingFileInfo[] {
  // Sammle alle existierenden Pfade in verschiedenen Formaten
  const existingPaths = new Set<string>()
  for (const f of files) {
    existingPaths.add(f.path)
    existingPaths.add(f.path.replace(/^\//, ''))
    existingPaths.add(f.path.replace('.tsx', '').replace('.ts', ''))
    // Auch ohne components/ Prefix
    if (f.path.startsWith('components/')) {
      existingPaths.add(f.path.replace('components/', ''))
    }
  }
  
  const missingFiles: MissingFileInfo[] = []
  const seenPaths = new Set<string>()
  
  for (const file of files) {
    // ALLE lokalen Imports finden (sehr breite Regex)
    // Matcht: import { X } from "@/...", import X from "@/...", import { X } from "./..."
    const allImports = file.content.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g)
    
    for (const match of allImports) {
      const namedImports = match[1] // { X, Y }
      const defaultImport = match[2] // X
      const importPath = match[3]
      
      // Ignoriere externe Pakete (react, next, etc.)
      if (!importPath.startsWith('@/') && !importPath.startsWith('./') && !importPath.startsWith('../')) {
        continue
      }
      
      // Normalisiere den Pfad
      let normalizedPath = importPath
        .replace('@/components/', 'components/')
        .replace('@/lib/', 'lib/')
        .replace('@/app/', 'app/')
        .replace('@/', '')
        .replace('./', '')
        .replace('../', '')
      
      // Füge .tsx hinzu wenn keine Endung
      if (!normalizedPath.endsWith('.tsx') && !normalizedPath.endsWith('.ts') && !normalizedPath.endsWith('.css')) {
        normalizedPath += '.tsx'
      }
      
      // Prüfe ob Datei existiert (verschiedene Varianten)
      const pathVariants = [
        normalizedPath,
        normalizedPath.replace('.tsx', ''),
        normalizedPath.replace('.ts', ''),
        `components/${normalizedPath}`,
        normalizedPath.replace('components/', ''),
      ]
      
      const fileExists = pathVariants.some(variant => existingPaths.has(variant))
      
      if (!fileExists && !seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath)
        
        // Bestimme Komponenten-Name
        let componentName = ''
        if (namedImports) {
          componentName = namedImports.split(',')[0].trim().replace(/\s+as\s+\w+/, '')
        } else if (defaultImport) {
          componentName = defaultImport
        } else {
          // Fallback: aus Pfad extrahieren
          componentName = normalizedPath.split('/').pop()?.replace('.tsx', '').replace('.ts', '') || 'Component'
        }
        
        missingFiles.push({
          path: normalizedPath,
          componentName,
          importedFrom: file.path
        })
        
        console.log(`[findMissingImports] Fehlend: ${normalizedPath} (${componentName}) - importiert von ${file.path}`)
      }
    }
  }
  
  return missingFiles
}

// ============================================================
// AUTO-GENERATE MISSING FILES (Fallback mit Skeletons)
// Erstellt automatisch Skeleton-Dateien für fehlende Imports
// ============================================================

// Hilfsfunktion: Pfade normalisieren für konsistente Vergleiche
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')           // Windows -> Unix
    .replace(/^\/+/, '')           // Führende Slashes entfernen
    .replace(/\/+/g, '/')          // Doppelte Slashes entfernen
    .toLowerCase()                  // Case-insensitive (für Vergleiche)
}

function autoGenerateMissingFiles(files: ParsedCodeFile[]): ParsedCodeFile[] {
  // Normalisiere alle Pfade zuerst
  const normalizedFiles = files.map(f => ({
    ...f,
    path: f.path.replace(/\\/g, '/').replace(/^\/+/, '')
  }))
  
  const result = [...normalizedFiles]
  const existingPaths = new Set(normalizedFiles.map(f => normalizePath(f.path)))
  
  // PFLICHT: Prüfe ob CSS-Dateien fehlen (für Next.js Apps)
  const hasNextJsApp = normalizedFiles.some(f => normalizePath(f.path).includes('app/page.tsx'))
  
  if (hasNextJsApp) {
    // tailwind.config.js fehlt? (WICHTIGSTE DATEI!)
    if (!existingPaths.has('tailwind.config.js') && !existingPaths.has('tailwind.config.ts')) {
      result.push({
        path: 'tailwind.config.js',
        content: `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`,
        language: 'javascript'
      })
      console.log('[Auto-Generate] PFLICHT: tailwind.config.js erstellt')
    }

    // postcss.config.js fehlt?
    if (!existingPaths.has('postcss.config.js')) {
      result.push({
        path: 'postcss.config.js',
        content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
        language: 'javascript'
      })
      console.log('[Auto-Generate] PFLICHT: postcss.config.js erstellt')
    }

    // globals.css fehlt?
    if (!existingPaths.has('app/globals.css')) {
      result.push({
        path: 'app/globals.css',
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`,
        language: 'css'
      })
      console.log('[Auto-Generate] PFLICHT: app/globals.css erstellt')
    }
    
    // layout.tsx fehlt?
    if (!existingPaths.has('app/layout.tsx')) {
      result.push({
        path: 'app/layout.tsx',
        content: `import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "App",
  description: "Generated by AgentForge",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
`,
        language: 'typescript'
      })
      console.log('[Auto-Generate] PFLICHT: app/layout.tsx erstellt')
    } else {
      // layout.tsx existiert - prüfe ob globals.css importiert wird!
      const layoutIndex = result.findIndex(f => normalizePath(f.path) === 'app/layout.tsx')
      if (layoutIndex !== -1) {
        const layoutContent = result[layoutIndex].content
        // Prüfe ob globals.css Import fehlt
        if (!layoutContent.includes('globals.css') && !layoutContent.includes('global.css')) {
          // Füge globals.css Import am Anfang hinzu
          const lines = layoutContent.split('\n')
          // Finde erste Import-Zeile oder füge am Anfang ein
          let insertIndex = 0
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) {
              insertIndex = i
              break
            }
          }
          lines.splice(insertIndex, 0, 'import "./globals.css";')
          result[layoutIndex].content = lines.join('\n')
          console.log('[Auto-Generate] FIX: globals.css Import zu layout.tsx hinzugefügt')
        }
      }
    }
  }
  
  // Nutze die verbesserte findMissingImports Funktion
  const missingFileInfos = findMissingImports(result) // Nutze result statt files
  
  // Generiere Skeleton-Dateien für fehlende Imports
  for (const { path: filePath, componentName } of missingFileInfos) {
    // Bestimme ob es ein Context ist
    const isContext = filePath.toLowerCase().includes('context')
    
    let skeletonContent: string
    
    if (isContext) {
      // Context + Provider + Hook Skeleton
      skeletonContent = `"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface ${componentName}Type {
  // TODO: Define context type
  value: string;
  setValue: (value: string) => void;
}

const ${componentName} = createContext<${componentName}Type | undefined>(undefined);

export function ${componentName}Provider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState("");
  
  return (
    <${componentName}.Provider value={{ value, setValue }}>
      {children}
    </${componentName}.Provider>
  );
}

export function use${componentName.replace('Context', '')}() {
  const context = useContext(${componentName});
  if (!context) {
    throw new Error("use${componentName.replace('Context', '')} must be used within ${componentName}Provider");
  }
  return context;
}

export { ${componentName} };
`
    } else {
      // Standard-Komponenten Skeleton
      skeletonContent = `"use client";

import { useState } from "react";

interface ${componentName}Props {
  // TODO: Define props
}

export function ${componentName}({ }: ${componentName}Props) {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">${componentName}</h2>
      <p>TODO: Implement ${componentName} component</p>
    </div>
  );
}
`
    }
    
    result.push({
      path: filePath,
      content: skeletonContent,
      language: 'typescript'
    })
    
    console.log(`[Auto-Generate] Skeleton erstellt: ${filePath} (${componentName})`)
  }
  
  return result
}

// Spezifische Fehlermeldungen für verschiedene Fehlertypen
function getSpecificErrorMessage(error: unknown): { message: string; suggestion: string; recoverable: boolean } {
  const errorStr = String(error)
  
  if (errorStr.includes('rate limit') || errorStr.includes('429')) {
    return {
      message: 'API Rate Limit erreicht',
      suggestion: 'Warte 30 Sekunden und versuche es erneut, oder wechsle zu einem anderen Modell.',
      recoverable: true,
    }
  }
  
  if (errorStr.includes('context length') || errorStr.includes('maximum context')) {
    return {
      message: 'Kontext zu groß für das Modell',
      suggestion: 'Das Projekt hat zu viele/große Dateien. Versuche ein Modell mit größerem Context Window (z.B. Claude 3.5 Sonnet).',
      recoverable: false,
    }
  }
  
  if (errorStr.includes('401') || errorStr.includes('unauthorized') || errorStr.includes('invalid_api_key')) {
    return {
      message: 'Ungültiger API-Key',
      suggestion: 'Prüfe den API-Key in den Einstellungen. Stelle sicher, dass er korrekt kopiert wurde.',
      recoverable: false,
    }
  }
  
  if (errorStr.includes('500') || errorStr.includes('502') || errorStr.includes('503')) {
    return {
      message: 'API-Server nicht erreichbar',
      suggestion: 'Der Provider hat temporäre Probleme. Versuche es in einigen Minuten erneut.',
      recoverable: true,
    }
  }
  
  if (errorStr.includes('timeout') || errorStr.includes('ETIMEDOUT')) {
    return {
      message: 'Zeitüberschreitung',
      suggestion: 'Die Anfrage hat zu lange gedauert. Versuche eine einfachere Anfrage oder ein schnelleres Modell.',
      recoverable: true,
    }
  }
  
  return {
    message: 'Unbekannter Fehler',
    suggestion: `Fehlerdetails: ${errorStr.substring(0, 200)}`,
    recoverable: false,
  }
}

interface ParsedCodeFile {
  path: string
  content: string
  language: string
}

// Agent-Ergebnis-Validierung
interface ValidationResult {
  isValid: boolean
  issues: string[]
  criticalIssues: string[] // Fatale Fehler die Retry erfordern
  score: number // 0-100
}

function validateAgentResult(
  agentType: AgentType,
  content: string,
  files: ParsedCodeFile[],
  deploymentTarget?: DeploymentTarget
): ValidationResult {
  const issues: string[] = []
  const criticalIssues: string[] = []
  let score = 100
  const isNextJs = deploymentTarget && deploymentTarget !== "github-only"

  // Coder-Agent Validierung
  if (agentType === "coder") {
    // Muss mindestens eine Code-Datei enthalten
    if (files.length === 0) {
      criticalIssues.push("Keine Code-Dateien generiert")
      score -= 40
    }
    
    // Sammle alle Imports und Exports für Cross-File Validierung
    const allExports = new Map<string, { named: string[]; hasDefault: boolean }>()
    const allImports = new Map<string, { from: string; names: string[]; isDefault: boolean }[]>()
    
    for (const file of files) {
      // Sammle Named Exports: export function X, export const X
      const namedExportMatches = file.content.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)
      const namedExports: string[] = []
      for (const match of namedExportMatches) {
        namedExports.push(match[1])
      }
      
      // Prüfe auf Default Export
      const hasDefault = /export\s+default\s+(?:function|class|const)/.test(file.content)
      
      allExports.set(file.path, { named: namedExports, hasDefault })
      
      // Sammle Named Imports: import { X } from
      const namedImportMatches = file.content.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)
      const imports: { from: string; names: string[]; isDefault: boolean }[] = []
      for (const match of namedImportMatches) {
        const names = match[1].split(',').map(n => n.trim())
        imports.push({ from: match[2], names, isDefault: false })
      }
      
      // Sammle Default Imports: import X from (OHNE geschweifte Klammern!)
      const defaultImportMatches = file.content.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+)["']/g)
      for (const match of defaultImportMatches) {
        // Prüfe ob es nicht ein Named Import ist (der hat { })
        const fullMatch = match[0]
        if (!fullMatch.includes('{')) {
          imports.push({ from: match[2], names: [match[1]], isDefault: true })
        }
      }
      
      allImports.set(file.path, imports)
    }
    
    for (const file of files) {
      // KRITISCH: Prüfe auf doppelte export default (Build-Fehler!)
      const exportDefaultCount = (file.content.match(/export\s+default\s+function/g) || []).length
      if (exportDefaultCount > 1) {
        criticalIssues.push(`FATAL: ${file.path} hat ${exportDefaultCount}x "export default"`)
        score -= 50
      }
      
      // KRITISCH: Context/Provider in app/page.tsx (für Next.js)
      if (file.path.includes("page.tsx") && isNextJs) {
        if (file.content.includes("createContext") || file.content.includes("Provider value=")) {
          criticalIssues.push(`FATAL: ${file.path} enthält Context/Provider - muss in components/`)
          score -= 40
        }
      }
      
      // KRITISCH: Fehlende "use client" bei Client-Komponenten (Next.js)
      if (isNextJs && (file.path.endsWith('.tsx') || file.path.endsWith('.jsx'))) {
        const hasClientCode = file.content.includes('useState') || 
                             file.content.includes('useEffect') ||
                             file.content.includes('onClick') ||
                             file.content.includes('onChange')
        const hasUseClient = file.content.trimStart().startsWith('"use client"') ||
                            file.content.trimStart().startsWith("'use client'")
        if (hasClientCode && !hasUseClient) {
          criticalIssues.push(`FATAL: ${file.path} braucht "use client" (hat Client-Code)`)
          score -= 30
        }
      }
      
      // KRITISCH: Relative Imports statt @/components (Next.js)
      if (isNextJs) {
        if (file.content.includes('from "./') || file.content.includes('from "../')) {
          if (file.content.includes('/components/') || file.content.includes('Component')) {
            criticalIssues.push(`FATAL: ${file.path} verwendet relative Imports - nutze @/components/`)
            score -= 25
          }
        }
      }
      
      // KRITISCH: Import/Export Mismatch prüfen (GENERISCH für alle Projekte)
      const fileImports = allImports.get(file.path) || []
      for (const imp of fileImports) {
        // Prüfe alle lokalen Imports (nicht node_modules)
        const isLocalImport = imp.from.startsWith('@/') || 
                             imp.from.startsWith('./') || 
                             imp.from.startsWith('../') ||
                             imp.from.startsWith('components/') ||
                             imp.from.startsWith('src/')
        
        if (isLocalImport) {
          // Normalisiere Pfad für verschiedene Import-Stile
          let targetFile = imp.from
            .replace('@/components/', 'components/')
            .replace('@/', '')
            .replace('./', '')
            .replace('../', '')
          
          if (!targetFile.endsWith('.tsx') && !targetFile.endsWith('.ts')) {
            targetFile += '.tsx'
          }
          
          // Finde die Zieldatei (verschiedene Pfad-Varianten)
          const possiblePaths = [
            targetFile,
            targetFile.replace('.tsx', '/index.tsx'),
            `components/${targetFile}`,
            `src/${targetFile}`,
            `src/components/${targetFile}`,
          ]
          
          // KRITISCH: Prüfe ob importierte Datei überhaupt existiert/erstellt wurde
          let fileExists = false
          let targetExportsData = null
          
          for (const possiblePath of possiblePaths) {
            // Prüfe ob Datei in den generierten Dateien existiert
            const fileFound = files.some(f => 
              f.path === possiblePath || 
              f.path.endsWith(possiblePath) ||
              f.path.includes(possiblePath.replace('.tsx', ''))
            )
            if (fileFound) {
              fileExists = true
            }
            
            const found = allExports.get(possiblePath) ||
                         Array.from(allExports.entries()).find(([k]) => 
                           k.endsWith(possiblePath) || k.includes(possiblePath.replace('.tsx', ''))
                         )?.[1]
            if (found) {
              targetExportsData = found
              fileExists = true
              break
            }
          }
          
          // KRITISCH: Datei wird importiert aber wurde nicht erstellt!
          if (!fileExists) {
            criticalIssues.push(`FATAL: ${file.path} importiert "${imp.from}" aber diese Datei wurde NICHT erstellt! Erstelle: ${targetFile}`)
            score -= 40
          }
          
          if (targetExportsData && typeof targetExportsData === 'object' && 'named' in targetExportsData) {
            // KRITISCH: Default Import aber kein Default Export
            if (imp.isDefault && !targetExportsData.hasDefault) {
              const suggestedFix = targetExportsData.named.length > 0 
                ? `Nutze: import { ${imp.names[0]} } from "${imp.from}"`
                : ''
              criticalIssues.push(`FATAL: ${file.path} nutzt "import ${imp.names[0]} from" aber Datei hat KEINEN default export! ${suggestedFix}`)
              score -= 35
            }
            
            // KRITISCH: Named Import aber Name nicht exportiert
            if (!imp.isDefault) {
              for (const name of imp.names) {
                if (!targetExportsData.named.includes(name)) {
                  criticalIssues.push(`FATAL: ${file.path} importiert { ${name} } aber wird nicht exportiert`)
                  score -= 20
                }
              }
            }
          }
        }
      }
      
      // Unvollständiger Code
      if (file.content.includes("// ... rest") || file.content.includes("// TODO") || 
          file.content.match(/\.\.\.[^.]/)) {
        issues.push(`${file.path}: Enthält unvollständigen Code`)
        score -= 20
      }
      
      // Leere Datei
      if (file.content.trim().length < 50) {
        issues.push(`${file.path}: Datei ist zu kurz`)
        score -= 30
      }
      
      // Fehlende Imports bei React-Komponenten
      if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx")) {
        if (!file.content.includes("import") && file.content.includes("function")) {
          issues.push(`${file.path}: Fehlende Imports`)
          score -= 15
        }
        
        // KRITISCH: React.ReactNode ohne React Import
        if (file.content.includes('React.ReactNode') || file.content.includes('React.FC') || 
            file.content.includes('React.Component') || file.content.includes('React.useState')) {
          const hasReactImport = file.content.includes("import React") || 
                                file.content.includes("import * as React")
          if (!hasReactImport) {
            criticalIssues.push(`FATAL: ${file.path} verwendet React.X aber React ist nicht importiert! Nutze: import { ReactNode } from "react" und dann nur "ReactNode"`)
            score -= 30
          }
        }
        
        // Prüfe auf fehlende "use client" für Next.js
        if (deploymentTarget && deploymentTarget !== "github-only") {
          if (file.content.includes("useState") || file.content.includes("useEffect")) {
            if (!file.content.includes('"use client"') && !file.content.includes("'use client'")) {
              issues.push(`${file.path}: Fehlende "use client" Direktive für Client-Komponente`)
              score -= 10
            }
          }
        }
        
        // KRITISCH: Fehlende React Hook Imports
        const usedHooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer']
        for (const hook of usedHooks) {
          if (file.content.includes(`${hook}(`) || file.content.includes(`${hook}<`)) {
            // Prüfe ob der Hook importiert wurde
            const hasImport = file.content.includes(`import`) && 
                             (file.content.includes(`{ ${hook}`) || 
                              file.content.includes(`{${hook}`) ||
                              file.content.includes(`, ${hook}`) ||
                              file.content.includes(`${hook},`) ||
                              file.content.includes(`${hook} }`))
            if (!hasImport) {
              criticalIssues.push(`FATAL: ${file.path} verwendet ${hook}() aber importiert es nicht von "react"`)
              score -= 25
            }
          }
        }
        
        // KRITISCH: Fehlende key prop bei .map()
        const mapWithJSX = file.content.match(/\.map\s*\([^)]*\)\s*=>\s*[(<]/g)
        if (mapWithJSX && mapWithJSX.length > 0) {
          // Prüfe ob key prop vorhanden ist in der Nähe von map
          const hasKeyProp = file.content.includes('key={') || file.content.includes('key=')
          if (!hasKeyProp && file.content.includes('.map(')) {
            issues.push(`${file.path}: .map() ohne key prop gefunden - kann zu React-Warnungen führen`)
            score -= 10
          }
        }
        
        // KRITISCH: Ungültige JSX - nicht geschlossene Tags
        const selfClosingTags = ['img', 'br', 'hr', 'input', 'meta', 'link']
        for (const tag of selfClosingTags) {
          const openTag = new RegExp(`<${tag}[^>]*>(?!\\s*<\\/${tag}>)`, 'gi')
          const matches = file.content.match(openTag)
          if (matches) {
            for (const match of matches) {
              if (!match.includes('/>')) {
                criticalIssues.push(`FATAL: ${file.path} hat nicht geschlossenes <${tag}> Tag - nutze <${tag} />`)
                score -= 20
              }
            }
          }
        }
        
        // KRITISCH: async/await in Client-Komponenten ohne useEffect
        const hasUseClient = file.content.includes('"use client"') || file.content.includes("'use client'")
        if (hasUseClient) {
          const hasAsyncComponent = /export\s+(default\s+)?async\s+function/.test(file.content)
          if (hasAsyncComponent) {
            criticalIssues.push(`FATAL: ${file.path} ist async aber hat "use client" - Client-Komponenten können nicht async sein!`)
            score -= 30
          }
        }
        
        // KRITISCH: Server Actions in Client-Komponenten
        if (hasUseClient && file.content.includes('"use server"')) {
          criticalIssues.push(`FATAL: ${file.path} hat "use client" UND "use server" - nicht erlaubt!`)
          score -= 30
        }
        
        // Fehlende return statement in Komponenten
        const functionMatches = file.content.matchAll(/export\s+(default\s+)?function\s+(\w+)[^{]*\{/g)
        for (const match of functionMatches) {
          const funcName = match[2]
          // Finde den Funktionskörper (vereinfacht)
          const startIndex = match.index! + match[0].length
          const funcBody = file.content.substring(startIndex, startIndex + 500)
          if (!funcBody.includes('return') && !funcBody.includes('=>')) {
            issues.push(`${file.path}: Komponente ${funcName} hat möglicherweise kein return statement`)
            score -= 10
          }
        }
        
        // TypeScript: Fehlende Typen bei Props
        const propsWithoutType = file.content.match(/function\s+\w+\s*\(\s*\{\s*\w+[^:}]*\}\s*\)/g)
        if (propsWithoutType && propsWithoutType.length > 0) {
          issues.push(`${file.path}: Props ohne TypeScript-Typen gefunden`)
          score -= 5
        }
      }
    }
    
    // KRITISCH: Alle Komponenten in einer Datei?
    const componentCount = files.reduce((count, f) => {
      const matches = f.content.match(/export\s+(default\s+)?function\s+\w+/g) || []
      return count + matches.length
    }, 0)
    if (componentCount > 3 && files.length === 1) {
      criticalIssues.push(`WARNUNG: ${componentCount} Komponenten in nur 1 Datei - sollte aufgeteilt werden!`)
      score -= 25
    }
    
    // KRITISCH: Circular Dependencies erkennen (vereinfacht)
    for (const file of files) {
      const fileImports = allImports.get(file.path) || []
      for (const imp of fileImports) {
        // Prüfe ob importierte Datei zurück importiert
        const targetPath = imp.from.replace('@/components/', 'components/').replace('@/', '') + '.tsx'
        const targetImports = allImports.get(targetPath) || []
        for (const targetImp of targetImports) {
          const targetImportPath = targetImp.from.replace('@/components/', 'components/').replace('@/', '') + '.tsx'
          if (targetImportPath === file.path || targetImportPath.includes(file.path.replace('.tsx', ''))) {
            issues.push(`Mögliche Circular Dependency: ${file.path} ↔ ${targetPath}`)
            score -= 15
          }
        }
      }
    }
    
    // Prüfe ob Antwort nur Anweisungen enthält statt Code
    const instructionPatterns = [
      /du kannst.*ändern/i,
      /füge.*hinzu/i,
      /ändere zeile/i,
      /ersetze.*durch/i,
    ]
    if (instructionPatterns.some(p => p.test(content)) && files.length === 0) {
      criticalIssues.push("Antwort enthält nur Anweisungen statt Code")
      score -= 50
    }
    
    // === ERWEITERTE NEXT.JS VALIDIERUNGEN ===
    for (const file of files) {
      const isNextJs = deploymentTarget && deploymentTarget !== "github-only"
      const hasUseClient = file.content.includes('"use client"') || file.content.includes("'use client'")
      
      // KRITISCH: metadata export in "use client" Datei
      if (hasUseClient && file.content.includes('export const metadata')) {
        criticalIssues.push(`FATAL: ${file.path} hat "use client" aber exportiert metadata - metadata nur in Server Components!`)
        score -= 30
      }
      
      // KRITISCH: generateMetadata in "use client" Datei
      if (hasUseClient && file.content.includes('generateMetadata')) {
        criticalIssues.push(`FATAL: ${file.path} hat "use client" aber verwendet generateMetadata - nur in Server Components!`)
        score -= 30
      }
      
      // KRITISCH: process.env ohne NEXT_PUBLIC_ in Client-Komponente
      if (hasUseClient) {
        const envMatches = file.content.match(/process\.env\.(?!NEXT_PUBLIC_)(\w+)/g)
        if (envMatches && envMatches.length > 0) {
          criticalIssues.push(`FATAL: ${file.path} verwendet process.env ohne NEXT_PUBLIC_ in Client-Komponente - nicht zugänglich!`)
          score -= 25
        }
      }
      
      // WARNUNG: <img> statt next/image
      if (isNextJs && file.content.includes('<img') && !file.content.includes('next/image')) {
        issues.push(`${file.path}: Verwendet <img> statt next/image - Performance-Optimierung fehlt`)
        score -= 5
      }
      
      // WARNUNG: <a href> statt next/link für interne Links
      if (isNextJs && file.content.match(/<a\s+href=["']\/[^"']*["']/)) {
        if (!file.content.includes('next/link')) {
          issues.push(`${file.path}: Verwendet <a href="/..."> statt next/link für interne Navigation`)
          score -= 5
        }
      }
      
      // KRITISCH: API Route ohne HTTP Method Handler
      if (file.path.includes('api/') && file.path.includes('route.ts')) {
        const hasHandler = file.content.includes('export async function GET') ||
                          file.content.includes('export async function POST') ||
                          file.content.includes('export async function PUT') ||
                          file.content.includes('export async function DELETE') ||
                          file.content.includes('export async function PATCH')
        if (!hasHandler) {
          criticalIssues.push(`FATAL: ${file.path} ist API Route aber hat keine HTTP Method Handler (GET, POST, etc.)`)
          score -= 35
        }
      }
      
      // KRITISCH: layout.tsx ohne children prop
      if (file.path.includes('layout.tsx')) {
        if (!file.content.includes('children')) {
          criticalIssues.push(`FATAL: ${file.path} ist Layout aber hat keine children prop`)
          score -= 30
        }
      }
      
      // KRITISCH: Doppelte Hooks in einer Komponente (oft Copy-Paste Fehler)
      const hookCalls = file.content.match(/const\s+\[\w+,\s*set\w+\]\s*=\s*useState/g) || []
      const uniqueHooks = new Set(hookCalls)
      if (hookCalls.length > uniqueHooks.size) {
        issues.push(`${file.path}: Möglicherweise duplizierte useState Aufrufe gefunden`)
        score -= 10
      }
      
      // KRITISCH: Event Handler ohne useCallback bei Dependencies
      if (file.content.includes('useEffect') || file.content.includes('useMemo')) {
        const emptyDepsWithHandler = file.content.match(/use(?:Effect|Memo)\([^,]+,\s*\[\s*\]\)/g)
        if (emptyDepsWithHandler) {
          const hasHandlerInside = file.content.includes('onClick') || file.content.includes('onChange')
          if (hasHandlerInside) {
            issues.push(`${file.path}: useEffect/useMemo mit leerem Dependency-Array aber Event-Handler - prüfe Dependencies`)
            score -= 5
          }
        }
      }
      
      // KRITISCH: className mit Template Literal Fehler
      const classNameErrors = file.content.match(/className=\{`[^`]*\$\{[^}]*\}[^`]*`\s*\+/g)
      if (classNameErrors) {
        issues.push(`${file.path}: className Template Literal mit + Operator - nutze Template Literal komplett`)
        score -= 10
      }
      
      // KRITISCH: Fehlende Fragment bei mehreren Root-Elementen
      const returnMatches = file.content.match(/return\s*\(\s*<(?!>|Fragment)/g)
      if (returnMatches && returnMatches.length > 0) {
        // Vereinfachte Prüfung: Wenn mehrere Top-Level Tags ohne gemeinsamen Parent
        const jsxContent = file.content.match(/return\s*\(\s*([\s\S]*?)\s*\);/g)
        if (jsxContent) {
          for (const jsx of jsxContent) {
            const topLevelTags = jsx.match(/<[A-Z][a-z]*|<[a-z]+/g) || []
            // Wenn mehr als ein Top-Level Tag gefunden (sehr vereinfacht)
            if (topLevelTags.length > 5) {
              // Prüfe ob Fragment oder einzelner Parent
              if (!jsx.includes('<>') && !jsx.includes('Fragment') && !jsx.includes('<div') && !jsx.includes('<main')) {
                issues.push(`${file.path}: Möglicherweise mehrere Root-Elemente ohne Fragment`)
                score -= 10
              }
            }
          }
        }
      }
      
      // KRITISCH: Ungültige TypeScript - any Type verwendet
      if (file.content.includes(': any') || file.content.includes('<any>') || file.content.includes('as any')) {
        issues.push(`${file.path}: Verwendet 'any' Type - sollte spezifischer typisiert werden`)
        score -= 5
      }
      
      // KRITISCH: console.log in Production Code
      const consoleCount = (file.content.match(/console\.(log|warn|error|debug)/g) || []).length
      if (consoleCount > 3) {
        issues.push(`${file.path}: ${consoleCount}x console.* gefunden - sollte für Production entfernt werden`)
        score -= 5
      }
      
      // KRITISCH: Hardcoded URLs/API Keys
      if (file.content.match(/https?:\/\/[^"'\s]+api[^"'\s]*/i) && !file.content.includes('process.env')) {
        issues.push(`${file.path}: Hardcoded API URL gefunden - sollte Environment Variable sein`)
        score -= 10
      }
      
      // KRITISCH: fetch ohne error handling
      if (file.content.includes('fetch(') && !file.content.includes('catch') && !file.content.includes('try')) {
        issues.push(`${file.path}: fetch() ohne Error Handling (try/catch)`)
        score -= 10
      }
      
      // === 50 WEITERE VALIDIERUNGEN ===
      
      // --- REACT/JSX VALIDIERUNGEN (1-10) ---
      
      // 1. Fehlende displayName bei forwardRef
      if (file.content.includes('forwardRef') && !file.content.includes('displayName')) {
        issues.push(`${file.path}: forwardRef ohne displayName - erschwert Debugging`)
        score -= 3
      }
      
      // 2. setState in useEffect ohne Cleanup
      if (file.content.includes('useEffect') && file.content.includes('setState') && !file.content.includes('return ()')) {
        issues.push(`${file.path}: setState in useEffect ohne Cleanup - mögliches Memory Leak`)
        score -= 5
      }
      
      // 3. Direktes DOM-Manipulation (document.getElementById)
      if (file.content.includes('document.getElementById') || file.content.includes('document.querySelector')) {
        issues.push(`${file.path}: Direkte DOM-Manipulation - nutze useRef stattdessen`)
        score -= 8
      }
      
      // 4. innerHTML Verwendung (XSS Risiko)
      if (file.content.includes('innerHTML') || file.content.includes('dangerouslySetInnerHTML')) {
        issues.push(`${file.path}: innerHTML/dangerouslySetInnerHTML - XSS Sicherheitsrisiko`)
        score -= 15
      }
      
      // 5. Event Handler ohne Binding/Arrow Function
      if (file.content.match(/onClick=\{this\.\w+\}/) && !file.content.includes('bind(this)')) {
        issues.push(`${file.path}: Event Handler ohne Binding - 'this' wird undefined sein`)
        score -= 10
      }
      
      // 6. useEffect mit Objekt/Array als Dependency
      const effectWithObjectDep = file.content.match(/useEffect\([^,]+,\s*\[[^\]]*\{[^\]]*\]\)/g)
      if (effectWithObjectDep) {
        issues.push(`${file.path}: useEffect mit Objekt als Dependency - wird bei jedem Render ausgeführt`)
        score -= 8
      }
      
      // 7. Conditional Hook Calls
      if (file.content.match(/if\s*\([^)]+\)\s*\{[^}]*use(State|Effect|Callback|Memo|Ref)\(/)) {
        criticalIssues.push(`FATAL: ${file.path} ruft Hooks bedingt auf - verletzt Rules of Hooks!`)
        score -= 30
      }
      
      // 8. setState mit altem State ohne Callback
      if (file.content.match(/set\w+\(\w+\s*[+\-*/]/)) {
        issues.push(`${file.path}: setState mit altem State - nutze Callback-Form: setState(prev => prev + 1)`)
        score -= 5
      }
      
      // 9. Fehlendes Suspense für lazy Components
      if (file.content.includes('React.lazy') && !file.content.includes('Suspense')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet React.lazy ohne Suspense Wrapper`)
        score -= 20
      }
      
      // 10. Uncontrolled zu Controlled Input Wechsel
      if (file.content.match(/value=\{.*\|\|\s*["']["']\}/) || file.content.match(/value=\{.*\?\?.*\}/)) {
        issues.push(`${file.path}: Input wechselt zwischen controlled/uncontrolled - nutze defaultValue oder initialen State`)
        score -= 5
      }
      
      // --- TYPESCRIPT VALIDIERUNGEN (11-20) ---
      
      // 11. @ts-ignore Verwendung
      if (file.content.includes('@ts-ignore') || file.content.includes('@ts-nocheck')) {
        issues.push(`${file.path}: @ts-ignore/@ts-nocheck - TypeScript Fehler sollten behoben werden`)
        score -= 10
      }
      
      // 12. Nicht-null Assertion (!) ohne Prüfung
      const nonNullCount = (file.content.match(/\w+!/g) || []).length
      if (nonNullCount > 5) {
        issues.push(`${file.path}: ${nonNullCount}x Non-null Assertion (!) - könnte Runtime-Fehler verursachen`)
        score -= 5
      }
      
      // 13. Type Assertion ohne Grund
      const asCount = (file.content.match(/\s+as\s+\w+/g) || []).length
      if (asCount > 3) {
        issues.push(`${file.path}: ${asCount}x Type Assertion (as) - prüfe ob nötig`)
        score -= 3
      }
      
      // 14. Fehlende Return Type bei Funktionen
      if (file.content.match(/function\s+\w+\s*\([^)]*\)\s*\{/) && !file.content.match(/function\s+\w+\s*\([^)]*\):\s*\w+/)) {
        issues.push(`${file.path}: Funktionen ohne expliziten Return Type`)
        score -= 3
      }
      
      // 15. Generic ohne Constraint
      if (file.content.match(/<T>/) && !file.content.match(/<T\s+extends/)) {
        issues.push(`${file.path}: Generic <T> ohne Constraint - könnte spezifischer sein`)
        score -= 2
      }
      
      // 16. Enum statt const (Tree-Shaking Problem)
      if (file.content.includes('enum ') && !file.content.includes('const enum')) {
        issues.push(`${file.path}: enum statt const enum - schlechteres Tree-Shaking`)
        score -= 2
      }
      
      // 17. Object statt Record Type
      if (file.content.includes(': object') || file.content.includes('<object>')) {
        issues.push(`${file.path}: 'object' Type - nutze Record<string, unknown> für bessere Typisierung`)
        score -= 3
      }
      
      // 18. Function Type zu generisch
      if (file.content.includes(': Function') || file.content.includes('<Function>')) {
        issues.push(`${file.path}: 'Function' Type - nutze spezifischen Funktionstyp`)
        score -= 5
      }
      
      // 19. Optionale Properties ohne undefined Check
      if (file.content.match(/\?\.\w+\(/) && file.content.match(/\w+\?\s*:/)) {
        // Gut - Optional Chaining wird verwendet
      } else if (file.content.match(/\w+\?\s*:/) && !file.content.includes('?.')) {
        issues.push(`${file.path}: Optionale Properties ohne Optional Chaining (?.)`)
        score -= 3
      }
      
      // 20. Index Signature mit any
      if (file.content.match(/\[\w+:\s*string\]:\s*any/)) {
        issues.push(`${file.path}: Index Signature mit any - nutze spezifischen Typ`)
        score -= 5
      }
      
      // --- NEXT.JS SPEZIFISCHE VALIDIERUNGEN (21-30) ---
      
      // 21. getServerSideProps in App Router
      if (file.content.includes('getServerSideProps') && file.path.includes('app/')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet getServerSideProps im App Router - nutze Server Components`)
        score -= 30
      }
      
      // 22. getStaticProps in App Router
      if (file.content.includes('getStaticProps') && file.path.includes('app/')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet getStaticProps im App Router - nutze generateStaticParams`)
        score -= 30
      }
      
      // 23. getInitialProps (veraltet)
      if (file.content.includes('getInitialProps')) {
        issues.push(`${file.path}: getInitialProps ist veraltet - nutze getServerSideProps oder App Router`)
        score -= 10
      }
      
      // 24. useRouter von next/router statt next/navigation
      if (file.content.includes("from 'next/router'") || file.content.includes('from "next/router"')) {
        if (file.path.includes('app/')) {
          criticalIssues.push(`FATAL: ${file.path} importiert next/router im App Router - nutze next/navigation`)
          score -= 25
        }
      }
      
      // 25. Head von next/head im App Router
      if (file.content.includes("from 'next/head'") || file.content.includes('from "next/head"')) {
        if (file.path.includes('app/')) {
          criticalIssues.push(`FATAL: ${file.path} verwendet next/head im App Router - nutze Metadata API`)
          score -= 25
        }
      }
      
      // 26. cookies()/headers() in Client Component
      if (hasUseClient && (file.content.includes('cookies()') || file.content.includes('headers()'))) {
        criticalIssues.push(`FATAL: ${file.path} verwendet cookies()/headers() in Client Component`)
        score -= 25
      }
      
      // 27. revalidatePath/revalidateTag in Client
      if (hasUseClient && (file.content.includes('revalidatePath') || file.content.includes('revalidateTag'))) {
        criticalIssues.push(`FATAL: ${file.path} verwendet revalidate* in Client Component - nur Server Actions`)
        score -= 25
      }
      
      // 28. redirect() in try/catch
      if (file.content.includes('redirect(') && file.content.includes('try')) {
        issues.push(`${file.path}: redirect() in try/catch - redirect wirft NEXT_REDIRECT Error`)
        score -= 10
      }
      
      // 29. notFound() in Client Component
      if (hasUseClient && file.content.includes('notFound()')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet notFound() in Client Component`)
        score -= 25
      }
      
      // 30. Fehlende loading.tsx für lange Operationen
      if (file.path.includes('page.tsx') && file.content.includes('await') && !file.content.includes('Suspense')) {
        issues.push(`${file.path}: async page ohne loading.tsx oder Suspense`)
        score -= 5
      }
      
      // --- PERFORMANCE VALIDIERUNGEN (31-40) ---
      
      // 31. Große Arrays ohne useMemo
      if (file.content.match(/\.filter\(.*\)\.map\(/) && !file.content.includes('useMemo')) {
        issues.push(`${file.path}: filter().map() Chain ohne useMemo - könnte Performance-Problem sein`)
        score -= 3
      }
      
      // 32. Inline Object/Array in JSX Props
      if (file.content.match(/\w+=\{\s*\[/) || file.content.match(/\w+=\{\s*\{(?!\s*\.\.\.)/)) {
        const inlineCount = (file.content.match(/\w+=\{\s*[\[{]/g) || []).length
        if (inlineCount > 3) {
          issues.push(`${file.path}: ${inlineCount}x Inline Objects/Arrays in Props - verursacht Re-Renders`)
          score -= 5
        }
      }
      
      // 33. Fehlende React.memo für List Items
      if (file.content.includes('.map(') && file.content.includes('key=')) {
        if (!file.content.includes('memo(') && !file.content.includes('React.memo')) {
          issues.push(`${file.path}: List Items ohne React.memo - könnte Re-Render-Performance verbessern`)
          score -= 2
        }
      }
      
      // 34. setInterval ohne Cleanup
      if (file.content.includes('setInterval') && !file.content.includes('clearInterval')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet setInterval ohne clearInterval - Memory Leak!`)
        score -= 20
      }
      
      // 35. setTimeout ohne Cleanup in useEffect
      if (file.content.includes('setTimeout') && file.content.includes('useEffect')) {
        if (!file.content.includes('clearTimeout')) {
          issues.push(`${file.path}: setTimeout in useEffect ohne clearTimeout`)
          score -= 8
        }
      }
      
      // 36. Event Listener ohne Cleanup
      if (file.content.includes('addEventListener') && !file.content.includes('removeEventListener')) {
        criticalIssues.push(`FATAL: ${file.path} addEventListener ohne removeEventListener - Memory Leak!`)
        score -= 20
      }
      
      // 37. Große Bundle Imports
      if (file.content.includes("import * as") || file.content.includes("import _ from 'lodash'")) {
        issues.push(`${file.path}: Importiert gesamte Library - nutze spezifische Imports`)
        score -= 8
      }
      
      // 38. JSON.parse ohne Typisierung
      if (file.content.includes('JSON.parse(') && !file.content.match(/JSON\.parse\([^)]+\)\s*as\s+\w+/)) {
        issues.push(`${file.path}: JSON.parse ohne Type Assertion - Rückgabewert ist any`)
        score -= 3
      }
      
      // 39. Synchrone localStorage Zugriffe
      if (file.content.includes('localStorage.getItem') || file.content.includes('sessionStorage.getItem')) {
        if (!file.content.includes('useEffect') && !file.content.includes('typeof window')) {
          issues.push(`${file.path}: localStorage ohne SSR-Check - funktioniert nicht auf Server`)
          score -= 10
        }
      }
      
      // 40. window Zugriff ohne Check
      if (file.content.includes('window.') && !file.content.includes('typeof window')) {
        if (isNextJs && !hasUseClient) {
          issues.push(`${file.path}: window Zugriff ohne typeof window Check - Server Error`)
          score -= 10
        }
      }
      
      // --- SECURITY VALIDIERUNGEN (41-50) ---
      
      // 41. eval() Verwendung
      if (file.content.includes('eval(')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet eval() - Sicherheitsrisiko!`)
        score -= 30
      }
      
      // 42. new Function() Verwendung
      if (file.content.includes('new Function(')) {
        criticalIssues.push(`FATAL: ${file.path} verwendet new Function() - wie eval(), Sicherheitsrisiko!`)
        score -= 30
      }
      
      // 43. Hardcoded Secrets
      const secretPatterns = [
        /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
        /secret\s*[:=]\s*["'][^"']+["']/i,
        /password\s*[:=]\s*["'][^"']+["']/i,
        /token\s*[:=]\s*["'][^"']+["']/i,
        /private[_-]?key\s*[:=]\s*["'][^"']+["']/i,
      ]
      for (const pattern of secretPatterns) {
        if (pattern.test(file.content)) {
          criticalIssues.push(`FATAL: ${file.path} enthält möglicherweise hardcoded Secrets!`)
          score -= 30
          break
        }
      }
      
      // 44. SQL Injection Risiko
      if (file.content.match(/`SELECT.*\$\{/i) || file.content.match(/`INSERT.*\$\{/i) || file.content.match(/`UPDATE.*\$\{/i)) {
        criticalIssues.push(`FATAL: ${file.path} mögliche SQL Injection - nutze Prepared Statements!`)
        score -= 30
      }
      
      // 45. Path Traversal Risiko
      if (file.content.match(/fs\.(read|write).*\$\{/) || file.content.match(/path\.join.*\$\{.*req\./)) {
        criticalIssues.push(`FATAL: ${file.path} mögliche Path Traversal - validiere User Input!`)
        score -= 25
      }
      
      // 46. Unsichere RegExp (ReDoS)
      if (file.content.match(/new RegExp\([^)]*\+/)) {
        issues.push(`${file.path}: Dynamische RegExp mit User Input - ReDoS Risiko`)
        score -= 15
      }
      
      // 47. HTTP statt HTTPS
      if (file.content.match(/["']http:\/\/(?!localhost|127\.0\.0\.1)/)) {
        issues.push(`${file.path}: HTTP URL statt HTTPS - unsichere Verbindung`)
        score -= 10
      }
      
      // 48. CORS * Wildcard
      if (file.content.includes("'*'") && file.content.includes('Access-Control')) {
        issues.push(`${file.path}: CORS Wildcard (*) - sollte spezifische Origins erlauben`)
        score -= 10
      }
      
      // 49. JWT ohne Expiry
      if (file.content.includes('jwt.sign') && !file.content.includes('expiresIn')) {
        issues.push(`${file.path}: JWT ohne expiresIn - Tokens sollten ablaufen`)
        score -= 15
      }
      
      // 50. Unverschlüsselte Daten in localStorage
      if (file.content.includes('localStorage.setItem') && (file.content.includes('token') || file.content.includes('user'))) {
        issues.push(`${file.path}: Sensible Daten in localStorage - nutze httpOnly Cookies`)
        score -= 10
      }
    }
  }
  
  // Planner-Agent Validierung
  if (agentType === "planner") {
    // Muss strukturierten Plan enthalten
    if (!content.includes("task") && !content.includes("Task") && !content.includes("##")) {
      issues.push("Kein strukturierter Plan erkennbar")
      score -= 30
    }
  }
  
  // Reviewer-Agent Validierung  
  if (agentType === "reviewer") {
    // Muss Bewertung oder Issues enthalten
    if (!content.includes("score") && !content.includes("issue") && !content.includes("Problem")) {
      issues.push("Kein Review-Feedback erkennbar")
      score -= 25
    }
  }

  return {
    isValid: score >= 50 && criticalIssues.length === 0,
    issues,
    criticalIssues,
    score: Math.max(0, score),
  }
}

// Retry-Konfiguration
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableErrors: [
    "rate limit",
    "timeout",
    "network",
    "500",
    "503",
    "overloaded",
  ],
}

interface ParsedSuggestion {
  type: AgentSuggestion["type"]
  title: string
  description: string
  priority: AgentSuggestion["priority"]
  filePath: string
  newContent: string
}

// Intelligente Fehler-Erkennung im Agent-Output
interface DetectedError {
  type: "syntax" | "runtime" | "type" | "import" | "logic" | "security" | "unknown"
  message: string
  file?: string
  line?: number
  severity: "error" | "warning" | "info"
  autoFixable: boolean
  suggestedFix?: string
}

function detectErrorsInOutput(content: string): DetectedError[] {
  const errors: DetectedError[] = []
  const contentLower = content.toLowerCase()
  
  // TypeScript/JavaScript Syntax Errors
  const syntaxPatterns = [
    { regex: /SyntaxError:\s*(.+)/gi, type: "syntax" as const },
    { regex: /Unexpected token\s*['"]?(\w+)['"]?/gi, type: "syntax" as const },
    { regex: /Missing semicolon/gi, type: "syntax" as const },
  ]
  
  // Type Errors
  const typePatterns = [
    { regex: /TypeError:\s*(.+)/gi, type: "type" as const },
    { regex: /Type '(\w+)' is not assignable to type '(\w+)'/gi, type: "type" as const },
    { regex: /Property '(\w+)' does not exist/gi, type: "type" as const },
    { regex: /Cannot find name '(\w+)'/gi, type: "type" as const },
  ]
  
  // Import Errors
  const importPatterns = [
    { regex: /Cannot find module ['"]([^'"]+)['"]/gi, type: "import" as const },
    { regex: /Module not found:\s*(.+)/gi, type: "import" as const },
    { regex: /Failed to resolve import/gi, type: "import" as const },
  ]
  
  // Runtime Errors
  const runtimePatterns = [
    { regex: /ReferenceError:\s*(.+)/gi, type: "runtime" as const },
    { regex: /is not defined/gi, type: "runtime" as const },
    { regex: /Cannot read propert(y|ies) of (undefined|null)/gi, type: "runtime" as const },
  ]
  
  // Alle Patterns durchsuchen
  const allPatterns = [
    ...syntaxPatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: true })),
    ...typePatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: true })),
    ...importPatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: true })),
    ...runtimePatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: false })),
  ]
  
  for (const pattern of allPatterns) {
    const matches = content.matchAll(pattern.regex)
    for (const match of matches) {
      // Extrahiere Zeilennummer falls vorhanden
      const lineMatch = content.slice(Math.max(0, match.index! - 50), match.index! + 100).match(/line\s*(\d+)/i)
      const fileMatch = content.slice(Math.max(0, match.index! - 100), match.index! + 50).match(/([a-zA-Z0-9_-]+\.(tsx?|jsx?|ts|js))/i)
      
      errors.push({
        type: pattern.type,
        message: match[0],
        file: fileMatch?.[1],
        line: lineMatch ? parseInt(lineMatch[1]) : undefined,
        severity: pattern.severity,
        autoFixable: pattern.autoFixable,
      })
    }
  }
  
  // Deduplizieren
  const uniqueErrors = errors.filter((error, index, self) => 
    index === self.findIndex(e => e.message === error.message && e.type === error.type)
  )
  
  return uniqueErrors
}

// Generiere automatische Fix-Vorschläge basierend auf Fehlertyp
function generateAutoFixSuggestion(error: DetectedError): string | undefined {
  switch (error.type) {
    case "import":
      if (error.message.includes("Cannot find module")) {
        const moduleName = error.message.match(/['"]([^'"]+)['"]/)?.[1]
        if (moduleName) {
          return `Installiere das fehlende Modul: npm install ${moduleName}`
        }
      }
      return "Prüfe die Import-Pfade und stelle sicher, dass alle Module installiert sind"
      
    case "type":
      if (error.message.includes("is not assignable")) {
        return "Korrigiere den Typ oder füge eine Type-Assertion hinzu"
      }
      if (error.message.includes("does not exist")) {
        return "Füge die fehlende Property zum Interface hinzu oder korrigiere den Property-Namen"
      }
      return "Überprüfe die TypeScript-Typen und korrigiere die Typisierung"
      
    case "syntax":
      return "Korrigiere die Syntax (fehlende Klammern, Semikolons, etc.)"
      
    case "runtime":
      if (error.message.includes("undefined") || error.message.includes("null")) {
        return "Füge Null-Checks hinzu: variable?.property oder variable && variable.property"
      }
      return "Stelle sicher, dass alle Variablen vor Verwendung definiert sind"
      
    default:
      return undefined
  }
}

// Erstellt eine menschenlesbare Zusammenfassung der Agent-Ausgabe
function createHumanReadableSummary(
  agentType: AgentType,
  content: string,
  files: ParsedCodeFile[],
  duration: string,
  targetEnvironment?: string
): string {
  const agentNames: Record<string, string> = {
    planner: "Planner",
    coder: "Coder",
    reviewer: "Reviewer",
    security: "Security-Prüfer",
    executor: "Executor",
  }
  
  const agentName = agentNames[agentType] || agentType

  // Planner Agent
  if (agentType === "planner") {
    const steps = (content.match(/^\d+\./gm) || []).length
    const hasArchitecture = content.toLowerCase().includes("architektur") || content.toLowerCase().includes("struktur")
    const hasTech = content.toLowerCase().includes("technolog") || content.toLowerCase().includes("react") || content.toLowerCase().includes("next")
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `📋 **Was wurde geplant:**\n`
    if (steps > 0) summary += `- ${steps} Entwicklungsschritte definiert\n`
    if (hasArchitecture) summary += `- Projektarchitektur festgelegt\n`
    if (hasTech) summary += `- Technologie-Stack ausgewählt\n`
    summary += `- Anforderungen analysiert und strukturiert`
    
    return summary
  }

  // Coder Agent
  if (agentType === "coder") {
    if (files.length === 0) {
      return `✅ **${agentName} abgeschlossen** (${duration}s)\n\n📝 Code-Analyse durchgeführt, keine neuen Dateien erstellt.`
    }
    
    const fileTypes = new Set(files.map(f => f.language))
    const components = files.filter(f => f.path.includes("component") || f.content.includes("export default function") || f.content.includes("export function"))
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `📁 **Erstellte Dateien:** ${files.length}\n`
    files.forEach(f => {
      const fileName = f.path.split("/").pop()
      summary += `- \`${fileName}\`\n`
    })
    
    if (components.length > 0) {
      summary += `\n🧩 **Komponenten:** ${components.length} React-Komponenten erstellt`
    }
    
    return summary
  }

  // Reviewer Agent
  if (agentType === "reviewer") {
    const hasIssues = content.toLowerCase().includes("problem") || content.toLowerCase().includes("fehler") || content.toLowerCase().includes("issue")
    const hasSuggestions = content.toLowerCase().includes("vorschlag") || content.toLowerCase().includes("empfehl") || content.toLowerCase().includes("verbess")
    const isApproved = content.toLowerCase().includes("gut") || content.toLowerCase().includes("korrekt") || content.toLowerCase().includes("✓") || content.toLowerCase().includes("approved")
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🔍 **Code-Review Ergebnis:**\n`
    
    if (isApproved && !hasIssues) {
      summary += `- ✓ Code-Qualität: Gut\n`
      summary += `- ✓ Keine kritischen Probleme gefunden`
    } else if (hasIssues) {
      summary += `- ⚠️ Verbesserungspotential identifiziert\n`
    }
    
    if (hasSuggestions) {
      summary += `\n- 💡 Optimierungsvorschläge erstellt`
    }
    
    return summary
  }

  // Security Agent
  if (agentType === "security") {
    const hasVulnerabilities = content.toLowerCase().includes("vulnerab") || content.toLowerCase().includes("sicherheitslücke") || content.toLowerCase().includes("risiko")
    const isSecure = content.toLowerCase().includes("sicher") || content.toLowerCase().includes("keine probleme") || content.toLowerCase().includes("✓")
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🔒 **Sicherheitsanalyse:**\n`
    
    if (isSecure && !hasVulnerabilities) {
      summary += `- ✓ Keine Sicherheitslücken gefunden\n`
      summary += `- ✓ Best Practices eingehalten`
    } else if (hasVulnerabilities) {
      summary += `- ⚠️ Sicherheitshinweise erstellt\n`
      summary += `- Empfehlungen im Detail-Log verfügbar`
    }
    
    return summary
  }

  // Executor Agent
  if (agentType === "executor") {
    // Bestimme den korrekten Tab-Namen basierend auf targetEnvironment
    const envTabNames: Record<string, string> = {
      sandpack: "Sandpack",
      webcontainer: "WebContainer",
      local: "Editor",
      docker: "Editor",
    }
    const tabName = envTabNames[targetEnvironment || "sandpack"] || "Preview"
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🚀 **Ausführung:**\n`
    summary += `- Projekt ist bereit zur Vorschau\n`
    summary += `- Wechsle zum "${tabName}"-Tab für Live-Preview`
    
    return summary
  }

  // === MARKETPLACE AGENTS ===
  
  // Tester Agent
  if (agentType === "tester") {
    const testCount = (content.match(/(?:test|it|describe)\s*\(/gi) || []).length
    const hasJest = content.toLowerCase().includes("jest") || content.toLowerCase().includes("vitest")
    
    let summary = `✅ **Test Agent** abgeschlossen (${duration}s)\n\n`
    summary += `🧪 **Test-Generierung:**\n`
    if (testCount > 0) summary += `- ${testCount} Tests generiert\n`
    if (hasJest) summary += `- Jest/Vitest Test-Suite erstellt\n`
    if (files.length > 0) summary += `- ${files.length} Test-Dateien erstellt`
    
    return summary
  }
  
  // Documenter Agent
  if (agentType === "documenter") {
    const hasReadme = files.some(f => f.path.toLowerCase().includes("readme"))
    const hasApi = content.toLowerCase().includes("api") || content.toLowerCase().includes("endpoint")
    
    let summary = `✅ **Documentation Agent** abgeschlossen (${duration}s)\n\n`
    summary += `📝 **Dokumentation:**\n`
    if (hasReadme) summary += `- README.md erstellt\n`
    if (hasApi) summary += `- API-Dokumentation generiert\n`
    if (files.length > 0) summary += `- ${files.length} Dokumentationsdateien erstellt`
    
    return summary
  }
  
  // Optimizer Agent
  if (agentType === "optimizer") {
    const hasPerf = content.toLowerCase().includes("performance") || content.toLowerCase().includes("optimier")
    const hasBundle = content.toLowerCase().includes("bundle") || content.toLowerCase().includes("size")
    
    let summary = `✅ **Performance Optimizer** abgeschlossen (${duration}s)\n\n`
    summary += `⚡ **Optimierung:**\n`
    if (hasPerf) summary += `- Performance-Analyse durchgeführt\n`
    if (hasBundle) summary += `- Bundle-Size analysiert\n`
    summary += `- Optimierungsvorschläge erstellt`
    
    return summary
  }
  
  // Accessibility Agent
  if (agentType === "accessibility") {
    const hasA11y = content.toLowerCase().includes("wcag") || content.toLowerCase().includes("aria")
    
    let summary = `✅ **Accessibility Agent** abgeschlossen (${duration}s)\n\n`
    summary += `♿ **Barrierefreiheit:**\n`
    if (hasA11y) summary += `- WCAG-Prüfung durchgeführt\n`
    summary += `- A11y-Empfehlungen erstellt`
    
    return summary
  }
  
  // Database Agent
  if (agentType === "database") {
    const hasPrisma = content.toLowerCase().includes("prisma")
    const hasSchema = content.toLowerCase().includes("schema") || content.toLowerCase().includes("model")
    
    let summary = `✅ **Database Agent** abgeschlossen (${duration}s)\n\n`
    summary += `🗄️ **Datenbank:**\n`
    if (hasPrisma) summary += `- Prisma Schema generiert\n`
    if (hasSchema) summary += `- Datenmodell erstellt\n`
    if (files.length > 0) summary += `- ${files.length} Schema-Dateien erstellt`
    
    return summary
  }
  
  // DevOps Agent
  if (agentType === "devops") {
    const hasDocker = content.toLowerCase().includes("docker")
    const hasCI = content.toLowerCase().includes("github actions") || content.toLowerCase().includes("ci/cd")
    
    let summary = `✅ **DevOps Agent** abgeschlossen (${duration}s)\n\n`
    summary += `🐳 **DevOps:**\n`
    if (hasDocker) summary += `- Docker-Konfiguration erstellt\n`
    if (hasCI) summary += `- CI/CD Pipeline generiert\n`
    if (files.length > 0) summary += `- ${files.length} Konfigurationsdateien erstellt`
    
    return summary
  }
  
  // SAP Agents
  if ((agentType as string).startsWith("sap-")) {
    const agentDisplayNames: Record<string, string> = {
      "sap-cap-developer": "SAP CAP Developer",
      "sap-ui5-developer": "SAP UI5 Developer",
      "sap-fiori-developer": "SAP Fiori Developer",
      "sap-mdk-developer": "SAP MDK Developer",
    }
    
    const displayName = agentDisplayNames[agentType] || agentType
    const hasCDS = content.toLowerCase().includes("cds") || content.toLowerCase().includes("entity")
    const hasUI5 = content.toLowerCase().includes("ui5") || content.toLowerCase().includes("sapui5")
    const hasFiori = content.toLowerCase().includes("fiori") || content.toLowerCase().includes("annotation")
    
    let summary = `✅ **${displayName}** abgeschlossen (${duration}s)\n\n`
    summary += `🏢 **SAP Entwicklung:**\n`
    if (hasCDS) summary += `- CDS-Modelle erstellt\n`
    if (hasUI5) summary += `- UI5 Code generiert\n`
    if (hasFiori) summary += `- Fiori-Konfiguration erstellt\n`
    if (files.length > 0) summary += `- ${files.length} Dateien erstellt`
    
    return summary
  }

  // Fallback für unbekannte Agenten
  return `✅ **${agentName} abgeschlossen** (${duration}s)`
}

function parseSuggestionsFromResponse(content: string, agent: string, existingFiles: ProjectFile[]): Omit<AgentSuggestion, "id" | "createdAt" | "status">[] {
  const suggestions: Omit<AgentSuggestion, "id" | "createdAt" | "status">[] = []
  
  console.log(`[parseSuggestions] Parsing response from ${agent}, length: ${content.length}`)
  
  // Methode 1: Versuche JSON aus der Antwort zu extrahieren
  const jsonMatch = content.match(/\{[\s\S]*"suggestedFixes"[\s\S]*\}/m)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      console.log(`[parseSuggestions] Found JSON with suggestedFixes:`, parsed.suggestedFixes?.length || 0)
      if (parsed.suggestedFixes && Array.isArray(parsed.suggestedFixes)) {
        for (const fix of parsed.suggestedFixes) {
          if (fix.filePath && fix.newContent) {
            const existingFile = existingFiles.find(f => f.path === fix.filePath)
            suggestions.push({
              agent,
              type: fix.type || "improvement",
              title: fix.title || "Verbesserungsvorschlag",
              description: fix.description || "",
              affectedFiles: [fix.filePath],
              suggestedChanges: [{
                filePath: fix.filePath,
                originalContent: existingFile?.content || "",
                newContent: fix.newContent,
              }],
              priority: fix.priority || "medium",
            })
          }
        }
      }
    } catch (e) {
      console.log(`[parseSuggestions] JSON parsing failed:`, e)
    }
  }
  
  // Methode 2: Parse "issues" Array aus dem JSON (alternatives Format)
  if (suggestions.length === 0) {
    const issuesMatch = content.match(/\{[\s\S]*"issues"[\s\S]*\}/m)
    if (issuesMatch) {
      try {
        const parsed = JSON.parse(issuesMatch[0])
        console.log(`[parseSuggestions] Found JSON with issues:`, parsed.issues?.length || 0)
        if (parsed.issues && Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            if (issue.file && issue.suggestion) {
              suggestions.push({
                agent,
                type: issue.severity === "critical" ? "fix" : "improvement",
                title: issue.message || "Code-Issue",
                description: issue.suggestion,
                affectedFiles: [issue.file],
                suggestedChanges: [],
                priority: issue.severity === "critical" ? "high" : issue.severity === "warning" ? "medium" : "low",
              })
            }
          }
        }
      } catch (e) {
        console.log(`[parseSuggestions] Issues JSON parsing failed:`, e)
      }
    }
  }
  
  // Methode 3: Parse natürlichsprachliche Vorschläge (Fallback)
  if (suggestions.length === 0) {
    // Suche nach Mustern wie "Problem:", "Issue:", "Verbesserung:", etc.
    const patterns = [
      /(?:Problem|Issue|Fehler|Error):\s*(.+?)(?:\n|$)/gi,
      /(?:Verbesserung|Improvement|Empfehlung|Recommendation):\s*(.+?)(?:\n|$)/gi,
      /(?:⚠️|❌|🔴)\s*(.+?)(?:\n|$)/gi,
    ]
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const title = match[1].trim().substring(0, 100)
        if (title.length > 10) {
          suggestions.push({
            agent,
            type: "improvement",
            title: title,
            description: "",
            affectedFiles: [],
            suggestedChanges: [],
            priority: "medium",
          })
        }
      }
    }
    console.log(`[parseSuggestions] Found ${suggestions.length} natural language suggestions`)
  }
  
  console.log(`[parseSuggestions] Total suggestions found: ${suggestions.length}`)
  return suggestions
}

export function parseCodeFromResponse(content: string): ParsedCodeFile[] {
  const files: ParsedCodeFile[] = []
  
  // Debug: Log content length and first 500 chars
  console.log(`[parseCodeFromResponse] Content length: ${content.length}`)
  console.log(`[parseCodeFromResponse] Content preview: ${content.substring(0, 500)}...`)
  
  // Mehrere Patterns für Code-Blöcke - ROBUSTER REGEX
  // Akzeptiert: ```language\n, ```language \n, ```\n, ``` \n, mit \r\n oder \n
  // Pattern 1: ```language\n// filepath: path\ncode```
  // Pattern 2: ```language\ncode``` mit filepath im Code
  // Pattern 3: **filename** gefolgt von Code-Block
  const codeBlockRegex = /```(\w+)?[ \t]*[\r\n]+([\s\S]*?)```/gi
  
  // Debug: Check if content contains code blocks at all
  const hasBackticks = content.includes('```')
  console.log(`[parseCodeFromResponse] Contains backticks: ${hasBackticks}`)
  
  if (!hasBackticks) {
    console.warn(`[parseCodeFromResponse] WARNUNG: Keine Code-Blöcke gefunden! AI hat möglicherweise keinen Code generiert.`)
    // Versuche Code ohne Backticks zu finden (Fallback)
    const codePatterns = [
      /\/\/\s*filepath:\s*([\w\-./]+\.(?:tsx?|jsx?|css|json))\s*[\r\n]+([\s\S]+?)(?=\/\/\s*filepath:|$)/gi,
      /(?:^|\n)(?:import|export|function|const|"use client")/
    ]
    if (codePatterns[1].test(content)) {
      console.log(`[parseCodeFromResponse] Code-artige Inhalte gefunden, aber keine Backticks. Versuche Extraktion...`)
    }
  }
  
  let match
  let matchCount = 0
  while ((match = codeBlockRegex.exec(content)) !== null) {
    matchCount++
    let language = match[1] || "typescript"
    let code = match[2]?.trim()
    let path: string | undefined
    
    console.log(`[parseCodeFromResponse] Match ${matchCount}: language=${language}, code length=${code?.length || 0}`)
    
    if (!code) {
      console.log(`[parseCodeFromResponse] Match ${matchCount}: Leerer Code, überspringe`)
      continue
    }
    
    // Versuche Pfad aus verschiedenen Formaten zu extrahieren
    // Format 1: // filepath: path/to/file.tsx oder // src/App.js
    const filepathMatch = code.match(/^(?:\/\/|#|\/\*)\s*(?:filepath|file|path|filename)?:?\s*((?:src\/|app\/|components\/)?[\w\-./]+\.(?:tsx?|jsx?|css|json|html))(?:\s*\*\/)?$/m)
    if (filepathMatch) {
      path = filepathMatch[1].trim()
      // Entferne die filepath-Zeile aus dem Code
      code = code.replace(/^(?:\/\/|#|\/\*)\s*(?:filepath|file|path|filename)?:?\s*(?:src\/|app\/|components\/)?[\w\-./]+\.(?:tsx?|jsx?|css|json|html)(?:\s*\*\/)?[\r\n]*/m, "").trim()
    }
    
    // Format 2: Schaue vor dem Code-Block nach **filename** oder `filename`
    if (!path) {
      const beforeBlock = content.substring(0, match.index)
      const fileNameMatch = beforeBlock.match(/(?:\*\*|`)([^*`\n]+\.(?:tsx?|jsx?|json|css|html|md))(?:\*\*|`)\s*$/i)
      if (fileNameMatch) {
        path = fileNameMatch[1].trim()
      }
    }
    
    // Format 3: Erkenne Dateityp aus dem Inhalt
    if (!path) {
      if (code.startsWith("{") && (code.includes('"name"') || code.includes('"dependencies"'))) {
        path = "package.json"
        language = "json"
      } else if (code.includes('"compilerOptions"')) {
        path = "tsconfig.json"
        language = "json"
      } else if (code.includes("@tailwind") || code.includes("@import")) {
        path = "app/globals.css"
        language = "css"
      } else if (code.includes("module.exports") && code.includes("content:")) {
        path = "tailwind.config.js"
        language = "javascript"
      } else if (code.includes("export default function App")) {
        // WICHTIG: App-Komponente immer als App.tsx speichern (für Sandpack)
        path = "App.tsx"
      } else if (code.includes("export default function RootLayout") || code.includes("export default function Layout")) {
        path = "app/layout.tsx"
      } else if (code.includes("export default function Home") || code.includes("export default function Page")) {
        path = "app/page.tsx"
      } else if (code.includes("export default function") || code.includes("export function")) {
        const funcMatch = code.match(/export\s+(?:default\s+)?function\s+(\w+)/)
        if (funcMatch) {
          const name = funcMatch[1]
          // Prüfe ob es App ist (für Sandpack)
          if (name === "App") {
            path = "App.tsx"
          } else if (name.toLowerCase().includes("page")) {
            path = `app/${name.toLowerCase().replace("page", "")}/page.tsx`
          } else {
            path = `components/${name.charAt(0).toLowerCase() + name.slice(1)}.tsx`
          }
        }
      }
      
      if (!path) {
        const ext = language === "css" ? "css" : language === "json" ? "json" : language === "javascript" ? "js" : "tsx"
        path = `generated/file-${files.length + 1}.${ext}`
      }
    }
    
    // Normalisiere Pfad für Linux/Render Kompatibilität
    path = path
      .replace(/\\/g, '/')           // Windows Backslash -> Unix Forward Slash
      .replace(/^\/+/, '')           // Entferne führende Slashes
      .replace(/\/+/g, '/')          // Entferne doppelte Slashes
    
    // Bestimme Sprache aus Dateiendung wenn nicht gesetzt
    if (path.endsWith(".css")) language = "css"
    else if (path.endsWith(".json")) language = "json"
    else if (path.endsWith(".js")) language = "javascript"
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) language = "typescript"
    
    // VALIDIERUNG: Filtere ungültigen Code/Markdown-Artefakte
    const isInvalidCode = (content: string, lang: string): boolean => {
      const trimmed = content.trim()
      // Markdown-Header am Anfang
      if (/^#{1,6}\s/.test(trimmed)) return true
      // Markdown-Listen am Anfang (ohne Code-Kontext)
      if (/^\d+\.\s+[A-Za-z]/.test(trimmed) && !trimmed.includes('import') && !trimmed.includes('export')) return true
      // Nur Text ohne Code-Strukturen (für TS/JS/TSX/JSX)
      if (['typescript', 'javascript'].includes(lang)) {
        const hasCodeStructure = /^["']use client["'];?|^import\s|^export\s|^const\s|^let\s|^var\s|^function\s|^class\s|^interface\s|^type\s|^\/\*|^\/\//m.test(trimmed)
        if (!hasCodeStructure && trimmed.length > 10) {
          // Prüfe ob es aussieht wie Prosa/Markdown
          const looksLikeProsa = /^[A-ZÄÖÜ][a-zäöüß]+\s+[a-zäöüß]+/.test(trimmed) || /^(DATEIEN|Hier|Dies|Das|Ich|Wir|Die|Der|Eine?)\s/i.test(trimmed)
          if (looksLikeProsa) return true
        }
      }
      return false
    }
    
    if (isInvalidCode(code, language)) {
      console.warn(`[parseCodeFromResponse] ÜBERSPRUNGEN (Markdown/Text): ${path}`)
      continue
    }
    
    files.push({
      path,
      content: code,
      language,
    })
    console.log(`[parseCodeFromResponse] Datei hinzugefügt: ${path} (${code.length} Zeichen)`)
  }
  
  console.log(`[parseCodeFromResponse] ERGEBNIS: ${files.length} Dateien gefunden`)
  if (files.length === 0 && hasBackticks) {
    console.warn(`[parseCodeFromResponse] Code-Blöcke vorhanden aber keine Dateien extrahiert! Mögliches Regex-Problem.`)
    // Zeige die ersten Backticks zum Debugging
    const firstBacktick = content.indexOf('```')
    if (firstBacktick >= 0) {
      console.log(`[parseCodeFromResponse] Erster Code-Block (Position ${firstBacktick}): "${content.substring(firstBacktick, firstBacktick + 100)}..."`)
    }
  }
  
  // FALLBACK: Wenn keine Dateien gefunden, versuche Code ohne Backticks zu extrahieren
  if (files.length === 0) {
    console.log(`[parseCodeFromResponse] Versuche Fallback-Extraktion...`)
    
    // Suche nach // filepath: Patterns ohne Code-Block
    const filepathPattern = /\/\/\s*filepath:\s*([\w\-./]+\.(?:tsx?|jsx?|css|json))\s*[\r\n]+([\s\S]+?)(?=\/\/\s*filepath:|$)/gi
    let fpMatch
    while ((fpMatch = filepathPattern.exec(content)) !== null) {
      const path = fpMatch[1].trim()
      let code = fpMatch[2].trim()
      // Entferne trailing ``` falls vorhanden
      code = code.replace(/```\s*$/, '').trim()
      
      if (code.length > 20) {
        const ext = path.split('.').pop() || 'tsx'
        const language = ext === 'css' ? 'css' : ext === 'json' ? 'json' : ext === 'js' ? 'javascript' : 'typescript'
        files.push({ path, content: code, language })
        console.log(`[parseCodeFromResponse] Fallback: Datei gefunden: ${path}`)
      }
    }
    
    // Wenn immer noch keine Dateien und es sieht nach React-Code aus
    if (files.length === 0) {
      const hasReactCode = content.includes('export default function') || 
                           content.includes('import { useState') ||
                           content.includes('import React')
      if (hasReactCode) {
        console.log(`[parseCodeFromResponse] React-Code erkannt ohne strukturierte Ausgabe, versuche Extraktion...`)
        
        // Versuche den gesamten Inhalt als App.tsx zu behandeln
        const codeStart = content.indexOf('import')
        if (codeStart >= 0) {
          let code = content.substring(codeStart)
          // Entferne Erklärungen nach dem Code (nach letzter })
          const lastBrace = code.lastIndexOf('}')
          if (lastBrace > 0) {
            code = code.substring(0, lastBrace + 1)
          }
          if (code.length > 50) {
            files.push({ path: 'App.tsx', content: code, language: 'typescript' })
            console.log(`[parseCodeFromResponse] Fallback: App.tsx aus rohem Content extrahiert`)
          }
        }
      }
    }
  }
  
  return files
}

export function useAgentExecutor() {
  const {
    agentConfigs,
    globalConfig,
    addMessage,
    addFile,
    addLog,
    setWorkflowSteps,
    updateWorkflowStep,
    setIsProcessing,
    setCurrentAgent,
    setError,
    currentProject,
    getFiles,
    clearFiles,
    clearLogs,
    updateFileByPath,
    workflowOrder,
    customAgentConfigs,
    addSuggestion,
    saveToHistory,
  } = useAgentStore()

  const executeAgent = useCallback(
    async (
      agentType: AgentType,
      userRequest: string,
      previousOutput?: string
    ): Promise<{ content: string; files: ParsedCodeFile[] }> => {
      // Hole Config aus agentConfigs oder Marketplace
      const coreConfig = agentConfigs[agentType]
      const marketplaceAgent = marketplaceAgents.find(a => a.id === agentType)
      const customConfig = customAgentConfigs[agentType]
      
      // Erstelle eine einheitliche Config (Custom-Config überschreibt Marketplace-Defaults)
      const config = coreConfig || (marketplaceAgent ? {
        name: marketplaceAgent.name,
        systemPrompt: customConfig?.systemPrompt || marketplaceAgent.systemPrompt || `Du bist der ${marketplaceAgent.name}. ${marketplaceAgent.description}`,
        model: customConfig?.model || marketplaceAgent.defaultModel || "gpt-4o",
        temperature: customConfig?.temperature ?? marketplaceAgent.defaultTemperature ?? 0.7,
        maxTokens: customConfig?.maxTokens || marketplaceAgent.defaultMaxTokens || 4000,
        enabled: customConfig?.enabled ?? true,
        tools: marketplaceAgent.tools || [],
      } : null)
      
      if (!config) {
        throw new Error(`Agent "${agentType}" nicht gefunden`)
      }
      
      // Validiere Config
      if (!config.systemPrompt) {
        console.warn(`Agent "${agentType}" hat keinen systemPrompt, verwende Fallback`)
        config.systemPrompt = `Du bist ein hilfreicher KI-Assistent namens ${config.name}.`
      }
      
      // Für Planner und Coder: Verwende umgebungsspezifischen Prompt
      const targetEnv = globalConfig.targetEnvironment || "sandpack"
      if (agentType === "planner" || agentType === "coder") {
        config.systemPrompt = getEnvironmentPrompt(agentType, targetEnv)
        console.log(`[Agent Executor] Verwende ${targetEnv}-Prompt für ${agentType}`)
      }
      
      // Füge Deployment-Target spezifischen Prompt für ALLE Agenten hinzu
      const deployTarget = (globalConfig as { deploymentTarget?: string }).deploymentTarget as DeploymentTarget
      if (deployTarget) {
        const deployPrompt = getDeploymentTargetPrompt(agentType, deployTarget)
        if (deployPrompt) {
          config.systemPrompt += "\n\n" + deployPrompt
          console.log(`[Agent Executor] Deployment-Target ${deployTarget} Prompt für ${agentType} hinzugefügt`)
        }
      }
      
      // RAG: Best Practices für Coder (optional aktivierbar in Settings)
      const enableBestPractices = (globalConfig as { enableBestPracticesRAG?: boolean }).enableBestPracticesRAG
      if (agentType === "coder" && enableBestPractices) {
        const criticalPractices = getCriticalBestPractices()
        config.systemPrompt += "\n\n" + criticalPractices
        const relevantPractices = getBestPracticesForRequest(userRequest)
        if (relevantPractices) {
          config.systemPrompt += "\n" + relevantPractices
          console.log(`[Agent Executor] Best Practices RAG aktiviert`)
        }
      }
      
      // Debug: Zeige Config
      console.log(`[Agent Executor] Config für ${agentType}:`, {
        name: config.name,
        model: config.model,
        hasSystemPrompt: !!config.systemPrompt,
        systemPromptLength: config.systemPrompt?.length,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      })
      
      // Bestimme den API-Key basierend auf dem Model
      // Mit Fallback zu OpenRouter wenn der primäre Provider nicht konfiguriert ist
      let provider = getProviderFromModel(config.model)
      let apiKey: string
      let providerName: string
      let usedModel = config.model
      
      if (provider === "openrouter") {
        apiKey = globalConfig.openrouterApiKey
        providerName = "OpenRouter"
      } else if (provider === "anthropic") {
        apiKey = globalConfig.anthropicApiKey
        providerName = "Anthropic"
        // Fallback zu OpenRouter wenn Anthropic nicht konfiguriert
        if (!apiKey && globalConfig.openrouterApiKey) {
          apiKey = globalConfig.openrouterApiKey
          provider = "openrouter"
          providerName = "OpenRouter (Fallback)"
          usedModel = `anthropic/${config.model}`
          console.log(`[Agent Executor] Fallback zu OpenRouter für Anthropic Model`)
        }
      } else {
        // OpenAI
        apiKey = globalConfig.openaiApiKey
        providerName = "OpenAI"
        // Fallback zu OpenRouter wenn OpenAI nicht konfiguriert
        if (!apiKey && globalConfig.openrouterApiKey) {
          apiKey = globalConfig.openrouterApiKey
          provider = "openrouter"
          providerName = "OpenRouter (Fallback)"
          usedModel = `openai/${config.model}`
          console.log(`[Agent Executor] Fallback zu OpenRouter für OpenAI Model`)
        }
      }

      console.log(`[Agent Executor] Provider: ${provider}, hasApiKey: ${!!apiKey}`)

      if (!apiKey) {
        throw new Error(
          `Kein API-Key konfiguriert. Bitte OpenAI, Anthropic oder OpenRouter API-Key ` +
          `in den Einstellungen (Sidebar) hinterlegen.`
        )
      }
      
      // Aktualisiere Model wenn Fallback verwendet wird
      config.model = usedModel

      // Baue die Nachrichten für den Agent
      const existingFiles = getFiles()
      
      // VERBESSERTES KONTEXT-MANAGEMENT
      // Speichert App-State und priorisiert wichtige Dateien
      const MAX_CONTEXT_CHARS = 80000 // ~20k Tokens (erhöht für besseren Kontext)
      let filesContext = ""
      let appStateContext = ""
      
      if (existingFiles.length > 0) {
        // APP-STATE ANALYSE für besseres Kontext-Verständnis
        const appState = {
          totalFiles: existingFiles.length,
          components: [] as string[],
          hooks: [] as string[],
          contexts: [] as string[],
          hasRouter: false,
          hasState: false,
          mainFeatures: [] as string[],
        }
        
        for (const file of existingFiles) {
          const content = file.content
          // Erkenne Komponenten
          const compMatch = content.match(/export\s+(?:function|const)\s+(\w+)/g)
          if (compMatch) {
            appState.components.push(...compMatch.map(m => m.replace(/export\s+(?:function|const)\s+/, '')))
          }
          // Erkenne Hooks
          if (content.includes('useState')) appState.hasState = true
          const hookMatch = content.match(/function\s+use\w+/g)
          if (hookMatch) appState.hooks.push(...hookMatch.map(m => m.replace('function ', '')))
          // Erkenne Contexts
          if (content.includes('createContext')) {
            const ctxMatch = content.match(/const\s+(\w+Context)/g)
            if (ctxMatch) appState.contexts.push(...ctxMatch.map(m => m.replace('const ', '')))
          }
          // Erkenne Router
          if (content.includes('useRouter') || content.includes('next/navigation')) appState.hasRouter = true
          // Erkenne Features
          if (content.toLowerCase().includes('calendar') || content.toLowerCase().includes('kalender')) appState.mainFeatures.push('Kalender')
          if (content.toLowerCase().includes('contact') || content.toLowerCase().includes('crm')) appState.mainFeatures.push('CRM/Kontakte')
          if (content.toLowerCase().includes('dashboard')) appState.mainFeatures.push('Dashboard')
          if (content.toLowerCase().includes('chat') || content.toLowerCase().includes('message')) appState.mainFeatures.push('Chat')
        }
        
        // Erstelle App-State Zusammenfassung
        if (appState.components.length > 0 || appState.mainFeatures.length > 0) {
          appStateContext = `
## 📊 APP-STATE ZUSAMMENFASSUNG:
- **Komponenten (${appState.components.length}):** ${appState.components.slice(0, 15).join(', ')}${appState.components.length > 15 ? '...' : ''}
- **Custom Hooks:** ${appState.hooks.length > 0 ? appState.hooks.join(', ') : 'keine'}
- **Contexts:** ${appState.contexts.length > 0 ? appState.contexts.join(', ') : 'keine'}
- **Features:** ${[...new Set(appState.mainFeatures)].join(', ') || 'nicht erkannt'}
- **Hat State:** ${appState.hasState ? 'Ja' : 'Nein'}
- **Hat Router:** ${appState.hasRouter ? 'Ja' : 'Nein'}

**WICHTIG:** Behalte alle bestehenden Komponenten, Hooks und State bei!
`
        }
        
        // Nutze intelligente Priorisierung
        const { prioritizedFiles, totalChars, droppedFiles } = prioritizeFilesForContext(
          existingFiles.map(f => ({ path: f.path, content: f.content })),
          userRequest,
          MAX_CONTEXT_CHARS
        )
        
        const fileContexts: string[] = []
        for (const f of prioritizedFiles) {
          const truncatedNote = f.truncated ? ' (gekürzt)' : ''
          fileContexts.push(`### ${f.path}${truncatedNote}\n\`\`\`typescript\n${f.content}\n\`\`\``)
        }
        
        // Zeige ausgelassene Dateien
        let droppedNote = ''
        if (droppedFiles.length > 0) {
          droppedNote = `\n\n📁 **Weitere Dateien (nicht im Kontext):** ${droppedFiles.join(', ')}`
        }
        
        // PARTIAL EDITS: Analysiere welche Dateien geändert werden müssen
        const requiredChanges = analyzeRequiredChanges(userRequest, existingFiles)
        const partialEditPrompt = requiredChanges.length > 0 
          ? generatePartialEditPrompt(requiredChanges, existingFiles)
          : ''
        
        const partialEditInfo = requiredChanges.length > 0
          ? `\n\n## 🎯 PARTIAL EDIT ERKANNT:
Nur ${requiredChanges.length} Datei(en) müssen geändert werden:
${requiredChanges.map(c => `- ${c.path} (${c.type})`).join('\n')}
`
          : ''
        
        filesContext = `\n\n## ⚠️ ITERATIONS-MODUS AKTIV - BESTEHENDE DATEIEN (${existingFiles.length} Dateien, ${Math.round(totalChars / 1000)}k Zeichen):
${appStateContext}${partialEditInfo}
Dies ist eine Folge-Anfrage zu einem bestehenden Projekt. Analysiere den bestehenden Code sorgfältig!

${partialEditPrompt}

${fileContexts.join("\n\n")}${droppedNote}

## WICHTIGE ANWEISUNGEN FÜR DIESE ITERATION:
1. Erkenne ob es ein BUGFIX, FEATURE oder ANPASSUNG ist
2. Analysiere welche Teile des Codes betroffen sind
3. Behalte ALLE funktionierenden Teile bei
4. Gib NUR die geänderten Dateien aus (Partial Edit Mode)
5. Vergiss keine bestehenden Imports, States oder Handler`
      }

      const projectContext = currentProject
        ? `\n\nProjekt: ${currentProject.name}\nBeschreibung: ${currentProject.description}`
        : ""

      // Strukturierter Kontext vom vorherigen Agent
      let previousContext = ""
      if (previousOutput) {
        // Erkenne Agent-Typ aus vorherigem Output
        const isPlannerOutput = previousOutput.includes("## Plan") || previousOutput.includes("## Aufgaben") || previousOutput.includes("## Features") || previousOutput.includes('"tasks"')
        const isCoderOutput = previousOutput.includes("```") && (previousOutput.includes("export") || previousOutput.includes("function") || previousOutput.includes("const"))
        const isReviewerOutput = previousOutput.includes("## Review") || previousOutput.includes("Verbesserung") || previousOutput.includes("Problem")
        
        if (isPlannerOutput && agentType === "coder") {
          // STRUKTURIERTER PLANNER-OUTPUT PARSER
          const parsedPlan = parsePlannerOutput(previousOutput)
          
          let taskList = ''
          if (parsedPlan.tasks.length > 0) {
            taskList = '\n\n**📋 STRUKTURIERTE TASKS (arbeite diese der Reihe nach ab):**\n'
            for (const task of parsedPlan.tasks) {
              taskList += `\n${task.id}. **${task.name}** [${task.priority}]\n`
              if (task.description) taskList += `   ${task.description}\n`
              if (task.affectedFiles.length > 0) taskList += `   Dateien: ${task.affectedFiles.join(', ')}\n`
            }
          }
          
          previousContext = `\n\n## 📋 PLAN VOM PLANNER:
**Zusammenfassung:** ${parsedPlan.summary || 'Keine Zusammenfassung'}
**Typ:** ${parsedPlan.requestType}
${taskList}

${previousOutput}

**WICHTIG:** Implementiere ALLE Tasks. Erstelle für JEDE Komponente eine EIGENE Datei!`
        } else if (isCoderOutput && agentType === "reviewer") {
          previousContext = `\n\n## 💻 CODE VOM CODER (Prüfe diesen Code):\n${previousOutput}\n\n**AUFGABE:** Analysiere den Code auf Bugs, Best Practices, Performance und Sicherheit.`
        } else if (isReviewerOutput && agentType === "coder") {
          previousContext = `\n\n## 🔍 FEEDBACK VOM REVIEWER (Setze diese Verbesserungen um!):\n${previousOutput}\n\n**WICHTIG:** Implementiere ALLE genannten Verbesserungen. Gib den vollständigen korrigierten Code aus.`
        } else if (agentType === "security") {
          previousContext = `\n\n## 📄 ZU PRÜFENDER CODE:\n${previousOutput}\n\n**AUFGABE:** Führe einen vollständigen Security-Audit durch.`
        } else {
          previousContext = `\n\n## Vorheriger Output:\n${previousOutput}`
        }
      }

      // MCP Server Kontext
      const mcpServerIds = customConfig?.mcpServers || (coreConfig as any)?.mcpServers || []
      const mcpContext = mcpServerIds.length > 0
        ? `\n\nVerfügbare MCP Server:\n${mcpServerIds.map((id: string) => {
            const server = getMcpServerById(id)
            if (!server) return null
            return `- ${server.name}: ${server.description} (Capabilities: ${server.capabilities.join(", ")})`
          }).filter(Boolean).join("\n")}`
        : ""

      // RAG-Kontext aus der Knowledge Base abrufen (agentenspezifisch)
      // Verwende OpenAI wenn verfügbar, sonst OpenRouter als Fallback
      let ragContext = ""
      const ragApiKey = globalConfig.openaiApiKey || globalConfig.openrouterApiKey
      const ragProvider = globalConfig.openaiApiKey ? "openai" : "openrouter"
      
      if (ragApiKey) {
        try {
          ragContext = await fetchRagContext(userRequest, ragApiKey, agentType, ragProvider)
          if (ragContext) {
            addLog({
              level: "info",
              agent: agentType,
              message: `RAG-Kontext aus Knowledge Base geladen (${ragProvider})`,
            })
          }
        } catch (error) {
          console.warn("[RAG] Kontext konnte nicht geladen werden:", error)
        }
      }

      // Tools-Kontext basierend auf aktivierten Tools
      const enabledTools = config.tools?.filter((t: { enabled: boolean }) => t.enabled) || []
      let toolsContext = ""
      
      // INTELLIGENTE CODE-ANALYSE für Coder (automatisch aktiviert)
      if (agentType === "coder" && existingFiles.length > 0) {
        const analysisContext: string[] = []
        
        // Komponenten-Analyse
        const components = analyzeComponents(existingFiles)
        if (components.length > 0) {
          analysisContext.push(`\n## 📊 KOMPONENTEN-ANALYSE (${components.length} gefunden):`)
          for (const comp of components.slice(0, 10)) {
            const typeIcon = comp.type === 'arrow' ? '→' : comp.type === 'function' ? 'ƒ' : '©'
            const features = [
              comp.hasState ? "State" : "",
              comp.hasEffects ? "Effects" : "",
              comp.props.length > 0 ? `Props: ${comp.props.join(", ")}` : ""
            ].filter(Boolean).join(", ")
            analysisContext.push(`- ${typeIcon} **${comp.name}** (${comp.file})${features ? ` [${features}]` : ""}`)
          }
        }
        
        // Dependency-Analyse
        const packageJson = existingFiles.find(f => f.path.includes("package.json"))
        if (packageJson) {
          const deps = analyzeDependencies(packageJson.content)
          if (deps.dependencies.length > 0) {
            analysisContext.push(`\n## 📦 VERFÜGBARE PACKAGES:`)
            analysisContext.push(`Dependencies: ${deps.dependencies.join(", ")}`)
            if (deps.devDependencies.length > 0) {
              analysisContext.push(`DevDeps: ${deps.devDependencies.join(", ")}`)
            }
          }
        }
        
        // Pattern-Suche für häufige Probleme
        const criticalPatterns = searchCodePatterns(existingFiles, [
          'export\\s+default.*export\\s+default', // Doppelte exports
          'createContext.*Provider', // Context Pattern
          'useState|useEffect|useCallback', // Hooks
        ])
        if (criticalPatterns.length > 0) {
          analysisContext.push(`\n## 🔍 CODE-PATTERNS GEFUNDEN:`)
          for (const p of criticalPatterns) {
            analysisContext.push(`- Pattern "${p.pattern}": ${p.matches.length} Treffer`)
          }
        }
        
        if (analysisContext.length > 0) {
          toolsContext += analysisContext.join("\n")
        }
        
        // KOMPONENTEN-BIBLIOTHEK: Empfehle passende UI-Komponenten
        const detectedAppType = detectAppType(userRequest, existingFiles)
        if (detectedAppType) {
          const recommendedComponents = getRecommendedComponents(detectedAppType)
          const componentSummary = componentLibrary
            .filter(c => recommendedComponents.includes(c.name))
            .map(c => `- **${c.name}** (${c.category}): ${c.description}`)
            .join('\n')
          
          toolsContext += `\n\n## 🎨 EMPFOHLENE UI-KOMPONENTEN für ${detectedAppType.toUpperCase()}:
${componentSummary}

**Tipp:** Du kannst diese Komponenten erstellen indem du die Standard-Patterns verwendest.
Alle Komponenten sollten Inline-Styles für WebContainer-Kompatibilität haben.`
        }
      }
      
      if (enabledTools.length > 0) {
        const toolDescriptions: string[] = []
        
        for (const tool of enabledTools) {
          const toolId = (tool as { id: string }).id
          const toolName = (tool as { name: string }).name
          
          // Tool-spezifische Kontexte
          switch (toolId) {
            case "codebase_search":
            case "code_search":
              toolDescriptions.push(`- **${toolName}**: Du kannst den bestehenden Code analysieren und Patterns finden.`)
              break
            case "file_reader":
              toolDescriptions.push(`- **${toolName}**: Du hast Zugriff auf alle Projektdateien (siehe BESTEHENDE DATEIEN).`)
              break
            case "file_writer":
              toolDescriptions.push(`- **${toolName}**: Du kannst Dateien erstellen und modifizieren. Gib Code in \`\`\`typescript // filepath: Dateiname.tsx\`\`\` Blöcken aus.`)
              break
            case "dependency_analyzer":
              // Nutze die neue analyzeDependencies Funktion
              const pkgJson = existingFiles.find(f => f.path.includes("package.json"))
              if (pkgJson) {
                const deps = analyzeDependencies(pkgJson.content)
                toolDescriptions.push(`- **${toolName}**: Dependencies: ${deps.dependencies.join(", ") || "keine"} | DevDeps: ${deps.devDependencies.join(", ") || "keine"}`)
              } else {
                toolDescriptions.push(`- **${toolName}**: Keine package.json gefunden.`)
              }
              break
            case "structure_analyzer":
              // Zeige Projektstruktur
              const filePaths = existingFiles.map(f => f.path).sort()
              if (filePaths.length > 0) {
                toolDescriptions.push(`- **${toolName}**: Projektstruktur:\n  ${filePaths.join("\n  ")}`)
              }
              break
            case "refactor_tool":
              toolDescriptions.push(`- **${toolName}**: Du kannst Code refactoren. Gib immer den vollständigen refactored Code aus.`)
              break
            case "test_generator":
              toolDescriptions.push(`- **${toolName}**: Du kannst Unit Tests generieren. Verwende Jest/Vitest Syntax.`)
              break
            case "diff_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere Änderungen zwischen altem und neuem Code.`)
              break
            case "security_scanner":
            case "vulnerability_scanner":
              toolDescriptions.push(`- **${toolName}**: Prüfe auf: XSS, SQL Injection, unsichere Dependencies, hardcodierte Secrets.`)
              break
            case "secrets_detector":
              toolDescriptions.push(`- **${toolName}**: Suche nach: API Keys, Passwörter, Tokens, private Keys im Code.`)
              break
            case "injection_checker":
              toolDescriptions.push(`- **${toolName}**: Prüfe auf: SQL Injection, XSS, Command Injection, Path Traversal.`)
              break
            case "auth_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere: Auth-Flows, Session-Management, Token-Handling, RBAC.`)
              break
            case "complexity_analyzer":
              toolDescriptions.push(`- **${toolName}**: Berechne: Cyclomatic Complexity, Nesting Depth, Function Length.`)
              break
            case "style_checker":
              toolDescriptions.push(`- **${toolName}**: Prüfe: Naming Conventions, Code Formatting, Best Practices.`)
              break
            case "test_runner":
              toolDescriptions.push(`- **${toolName}**: Führe Tests aus und berichte Ergebnisse.`)
              break
            case "build_tool":
              toolDescriptions.push(`- **${toolName}**: Erstelle Build-Artefakte (npm run build).`)
              break
            case "git_tool":
              toolDescriptions.push(`- **${toolName}**: Git-Operationen: commit, push, branch, merge.`)
              break
            case "deploy_tool":
              toolDescriptions.push(`- **${toolName}**: Deployment zu Vercel, Netlify, Render.`)
              break
            // === MARKETPLACE AGENT TOOLS ===
            case "coverage_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere Test-Coverage und identifiziere ungetestete Code-Pfade.`)
              break
            case "readme_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere README.md mit Installation, Verwendung und API-Dokumentation.`)
              break
            case "api_doc_generator":
              toolDescriptions.push(`- **${toolName}**: Erstelle OpenAPI/Swagger Spezifikationen und API-Dokumentation.`)
              break
            case "bundle_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere Bundle-Size, identifiziere große Dependencies und Tree-Shaking Möglichkeiten.`)
              break
            case "perf_profiler":
              toolDescriptions.push(`- **${toolName}**: Profile Performance: Render-Zeiten, Memory Usage, Network Requests.`)
              break
            case "wcag_checker":
              toolDescriptions.push(`- **${toolName}**: Prüfe WCAG 2.1 Konformität: Kontraste, ARIA-Labels, Keyboard Navigation.`)
              break
            case "string_extractor":
              toolDescriptions.push(`- **${toolName}**: Extrahiere hardcodierte Strings für i18n/Übersetzung.`)
              break
            case "translator":
              toolDescriptions.push(`- **${toolName}**: Übersetze Strings in verschiedene Sprachen.`)
              break
            case "schema_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere Datenbank-Schemas (Prisma, Drizzle, TypeORM).`)
              break
            case "migration_generator":
              toolDescriptions.push(`- **${toolName}**: Erstelle Datenbank-Migrationen.`)
              break
            case "openapi_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere OpenAPI 3.0 Spezifikationen für REST APIs.`)
              break
            case "code_smell_detector":
              toolDescriptions.push(`- **${toolName}**: Erkenne Code Smells: Duplicate Code, Long Methods, God Classes.`)
              break
            case "docker_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere Dockerfile, docker-compose.yml, .dockerignore.`)
              break
            case "ci_generator":
              toolDescriptions.push(`- **${toolName}**: Erstelle CI/CD Pipelines für GitHub Actions, GitLab CI, Jenkins.`)
              break
            // === SAP AGENT TOOLS ===
            case "cds_modeler":
              toolDescriptions.push(`- **${toolName}**: Modelliere CDS Entitäten, Services und Annotationen für SAP CAP.`)
              break
            case "cap_project_setup":
              toolDescriptions.push(`- **${toolName}**: Initialisiere CAP Projekte mit db/, srv/, app/ Struktur.`)
              break
            case "ui5_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere UI5 Apps: Controls, Bindings, manifest.json.`)
              break
            case "fiori_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere Fiori Elements Apps: List Report, Object Page, Worklist.`)
              break
            case "mdk_builder":
              toolDescriptions.push(`- **${toolName}**: Baue MDK Mobile Apps mit Offline-Sync und OData Integration.`)
              break
            default:
              toolDescriptions.push(`- **${toolName}**: ${(tool as { description: string }).description}`)
          }
        }
        
        if (toolDescriptions.length > 0) {
          toolsContext = `\n\n## VERFÜGBARE TOOLS:\n${toolDescriptions.join("\n")}`
        }
      }

      // Iterations-Erkennung und spezialisierte Prompts
      const isIterationMode = existingFiles.length > 0
      let iterationContext = ""
      
      if (isIterationMode && (agentType === "planner" || agentType === "coder" || agentType === "reviewer")) {
        iterationContext = getIterationPrompt(agentType as "planner" | "coder" | "reviewer")
        console.log(`[Agent Executor] Iterations-Modus für ${agentType} aktiviert (${existingFiles.length} bestehende Dateien)`)
      }

      const systemContent = config.systemPrompt + iterationContext + projectContext + filesContext + toolsContext + mcpContext + (ragContext ? `\n\n${ragContext}` : "")
      const userContent = userRequest + previousContext
      
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ]

      // CACHE-CHECK: Prüfe ob identische Anfrage bereits beantwortet wurde
      const cacheKey = getCacheKey(agentType, userRequest, filesContext)
      const cachedResponse = getFromCache(cacheKey)
      if (cachedResponse && agentType !== "coder") {
        // Cache nur für nicht-Coder Agenten nutzen (Coder sollte immer frisch generieren)
        console.log(`[Agent Executor] Cache-Hit für ${agentType}`)
        return cachedResponse
      }

      // Retry-Logik für robustere Agent-Ausführung
      let lastError: Error | null = null
      let response: { content: string } | null = null
      
      for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[Agent Executor] Retry ${attempt}/${RETRY_CONFIG.maxRetries} für ${agentType}`)
            await new Promise(r => setTimeout(r, RETRY_CONFIG.retryDelay * attempt))
          }
          
          response = await sendChatRequest({
            messages,
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          break // Erfolgreich, beende Retry-Loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          const errorMsg = lastError.message.toLowerCase()
          
          // Prüfe ob Fehler retryable ist
          const isRetryable = RETRY_CONFIG.retryableErrors.some(e => errorMsg.includes(e))
          
          if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
            throw lastError
          }
        }
      }
      
      if (!response) {
        throw lastError || new Error("Keine Antwort vom Agent")
      }

      // Parse Code-Dateien aus der Antwort (nur für Coder-Agent)
      const files = agentType === "coder" ? parseCodeFromResponse(response.content) : []
      
      // Hole deploymentTarget für Validierung (bereits oben als deployTarget definiert)
      const currentDeployTarget = (globalConfig as { deploymentTarget?: string }).deploymentTarget as DeploymentTarget || null
      
      // Validiere Agent-Ergebnis mit Deployment-Target
      const validation = validateAgentResult(agentType, response.content, files, currentDeployTarget)
      
      // Bei kritischen Fehlern: Automatische Korrektur
      if (agentType === "coder" && validation.criticalIssues.length > 0) {
        console.log(`[Agent Executor] ${validation.criticalIssues.length} kritische Fehler erkannt, starte Auto-Korrektur...`)
        
        // Extrahiere fehlende Dateien aus den kritischen Fehlern
        const missingFiles: string[] = []
        for (const issue of validation.criticalIssues) {
          const match = issue.match(/importiert\s+"([^"]+)"\s+aber.*NICHT erstellt|Erstelle:\s+(\S+\.tsx?)/)
          if (match) {
            const filePath = match[1] || match[2]
            if (filePath) {
              const normalizedPath = filePath.replace('@/components/', 'components/').replace('@/', '')
              if (!missingFiles.includes(normalizedPath)) {
                missingFiles.push(normalizedPath.endsWith('.tsx') ? normalizedPath : normalizedPath + '.tsx')
              }
            }
          }
        }
        
        // Spezifischer Korrektur-Prompt für fehlende Dateien
        const missingFilesSection = missingFiles.length > 0 ? `
## 🔴 FEHLENDE DATEIEN - DU MUSST DIESE ERSTELLEN:
${missingFiles.map(f => `
\`\`\`typescript
// filepath: ${f}
"use client";

// TODO: Implementiere diese Komponente
export function ${f.split('/').pop()?.replace('.tsx', '')}() {
  return <div>...</div>;
}
\`\`\`
`).join('\n')}

WICHTIG: Erstelle JEDE dieser Dateien mit vollständigem, funktionierendem Code!
` : ''
        
        const correctionPrompt = `
## ⚠️ DEIN CODE HAT KRITISCHE FEHLER DIE DEN BUILD BRECHEN!

${validation.criticalIssues.map(e => `❌ ${e}`).join('\n')}
${missingFilesSection}
${validation.issues.length > 0 ? `\n⚠️ Weitere Probleme:\n${validation.issues.map(e => `- ${e}`).join('\n')}` : ''}

## KORRIGIERE JETZT:
1. ERSTELLE ALLE FEHLENDEN DATEIEN (siehe oben)
2. Gib den VOLLSTÄNDIGEN korrigierten Code aus
3. JEDE Datei muss mit "use client"; beginnen
4. Imports MÜSSEN @/components/ verwenden
5. JEDE importierte Datei MUSS auch erstellt werden!

Gib ALLE Dateien (auch die neuen) vollständig aus!`

        const correctionMessages = [
          ...messages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: correctionPrompt }
        ]
        
        try {
          const correctionResponse = await sendChatRequest({
            messages: correctionMessages,
            model: config.model,
            temperature: 0.1, // Sehr niedrig für konsistente Korrektur
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          const correctedFiles = parseCodeFromResponse(correctionResponse.content)
          const correctedValidation = validateAgentResult(agentType, correctionResponse.content, correctedFiles, currentDeployTarget)
          
          // Wenn Korrektur besser ist, verwende sie
          if (correctedValidation.criticalIssues.length < validation.criticalIssues.length ||
              correctedValidation.score > validation.score) {
            console.log(`[Agent Executor] Auto-Korrektur erfolgreich: ${validation.criticalIssues.length} → ${correctedValidation.criticalIssues.length} kritische Fehler`)
            return { content: correctionResponse.content, files: correctedFiles }
          }
        } catch (correctionError) {
          console.warn(`[Agent Executor] Auto-Korrektur fehlgeschlagen:`, correctionError)
        }
      }
      
      // DESIGN-VALIDIERUNG MIT AUTO-FIX
      if (agentType === "coder" && files.length > 0) {
        const designValidation = validateDesign(files)
        
        if (!designValidation.isValid && designValidation.autoFixPrompt) {
          console.log(`[Agent Executor] Design-Probleme erkannt (Score: ${designValidation.score}), starte Auto-Fix...`)
          
          const designFixPrompt = `
## 🎨 DESIGN-QUALITÄTSPRÜFUNG FEHLGESCHLAGEN!

${designValidation.autoFixPrompt}

## ALLE VIOLATIONS:
${designValidation.violations.map(v => `- [${v.type.toUpperCase()}] ${v.problem}\n  → FIX: ${v.fix}`).join('\n')}

## ANWEISUNGEN:
1. Korrigiere ALLE oben genannten Design-Probleme
2. ENTFERNE Demo-Komponenten (Hello World, Counter, etc.) komplett
3. Stelle sicher dass ALLE Elemente Inline-Styles haben
4. Kalender MUSS grid grid-cols-7 verwenden
5. Gib den VOLLSTÄNDIGEN korrigierten Code aus

WICHTIG: Nur die angeforderten Features, KEINE Demo-Komponenten!`

          try {
            const designFixMessages = [
              ...messages,
              { role: "assistant" as const, content: response.content },
              { role: "user" as const, content: designFixPrompt }
            ]
            
            const designFixResponse = await sendChatRequest({
              messages: designFixMessages,
              model: config.model,
              temperature: 0.1,
              maxTokens: config.maxTokens,
              apiKey,
              provider,
            })
            
            const fixedFiles = parseCodeFromResponse(designFixResponse.content)
            const fixedDesignValidation = validateDesign(fixedFiles)
            
            if (fixedDesignValidation.score > designValidation.score) {
              console.log(`[Agent Executor] Design Auto-Fix erfolgreich: Score ${designValidation.score} → ${fixedDesignValidation.score}`)
              response = designFixResponse
              files.length = 0
              files.push(...fixedFiles)
            }
          } catch (designFixError) {
            console.warn(`[Agent Executor] Design Auto-Fix fehlgeschlagen:`, designFixError)
          }
        }
      }
      
      // Intelligente Fehler-Erkennung
      const detectedErrors = detectErrorsInOutput(response.content)
      if (detectedErrors.length > 0) {
        console.log(`[Agent Executor] ${detectedErrors.length} Fehler erkannt:`, 
          detectedErrors.map(e => `${e.type}: ${e.message}`))
        
        // Füge Fix-Vorschläge hinzu
        for (const error of detectedErrors) {
          error.suggestedFix = generateAutoFixSuggestion(error)
        }
      }
      
      if (!validation.isValid) {
        console.warn(`[Agent Executor] Validierung für ${agentType} fehlgeschlagen:`, validation.issues)
        // Bei Coder: Versuche nochmal mit expliziterem Prompt
        if (agentType === "coder" && validation.issues.includes("Keine Code-Dateien generiert")) {
          console.log(`[Agent Executor] Coder hat keinen Code generiert, versuche erneut...`)
          
          const retryMessages = [
            ...messages,
            { role: "assistant" as const, content: response.content },
            { role: "user" as const, content: "WICHTIG: Du musst vollständigen, lauffähigen Code als Code-Block ausgeben. Keine Erklärungen, nur den kompletten Code mit // filepath: Dateiname am Anfang." }
          ]
          
          const retryResponse = await sendChatRequest({
            messages: retryMessages,
            model: config.model,
            temperature: 0.3, // Niedrigere Temperatur für konsistentere Ausgabe
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          const retryFiles = parseCodeFromResponse(retryResponse.content)
          if (retryFiles.length > 0) {
            return { content: retryResponse.content, files: retryFiles }
          }
        }
        
        // Bei erkannten Fehlern: Automatischer Fix-Versuch
        if (detectedErrors.some(e => e.autoFixable)) {
          console.log(`[Agent Executor] Versuche automatische Fehlerkorrektur...`)
          
          const errorSummary = detectedErrors
            .map(e => `- ${e.type}: ${e.message}${e.suggestedFix ? ` (Fix: ${e.suggestedFix})` : ''}`)
            .join('\n')
          
          const fixMessages = [
            ...messages,
            { role: "assistant" as const, content: response.content },
            { role: "user" as const, content: `Die folgende Fehler wurden erkannt:\n${errorSummary}\n\nBitte korrigiere ALLE Fehler und gib den VOLLSTÄNDIGEN, korrigierten Code aus.` }
          ]
          
          const fixResponse = await sendChatRequest({
            messages: fixMessages,
            model: config.model,
            temperature: 0.2,
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          const fixedFiles = parseCodeFromResponse(fixResponse.content)
          const fixedErrors = detectErrorsInOutput(fixResponse.content)
          
          // Wenn weniger Fehler, verwende korrigierte Version
          if (fixedErrors.length < detectedErrors.length || fixedFiles.length > files.length) {
            console.log(`[Agent Executor] Fehlerkorrektur erfolgreich: ${detectedErrors.length} → ${fixedErrors.length} Fehler`)
            return { content: fixResponse.content, files: fixedFiles }
          }
        }
      }

      // POST-PROCESSING: Fehlende Dateien mit echtem Code generieren lassen
      let finalFiles = files
      if (agentType === "coder" && files.length > 0) {
        const missingFileInfos = findMissingImports(files)
        
        if (missingFileInfos.length > 0) {
          console.log(`[Agent Executor] ${missingFileInfos.length} fehlende Dateien erkannt, generiere echten Code...`)
          
          // Extrahiere Kontext aus bestehenden Dateien
          const existingContext = files.map(f => `
--- ${f.path} ---
${f.content.substring(0, 500)}${f.content.length > 500 ? '...' : ''}
`).join('\n')
          
          // Generiere echten Code für fehlende Dateien
          const generateMissingPrompt = `
## 🔴 KRITISCH: Diese Dateien werden importiert aber existieren nicht!

${missingFileInfos.map(m => `- **${m.path}** (importiert als: ${m.componentName})`).join('\n')}

## KONTEXT - So werden die Komponenten verwendet:
${existingContext}

## DEINE AUFGABE:
Erstelle NUR die fehlenden Dateien mit VOLLSTÄNDIGER, FUNKTIONALER Implementierung.
Basiere die Implementierung auf dem Kontext - schaue wie die Komponenten verwendet werden!

REGELN:
- JEDE Datei beginnt mit "use client";
- Verwende TypeScript mit korrekten Types
- Implementiere ECHTE Funktionalität, keine Platzhalter!
- Nutze Tailwind CSS für Styling

Gib NUR die fehlenden Dateien aus, im Format:
\`\`\`typescript
// filepath: components/ComponentName.tsx
"use client";
// ... vollständiger Code
\`\`\`
`
          
          try {
            const missingResponse = await sendChatRequest({
              messages: [
                { role: "system", content: config.systemPrompt },
                { role: "user", content: generateMissingPrompt }
              ],
              model: config.model,
              temperature: 0.2,
              maxTokens: config.maxTokens,
              apiKey,
              provider,
            })
            
            const generatedFiles = parseCodeFromResponse(missingResponse.content)
            if (generatedFiles.length > 0) {
              finalFiles = [...files, ...generatedFiles]
              console.log(`[Agent Executor] ${generatedFiles.length} fehlende Dateien mit echtem Code generiert`)
            } else {
              // Fallback: Skeleton wenn Generierung fehlschlägt
              console.log(`[Agent Executor] Generierung fehlgeschlagen, verwende Skeletons`)
              finalFiles = autoGenerateMissingFiles(files)
            }
          } catch (genError) {
            console.warn(`[Agent Executor] Fehler bei Generierung fehlender Dateien:`, genError)
            // Fallback: Skeleton
            finalFiles = autoGenerateMissingFiles(files)
          }
        }
      }

      // IMMER: Tailwind-Konfiguration und fehlende Dateien hinzufügen
      finalFiles = autoGenerateMissingFiles(finalFiles)
      console.log(`[Agent Executor] Nach autoGenerateMissingFiles: ${finalFiles.length} Dateien`)

      // CACHE-SET: Speichere erfolgreiche Antwort im Cache
      const result = { content: response.content, files: finalFiles }
      setCache(cacheKey, result.content, result.files)
      
      return result
    },
    [agentConfigs, globalConfig, currentProject, getFiles, customAgentConfigs]
  )

  const executeWorkflow = useCallback(
    async (userRequest: string, isIteration: boolean = false) => {
      setIsProcessing(true)
      setError(null)
      
      // Bei Iterationen: Behalte bestehende Dateien, nur Logs löschen
      // Bei neuem Projekt: Alles löschen
      if (!isIteration) {
        clearFiles()
      }
      clearLogs()

      const existingFilesCount = getFiles().length
      const iterationHint = existingFilesCount > 0 
        ? ` (Iteration - ${existingFilesCount} bestehende Dateien werden berücksichtigt)`
        : ""

      addLog({
        level: "info",
        agent: "system",
        message: `Workflow gestartet${iterationHint}`,
      })

      // Initialisiere Workflow-Steps basierend auf workflowOrder aus dem Store
      // Inkludiere sowohl Core-Agenten (aus agentConfigs) als auch Marketplace-Agenten
      addLog({
        level: "debug",
        agent: "system",
        message: `Workflow Order: ${workflowOrder.join(", ")}`,
      })
      
      const enabledAgents = (workflowOrder as AgentType[])
        .filter((type) => {
          // Core-Agenten: prüfe ob enabled
          if (agentConfigs[type]) {
            const enabled = agentConfigs[type].enabled
            addLog({
              level: "debug",
              agent: "system",
              message: `Agent ${type}: Core, enabled=${enabled}`,
            })
            return enabled
          }
          // Marketplace-Agenten: prüfe customAgentConfigs oder default enabled
          const customConfig = customAgentConfigs[type]
          if (customConfig !== undefined) {
            addLog({
              level: "debug",
              agent: "system",
              message: `Agent ${type}: Custom, enabled=${customConfig.enabled}`,
            })
            return customConfig.enabled
          }
          // Default: enabled wenn im Marketplace vorhanden
          const inMarketplace = marketplaceAgents.some(a => a.id === type)
          addLog({
            level: "debug",
            agent: "system",
            message: `Agent ${type}: Marketplace, found=${inMarketplace}`,
          })
          return inMarketplace
        })
      
      addLog({
        level: "info",
        agent: "system",
        message: `Aktivierte Agenten: ${enabledAgents.join(", ")}`,
      })

      const initialSteps: WorkflowStep[] = enabledAgents.map((agent) => {
        // Hole Agent-Info aus agentConfigs oder Marketplace
        const coreConfig = agentConfigs[agent]
        const marketplaceAgent = marketplaceAgents.find(a => a.id === agent)
        const name = coreConfig?.name || marketplaceAgent?.name || agent
        
        return {
          id: `step-${agent}`,
          agent,
          status: "idle" as const,
          title: name,
          description: `Warte auf Ausführung...`,
        }
      })

      setWorkflowSteps(initialSteps)

      // Füge User-Nachricht hinzu
      addMessage({
        role: "user",
        content: userRequest,
      })

      let previousOutput: string | undefined

      try {
        for (const agentType of enabledAgents) {
          setCurrentAgent(agentType)
          
          // Hole Agent-Name aus agentConfigs oder Marketplace
          const agentName = agentConfigs[agentType]?.name || 
            marketplaceAgents.find(a => a.id === agentType)?.name || 
            agentType

          addLog({
            level: "info",
            agent: agentType,
            message: `${agentName} gestartet`,
          })

          // Update Step Status
          updateWorkflowStep(`step-${agentType}`, {
            status: "running",
            description: "Agent arbeitet...",
            startTime: new Date(),
          })

          try {
            const startTime = Date.now()
            let result = await executeAgent(agentType, userRequest, previousOutput)
            const duration = ((Date.now() - startTime) / 1000).toFixed(1)

            addLog({
              level: "debug",
              agent: agentType,
              message: `API-Antwort erhalten (${duration}s)`,
            })

            // NEUE INTELLIGENTE VALIDIERUNG mit Auto-Retry
            if (agentType === "coder") {
              // Hole deploymentTarget aus globalConfig (gleiche Methode wie in executeAgent)
              const deploymentTarget = (globalConfig as { deploymentTarget?: string }).deploymentTarget as DeploymentTarget || null
              const validation = validateAgentResult(agentType, result.content, result.files, deploymentTarget)
              
              addLog({
                level: "debug",
                agent: agentType,
                message: `Validierung: Score ${validation.score}/100, ${validation.criticalIssues.length} kritische Fehler`,
              })
              
              // Auto-Retry bei kritischen Fehlern
              if (validation.criticalIssues.length > 0 && RETRY_CONFIG.maxRetries > 0) {
                addLog({
                  level: "warn",
                  agent: agentType,
                  message: `⚠️ Kritische Fehler erkannt: ${validation.criticalIssues.join(", ")}`,
                })
                
                // Extrahiere fehlende Dateien aus den kritischen Fehlern
                const missingFilesFromValidation: string[] = []
                for (const issue of validation.criticalIssues) {
                  const match = issue.match(/importiert\s+"([^"]+)"\s+aber.*NICHT erstellt|Erstelle:\s+(\S+\.tsx?)/)
                  if (match) {
                    const filePath = match[1] || match[2]
                    if (filePath) {
                      const normalizedPath = filePath.replace('@/components/', 'components/').replace('@/', '')
                      if (!missingFilesFromValidation.includes(normalizedPath)) {
                        missingFilesFromValidation.push(normalizedPath.endsWith('.tsx') ? normalizedPath : normalizedPath + '.tsx')
                      }
                    }
                  }
                }
                
                // Spezifischer Abschnitt für fehlende Dateien
                const missingFilesInstruction = missingFilesFromValidation.length > 0 ? `

## 🔴 DIESE DATEIEN FEHLEN - ERSTELLE SIE JETZT:
${missingFilesFromValidation.map(f => `- ${f} (mit "use client"; und export function ${f.split('/').pop()?.replace('.tsx', '')})`).join('\n')}

` : ''
                
                // Erstelle Korrektur-Prompt
                const correctionPrompt = `
⚠️ DEIN VORHERIGER CODE HAT KRITISCHE FEHLER!

FEHLER DIE DU BEHEBEN MUSST:
${validation.criticalIssues.map(e => `❌ ${e}`).join("\n")}
${missingFilesInstruction}
${validation.issues.length > 0 ? `\nWeitere Probleme:\n${validation.issues.map(e => `⚠️ ${e}`).join("\n")}` : ""}

KORRIGIERE DIESE FEHLER und generiere den Code NOCHMAL:
- ERSTELLE ALLE FEHLENDEN DATEIEN (wichtig!)
- JEDE Komponente in EIGENE Datei unter components/
- NUR EINE "export default" pro Datei (nur in app/page.tsx)
- Context/Provider in components/XContext.tsx
- "use client" bei ALLEN Client-Komponenten
- Für JEDEN import MUSS die Datei existieren!

ORIGINAL-ANFRAGE: ${userRequest}
`
                addLog({
                  level: "info",
                  agent: agentType,
                  message: `🔄 Auto-Korrektur gestartet...`,
                })
                
                // Retry mit Korrektur-Prompt
                const retryResult = await executeAgent(agentType, correctionPrompt, result.content)
                
                // Validiere Retry-Ergebnis
                const retryValidation = validateAgentResult(agentType, retryResult.content, retryResult.files, deploymentTarget)
                
                if (retryValidation.score > validation.score) {
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `✅ Auto-Korrektur erfolgreich! Score: ${validation.score} → ${retryValidation.score}`,
                  })
                  result = retryResult
                } else {
                  addLog({
                    level: "warn",
                    agent: agentType,
                    message: `Auto-Korrektur nicht besser, verwende Original`,
                  })
                }
              } else if (validation.issues.length > 0) {
                addLog({
                  level: "info",
                  agent: agentType,
                  message: `ℹ️ Hinweise: ${validation.issues.slice(0, 3).join(", ")}`,
                })
              }
            }

            // Füge generierte Dateien hinzu oder aktualisiere bestehende
            if (result.files.length > 0) {
              const existingFiles = getFiles()
              for (const file of result.files) {
                // Prüfe ob Datei bereits existiert
                const existingFile = existingFiles.find(f => 
                  f.path === file.path || 
                  f.path.endsWith(file.path) || 
                  file.path.endsWith(f.path.split('/').pop() || '')
                )
                
                if (existingFile) {
                  // Aktualisiere bestehende Datei
                  updateFileByPath(existingFile.path, file.content)
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `Datei aktualisiert: ${existingFile.path}`,
                  })
                } else {
                  // Erstelle neue Datei
                  addFile({
                    path: file.path,
                    content: file.content,
                    language: file.language,
                    status: "created",
                  })
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `Datei erstellt: ${file.path}`,
                  })
                }
              }
            }

            // Parse und füge Vorschläge hinzu (für Reviewer/Security Agents)
            let suggestionsCount = 0
            if (agentType === "reviewer" || agentType === "security") {
              const existingFiles = getFiles()
              addLog({
                level: "debug",
                agent: agentType,
                message: `Parsing Vorschläge aus ${result.content.length} Zeichen...`,
              })
              
              const suggestions = parseSuggestionsFromResponse(result.content, agentType, existingFiles)
              suggestionsCount = suggestions.length
              
              addLog({
                level: "info",
                agent: agentType,
                message: `${suggestions.length} Vorschläge gefunden`,
              })
              
              if (suggestions.length > 0) {
                for (const suggestion of suggestions) {
                  addSuggestion(suggestion)
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `Vorschlag hinzugefügt: ${suggestion.title}`,
                  })
                }
              } else {
                // Fallback: Erstelle einen generischen Vorschlag wenn der Agent Verbesserungen erwähnt
                const hasImprovements = result.content.toLowerCase().includes("verbesser") || 
                                       result.content.toLowerCase().includes("empfehl") ||
                                       result.content.toLowerCase().includes("sollte") ||
                                       result.content.toLowerCase().includes("könnte") ||
                                       result.content.toLowerCase().includes("optimier") ||
                                       result.content.toLowerCase().includes("problem") ||
                                       result.content.toLowerCase().includes("fehler") ||
                                       result.content.toLowerCase().includes("issue")
                if (hasImprovements) {
                  // Extrahiere die ersten 3 Punkte aus der Antwort als Vorschläge
                  const lines = result.content.split('\n').filter(l => l.trim().length > 20)
                  const bulletPoints = lines.filter(l => 
                    l.trim().startsWith('-') || 
                    l.trim().startsWith('•') || 
                    l.trim().startsWith('*') ||
                    /^\d+\./.test(l.trim())
                  ).slice(0, 5)
                  
                  if (bulletPoints.length > 0) {
                    for (const point of bulletPoints) {
                      const cleanPoint = point.replace(/^[-•*\d.]+\s*/, '').trim()
                      if (cleanPoint.length > 15) {
                        addSuggestion({
                          agent: agentType,
                          type: "improvement",
                          title: cleanPoint.substring(0, 80) + (cleanPoint.length > 80 ? '...' : ''),
                          description: cleanPoint,
                          affectedFiles: [],
                          suggestedChanges: [],
                          priority: "medium",
                        })
                        addLog({
                          level: "info",
                          agent: agentType,
                          message: `Generischer Vorschlag hinzugefügt: ${cleanPoint.substring(0, 50)}...`,
                        })
                      }
                    }
                  } else {
                    // Erstelle einen einzelnen generischen Vorschlag
                    addSuggestion({
                      agent: agentType,
                      type: "improvement",
                      title: `${agentType === 'reviewer' ? 'Code-Review' : 'Sicherheits'}-Empfehlungen verfügbar`,
                      description: `Der ${agentType === 'reviewer' ? 'Reviewer' : 'Security'}-Agent hat Verbesserungsvorschläge erstellt. Klicke auf "Vollständiges Ergebnis anzeigen" im Workflow-Tab für Details.`,
                      affectedFiles: [],
                      suggestedChanges: [],
                      priority: "medium",
                    })
                    addLog({
                      level: "info",
                      agent: agentType,
                      message: `Generischer Vorschlag hinzugefügt (keine strukturierten Daten gefunden)`,
                    })
                  }
                }
              }
            }

            // Füge Agent-Nachricht hinzu (menschenlesbare Zusammenfassung)
            const humanSummary = createHumanReadableSummary(agentType, result.content, result.files, duration, globalConfig.targetEnvironment)
            addMessage({
              role: "assistant",
              content: humanSummary,
              agent: agentType,
            })

            // Update Step Status
            updateWorkflowStep(`step-${agentType}`, {
              status: "completed",
              description: "Erfolgreich abgeschlossen",
              output: result.content,
              endTime: new Date(),
            })

            addLog({
              level: "info",
              agent: agentType,
              message: `${agentName} abgeschlossen`,
            })

            previousOutput = result.content
          } catch (error) {
            // VERBESSERTE FEHLERBEHANDLUNG mit spezifischen Meldungen
            const specificError = getSpecificErrorMessage(error)
            const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler"
            
            addLog({
              level: "error",
              agent: agentType,
              message: `❌ ${specificError.message}: ${errorMessage}`,
            })
            
            addLog({
              level: "info",
              agent: agentType,
              message: `💡 Tipp: ${specificError.suggestion}`,
            })

            updateWorkflowStep(`step-${agentType}`, {
              status: "error",
              description: `${specificError.message}: ${errorMessage}`,
              error: errorMessage,
              endTime: new Date(),
            })

            addMessage({
              role: "assistant",
              content: `❌ **${specificError.message}** beim ${agentName}\n\n${errorMessage}\n\n💡 **Tipp:** ${specificError.suggestion}`,
              agent: agentType,
            })

            // Bei wiederholbaren Fehlern nicht sofort abbrechen
            if (!specificError.recoverable) {
              setError(`${specificError.message}: ${errorMessage}`)
              break
            } else {
              addLog({
                level: "warn",
                agent: agentType,
                message: `Fehler ist möglicherweise temporär - versuche es später erneut`,
              })
              setError(`${specificError.message}: ${errorMessage}`)
              break
            }
          }
        }
      } finally {
        setCurrentAgent(null)
        setIsProcessing(false)
        
        // Speichere Zustand in der Historie für Undo/Redo
        saveToHistory()
        
        // Follow-up Vorschläge nach erfolgreicher Generierung
        const finalFiles = getFiles()
        if (finalFiles.length > 0) {
          const isFirstGeneration = !isIteration
          
          // Code-Statistik und Quality Score berechnen
          const codeStats = calculateCodeStats(finalFiles)
          const qualityScore = calculateCodeQualityScore(finalFiles)
          
          // Generiere automatisch README.md bei erster Generierung
          if (isFirstGeneration && !finalFiles.some(f => f.path.toLowerCase() === 'readme.md')) {
            const appName = currentProject?.name || 'AgentForge App'
            const fileList = finalFiles.map(f => `- \`${f.path}\``).join('\n')
            const readmeContent = `# ${appName}

> Generiert mit AgentForge - AI-Powered App Builder

## 🚀 Features

Diese App wurde mit AgentForge erstellt und enthält:
- Moderne React/Next.js Architektur
- Tailwind CSS für responsives Design
- TypeScript für Typsicherheit

## 📁 Projektstruktur

${fileList}

## 🛠️ Installation

\`\`\`bash
npm install
npm run dev
\`\`\`

## 📝 Entwicklung

Die App kann mit AgentForge weiter entwickelt werden:
- **Feature hinzufügen**: "Füge eine Suchfunktion hinzu"
- **Design ändern**: "Mache das Design moderner"
- **Bug fixen**: Beschreibe den Fehler im Chat

---
*Erstellt mit [AgentForge](https://agentforge.dev)*
`
            addFile({
              path: 'README.md',
              content: readmeContent,
              language: 'markdown',
              status: 'created'
            })
          }
          
          // Stats für Nachricht formatieren
          const techStack = [
            codeStats.hasTypeScript ? 'TypeScript' : null,
            codeStats.hasTailwind ? 'Tailwind' : null,
            codeStats.hasRouter ? 'Next.js Router' : null,
          ].filter(Boolean).join(', ')
          
          const statsLine = `📊 **${codeStats.totalFiles} Dateien** | ${codeStats.totalLines} Zeilen | ${codeStats.components} Komponenten${codeStats.hooks > 0 ? ` | ${codeStats.hooks} Hooks` : ''}`
          
          // Quality Score Badge
          const scoreEmoji = qualityScore.score >= 90 ? '🏆' : qualityScore.score >= 70 ? '✅' : qualityScore.score >= 50 ? '⚠️' : '❌'
          const qualityLine = `\n${scoreEmoji} **Code Quality:** ${qualityScore.score}/100`
          
          // Contextual Hints generieren
          const hints = generateContextualHints(finalFiles)
          const hintsText = hints.length > 0 
            ? `\n\n💡 **Verbesserungsvorschläge:**\n${hints.map(h => `- ${h.type === 'warning' ? '⚠️' : h.type === 'improvement' ? '🔧' : '💡'} ${h.message}${h.action ? ` → "${h.action}"` : ''}`).join('\n')}`
            : ''
          
          // Intelligente Follow-Up Fragen basierend auf Code-Analyse
          const followUpQuestions = generateFollowUpQuestions(finalFiles, isFirstGeneration)
          const followUpText = followUpQuestions.length > 0 
            ? `\n\n**💬 Möchtest du vielleicht:**\n${followUpQuestions.map(q => `- ${q}`).join('\n')}`
            : ''
          
          const followUpMessage = isFirstGeneration
            ? `✨ **App erfolgreich erstellt!**\n\n${statsLine}${qualityLine}${techStack ? `\n🛠️ **Tech:** ${techStack}` : ''}${hintsText}${followUpText}\n\n**Nächste Schritte:**\n- 🐛 **Bug fixen** - Beschreibe einen Fehler im Chat\n- ➕ **Feature hinzufügen** - "Füge eine Suchfunktion hinzu"\n- 🎨 **Design verbessern** - "Mache das Design moderner"\n- 🚀 **Deployen** - Klicke auf "Deploy" für Live-Deployment`
            : `✅ **Änderungen angewendet!**\n\n${statsLine}${qualityLine}${hintsText}${followUpText}\n\nDu kannst weitere Anpassungen vornehmen oder die Quick Actions nutzen.`
          
          addMessage({
            role: "assistant",
            content: followUpMessage,
            agent: "system",
          })
        }
        
        addLog({
          level: "info",
          agent: "system",
          message: "Workflow beendet",
        })
      }
    },
    [
      agentConfigs,
      addMessage,
      addFile,
      addLog,
      setWorkflowSteps,
      updateWorkflowStep,
      setIsProcessing,
      setCurrentAgent,
      setError,
      executeAgent,
      clearFiles,
      clearLogs,
      workflowOrder,
      customAgentConfigs,
      saveToHistory,
    ]
  )

  // Funktion zum Korrigieren von Fehlern
  const fixErrors = useCallback(
    async (errorMessage: string, maxAttempts: number = 3) => {
      setIsProcessing(true)
      
      addLog({
        level: "info",
        agent: "system",
        message: `Starte automatische Fehlerkorrektur (max. ${maxAttempts} Versuche)`,
      })
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // WICHTIG: Hole aktuelle Dateien bei JEDEM Versuch (nicht nur einmal am Anfang)
        const currentFiles = getFiles()
        
        addLog({
          level: "info",
          agent: "coder",
          message: `Korrekturversuch ${attempt}/${maxAttempts}`,
        })

        addMessage({
          role: "assistant",
          content: `🔧 **Automatische Fehlerkorrektur** (Versuch ${attempt}/${maxAttempts})\n\nFehler: ${errorMessage}`,
          agent: "system",
        })

        // Erstelle Kontext mit aktuellem Code und Fehler
        const filesContext = currentFiles.map(f => 
          `**${f.path}:**\n\`\`\`${f.language}\n${f.content}\n\`\`\``
        ).join("\n\n")

        // Verschiedene Recovery-Strategien je nach Versuch
        const recoveryStrategies = [
          'Analysiere den Fehler genau und behebe die direkte Ursache.',
          'Prüfe alle Imports und Dependencies. Erstelle fehlende Dateien!',
          'Vereinfache den Code: Entferne komplexe Features und behebe zuerst den Grundfehler.',
        ]
        
        const attemptInfo = attempt > 1 
          ? `\n\n## 🔴 VERSUCH ${attempt}/${maxAttempts} - NEUE STRATEGIE:\n**Strategie:** ${recoveryStrategies[attempt - 1] || recoveryStrategies[2]}\n\nDie vorherigen Versuche haben NICHT funktioniert. Du MUSST:\n- Einen KOMPLETT ANDEREN Ansatz wählen\n- Den Fehler von GRUND auf neu analysieren\n- ALLE betroffenen Dateien prüfen und korrigieren`
          : ""

        // Intelligente Fehleranalyse für besseren Kontext
        const errorType = analyzeErrorType(errorMessage)
        const errorHint = getErrorHint(errorType)
        
        // Zusätzliche Hilfe bei bestimmten Fehlertypen
        const additionalHelp = errorType === 'import' 
          ? '\n\n⚠️ IMPORT-FEHLER: Erstelle die fehlende Datei ODER korrigiere den Import-Pfad!'
          : errorType === 'undefined'
          ? '\n\n⚠️ UNDEFINED-FEHLER: Prüfe ob Variable/Funktion importiert oder deklariert ist!'
          : ''
        
        const fixPrompt = `## 🔴 KRITISCH: NUR CODE AUSGEBEN - KEINE ERKLÄRUNGEN!

Du MUSST den Fehler DIREKT beheben. VERBOTEN sind:
❌ Erklärungen was der Fehler ist
❌ Hinweise was der User tun sollte
❌ Text außerhalb von Code-Blöcken

Du MUSST NUR ausgeben:
✅ Die korrigierten Dateien mit vollständigem Code
✅ Format: \`\`\`typescript\\n// filepath: pfad/datei.tsx\\n[CODE]\`\`\`
${attemptInfo}

## FEHLERTYP: ${errorType}
${errorHint}

## FEHLERMELDUNG:
\`\`\`
${errorMessage}
\`\`\`

## AKTUELLER CODE:
${filesContext}

## AUSGABE (NUR CODE!):
Gib SOFORT die korrigierten Dateien aus - OHNE jeglichen Text davor oder danach:`

        try {
          const coderConfig = agentConfigs.coder
          const provider = getProviderFromModel(coderConfig.model)
          const apiKey = provider === "openai" 
            ? globalConfig.openaiApiKey 
            : provider === "openrouter"
              ? globalConfig.openrouterApiKey
              : globalConfig.anthropicApiKey

          const response = await sendChatRequest({
            provider,
            model: coderConfig.model,
            messages: [
              { role: "system", content: coderConfig.systemPrompt },
              { role: "user", content: fixPrompt }
            ],
            temperature: coderConfig.temperature,
            maxTokens: coderConfig.maxTokens,
            apiKey,
          })

          // Parse korrigierte Dateien
          const fixedFiles = parseCodeFromResponse(response.content)
          
          addLog({
            level: "debug",
            agent: "coder",
            message: `Geparste Dateien: ${fixedFiles.length} (${fixedFiles.map(f => f.path).join(", ") || "keine"})`,
          })

          if (fixedFiles.length > 0) {
            // Aktualisiere die Dateien (erstellt oder überschreibt)
            for (const file of fixedFiles) {
              updateFileByPath(file.path, file.content, file.language)
              const existingFile = currentFiles.find(f => f.path === file.path)
              addLog({
                level: "info",
                agent: "coder",
                message: existingFile ? `Datei aktualisiert: ${file.path}` : `Neue Datei erstellt: ${file.path}`,
              })
            }

            addMessage({
              role: "assistant",
              content: `✅ **Korrektur angewendet** (Versuch ${attempt})\n\n**${fixedFiles.length} Dateien korrigiert:**\n${fixedFiles.map(f => `- \`${f.path}\``).join("\n")}\n\n*Code wurde aktualisiert - siehe Editor/Preview*`,
              agent: "coder",
            })

            addLog({
              level: "info",
              agent: "system",
              message: `Korrektur erfolgreich nach ${attempt} Versuch(en)`,
            })

            setIsProcessing(false)
            return { success: true, attempts: attempt }
          } else {
            // Keine Dateien geparst - zeige trotzdem die Antwort
            addMessage({
              role: "assistant",
              content: `⚠️ **Korrekturvorschlag** (Versuch ${attempt})\n\nKeine Dateien automatisch erkannt. Bitte prüfe die Antwort:\n\n${response.content}`,
              agent: "coder",
            })
            
            addLog({
              level: "warn",
              agent: "coder",
              message: `Keine Dateien aus Antwort geparst - Versuch ${attempt}`,
            })
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler"
          addLog({
            level: "error",
            agent: "coder",
            message: `Korrekturversuch ${attempt} fehlgeschlagen: ${errMsg}`,
          })
        }
      }

      addMessage({
        role: "assistant",
        content: `❌ **Automatische Korrektur fehlgeschlagen** nach ${maxAttempts} Versuchen.\n\nBitte beschreibe den Fehler genauer oder korrigiere ihn manuell.`,
        agent: "system",
      })

      addLog({
        level: "error",
        agent: "system",
        message: `Automatische Korrektur fehlgeschlagen nach ${maxAttempts} Versuchen`,
      })

      setIsProcessing(false)
      return { success: false, attempts: maxAttempts }
    },
    [agentConfigs, globalConfig, getFiles, addMessage, addLog, setIsProcessing, updateFileByPath]
  )

  // Einzelnen Agent ausführen (für Workflow-Engine)
  const executeSingleAgent = useCallback(
    async (
      agentId: string,
      userRequest: string,
      previousOutput?: string
    ): Promise<string> => {
      const agentType = agentId as AgentType
      
      try {
        const result = await executeAgent(agentType, userRequest, previousOutput)
        
        // Füge generierte Dateien hinzu
        if (result.files.length > 0) {
          for (const file of result.files) {
            addFile({
              path: file.path,
              content: file.content,
              language: file.language,
              status: "created",
            })
          }
        }
        
        // Parse und füge Vorschläge hinzu (für Reviewer/Security Agents)
        if (agentType === "reviewer" || agentType === "security") {
          const existingFiles = getFiles()
          const suggestions = parseSuggestionsFromResponse(result.content, agentType, existingFiles)
          
          if (suggestions.length > 0) {
            for (const suggestion of suggestions) {
              addSuggestion(suggestion)
              addLog({
                level: "info",
                agent: agentType,
                message: `Vorschlag hinzugefügt: ${suggestion.title}`,
              })
            }
          } else {
            // Fallback: Erstelle generische Vorschläge aus der Antwort
            const hasImprovements = result.content.toLowerCase().includes("verbesser") || 
                                   result.content.toLowerCase().includes("empfehl") ||
                                   result.content.toLowerCase().includes("sollte") ||
                                   result.content.toLowerCase().includes("könnte") ||
                                   result.content.toLowerCase().includes("problem") ||
                                   result.content.toLowerCase().includes("fehler")
            
            if (hasImprovements) {
              const lines = result.content.split('\n').filter(l => l.trim().length > 20)
              const bulletPoints = lines.filter(l => 
                l.trim().startsWith('-') || 
                l.trim().startsWith('•') || 
                l.trim().startsWith('*') ||
                /^\d+\./.test(l.trim())
              ).slice(0, 5)
              
              if (bulletPoints.length > 0) {
                for (const point of bulletPoints) {
                  const cleanPoint = point.replace(/^[-•*\d.]+\s*/, '').trim()
                  if (cleanPoint.length > 15) {
                    addSuggestion({
                      agent: agentType,
                      type: "improvement",
                      title: cleanPoint.substring(0, 80) + (cleanPoint.length > 80 ? '...' : ''),
                      description: cleanPoint,
                      affectedFiles: [],
                      suggestedChanges: [],
                      priority: "medium",
                    })
                  }
                }
              } else {
                addSuggestion({
                  agent: agentType,
                  type: "improvement",
                  title: `${agentType === 'reviewer' ? 'Code-Review' : 'Sicherheits'}-Empfehlungen`,
                  description: `Der ${agentType === 'reviewer' ? 'Reviewer' : 'Security'}-Agent hat Verbesserungsvorschläge erstellt.`,
                  affectedFiles: [],
                  suggestedChanges: [],
                  priority: "medium",
                })
              }
            }
          }
        }
        
        return result.content
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler"
        throw new Error(`Agent ${agentId} fehlgeschlagen: ${errMsg}`)
      }
    },
    [executeAgent, addFile, addSuggestion, getFiles, addLog]
  )

  // Funktion zum automatischen Umsetzen von Vorschlägen
  const applyAgentSuggestion = useCallback(
    async (suggestionId: string): Promise<{ success: boolean; message: string }> => {
      const { pendingSuggestions, approveSuggestion: markApproved, rejectSuggestion: markRejected, getFiles: getCurrentFiles } = useAgentStore.getState()
      
      const suggestion = pendingSuggestions.find(s => s.id === suggestionId)
      if (!suggestion) {
        return { success: false, message: "Vorschlag nicht gefunden" }
      }
      
      setIsProcessing(true)
      
      addLog({
        level: "info",
        agent: "system",
        message: `Setze Vorschlag um: ${suggestion.title}`,
      })
      
      try {
        // Wenn der Vorschlag bereits konkrete Änderungen hat, wende sie direkt an
        if (suggestion.suggestedChanges && suggestion.suggestedChanges.length > 0) {
          for (const change of suggestion.suggestedChanges) {
            if (change.filePath && change.newContent) {
              updateFileByPath(change.filePath, change.newContent, "typescript")
              addLog({
                level: "info",
                agent: "coder",
                message: `Datei aktualisiert: ${change.filePath}`,
              })
            }
          }
          
          markApproved(suggestionId)
          addMessage({
            role: "assistant",
            content: `✅ **Vorschlag umgesetzt:** ${suggestion.title}\n\nGeänderte Dateien:\n${suggestion.suggestedChanges.map(c => `- ${c.filePath}`).join("\n")}`,
            agent: "coder",
          })
          
          setIsProcessing(false)
          return { success: true, message: "Vorschlag erfolgreich umgesetzt" }
        }
        
        // Sonst: Lass den Coder-Agent den Vorschlag umsetzen
        const currentFiles = getCurrentFiles()
        const filesContext = currentFiles.map(f => 
          `**${f.path}:**\n\`\`\`${f.language}\n${f.content}\n\`\`\``
        ).join("\n\n")
        
        const implementPrompt = `## AUFGABE: Setze den folgenden Verbesserungsvorschlag um

**Vorschlag von ${suggestion.agent}:**
- Titel: ${suggestion.title}
- Beschreibung: ${suggestion.description}
- Priorität: ${suggestion.priority}
- Betroffene Dateien: ${suggestion.affectedFiles.join(", ") || "nicht spezifiziert"}

## AKTUELLER CODE:
${filesContext}

## ANWEISUNGEN:
1. Analysiere den Vorschlag und den aktuellen Code
2. Implementiere die vorgeschlagene Verbesserung
3. Gib den VOLLSTÄNDIGEN aktualisierten Code aus
4. Behalte alle anderen Funktionen bei

Setze den Vorschlag jetzt um:`

        const result = await executeAgent("coder" as AgentType, implementPrompt)
        
        if (result.files.length > 0) {
          for (const file of result.files) {
            updateFileByPath(file.path, file.content, file.language)
            addLog({
              level: "info",
              agent: "coder",
              message: `Datei aktualisiert: ${file.path}`,
            })
          }
          
          markApproved(suggestionId)
          addMessage({
            role: "assistant",
            content: `✅ **Vorschlag umgesetzt:** ${suggestion.title}\n\nGeänderte Dateien:\n${result.files.map(f => `- ${f.path}`).join("\n")}`,
            agent: "coder",
          })
          
          setIsProcessing(false)
          return { success: true, message: "Vorschlag erfolgreich umgesetzt" }
        } else {
          setIsProcessing(false)
          return { success: false, message: "Keine Änderungen generiert" }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler"
        markRejected(suggestionId)
        addLog({
          level: "error",
          agent: "system",
          message: `Fehler beim Umsetzen des Vorschlags: ${errMsg}`,
        })
        setIsProcessing(false)
        return { success: false, message: errMsg }
      }
    },
    [executeAgent, updateFileByPath, addMessage, addLog, setIsProcessing]
  )

  // Funktion zur Code-Validierung vor Ausführung
  const validateCode = useCallback(
    async (): Promise<{ isValid: boolean; issues: string[] }> => {
      const currentFiles = getFiles()
      const issues: string[] = []
      
      if (currentFiles.length === 0) {
        return { isValid: false, issues: ["Keine Dateien zum Validieren vorhanden"] }
      }
      
      addLog({
        level: "info",
        agent: "system",
        message: "Starte Code-Validierung...",
      })
      
      for (const file of currentFiles) {
        // Basis-Validierungen
        if (!file.content || file.content.trim().length === 0) {
          issues.push(`${file.path}: Datei ist leer`)
          continue
        }
        
        // React/TypeScript spezifische Prüfungen
        if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx") || file.path.endsWith(".ts") || file.path.endsWith(".js")) {
          // Prüfe auf häufige Syntaxfehler
          const openBraces = (file.content.match(/{/g) || []).length
          const closeBraces = (file.content.match(/}/g) || []).length
          if (openBraces !== closeBraces) {
            issues.push(`${file.path}: Ungleiche Anzahl von { } (${openBraces} vs ${closeBraces})`)
          }
          
          const openParens = (file.content.match(/\(/g) || []).length
          const closeParens = (file.content.match(/\)/g) || []).length
          if (openParens !== closeParens) {
            issues.push(`${file.path}: Ungleiche Anzahl von ( ) (${openParens} vs ${closeParens})`)
          }
          
          // Prüfe auf fehlende React-Imports
          if ((file.content.includes("useState") || file.content.includes("useEffect")) && 
              !file.content.includes("import") && !file.content.includes("React")) {
            issues.push(`${file.path}: React Hooks verwendet aber kein Import gefunden`)
          }
          
          // Prüfe auf unvollständigen Code
          if (file.content.includes("// TODO") || file.content.includes("// ...") || file.content.includes("/* ... */")) {
            issues.push(`${file.path}: Enthält unvollständigen Code (TODO oder ...)`)
          }
          
          // Prüfe auf export default in App-Komponente
          if (file.path.includes("App") && !file.content.includes("export default")) {
            issues.push(`${file.path}: App-Komponente hat keinen 'export default'`)
          }
        }
        
        // JSON Validierung
        if (file.path.endsWith(".json")) {
          try {
            JSON.parse(file.content)
          } catch {
            issues.push(`${file.path}: Ungültiges JSON`)
          }
        }
      }
      
      const isValid = issues.length === 0
      
      addLog({
        level: isValid ? "info" : "warn",
        agent: "system",
        message: isValid ? "Code-Validierung erfolgreich" : `${issues.length} Probleme gefunden`,
      })
      
      return { isValid, issues }
    },
    [getFiles, addLog]
  )

  // Funktion zum Ausführen eines spezifischen Marketplace-Agents
  const executeMarketplaceAgent = useCallback(
    async (agentId: string, userRequest: string): Promise<{ content: string; files: ParsedCodeFile[] }> => {
      const marketplaceAgent = marketplaceAgents.find(a => a.id === agentId)
      if (!marketplaceAgent) {
        throw new Error(`Marketplace Agent "${agentId}" nicht gefunden`)
      }
      
      addLog({
        level: "info",
        agent: agentId as AgentType,
        message: `${marketplaceAgent.name} gestartet`,
      })
      
      addMessage({
        role: "assistant",
        content: `🤖 **${marketplaceAgent.name}** wird ausgeführt...`,
        agent: agentId as AgentType,
      })
      
      const startTime = Date.now()
      const result = await executeAgent(agentId as AgentType, userRequest)
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      
      // Generiere Zusammenfassung
      const summary = createHumanReadableSummary(agentId as AgentType, result.content, result.files, duration, globalConfig.targetEnvironment)
      
      addMessage({
        role: "assistant",
        content: summary,
        agent: agentId as AgentType,
      })
      
      // Füge Dateien hinzu
      if (result.files.length > 0) {
        for (const file of result.files) {
          addFile({
            path: file.path,
            content: file.content,
            language: file.language,
            status: "created",
          })
        }
      }
      
      addLog({
        level: "info",
        agent: agentId as AgentType,
        message: `${marketplaceAgent.name} abgeschlossen (${duration}s)`,
      })
      
      return result
    },
    [executeAgent, addMessage, addLog, addFile]
  )

  return { 
    executeWorkflow, 
    fixErrors, 
    executeSingleAgent, 
    applyAgentSuggestion, 
    validateCode,
    executeMarketplaceAgent,
  }
}
