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
  const { message, context } = req.body;

  try {
    const products = await fetchProducts();
    const systemPrompt = `
You are Xaviey.ai, a Gen Z fashion assistant for Xaviey.com.ng.
You help users pick stylish outfits and accessories from the WooCommerce product list.
You reply in short, fun, conversational Gen Z tone.
If user asks for a drip or outfit, recommend 3-5 matching products (hoodies, perfumes, shoes, accessories, etc).
Return response as JSON with fields:
- reply (string)
- products (array of matching products with name, image, price, and link).
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
    const reply = aiData?.choices?.[0]?.message?.content || "Yo fam, I’m lost rn 😅";

    // Simple product match (optional)
    const matches = products.slice(0, 5).map((p) => ({
      name: p.name,
      price: p.prices?.price || p.price_html || "",
      image: p.images?.[0]?.src || "",
      link: p.permalink || "",
    }));

    res.json({ reply, products: matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Xaviey.ai API running on port ${PORT}`));
