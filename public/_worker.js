const visionPrompt =
  "Read this lab chemical container label. Extract the exact real chemical/product name, not grade/quality text such as ACS reagent, ReagentPlus, reagent grade, powder, 99+%, certified, for analysis, lot, expiry, or hazard text. Preserve full numbered names and salts exactly, for example Sodium 1-dodecanesulfonate must not be simplified to Sodium hydroxide or Sodium chloride. Return only compact JSON with keys: chemicalName, quantity, containerSize, unit, physicalState, manufacturer, catalogNumber, casNumber, unNumber, grade, confidence. unit must be one of g, kg, mL, L. physicalState must be Solid, Liquid, Gas, or Unknown.";

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/openai-vision") return handleVisionRequest(request, env);
    return env.ASSETS.fetch(request);
  },
};

export default worker;

async function handleVisionRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured" }, 503);

  try {
    const body = await request.json();
    if (!body.image || typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
      return json({ error: "A base64 image data URL is required" }, 400);
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: visionPrompt },
              { type: "input_image", image_url: body.image },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    return json(data, response.status);
  } catch {
    return json({ error: "Vision OCR proxy failed" }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
