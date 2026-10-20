package system

import (
	"errors"
	"regexp"
	"strings"
)

var petCommandPattern = regexp.MustCompile(`^npx\s+codex-pets\s+add\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*$`)
var petIDPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type parsedPetCommand struct {
	input string
	id    string
	err   string
}

func parsePetCommands(text string) ([]parsedPetCommand, error) {
	lines := strings.Split(text, "\n")
	parsed := make([]parsedPetCommand, 0, len(lines))
	for _, line := range lines {
		input := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if input == "" {
			continue
		}
		parsed = append(parsed, parsePetCommand(input))
		if len(parsed) > 20 {
			return nil, errors.New("一次最多导入 20 条命令")
		}
	}
	if len(parsed) == 0 {
		return nil, errors.New("请粘贴 npx codex-pets add 命令")
	}
	return parsed, nil
}

func parsePetCommand(input string) parsedPetCommand {
	if strings.ContainsAny(input, "|&;`$<>(){}\\") {
		return parsedPetCommand{input: input, err: "只接受 npx codex-pets add 宠物标识"}
	}
	match := petCommandPattern.FindStringSubmatch(input)
	if match == nil {
		return parsedPetCommand{input: input, err: "只接受 npx codex-pets add 宠物标识"}
	}
	return parsedPetCommand{input: input, id: match[1]}
}

func validPetID(id string) bool {
	return petIDPattern.MatchString(id) && len(id) <= 80
}
