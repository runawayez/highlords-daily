import { config } from "../config.mjs";
import { count } from "../engine/metrics.mjs";
import { limiter } from "../utils/concurrency.mjs";
const serial = limiter(1);
export function itemsSchema(properties, required = Object.keys(properties)) {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties,
          required,
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}
export async function requestChat(
  system,
  user,
  { schema = "json", timeoutMs = 150000 } = {},
) {
  return serial(async () => {
    const response = await fetch(`${config.ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        think: false,
        format: schema,
        keep_alive: config.ollamaKeepAlive,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        options: { temperature: 0.04 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    count("llmCalls");
    if (!response.ok)
      throw new Error(
        `Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`,
      );
    const payload = await response.json();
    for (const name of [
      "total_duration",
      "load_duration",
      "prompt_eval_count",
      "eval_count",
      "eval_duration",
    ])
      count(`ollama.${name}`, Number(payload[name] || 0));
    const content = payload.message?.content;
    if (typeof content !== "string")
      throw new Error("Ollama returned no content.");
    const value = JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
    if (schema !== "json") validateSchema(value, schema);
    return value;
  });
}

export function validateSchema(value, schema, location = "$") {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (
    !types.includes(type) &&
    !(
      types.includes("integer") &&
      typeof value === "number" &&
      Number.isInteger(value)
    )
  )
    throw new Error(`Invalid structured output at ${location}`);
  if (schema.enum && !schema.enum.includes(value))
    throw new Error(`Invalid enum at ${location}`);
  if (
    typeof value === "number" &&
    ((schema.minimum != null && value < schema.minimum) ||
      (schema.maximum != null && value > schema.maximum))
  )
    throw new Error(`Invalid score at ${location}`);
  if (type === "object") {
    for (const key of schema.required || [])
      if (!(key in value)) throw new Error(`Missing ${location}.${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key])
        validateSchema(item, schema.properties[key], `${location}.${key}`);
      else if (schema.additionalProperties === false)
        throw new Error(`Unexpected ${location}.${key}`);
    }
  }
  if (type === "array")
    for (let index = 0; index < value.length; index++)
      validateSchema(value[index], schema.items, `${location}[${index}]`);
  return value;
}
