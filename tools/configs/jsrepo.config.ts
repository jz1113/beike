import { defineConfig } from 'jsrepo';

/** 从仓库根目录调用：`pnpm exec jsrepo --config tools/configs/jsrepo.config.ts` */
export default defineConfig({
    registries: ['https://reactbits.dev/r'],
    paths: {
        component: '../../apps/web/src/shared/ui',
        file: '../../apps/web/src/shared/ui',
    },
});
