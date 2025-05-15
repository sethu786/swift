const express = require("express");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize DB
const db = new sqlite3.Database("./users.db");

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    username TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    street TEXT,
    suite TEXT,
    city TEXT,
    zipcode TEXT,
    lat TEXT,
    lng TEXT,
    companyName TEXT,
    catchPhrase TEXT,
    bs TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    userId INTEGER,
    title TEXT,
    body TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    postId INTEGER,
    name TEXT,
    email TEXT,
    body TEXT
  )`);
});

// Load 10 users, their posts & comments
app.get("/load", async (req, res) => {
  try {
    const [usersRes, postsRes, commentsRes] = await Promise.all([
      axios.get("https://jsonplaceholder.typicode.com/users"),
      axios.get("https://jsonplaceholder.typicode.com/posts"),
      axios.get("https://jsonplaceholder.typicode.com/comments"),
    ]);

    const users = usersRes.data.slice(0, 10);
    const posts = postsRes.data;
    const comments = commentsRes.data;

    db.serialize(() => {
      users.forEach((user) => {
        const {
          id, name, username, email, phone, website,
          address, company,
        } = user;

        db.run(`INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, name, username, email, phone, website,
            address.street, address.suite, address.city, address.zipcode,
            address.geo.lat, address.geo.lng,
            company.name, company.catchPhrase, company.bs
          ]
        );

        posts
          .filter(p => p.userId === id)
          .forEach(post => {
            db.run(`INSERT OR IGNORE INTO posts VALUES (?, ?, ?, ?)`, [post.id, post.userId, post.title, post.body]);

            comments
              .filter(c => c.postId === post.id)
              .forEach(comment => {
                db.run(`INSERT OR IGNORE INTO comments VALUES (?, ?, ?, ?, ?)`,
                  [comment.id, comment.postId, comment.name, comment.email, comment.body]
                );
              });
          });
      });
    });

    res.status(200).send(); // Empty 200 response
  } catch (err) {
    res.status(500).json({ error: "Failed to load data." });
  }
});

// Delete all users
app.delete("/users", (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM users");
    db.run("DELETE FROM posts");
    db.run("DELETE FROM comments");
  });
  res.json({ message: "All users deleted" });
});

// Delete specific user
app.delete("/users/:id", (req, res) => {
  const userId = req.params.id;
  db.serialize(() => {
    db.run("DELETE FROM comments WHERE postId IN (SELECT id FROM posts WHERE userId = ?)", [userId]);
    db.run("DELETE FROM posts WHERE userId = ?", [userId]);
    db.run("DELETE FROM users WHERE id = ?", [userId], function (err) {
      if (this.changes === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ message: "User deleted" });
    });
  });
});

// Get user with posts and comments
app.get("/users/:id", (req, res) => {
  const userId = req.params.id;

  db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
    if (!user) return res.status(404).json({ error: "User not found" });

    db.all("SELECT * FROM posts WHERE userId = ?", [userId], (err, posts) => {
      if (err) return res.status(500).json({ error: "Failed to get posts" });

      const postIds = posts.map(p => p.id);
      db.all(
        `SELECT * FROM comments WHERE postId IN (${postIds.map(() => "?").join(",")})`,
        postIds,
        (err, comments) => {
          posts.forEach(post => {
            post.comments = comments.filter(c => c.postId === post.id);
          });

          res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            address: {
              street: user.street,
              suite: user.suite,
              city: user.city,
              zipcode: user.zipcode,
              geo: { lat: user.lat, lng: user.lng }
            },
            phone: user.phone,
            website: user.website,
            company: {
              name: user.companyName,
              catchPhrase: user.catchPhrase,
              bs: user.bs
            },
            posts
          });
        }
      );
    });
  });
});

// PUT /users
app.put("/users", (req, res) => {
  const user = req.body;

  db.get("SELECT id FROM users WHERE id = ?", [user.id], (err, row) => {
    if (row) {
      return res.status(400).json({ error: "User already exists." });
    }

    const u = user;
    db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.id, u.name, u.username, u.email, u.phone, u.website,
        u.address.street, u.address.suite, u.address.city, u.address.zipcode,
        u.address.geo.lat, u.address.geo.lng,
        u.company.name, u.company.catchPhrase, u.company.bs
      ]
    );

    u.posts.forEach(post => {
      db.run("INSERT INTO posts VALUES (?, ?, ?, ?)", [post.id, u.id, post.title, post.body]);
      post.comments.forEach(comment => {
        db.run("INSERT INTO comments VALUES (?, ?, ?, ?, ?)", [comment.id, post.id, comment.name, comment.email, comment.body]);
      });
    });

    res.status(201).json(user);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
