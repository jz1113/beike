import { memoryRoute } from '../assistant/memory';
import * as assistantMedia from '../assistant/media';
import { Hono } from 'hono';
import * as assistantChat from '../assistant/chat';
import * as assistantTurn from '../assistant/turn';
import * as assistantSessions from '../assistant/sessions';
import * as assistantTurns from '../assistant/turns';
import * as assistantRuns from '../assistant/runs';
import * as assistantRecover from '../assistant/recover';
import * as extractDocument from '../assistant/extract-document';
import { withDeprecation } from '../../core/http';
import { asJsonRoute, mountJson } from '../../core/handler';

const assistant = new Hono();

// 二进制上传，不走 JSON envelope。
assistant.post('/media', (c) => assistantMedia.POST(c.req.raw));
assistant.post('/chat', async (c) => withDeprecation(await asJsonRoute((req) => assistantChat.POST(req))(c.req.raw)));
assistant.post('/turn/start', mountJson((req) => assistantTurn.startTurn(req)));
assistant.post('/turn/approve', mountJson((req) => assistantTurn.approveTurn(req)));
assistant.post('/turn/interrupt', mountJson((req) => assistantTurn.interruptTurn(req)));
assistant.get('/threads/:threadId/turns', mountJson((req) => assistantTurns.listThreadTurns(req)));
assistant.get('/threads/:threadId/runs', async (c) => withDeprecation(await asJsonRoute((req) => assistantRuns.listActiveRuns(req))(c.req.raw), '/api/assistant/threads/:threadId/turns'));
assistant.get('/turns/:turnId/snapshot', mountJson((req) => assistantTurns.getTurnSnapshot(req)));
assistant.post('/turns/:turnId/recover', mountJson((req) => assistantRecover.recoverTurn(req)));
assistant.get('/runs', async (c) => withDeprecation(await asJsonRoute((req) => assistantRuns.listAllRuns(req))(c.req.raw), '/api/assistant/threads/:threadId/turns'));
assistant.get('/threads/:threadId/memory', (c) => asJsonRoute((req) => memoryRoute(req, c.req.param('threadId')))(c.req.raw));
assistant.put('/threads/:threadId/memory', (c) => asJsonRoute((req) => memoryRoute(req, c.req.param('threadId')))(c.req.raw));
assistant.get('/sessions', mountJson(() => assistantSessions.GET()));
assistant.put('/sessions', mountJson((req) => assistantSessions.PUT(req)));
assistant.delete('/sessions', mountJson((req) => assistantSessions.DELETE(req)));
assistant.post('/extract-document', mountJson((req) => extractDocument.POST(req)));

export default assistant;
