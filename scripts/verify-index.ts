import * as mongoose from 'mongoose';

async function verifyIndex() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/event-system';
  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Database connection object not available.');
    process.exit(1);
  }

  try {
    const collection = db.collection('rulematches');

    // Ensure candidate compound index exists
    console.log('Ensuring candidate index { ruleId: 1, occurredAt: 1, agentId: 1 } exists...');
    await collection.createIndex({ ruleId: 1, occurredAt: 1, agentId: 1 });

    const sampleRuleId = new mongoose.Types.ObjectId();
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endTime = new Date();

    console.log('Running explain("executionStats") on candidate index for Report API #1 query...');
    const explainPlan: any = await collection
      .find({
        ruleId: sampleRuleId,
        occurredAt: { $gte: startTime, $lte: endTime },
      })
      .sort({ occurredAt: 1 })
      .project({ agentId: 1, occurredAt: 1, _id: 0 })
      .limit(100)
      .explain('executionStats');

    const executionStats = explainPlan.executionStats;
    const queryPlanner = explainPlan.queryPlanner;
    const winningPlan = queryPlanner?.winningPlan;

    console.log('\n================ EXPLAIN VERIFICATION REPORT ================');
    console.log(`Candidate Index:             { ruleId: 1, occurredAt: 1, agentId: 1 }`);
    console.log(`Query Tested:                find({ ruleId, occurredAt: { $gte, $lte } }).sort({ occurredAt: 1 }).project({ agentId: 1, occurredAt: 1, _id: 0 })`);
    console.log(`Winning Plan Stage:          ${winningPlan?.stage || winningPlan?.inputStage?.stage || 'UNKNOWN'}`);
    console.log(`Index Name Used:             ${winningPlan?.inputStage?.indexName || winningPlan?.indexName || 'None'}`);
    console.log(`Execution Time (ms):         ${executionStats?.executionTimeMillis ?? 'N/A'}`);
    console.log(`Total Keys Examined:         ${executionStats?.totalKeysExamined ?? 'N/A'}`);
    console.log(`Total Docs Examined:         ${executionStats?.totalDocsExamined ?? 'N/A'}`);
    console.log(`Total Docs Returned:         ${executionStats?.nReturned ?? 'N/A'}`);
    
    const isCovered = executionStats?.totalDocsExamined === 0 && (executionStats?.totalKeysExamined ?? 0) >= 0;
    console.log(`Is Covered Query (Docs=0):   ${isCovered ? 'YES (Index-covered scan)' : 'NO (Required document fetch stage)'}`);
    console.log('=============================================================\n');
  } catch (err) {
    console.error('Error verifying index:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

verifyIndex();
