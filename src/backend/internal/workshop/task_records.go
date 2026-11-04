package workshop

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
	"net/http"
)

// Image submission keys start with the batch ID and content ID. A grid is
// submitted once even though its snapshot contains four delivery slices.
const workshopTaskSource = `
 SELECT t.id, b.name || ' · ' || COALESCE((
  SELECT json_extract(i.value,'$.title') FROM json_each(b.snapshotJson,'$.items') i
  WHERE instr(t.idempotencyKey,b.id||':'||json_extract(i.value,'$.id')||':')=1 LIMIT 1
 ),'配图'), 'image',
 CASE upper(t.status) WHEN 'SUCCESS' THEN 'completed' WHEN 'FAILURE' THEN 'failed' WHEN 'PENDING' THEN 'queued' WHEN 'SUBMISSION_UNKNOWN' THEN 'uncertain' WHEN 'IN_PROGRESS' THEN 'running' WHEN 'SUBMITTING' THEN 'running' WHEN 'CANCELED' THEN 'canceled' WHEN 'CANCELLED' THEN 'canceled' ELSE lower(t.status) END,
 t.createdAt,'',CASE WHEN upper(t.status) IN ('SUCCESS','FAILURE') THEN t.updatedAt ELSE '' END,
 COALESCE(t.model,''),COALESCE(t.taskId,''),b.name || ' · ' || b.id,COALESCE(t.failReason,''),'',COALESCE(t.resultUrl,'')
 FROM ImageTask t JOIN WorkshopBatch b ON b.workspaceId=t.workspaceId AND b.id=substr(t.idempotencyKey,1,instr(t.idempotencyKey,':')-1)
 WHERE t.workspaceId=?1 AND COALESCE(t.mediaType,'image')='image'
 UNION ALL
 SELECT legacy.recordKey, legacy.name, 'image',
 CASE WHEN max(legacy.uncertain)=1 THEN 'uncertain'
      WHEN max(legacy.state='IN_PROGRESS')=1 THEN 'running'
      WHEN max(legacy.state='FAILURE')=1 AND max(legacy.state='SUCCESS')=1 THEN 'partial'
      WHEN max(legacy.state='FAILURE')=1 THEN 'failed'
      WHEN min(legacy.state='SUCCESS')=1 THEN 'completed' ELSE 'queued' END,
 '', '', '', legacy.model, max(legacy.external), legacy.batchName, max(legacy.error),
 '批次快照', CASE WHEN count(*)=1 THEN max(legacy.result) ELSE '' END
 FROM (
 SELECT coalesce(nullif(json_extract(t.value,'$.gridTaskKey'),''), json_extract(t.value,'$.id')) AS recordKey,
 b.id AS batchId, b.name || ' · ' || b.id AS batchName, coalesce(json_extract(i.value,'$.title'),b.name) AS name,
 coalesce(json_extract(t.value,'$.learningContext.model'),'') AS model,
 coalesce(json_extract(t.value,'$.upstreamTaskId'),'') AS external,
 coalesce(json_extract(t.value,'$.error'),'') AS error, coalesce(json_extract(t.value,'$.resultUrl'),'') AS result,
 json_extract(t.value,'$.status') AS state, coalesce(json_extract(t.value,'$.recoveryRequired'),0) AS uncertain
 FROM WorkshopBatch b, json_each(b.snapshotJson,'$.items') i, json_each(i.value,'$.tasks') t
 WHERE b.workspaceId=?1 AND NOT EXISTS (
 SELECT 1 FROM ImageTask receipt WHERE receipt.workspaceId=b.workspaceId AND coalesce(receipt.mediaType,'image')='image'
 AND receipt.idempotencyKey=coalesce(nullif(json_extract(t.value,'$.gridTaskKey'),''),json_extract(t.value,'$.idempotencyKey'))
 AND instr(receipt.idempotencyKey,b.id||':')=1)
 ) legacy GROUP BY legacy.batchId,legacy.recordKey
 UNION ALL
 SELECT r.id,b.name,r.kind,CASE r.status WHEN 'partial_failed' THEN 'partial' WHEN 'cancelled' THEN 'canceled' ELSE r.status END,
 r.createdAt,COALESCE(r.startedAt,''),COALESCE(r.finishedAt,''),'','',b.name || ' · ' || b.id,COALESCE(r.errorSummary,''),
 CASE WHEN r.totalTasks>0 THEN printf('%d/%d',r.completedTasks,r.totalTasks) ELSE '' END,''
 FROM WorkshopPipelineRun r JOIN WorkshopBatch b ON b.id=r.batchId AND b.workspaceId=r.workspaceId WHERE r.workspaceId=?1
 UNION ALL
 SELECT json_extract(r.value,'$.id'),b.name,json_extract(r.value,'$.kind'),
 CASE json_extract(r.value,'$.status') WHEN 'partial_failed' THEN 'partial' WHEN 'cancelled' THEN 'canceled' ELSE json_extract(r.value,'$.status') END,
 coalesce(json_extract(r.value,'$.startedAt'),''),coalesce(json_extract(r.value,'$.startedAt'),''),
 coalesce(json_extract(r.value,'$.finishedAt'),''),'','',b.name || ' · ' || b.id,coalesce(json_extract(r.value,'$.errorSummary'),''),
 CASE WHEN json_extract(r.value,'$.totalTasks')>0 THEN printf('%d/%d',json_extract(r.value,'$.completedTasks'),json_extract(r.value,'$.totalTasks')) ELSE '' END,''
 FROM WorkshopBatch b,json_each(b.snapshotJson,'$.pipeline.runs') r
 WHERE b.workspaceId=?1 AND NOT EXISTS(SELECT 1 FROM WorkshopPipelineRun stored WHERE stored.workspaceId=?1 AND stored.id=json_extract(r.value,'$.id'))`

func TaskRecords(cfg config.Config) http.HandlerFunc {
	return taskrecords.Handler(cfg, workshopTaskSource, nil)
}
