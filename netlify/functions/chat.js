exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { statusCode: 503, headers, body: JSON.stringify({ error: "OpenRouter API key is missing. Check Netlify Keys and secrets." }) };
    }

    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "").trim();
    if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: "Message is required." }) };
    if (message.length > 8000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: "Message is too long. Limit: 8,000 characters." }) };
    }

    const lang = ["English", "Urdu", "Roman Urdu"].includes(body.language)
      ? body.language
      : "the same language as the user's message";

    const messages = [{
      role: "system",
      content: `You are Tavlyra AI, a helpful, honest, friendly assistant. Respond in ${lang}. If the language is automatic, match the user's language. Give clear, useful answers.`
    }];

    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    for (const item of history) {
      if (!item || !["user", "model", "assistant"].includes(item.role)) continue;
      let content = Array.isArray(item.parts)
        ? item.parts.map(part => String(part && part.text || "")).join("\n")
        : String(item.content || "");
      content = content.trim().slice(0, 8000);
      if (content) messages.push({ role: item.role === "model" ? "assistant" : item.role, content });
    }
    messages.push({ role: "user", content: message });

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tavlyra-ai.netlify.app",
        "X-Title": "Tavlyra AI"
      },
      body: JSON.stringify({
        model: "google/gemma-4-26b-a4b-it:free",
        messages,
        temperature: 0.7,
        max_tokens: 1200
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = data && data.error && data.error.message
        ? data.error.message
        : `OpenRouter request failed (HTTP ${upstream.status}).`;
      return { statusCode: upstream.status, headers, body: JSON.stringify({ error: detail }) };
    }

    const content = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    const reply = Array.isArray(content)
      ? content.map(part => typeof part === "string" ? part : (part.text || "")).join("").trim()
      : String(content || "").trim();

    if (!reply) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "The AI returned an empty response. Please try again." }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error: " + (err && err.message ? err.message : "Unknown error") })
    };
  }
};
  
