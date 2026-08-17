#!/usr/bin/env node
// End-to-end check against a live OpenCode instance.
//
// Prerequises:
//   1. The plugin is installed in OpenCode (see README -> "Local install").
//   2. An OpenCode server is running and reachable via OPENCODE_URL
//      (default: http://127.0.0.1:10999).
//
// Run:
//   node scripts/e2e.mjs
//
// It builds a tiny PNG fixture, sends it in a fresh session, and waits for the
// assistant to answer. On success it prints the model that handled the image
// (the router should have picked a vision-capable model) and exits 0.

import { createOpencodeClient } from "@opencode-ai/sdk";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.OPENCODE_URL ?? "http://127.0.0.1:10999";
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 120_000);
const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures", "sample.png");

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const scanline = Buffer.from([0, 255, 0, 0]);
  const idat = deflateSync(scanline);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, makePng());
  console.log(`[e2e] fixture written to ${fixturePath}`);

  const client = createOpencodeClient({ baseUrl: BASE_URL, directory: process.cwd() });

  const created = await client.session.create({ body: { title: "vision-router e2e" } });
  const sessionID = created.data?.id;
  if (!sessionID) throw new Error("could not create a session");

  console.log(`[e2e] session ${sessionID}`);
  await client.session.prompt({
    path: { id: sessionID },
    body: {
      parts: [
        { type: "text", text: "This is a vision test. Describe exactly what color the single pixel in the attached image is." },
        { type: "file", mime: "image/png", filename: "sample.png", url: `file://${fixturePath.replaceAll("\\", "/")}` },
      ],
    },
  });

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await client.session.messages({ path: { id: sessionID } });
    const messages = res.data ?? [];
    const assistant = messages.findLast((m) => m.info?.role === "assistant");
    if (assistant) {
      if (assistant.info.error) {
        console.error(`[e2e] assistant errored: ${assistant.info.error.message ?? JSON.stringify(assistant.info.error)}`);
        process.exit(1);
      }
      console.log(`[e2e] assistant answered on ${assistant.info.providerID}/${assistant.info.modelID}`);
      console.log("[e2e] ok");
      process.exit(0);
    }
    await sleep(1000);
  }

  console.error(`[e2e] timed out after ${TIMEOUT_MS}ms waiting for an assistant reply`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`[e2e] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});