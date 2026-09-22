import { Hono } from 'hono';
import { mountJson } from '../../core/handler';
import * as tasks from '../assets/tasks';
import * as storageTest from '../assets/storage/test';
import * as storageMigrate from '../assets/storage/migrate';
import * as storageUpload from '../assets/storage/upload';

const assets = new Hono();

assets.get('/tasks', mountJson((req) => tasks.GET(req)));
assets.delete('/tasks', mountJson((req) => tasks.DELETE(req)));
assets.post('/storage/test', mountJson((req) => storageTest.POST(req)));
assets.post('/storage/migrate', mountJson((req) => storageMigrate.POST(req)));
assets.post('/storage/upload', mountJson((req) => storageUpload.POST(req)));

export default assets;
