import * as userModel from '../models/user.model.js';
import { sendMail } from '../utils/mailer.js';

// Hàm này giờ là "trung tâm điều phối OTP" duy nhất (Vi phạm 12 - DRY)
export const sendOtp = async (user, purpose) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 

  await userModel.createOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: purpose, 
    expires_at: expiresAt,
  });

  await sendMail({
    to: user.email,
    subject: purpose === 'reset_password' ? 'Reset Password' : 'Verify Email',
    html: `<p>Your OTP code is: <strong>${otp}</strong></p>`,
  });
};