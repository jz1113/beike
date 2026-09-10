import { Hono } from 'hono';
import * as tasks from '../assets/tasks';
import * as storageTest from '../assets/storage/test';
import * as storageMigrate from '../assets/storage/migrate';
import * as storageUpload from '../assets/storage/upload';

const assets = new Hono();

assets.get('/tasks', (c) => tasks.GET(c.req.raw));
assets.delete('/tasks', (c) => tasks.DELETE(c.req.raw));
assets.post('/storage/test', (c) => storageTest.POST(c.req.raw));
assets.post('/storage/migrate', (c) => storageMigrate.POST(c.req.raw));
assets.post('/storage/upload', (c) => storageUpload.POST(c.req.raw));

export default assets;

