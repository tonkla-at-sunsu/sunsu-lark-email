import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function decodeBase64Utf8(input: string | undefined | null): string {
  if (!input) return "";
  try {
    // Normalize Base64 (handle URL-safe variants and missing padding)
    let normalized = String(input).replace(/\s+/g, "");
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    if (pad > 0) {
      normalized = normalized.padEnd(normalized.length + (4 - pad), "=");
    }

    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const binary = window.atob(normalized);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const decoder = new TextDecoder("utf-8", { fatal: false });
      return decoder.decode(bytes);
    }
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch {
    return "";
  }
}
