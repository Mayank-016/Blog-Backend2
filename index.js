const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const app = express();
const mysql2 = require("mysql2");
const session = require("express-session");
const crypto = require("crypto");

const generateSecretKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

const secretKey = generateSecretKey();

app.use(express.json());
app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: false,
  })
);

const connection = mysql2.createConnection({
  host: "db4free.net",
  user: "root_user007",
  password: "#*Kt$2XQSaNhj@6",
  database: "backend",
  port: 3306,
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to mysql2:", err);
    return;
  }
  console.log("Connected to mysql2");
});

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});
const upload = multer({
  storage,
});

const isLoggedIn = (req, res, next) => {
  if (req.session.loggedIn) {
    // User is logged in
    next();
  } else {
    // User is not logged in
    res.status(401).send("Unauthorized");
  }
};

// Signup endpoint
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);
    // Insert new user into the database
    const query = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
    connection.query(query, [name, email, hashedPassword], (err, result) => {
      if (err) {
        console.error("Error creating user:", err);
        res.status(500).send("Internal server error");
        return;
      }
      res.status(201).send("User created");
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Login endpoint
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // Retrieve the user from the database
    const query = "SELECT * FROM users WHERE email = ?";
    connection.query(query, [email], async (err, results) => {
      if (err) {
        console.error("Error retrieving user:", err);
        res.status(500).send("Internal server error");
        return;
      }
      const user = results[0];
      if (!user) {
        return res.status(401).send("Invalid credentials");
      }
      // Compare the password using bcrypt
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).send("Invalid credentials");
      }
      req.session.loggedIn = true;
      req.session.user_id = user.id;
      res.send("Login successful");
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Create a new blog post
app.post(
  "/blog",
  isLoggedIn,
  upload.fields([
    {
      name: "image",
      maxCount: 1,
    },
    {
      name: "thumbnail",
      maxCount: 1,
    },
  ]),
  async (req, res) => {
    try {
      const { title, description } = req.body;
      const image = req.files["image"] ? req.files["image"][0].filename : null; // Retrieve the uploaded image filename or set it to null if no file is uploaded
      const thumbnail = req.files["thumbnail"]
        ? req.files["thumbnail"][0].filename
        : null; // Retrieve the uploaded thumbnail filename or set it to null if no file is uploaded
      const userId = req.session.user_id; // Retrieve the user ID from the session

      // Check if the user ID exists in the users table
      const checkUserQuery = "SELECT id FROM users WHERE id = ?";
      connection.query(checkUserQuery, [userId], (err, rows) => {
        if (err) {
          console.error("Error checking user ID:", err);
          res.status(500).send("Internal server error");
          return;
        }

        if (rows.length === 0) {
          // User ID does not exist in the users table
          console.error("Invalid user ID:", userId);
          res.status(400).send("Invalid user ID");
          return;
        }

        // Insert new blog post into the database with user_id
        const query =
          "INSERT INTO blog_posts (title, description, image, thumbnail, user_id) VALUES (?, ?, ?, ?, ?)";
        connection.query(
          query,
          [title, description, image, thumbnail, userId],
          (err, result) => {
            if (err) {
              console.error("Error creating blog post:", err);
              res.status(500).send("Internal server error");
              return;
            }
            res.status(201).send("Blog post created");
          }
        );
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal server error");
    }
  }
);

// Update the blog post metadata
app.put("/blog/:id", isLoggedIn, upload.single("image"), async (req, res) => {
  try {
    const postId = req.params.id;
    const { title, description } = req.body;
    let image = req.body.image; // The updated image filename
    let thumbnail = req.body.thumbnail; // The updated thumbnail filename

    // Check if a new image was uploaded and update the filename if necessary
    if (req.file) {
      image = req.file.filename;
    }

    // Update the blog post in the database
    const query =
      "UPDATE blog_posts SET title = ?, description = ?, image = ?, thumbnail = ? WHERE id = ? AND user_id = ?";
    const userId = req.session.user_id; // Retrieve the user ID from the session
    connection.query(
      query,
      [title, description, image, thumbnail, postId, userId],
      (err, result) => {
        if (err) {
          console.error("Error updating blog post:", err);
          res.status(500).send("Internal server error");
          return;
        }
        if (result.affectedRows === 0) {
          // If the blog post does not exist or does not belong to the user
          res.status(404).send("Blog post not found");
        } else {
          res.status(200).send("Blog post updated");
        }
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.delete("/blog/:id", isLoggedIn, async (req, res) => {
  try {
    const postId = req.params.id;

    // Check if the user is logged in and retrieve the user ID from the session
    const userId = req.session.user_id;

    // Check if the logged-in user is the owner of the blog post
    const query = "SELECT * FROM blog_posts WHERE id = ? AND user_id = ?";
    connection.query(query, [postId, userId], (err, results) => {
      if (err) {
        console.error("Error retrieving blog post:", err);
        res.status(500).send("Internal server error");
        return;
      }
      const blogPost = results[0];
      if (!blogPost) {
        return res.status(404).send("Blog post not found");
      }

      // Delete the blog post from the database
      const deleteQuery = "DELETE FROM blog_posts WHERE id = ?";
      connection.query(deleteQuery, [postId], (deleteErr, deleteResult) => {
        if (deleteErr) {
          console.error("Error deleting blog post:", deleteErr);
          res.status(500).send("Internal server error");
          return;
        }
        res.status(200).send("Blog post deleted");
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Add a GET endpoint to list all posts of logged-in users
app.get("/blog", isLoggedIn, async (req, res) => {
  try {
    // Retrieve the user ID from the session
    const userId = req.session.user_id;

    // Retrieve all blog posts of the logged-in user
    const query =
      "SELECT * FROM blog_posts WHERE user_id = ? AND isActive = true";
    connection.query(query, [userId], (err, results) => {
      if (err) {
        console.error("Error retrieving blog posts:", err);
        res.status(500).send("Internal server error");
        return;
      }
      res.status(200).json(results);
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.get("/blog/:id", isLoggedIn, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.session.user_id;

    // Retrieve the blog post from the database based on post ID and user ID
    const query =
      "SELECT * FROM blog_posts WHERE id = ? AND user_id = ? AND isActive = true";
    connection.query(query, [postId, userId], (err, results) => {
      if (err) {
        console.error("Error retrieving blog post:", err);
        res.status(500).send("Internal server error");
        return;
      }
      const blogPost = results[0];
      if (!blogPost) {
        return res.status(404).send("Blog post not found");
      }
      res.status(200).json(blogPost);
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Create a new blog post by copying an existing blog
app.post("/blog/copy/:id", isLoggedIn, async (req, res) => {
  try {
    const originalPostId = req.params.id;
    const userId = req.session.user_id;

    // Retrieve the original blog post from the database based on the provided ID and user ID
    const query = "SELECT * FROM blog_posts WHERE id = ? AND user_id = ?";
    connection.query(query, [originalPostId, userId], async (err, results) => {
      if (err) {
        console.error("Error retrieving blog post:", err);
        res.status(500).send("Internal server error");
        return;
      }

      const originalBlogPost = results[0];
      if (!originalBlogPost) {
        return res.status(404).send("Original blog post not found");
      }

      // Create a new blog post with the same data as the original post
      const { title, description, image, thumbnail } = originalBlogPost;
      const createQuery =
        "INSERT INTO blog_posts (title, description, image, thumbnail, user_id) VALUES (?, ?, ?, ?, ?)";
      connection.query(
        createQuery,
        [title, description, image, thumbnail, userId],
        (createErr, createResult) => {
          if (createErr) {
            console.error("Error creating new blog post:", createErr);
            res.status(500).send("Internal server error");
            return;
          }
          res.status(201).send("New blog post created");
        }
      );
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Make a post active or inactive
app.put("/blog/:id/active", isLoggedIn, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.session.user_id;

    // Check if the blog post belongs to the logged-in user
    const checkOwnershipQuery =
      "SELECT * FROM blog_posts WHERE id = ? AND user_id = ? ";
    connection.query(checkOwnershipQuery, [postId, userId], (err, results) => {
      if (err) {
        console.error("Error retrieving blog post:", err);
        res.status(500).send("Internal server error");
        return;
      }
      const blogPost = results[0];
      if (!blogPost) {
        return res.status(404).send("Blog post not found");
      }

      const isActive = req.body.isActive;

      // Update the active status of the blog post
      const updateQuery = "UPDATE blog_posts SET isActive = ? WHERE id = ?";
      connection.query(
        updateQuery,
        [isActive, postId],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Error updating blog post:", updateErr);
            res.status(500).send("Internal server error");
            return;
          }
          res.status(200).send("Blog post status updated");
        }
      );
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Start the server
app.listen(3000, () => {
  console.log("Server started");
});
