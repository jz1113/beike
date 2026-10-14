package library

import (
	"context"
	"strings"
	"testing"
)

func TestLibrarySceneDetailUsesActionsThenTemplates(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","description","provenance") VALUES
		('room','local','窗边','安静的房间','manual'),
		('ride','local','车内随拍','副驾看风景','manual'),
		('ear','local','耳饰特写','耳环在窗边','manual'),
		('official','official','官方场景','客厅','manual')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "ActionAsset"
		("id","workspaceId","title","action","shotType","shotOrder","sceneId","provenance","createdAt") VALUES
		('late','local','后镜','后一个动作','half_body',2,'room','manual','2026-01-02T00:00:00.000Z'),
		('early','local','前镜','前一个动作','half_body',1,'room','manual','2026-01-03T00:00:00.000Z'),
		('fifth','local','第五镜','超出的动作','half_body',5,'room','manual','2026-01-04T00:00:00.000Z'),
		('third','local','第三镜','第三个动作','half_body',3,'room','manual','2026-01-05T00:00:00.000Z'),
		('fourth','local','第四镜','第四个动作','half_body',4,'room','manual','2026-01-06T00:00:00.000Z'),
		('foreign','elsewhere','别人的','不该出现','half_body',1,'room','manual','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	room, err := LibrarySceneDetail(context.Background(), db, "local", "room")
	if err != nil || !strings.Contains(string(room), `"shotCount":4`) {
		t.Fatalf("room %s %v", room, err)
	}
	body := string(room)
	shotsAt := strings.Index(body, `"shots":`)
	if shotsAt < 0 || !strings.Contains(body[:shotsAt], `"id":"fifth"`) || strings.Contains(body[shotsAt:], `"id":"fifth"`) {
		t.Fatalf("shot trim %s", room)
	}
	if strings.Index(body[shotsAt:], `"id":"early"`) > strings.Index(body[shotsAt:], `"id":"late"`) {
		t.Fatalf("shot order %s", room)
	}
	if strings.Contains(string(room), "别人的") {
		t.Fatalf("foreign action leaked %s", room)
	}
	ride, err := LibrarySceneDetail(context.Background(), db, "local", "ride")
	if err != nil || !strings.Contains(string(ride), `"title":"车内随行抓拍"`) || !strings.Contains(string(ride), `"shotCount":4`) || !strings.Contains(string(ride), `"provenance":"harmonized"`) {
		t.Fatalf("ride %s %v", ride, err)
	}
	ear, err := LibrarySceneDetail(context.Background(), db, "local", "ear")
	if err != nil || !strings.Contains(string(ear), "耳际局部超清微距特写") {
		t.Fatalf("ear %s %v", ear, err)
	}
	official, err := LibrarySceneDetail(context.Background(), db, "local", "official")
	if err != nil || !strings.Contains(string(official), `"title":"官方场景"`) {
		t.Fatalf("official %s %v", official, err)
	}
	if _, err := LibrarySceneDetail(context.Background(), db, "local", "missing"); err != ErrLibraryDetailMissing {
		t.Fatalf("missing %v", err)
	}
}
