import express from 'express';
import bcrypt from 'bcryptjs';
import * as userModel from '../models/user.model.js';
import * as upgradeRequestModel from '../models/upgradeRequest.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';

const router = express.Router();

// Hiển thị Profile
router.get('/profile', isAuthenticated, async (req, res) => {
  const user = await userModel.findById(req.session.authUser.id);
  res.render('vwAccount/profile', { user, success_message: req.query.success === 'true' ? 'Profile updated successfully!' : null });
});

// Cập nhật Profile
router.put('/profile', isAuthenticated, async (req, res) => {
  const { fullname, email, address, current_password, new_password } = req.body;
  const user = await userModel.findById(req.session.authUser.id);

  if (new_password) {
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.render('vwAccount/profile', { user, error_message: 'Current password incorrect.' });
    }
    user.password_hash = bcrypt.hashSync(new_password, 10);
  }

  user.fullname = fullname;
  user.email = email;
  user.address = address;
  
  const updatedUser = await userModel.update(user.id, user);
  req.session.authUser = updatedUser;
  res.redirect('/account/profile?success=true');
});

// Logout
router.post('/logout', isAuthenticated, (req, res) => {
  req.session.isAuthenticated = false;
  delete req.session.authUser;
  res.redirect('/');
});

// Yêu cầu nâng cấp Seller
router.get('/request-upgrade', isAuthenticated, async (req, res) => {
  const request = await upgradeRequestModel.findByUserId(req.session.authUser.id);
  res.render('vwAccount/request-upgrade', { upgrade_request: request });
});

router.post('/request-upgrade', isAuthenticated, async (req, res) => {
  await userModel.markUpgradePending(req.session.authUser.id);
  await upgradeRequestModel.createUpgradeRequest(req.session.authUser.id);
  res.redirect('/account/profile?send-request-upgrade=true');
});

export default router;