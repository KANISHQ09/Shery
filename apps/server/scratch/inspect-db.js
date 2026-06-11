import '../src/config/env.js';
import admin from 'firebase-admin';
import { initializeFirebase } from '../src/config/firebase.js';

initializeFirebase();

const db = admin.firestore();

async function run() {
  console.log('Querying workspaces...');
  const wsSnapshot = await db.collection('workspaces').get();
  
  if (wsSnapshot.empty) {
    console.log('No workspaces found.');
    return;
  }
  
  console.log(`Found ${wsSnapshot.size} workspaces:`);
  for (const doc of wsSnapshot.docs) {
    const data = doc.data();
    console.log(`\nWorkspace ID: ${doc.id}`);
    console.log(`  Name: ${data.name || 'Untitled'}`);
    
    // Count sources
    const sourcesSnapshot = await db.collection('workspaces').doc(doc.id).collection('sources').get();
    console.log(`  Sources count: ${sourcesSnapshot.size}`);
    for (const sDoc of sourcesSnapshot.docs) {
      const sData = sDoc.data();
      console.log(`    - Source: [${sDoc.id}] ${sData.title || 'Untitled'} (status: ${sData.status}, transcript len: ${sData.transcript?.length || 0})`);
    }
    
    // Count outputs
    const outputsSnapshot = await db.collection('workspaces').doc(doc.id).collection('outputs').get();
    console.log(`  Outputs count: ${outputsSnapshot.size}`);
    for (const oDoc of outputsSnapshot.docs) {
      const oData = oDoc.data();
      console.log(`    - Output: [${oDoc.id}] ${oData.title} (type: ${oData.type}, status: ${oData.status}, content snippet: ${oData.content?.substring(0, 100)}...)`);
    }
  }
}

run().catch(err => {
  console.error('Error running check script:', err);
  process.exit(1);
}).then(() => process.exit(0));
