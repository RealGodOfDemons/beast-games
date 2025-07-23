import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

const app = express();
const port = 3000;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Session setup
app.use(session({
  secret: process.env.SECRETS,
  resave: false,
  saveUninitialized: false,
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// PostgreSQL client
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

// 🔐 Passport Local Strategy
passport.use(new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return done(null, false, { message: "User not found" });
    }

    const user = result.rows[0];
    if (user.password === password) {
      return done(null, user);
    } else {
      return done(null, false, { message: "Incorrect password" });
    }
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id); // only the ID is saved in session
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// 🛡 Auth Middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

// 🌐 Routes
app.get("/", (req, res) => {
  res.redirect("/register");
});

app.get("/login", (req, res) => {
  res.render("login", { error: undefined });
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/games", isAuthenticated, (req, res) => {
  res.render("games", { user: req.user });
});

// 📩 Register Route
app.post("/register", async (req, res) => {
  const { fullname, lastname, dob, email, phone, password, role } = req.body;

  try {
    const check = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (check.rows.length > 0) {
      res.send("You've already registered. Please login.");
    } else {
      await db.query(
        "INSERT INTO users (fname, lname, dateofbirth, email, phone, password, country) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [fullname, lastname, dob, email, phone, password, role]
      );
      res.redirect("/login");
    }
  } catch (error) {
    console.error(error);
    res.send("Error during registration.");
  }
});

// ✅ Login with Passport
app.post("/login", passport.authenticate("local", {
  successRedirect: "/games",
  failureRedirect: "/login",
  failureFlash: false
}));

// 🚪 Logout
app.get("/logout", (req, res) => {
  req.logout(err => {
    if (err) return res.send("Logout failed");
    res.redirect("/login");
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});