import type { ProviderListItem } from "../src/vision.js";

export const providerAll: ProviderListItem[] = [
  {
    id: "openai",
    models: {
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        attachment: true,
        cost: { input: 0.15 },
      },
      "gpt-4o": {
        id: "gpt-4o",
        attachment: true,
        cost: { input: 5 },
      },
      "gpt-3.5-turbo": {
        id: "gpt-3.5-turbo",
        attachment: false,
        modalities: { input: ["text"] },
        cost: { input: 0.5 },
      },
    },
  },
  {
    id: "anthropic",
    models: {
      "claude-haiku": {
        id: "claude-haiku",
        attachment: false,
        modalities: { input: ["text", "image"] },
        cost: { input: 0.25 },
      },
      "claude-sonnet": {
        id: "claude-sonnet",
        attachment: true,
        cost: { input: 3 },
      },
    },
  },
  {
    id: "local",
    models: {
      "legacy-vision": {
        id: "legacy-vision",
        attachment: false,
        capabilities: { input: { image: true } },
        cost: { input: 0 },
      },
    },
  },
  {
    id: "unconnected",
    models: {
      "cheap-vision": {
        id: "cheap-vision",
        attachment: true,
        cost: { input: 0.01 },
      },
    },
  },
];

export const connectedProviders = ["openai", "anthropic", "local"];