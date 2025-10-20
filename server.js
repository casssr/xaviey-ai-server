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

// AI route
app.post("/api/xaviey", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ reply: "Send me a message!", products: [] });

  try {
    const products = await fetchProducts();

    const systemPrompt = `
You are Xaviey.ai, a Gen Z fashion assistant for Xaviey.com.ng.
You help users pick stylish outfits and accessories from the WooCommerce product list.
Reply in short, fun, conversational Gen Z tone.
When recommending products, only include items that exist in the products JSON.
Return response as JSON with fields:
{
  "reply": "string",
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
      // fallback if AI response is not valid JSON
      replyObj = { reply: aiData.choices[0].message.content || "Yo fam, I’m lost 😅", products: [] };
    }

    // Filter AI products against actual store products
    if (replyObj.products && replyObj.products.length) {
      replyObj.products = replyObj.products.map(p => {
        const match = products.find(prod => prod.name.toLowerCase() === p.name.toLowerCase());
        return match
          ? {
              name: match.name,
              image: match.images?.[0]?.src || "",
              price: match.prices?.price || match.price_html || "",
              link: match.permalink || "",
            }
          : null;
      }).filter(Boolean);
    }

    res.json(replyObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Server error, try again later 😅", products: [] });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Xaviey.ai API running on port ${PORT}`));
