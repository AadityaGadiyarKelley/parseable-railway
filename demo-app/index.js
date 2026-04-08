const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VECTOR_URL = process.env.VECTOR_URL || "http://localhost:9292/logs";
const SERVICE_NAME = process.env.SERVICE_NAME || "demo-app";

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id    SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done  BOOLEAN NOT NULL DEFAULT false
    )
  `);
}

// ── Logger ────────────────────────────────────────────────────────────────────
function log(level, message, extra = {}) {
  const event = {
    service: SERVICE_NAME,
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  console.log(JSON.stringify(event));
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
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo App</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; padding: 40px 16px; }
    .container { background: white; border-radius: 12px; padding: 32px; width: 100%; max-width: 480px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
    .subtitle a { color: #6366f1; text-decoration: none; }
    .input-row { display: flex; gap: 8px; margin-bottom: 24px; }
    input { flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; outline: none; }
    input:focus { border-color: #6366f1; }
    button.add { background: #6366f1; color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 1rem; }
    button.add:hover { background: #4f46e5; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    li { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid #eee; border-radius: 8px; }
    li.done span { text-decoration: line-through; color: #aaa; }
    li span { flex: 1; font-size: 0.95rem; }
    button.toggle { background: none; border: 2px solid #6366f1; color: #6366f1; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 0.8rem; }
    button.toggle:hover { background: #6366f1; color: white; }
    button.del { background: none; border: 2px solid #f87171; color: #f87171; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 0.8rem; }
    button.del:hover { background: #f87171; color: white; }
    .empty { color: #bbb; text-align: center; padding: 24px 0; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Todo App</h1>
    <p class="subtitle">Every action is logged to <a href="${process.env.PARSEABLE_UI_URL || '#'}" target="_blank">Parseable</a> via Vector</p>
    <div class="input-row">
      <input id="input" type="text" placeholder="Add a new todo..." />
      <button class="add" onclick="addTodo()">Add</button>
    </div>
    <ul id="list"></ul>
    <p class="empty" id="empty">No todos yet. Add one above!</p>
  </div>
  <script>
    async function load() {
      const res = await fetch('/todos');
      const todos = await res.json();
      render(todos);
    }
    function render(todos) {
      const list = document.getElementById('list');
      const empty = document.getElementById('empty');
      list.innerHTML = '';
      empty.style.display = todos.length ? 'none' : 'block';
      todos.forEach(t => {
        const li = document.createElement('li');
        if (t.done) li.classList.add('done');
        li.innerHTML = \`
          <span>\${t.title}</span>
          <button class="toggle" onclick="toggle(\${t.id})">\${t.done ? 'Undo' : 'Done'}</button>
          <button class="del" onclick="del(\${t.id})">Delete</button>
        \`;
        list.appendChild(li);
      });
    }
    async function addTodo() {
      const input = document.getElementById('input');
      const title = input.value.trim();
      if (!title) return;
      await fetch('/todos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({title}) });
      input.value = '';
      load();
    }
    async function toggle(id) {
      await fetch('/todos/' + id, { method: 'PATCH' });
      load();
    }
    async function del(id) {
      await fetch('/todos/' + id, { method: 'DELETE' });
      load();
    }
    document.getElementById('input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
    load();
  </script>
</body>
</html>`);
});

app.get("/todos", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM todos ORDER BY id");
  log("info", "Fetched all todos", { count: rows.length });
  res.json(rows);
});

app.post("/todos", async (req, res) => {
  const { title } = req.body;
  if (!title) {
    log("warn", "Create todo failed - missing title");
    return res.status(400).json({ error: "title is required" });
  }
  const { rows } = await pool.query(
    "INSERT INTO todos (title) VALUES ($1) RETURNING *",
    [title]
  );
  log("info", `Todo created: "${title}"`, { todo_id: rows[0].id });
  res.status(201).json(rows[0]);
});

app.patch("/todos/:id", async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE todos SET done = NOT done WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (!rows.length) {
    log("warn", `Todo not found: id=${req.params.id}`);
    return res.status(404).json({ error: "not found" });
  }
  log("info", `Todo toggled: "${rows[0].title}" → done=${rows[0].done}`, { todo_id: rows[0].id, done: rows[0].done });
  res.json(rows[0]);
});

app.delete("/todos/:id", async (req, res) => {
  const { rows } = await pool.query(
    "DELETE FROM todos WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (!rows.length) {
    log("warn", `Delete failed - todo not found: id=${req.params.id}`);
    return res.status(404).json({ error: "not found" });
  }
  log("info", `Todo deleted: "${rows[0].title}"`, { todo_id: rows[0].id });
  res.json({ deleted: rows[0] });
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => {
      log("info", `Server started on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err.message);
    process.exit(1);
  });
