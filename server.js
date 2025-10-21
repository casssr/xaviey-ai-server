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
    // NOTE: Ensure your WooCommerce API endpoint returns product data directly.
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
  if (!message) return res.json({ reply: "Yo fam, what's the vibe? Say something!", products: [] });

  try {
    const products = await fetchProducts();
    // Only pass the names/vibe of the top 10 products to the AI
    const productInfo = products.slice(0, 10).map(p => p.name).join(", "); 


    const systemPrompt = `
You are Xaviey.ai — a Gen Z personal fashion assistant for Xaviey.com.ng 🛍️.
You talk casually and fun, like a cool stylist helping someone pick outfits.

Here is the list of products we have: ${productInfo}.
You **MUST ONLY** recommend products that are explicitly found in this list. 
If the user asks for a product type that is NOT in the list (like 't-shirt' when only 'hoodies' are available), politely pivot them back to what you *do* have.

Your response MUST be in two distinct parts:
1. The conversational chat reply (first paragraph).
2. A special, hidden list of the product names you mentioned, prefixed with '[[PRODUCTS:]]'.

DO NOT return raw JSON, code blocks, or curly braces in the conversational part.
If you do not recommend any products, you must still include '[[PRODUCTS:]]' followed by nothing.

Example 1 (Recommending):
Bet! I got some fire hoodies that match that vibe. Check out the One Piece and the Naruto ones below.
[[PRODUCTS:]]One Piece Hoodie, Naruto Hoodie

Example 2 (No Recommendation):
I'm just a chat bot, fam. What product can I help you find?
[[PRODUCTS:]]
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
          // Make sure the response is concise
          config: { temperature: 0.7 } 
        }),
      }
    );

    const data = await response.json();
    const aiMessage =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Yo fam, the AI's buggin' out 🐛. Try again.";

    // 🎯 NEW LOGIC: Use the hidden tag to separate chat from product list
    const productTag = "[[PRODUCTS:]]";
    let replyText = aiMessage;
    let rawProductNames = [];

    if (aiMessage.includes(productTag)) {
        // Split the message into the chat part and the product list part
        let parts = aiMessage.split(productTag).map(s => s.trim());
        
        replyText = parts[0] || aiMessage;
        
        // The product list part is everything after the tag
        if (parts.length > 1 && parts[1].length > 0) {
            // Split by comma and trim each name
            rawProductNames = parts[1].split(',').map(name => name.trim()).filter(name => name.length > 0);
        }
    }


    // ✅ Match AI-mentioned products with real store products (for cards)
    let productList = [];
    
    if (rawProductNames.length) {
      productList = rawProductNames
        .map((pName) => {
            // Find the product in your full list that matches the name the AI gave us
          const match = products.find(
            // Simple check: does the product name contain the raw name from the AI?
            (prod) => prod.name.toLowerCase().includes(pName.toLowerCase())
          );

          return match
            ? {
                name: match.name,
                id: match.id, // ID is crucial for Add to Cart
                image: match.images?.[0]?.src || "",
                price: match.price_html || "", // Use the formatted price HTML
                link: match.permalink || "#",
              }
            : null; // Filter out products not found
        })
        .filter(Boolean); // Remove any null entries (unmatched products)
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
