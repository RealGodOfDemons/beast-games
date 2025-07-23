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

const app = express();
const port = 3000;
env.config();

app.use('/uploads', express.static('uploads'));
app.use(express.json());
// Middleware to serve static files
app.use(express.static('public'));
// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));
// Set EJS as the view engine

app.set('view engine', 'ejs');
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// postgreSQL
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();


// Create uploads directory if not exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Configure Multer for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
// const upload = multer({ storage });

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  }
});


// Configure email
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your_email@gmail.com",
    pass: "your_app_password"
  }
});

function sendEmail(amount, fileUrl) {
  const mailOptions = {
    from: "philipadre@gmail.com",
    to: req.body.email,
    subject: "New Payment Submitted",
    html: `<p>Amount: $${amount}</p><p>Proof: <a href="${fileUrl}">View Image</a></p>`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error("Error sending email:", err);
    else console.log("Email sent:", info.response);
  });
}


// Get Routes
app.get("/", (req, res) => {
  res.render("register.ejs");
});

app.get("/login" , (req , res)=>{
  res.render("login.ejs");
});

app.get("/register" , (req , res )=>{
  res.render("register.ejs")
});
app.get("/home", async (req , res)=>{
  console.log("User info:", req.user); // 🧠 Debug check

  if (req.isAuthenticated()) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [req.user.email]);
      const user = result.rows[0];
      const fullName = user.fname;
      res.render("home.ejs", { secrets: fullName });

    } catch (error) {
      console.log(error);
      res.send("Server error");
    }
  } else {
    res.redirect("/login");
  }
});
app.get("/games" , (req , res)=>{
  if (req.isAuthenticated()){
    res.render("games.ejs");
  } else {
   res.render("login.ejs")
  }
});

app.get("/privacy", (req ,res)=>{
  res.render("privacy.ejs");
});

app.get("/payment" , (req ,res)=>{
  if (req.isAuthenticated()) {
    res.render("payment.ejs")
  } else {
    res.render("login.ejs")
  }
});

app.get("/contact", (req , res)=>{
  if (req.isAuthenticated()) {
    res.render("contact.ejs");
  } else {
    res.render("login.ejs");
  }
  
});

app.get("/videos" , (req ,res)=>{
  if (req.isAuthenticated()) {
    res.render("videos.ejs")
  } else {
    res.render("login.ejs")
  }
})
// Post Routes
app.post("/submit-payment", upload.single("proof"), (req, res) => {
  const amount = req.body.amount;
  const proof = req.file;

  if (!proof) {
    return res.status(400).json({ message: "Proof image required" });
  }

  // Optional: Save amount + file info to DB
  console.log("Payment received:", { amount, proof });

  res.json({ success: true, message: "Payment proof submitted!" });

  const fileUrl = `http://localhost:${port}/uploads/${ proof.filename}`;
sendEmail(amount, fileUrl);
});

app.post("/register" , async (req , res)=>{
  const fullName = req.body.fullname;
  const lastname = req.body.lastname;
  const dob = req.body.dob;
  const email = req.body.email;
  const phone = req.body.phone;
  const password = req.body.password;
  const role = req.body.role;

  console.log(fullName);
  console.log(lastname);
  console.log(dob);
  console.log(phone);
  console.log(role);
  console.log(email);
  console.log(password);
  
  const check = await db.query("SELECT * FROM users WHERE email = $1 ", [email]);

  if (check.rows.length > 0) {
    res.render("login.ejs");
  } else {
     try {
      const result = await db.query("INSERT INTO users (fname , lname , dateofbirth , email , phone , password , country) VALUES ($1 , $2 , $3 ,$4 , $5 , $6 , $7)",
      [fullName, lastname , dob , email , phone , password , role]);
      res.render("login.ejs")
    } catch (error) {
      console.log(error);
      res.send(error);
    }
  }
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", function(err, user, info) {
    if (err) return next(err);

    if (!user) {
      return res.render("login.ejs", { error: info.message });  // Show error on page
    }

    req.logIn(user, function(err) {
      if (err) return next(err);
      return res.redirect("/home");
    });
  })(req, res, next);
});

app.post("/contact", (req , res)=>{
  try {
    const cname = req.body.yourname;
    console.log(cname);

    res.render("contact.ejs");
  } catch (error) {
    console.log(err)
  }
});

passport.use("local", new Strategy(
  {
    usernameField: "Email",     // Match input name="Email"
    passwordField: "Password"   // Match input name="Password"
  },
  async function verify(email, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

      if (result.rows.length > 0) {
        const user = result.rows[0];

        if (password === user.password) {
          return cb(null, user);
        } else {
          return cb(null, false, { message: "Incorrect password." });
        }
      } else {
        return cb(null, false, { message: "User not found." });
      }
    } catch (err) {
      return cb(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    done(null, user);
  } catch (err) {
    done(err);
  }
});

app.listen(port, () => {
  console.log(`It's working on port ${port}`);
});
