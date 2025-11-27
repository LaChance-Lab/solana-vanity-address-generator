import { generateSolanaVanityKeypair } from "./generate";
import { MongoClient } from 'mongodb';

const MONGO_URI = ""

// MongoDB connection
let client: MongoClient;
let db: any;

async function connectToMongoDB() {
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('metafresh');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

async function saveAddressToDB(publicKey: string, privateKey: string) {
  try {
    const collection = db.collection('pumpaddr');
    const addressData = {
      publicKey,
      privateKey,
      isActive: false,
      createdAt: new Date(),
      suffix: 'pump'
    };
    
    const result = await collection.insertOne(addressData);
    console.log(`💾 Address saved to DB with ID: ${result.insertedId}`);
    return result;
  } catch (error) {
    console.error('❌ Error saving to database:', error);
    throw error;
  }
}

async function main() {
  // Connect to MongoDB first
  await connectToMongoDB();
  
  let addressCount = 0;
  
  while (true) {
    try {
      addressCount++;
      console.log(`\n=== Generating address #${addressCount} ===`);
      
      const result = await generateSolanaVanityKeypair({
        // prefix: 'ABC',
        suffix: 'pump',
        timeoutSeconds: 600,
        cores: 20
      });
      
      console.log(`✅ Address #${addressCount} generated:`, result);
      console.log(`Public Key: ${result.publicKey}`);
      console.log(`Private Key: ${result.privateKey}`);
      
      // Save to MongoDB
      await saveAddressToDB(result.publicKey, result.privateKey);
      
      // Optional: Add a small delay between generations
      // await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.error(`❌ Error generating address #${addressCount}:`, error.message);
      // Continue to next iteration instead of breaking
    }
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
  process.exit(0);
});

main().catch(async (error) => {
  console.error('❌ Fatal error:', error);
  if (client) {
    await client.close();
  }
  process.exit(1);
});