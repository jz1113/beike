import { Hono } from 'hono';
import { mountJson } from '../../core/handler';
import * as proxyImage from '../system/proxy-image';
import * as systemConfig from '../system/config';
import * as localStorageStats from '../system/local-storage';
import * as depthEnv from '../system/depth-env';
import * as modelsFetch from '../system/models/fetch';
import * as modelsPricing from '../system/models/pricing';
import * as memoryCleanup from '../system/memory-cleanup';
import * as gatewayUser from '../system/gateway-user';
import * as mediaReview from '../system/media-review';

const system = new Hono();

// 二进制图片代理，不走 JSON envelope。
system.get('/proxy-image', (c) => proxyImage.GET(c.req.raw));
system.get('/config', mountJson(() => systemConfig.GET()));
system.post('/config', mountJson((req) => systemConfig.POST(req)));
system.get('/local-storage/stats', mountJson(() => localStorageStats.GET()));
system.post('/local-storage/clear-derived', mountJson((req) => localStorageStats.POST(req)));
system.get('/depth-env', mountJson(() => depthEnv.GET()));
system.post('/models/fetch', mountJson((req) => modelsFetch.POST(req)));
system.get('/models/pricing', mountJson(() => modelsPricing.GET()));
system.post('/gateway-user', mountJson((req) => gatewayUser.POST(req)));
system.post('/memory-cleanup', mountJson(() => memoryCleanup.POST()));
system.get('/media-review', mountJson(() => mediaReview.GET()));

export default system;
