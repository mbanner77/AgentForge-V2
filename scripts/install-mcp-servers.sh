#!/bin/bash

# =============================================================================
# MCP Server Installation Script
# Installiert alle offiziellen und community MCP Server für AgentForge
# =============================================================================

set -e

echo "🚀 AgentForge MCP Server Installation"
echo "======================================"
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Überprüfe Node.js Version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ erforderlich. Aktuelle Version: $(node -v 2>/dev/null || echo 'nicht installiert')${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) gefunden${NC}"

# Funktion zum Installieren eines MCP Servers
install_mcp_server() {
    local package=$1
    local name=$2
    echo -e "${BLUE}Installing ${name}...${NC}"
    if npm install -g "$package" 2>/dev/null; then
        echo -e "${GREEN}✓ ${name} installiert${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ ${name} konnte nicht installiert werden${NC}"
        return 1
    fi
}

echo ""
echo "📦 Installiere offizielle Anthropic MCP Server..."
echo "------------------------------------------------"

# Offizielle Anthropic MCP Server
install_mcp_server "@modelcontextprotocol/server-filesystem" "Filesystem Server"
install_mcp_server "@modelcontextprotocol/server-git" "Git Server"
install_mcp_server "@modelcontextprotocol/server-postgres" "PostgreSQL Server"
install_mcp_server "@modelcontextprotocol/server-sqlite" "SQLite Server"
install_mcp_server "@modelcontextprotocol/server-brave-search" "Brave Search Server"
install_mcp_server "@modelcontextprotocol/server-fetch" "Fetch Server"
install_mcp_server "@modelcontextprotocol/server-github" "GitHub Server"
install_mcp_server "@modelcontextprotocol/server-gitlab" "GitLab Server"
install_mcp_server "@modelcontextprotocol/server-slack" "Slack Server"
install_mcp_server "@modelcontextprotocol/server-puppeteer" "Puppeteer Server"
install_mcp_server "@modelcontextprotocol/server-memory" "Memory Server"
install_mcp_server "@modelcontextprotocol/server-sequential-thinking" "Sequential Thinking Server"

echo ""
echo "📦 Installiere SAP MCP Server..."
echo "--------------------------------"

# SAP MCP Server
install_mcp_server "@cap-js/mcp-server" "SAP CAP Server"
install_mcp_server "@ui5/mcp-server" "SAP UI5 Server"
install_mcp_server "@sap/mdk-mcp-server" "SAP MDK Server"
install_mcp_server "@sap-ux/fiori-mcp-server" "SAP Fiori Server"

echo ""
echo "📦 Installiere Community MCP Server..."
echo "--------------------------------------"

# Community Server (optional, können fehlschlagen)
install_mcp_server "@mcp/server-redis" "Redis Server" || true
install_mcp_server "@mcp/server-mongodb" "MongoDB Server" || true
install_mcp_server "@mcp/server-linear" "Linear Server" || true
install_mcp_server "@mcp/server-notion" "Notion Server" || true
install_mcp_server "@mcp/server-todoist" "Todoist Server" || true

echo ""
echo "======================================"
echo -e "${GREEN}✅ MCP Server Installation abgeschlossen!${NC}"
echo ""
echo "Nächste Schritte:"
echo "1. Setze MCP_MODE=production in .env.local"
echo "2. Konfiguriere API Keys für externe Services"
echo "3. Starte den Server neu: npm run dev"
echo ""
echo "Installierte Server auflisten:"
echo "  npm list -g --depth=0 | grep mcp"
echo ""
