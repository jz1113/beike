package generate

import "beike.local/cloud/src/backend/internal/gateway"

func attachUsage(body, source map[string]any) {
	if usage := gateway.NormalizeUsage(source); usage != nil {
		body["usage"] = usage
	}
}
