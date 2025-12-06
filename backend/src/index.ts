import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import swapRoutes from './routes/swap.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { NETWORK, TREASURY_ADDRESS, verifyEnokiConfiguration } from './config/sui';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    network: NETWORK,
    treasuryAddress: TREASURY_ADDRESS || 'Not configured',
    version: '1.0.0',
  });
});

// API version endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    name: 'Sui DEX Aggregator Backend',
    version: '1.0.0',
    network: NETWORK,
    description: 'DEX aggregator with Aftermath SDK and Enoki gas sponsorship',
    endpoints: {
      health: 'GET /health',
      tokens: 'GET /api/tokens',
      balances: 'GET /api/balances/:address',
      quote: 'GET /api/quote',
      buildSwap: 'POST /api/swap/build',
      buildSponsoredSwap: 'POST /api/swap/build-sponsored',
      refuel: 'POST /api/refuel',
      dustSweep: 'POST /api/dust/sweep',
    },
    features: [
      'Best route finding via Aftermath SDK',
      'Gas-free swaps with Enoki sponsorship',
      'Get Gas (Refuel) - swap any token for SUI',
      'Dust sweeper - convert small balances',
    ],
  });
});

// Mount swap routes
app.use('/api', swapRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  // Verify Enoki configuration
  await verifyEnokiConfiguration();

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Sui DEX Aggregator Backend Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Server:    http://localhost:${PORT}`);
    console.log(`🌐 Network:   ${NETWORK.toUpperCase()}`);
    console.log(`📋 Health:    http://localhost:${PORT}/health`);
    console.log(`📚 API Info:  http://localhost:${PORT}/api`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} signal received: closing HTTP server`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
