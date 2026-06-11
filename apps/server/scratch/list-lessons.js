import '../src/config/env.js';
import admin from 'firebase-admin';
import { initializeFirebase } from '../src/config/firebase.js';

initializeFirebase();
const db = admin.firestore();

async function run() {
  console.log('Querying lessons...');
  const snapshot = await db.collection('lessons').get();
  if (snapshot.empty) {
    console.log('No lessons found.');
    return;
  }
  console.log(`Found ${snapshot.size} lessons:`);
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`\nLesson ID: ${doc.id}`);
    console.log(`  Title: ${data.title || 'Untitled'}`);
    console.log(`  Status: ${data.status}`);
  }
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}).then(() => process.exit(0));
