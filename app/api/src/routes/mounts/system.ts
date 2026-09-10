import { Hono } from 'hono';
import * as proxyImage from '../system/proxy-image';
import * as systemConfig from '../system/config';
import * as desktopEnv from '../system/desktop-env';
import * as localStorageStats from '../system/local-storage';
import * as depthEnv from '../system/depth-env';
import * as modelsFetch from '../system/models/fetch';
import * as devLog from '../system/dev-log';
import * as memoryCleanup from '../system/memory-cleanup';
import * as gatewayUser from '../system/gateway-user';

const system = new Hono();

system.get('/proxy-image', (c) => proxyImage.GET(c.req.raw));
system.get('/config', () => systemConfig.GET());
system.post('/config', (c) => systemConfig.POST(c.req.raw));
system.post('/desktop-env', (c) => desktopEnv.POST(c.req.raw));
system.get('/local-storage/stats', () => localStorageStats.GET());
system.post('/local-storage/clear-derived', (c) => localStorageStats.POST(c.req.raw));
system.get('/depth-env', () => depthEnv.GET());
system.post('/models/fetch', (c) => modelsFetch.POST(c.req.raw));
system.post('/gateway-user', (c) => gatewayUser.POST(c.req.raw));
system.post('/dev-log', (c) => devLog.POST(c.req.raw));
system.post('/memory-cleanup', () => memoryCleanup.POST());

export default system;
