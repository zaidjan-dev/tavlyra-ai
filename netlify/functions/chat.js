// Tavlyra AI - Netlify Function with model fallback
// Required Netlify secret: GEMINI_API_KEY
// Optional Netlify variable: GEMINI_MODEL (defaults to gemini-3.8-flash)

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed. Please send a POST request." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respond(503, { error: "GEMINI_API_KEY is missing in Netlify Keys and secrets. Save it and redeploy." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Request body is not valid JSON." });
  }

  const message = String(body.message || "").trim();
  if (!message) return respond(400, { error: "Please enter a message." });
  if (message.length > 8000) return respond(413, { error: "Message is too long. Please keep it under 8,000 characters." });

  const language = ["English", "Urdu", "Roman Urdu"].includes(body.language) ? body.language : "Auto";
  const contents = [];
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  for (const item of history) {
    if (!item || !["user", "model"].includes(item.role) || !Array.isArray(item.parts)) continue;
    const parts = item.parts
      .filter(part => part && typeof part.text === "string")
      .slice(0, 1)
      .map(part => ({ text: part.text.slice(0, 4000) }));
    if (parts.length) contents.push({ role: item.role, parts });
  }

  contents.push({
    role: "user",
    parts: [{
      text: `You are Tavlyra AI, a helpful AI assistant. Answer clearly and practically. Reply in ${language === "Auto" ? "the same language as the user's message" : language}. If the user writes Roman Urdu, reply in Roman Urdu.\n\nUser message: ${message}`
    }]
  });

  const primaryModel = String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  // Fallback is used only if the primary model reports temporary overload (503/504).
  const models = [primaryModel, "gemini-3.1-flash-lite"].filter((value, index, array) => array.indexOf(value) === index);
  let lastError = "Gemini is temporarily unavailable.";

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
          }),
          signal: controller.signal
        }
      );

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        lastError = "Gemini returned an unreadable response.";
        if (index < models.length - 1) continue;
        return respond(502, { error: lastError });
      }

      if (!response.ok) {
        lastError = data?.error?.message || `Gemini returned HTTP ${response.status}.`;
        if ((response.status === 503 || response.status === 504) && index < models.length - 1) {
          continue;
        }
        return respond(response.status, { error: lastError });
      }

      const reply = (data.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) return respond(502, { error: "Gemini returned an empty answer. Please try again." });
      return respond(200, { reply });
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? "Gemini took too long to respond."
        : "Could not connect to Gemini.";
      if (index === models.length - 1) {
        return respond(504, { error: `${lastError} Please try again shortly.` });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return respond(503, { error: lastError });
};
  
