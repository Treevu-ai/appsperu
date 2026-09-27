const http = require("http");
http.get("http://127.0.0.1:4036/health", (res) => {
  console.log("Status:", res.statusCode);
  res.on("data", (d) => {
    process.stdout.write(d);
  });
  res.on("end", () => {
    process.exit();
  });
}).on("error", (err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
