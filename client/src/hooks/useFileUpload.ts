import { useState, useCallback } from "react";

export type UploadedFile = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
};

export type FileUploadState = {
  isUploading: boolean;
  pendingFiles: UploadedFile[];
  error: string | null;
};

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const ALLOWED_TYPES = [
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/tiff",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "video/mp4",
  "video/avi",
  "video/x-msvideo",
  "video/quicktime",
];

export function useFileUpload() {
  const [state, setState] = useState<FileUploadState>({
    isUploading: false,
    pendingFiles: [],
    error: null,
  });

  const uploadFile = useCallback(
    async (file: File, conversationId?: string | null, addToPending = true): Promise<UploadedFile | null> => {
      if (file.size > MAX_FILE_SIZE) {
        setState((prev) => ({
          ...prev,
          error: `File "${file.name}" exceeds 500MB limit`,
        }));
        return null;
      }

      // Allow common types, text-like, and video (MP4/AVI/MOV for ImageJ wrMTrck)
      const isAllowed =
        ALLOWED_TYPES.includes(file.type) ||
        file.type.startsWith("text/") ||
        file.type.startsWith("video/") ||
        file.name.endsWith(".csv") ||
        file.name.endsWith(".json") ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".py") ||
        file.name.endsWith(".txt") ||
        file.name.toLowerCase().endsWith(".mp4") ||
        file.name.toLowerCase().endsWith(".avi") ||
        file.name.toLowerCase().endsWith(".mov") ||
        file.name.toLowerCase().endsWith(".tif") ||
        file.name.toLowerCase().endsWith(".tiff");

      if (!isAllowed) {
        setState((prev) => ({
          ...prev,
          error: `File type "${file.type || "unknown"}" is not supported`,
        }));
        return null;
      }

      setState((prev) => ({ ...prev, isUploading: true, error: null }));

      try {
        const buffer = await file.arrayBuffer();

        const headers: Record<string, string> = {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
          "x-mime-type": file.type || "application/octet-stream",
          "x-file-size": String(file.size),
        };

        if (conversationId) {
          headers["x-conversation-id"] = conversationId;
        }

        const response = await fetch("/api/agent/upload", {
          method: "POST",
          headers,
          body: buffer,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error || "Upload failed");
        }

        const data = await response.json();
        const uploaded: UploadedFile = {
          fileName: data.file.fileName,
          fileUrl: data.file.fileUrl,
          mimeType: data.file.mimeType,
          fileSize: data.file.fileSize,
        };

        setState((prev) => ({
          ...prev,
          isUploading: false,
          pendingFiles: addToPending ? [...prev.pendingFiles, uploaded] : prev.pendingFiles,
        }));

        return uploaded;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: (error as Error).message,
        }));
        return null;
      }
    },
    []
  );

  const clearPendingFiles = useCallback(() => {
    setState((prev) => ({ ...prev, pendingFiles: [], error: null }));
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.filter((_, i) => i !== index),
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    uploadFile,
    clearPendingFiles,
    removePendingFile,
    clearError,
  };
}
