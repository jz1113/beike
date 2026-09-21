import { Hono } from 'hono';
import * as imageGen from '../generate/image';
import * as videoGen from '../generate/video';
import * as depthVideo from '../generate/depth-video';
import * as depthImage from '../generate/depth-image';
import * as analyze from '../generate/analyze';
import * as copywriting from '../generate/copywriting';
import * as headlineTitle from '../generate/headline-title';
import * as headlineDesign from '../generate/headline-design';
import * as exportZip from '../generate/export-zip';
import * as uploadRef from '../generate/upload-ref';

import * as layerDecomposition from '../generate/layer-decomposition';

const generate = new Hono();

generate.post('/layer-decomposition', (c) => layerDecomposition.POST(c.req.raw));
generate.post('/image', (c) => imageGen.POST(c.req.raw));
generate.get('/image', (c) => imageGen.GET(c.req.raw));
generate.post('/video', (c) => videoGen.POST(c.req.raw));
generate.get('/video', (c) => videoGen.GET(c.req.raw));
generate.post('/depth-video', (c) => depthVideo.POST(c.req.raw));
generate.get('/depth-video', (c) => depthVideo.GET(c.req.raw));
generate.post('/depth-image', (c) => depthImage.POST(c.req.raw));
generate.post('/analyze', (c) => analyze.POST(c.req.raw));
generate.post('/copywriting', (c) => copywriting.POST(c.req.raw));
generate.post('/headline-title', (c) => headlineTitle.POST(c.req.raw));
generate.post('/headline-design', (c) => headlineDesign.POST(c.req.raw));
generate.post('/export-zip', (c) => exportZip.POST(c.req.raw));
generate.post('/upload-ref', (c) => uploadRef.POST(c.req.raw));

export default generate;
