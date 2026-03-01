import express from 'express';
import bcrypt from 'bcryptjs';
import passport from '../utils/passport.js';
import * as userModel from '../models/user.model.js';
import * as authService from '../services/auth.service.js';

const router = express.Router();

// --- HIỂN THỊ FORM ---
router.get('/signup', (req, res) => {
  res.render('vwAccount/auth/signup', { recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY });
});

router.get('/signin', (req, res) => {
  const success_message = req.session.success_message;
  delete req.session.success_message;
  res.render('vwAccount/auth/signin', { success_message });
});

router.get('/forgot-password', (req, res) => res.render('vwAccount/auth/forgot-password'));

router.get('/verify-email', (req, res) => {
  const { email } = req.query;
  if (!email) return res.redirect('/account/signin');
  res.render('vwAccount/auth/verify-otp', { email });
});

// --- XỬ LÝ LOGIC ĐĂNG KÝ (FIXED reCAPTCHA + DRY) ---
router.post('/signup', async (req, res) => {
  const { fullname, email, address, password, 'g-recaptcha-response': recaptchaResponse } = req.body;
  const errors = {};

  // Verify reCAPTCHA
  if (!recaptchaResponse) {
    errors.captcha = 'Please check the captcha box.';
  } else {
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${recaptchaResponse}`;
    const response = await fetch(verifyUrl, { method: 'POST' });
    const data = await response.json();
    if (!data.success) errors.captcha = 'Captcha verification failed.';
  }

  if (Object.keys(errors).length > 0) {
    return res.render('vwAccount/auth/signup', { errors, old: { fullname, email, address }, recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = await userModel.add({ email, fullname, address, password_hash: hashedPassword, role: 'bidder' });

  // Dùng Service để gửi OTP (Đã fix Vi phạm 12)
  await authService.sendOtp(newUser, 'verify_email');

  res.redirect(`/account/verify-email?email=${encodeURIComponent(email)}`);
});

// --- XỬ LÝ QUÊN MẬT KHẨU ---
router.post('/forgot-password', async (req, res) => {
  const user = await userModel.findByEmail(req.body.email);
  if (!user) return res.render('vwAccount/auth/forgot-password', { error_message: 'Email not found.' });

  await authService.sendOtp(user, 'reset_password'); 
  res.render('vwAccount/auth/verify-forgot-password-otp', { email: user.email });
});

router.post('/verify-forgot-password-otp', async (req, res) => {
  const { email, otp } = req.body;
  const isValid = await userModel.verifyOtp(email, otp, 'reset_password');
  if (!isValid) return res.render('vwAccount/auth/verify-forgot-password-otp', { email, error_message: 'Invalid or expired OTP.' });
  res.render('vwAccount/auth/reset-password', { email, otp });
});

// --- OAUTH CALLBACKS ---
// Hàm xử lý callback dùng chung cho tất cả dịch vụ OAuth
const oauthCallback = (req, res) => {
  req.session.authUser = req.user;
  req.session.isAuthenticated = true;
  res.redirect('/');
};

// --- GOOGLE ---
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/account/signin' }), oauthCallback);

// --- FACEBOOK ---
router.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/account/signin' }), oauthCallback);

// --- GITHUB ---
router.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/account/signin' }), oauthCallback);

export default router;