const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VECTOR_URL = process.env.VECTOR_URL || "http://localhost:9292/logs";
const SERVICE_NAME = process.env.SERVICE_NAME || "demo-app";

// In-memory to-do list
const todos = [];
let nextId = 1;

// ── Logger ────────────────────────────────────────────────────────────────────
function log(level, message, extra = {}) {
  const event = {
    service: SERVICE_NAME,
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  // Print to stdout (visible in Railway logs)
  console.log(JSON.stringify(event));
  // Ship to Vector → Parseable (fire and forget)
  fetch(VECTOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([event]),
  }).catch(() => {});
}

// ── Middleware: log every request ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.on("finish", () => {
    log("info", `${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
    });
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Todo API is running", todos: todos.length });
});

app.get("/todos", (req, res) => {
  log("info", "Fetched all todos", { count: todos.length });
  res.json(todos);
});

app.post("/todos", (req, res) => {
  const { title } = req.body;
  if (!title) {
    log("warn", "Create todo failed - missing title");
    return res.status(400).json({ error: "title is required" });
  }
  const todo = { id: nextId++, title, done: false };
  todos.push(todo);
  log("info", `Todo created: "${title}"`, { todo_id: todo.id });
  res.status(201).json(todo);
});

app.patch("/todos/:id", (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) {
    log("warn", `Todo not found: id=${req.params.id}`);
    return res.status(404).json({ error: "not found" });
  }
  todo.done = !todo.done;
  log("info", `Todo toggled: "${todo.title}" → done=${todo.done}`, { todo_id: todo.id });
  res.json(todo);
});

app.delete("/todos/:id", (req, res) => {
  const index = todos.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) {
    log("warn", `Delete failed - todo not found: id=${req.params.id}`);
    return res.status(404).json({ error: "not found" });
  }
  const [removed] = todos.splice(index, 1);
  log("info", `Todo deleted: "${removed.title}"`, { todo_id: removed.id });
  res.json({ deleted: removed });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  log("info", `Server started on port ${PORT}`);
});
