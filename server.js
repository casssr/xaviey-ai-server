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

// --- PRODUCT FETCHING & PRE-PROCESSING ---

// ✅ Fetch and process products from your WooCommerce store
async function fetchAndProcessProducts() {
    try {
        const res = await fetch(STORE_PRODUCTS_URL);
        if (!res.ok) throw new Error("Failed to fetch products");
        const rawProducts = await res.json();

        // Map and clean product data for use in the AI prompt and frontend matching
        const products = rawProducts.map(p => ({
            id: p.id,
            name: p.name,
            category_name: p.categories?.[0]?.name || 'Uncategorized', // Get primary category
            images: p.images,
            prices: p.prices,
            permalink: p.permalink
        }));
        
        return products;
    } catch (err) {
        console.error("Product fetch error:", err);
        return [];
    }
}

// --- AI LOGIC AND ROUTE ---

// ✅ Root route
app.get("/", (req, res) => {
    res.send("✅ Xaviey.ai server is live! POST to /api/xaviey to chat with Gemini AI.");
});

// ✅ Main AI route
app.post("/api/xaviey", async (req, res) => {
    // **IMPORTANT:** Assumes the front-end sends the full history array
    const { message, history = [] } = req.body; 
    
    if (!message) return res.send("Yo, what's up?");

    try {
        const allProducts = await fetchAndProcessProducts();
        const availableCategories = [...new Set(allProducts.map(p => p.category_name))];
        
        // Use only the first 10 products for the prompt (for token efficiency)
        const productsForPrompt = allProducts.slice(0, 10).map(p => ({
            name: p.name, 
            category: p.category_name,
            // Include ID to allow for potential use in advanced RAG/Function calling later
            id: p.id 
        }));

        // 1. BUILD THE SYSTEM PROMPT (Phase 1 & 2 Fixes)
        const systemPrompt = `
You are Xaviey.ai — a Gen Z personal fashion assistant and stylist for Xaviey.com.ng 🛍️.
Your personality is casual, fun, and cool. Your main goal is to recommend products and full outfits.
You DO NOT return raw JSON, code blocks, or curly braces in your message, UNLESS SPECIFIED BELOW.

**CURRENT AVAILABLE CATEGORIES:** ${availableCategories.join(', ')}.

**CRITICAL RULES:**
1.  **Product Scope:** You MUST **ONLY** suggest products or categories that are currently available on the site, as indicated by the "Products list" and "Available Categories". If a user asks for something unavailable (e.g., 'perfumes' when only 'Hoodies' are listed), politely decline and immediately re-route them back to available fashion items.
2.  **Styling/Outfit Request (JSON MANDATE):** If the user asks you to "style" them, suggests a full "outfit," or asks for a "link/buy" for a specific product, you MUST respond by returning a SINGLE, structured JSON object, and ONLY the JSON object.

**JSON Format (for Outfits/Direct Purchase):**
\`{"reply":"[Your chat message confirming the outfit or product]","products":[{"name":"[Full Product Name 1]"},{"name":"[Full Product Name 2]"}, ...] }\`
3.  **General Suggestion (Text Format):** If the user asks for a general category (like "hoodies"), respond naturally in plain text. You should mention product names in your reasoning.

Products list (for your reference only - top 10 items):
${JSON.stringify(productsForPrompt)}
`;
        
        // 2. BUILD THE MESSAGES ARRAY (Phase 1 Fix: History)
        const promptMessages = [];

        // 2a. Add System Prompt as the first user turn
        promptMessages.push({
            role: "user",
            parts: [{ text: systemPrompt }],
        });

        // 2b. Add History Messages
        // The frontend must send history in the format: [{"role": "user", "text": "..."}]
        history.forEach(turn => {
            promptMessages.push({
                role: turn.role, 
                parts: [{ text: turn.text }]
            });
        });

        // 2c. Add the Current User Message
        promptMessages.push({
            role: "user",
            parts: [{ text: message }],
        });
        
        // 2d. Add the Model's turn (to guide the response)
        promptMessages.push({
            role: "model",
            parts: [{ text: "Xaviey.ai:" }],
        });

        // 3. Send the message to Gemini
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: promptMessages, 
                    // Optional: Tune for less creativity/hallucination
                    config: {
                         temperature: 0.5 
                    }
                }),
            }
        );

        const data = await response.json();
        let aiMessage =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Yo fam, something’s off 😅";

        // 4. RESPONSE PARSING LOGIC (Phase 1 Fix: Cards/JSON)
        let replyText = aiMessage;
        let productList = []; // Array of {name: "...", id: "..."} from AI

        // Look for the required JSON block
        const jsonMatch = aiMessage.match(/(\{[\s\S]*?\})/); 

        if (jsonMatch && jsonMatch[0].trim().startsWith("{")) {
            try {
                // Remove JSON from the main reply text if it exists
                replyText = aiMessage.replace(jsonMatch[0], '').trim();
                
                // Parse the JSON object
                const parsed = JSON.parse(jsonMatch[0]);
                replyText = parsed.reply || replyText;
                productList = parsed.products || [];
                
            } catch (e) {
                console.error("JSON parsing error:", e);
                // If parsing failed, treat it as a plain text response
            }
        }
        
        // 5. MANUAL TEXT PARSING (Phase 1 Fix: Cards from text list)
        // If no JSON was returned (general suggestion), try to parse product names from the text
        if (productList.length === 0) {
            const allProductNames = allProducts.map(p => p.name);
            
            for (const name of allProductNames) {
                // Check if the product name (or a close variant) is mentioned in the reply
                if (aiMessage.toLowerCase().includes(name.toLowerCase()) || 
                    aiMessage.toLowerCase().includes(name.toLowerCase().split(' ')[0])) 
                {
                    // Add the actual name to ensure the correct match later
                    if (!productList.find(p => p.name === name)) {
                        productList.push({ name: name }); 
                    }
                }
            }
        }
        
        // 6. ✅ Match AI-mentioned products with real store products (for cards)
        let finalProductCards = [];

        if (productList.length) {
            finalProductCards = productList
                .map((p) => {
                    // Find the exact match using the name provided by the AI
                    const match = allProducts.find(
                        (prod) => prod.name === p.name 
                    );
                    
                    if (!match) return null;

                    // Return clean, structured data for the frontend
                    return {
                        id: match.id, // CRITICAL for Add to Cart/Add All
                        name: match.name,
                        image: match.images?.[0]?.src || "",
                        price: match.prices?.price || match.price_html || "",
                        link: match.permalink || "",
                    };
                })
                .filter(Boolean)
                // Limit to 5 cards max to keep the UI clean
                .slice(0, 5); 
        }

        // ✅ Send back a clean object
        res.json({
            reply: replyText,
            products: finalProductCards,
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
