import { describe, expect, it } from "vitest";
import { buildVisionChain, isVisionModel, type ProviderListItemModel } from "../src/vision.js";
import { connectedProviders, providerAll } from "./fixtures.js";

describe("isVisionModel", () => {
  it("detects models with attachment: true", () => {
    expect(isVisionModel({ id: "m", attachment: true })).toBe(true);
  });

  it("detects models whose modalities.input includes image", () => {
    expect(
      isVisionModel({
        id: "m",
        attachment: false,
        modalities: { input: ["text", "image"] },
      }),
    ).toBe(true);
  });

  it("rejects models without image support", () => {
    const model: ProviderListItemModel = {
      id: "m",
      attachment: false,
      modalities: { input: ["text", "audio"] },
    };
    expect(isVisionModel(model)).toBe(false);
  });

  it("rejects models with no capability fields at all", () => {
    expect(isVisionModel({ id: "m", attachment: false })).toBe(false);
  });

  it("falls back to legacy capabilities.input.image", () => {
    expect(
      isVisionModel({
        id: "m",
        attachment: false,
        capabilities: { input: { image: true } },
      }),
    ).toBe(true);
  });
});

describe("buildVisionChain", () => {
  it("keeps only connected vision-capable models, sorted by input cost ascending", () => {
    const chain = buildVisionChain(providerAll, connectedProviders);

    expect(chain).toEqual([
      { providerID: "local", modelID: "legacy-vision", cost: 0 },
      { providerID: "openai", modelID: "gpt-4o-mini", cost: 0.15 },
      { providerID: "anthropic", modelID: "claude-haiku", cost: 0.25 },
      { providerID: "anthropic", modelID: "claude-sonnet", cost: 3 },
      { providerID: "openai", modelID: "gpt-4o", cost: 5 },
    ]);
  });

  it("excludes models from excluded providers", () => {
    const chain = buildVisionChain(providerAll, connectedProviders, {
      excludeProviders: ["anthropic"],
    });

    expect(chain.map((m) => m.providerID)).toEqual(["local", "openai", "openai"]);
  });

  it("excludes models by bare model id or providerID/modelID", () => {
    const chain = buildVisionChain(providerAll, connectedProviders, {
      excludeModels: ["gpt-4o", "anthropic/claude-sonnet"],
    });

    expect(chain.map((m) => m.modelID)).toEqual(["legacy-vision", "gpt-4o-mini", "claude-haiku"]);
  });

  it("puts preferred providers first even when costlier", () => {
    const chain = buildVisionChain(providerAll, connectedProviders, {
      preferProviders: ["openai"],
    });

    expect(chain.map((m) => m.providerID)).toEqual(["openai", "openai", "local", "anthropic", "anthropic"]);
    expect(chain.map((m) => m.cost)).toEqual([0.15, 5, 0, 0.25, 3]);
  });

  it("keeps cost order inside the preferred group", () => {
    const chain = buildVisionChain(providerAll, connectedProviders, {
      preferProviders: ["anthropic", "openai"],
    });

    expect(chain.map((m) => m.providerID)).toEqual(["openai", "anthropic", "anthropic", "openai", "local"]);
    expect(chain.map((m) => m.cost)).toEqual([0.15, 0.25, 3, 5, 0]);
  });

  it("drops models whose cost exceeds maxCost", () => {
    const chain = buildVisionChain(providerAll, connectedProviders, { maxCost: 1 });

    expect(chain.map((m) => m.modelID)).toEqual(["legacy-vision", "gpt-4o-mini", "claude-haiku"]);
  });

  it("returns an empty chain when nothing is connected", () => {
    expect(buildVisionChain(providerAll, [])).toEqual([]);
  });

  it("returns an empty chain when nothing supports vision", () => {
    expect(buildVisionChain(providerAll, ["openai"], { excludeProviders: ["openai", "anthropic", "local"] })).toEqual([]);
  });
});