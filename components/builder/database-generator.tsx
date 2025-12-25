"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Database, Loader2, Sparkles, Check } from "lucide-react";
import { generateDatabaseCode } from "@/lib/database-schema-generator";
import { useAgentStore } from "@/lib/agent-store";

interface DatabaseGeneratorProps {
  onCodeGenerated?: () => void;
}

export function DatabaseGenerator({ onCodeGenerated }: DatabaseGeneratorProps) {
  const [description, setDescription] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const { globalConfig, addFile, addMessage } = useAgentStore();

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError("Bitte beschreibe dein Datenmodell.");
      return;
    }

    // Prüfe API Key
    const apiKey = globalConfig.openaiApiKey || globalConfig.openrouterApiKey || globalConfig.anthropicApiKey;
    if (!apiKey) {
      setError("Bitte API Key in den Einstellungen konfigurieren.");
      return;
    }

    // Bestimme Provider
    let provider: "openai" | "anthropic" | "openrouter" = "openai";
    if (globalConfig.openrouterApiKey && !globalConfig.openaiApiKey) {
      provider = "openrouter";
    } else if (globalConfig.anthropicApiKey && !globalConfig.openaiApiKey) {
      provider = "anthropic";
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      addMessage({
        role: "user",
        content: `🗄️ Database Schema: ${description}`,
      });

      const result = await generateDatabaseCode(description, apiKey, provider);

      // Füge Prisma Schema hinzu
      addFile({
        path: "prisma/schema.prisma",
        content: result.prismaSchema,
        language: "prisma",
        status: "created" as const,
      });

      // Füge API Routes hinzu
      for (const route of result.apiRoutes) {
        addFile({
          path: route.path,
          content: route.content,
          language: "typescript",
          status: "created" as const,
        });
      }

      // Füge Types hinzu
      addFile({
        path: "lib/types/database.ts",
        content: result.types,
        language: "typescript",
        status: "created" as const,
      });

      // Füge Hooks hinzu
      addFile({
        path: "lib/hooks/use-database.ts",
        content: result.hooks,
        language: "typescript",
        status: "created" as const,
      });

      const totalFiles = 2 + result.apiRoutes.length + 2;

      addMessage({
        role: "assistant",
        content: `✅ **Datenbank-Schema generiert!**

**${totalFiles} Dateien erstellt:**
- \`prisma/schema.prisma\` - Prisma Schema
- \`lib/prisma.ts\` - Prisma Client
- \`lib/types/database.ts\` - TypeScript Types
- \`lib/hooks/use-database.ts\` - React Hooks
${result.apiRoutes.map(r => `- \`${r.path}\``).join("\n")}

**Nächste Schritte:**
1. \`npm install prisma @prisma/client\`
2. \`npx prisma generate\`
3. \`npx prisma db push\` (oder \`migrate dev\`)`,
        agent: "coder",
      });

      setSuccess(true);
      setDescription("");
      onCodeGenerated?.();

      // Reset success nach 3 Sekunden
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
      addMessage({
        role: "assistant",
        content: `❌ **Fehler bei Schema-Generierung:** ${message}`,
        agent: "coder",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Database Schema Generator</h3>
      </div>

      <div className="space-y-2">
        <Label>Beschreibe dein Datenmodell</Label>
        <Textarea
          placeholder="z.B. 'Eine Blog-App mit Users, Posts und Comments. Users können mehrere Posts haben, Posts können mehrere Comments haben.'"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[100px] resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Beschreibe Entities und ihre Beziehungen in natürlicher Sprache.
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Success */}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <Check className="h-4 w-4" />
          Schema erfolgreich generiert!
        </div>
      )}

      {/* Generate Button */}
      <Button
        className="w-full"
        onClick={handleGenerate}
        disabled={isProcessing || !description.trim()}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generiere Schema...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Schema generieren
          </>
        )}
      </Button>
    </Card>
  );
}
