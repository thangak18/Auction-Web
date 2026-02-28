import express from 'express';
import * as watchListModel from '../models/watchlist.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
const router = express.Router();



export default router;