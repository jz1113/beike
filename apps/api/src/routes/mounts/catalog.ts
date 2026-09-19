import { Hono } from 'hono';
import * as products from '../catalog/products';
import * as collect from '../catalog/collect';
import * as styles from '../catalog/styles';
import * as styleExtract from '../catalog/styles/extract';
import * as styleParseLink from '../catalog/styles/parse-link';
import * as prompts from '../catalog/prompts';
import * as assetDeconstruct from '../catalog/assets/deconstruct';
import * as assetLibrary from '../catalog/assets/library';
import * as assetSeed from '../catalog/assets/seed';
import * as workspace from '../catalog/workspace';
import * as assetReviews from '../catalog/assets/reviews';
import * as assetSourceCheck from '../catalog/assets/source-check';

const catalog = new Hono();

catalog.get('/products', (c) => products.GET(c.req.raw));
catalog.post('/products', (c) => products.POST(c.req.raw));
catalog.put('/products', (c) => products.PUT(c.req.raw));
catalog.delete('/products', (c) => products.DELETE(c.req.raw));

catalog.post('/collect', (c) => collect.POST(c.req.raw));

catalog.get('/styles', (c) => styles.GET(c.req.raw));
catalog.post('/styles', (c) => styles.POST(c.req.raw));
catalog.put('/styles', (c) => styles.PUT(c.req.raw));
catalog.delete('/styles', (c) => styles.DELETE(c.req.raw));
catalog.post('/styles/extract', (c) => styleExtract.POST(c.req.raw));
catalog.post('/styles/parse-link', (c) => styleParseLink.POST(c.req.raw));

catalog.get('/prompts', () => prompts.GET());
catalog.post('/prompts', (c) => prompts.POST(c.req.raw));
catalog.delete('/prompts', (c) => prompts.DELETE(c.req.raw));

catalog.post('/assets/deconstruct', (c) => assetDeconstruct.POST(c.req.raw));
catalog.post('/assets/seed', (c) => assetSeed.POST(c.req.raw));
catalog.get('/assets/library', (c) => assetLibrary.GET(c.req.raw));
catalog.post('/assets/library', (c) => assetLibrary.POST(c.req.raw));
catalog.put('/assets/library', (c) => assetLibrary.PUT(c.req.raw));
catalog.delete('/assets/library', (c) => assetLibrary.DELETE(c.req.raw));
catalog.get('/assets/reviews', (c) => assetReviews.GET(c.req.raw));
catalog.post('/assets/reviews', (c) => assetReviews.POST(c.req.raw));
catalog.get('/assets/source-check', () => assetSourceCheck.GET());
catalog.post('/assets/source-check', (c) => assetSourceCheck.POST(c.req.raw));
catalog.get('/workshop-workspace', (c) => workspace.GET(c.req.raw));
catalog.put('/workshop-workspace', (c) => workspace.PUT(c.req.raw));

export default catalog;
