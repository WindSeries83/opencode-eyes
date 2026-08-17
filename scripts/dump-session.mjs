import { createOpencodeClient } from "@opencode-ai/sdk";
const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:10999" });
const res = await client.session.messages({ path: { id: "ses_fee112724ffeoe9Nim7ON28wju" } });
for (const m of res.data ?? []) {
  const role = m.info?.role ?? "?";
  const model = m.info?.modelID ?? "";
  const err = m.info?.error ? JSON.stringify(m.info.error) : "";
  const text = m.parts?.filter((p) => p.type === "text").map((p) => String(p.text ?? "")).join(" ").slice(0, 300) ?? "";
  const files = (m.parts ?? []).filter((p) => p.type === "file").length;
  console.log(`--- ${role} ${model} ${err} files=${files}\n${text}`);
}
