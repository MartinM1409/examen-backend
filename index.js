// index.js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: "https://martinm1409.github.io" // permite acces doar din frontend-ul tău
}));
app.use(express.json());

// Endpoint test
app.get("/", (req, res) => {
  res.send("Backend funcționează!");
});

// Endpoint login (exemplu simplu)
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if(username === "admin" && password === "1234") {
    res.json({ success: true, message: "Autentificat cu succes" });
  } else {
    res.status(401).json({ success: false, message: "Date invalide" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serverul rulează pe portul ${PORT}`);
});
