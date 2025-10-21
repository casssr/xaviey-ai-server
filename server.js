import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const STORE_PRODUCTS_URL = process.env.STORE_PRODUCTS_URL;

// ✅ Fetch products from your WooCommerce store
async function fetchProducts() {
  try {
    const res = await fetch(STORE_PRODUCTS_URL);
    if (!res.ok) throw new Error("Failed to fetch products");
    return await res.json();
  } catch (err) {
    console.error("Product fetch error:", err);
    return [];
  }
}

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Xaviey.ai server is live! POST to /api/xaviey to chat with Gemini AI.");
});

// ✅ Main AI route
app.post("/api/xaviey", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.send(replyText);

  try {
    const products = await fetchProducts();

    const systemPrompt = `
You are Xaviey.ai — a Gen Z personal fashion assistant for Xaviey.com.ng 🛍️.
You talk casually and fun, like a cool stylist helping someone pick outfits.
You DO NOT return raw JSON, code blocks, or curly braces in your message.
Just reply naturally like a chat message.

If the user is asking for product suggestions (like hoodies, anime, sneakers, etc.):
- Respond naturally first (e.g. "Bet! I got some fire hoodies 🔥")
- Then include up to 5 products that match their vibe, in your reasoning.
- The backend will handle sending them properly, so don’t return any JSON text.

Products list (for your reference only):
${JSON.stringify(products.slice(0, 10))}
`;

    // Send the message to Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\nUser: ${message}\nXaviey.ai:` }],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const aiMessage =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Yo fam, something’s off 😅";

    // 🧠 Check if the AI message looks like JSON or a normal chat
    let replyText = aiMessage;
    let productList = [];

    // If the AI somehow returned JSON (rare), parse it safely
    if (aiMessage.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(aiMessage);
        replyText = parsed.reply || aiMessage;
        productList = parsed.products || [];
      } catch {
        replyText = aiMessage;
      }
    }

    // ✅ Match AI-mentioned products with real store products (for cards)
    if (productList.length) {
      productList = productList
        .map((p) => {
          const match = products.find(
            (prod) =>
              prod.name.toLowerCase().includes(p.name.toLowerCase()) ||
              p.name.toLowerCase().includes(prod.name.toLowerCase())
          );
          return match
            ? {
                name: match.name,
                image: match.images?.[0]?.src || "",
                price: match.prices?.price || match.price_html || "",
                link: match.permalink || "",
              }
            : null;
        })
        .filter(Boolean);
    }

    // ✅ Send back a clean object
    res.json({
      reply: replyText,
      products: productList,
    });
  } catch (err) {
    console.error("AI error:", err);
    res
      .status(500)
      .json({ reply: "Server error, try again later 😅", products: [] });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`✅ Xaviey.ai backend running on port ${PORT}`)
);

