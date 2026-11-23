exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 503, headers, body: JSON.stringify({ error: "Gemini API key is not configured yet." }) };
    }

    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "").trim();
    if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: "Message is required." }) };
    if (message.length > 8000) return { statusCode: 413, headers, body: JSON.stringify({ error: "Message is too long. Limit: 8,000 characters." }) };

    const lang = ["English", "Urdu", "Roman Urdu"].includes(body.language) ? body.language : "Auto";
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const contents = history
      .filter(x => x && ["user", "model"].includes(x.role) && Array.isArray(x.parts))
      .map(x => ({ role: x.role, parts: x.parts.slice(0, 1).map(p => ({ text: String(p.text || "").slice(0, 8000) })) }));
    contents.push({ role: "user", parts: [{ text: `Respond in ${lang} (if Auto, match the user's language). Be helpful, clear and honest. You are Tavlyra AI, an independent assistant.\n\nUser message: ${message}` }] });

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } })
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return { statusCode: upstream.status, headers, body: JSON.stringify({ error: data?.error?.message || "Gemini API request failed." }) };
    }
    const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!reply) return { statusCode: 502, headers, body: JSON.stringify({ error: "The AI returned an empty response. Try again." }) };
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error: " + (err?.message || "Unknown error") }) };
  }
};
