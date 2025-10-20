// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STORE_PRODUCTS_URL = process.env.STORE_PRODUCTS_URL;

// Helper to get products from WooCommerce Store API
async function fetchProducts() {
  try {
    const res = await fetch(STORE_PRODUCTS_URL);
    if (!res.ok) throw new Error("Failed to fetch products");
    return await res.json();
  } catch (e) {
    console.error("Product fetch error:", e);
    return [];
  }
}

app.post("/api/xaviey", async (req, res) => {
  const { message } = req.body;

  try {
    const products = await fetchProducts();

    const systemPrompt = `
You are Xaviey.ai, a Gen Z fashion assistant.
You help users pick stylish outfits from the product list.
Reply in a fun, short, conversational tone.
When recommending products, only include items that exist in the store JSON.
Return response as JSON:
{
  "reply": "your reply to the user",
  "products": [
    {"name":"", "image":"", "price":"", "link":""}
  ]
}
`;

    const chatBody = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    };

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(chatBody),
    });

    const aiData = await aiRes.json();
    let replyObj;

    try {
      replyObj = JSON.parse(aiData.choices[0].message.content);
    } catch {
      // fallback
      replyObj = { reply: aiData.choices[0].message.content || "Yo fam, I’m lost 😅", products: [] };
    }

    // Optional: ensure product links are valid
    if (replyObj.products && replyObj.products.length) {
      replyObj.products = replyObj.products.map(p => {
        const match = products.find(prod => prod.name.toLowerCase() === p.name.toLowerCase());
        return match ? {
          name: match.name,
          image: match.images?.[0]?.src || "",
          price: match.prices?.price || match.price_html || "",
          link: match.permalink || ""
        } : null;
      }).filter(Boolean);
    }

    res.json(replyObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Something went wrong", products: [] });
  }
});

const PORT = process.env.PORT || 8080;
// Root route to show server status
app.get("/", (req, res) => {
  res.send("✅ Xaviey.ai server is running! Use /api/xaviey to chat with the AI.");
});
app.listen(PORT, () => console.log(`✅ Xaviey.ai API running on port ${PORT}`));


