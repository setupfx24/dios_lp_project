import 'reflect-metadata';

import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import pg from 'pg';
import { pino } from 'pino';

import { loadEnv } from './config/env.js';
import { ApprovalWatcher } from './processors/approval-watcher.js';
import { AuditArchiveProcessor } from './processors/audit-archive.js';
import { ChainVerifier } from './processors/chain-verifier.js';
import { OrderProcessor, type OrderJobData } from './processors/order-processor.js';
import { SettlementProcessor } from './processors/settlement-processor.js';
import { makeS3 } from './storage/s3.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const pinoOptions: Parameters<typeof pino>[0] = { level: env.LOG_LEVEL };
  if (env.NODE_ENV === 'development') {
    pinoOptions.transport = { target: 'pino-pretty', options: { singleLine: true } };
  }
  const logger = pino(pinoOptions);

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });

  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const orderProcessor = new OrderProcessor(pool, redis, logger);
  const chainVerifier = new ChainVerifier(pool, logger);
  const settlement = new SettlementProcessor(pool, logger);
  const auditArchive = new AuditArchiveProcessor(pool, makeS3(env), logger);
  const approvalWatcher = new ApprovalWatcher(pool, logger);

  // -------- Queue: orders --------
  const ordersWorker = new Worker<OrderJobData>(
    'orders',
    async (job) => {
      await orderProcessor.process(job.data);
    },
    { connection: redis, concurrency: 8 },
  );
  ordersWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'orders: job failed');
  });

  // -------- Cron: chain verification (every hour for the scaffold;
  // production schedules nightly) --------
  const chainTimer = setInterval(
    () => {
      void chainVerifier.runForAllBrokers().then((report) => {
        logger.info({ report }, 'chain-verifier: cycle complete');
      });
    },
    60 * 60 * 1000,
  );

  // -------- Cron: EOD settlement (5pm IST in production; left manual here) --------
  const settlementTimer = setInterval(
    () => {
      void settlement.runEod();
    },
    6 * 60 * 60 * 1000,
  );

  // -------- Cron: audit archive (daily) --------
  const auditTimer = setInterval(
    () => {
      void auditArchive.run();
    },
    24 * 60 * 60 * 1000,
  );

  // -------- Approval watcher: drains admin.pending_actions (status=approved) --------
  const approvalTimer = setInterval(() => {
    void approvalWatcher.pollOnce();
    void approvalWatcher.expireStale(24);
  }, 30 * 1000);

  // Bootstrap watchdog so we can prove the worker is alive without an HTTP listener.
  const ordersQueue = new Queue<OrderJobData>('orders', { connection: redis });
  const ordersEvents = new QueueEvents('orders', { connection: redis });
  ordersEvents.on('completed', ({ jobId }) => logger.debug({ jobId }, 'orders: completed'));
  await ordersQueue.waitUntilReady();
  logger.info('workers: ready');

  // -------- Graceful shutdown --------
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.warn({ signal }, 'workers: shutting down');
    clearInterval(chainTimer);
    clearInterval(settlementTimer);
    clearInterval(auditTimer);
    clearInterval(approvalTimer);
    await ordersWorker.close();
    await ordersEvents.close();
    await ordersQueue.close();
    await redis.quit();
    await pool.end();
    process.exitCode = 0;
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('Fatal worker bootstrap error:', err);
  process.exitCode = 1;
});
