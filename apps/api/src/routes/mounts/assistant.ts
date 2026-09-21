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

const assistant = new Hono();

assistant.post('/media', (c) => assistantMedia.POST(c.req.raw));
assistant.post('/chat', async (c) => withDeprecation(await assistantChat.POST(c.req.raw))); // legacy alias → 与 /turn/start 同引擎；Web 主路径已改用 /turn/start
assistant.post('/turn/start', (c) => assistantTurn.startTurn(c.req.raw));
assistant.post('/turn/approve', (c) => assistantTurn.approveTurn(c.req.raw));
assistant.post('/turn/interrupt', (c) => assistantTurn.interruptTurn(c.req.raw));
assistant.get('/threads/:threadId/turns', (c) => assistantTurns.listThreadTurns(c.req.raw));
assistant.get('/threads/:threadId/runs', async (c) => withDeprecation(await assistantRuns.listActiveRuns(c.req.raw), '/api/assistant/threads/:threadId/turns')); // 无 Web 消费者；保留给恢复/运维查询活跃 turn
assistant.get('/turns/:turnId/snapshot', (c) => assistantTurns.getTurnSnapshot(c.req.raw));
assistant.post('/turns/:turnId/recover', (c) => assistantRecover.recoverTurn(c.req.raw));
assistant.get('/runs', async (c) => withDeprecation(await assistantRuns.listAllRuns(c.req.raw), '/api/assistant/threads/:threadId/turns')); // 同上，任务中心前端已移除
assistant.get('/threads/:threadId/memory', (c) => memoryRoute(c.req.raw, c.req.param('threadId')));
assistant.put('/threads/:threadId/memory', (c) => memoryRoute(c.req.raw, c.req.param('threadId')));
assistant.get('/sessions', () => assistantSessions.GET());
assistant.put('/sessions', (c) => assistantSessions.PUT(c.req.raw));
assistant.delete('/sessions', (c) => assistantSessions.DELETE(c.req.raw));
assistant.post('/extract-document', (c) => extractDocument.POST(c.req.raw));

export default assistant;
