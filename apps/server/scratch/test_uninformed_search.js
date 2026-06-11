import '../src/config/env.js';
import container from '../src/container.js';

async function run() {
  const lessonId = '562a819e-55b9-41bf-8a70-a6d62e190c3e';
  const query = 'What is uninformed search?';
  console.log(`Running query: "${query}" on lesson ${lessonId}...`);
  
  const generator = container.chatService.streamChat({
    lessonId,
    message: query,
    currentTime: 0,
    history: []
  });

  let fullResponse = '';
  for await (const event of generator) {
    if (event.type === 'token') {
      process.stdout.write(event.content);
      fullResponse += event.content;
    } else if (event.type === 'done') {
      console.log('\n\n--- DONE EVENT ---');
      console.log('Follow-ups:', event.followUps);
    } else if (event.type === 'error') {
      console.error('\n\n--- ERROR EVENT ---', event.message);
    }
  }

  console.log('\nFull Response Length:', fullResponse.length);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}).then(() => process.exit(0));
