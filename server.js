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

// ✅ Root route (for Render status check)
app.get("/", (req, res) => {
  res.send("✅ Xaviey.ai server is running! POST to /api/xaviey to chat with Gemini AI.");
});

// ✅ Main AI route
app.post("/api/xaviey", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ reply: "Send me a message!", products: [] });

  try {
    const products = await fetchProducts();

    const systemPrompt = `
You are Xaviey.ai, a Gen Z fashion assistant for Xaviey.com.ng.
Help users pick stylish outfits and accessories from the WooCommerce product list.
Reply in short, fun, conversational Gen Z tone.
When recommending products, only include items that exist in the products JSON.
Return response as JSON with fields:
{
  "reply": "string",
  "products": [
    {"name":"", "image":"", "price":"", "link":""}
  ]
}
Products JSON: ${JSON.stringify(products.slice(0, 10))}
`;

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
      "Yo fam, I’m lost 😅";

    let replyObj;
    try {
      replyObj = JSON.parse(aiMessage);
    } catch {
      replyObj = { reply: aiMessage, products: [] };
    }

    if (replyObj.products && replyObj.products.length) {
      replyObj.products = replyObj.products
        .map((p) => {
          const match = products.find(
            (prod) =>
              prod.name.toLowerCase() === p.name.toLowerCase()
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

    res.json(replyObj);
  } catch (err) {
    console.error("AI error:", err);
    res
      .status(500)
      .json({ reply: "Server error, try again later 😅", products: [] });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Xaviey.ai API running on port ${PORT}`));
