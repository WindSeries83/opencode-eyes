# 👁️ opencode-eyes

**Give every agent eyes. Automatically.**

[![npm version](https://img.shields.io/npm/v/opencode-eyes)](https://www.npmjs.com/package/opencode-eyes)
[![license](https://img.shields.io/npm/l/opencode-eyes)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/WindSeries83/opencode-eyes/ci.yml)](https://github.com/WindSeries83/opencode-eyes/actions)

> 🇫🇷 [Lire en français](README.fr.md)

## The problem

You send your agent a screenshot, a diagram, a mockup. It fails. Not because the task is hard —
because **your model is blind**. So you switch models manually, or you spin up a separate
"vision agent" that you have to remember to call, or you hope the model does its best guessing
at the alt text. Every one of those is a productivity tax you pay on every single image.

## What opencode-eyes does

It sits inside OpenCode and watches. The moment a message with an image fails, it **silently
replays it on a vision-capable model** — the cheapest one available. No manual switching, no
dedicated agent to call, no config to write. You send the screenshot. It just works.

```text
You                OpenCode                    opencode-eyes
 │  paste image      │                               │
 │──────────────────►│  agent (blind model)          │
 │                   │──────────────────────────────►│  "image detected, armed"
 │                   │◄──────────────────────────────│
 │                   │  ❌ session.error             │
 │                   │──────────────────────────────►│  "replaying on groq/llama-4-maverick (free)"
 │                   │  ✅ answer with full vision   │
 │◄──────────────────│                               │
```

## Why it's better than the alternatives

| Approach | You have to | Cost |
|---|---|---|
| **opencode-eyes** | Nothing. Install and forget. | Cheapest vision model first, escalates only on failure |
| Manual model switch | Notice the failure, change the model, resend | Your time, every time |
| Dedicated "vision agent" | Remember to route to it, manage its context | Your time + context debt |
| Hardcoded vision model list | Keep it in sync with your providers | Wrong the day you add a provider |

**No other OpenCode plugin does this automatically.** We searched. Others need configuration,
target a single provider, or die on a stale model list. opencode-eyes discovers your models
live — nothing hardcoded, nothing to maintain.

## Facts, not promises

- **Zero configuration.** `"plugin": ["opencode-eyes"]` and it works.
- **Works with any provider** — OpenAI, Anthropic, Groq, Google, local models. The chain is
  built from the *live* provider list of your OpenCode instance, so it always matches what you
  actually have connected and authenticated.
- **Groq first by default.** Groq's free vision models are tried before any paid fallback, out of
  the box. Set `maxCost` to never exceed a budget. Your wallet decides.
- **Fail-safe.** If a resend itself fails (provider down, bad request), it stops routing that
  session instead of hammering blindly. Concurrent errors are deduped. No error storms, no loops.
- **Tiny.** 18 kB on disk, one dependency. Nothing to maintain, nothing to audit twice.
- **Tested.** 26 unit tests, typecheck, CI on every push. MIT licensed.

## Install

### From npm (recommended)

```jsonc
// opencode.jsonc
{
  "plugin": ["opencode-eyes"]
}
```

Restart OpenCode. Done.

### Local (testing, no publish needed)

Drop a loader file in OpenCode's global plugin directory:

`~/.config/opencode/plugins/eyes.js`
```js
export { VisionRouterPlugin } from "file:///absolute/path/to/opencode-eyes/dist/index.js";
```

Then `npm install && npm run build` in this repo. OpenCode auto-loads any `.js`/`.ts` file placed
in `~/.config/opencode/plugins/` at startup — no config file changes needed.

## Try it in 30 seconds

1. Install the plugin, restart OpenCode.
2. Set your favorite model as default — even a cheap text-only one.
3. Paste a screenshot into a session and ask a question about it.

If your default model can't see, you get a vision-capable model's answer instead of an error.
That's the whole demo.

## Configuration

The default `VisionRouterPlugin` needs no configuration. For fine-grained control, register the
plugin programmatically with options:

```ts
// my-plugin.ts
import { createVisionRouter } from "opencode-eyes";

export const VisionRouterPlugin = createVisionRouter({
  maxAttempts: 3,               // max fallback resends per image (default 4)
  maxCost: 5,                   // skip models whose input cost exceeds this (default: no cap)
  preferProviders: ["groq"],    // route these providers' models first, cost order preserved inside (default: ["groq"] — pass [] to disable)
  excludeProviders: ["local"],  // never route to these providers (default: [])
  excludeModels: ["openai/gpt-4o", "claude-sonnet"], // bare id or "providerID/modelID" (default: [])
  cacheMs: 300_000,             // how long the model chain is cached (default 5 min)
  debug: false,                 // log routing decisions to stderr (default false)
});
```

## How it works

1. On every incoming message, the plugin checks the attached parts for an image (`mime` starting
   with `image/`).
2. If found, it records the session as "vision pending."
3. If OpenCode reports a `session.error` for that session, the plugin looks up all models from
   your **connected** providers that can accept images, sorts them by input cost, and resends the
   same message via `client.session.prompt()` on the next model in that list.
4. It stops after the chain is exhausted or after `maxAttempts`.

Vision capability is detected from the live provider data (`attachment: true`, `modalities.input`
containing `"image"`, or legacy `capabilities.input.image`). Nothing is hardcoded, so the chain
always reflects whatever providers you actually have configured and authenticated in OpenCode.

## Behavior notes

- If a resend itself fails (provider down, invalid request), the plugin stops routing that session
  rather than retrying blindly.
- Providers listed in `preferProviders` always come first in the chain, cheapest within the group
  first. Groq is preferred by default so its free models are tried before any paid fallback.
- Concurrent `session.error` events for the same session are deduped.
- The `maxAttempts` cap applies per image message; a new image message re-arms the pending state.

## Development

```sh
npm install
npm test            # unit tests (vitest)
npm run typecheck   # typecheck src + tests
npm run build       # compile to dist/
```

### End-to-end check

With the plugin loaded into a running OpenCode server:

```sh
OPENCODE_URL=http://127.0.0.1:10999 node scripts/e2e.mjs
```

The script generates a sample PNG, sends it in a fresh session, waits for the assistant's reply,
and prints which model handled it — you should see a vision-capable model if your configured model
can't see images.

## License

MIT
