package assistant

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/dop251/goja"
)

const (
	sandboxMaxCode   = 32_000
	sandboxMaxInput  = 1_000_000
	sandboxMaxOutput = 32_000
	sandboxMaxLines  = 100
)

func RunSandbox(code string, input any, timeout time.Duration) ([]string, error) {
	return runSandbox(code, input, timeout, nil)
}

func runSandbox(code string, input any, timeout time.Duration, tools map[string]func(map[string]any) string) ([]string, error) {
	if len(code) > sandboxMaxCode {
		return nil, errors.New("代码超过 32000 字符限制")
	}
	if timeout <= 0 || timeout > 120*time.Second {
		timeout = 120 * time.Second
	}
	payload, err := json.Marshal(input)
	if err != nil || len(payload) > sandboxMaxInput {
		return nil, errors.New("沙箱输入过大")
	}
	vm := goja.New()
	vm.SetMaxCallStackSize(512 * 1024)
	output := []string{}
	outputSize := 0
	vm.Set("__print", func(call goja.FunctionCall) goja.Value {
		text := call.Argument(0).String()
		outputSize += len(text)
		if outputSize > sandboxMaxOutput || len(output) >= sandboxMaxLines {
			panic(vm.ToValue("沙箱输出超过限制，请先筛选或汇总数据"))
		}
		output = append(output, text)
		return goja.Undefined()
	})
	if err := vm.Set("__input", string(payload)); err != nil {
		return nil, err
	}
	toolObject := vm.NewObject()
	for name, call := range tools {
		toolName := name
		toolCall := call
		_ = toolObject.Set(toolName, func(call goja.FunctionCall) goja.Value {
			raw := "{}"
			if len(call.Arguments) > 0 {
				raw = call.Arguments[0].String()
			}
			var args map[string]any
			_ = json.Unmarshal([]byte(raw), &args)
			return vm.ToValue(toolCall(args))
		})
	}
	_ = vm.Set("tools", toolObject)
	timer := time.AfterFunc(timeout, func() { vm.Interrupt("沙箱执行超时") })
	defer timer.Stop()
	if _, err := vm.RunString(`
		globalThis.input = JSON.parse(__input);
		delete globalThis.__input;
		globalThis.text = function(value) { __print(typeof value === "string" ? value : JSON.stringify(value)); };
		globalThis.console = { log: function() {
			var values = Array.prototype.slice.call(arguments);
			text(values.length === 1 ? values[0] : values);
		} };
	`); err != nil {
		return nil, errors.New("沙箱执行失败")
	}
	_, err = vm.RunString("(function(){\n" + code + "\n})()")
	if err != nil {
		var interrupted *goja.InterruptedError
		if errors.As(err, &interrupted) {
			return nil, errors.New("沙箱执行超时")
		}
		return nil, err
	}
	return output, nil
}
