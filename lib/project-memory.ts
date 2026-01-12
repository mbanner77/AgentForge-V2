// ============================================
// PROJECT CONTEXT MEMORY
// Speichert Architektur-Entscheidungen und Kontext
// ============================================

export interface ProjectDecision {
  id: string
  type: 'architecture' | 'styling' | 'feature' | 'dependency' | 'pattern'
  title: string
  description: string
  reason: string
  timestamp: Date
  relatedFiles: string[]
}

export interface ProjectContext {
  projectName: string
  description: string
  techStack: string[]
  decisions: ProjectDecision[]
  codePatterns: {
    name: string
    example: string
    usedIn: string[]
  }[]
  styleGuide: {
    colorScheme: string
    componentStyle: string
    spacing: string
  }
  lastUpdated: Date
}

// In-Memory Store für Projekt-Kontext
const projectContextStore: Map<string, ProjectContext> = new Map()

// Erstelle oder hole Projekt-Kontext
export function getProjectContext(projectId: string): ProjectContext | null {
  return projectContextStore.get(projectId) || null
}

// Erstelle neuen Projekt-Kontext
export function createProjectContext(
  projectId: string,
  name: string,
  description: string
): ProjectContext {
  const context: ProjectContext = {
    projectName: name,
    description,
    techStack: ['React', 'TypeScript', 'Tailwind CSS'],
    decisions: [],
    codePatterns: [],
    styleGuide: {
      colorScheme: 'dark',
      componentStyle: 'modern',
      spacing: 'comfortable'
    },
    lastUpdated: new Date()
  }
  projectContextStore.set(projectId, context)
  return context
}

// Füge Entscheidung hinzu
export function addProjectDecision(
  projectId: string,
  decision: Omit<ProjectDecision, 'id' | 'timestamp'>
): ProjectDecision | null {
  const context = projectContextStore.get(projectId)
  if (!context) return null
  
  const newDecision: ProjectDecision = {
    ...decision,
    id: `decision-${Date.now()}`,
    timestamp: new Date()
  }
  
  context.decisions.push(newDecision)
  context.lastUpdated = new Date()
  
  return newDecision
}

// Erkenne Tech-Stack aus Code
export function detectTechStack(files: { path: string; content: string }[]): string[] {
  const techStack: Set<string> = new Set(['React', 'TypeScript'])
  
  const allContent = files.map(f => f.content).join('\n')
  
  // Frameworks
  if (allContent.includes('next/') || files.some(f => f.path.includes('app/'))) {
    techStack.add('Next.js')
  }
  
  // Styling
  if (allContent.includes('tailwind') || allContent.includes('className=')) {
    techStack.add('Tailwind CSS')
  }
  if (allContent.includes('styled-components') || allContent.includes('styled.')) {
    techStack.add('Styled Components')
  }
  
  // State Management
  if (allContent.includes('zustand')) techStack.add('Zustand')
  if (allContent.includes('redux')) techStack.add('Redux')
  if (allContent.includes('jotai')) techStack.add('Jotai')
  if (allContent.includes('recoil')) techStack.add('Recoil')
  
  // Libraries
  if (allContent.includes('recharts') || allContent.includes('LineChart')) techStack.add('Recharts')
  if (allContent.includes('framer-motion') || allContent.includes('motion.')) techStack.add('Framer Motion')
  if (allContent.includes('react-hook-form')) techStack.add('React Hook Form')
  if (allContent.includes('zod')) techStack.add('Zod')
  if (allContent.includes('tanstack') || allContent.includes('useQuery')) techStack.add('TanStack Query')
  
  return Array.from(techStack)
}

// Erkenne Code-Patterns aus bestehendem Code
export function detectCodePatterns(files: { path: string; content: string }[]): ProjectContext['codePatterns'] {
  const patterns: ProjectContext['codePatterns'] = []
  
  for (const file of files) {
    // Context Pattern
    if (file.content.includes('createContext') && file.content.includes('Provider')) {
      patterns.push({
        name: 'Context Provider',
        example: 'createContext + Provider Pattern',
        usedIn: [file.path]
      })
    }
    
    // Custom Hook Pattern
    const hookMatch = file.content.match(/export\s+function\s+(use\w+)/g)
    if (hookMatch) {
      patterns.push({
        name: 'Custom Hook',
        example: hookMatch[0],
        usedIn: [file.path]
      })
    }
    
    // Component Composition
    if (file.content.includes('children') && file.content.includes('Props')) {
      patterns.push({
        name: 'Component Composition',
        example: 'children prop Pattern',
        usedIn: [file.path]
      })
    }
  }
  
  return patterns
}

// Generiere Kontext-Zusammenfassung für den Agent
export function generateContextSummary(projectId: string): string {
  const context = projectContextStore.get(projectId)
  if (!context) return ''
  
  let summary = `## 📋 PROJEKT-KONTEXT: ${context.projectName}\n\n`
  
  // Tech Stack
  if (context.techStack.length > 0) {
    summary += `**Tech Stack:** ${context.techStack.join(', ')}\n\n`
  }
  
  // Entscheidungen
  if (context.decisions.length > 0) {
    summary += `**Architektur-Entscheidungen:**\n`
    for (const decision of context.decisions.slice(-5)) { // Letzte 5
      summary += `- **${decision.title}** (${decision.type}): ${decision.description}\n`
    }
    summary += '\n'
  }
  
  // Code Patterns
  if (context.codePatterns.length > 0) {
    summary += `**Verwendete Patterns:**\n`
    for (const pattern of context.codePatterns) {
      summary += `- ${pattern.name}: ${pattern.usedIn.join(', ')}\n`
    }
    summary += '\n'
  }
  
  // Style Guide
  summary += `**Style Guide:** ${context.styleGuide.colorScheme} Theme, ${context.styleGuide.componentStyle} Components\n`
  
  return summary
}

// Aktualisiere Projekt-Kontext basierend auf neuen Dateien
export function updateProjectContext(
  projectId: string,
  files: { path: string; content: string }[]
): void {
  let context = projectContextStore.get(projectId)
  if (!context) {
    context = createProjectContext(projectId, 'Unnamed Project', '')
  }
  
  // Aktualisiere Tech Stack
  context.techStack = detectTechStack(files)
  
  // Aktualisiere Patterns
  context.codePatterns = detectCodePatterns(files)
  
  context.lastUpdated = new Date()
}

// Exportiere alle Funktionen
export const ProjectMemory = {
  get: getProjectContext,
  create: createProjectContext,
  addDecision: addProjectDecision,
  detectTechStack,
  detectPatterns: detectCodePatterns,
  getSummary: generateContextSummary,
  update: updateProjectContext
}
