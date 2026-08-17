# opencode-eyes

An OpenCode plugin that gives every agent automatic vision, no matter which model it's running.

If an agent receives an image and its current model can't see, the plugin catches the failure and
silently replays the message on the next model in a cost-ordered fallback chain — cheapest
vision-capable model first, escalating only on failure. No manual model switching, no dedicated
"vision agent" to remember to call.

> 🇫🇷 [Lire en français](README.fr.md)

## How it works

1. On every incoming message, the plugin checks the attached parts for an image (`mime` starting
   with `image/`).
2. If found, it records the session as "vision pending."
3. If OpenCode reports a `session.error` for that session, the plugin looks up all models from your
   **connected** providers that can accept images, sorts them by input cost, and resends the same
   message via `client.session.prompt()` on the next model in that list.
4. It stops after the chain is exhausted or after `maxAttempts`.

Vision capability is detected from the live provider data (`attachment: true`, `modalities.input`
containing `"image"`, or legacy `capabilities.input.image`). Nothing is hardcoded, so the chain
always reflects whatever providers you actually have configured and authenticated in OpenCode.

## Install

### From npm (recommended)

```jsonc
// opencode.jsonc
{
  "plugin": ["opencode-eyes"]
}
```

### Local (testing, no publish needed)

Drop a loader file in OpenCode's global plugin directory:

`~/.config/opencode/plugins/eyes.js`
```js
export { VisionRouterPlugin } from "file:///absolute/path/to/opencode-eyes/dist/index.js";
```

Then `npm install && npm run build` in this repo. OpenCode auto-loads any `.js`/`.ts` file placed in
`~/.config/opencode/plugins/` at startup — no config file changes needed.

## Configuration

The default `VisionRouterPlugin` needs no configuration. For fine-grained control, register the
plugin programmatically with options:

```ts
// my-plugin.ts
import { createVisionRouter } from "opencode-eyes";

export const VisionRouterPlugin = createVisionRouter({
  maxAttempts: 3,               // max fallback resends per image (default 4)
  maxCost: 5,                   // skip models whose input cost exceeds this (default: no cap)
  preferProviders: ["groq"],    // route these providers' models first, cost order preserved inside (default: [])
  excludeProviders: ["local"],  // never route to these providers (default: [])
  excludeModels: ["openai/gpt-4o", "claude-sonnet"], // bare id or "providerID/modelID" (default: [])
  cacheMs: 300_000,             // how long the model chain is cached (default 5 min)
  debug: false,                 // log routing decisions to stderr (default false)
});
```

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

## Behavior notes

- If a resend itself fails (provider down, invalid request), the plugin stops routing that session
  rather than retrying blindly.
- Providers listed in `preferProviders` always come first in the chain, cheapest within the group
  first. Useful for free tiers (e.g. Groq): free models are tried before any paid fallback.
- Concurrent `session.error` events for the same session are deduped.
- The `maxAttempts` cap applies per image message; a new image message re-arms the pending state.

## License

MIT
