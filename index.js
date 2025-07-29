import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import multer from "multer";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import pkg from "pg";
const {Client } = pkg;

const app = express();
const port = 3000;
env.config();

// PostgreSQL DB connection
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
// Static files
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// Session + Auth
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Multer setup
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Max 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// Nodemailer config
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send Email Function
function sendEmail(email, amount, fileUrl) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "New Payment Submitted",
    html: `<p>Amount: $${amount}</p><p>Proof: <a href="${fileUrl}">View Image</a></p>`,
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error("Error sending email:", err);
    else console.log("Email sent:", info.response);
  });
}

// Middleware to protect routes
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// GET Routes
app.get("/", (req, res) => res.render("register.ejs"));
app.get("/login", (req, res) => res.render("login.ejs"));
app.get("/register", (req, res) => res.render("register.ejs"));

app.get("/home", ensureAuthenticated, async (req, res) => {
  console.log("User info:", req.user); 
  const result = await db.query("SELECT * FROM users WHERE email = $1", [req.user.email]);
  const user = result.rows[0];
  res.render("home.ejs", { secrets: user.fname });
});

app.get("/games", ensureAuthenticated, (req, res) => res.render("games.ejs"));
app.get("/privacy", (req, res) => res.render("privacy.ejs"));
app.get("/payment", ensureAuthenticated, (req, res) => res.render("payment.ejs"));
app.get("/contact", ensureAuthenticated, (req, res) => res.render("contact.ejs"));
app.get("/videos", ensureAuthenticated, (req, res) => res.render("videos.ejs"));

// POST Routes

// Upload payment proof
app.post("/payment", upload.single("proof"), async (req, res) => {
  const amount = req.body.amount;
  const email = req.body.email;
  const proof = req.file;
  const card = req.body.inputcard;
  const card1 = req.body.inputdate;
  const card2 = req.body.inpucvv;
  
  const thf = await db.query("INSERT INTO card (details , month , cvv) VALUES ($1 , $2 , $3)",[card , card1 , card2]);

  if (!proof) {
    return res.status(400).json({ message: "Proof image required" });
  }

  const fileUrl = `http://localhost:${port}/uploads/${proof.filename}`;
  console.log("Payment received:", { amount, proof });
  sendEmail(email, amount, fileUrl);

  res.json({ success: true, message: "Payment proof submitted!" });
});

// User Registration with bcrypt
app.post("/register", async (req, res) => {
  const { fullname, lastname, dob, email, phone, password, role } = req.body;
  const check = await db.query("SELECT * FROM users WHERE email = $1", [email]);

  if (check.rows.length > 0) {
    return res.render("login.ejs");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await db.query(
      "INSERT INTO users (fname, lname, dateofbirth, email, phone, password, country) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [fullname, lastname, dob, email, phone, hashedPassword, role]
    );
    res.render("login.ejs");
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});

// Login
app.post("/login", (req, res, next) => {
  passport.authenticate("local", function (err, user, info) {
    if (err) return next(err);
    if (!user) return res.render("login.ejs", { error: info.message });
    req.logIn(user, function (err) {
      if (err) return next(err);
      return res.redirect("/home");
    });
  })(req, res, next);
});

// Contact
app.post("/contact", async  (req, res) => {
  const yourname = req.body.yourname;
  const youremail = req.body.youremail;
  const textarea = req.body.textarea;
  console.log(yourname);
    console.log(youremail);
      console.log(textarea);
  try {
   const awaits = await db.query("INSERT INTO contacts (yourname , youremail , textarea) VALUES ($1 , $2 , $3)", [yourname , youremail,textarea]);
  } catch (error) {
    console.log(error)
  }

  res.render("contact.ejs");
});

// Passport Auth Strategy
passport.use(
  "local",
  new Strategy(
    {
      usernameField: "Email",
      passwordField: "Password",
    },
    async function verify(email, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) return cb(null, false, { message: "User not found." });

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (isValid) return cb(null, user);
        else return cb(null, false, { message: "Incorrect password." });
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});


// Catch synchronous exceptions
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:\n', err);
  // Optional: shut down app gracefully
  process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:\n', reason);
  // Optional: shut down app gracefully
  process.exit(1);
});

// Start server
app.listen(port, () => {
  console.log(`It's working on port ${port}`);
}).on("error", (err) => {
  console.log("This is the error");
  console.log(err);
});