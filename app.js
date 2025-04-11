require('dotenv').config();
console.log("MONGO_URI:", process.env.MONGO_URI);

// =========================
// Required Modules
// =========================
const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const fs = require('fs');
const nodemailer = require("nodemailer");

// =========================
// App Initialization
// =========================
const app = express();
const otpStore = {}; // Temporary OTP storage

// =========================
// Models
// =========================
const User = require('./models/User');
const DayRecord = require('./models/DayRecord');

// =========================
// View Engine Setup
// =========================
app.set("view engine", 'ejs');
app.set("views", path.join(__dirname, "views"));

// =========================
// Middleware
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
    }
}));

// =========================
// MongoDB Connection
// =========================
mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.DB_NAME,
}).then(() => console.log("✅ MongoDB connected"))
    .catch(err => {
        console.log("❌ MongoDB error", err);
        process.exit(1);
    });

// =========================
// Auth Middleware
// =========================
function requireLogin(req, res, next) {
    if (!req.session.userId) return res.redirect('/login');
    next();
}

// =========================
// Routes
// =========================

// Auth
app.get('/signup', (req, res) => res.render('signup'));

app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.render('error', { message: "User already exists!" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const joined = new Date().toLocaleDateString();
    const user = new User({ name, email, password: hashedPassword, joined });
    await user.save();

    req.session.user = { name, email, joined };
    req.session.userId = user._id;

    const confirmationOptions = {
        from: process.env.GMAIL_ID,
        to: email,
        subject: "✅ Hisaab Kitaab account",
        html: `
        <div style="font-family:Arial, sans-serif; padding: 20px; background-color:#f4f4f4; color:#333;">
    <div style="max-width:600px; margin:auto; background:white; padding:20px; border-radius:8px; box-shadow:0 0 10px rgba(0,0,0,0.1);">
        
        <h2 style="color:#0f172a;">🎉 Welcome to Hisaab Kitaab, ${user.name}!</h2>
        <p style="font-size:1.1em;">We're thrilled to have you onboard.</p>
        <p><strong>Hisaab Kitaab</strong> is now your new digital buddy — keeping your kharchon ka hisaab 24/7, bina bhule! 😎</p>
        
        <div style="background:#f9fafb; border-left:4px solid #0ea5e9; padding:10px 15px; margin:20px 0;">
            <em>“Jo paisa gaya uska bhi hisaab, jo aane wala hai uska bhi intezaam.”</em><br>
            <small>— Hisaab Kitaab Philosophy 💼</small>
        </div>

        <p>If this was you, no worries. You're all set! 👌</p>
        <p>If you didn’t sign up, please <a href="mailto:${process.env.GMAIL_ID}" style="color:#0ea5e9;">contact us immediately</a>.</p>

        <hr style="margin:30px 0;">

        <!-- Footer: App Info + Authentication Note -->
        <p style="font-size:0.9em; color:gray;">
            🔐 <strong>Security Note:</strong> Hisaab Kitaab uses industry-standard password hashing and secure email verification. Your data is encrypted and safe with us.
        </p>
        <p style="font-size:0.9em; color:gray;">
            💬 For any help or suggestions, feel free to reach out to our support team anytime.
        </p>
        <p style="font-size:0.9em; color:gray;">Thank you for choosing <strong>Hisaab Kitaab</strong> – your personal expense manager, powered by desi jugaad and modern tech. 💡📊</p>

        <p style="font-size:0.8em; color:#aaa;">This is an automated email. Please do not reply.</p>
    </div>
</div>

    `
    };
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_ID,
            pass: process.env.GMAIL_APP_PASS
        }
    });


    transporter.sendMail(confirmationOptions, (err, info) => {
        if (err) {
            console.log("⚠️ Confirmation email error:", err);
        } else {
            console.log("📩 Password reset confirmation sent:", info.response);
        }
    });

    res.redirect('/');
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.render('error', { message: "User not found!" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.render('error', { message: "Invalid credentials!" });

        req.session.user = { name: user.name, email: user.email, joined: user.joined };
        req.session.userId = user._id;

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('error', { message: "Something went wrong!" });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error("Logout error:", err);
        res.redirect('/');
    });
});

// Home
app.get('/', async (req, res) => {
    if (!req.session.userId) return res.render('home', { files: null, loggedIn: false });

    try {
        const user = await User.findById(req.session.userId);
        const files = await DayRecord.find({ user: req.session.userId }, 'date');
        const filenames = files.map(f => f.date + ".txt");

        res.render('home', { files: filenames, loggedIn: true, username: user.name });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "DB error!" });
    }
});

// Profile
app.get('/profile', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.render('error', { message: "User not found" });

        res.render('profile', { user });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "Error loading profile" });
    }
});

// Hisaab Routes
app.get('/newhisaabpage', requireLogin, (req, res) => res.render('newhisab'));

app.post('/newhisaab', requireLogin, async (req, res) => {
    const { title, data } = req.body;

    const newRecord = new DayRecord({
        date: title,
        entries: data,
        user: req.session.userId
    });

    try {
        await newRecord.save();
        res.render('success', { message: "New hisaab saved successfully!" });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "Hisaab saving error!" });
    }
});

app.get('/read/:filename', requireLogin, async (req, res) => {
    const date = req.params.filename.replace(".txt", "");

    try {
        const record = await DayRecord.findOne({ date, user: req.session.userId });
        if (!record) return res.render('error', { message: "Record not found!" });

        res.render("openhisab", {
            hisabdata: {
                filename: req.params.filename,
                filedata: record.entries
            }
        });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "Error reading records!" });
    }
});

app.post("/edit/:filename", requireLogin, async (req, res) => {
    const date = req.params.filename.replace(".txt", "");

    try {
        const record = await DayRecord.findOne({ date, user: req.session.userId });
        if (!record) return res.render('error', { message: "No record to edit!" });

        res.render("edithisab", {
            obj: {
                filename: req.params.filename,
                filedata: record.entries
            }
        });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "DB read error!" });
    }
});

app.post("/updated/:filename", requireLogin, async (req, res) => {
    const date = req.params.filename.replace(".txt", "");

    try {
        const result = await DayRecord.updateOne(
            { date, user: req.session.userId },
            { entries: req.body.data }
        );

        if (result.matchedCount === 0)
            return res.render('error', { message: "Record not found or unauthorized!" });

        res.render('success', { message: "Hisaab updated successfully!" });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "Update error!" });
    }
});

app.get("/delete/:filename", requireLogin, async (req, res) => {
    const date = req.params.filename.replace(".txt", "");

    try {
        const deleted = await DayRecord.deleteOne({ date, user: req.session.userId });
        if (deleted.deletedCount === 0)
            return res.render('error', { message: "Record not found!" });

        res.render('success', { message: "Hisaab deleted successfully!" });
    } catch (err) {
        console.error(err);
        res.render('error', { message: "Error deleting records!" });
    }
});

// Forgot Password
app.get('/change-password', (req, res) => res.render('reset_request'));

app.post('/request-reset', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render('error', { message: "No user with this email!" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = otp;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_ID,
            pass: process.env.GMAIL_APP_PASS
        }
    });

    const mailOptions = {
        from: process.env.GMAIL_ID,
        to: email,
        subject: '🔐 Hisaab Kitaab - Your OTP Code',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #eee; border-radius: 10px; background-color: #f9f9f9; color: #333;">
            <h2 style="text-align: center; color: #4CAF50;">🔐 Hisaab Kitaab</h2>
            <p>Hi there,</p>
            <p>We received a request to reset your password.</p>
            <p style="margin: 20px 0; font-size: 18px;">Please use the following One-Time Password (OTP) to continue:</p>
            
            <div style="text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #222; background: #fff; padding: 15px 0; border: 2px dashed #4CAF50; border-radius: 8px; width: 80%; margin: auto;">
              ${otp}
            </div>
            
            <p style="margin-top: 30px;">This OTP is valid for the next <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
            
            <p style="margin-top: 40px;">Thanks,<br><strong>The Hisaab Kitaab Team</strong></p>
            
            <hr style="margin-top: 40px;" />
            <p style="font-size: 12px; color: #777;">This is an automated message. Please do not reply.</p>
          </div>
        `
    };


    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.log(err);
            return res.render('error', { message: "OTP sending failed!" });
        }

        console.log("OTP sent: " + info.response);
        // res.render('verify_otp', { email });
        res.render('verify_otp', { email, showOtpNotice: true });

    });
});

app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (otpStore[email] && otpStore[email] === otp) {
        delete otpStore[email];
        res.render('reset_password', { email });
    } else {
        res.render('error', { message: "Invalid OTP!" });
    }
});

app.post('/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render('error', { message: "User not found!" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    const confirmationOptions = {
        from: process.env.GMAIL_ID,
        to: email,
        subject: "✅ Your Hisaab Kitaab password was successfully changed",
        html: `
        <div style="font-family:Arial, sans-serif; padding: 20px; background-color:#f4f4f4; color:#333;">
            <div style="max-width:600px; margin:auto; background:white; padding:20px; border-radius:8px; box-shadow:0 0 10px rgba(0,0,0,0.1);">
                <h2 style="color:#0f172a;">🔐 Password Changed Successfully</h2>
                <p>Hello <strong>${user.name}</strong>,</p>
                <p>We're just letting you know that your password for <strong>Hisaab Kitaab</strong> was changed successfully.</p>
                <p>If you did this, no further action is needed.</p>
                <p>If you didn't request this change, please <a href="mailto:${process.env.GMAIL_ID}" style="color:#0ea5e9;">contact our support</a> immediately.</p>
                <br>
                <hr>
                <p style="font-size:0.9em; color:gray;">Thank you for using <strong>Hisaab Kitaab</strong> – your personal expense manager.</p>
                <p style="font-size:0.8em; color:#aaa;">This is an automated email, please do not reply.</p>
            </div>
        </div>
    `
    };
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_ID,
            pass: process.env.GMAIL_APP_PASS
        }
    });


    transporter.sendMail(confirmationOptions, (err, info) => {
        if (err) {
            console.log("⚠️ Confirmation email error:", err);
        } else {
            console.log("📩 Password reset confirmation sent:", info.response);
        }
    });

    res.render('success', { message: "Password reset successfully!" });
});

// =========================
// Start Server
// =========================
app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
});
