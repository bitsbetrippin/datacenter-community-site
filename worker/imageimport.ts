/**
 * Screenshot → calendar events (v1.0 Import center).
 *
 * Uses Cloudflare Workers AI (the `AI` binding in wrangler.jsonc — no API
 * keys, free tier included). A vision model reads a clearly-marked calendar
 * image and returns day/title candidates; the client then lets a human
 * review, adjust, and assign categories before anything is saved.
 * Only titles and dates are extracted by design — times stay open and the
 * event is flagged needs_attention for review.
 */
import { json, log } from "./lib/util";

const PROMPT = `You are reading a photo or screenshot of a wall/paper/app calendar.
Extract every clearly written event. Respond with ONLY a JSON array, no other text.
Each element: {"day": <day of month, integer>, "month": <month number 1-12 if visible, else null>, "title": "<the event text>"}
Rules:
- One element per written event. If the same text spans multiple days, one element per day.
- Ignore the day-of-week headers, the month title itself, and page furniture.
- Keep titles short, exactly as written (fix obvious OCR spacing only).
- If you can see the month name anywhere (e.g. "September 2026"), use it for "month".
- If nothing legible, return [].`;

/** Models to try, in order — first success wins. */
const VISION_MODELS = [
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@cf/llava-hf/llava-1.5-7b-hf",
];

interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface ImageCandidate {
  day: number;
  month: number | null;
  title: string;
}

function extractJsonArray(text: string): ImageCandidate[] {
  // Models wrap JSON in prose/fences more often than not — dig it out.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown[];
    return arr
      .map((x) => x as { day?: unknown; month?: unknown; title?: unknown })
      .filter((x) => typeof x.title === "string" && x.title.trim().length > 0)
      .map((x) => ({
        day: Math.max(1, Math.min(31, Number(x.day) || 1)),
        month:
          x.month === null || x.month === undefined || Number.isNaN(Number(x.month))
            ? null
            : Math.max(1, Math.min(12, Number(x.month))),
        title: String(x.title).trim().slice(0, 200),
      }))
      .slice(0, 200);
  } catch {
    return [];
  }
}

function responseText(result: unknown): string {
  if (typeof result === "string") return result;
  const r = result as { response?: string; description?: string; output_text?: string };
  return r.response ?? r.description ?? r.output_text ?? JSON.stringify(result);
}

export async function handleImageImport(
  request: Request,
  ai: AiBinding | undefined,
): Promise<Response> {
  if (!ai) {
    return json(
      {
        error: "workers_ai_not_enabled",
        detail:
          'Add  "ai": { "binding": "AI" }  to wrangler.jsonc and push — no keys or accounts needed.',
      },
      501,
    );
  }

  let body: { image?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const dataUrl = body.image ?? "";
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  if (!base64 || base64.length > 6_000_000) {
    return json({ error: "image_too_large", detail: "Keep screenshots under ~4 MB." }, 413);
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: "bad_image_encoding" }, 400);
  }

  const attempts: string[] = [];
  for (const model of VISION_MODELS) {
    try {
      // The two model families accept slightly different input shapes; this
      // union works for both current Workers AI vision models.
      const result = await ai.run(model, {
        image: Array.from(bytes),
        prompt: PROMPT,
        max_tokens: 1024,
      });
      const events = extractJsonArray(responseText(result));
      log({ api: "import_image", model, candidates: events.length });
      if (events.length > 0) {
        return json({ ok: true, model, events });
      }
      attempts.push(`${model}: no events recognized`);
    } catch (e) {
      attempts.push(`${model}: ${String(e).slice(0, 120)}`);
    }
  }
  log({ api: "import_image", ok: false, attempts });
  return json(
    {
      error: "no_events_recognized",
      detail:
        "The image reader couldn't find clearly marked events. Try a sharper, tighter screenshot of the calendar grid — or add the events with Quick add.",
      attempts,
    },
    422,
  );
}
