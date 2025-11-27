import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

interface KeypairResult {
  publicKey: string;
  privateKey: string;
}

interface GenerationOptions {
  prefix?: string;
  suffix?: string;
  timeoutSeconds?: number;
  cores?: number;
}

interface WorkerMessage {
  type: 'result' | 'progress';
  data?: KeypairResult;
  attempts?: number;
}

interface WorkerData {
  prefix: string;
  suffix: string;
}

function generateKeypair(desiredPrefix: string, desiredSuffix: string): KeypairResult | null {
  const keypair = Keypair.generate();
  const publicKey = bs58.encode(keypair.publicKey.toBytes());
  
  if ((desiredPrefix && publicKey.startsWith(desiredPrefix)) || 
      (desiredSuffix && publicKey.endsWith(desiredSuffix)) ||
      (desiredPrefix && desiredSuffix && publicKey.startsWith(desiredPrefix) && publicKey.endsWith(desiredSuffix))) {
    const privateKey = bs58.encode(keypair.secretKey);
    return { publicKey, privateKey };
  }
  
  return null;
}

function generateSolanaVanityKeypair(options: GenerationOptions = {}): Promise<KeypairResult> {
  const {
    prefix = '',
    suffix = '',
    timeoutSeconds = 300,
    cores = Math.max(1, os.cpus().length - 2)
  } = options;

  console.log("cores", cores)

  return new Promise<KeypairResult>((resolve, reject) => {
    if (isMainThread) {
      console.log(`[Main] Starting generation with prefix '${prefix}' and suffix '${suffix}' using ${cores} cores...`);
      const workers = new Set<Worker>();
      let totalAttempts = 0;
      let resultFound = false;
      const startTime = Date.now();
      let lastUpdateTime = startTime;

      const updateProgress = (): void => {
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - startTime) / 1000;
        const overallAttemptsPerSecond = totalAttempts / elapsedSeconds;

        process.stdout.write(`\r[${new Date().toISOString()}] Total: ${totalAttempts.toLocaleString()} | Overall: ${overallAttemptsPerSecond.toFixed(2)}/s`);

        lastUpdateTime = currentTime;
      };

      const progressInterval = setInterval(updateProgress, 1000);

      const timeout = setTimeout(() => {
        console.log('\n[Main] Generation timed out. Terminating workers...');
        clearInterval(progressInterval);
        for (const worker of workers) {
          worker.terminate();
        }
        reject(new Error(`Keypair generation timed out after ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);

      for (let i = 0; i < cores; i++) {
        const worker = new Worker(__filename, { workerData: { prefix, suffix } as WorkerData });
        workers.add(worker);

        worker.on('message', (message: WorkerMessage) => {
          if (message.type === 'result' && !resultFound) {
            resultFound = true;
            clearInterval(progressInterval);
            clearTimeout(timeout);
            console.log('\n[Main] Result found. Terminating workers...');
            for (const w of workers) {
              w.terminate();
            }
            resolve(message.data!);
          } else if (message.type === 'progress') {
            totalAttempts += message.attempts!;
          }
        });

        worker.on('error', (error: Error) => {
          console.error('\n[Main] Worker error:', error);
        });

        worker.on('exit', (code: number) => {
          workers.delete(worker);
          if (workers.size === 0 && !resultFound) {
            clearInterval(progressInterval);
            clearTimeout(timeout);
            console.log('\n[Main] All workers have exited.');
            reject(new Error('All workers exited without finding a result'));
          }
        });
      }
    } else {
      const { prefix, suffix } = workerData as WorkerData;
      let attempts = 0;

      function attemptGeneration(): void {
        const batchSize = 10000;
        for (let i = 0; i < batchSize; i++) {
          attempts++;
          const result = generateKeypair(prefix, suffix);
          if (result) {
            parentPort!.postMessage({ type: 'result', data: result } as WorkerMessage);
            return;
          }
        }
        parentPort!.postMessage({ type: 'progress', attempts } as WorkerMessage);
        attempts = 0;
        setImmediate(attemptGeneration);
      }

      attemptGeneration();
    }
  });
}

if (isMainThread) {
  // Export for main thread
} else {
  const { prefix, suffix } = workerData as WorkerData;
  let attempts = 0;

  function attemptGeneration(): void {
    const batchSize = 10000;
    for (let i = 0; i < batchSize; i++) {
      attempts++;
      const result = generateKeypair(prefix, suffix);
      if (result) {
        parentPort!.postMessage({ type: 'result', data: result } as WorkerMessage);
        process.exit(0);
      }
    }
    parentPort!.postMessage({ type: 'progress', attempts } as WorkerMessage);
    attempts = 0;
    setImmediate(attemptGeneration);
  }

  attemptGeneration();
}

// Export the main function
export { generateSolanaVanityKeypair };