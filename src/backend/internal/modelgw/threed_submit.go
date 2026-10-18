package modelgw

import (
	"context"
)

// SubmitThreeD dispatches a 3D mesh reconstruction task to upstream endpoints.
func SubmitThreeD(ctx context.Context, command SubmitCommand) SubmitResult {
	return DispatchModality(ctx, ModalityRequest{
		Modality:    ModalityThreeD,
		Endpoints:   command.Endpoints,
		APIKey:      command.APIKey,
		PayloadJSON: command.PayloadJSON,
		Headers:     command.Headers,
		ReadTaskID:  command.ReadTaskID,
		Client:      command.Client,
	})
}
