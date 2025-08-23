import express from 'express';
import { body } from 'express-validator';
import { register, login } from '../controllers/authController.js';

const router = express.Router();

router.post('/register',
  [body('name').notEmpty(), body('email').isEmail(), body('password').isLength({ min: 6 })],
  register);

router.post('/login',
  [body('email').isEmail(), body('password').isLength({ min: 6 })],
  login);

export default router;
