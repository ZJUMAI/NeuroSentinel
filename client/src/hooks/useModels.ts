import { useState, useEffect } from "react";

export type ModelInfo = {
  id: string;
  name: string;
  description: string;
  provider: string;
};

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("glm-4.7-flash");
  const [selectedModel, setSelectedModel] = useState<string>("glm-4.7-flash");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agent/models")
      .then((res) => res.json())
      .then((data) => {
        setModels(data.models || []);
        setDefaultModel(data.defaultModel || "glm-4.7-flash");
        setSelectedModel((prev) =>
          prev === "glm-4.7-flash" ? (data.defaultModel || "glm-4.7-flash") : prev
        );
      })
      .catch(() => {
        // Fallback models
        setModels([
          {
            id: "glm-4.7-flash",
            name: "GLM-4.7 Flash",
            description: "快速推理",
            provider: "zhipu",
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    models,
    defaultModel,
    selectedModel,
    setSelectedModel,
    loading,
  };
}
