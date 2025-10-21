// Handle sending message (UPDATED)
async function sendMessage() {
  const text = chatMessage.value.trim();
  if (!text) return;

  userSay(text);
  chatMessage.value = "";

  // ... (Typing indicator logic is the same)
  const typing = document.createElement("div");
  typing.style.background = "#1346AF";
  typing.style.color = "white";
  typing.style.padding = "10px 14px";
  typing.style.borderRadius = "10px";
  typing.style.alignSelf = "flex-start";
  typing.style.maxWidth = "80%";
  typing.innerText = "typing...";
  chatArea.appendChild(typing);
  chatArea.scrollTop = chatArea.scrollHeight;

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    chatArea.removeChild(typing);

    if (!res.ok) {
      xavieySay("Oops! Couldn't reach Xaviey.ai. Try again later.");
      console.error("API error", await res.text());
      return;
    }

    // ⭐️ FIX: Read the response as JSON
    const data = await res.json();
    const replyText = data.reply || "Yo fam, something’s off 😅";
    const productList = data.products || [];

    // 1. Display the main text reply
    xavieySay(replyText);

    // 2. Display the products as cards (New Logic)
    if (productList.length > 0) {
      productList.forEach(product => {
        // Create a product card element (Example structure)
        const card = document.createElement("a");
        card.href = product.link || "#"; // Link to the product
        card.target = "_blank"; // Open in new tab
        card.style.display = "block";
        card.style.background = "#f7f7f7";
        card.style.border = "1px solid #eee";
        card.style.padding = "10px";
        card.style.borderRadius = "10px";
        card.style.marginTop = "10px";
        card.style.textDecoration = "none";
        card.style.color = "#333";
        card.style.boxShadow = "0 1px 5px rgba(0,0,0,0.05)";
        
        // Product image
        if (product.image) {
          const img = document.createElement("img");
          img.src = product.image;
          img.alt = product.name;
          img.style.width = "100%";
          img.style.height = "auto";
          img.style.maxHeight = "150px";
          img.style.objectFit = "contain";
          img.style.borderRadius = "5px";
          img.style.marginBottom = "5px";
          card.appendChild(img);
        }

        // Product name
        const name = document.createElement("div");
        name.style.fontWeight = "bold";
        name.innerText = product.name;
        card.appendChild(name);

        // Product price
        const price = document.createElement("div");
        price.innerHTML = product.price || "Price available in store";
        price.style.color = "#1346AF";
        card.appendChild(price);

        chatArea.appendChild(card);
      });
      chatArea.scrollTop = chatArea.scrollHeight;
    }

  } catch (err) {
    chatArea.removeChild(typing);
    xavieySay("Something went wrong. Try again later.");
    console.error(err);
  }
}
