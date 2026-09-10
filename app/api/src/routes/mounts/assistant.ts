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

const assistant = new Hono();

assistant.post('/media', (c) => assistantMedia.POST(c.req.raw));
assistant.post('/chat', (c) => assistantChat.POST(c.req.raw));
assistant.post('/turn/start', (c) => assistantTurn.startTurn(c.req.raw));
assistant.post('/turn/approve', (c) => assistantTurn.approveTurn(c.req.raw));
assistant.post('/turn/interrupt', (c) => assistantTurn.interruptTurn(c.req.raw));
assistant.get('/threads/:threadId/turns', (c) => assistantTurns.listThreadTurns(c.req.raw));
assistant.get('/threads/:threadId/runs', (c) => assistantRuns.listActiveRuns(c.req.raw));
assistant.get('/turns/:turnId/snapshot', (c) => assistantTurns.getTurnSnapshot(c.req.raw));
assistant.post('/turns/:turnId/recover', (c) => assistantRecover.recoverTurn(c.req.raw));
assistant.get('/runs', (c) => assistantRuns.listAllRuns(c.req.raw));
assistant.get('/threads/:threadId/memory', (c) => memoryRoute(c.req.raw, c.req.param('threadId')));
assistant.put('/threads/:threadId/memory', (c) => memoryRoute(c.req.raw, c.req.param('threadId')));
assistant.get('/sessions', () => assistantSessions.GET());
assistant.put('/sessions', (c) => assistantSessions.PUT(c.req.raw));
assistant.delete('/sessions', (c) => assistantSessions.DELETE(c.req.raw));
assistant.post('/extract-document', (c) => extractDocument.POST(c.req.raw));

export default assistant;
