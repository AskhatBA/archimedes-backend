import { Request, Response } from 'express';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import * as paymentService from './payment.service';

export const initPayment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);

  const amount = Number(req.body.amount);
  const description: string = req.body.description || 'Balance replenishment';

  if (!amount || isNaN(amount) || amount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  const result = await paymentService.initPayment(req.user.id, amount, description);
  return res.status(200).json(result);
};

export const handleCallback = async (req: Request, res: Response) => {
  const xml = await paymentService.handleCallback(req.body as Record<string, string>);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.status(200).send(xml);
};

export const getPaymentStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  const payment = await paymentService.getPaymentStatus(req.params.id, req.user.id);
  if (!payment) throw new AppError('Payment not found', 404);
  return res.status(200).json(payment);
};

export const getPaymentHistory = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  const history = await paymentService.getPaymentHistory(req.user.id);
  return res.status(200).json(history);
};

export const getBalance = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  const balance = await paymentService.getUserBalance(req.user.id);
  return res.status(200).json({ balance });
};

// These are the redirect targets after payment — the WebView detects these URLs
export const paymentSuccess = (_req: Request, res: Response) => {
  res.status(200).json({ status: 'success' });
};

export const paymentFailure = (_req: Request, res: Response) => {
  res.status(200).json({ status: 'failed' });
};