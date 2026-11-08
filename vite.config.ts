import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Relative assets work on GitHub project Pages and root-domain static hosts.
export default defineConfig({ plugins: [react()], base: './' });
