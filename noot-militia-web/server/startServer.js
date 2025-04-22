const { spawn } = require("child_process");
const matchingServer = require("./matchingServer");

// Start Next.js development server
const nextDev = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
});

// Handle process termination
process.on("SIGINT", () => {
  console.log("Shutting down servers...");
  nextDev.kill("SIGINT");
  process.exit();
});

console.log("Both WebSocket server and Next.js app are running!");
console.log("WebSocket server on port 8080");
console.log("Next.js app based on your configuration (default: 3000)");
