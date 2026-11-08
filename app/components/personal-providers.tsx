"use client";
import { useEffect, useState } from "react";
import { List, ListItem } from "./ui-lib";

type Provider = { id: string; name: string; base_url: string; enabled: number };
type Model = { provider_id: string; model_id: string; enabled: number };

export function PersonalProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [edit, setEdit] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/personal/providers", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load provider settings.");
    const data = await response.json() as { providers: Provider[]; models: Model[] };
    setProviders(data.providers); setModels(data.models);
    window.dispatchEvent(new Event("personal-providers-changed"));
  }
  useEffect(() => { load().catch((e) => setMessage(e.message)); }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await operation(); } catch (e) { setMessage(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  }
  async function saveProvider() {
    const payload = edit ? { name, baseUrl, enabled: !!providers.find((p) => p.id === edit)?.enabled, ...(apiKey ? { apiKey } : {}) } : { name, baseUrl, apiKey };
    const response = await fetch(edit ? `/api/personal/providers/${edit}` : "/api/personal/providers", { method: edit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Could not save provider. Check the URL; changing it requires a new API key.");
    const result = await response.json() as { id?: string };
    const savedId = edit || result.id;
    setApiKey(""); await load();
    if (!edit && savedId) {
      setEdit(savedId);
      try {
        const modelResponse = await fetch(`/api/personal/providers/${savedId}/models`, { method: "POST" });
        if (!modelResponse.ok) throw new Error("No model list");
        const data = await modelResponse.json() as { models: string[] };
        setDiscovered(data.models); setSelected([]);
        setMessage(`Provider saved. Found ${data.models.length} models; select the ones to enable.`);
      } catch { setMessage("Provider saved, but its model list could not be fetched. Add a model manually or retry."); }
    } else {
      setName(""); setBaseUrl(""); setEdit(""); setDiscovered([]);
      setMessage("Provider saved.");
    }
  }
  async function saveModels(provider: Provider, values: string[]) {
    const response = await fetch(`/api/personal/providers/${provider.id}/models`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ models: [...new Set(values)] }) });
    if (!response.ok) throw new Error("Could not save models.");
    await load(); setMessage("Models saved.");
  }
  return <List>
    <ListItem title="Custom providers" subTitle="Add an OpenAI-compatible API. Keys are encrypted on the server." vertical>
      <form onSubmit={(e) => { e.preventDefault(); void run(saveProvider); }} style={{ display: "grid", gap: 8, width: "100%" }}>
        <input aria-label="Provider name" placeholder="Provider name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input aria-label="Provider API base URL" placeholder="https://provider.example/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
        <input aria-label="Provider API key" placeholder={edit ? "New API key (leave blank to keep)" : "API key"} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required={!edit} autoComplete="off" />
        <div><button disabled={busy} type="submit">{edit ? "Save changes" : "Add provider"}</button>{edit && <button type="button" onClick={() => { setEdit(""); setName(""); setBaseUrl(""); setApiKey(""); }}>Cancel</button>}</div>
      </form>
    </ListItem>
    {providers.map((provider) => <ListItem key={provider.id} title={provider.name} subTitle={provider.base_url} vertical>
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div>
          <button type="button" disabled={busy} onClick={() => { setEdit(provider.id); setName(provider.name); setBaseUrl(provider.base_url); setApiKey(""); setDiscovered([]); }}>Edit</button>{" "}
          <button type="button" disabled={busy} onClick={() => void run(async () => { const response = await fetch(`/api/personal/providers/${provider.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: provider.name, baseUrl: provider.base_url, enabled: !provider.enabled }) }); if (!response.ok) throw new Error("Could not update provider."); await load(); })}>{provider.enabled ? "Disable" : "Enable"}</button>{" "}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${provider.name}?`)) void run(async () => { const response = await fetch(`/api/personal/providers/${provider.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Could not remove provider."); await load(); }); }}>Remove</button>{" "}
          <button type="button" disabled={busy} onClick={() => void run(async () => { const response = await fetch(`/api/personal/providers/${provider.id}/models`, { method: "POST" }); const data = await response.json() as { error?: string; models: string[] }; if (!response.ok) throw new Error(data.error || "Could not fetch models."); setDiscovered(data.models); setSelected(models.filter((m) => m.provider_id === provider.id && m.enabled).map((m) => m.model_id)); setEdit(provider.id); setName(provider.name); setBaseUrl(provider.base_url); setMessage(`Fetched ${data.models.length} models. Select the models to enable and save.`); })}>Fetch models</button>
        </div>
        <div>Enabled models: {models.filter((m) => m.provider_id === provider.id && m.enabled).length || "None"}</div>
        {models.filter((m) => m.provider_id === provider.id && m.enabled).map((model) => <div key={model.model_id}>{model.model_id} <button type="button" disabled={busy} onClick={() => void run(() => saveModels(provider, models.filter((m) => m.provider_id === provider.id && m.enabled && m.model_id !== model.model_id).map((m) => m.model_id)))}>Disable</button></div>)}
        <div><input aria-label={`Add model for ${provider.name}`} placeholder="Exact model ID" value={edit === provider.id ? manual : ""} onFocus={() => { if (edit !== provider.id) setDiscovered([]); setEdit(provider.id); setName(provider.name); setBaseUrl(provider.base_url); }} onChange={(e) => setManual(e.target.value)} /> <button type="button" disabled={busy} onClick={() => void run(async () => { if (!manual.trim()) return; await saveModels(provider, [...models.filter((m) => m.provider_id === provider.id && m.enabled).map((m) => m.model_id), manual.trim()]); setManual(""); })}>Add model</button></div>
        {edit === provider.id && discovered.length > 0 && <><div style={{ maxHeight: 240, overflow: "auto" }}>{discovered.map((id) => <label key={id} style={{ display: "block" }}><input type="checkbox" checked={selected.includes(id)} onChange={(e) => setSelected(e.target.checked ? [...selected, id] : selected.filter((v) => v !== id))} /> {id}</label>)}</div><button type="button" disabled={busy} onClick={() => void run(() => saveModels(provider, selected))}>Save enabled models</button></>}
      </div>
    </ListItem>)}
    {message && <ListItem title={message} />}
  </List>;
}
