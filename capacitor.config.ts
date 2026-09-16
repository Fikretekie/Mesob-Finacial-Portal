import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.meksova.app',
  appName: 'Meksova',
  webDir: 'build',
  android: {
    useLegacyBridge: true
  }
};

export default config;