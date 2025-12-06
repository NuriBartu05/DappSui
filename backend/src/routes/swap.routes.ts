import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import {
  getQuote,
  buildSwap,
  buildSponsoredSwap,
  buildRefuel,
  buildDustSweep,
  getBalances,
  getSupportedTokens,
} from '../controllers/swapController';

const router = Router();

// Validation middleware
const validate = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array() 
    });
  }
  next();
};

/**
 * GET /api/tokens
 * Get list of supported tokens
 */
router.get('/tokens', getSupportedTokens);

/**
 * GET /api/balances/:address
 * Get all token balances for a user
 */
router.get(
  '/balances/:address',
  [
    param('address')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid Sui address format'),
    validate,
  ],
  getBalances
);

/**
 * GET /api/quote
 * Get swap quote
 */
router.get(
  '/quote',
  [
    query('tokenInType').notEmpty().withMessage('tokenInType is required'),
    query('tokenOutType').notEmpty().withMessage('tokenOutType is required'),
    query('amount')
      .notEmpty()
      .withMessage('amount is required')
      .isNumeric()
      .withMessage('amount must be a number'),
    validate,
  ],
  getQuote
);

/**
 * POST /api/swap/build
 * Build standard swap transaction (user pays gas)
 */
router.post(
  '/swap/build',
  [
    body('userAddress')
      .notEmpty()
      .withMessage('userAddress is required')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid Sui address format'),
    body('tokenInType').notEmpty().withMessage('tokenInType is required'),
    body('tokenOutType').notEmpty().withMessage('tokenOutType is required'),
    body('amount')
      .notEmpty()
      .withMessage('amount is required')
      .isNumeric()
      .withMessage('amount must be a number'),
    body('slippage')
      .notEmpty()
      .withMessage('slippage is required')
      .isNumeric()
      .withMessage('slippage must be a number')
      .custom((value) => {
        const num = Number(value);
        if (num < 0 || num > 5000) {
          throw new Error('slippage must be between 0 and 5000 (50%)');
        }
        return true;
      }),
    validate,
  ],
  buildSwap
);

/**
 * POST /api/swap/build-sponsored
 * Build sponsored swap transaction (Enoki pays gas)
 */
router.post(
  '/swap/build-sponsored',
  [
    body('userAddress')
      .notEmpty()
      .withMessage('userAddress is required')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid Sui address format'),
    body('tokenInType').notEmpty().withMessage('tokenInType is required'),
    body('tokenOutType').notEmpty().withMessage('tokenOutType is required'),
    body('amount')
      .notEmpty()
      .withMessage('amount is required')
      .isNumeric()
      .withMessage('amount must be a number'),
    body('slippage')
      .notEmpty()
      .withMessage('slippage is required')
      .isNumeric()
      .withMessage('slippage must be a number'),
    body('paymentTokenType').optional().notEmpty(),
    validate,
  ],
  buildSponsoredSwap
);

/**
 * POST /api/refuel
 * Build refuel transaction (get SUI gas)
 */
router.post(
  '/refuel',
  [
    body('userAddress')
      .notEmpty()
      .withMessage('userAddress is required')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid Sui address format'),
    body('tokenInType').notEmpty().withMessage('tokenInType is required'),
    body('amountOut')
      .notEmpty()
      .withMessage('amountOut is required')
      .isIn(['1000000000', '5000000000'])
      .withMessage('amountOut must be 1000000000 (1 SUI) or 5000000000 (5 SUI)'),
    body('slippage')
      .notEmpty()
      .withMessage('slippage is required')
      .isNumeric()
      .withMessage('slippage must be a number'),
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
    body('userAddress')
      .notEmpty()
      .withMessage('userAddress is required')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid Sui address format'),
    body('tokens')
      .isArray({ min: 1, max: 10 })
      .withMessage('tokens must be an array with 1-10 items'),
    body('tokens.*.tokenType').notEmpty().withMessage('tokenType is required for each token'),
    body('tokens.*.balance')
      .notEmpty()
      .withMessage('balance is required for each token')
      .isNumeric()
      .withMessage('balance must be a number'),
    body('targetTokenType').notEmpty().withMessage('targetTokenType is required'),
    body('slippage')
      .notEmpty()
      .withMessage('slippage is required')
      .isNumeric()
      .withMessage('slippage must be a number'),
    validate,
  ],
  buildDustSweep
);

export default router;
