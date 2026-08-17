import { describe, expect, it, vi } from "vitest";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { createVisionRouter, normalizeOptions, type VisionRouterOptions } from "../src/index.js";
import type { ProviderListItem } from "../src/vision.js";
import { connectedProviders, providerAll } from "./fixtures.js";

type ChatMessageInput = Parameters<NonNullable<Hooks["chat.message"]>>[0];
type ChatMessageOutput = Parameters<NonNullable<Hooks["chat.message"]>>[1];
type OpenCodeEvent = Parameters<NonNullable<Hooks["event"]>>[0]["event"];
type PromptArgs = Parameters<PluginInput["client"]["session"]["prompt"]>[0];

const groqProvider: ProviderListItem = {
  id: "groq",
  models: {
    "llama-3.2-90b-vision-preview": {
      id: "llama-3.2-90b-vision-preview",
      attachment: true,
      cost: { input: 0 },
    },
    "llama-3.2-11b-vision-preview": {
      id: "llama-3.2-11b-vision-preview",
      attachment: true,
      cost: { input: 0 },
    },
  },
};

async function boot(options: VisionRouterOptions = {}, extraProviders: ProviderListItem[] = []) {
  const all = [...providerAll, ...extraProviders];
  const list = vi.fn(async () => ({
    data: { all, connected: [...connectedProviders, ...extraProviders.map((p) => p.id)] },
  }));
  const prompt = vi.fn(async (args: PromptArgs) => ({ info: { id: "m1" }, parts: [] }));
  const client = {
    provider: { list },
    session: { prompt },
  } as unknown as PluginInput["client"];
  const hooks = await createVisionRouter(options)({ client } as unknown as PluginInput);
  return { hooks, list, prompt };
}

function imageParts(sessionID: string) {
  return [
    { id: "p1", sessionID, messageID: "um1", type: "file", mime: "image/png", filename: "a.png", url: "file:///a.png" },
    { id: "p2", sessionID, messageID: "um1", type: "text", text: "describe this image" },
  ];
}

async function sendImage(hooks: Hooks, sessionID = "s1", agent = "build") {
  const input = { sessionID, agent } satisfies ChatMessageInput;
  const output = { message: {}, parts: imageParts(sessionID) } as unknown as ChatMessageOutput;
  await hooks["chat.message"]!(input, output);
}

async function sendText(hooks: Hooks, sessionID = "s1") {
  const input = { sessionID } satisfies ChatMessageInput;
  const output = {
    message: {},
    parts: [{ id: "p1", sessionID, messageID: "um1", type: "text", text: "hello" }],
  } as unknown as ChatMessageOutput;
  await hooks["chat.message"]!(input, output);
}

function sessionError(sessionID = "s1"): OpenCodeEvent {
  return { type: "session.error", properties: { sessionID } } as OpenCodeEvent;
}

function sessionSuccess(sessionID = "s1"): OpenCodeEvent {
  return {
    type: "message.updated",
    properties: {
      info: { id: "a1", sessionID, role: "assistant", parentID: "um1", error: undefined },
    },
  } as unknown as OpenCodeEvent;
}

async function emitError(hooks: Hooks, sessionID = "s1") {
  await hooks.event!({ event: sessionError(sessionID) });
}

describe("normalizeOptions", () => {
  it("applies defaults", () => {
    expect(normalizeOptions()).toEqual({
      maxAttempts: 4,
      maxCost: undefined,
      preferProviders: ["groq"],
      excludeProviders: [],
      excludeModels: [],
      cacheMs: 300_000,
      debug: false,
    });
  });

  it("clamps and sanitizes user values", () => {
    expect(
      normalizeOptions({
        maxAttempts: 0,
        cacheMs: -5,
        debug: true,
        preferProviders: ["groq", 7 as unknown as string],
        excludeProviders: ["a", 42 as unknown as string],
        excludeModels: ["b", null as unknown as string],
      }),
    ).toEqual({
      maxAttempts: 1,
      maxCost: undefined,
      preferProviders: ["groq"],
      excludeProviders: ["a"],
      excludeModels: ["b"],
      cacheMs: 0,
      debug: true,
    });
  });
});

describe("VisionRouterPlugin", () => {
  it("resends an image message on the cheapest vision model after a session error", async () => {
    const { hooks, prompt } = await boot();
    await sendImage(hooks, "s1", "build");
    await emitError(hooks, "s1");

    expect(prompt).toHaveBeenCalledTimes(1);
    const [call] = prompt.mock.calls[0];
    expect(call.path).toEqual({ id: "s1" });
    expect(call.body!.model).toEqual({ providerID: "local", modelID: "legacy-vision" });
    expect(call.body!.agent).toBe("build");
    expect(call.body!.parts).toHaveLength(2);
  });

  it("tries groq first by default when it is connected", async () => {
    const { hooks, prompt } = await boot({}, [groqProvider]);
    await sendImage(hooks, "s1");
    await emitError(hooks, "s1");
    await emitError(hooks, "s1");

    const models = prompt.mock.calls.map(([call]) => call.body!.model);
    expect(models[0]).toEqual({ providerID: "groq", modelID: "llama-3.2-90b-vision-preview" });
    expect(models[1]).toEqual({ providerID: "groq", modelID: "llama-3.2-11b-vision-preview" });
  });

  it("does not resend text-only messages", async () => {
    const { hooks, prompt } = await boot();
    await sendText(hooks, "s1");
    await emitError(hooks, "s1");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("clears a previously armed pending call when a text-only message arrives", async () => {
    const { hooks, prompt } = await boot();
    await sendImage(hooks, "s1");
    await sendText(hooks, "s1");
    await emitError(hooks, "s1");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("escalates through the whole chain as models keep failing", async () => {
    const { hooks, prompt } = await boot({ maxAttempts: 10 });
    await sendImage(hooks, "s1");

    for (let i = 0; i < 6; i++) await emitError(hooks, "s1");

    expect(prompt).toHaveBeenCalledTimes(5);
    const models = prompt.mock.calls.map(([call]) => call.body!.model);
    expect(models).toEqual([
      { providerID: "local", modelID: "legacy-vision" },
      { providerID: "openai", modelID: "gpt-4o-mini" },
      { providerID: "anthropic", modelID: "claude-haiku" },
      { providerID: "anthropic", modelID: "claude-sonnet" },
      { providerID: "openai", modelID: "gpt-4o" },
    ]);
  });

  it("stops resending once maxAttempts is reached", async () => {
    const { hooks, prompt } = await boot({ maxAttempts: 2 });
    await sendImage(hooks, "s1");

    await emitError(hooks, "s1");
    await emitError(hooks, "s1");
    await emitError(hooks, "s1");

    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it("clears pending when an assistant reply succeeds", async () => {
    const { hooks, prompt } = await boot();
    await sendImage(hooks, "s1");
    await hooks.event!({ event: sessionSuccess("s1") });
    await emitError(hooks, "s1");

    expect(prompt).not.toHaveBeenCalled();
  });

  it("honors maxCost and excludeProviders when resending", async () => {
    const { hooks, prompt } = await boot({ maxCost: 1, excludeProviders: ["local"] });
    await sendImage(hooks, "s1");

    await emitError(hooks, "s1");
    await emitError(hooks, "s1");
    await emitError(hooks, "s1");

    expect(prompt).toHaveBeenCalledTimes(2);
    const models = prompt.mock.calls.map(([call]) => call.body!.model);
    expect(models).toEqual([
      { providerID: "openai", modelID: "gpt-4o-mini" },
      { providerID: "anthropic", modelID: "claude-haiku" },
    ]);
  });

  it("swallows a failing resend and stops routing that session", async () => {
    const { hooks, prompt } = await boot();
    prompt.mockRejectedValueOnce(new Error("provider down"));
    await sendImage(hooks, "s1");

    await emitError(hooks, "s1");
    await emitError(hooks, "s1");

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent session.error events for the same session", async () => {
    const { hooks, prompt } = await boot();
    await sendImage(hooks, "s1");

    await Promise.all([emitError(hooks, "s1"), emitError(hooks, "s1")]);

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("caches the provider list within the cache window", async () => {
    const { hooks, list } = await boot();
    await sendImage(hooks, "s1");
    await emitError(hooks, "s1");

    await sendImage(hooks, "s2");
    await emitError(hooks, "s2");

    expect(list).toHaveBeenCalledTimes(1);
  });

  it("refetches the provider list when the cache window is zero", async () => {
    const { hooks, list } = await boot({ cacheMs: 0 });
    await sendImage(hooks, "s1");
    await emitError(hooks, "s1");

    await sendImage(hooks, "s2");
    await emitError(hooks, "s2");

    expect(list).toHaveBeenCalledTimes(2);
  });
});
