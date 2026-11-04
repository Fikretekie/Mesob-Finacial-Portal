import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.meksova.app',
  appName: 'Meksova',
  webDir: 'build',
  // Matches --bg in tokens.css so there is no white flash before first paint.
  backgroundColor: '#0A0A0B',
  android: {
    useLegacyBridge: true
  },
  plugins: {
    // Light status-bar icons on the app's dark field.
    SystemBars: {
      style: 'DARK'
    }
  }
};

export default config;
