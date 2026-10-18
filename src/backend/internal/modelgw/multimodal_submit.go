package modelgw

import (
	"context"
)

// SubmitMultimodal dispatches a vision understanding or OCR task to upstream endpoints.
func SubmitMultimodal(ctx context.Context, command SubmitCommand) SubmitResult {
	return DispatchModality(ctx, ModalityRequest{
		Modality:    ModalityMultimodal,
		Endpoints:   command.Endpoints,
		APIKey:      command.APIKey,
		PayloadJSON: command.PayloadJSON,
		Headers:     command.Headers,
		ReadTaskID:  command.ReadTaskID,
		Client:      command.Client,
	})
}
