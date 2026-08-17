import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { SessionPromptData } from "@opencode-ai/sdk";
import { buildVisionChain, type VisionChainOptions, type VisionModel } from "./vision.js";

export type { VisionChainOptions, VisionModel };
export { buildVisionChain, isVisionModel } from "./vision.js";

export type VisionRouterOptions = VisionChainOptions & {
  maxAttempts?: number;
  cacheMs?: number;
  debug?: boolean;
};

export type NormalizedOptions = Required<Pick<VisionRouterOptions, "maxAttempts" | "cacheMs" | "debug">> & {
  maxCost?: number;
  preferProviders: string[];
  excludeProviders: string[];
  excludeModels: string[];
};

type ChatMessageParts = Parameters<NonNullable<Hooks["chat.message"]>>[1]["parts"];
type OpenCodeEvent = Parameters<NonNullable<Hooks["event"]>>[0]["event"];
type SessionPromptBody = NonNullable<SessionPromptData["body"]>;

type PendingVisionCall = {
  agent?: string;
  parts: ChatMessageParts;
  nextIndex: number;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_CACHE_MS = 5 * 60_000;

export function normalizeOptions(raw: VisionRouterOptions = {}): NormalizedOptions {
  return {
    maxAttempts: Math.max(1, Math.floor(raw.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)),
    maxCost: raw.maxCost === undefined ? undefined : Math.max(0, raw.maxCost),
    preferProviders: (raw.preferProviders ?? []).filter((p): p is string => typeof p === "string"),
    excludeProviders: (raw.excludeProviders ?? []).filter((p): p is string => typeof p === "string"),
    excludeModels: (raw.excludeModels ?? []).filter((m): m is string => typeof m === "string"),
    cacheMs: Math.max(0, Math.floor(raw.cacheMs ?? DEFAULT_CACHE_MS)),
    debug: raw.debug === true,
  };
}

function makeVisionRouter(client: PluginInput["client"], opts: NormalizedOptions): Hooks {
  const pending = new Map<string, PendingVisionCall>();
  const inFlight = new Set<string>();
  let chainCache: VisionModel[] | null = null;
  let chainCachedAt = 0;

  const log = opts.debug
    ? (msg: string) => console.error(`[vision-router] ${msg}`)
    : () => {};

  async function getVisionChain(): Promise<VisionModel[]> {
    const now = Date.now();
    if (chainCache && now - chainCachedAt < opts.cacheMs) return chainCache;

    const res = await client.provider.list();
    const data = res.data ?? { all: [], connected: [] };
    const chain = buildVisionChain(data.all, data.connected, opts);
    chainCache = chain;
    chainCachedAt = now;
    return chain;
  }

  async function resend(state: PendingVisionCall, sessionID: string): Promise<void> {
    if (inFlight.has(sessionID)) return;
    inFlight.add(sessionID);

    try {
      const chain = await getVisionChain();

      if (state.nextIndex >= chain.length || state.nextIndex >= opts.maxAttempts) {
        pending.delete(sessionID);
        log(`chain exhausted for session ${sessionID}`);
        return;
      }

      const next = chain[state.nextIndex];
      state.nextIndex += 1;
      log(`resending session ${sessionID} on ${next.providerID}/${next.modelID}`);

      try {
        await client.session.prompt({
          path: { id: sessionID },
          body: {
            model: { providerID: next.providerID, modelID: next.modelID },
            agent: state.agent,
            parts: state.parts as unknown as SessionPromptBody["parts"],
          },
        });
      } catch (err) {
        pending.delete(sessionID);
        log(`resend failed for session ${sessionID}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      pending.delete(sessionID);
      log(`unexpected error while routing session ${sessionID}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlight.delete(sessionID);
    }
  }

  return {
    "chat.message": async (input, output) => {
      const hasImage = output.parts.some(
        (p) => p.type === "file" && typeof p.mime === "string" && p.mime.startsWith("image/"),
      );

      if (!hasImage) {
        pending.delete(input.sessionID);
        return;
      }

      pending.set(input.sessionID, {
        agent: input.agent,
        parts: output.parts,
        nextIndex: 0,
      });
    },

    event: async ({ event }: { event: OpenCodeEvent }) => {
      if (event.type === "message.updated") {
        const info = event.properties.info;
        if (info.role === "assistant" && !info.error) {
          pending.delete(info.sessionID);
        }
        return;
      }

      if (event.type !== "session.error") return;

      const sessionID = event.properties.sessionID;
      if (!sessionID) return;

      const state = pending.get(sessionID);
      if (!state) return;

      await resend(state, sessionID);
    },
  };
}

export function createVisionRouter(options: VisionRouterOptions = {}): Plugin {
  const opts = normalizeOptions(options);
  return async ({ client }) => makeVisionRouter(client, opts);
}

export const VisionRouterPlugin: Plugin = async (input, rawOptions) =>
  makeVisionRouter(input.client, normalizeOptions(rawOptions as VisionRouterOptions | undefined));

export default VisionRouterPlugin;