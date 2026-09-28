import { Hono } from 'hono';
import { asJsonRoute, mountJson } from '../../core/handler';
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
import * as workshopBatches from '../catalog/workshopBatches';
import * as assetReviews from '../catalog/assets/reviews';
import * as assetSourceCheck from '../catalog/assets/source-check';
import * as assetLifecycle from '../catalog/assets/lifecycle';
import * as assetCoverage from '../catalog/assets/coverage';
import * as categories from '../catalog/categories';

const catalog = new Hono();

catalog.get('/products', mountJson((req) => products.GET(req)));
catalog.post('/products', mountJson((req) => products.POST(req)));
catalog.put('/products', mountJson((req) => products.PUT(req)));
catalog.delete('/products', mountJson((req) => products.DELETE(req)));

catalog.post('/collect', mountJson((req) => collect.POST(req)));

catalog.get('/styles', mountJson((req) => styles.GET(req)));
catalog.post('/styles', mountJson((req) => styles.POST(req)));
catalog.put('/styles', mountJson((req) => styles.PUT(req)));
catalog.delete('/styles', mountJson((req) => styles.DELETE(req)));
catalog.post('/styles/extract', mountJson((req) => styleExtract.POST(req)));
catalog.post('/styles/parse-link', mountJson((req) => styleParseLink.POST(req)));

catalog.get('/prompts', mountJson(() => prompts.GET()));
catalog.post('/prompts', mountJson((req) => prompts.POST(req)));
catalog.delete('/prompts', mountJson((req) => prompts.DELETE(req)));

catalog.post('/assets/deconstruct', mountJson((req) => assetDeconstruct.POST(req)));
catalog.get('/assets/deconstruct/progress', mountJson((req) => assetDeconstruct.GET_PROGRESS(req)));
catalog.post('/assets/seed', mountJson(() => assetSeed.POST()));
catalog.get('/assets/library', mountJson((req) => assetLibrary.GET(req)));
catalog.post('/assets/library', mountJson((req) => assetLibrary.POST(req)));
catalog.put('/assets/library', mountJson((req) => assetLibrary.PUT(req)));
catalog.delete('/assets/library', mountJson((req) => assetLibrary.DELETE(req)));
catalog.get('/assets/reviews', mountJson((req) => assetReviews.GET(req)));
catalog.post('/assets/reviews', mountJson((req) => assetReviews.POST(req)));
catalog.get('/assets/source-check', mountJson(() => assetSourceCheck.GET()));
catalog.post('/assets/source-check', mountJson((req) => assetSourceCheck.POST(req)));
catalog.get('/workshop-workspace', mountJson((req) => workspace.GET(req)));
catalog.put('/workshop-workspace', mountJson((req) => workspace.PUT(req)));
catalog.get('/workshop-batches', mountJson(() => workshopBatches.LIST()));
catalog.post('/workshop-batches', mountJson((req) => workshopBatches.CREATE(req)));
catalog.get('/workshop-batches/active', mountJson(() => workshopBatches.ACTIVE()));
catalog.post('/workshop-batches/active/archive', mountJson((req) => workshopBatches.ARCHIVE_ACTIVE(req)));
catalog.delete('/workshop-batches/history', mountJson(() => workshopBatches.CLEAR_HISTORY()));
catalog.get('/workshop-batches/:id', (c) => asJsonRoute(() => workshopBatches.GET(c.req.param('id')))(c.req.raw));
catalog.put('/workshop-batches/:id', (c) => asJsonRoute((req) => workshopBatches.PUT(req, c.req.param('id')))(c.req.raw));
catalog.delete('/workshop-batches/:id', (c) => asJsonRoute(() => workshopBatches.DELETE(c.req.param('id')))(c.req.raw));
catalog.patch('/workshop-batches/:id', (c) => asJsonRoute((req) => workshopBatches.RENAME(req, c.req.param('id')))(c.req.raw));
catalog.post('/workshop-batches/:id/duplicate', (c) => asJsonRoute(() => workshopBatches.DUPLICATE(c.req.param('id')))(c.req.raw));
catalog.post('/workshop-batches/:id/events', (c) => asJsonRoute((req) => workshopBatches.EVENTS(req, c.req.param('id')))(c.req.raw));
catalog.post('/assets/:type/:id/submit-review', (c) => asJsonRoute((req) => assetLifecycle.LIFECYCLE(req, c.req.param('type'), c.req.param('id'), 'submit-review'))(c.req.raw));
catalog.post('/assets/:type/:id/publish', (c) => asJsonRoute((req) => assetLifecycle.LIFECYCLE(req, c.req.param('type'), c.req.param('id'), 'publish'))(c.req.raw));
catalog.post('/assets/:type/:id/disable', (c) => asJsonRoute((req) => assetLifecycle.LIFECYCLE(req, c.req.param('type'), c.req.param('id'), 'disable'))(c.req.raw));
catalog.post('/assets/:type/:id/create-version', (c) => asJsonRoute((req) => assetLifecycle.LIFECYCLE(req, c.req.param('type'), c.req.param('id'), 'create-version'))(c.req.raw));
catalog.get('/assets/:type/:id/performance', (c) => asJsonRoute(() => assetLifecycle.PERFORMANCE(c.req.param('type'), c.req.param('id')))(c.req.raw));
catalog.get('/assets/coverage', mountJson(() => assetCoverage.COVERAGE()));
catalog.get('/categories', mountJson(() => categories.LIST()));
catalog.post('/categories/migration-preview', mountJson((req) => categories.PREVIEW(req)));
catalog.post('/categories/migration-apply', mountJson((req) => categories.APPLY(req)));

export default catalog;
