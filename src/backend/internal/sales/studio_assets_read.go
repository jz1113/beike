package sales

import (
	"context"
	"database/sql"
)

// Return the complete catalog or an error. A partial catalog would make the
// client mistake temporarily unreadable assets for deleted selections.
func readStudioAssets(ctx context.Context, db *sql.DB, workspace string) (map[string]any, error) {
	personas, err := queryStudioPersonas(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	scenes, err := queryStudioScenes(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	actions, err := queryStudioActions(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	voices, err := queryStudioVoices(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	bgms, err := queryStudioBgms(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	return map[string]any{"success": true, "personas": personas, "scenes": scenes, "actions": actions, "voices": voices, "bgms": bgms}, nil
}
