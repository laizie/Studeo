import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Studeo',
    // Forge appends the right extension per platform: .icns on macOS, .ico on Windows
    icon: './assets/icon',
    appBundleId: 'com.studeo.app',
    appCategoryType: 'public.app-category.education',
  },
  rebuildConfig: {},
  makers: [
    // Windows — produces a Squirrel installer (.exe)
    new MakerSquirrel({
      name: 'Studeo',
      setupIcon: './assets/icon.ico',
      setupExe: 'StudeoSetup.exe',
    }),
    // macOS — produces a drag-to-Applications DMG
    new MakerDMG({
      name: 'Studeo',
      icon: './assets/icon.icns',
    }),
    // macOS fallback ZIP (also used by GitHub Actions artifact uploads)
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
    }),
  ],
};

export default config;
