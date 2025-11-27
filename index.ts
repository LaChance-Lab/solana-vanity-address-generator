import { generateSolanaVanityKeypair } from "./generate";
import { Db, MongoClient } from "mongodb";

const {
  MONGO_URI = "",
  MONGO_DB = "metafresh",
  MONGO_COLLECTION = "pumpaddr",
  VANITY_PREFIX,
  VANITY_SUFFIX = "pump",
  VANITY_TIMEOUT_SECONDS = "600",
  VANITY_CORES = "20",
} = process.env;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is required. Set it in your environment variables.");
}

let client: MongoClient | null = null;
let db: Db | null = null;

async function connectToMongoDB(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    client = new MongoClient(MONGO_URI, { maxPoolSize: 5 });
    await client.connect();
    db = client.db(MONGO_DB);
    console.log(`✅ Connected to MongoDB database "${MONGO_DB}"`);
    return db;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
}

async function closeMongoConnection() {
  if (!client) {
    return;
  }

  await client.close();
  client = null;
  db = null;
  console.log("✅ MongoDB connection closed");
}

async function saveAddressToDB(publicKey: string, privateKey: string) {
  const database = await connectToMongoDB();

  try {
    const collection = database.collection(MONGO_COLLECTION);
    const addressData = {
      publicKey,
      privateKey,
      isActive: false,
      createdAt: new Date(),
      suffix: VANITY_SUFFIX,
    };

    const result = await collection.insertOne(addressData);
    console.log(`💾 Address saved to DB with ID: ${result.insertedId}`);
    return result;
  } catch (error) {
    console.error("❌ Error saving to database:", error);
    throw error;
  }
}

async function runGeneratorLoop() {
  let addressCount = 0;

  for (;;) {
    try {
      addressCount += 1;
      console.log(`\n=== Generating address #${addressCount} ===`);

      const result = await generateSolanaVanityKeypair({
        prefix: VANITY_PREFIX,
        suffix: VANITY_SUFFIX,
        timeoutSeconds: Number(VANITY_TIMEOUT_SECONDS),
        cores: Number(VANITY_CORES),
      });

      console.log(`✅ Address #${addressCount} generated`);
      console.log(`Public Key: ${result.publicKey}`);

      // Avoid logging private keys in production; uncomment only for debugging.
      // console.log(`Private Key: ${result.privateKey}`);

      await saveAddressToDB(result.publicKey, result.privateKey);
    } catch (error) {
      console.error(`❌ Error generating address #${addressCount}:`, (error as Error).message);
    }
  }
}

async function main() {
  await connectToMongoDB();
  await runGeneratorLoop();
}

async function handleShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  await closeMongoConnection();
  process.exit(0);
}

process.once("SIGINT", () => void handleShutdown("SIGINT"));
process.once("SIGTERM", () => void handleShutdown("SIGTERM"));

main().catch(async (error) => {
  console.error("❌ Fatal error:", error);
  await closeMongoConnection();
  process.exit(1);
});