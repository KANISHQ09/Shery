import '../src/config/env.js';
import admin from 'firebase-admin';
import { initializeFirebase } from '../src/config/firebase.js';

initializeFirebase();

const db = admin.firestore();

async function run() {
  const wsId = 'SPWjWKykTvXJynK3OAt2';
  const sourcesSnapshot = await db.collection('workspaces').doc(wsId).collection('sources').get();
  console.log(`Sources count for ${wsId}: ${sourcesSnapshot.size}`);
  for (const doc of sourcesSnapshot.docs) {
    const data = doc.data();
    console.log(`- Source: ${doc.id}`);
    console.log(`  Title: ${data.title}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Transcript length: ${data.transcript?.length || 0}`);
    console.log(`  UpdatedAt: ${data.updatedAt}`);
  }
}

run().catch(console.error).then(() => process.exit(0));
