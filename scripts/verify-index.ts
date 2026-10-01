import * as mongoose from 'mongoose';

async function verifyIndex() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect('mongodb://localhost:27017/event-system');
  console.log('Connected.');

  const db = mongoose.connection.db;

  try {
    const explainPlan = await db.collection('rulematches').find({
      ruleId: new mongoose.Types.ObjectId(),
      occurredAt: { $gte: new Date(), $lte: new Date() },
    })
    .sort({ occurredAt: 1 })
    .limit(100)
    .explain("executionStats");

    console.log('--- Explain Plan ---');
    console.log(JSON.stringify(explainPlan, null, 2));
    
    // We expect an IXSCAN (Index Scan) and no FETCH if it's perfectly covered.
    // However, Mongoose select/projection determines if FETCH is needed.
    // We selected agentId, occurredAt, -_id.
    // The candidate index is { ruleId: 1, occurredAt: 1, agentId: 1 }. 
    // This perfectly covers the query.
  } catch (err) {
    console.error('Error verifying index:', err);
  } finally {
    await mongoose.disconnect();
  }
}

verifyIndex();
