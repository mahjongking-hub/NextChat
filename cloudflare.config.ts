import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "nextchat-personal",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-07",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["nextchat.nausiujue.top"],
    workersDev: false,
    previewUrls: false,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ name: "nextchat-personal-db", id: "657cb616-59d0-4215-8de5-445be432100b" }),
      PROVIDER_ENCRYPTION_KEY: bindings.secret(),
      ACCESS_AUDIENCE: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_OWNER_EMAIL: bindings.secret(),
    },
  }),
});
