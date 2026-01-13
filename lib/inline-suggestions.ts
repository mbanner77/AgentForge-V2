// ============================================
// INLINE SUGGESTIONS: Code-Vorschläge während der Eingabe
// ============================================

export interface InlineSuggestion {
  id: string
  trigger: string
  completion: string
  description: string
  category: 'snippet' | 'component' | 'hook' | 'pattern' | 'fix'
  priority: number
}

export interface SuggestionContext {
  currentLine: string
  previousLines: string[]
  filePath: string
  cursorPosition: number
  fileType: 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json' | 'other'
}

// Vordefinierte Code-Snippets
const codeSnippets: InlineSuggestion[] = [
  // React Hooks
  {
    id: 'useState',
    trigger: 'ust',
    completion: 'const [value, setValue] = useState("")',
    description: 'useState Hook',
    category: 'hook',
    priority: 10
  },
  {
    id: 'useEffect',
    trigger: 'uef',
    completion: 'useEffect(() => {\n  // Effect\n  return () => {\n    // Cleanup\n  }\n}, [])',
    description: 'useEffect mit Cleanup',
    category: 'hook',
    priority: 10
  },
  {
    id: 'useCallback',
    trigger: 'ucb',
    completion: 'const handleClick = useCallback(() => {\n  // Handler\n}, [])',
    description: 'useCallback für Event Handler',
    category: 'hook',
    priority: 9
  },
  {
    id: 'useMemo',
    trigger: 'ume',
    completion: 'const computed = useMemo(() => {\n  return value\n}, [dependency])',
    description: 'useMemo für teure Berechnungen',
    category: 'hook',
    priority: 9
  },
  {
    id: 'useRef',
    trigger: 'urf',
    completion: 'const ref = useRef<HTMLDivElement>(null)',
    description: 'useRef für DOM-Referenz',
    category: 'hook',
    priority: 8
  },
  
  // React Components
  {
    id: 'component',
    trigger: 'rfc',
    completion: 'export function Component({ props }: Props) {\n  return (\n    <div className="container">\n      content\n    </div>\n  )\n}',
    description: 'React Functional Component',
    category: 'component',
    priority: 10
  },
  
  // Patterns
  {
    id: 'mapList',
    trigger: 'mapl',
    completion: '{items.map((item) => (\n  <div key={item.id}>\n    {item.name}\n  </div>\n))}',
    description: 'Array.map für Listen',
    category: 'pattern',
    priority: 8
  },
  {
    id: 'asyncFunction',
    trigger: 'asf',
    completion: 'const fetchData = async () => {\n  try {\n    const response = await fetch(url)\n    const data = await response.json()\n    setData(data)\n  } catch (error) {\n    console.error(error)\n  }\n}',
    description: 'Async Function mit Error Handling',
    category: 'pattern',
    priority: 8
  },
  
  // Tailwind Classes
  {
    id: 'flexCenter',
    trigger: 'flc',
    completion: 'flex items-center justify-center',
    description: 'Flex Center',
    category: 'snippet',
    priority: 6
  },
  {
    id: 'gridCols',
    trigger: 'grc',
    completion: 'grid grid-cols-3 gap-4',
    description: 'CSS Grid',
    category: 'snippet',
    priority: 6
  },
  {
    id: 'card',
    trigger: 'crd',
    completion: 'bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg',
    description: 'Card Styling',
    category: 'snippet',
    priority: 6
  },
  {
    id: 'button',
    trigger: 'btn',
    completion: 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors',
    description: 'Button Styling',
    category: 'snippet',
    priority: 6
  },
  
  // TypeScript
  {
    id: 'interface',
    trigger: 'int',
    completion: 'interface Name {\n  property: type\n}',
    description: 'TypeScript Interface',
    category: 'snippet',
    priority: 8
  },
  {
    id: 'type',
    trigger: 'typ',
    completion: 'type Name = string | number',
    description: 'TypeScript Type',
    category: 'snippet',
    priority: 8
  },
]

// Finde passende Vorschläge basierend auf Kontext
export function getSuggestions(context: SuggestionContext): InlineSuggestion[] {
  const { currentLine, fileType } = context
  const trimmedLine = currentLine.trim().toLowerCase()
  
  if (!['tsx', 'ts', 'jsx', 'js'].includes(fileType)) {
    return []
  }
  
  const suggestions: InlineSuggestion[] = []
  
  for (const snippet of codeSnippets) {
    if (trimmedLine.endsWith(snippet.trigger) || trimmedLine.includes(snippet.trigger)) {
      suggestions.push(snippet)
    }
  }
  
  // Kontext-basierte Vorschläge
  if (trimmedLine.includes('usestate')) {
    const s = codeSnippets.find(s => s.id === 'useState')
    if (s) suggestions.push(s)
  }
  
  if (trimmedLine.includes('useeffect')) {
    const s = codeSnippets.find(s => s.id === 'useEffect')
    if (s) suggestions.push(s)
  }
  
  if (trimmedLine.includes('.map(') || trimmedLine.includes('list')) {
    const s = codeSnippets.find(s => s.id === 'mapList')
    if (s) suggestions.push(s)
  }
  
  // Entferne Duplikate und sortiere
  const unique = Array.from(new Map(suggestions.map(s => [s.id, s])).values())
  return unique.sort((a, b) => b.priority - a.priority).slice(0, 5)
}

// Erkenne häufige Fehler und schlage Fixes vor
export function suggestFix(errorMessage: string): InlineSuggestion | null {
  if (errorMessage.includes('is not defined') || errorMessage.includes('Cannot find')) {
    const match = errorMessage.match(/['"](\w+)['"]/)
    if (match) {
      const missing = match[1]
      
      if (missing.startsWith('use')) {
        return {
          id: 'fix-import-hook',
          trigger: '',
          completion: `import { ${missing} } from "react"`,
          description: `Import ${missing} from React`,
          category: 'fix',
          priority: 10
        }
      }
    }
  }
  
  if (errorMessage.includes('key')) {
    return {
      id: 'fix-key',
      trigger: '',
      completion: 'key={item.id}',
      description: 'Add unique key prop',
      category: 'fix',
      priority: 10
    }
  }
  
  return null
}

// Quick-Fix Aktionen
export const quickFixes = {
  addImport: (name: string, from: string) => `import { ${name} } from "${from}"`,
  addKey: (keyExpr: string = 'item.id') => `key={${keyExpr}}`,
  wrapWithFragment: (content: string) => `<>\n${content}\n</>`,
  addOptionalChaining: (expr: string) => `${expr}?.`,
  addNullCheck: (expr: string) => `${expr} ?? null`,
}

// Alle Snippets exportieren
export { codeSnippets }
