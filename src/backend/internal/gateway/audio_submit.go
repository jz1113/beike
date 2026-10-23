package gateway

import (
	"context"
)

// SubmitAudio dispatches a TTS or music generation task to upstream endpoints.
func SubmitAudio(ctx context.Context, command SubmitCommand) SubmitResult {
	return DispatchModality(ctx, ModalityRequest{
		Modality:    ModalityAudio,
		Endpoints:   command.Endpoints,
		APIKey:      command.APIKey,
		PayloadJSON: command.PayloadJSON,
		Headers:     command.Headers,
		ReadTaskID:  command.ReadTaskID,
		Client:      command.Client,
	})
}
