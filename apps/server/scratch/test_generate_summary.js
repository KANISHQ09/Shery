import '../src/config/env.js';
import container from '../src/container.js';

async function run() {
  const lessonId = '562a819e-55b9-41bf-8a70-a6d62e190c3e';
  console.log(`Generating summary for lesson ${lessonId}...`);
  const summary = await container.chatService.generateSummary(lessonId, 'full');
  console.log('\n--- SUMMARY OUTPUT ---');
  console.log(summary);
  console.log('\n----------------------');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}).then(() => process.exit(0));
