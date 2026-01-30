import app from './app';
import { config } from './config';

app.listen(Number(config.port), '0.0.0.0', () => {
  console.log(`Server is running on port ${config.port}`);
});
