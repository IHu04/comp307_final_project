import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { closeSessionStore } from './config/session.js';

const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
  await connectDB();

  const server = app.listen(port, () => {
    console.log('Listening on http://localhost:' + port);
  });

  async function stop(signal) {
    console.log('\nShutting down (' + signal + ')...');
    server.close(async () => {
      try {
        await closeSessionStore();
      } catch (e) {
        console.error(e);
      }
      await disconnectDB();
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
