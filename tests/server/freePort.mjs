// A port nothing on this machine is using, for a test server: the system picks it (a fixed random range can hit
// one that's taken, like macOS's AirPlay Receiver on 5000).
import { createServer } from 'node:net';

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
