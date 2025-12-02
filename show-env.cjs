const fs = require("fs");

console.log("=== RAW FILE CONTENT ===");
const raw = fs.readFileSync(".env.local", "utf8");
console.log(raw);

console.log("\n=== PARSED BY DOTENV ===");
require("dotenv").config({ path: ".env.local" });
console.log(process.env);
