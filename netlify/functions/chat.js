// Tavlyra AI - Netlify Function
// Keep GEMINI_API_KEY in Netlify > Manage > Keys and secrets.
// This file runs on Netlify's server; never expose the API key in the browser.

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  const json = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed. Please send a POST request." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: "GEMINI_API_KEY is missing from Netlify Function environment variables. Add it under Manage > Keys and secrets, then redeploy."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "The request body is not valid JSON." });
  }

  const message = String(body.message || "").trim();
  if (!message) {
    return json(400, { error: "Please enter a message." });
  }
  if (message.length > 8000) {
    return json(413, { error: "Your message is too long. Please keep it under 8,000 characters." });
  }

  const language = ["English", "Urdu", "Roman Urdu"].includes(body.language)
    ? body.language
    : "Auto";

  // Keep only valid, recent conversation turns from the browser.
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const contents = [];

  for (const item of history) {
    if (!item || !["user", "model"].includes(item.role) || !Array.isArray(item.parts)) {
      continue;
    }

    const textParts = item.parts
      .filter((part) => part && typeof part.text === "string")
      .slice(0, 1)
      .map((part) => ({ text: part.text.slice(0, 6000) }));

    if (textParts.length) {
      contents.push({ role: item.role, parts: textParts });
    }
  }

  contents.push({
    role: "user",
    parts: [{
      text:
        `You are Tavlyra AI, a helpful independent AI assistant. ` +
        `Answer clearly, accurately, and practically. ` +
        `Respond in ${language === "Auto" ? "the same language as the user's message" : language}. ` +
        `If the user writes Roman Urdu, reply in Roman Urdu.\n\n` +
        `User message: ${message}`
    }]
  });

  const model = String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`;

  // Stop waiting before the platform's own request timeout and return a JSON error.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200
        }
      }),
      signal: controller.signal
    });

    const raw = await upstream.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return json(502, {
        error: "Gemini returned an unreadable response. Please try again in a moment."
      });
    }

    if (!upstream.ok) {
      const messageFromGoogle =
        data && data.error && typeof data.error.message === "string"
          ? data.error.message
          : `Gemini API returned HTTP ${upstream.status}.`;

      return json(upstream.status, { error: messageFromGoogle });
    }

    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      const reason = data.promptFeedback?.blockReason;
      return json(502, {
        error: reason
          ? `Gemini could not answer this prompt (${reason}). Please try rephrasing it.`
          : "Gemini returned an empty answer. Please try again."
      });
    }

    return json(200, { reply });
  } catch (error) {
    if (error && error.name === "AbortError") {
      return json(504, {
        error: "Gemini took too long to respond. Please try again."
      });
    }

    return json(502, {
      error: "Could not reach Gemini. Please check the API connection and try again."
    });
  } finally {
    clearTimeout(timeout);
  }
};
