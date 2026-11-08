import { useEffect, useState } from "react";
import type { LLMModel } from "../client/api";

type PersonalModel = LLMModel & { displayName: string; providerLabel: string; isDefault?: boolean };
export function useAllModels(): PersonalModel[] {
  const [models, setModels] = useState<PersonalModel[]>([]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/personal/providers", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load providers");
        const data = await response.json();
        const providerById = new Map<string, any>(data.providers.filter((p: any) => p.enabled).map((p: any) => [p.id, p]));
        const next = data.models.filter((m: any) => m.enabled && providerById.has(m.provider_id)).map((m: any, index: number) => {
          const provider = providerById.get(m.provider_id);
          return { name: m.model_id, displayName: `${m.model_id} (${provider.name})`, providerLabel: provider.name, available: true, sorted: index, provider: { id: provider.id, providerName: provider.id, providerType: "custom", sorted: index } };
        });
        if (active) setModels(next);
      } catch { if (active) setModels([]); }
    }
    void load();
    window.addEventListener("personal-providers-changed", load);
    return () => { active = false; window.removeEventListener("personal-providers-changed", load); };
  }, []);
  return models;
}
