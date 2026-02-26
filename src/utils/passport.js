import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GitHubStrategy } from 'passport-github2';
import * as userModel from '../models/user.model.js';

// Serialize user vào session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user từ session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await userModel.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Factory Function: Tạo logic xử lý chung cho mọi nhà cung cấp OAuth
const createOAuthVerifyCallback = (providerName) => async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    
    if (!email) {
      return done(new Error(`Email not provided by ${providerName}`), null);
    }

    let user = await userModel.findByEmail(email);
    if (!user) {
      // Tự động đăng ký nếu chưa có tài khoản
      user = await userModel.add({
        fullname: profile.displayName || profile.username,
        email: email,
        role: 'bidder',
        auth_provider: providerName 
      });
    }
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
};

// Áp dụng Factory Function cho cả 3 chiến lược
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/account/auth/google/callback"
}, createOAuthVerifyCallback('google')));

passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: "/account/auth/facebook/callback",
  profileFields: ['id', 'displayName', 'emails']
}, createOAuthVerifyCallback('facebook')));

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: "/account/auth/github/callback",
  scope: ['user:email']
}, createOAuthVerifyCallback('github')));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

export default passport;