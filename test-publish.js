#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  console.log('🧪 Testing npm publish (dry-run)...');
  const result = execSync('npm publish --dry-run', { 
    cwd: __dirname, 
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(result);
  console.log('✅ Dry-run successful! Package is ready to publish.');
} catch (error) {
  console.error('❌ Dry-run failed:', error.message);
  console.error(error.stdout);
}