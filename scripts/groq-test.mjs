import { createOpencodeClient } from "@opencode-ai/sdk";
import { buildVisionChain } from "../dist/vision.js";

const BASE_URL = process.env.OPENCODE_URL ?? "http://127.0.0.1:10999";
const client = createOpencodeClient({ baseUrl: BASE_URL });

const res = await client.provider.list();
const { all, connected } = res.data ?? { all: [], connected: [] };
console.log("connected:", connected);
for (const p of all) {
  if (!connected.includes(p.id)) continue;
  for (const [id, m] of Object.entries(p.models)) {
    const vision =
      m.attachment === true ||
      (Array.isArray(m.modalities?.input) && m.modalities.input.includes("image")) ||
      m.capabilities?.input?.image === true;
    if (vision) console.log(`vision: ${p.id}/${id} attachment=${m.attachment} modalities=${JSON.stringify(m.modalities?.input)} cost=${m.cost?.input}`);
  }
}

const chain = buildVisionChain(all, connected, { preferProviders: ["groq"] });
console.log("\nchain:", chain);
