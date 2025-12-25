"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Image, X, Loader2, Sparkles } from "lucide-react";
import { screenshotToCode } from "@/lib/api-client";
import { useAgentStore } from "@/lib/agent-store";
import { parseCodeFromResponse } from "@/lib/agent-executor-real";

interface ScreenshotUploadProps {
  onCodeGenerated?: (code: string) => void;
}

export function ScreenshotUpload({ onCodeGenerated }: ScreenshotUploadProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState<"png" | "jpeg" | "webp" | "gif">("png");
  const [instructions, setInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { globalConfig, addFile, addMessage } = useAgentStore();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validiere Dateityp
    const validTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setError("Bitte nur PNG, JPEG, WebP oder GIF Bilder hochladen.");
      return;
    }

    // Validiere Größe (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      setError("Bild ist zu groß. Maximal 20MB erlaubt.");
      return;
    }

    setError(null);

    // Lese Datei als Base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);
      
      // Extrahiere Base64 ohne data: prefix
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
      
      // Bestimme Typ
      const type = file.type.split("/")[1] as "png" | "jpeg" | "webp" | "gif";
      setImageType(type);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fakeEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const clearImage = useCallback(() => {
    setImagePreview(null);
    setImageBase64(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleGenerate = async () => {
    if (!imageBase64) {
      setError("Bitte zuerst ein Bild hochladen.");
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

    try {
      addMessage({
        role: "user",
        content: `🖼️ Screenshot-to-Code: ${instructions || "Erstelle UI basierend auf diesem Screenshot"}`,
      });

      const response = await screenshotToCode({
        imageBase64,
        imageType,
        additionalInstructions: instructions,
        apiKey,
        provider,
        targetEnvironment: globalConfig.targetEnvironment === "sandpack" ? "sandpack" : "nextjs",
      });

      // Parse generierte Dateien
      const files = parseCodeFromResponse(response);
      
      if (files.length > 0) {
        // Füge Dateien zum Store hinzu
        for (const file of files) {
          addFile({
            path: file.path,
            content: file.content,
            language: file.language,
            status: "created" as const,
          });
        }

        addMessage({
          role: "assistant",
          content: `✅ **Screenshot analysiert!**\n\n${files.length} Dateien generiert:\n${files.map((f: { path: string }) => `- \`${f.path}\``).join("\n")}`,
          agent: "coder",
        });

        onCodeGenerated?.(response);
        clearImage();
      } else {
        setError("Konnte keinen Code aus dem Screenshot generieren. Bitte versuche es mit einem anderen Bild.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
      addMessage({
        role: "assistant",
        content: `❌ **Fehler bei Screenshot-Analyse:** ${message}`,
        agent: "coder",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Image className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Screenshot to Code</h3>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${imagePreview ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFileSelect}
        />

        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-48 mx-auto rounded-md"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute top-0 right-0 h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                clearImage();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Klicke oder ziehe ein Bild hierher
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, WebP, GIF (max. 20MB)
            </p>
          </div>
        )}
      </div>

      {/* Instructions */}
      {imagePreview && (
        <div className="space-y-2">
          <Label>Zusätzliche Anweisungen (optional)</Label>
          <Textarea
            placeholder="z.B. 'Verwende dunkles Theme' oder 'Füge Animationen hinzu'"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="min-h-[60px] resize-none"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Generate Button */}
      {imagePreview && (
        <Button
          className="w-full"
          onClick={handleGenerate}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analysiere Screenshot...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Code generieren
            </>
          )}
        </Button>
      )}
    </Card>
  );
}
