import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nodespace.app',
  appName: 'NodeSpace',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
