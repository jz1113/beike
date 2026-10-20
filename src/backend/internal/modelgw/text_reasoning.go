package modelgw

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Generated from src/shared/domain/models/textModelCapabilities.json by check-shared-data.
//
//go:embed textModelCapabilities.json
var textCapabilityJSON []byte

type textThinkingCapability struct {
	Protocol string         `json:"protocol"`
	Mode     string         `json:"thinking"`
	Levels   []string       `json:"levels"`
	Aliases  []string       `json:"aliases"`
	Budgets  map[string]int `json:"budgets"`
}

var textKnownCapabilities = func() map[string]textThinkingCapability {
	var data struct {
		Models map[string]textThinkingCapability `json:"models"`
	}
	if err := json.Unmarshal(textCapabilityJSON, &data); err != nil {
		panic(err)
	}
	for _, capability := range data.Models {
		for _, alias := range capability.Aliases {
			data.Models[alias] = capability
		}
	}
	return data.Models
}()

func textThinkingMode(model string) string {
	return textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))].Mode
}

// Normalize stale UI preferences using exactly the same ordered levels as TS.
func nativeTextEffort(model, effort string) string {
	capability, ok := textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))]
	if !ok || effort == "" || effort == "auto" {
		return ""
	}
	if effort != "low" && effort != "medium" && effort != "high" && effort != "xhigh" && effort != "max" {
		effort = "medium"
	}
	for _, level := range capability.Levels {
		if effort == level {
			return effort
		}
	}
	order := []string{"low", "medium", "high", "xhigh"}
	index := func(value string) int {
		for i, item := range order {
			if item == value {
				return i
			}
		}
		return 2
	}
	last := ""
	for _, level := range capability.Levels {
		if level == "max" {
			continue
		}
		last = level
		if index(level) >= index(effort) {
			return level
		}
	}
	return last
}

func textEffort(p map[string]any) string {
	return strings.ToLower(strings.TrimSpace(textString(p["reasoning_effort"])))
}

func geminiReasoning(config, p map[string]any, model string) error {
	effort := nativeTextEffort(model, textEffort(p))
	capability := textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))]
	if effort == "" || capability.Protocol != "gemini" {
		return nil
	}
	thinking := map[string]any{"includeThoughts": true}
	switch capability.Mode {
	case "level":
		thinking["thinkingLevel"] = effort
	case "budget":
		thinking["thinkingBudget"] = capability.Budgets[effort]
	default:
		return nil
	}
	config["thinkingConfig"] = thinking
	return nil
}

func anthropicReasoning(out, p map[string]any, model string) error {
	effort := nativeTextEffort(model, textEffort(p))
	capability := textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))]
	// Adaptive models may think by default even when effort is omitted.
	if capability.Protocol == "anthropic" && capability.Mode == "adaptive" {
		delete(out, "temperature")
		delete(out, "top_p")
		delete(out, "top_k")
	}
	if effort == "" || capability.Protocol != "anthropic" {
		return nil
	}
	if capability.Mode == "adaptive" {
		out["thinking"] = map[string]any{"type": "adaptive"}
		cfg := textMap(out["output_config"])
		if cfg == nil {
			cfg = map[string]any{}
		}
		cfg["effort"] = effort
		out["output_config"] = cfg
	} else if capability.Mode == "budget" {
		budget := capability.Budgets[effort]
		if budget < 1024 {
			return fmt.Errorf("invalid verified Claude budget for %q", model)
		}
		if textNumber(out["max_tokens"]) <= float64(budget) {
			return errors.New("Claude max_tokens must exceed thinking budget")
		}
		out["thinking"] = map[string]any{"type": "enabled", "budget_tokens": budget}
	} else {
		return nil
	}
	choice := textString(textMap(out["tool_choice"])["type"])
	if choice == "any" || choice == "tool" {
		return errors.New("Claude thinking is incompatible with forced tool choice")
	}
	delete(out, "temperature")
	delete(out, "top_p")
	delete(out, "top_k")
	return nil
}
