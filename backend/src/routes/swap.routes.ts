import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import {
  getQuote,
  buildSwap,
  buildSponsoredSwap,
  buildRefuel,
  buildDustSweep,
} from '../controllers/swapController';

const router = Router();

// Validation middleware
const validate = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * GET /api/quote
 * Get swap quote
 */
router.get(
  '/quote',
  [
    query('tokenInType').notEmpty().withMessage('tokenInType is required'),
    query('tokenOutType').notEmpty().withMessage('tokenOutType is required'),
    query('amount').isNumeric().withMessage('amount must be a number'),
    validate,
  ],
  getQuote
);

/**
 * POST /api/swap/build
 * Build standard swap transaction
 */
router.post(
  '/swap/build',
  [
    body('userAddress').notEmpty().withMessage('userAddress is required'),
    body('tokenInType').notEmpty().withMessage('tokenInType is required'),
    body('tokenOutType').notEmpty().withMessage('tokenOutType is required'),
    body('amount').isNumeric().withMessage('amount must be a number'),
    body('slippage').isNumeric().withMessage('slippage must be a number'),
    validate,
  ],
  buildSwap
);

/**
 * POST /api/swap/build-sponsored
 * Build sponsored swap transaction
 */
router.post(
  '/swap/build-sponsored',
  [
    body('userAddress').notEmpty().withMessage('userAddress is required'),
    body('tokenInType').notEmpty().withMessage('tokenInType is required'),
    body('tokenOutType').notEmpty().withMessage('tokenOutType is required'),
    body('amount').isNumeric().withMessage('amount must be a number'),
    body('slippage').isNumeric().withMessage('slippage must be a number'),
    body('paymentTokenType').optional().notEmpty(),
    validate,
  ],
  buildSponsoredSwap
);

/**
 * POST /api/refuel
 * Build refuel transaction (swap to SUI)
 */
router.post(
  '/refuel',
  [
    body('userAddress').notEmpty().withMessage('userAddress is required'),
    body('tokenInType').notEmpty().withMessage('tokenInType is required'),
    body('amountOut')
      .isIn(['1000000000', '5000000000'])
      .withMessage('amountOut must be 1 or 5 SUI'),
    body('slippage').isNumeric().withMessage('slippage must be a number'),
    validate,
  ],
  buildRefuel
);

/**
 * POST /api/dust/sweep
 * Build dust sweep transaction
 */
router.post(
  '/dust/sweep',
  [
    body('userAddress').notEmpty().withMessage('userAddress is required'),
    body('tokens').isArray({ min: 1 }).withMessage('tokens must be a non-empty array'),
    body('tokens.*.tokenType').notEmpty().withMessage('tokenType is required'),
    body('tokens.*.balance').isNumeric().withMessage('balance must be a number'),
    body('targetTokenType').notEmpty().withMessage('targetTokenType is required'),
    body('slippage').isNumeric().withMessage('slippage must be a number'),
    validate,
  ],
  buildDustSweep
);

export default router;
