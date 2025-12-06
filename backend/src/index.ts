import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import swapRoutes from './routes/swap.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { NETWORK, SPONSOR_ADDRESS, TREASURY_ADDRESS } from './config/sui';

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
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    network: NETWORK,
    sponsorAddress: SPONSOR_ADDRESS,
    treasuryAddress: TREASURY_ADDRESS,
  });
});

// API version endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    name: 'Sui DEX Aggregator Backend',
    version: '1.0.0',
    network: NETWORK,
    endpoints: {
      quote: 'GET /api/quote',
      buildSwap: 'POST /api/swap/build',
      buildSponsoredSwap: 'POST /api/swap/build-sponsored',
      refuel: 'POST /api/refuel',
      dustSweep: 'POST /api/dust/sweep',
    },
  });
});

// Mount swap routes
app.use('/api', swapRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Sui DEX Aggregator Backend Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🌐 Network: ${NETWORK.toUpperCase()}`);
  console.log(`💰 Sponsor: ${SPONSOR_ADDRESS}`);
  console.log(`🏦 Treasury: ${TREASURY_ADDRESS}`);
  console.log(`📋 Health: http://localhost:${PORT}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;
