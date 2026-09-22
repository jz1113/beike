import { Hono } from 'hono';
import { asJsonRoute, mountJson } from '../../core/handler';
import * as review from '../workshop/review';

const workshop = new Hono();
workshop.post('/tasks/:taskId/review', (c) => asJsonRoute((req) => review.REVIEW(req, c.req.param('taskId')))(c.req.raw));

export default workshop;
