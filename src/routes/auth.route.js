import express from "express";
import bcrypt from "bcryptjs";
import passport from "../utils/passport.js";
import * as userModel from "../models/user.model.js";
import * as authService from "../services/auth.service.js";

const router = express.Router();

// --- HIỂN THỊ FORM ---
router.get("/signup", (req, res) => {
  res.render("vwAccount/auth/signup", { recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY });
});

router.get("/signin", (req, res) => {
  const success_message = req.session.success_message;
  delete req.session.success_message;
  res.render("vwAccount/auth/signin", { success_message });
});

router.get("/forgot-password", (req, res) => res.render("vwAccount/auth/forgot-password"));

router.get("/verify-email", (req, res) => {
  const { email } = req.query;
  if (!email) return res.redirect("/account/signin");
  res.render("vwAccount/auth/verify-otp", { email });
});

// --- XỬ LÝ ĐĂNG NHẬP ---
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    return res.render("vwAccount/auth/signin", {
      error_message: "Invalid email or password.",
      old: { email },
    });
  }

  if (user.password_hash) {
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.render("vwAccount/auth/signin", {
        error_message: "Invalid email or password.",
        old: { email },
      });
    }
  } else {
    return res.render("vwAccount/auth/signin", {
      error_message: "This account uses OAuth login. Please use the social login buttons.",
      old: { email },
    });
  }

  if (!user.email_verified) {
    await authService.sendOtp(user, "verify_email");
    return res.redirect(\`/account/verify-email?email=\${encodeURIComponent(email)}\`);
  }

  req.session.authUser = {
    id: user.id,
    username: user.username,
    fullname: user.fullname,
    email: user.email,
    role: user.role,
    address: user.address,
    email_verified: user.email_verified,
    oauth_provider: user.oauth_provider,
    oauth_id: user.oauth_id,
  };
  req.session.isAuthenticated = true;

  const retUrl = req.query.retUrl || "/";
  res.redirect(retUrl);
});

// --- XỬ LÝ LOGIC ĐĂNG KÝ ---
router.post("/signup", async (req, res) => {
  const { fullname, email, address, password, "g-recaptcha-response": recaptchaResponse } = req.body;
  const errors = {};

  if (!recaptchaResponse) {
    errors.captcha = "Please check the captcha box.";
  } else {
    const verifyUrl = \`https://www.google.com/recaptcha/api/siteverify?secret=\${process.env.RECAPTCHA_SECRET}&response=\${recaptchaResponse}\`;
    const response = await fetch(verifyUrl, { method: "POST" });
    const data = await response.json();
    if (!data.success) errors.captcha = "Captcha verification failed.";
  }

  if (Object.keys(errors).length > 0) {
    return res.render("vwAccount/auth/signup", { errors, old: { fullname, email, address }, recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY });
  }

  const existingUser = await userModel.findByEmail(email);
  if (existingUser) {
    errors.email = "Email already exists.";
    return res.render("vwAccount/auth/signup", { errors, old: { fullname, email, address }, recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = await userModel.add({ email, fullname, address, password_hash: hashedPassword, role: "bidder" });

  await authService.sendOtp(newUser, "verify_email");
  res.redirect(\`/account/verify-email?email=\${encodeURIComponent(email)}\`);
});

// --- XỬ LÝ XÁC THỰC EMAIL (OTP) ---
router.post("/verify-email", async (req, res) => {
  const { email, otp } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    return res.render("vwAccount/auth/verify-otp", { email, error_message: "User not found." });
  }

  const validOtp = await userModel.findValidOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: "verify_email",
  });

  if (!validOtp) {
    return res.render("vwAccount/auth/verify-otp", { email, error_message: "Invalid or expired OTP." });
  }

  await userModel.markOtpUsed(validOtp.id);
  await userModel.verifyUserEmail(user.id);

  req.session.authUser = {
    id: user.id,
    username: user.username,
    fullname: user.fullname,
    email: user.email,
    role: user.role,
    address: user.address,
    email_verified: true,
  };
  req.session.isAuthenticated = true;
  req.session.success_message = "Email verified successfully! Welcome!";
  res.redirect("/");
});

// --- GỬI LẠI OTP ---
router.post("/resend-otp", async (req, res) => {
  const { email } = req.body;
  const user = await userModel.findByEmail(email);

  if (!user) {
    return res.render("vwAccount/auth/verify-otp", { email, error_message: "User not found." });
  }

  await authService.sendOtp(user, "verify_email");
  res.render("vwAccount/auth/verify-otp", { email, info_message: "A new OTP has been sent to your email." });
});

// --- XỬ LÝ QUÊN MẬT KHẨU ---
router.post("/forgot-password", async (req, res) => {
  const user = await userModel.findByEmail(req.body.email);
  if (!user) return res.render("vwAccount/auth/forgot-password", { error_message: "Email not found." });

  await authService.sendOtp(user, "reset_password");
  res.render("vwAccount/auth/verify-forgot-password-otp", { email: user.email });
});

router.post("/verify-forgot-password-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    return res.render("vwAccount/auth/verify-forgot-password-otp", { email, error_message: "User not found." });
  }

  const validOtp = await userModel.findValidOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: "reset_password",
  });

  if (!validOtp) {
    return res.render("vwAccount/auth/verify-forgot-password-otp", { email, error_message: "Invalid or expired OTP." });
  }

  await userModel.markOtpUsed(validOtp.id);
  res.render("vwAccount/auth/reset-password", { email });
});

// --- ĐẶT LẠI MẬT KHẨU ---
router.post("/reset-password", async (req, res) => {
  const { email, new_password, confirm_new_password } = req.body;

  if (new_password !== confirm_new_password) {
    return res.render("vwAccount/auth/reset-password", { email, error_message: "Passwords do not match." });
  }

  if (new_password.length < 6) {
    return res.render("vwAccount/auth/reset-password", { email, error_message: "Password must be at least 6 characters." });
  }

  const user = await userModel.findByEmail(email);
  if (!user) {
    return res.render("vwAccount/auth/reset-password", { email, error_message: "User not found." });
  }

  const hashedPassword = bcrypt.hashSync(new_password, 10);
  await userModel.update(user.id, { password_hash: hashedPassword });

  req.session.success_message = "Password reset successfully! Please sign in.";
  res.redirect("/account/signin");
});

// --- ĐĂNG XUẤT ---
router.post("/signout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// --- OAUTH CALLBACKS ---
const oauthCallback = (req, res) => {
  req.session.authUser = req.user;
  req.session.isAuthenticated = true;
  res.redirect("/");
};

router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/account/signin" }), oauthCallback);

router.get("/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
router.get("/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: "/account/signin" }), oauthCallback);

router.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }));
router.get("/auth/github/callback", passport.authenticate("github", { failureRedirect: "/account/signin" }), oauthCallback);

export default router;
