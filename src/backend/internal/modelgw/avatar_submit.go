package modelgw

import (
	"context"
)

// SubmitAvatar dispatches a digital human generation or lip-sync task.
func SubmitAvatar(ctx context.Context, command SubmitCommand) SubmitResult {
	return DispatchModality(ctx, ModalityRequest{
		Modality:    ModalityAvatar,
		Endpoints:   command.Endpoints,
		APIKey:      command.APIKey,
		PayloadJSON: command.PayloadJSON,
		Headers:     command.Headers,
		ReadTaskID:  command.ReadTaskID,
		Client:      command.Client,
	})
}
