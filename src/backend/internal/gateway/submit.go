// Package gateway adapts vendor generation protocols.
package gateway

// CanTryAnotherEndpoint reports whether a failed submit may try the next
// endpoint. Timeouts, 5xx and missing task ids must not submit again.
func CanTryAnotherEndpoint(status int) bool {
	return status == 404 || status == 405 || status == 415
}
