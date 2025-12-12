import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

interface PreviewRequest {
  files: { path: string; content: string; language: string }[]
  framework?: "react" | "nextjs" | "html"
}

export async function POST(request: NextRequest) {
  try {
    const body: PreviewRequest = await request.json()
    const { files, framework = "react" } = body

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Keine Dateien für Preview vorhanden." },
        { status: 400 }
      )
    }

    // Generiere eine eingebettete HTML-Preview
    const htmlPreview = generatePreviewHtml(files, framework)

    return NextResponse.json({
      success: true,
      html: htmlPreview,
      fileCount: files.length,
    })
  } catch (error) {
    console.error("Preview API Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Generieren der Preview" },
      { status: 500 }
    )
  }
}

function generatePreviewHtml(
  files: { path: string; content: string; language: string }[],
  framework: string
): string {
  // Finde die Hauptkomponente
  const mainComponent = files.find(
    (f) =>
      f.path.includes("page.tsx") ||
      f.path.includes("page.jsx") ||
      f.path.includes("App.tsx") ||
      f.path.includes("index.tsx")
  )

  const componentFiles = files.filter(
    (f) => f.language === "typescript" || f.language === "tsx" || f.language === "jsx"
  )

  // Erstelle eine Code-Ansicht mit Syntax-Highlighting
  const codeBlocks = files
    .map(
      (file) => `
      <div class="file-block">
        <div class="file-header">
          <span class="file-icon">📄</span>
          <span class="file-path">${escapeHtml(file.path)}</span>
          <button class="copy-btn" onclick="copyCode(this)" data-code="${escapeHtml(file.content)}">
            📋 Kopieren
          </button>
        </div>
        <pre class="code-content"><code class="language-${file.language}">${escapeHtml(file.content)}</code></pre>
      </div>
    `
    )
    .join("\n")

  // Versuche eine Live-Preview zu generieren (für einfache React-Komponenten)
  let livePreview = ""
  if (mainComponent && framework === "react") {
    livePreview = `
      <div class="live-preview-section">
        <h3>🚀 Live Preview</h3>
        <div class="preview-notice">
          <p>Für eine vollständige Live-Preview:</p>
          <ol>
            <li>Kopiere die Dateien in dein lokales Projekt</li>
            <li>Führe <code>npm run dev</code> aus</li>
            <li>Öffne <code>http://localhost:3000</code></li>
          </ol>
          <p>Oder nutze den <strong>Deploy</strong>-Button für eine Online-Preview auf Render.com</p>
        </div>
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentForge Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e5e5e5;
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #333;
    }
    
    .header h1 {
      font-size: 24px;
      font-weight: 600;
    }
    
    .file-count {
      background: #7c3aed;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 14px;
    }
    
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    
    .tab {
      padding: 10px 20px;
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
      color: #999;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .tab:hover, .tab.active {
      background: #2a2a4e;
      color: white;
      border-color: #7c3aed;
    }
    
    .file-block {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    
    .file-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #252540;
      border-bottom: 1px solid #333;
    }
    
    .file-icon {
      font-size: 16px;
    }
    
    .file-path {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      color: #7c3aed;
      flex: 1;
    }
    
    .copy-btn {
      padding: 6px 12px;
      background: #333;
      border: none;
      border-radius: 6px;
      color: #999;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    
    .copy-btn:hover {
      background: #7c3aed;
      color: white;
    }
    
    .code-content {
      padding: 16px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      background: #0d0d15;
    }
    
    .code-content code {
      color: #e5e5e5;
    }
    
    .live-preview-section {
      background: linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%);
      border: 1px solid #7c3aed;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    
    .live-preview-section h3 {
      margin-bottom: 16px;
      color: #7c3aed;
    }
    
    .preview-notice {
      color: #999;
    }
    
    .preview-notice ol {
      margin: 12px 0 12px 24px;
    }
    
    .preview-notice li {
      margin: 8px 0;
    }
    
    .preview-notice code {
      background: #333;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
    }
    
    /* Syntax Highlighting */
    .keyword { color: #c678dd; }
    .string { color: #98c379; }
    .comment { color: #5c6370; }
    .function { color: #61afef; }
    .number { color: #d19a66; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔮 AgentForge Preview</h1>
      <span class="file-count">${files.length} Datei${files.length !== 1 ? "en" : ""}</span>
    </div>
    
    ${livePreview}
    
    <div class="tabs">
      <button class="tab active">📁 Alle Dateien</button>
    </div>
    
    <div class="files-container">
      ${codeBlocks}
    </div>
  </div>
  
  <script>
    function copyCode(btn) {
      const code = btn.getAttribute('data-code');
      navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '✅ Kopiert!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      });
    }
  </script>
</body>
</html>
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
