package generate

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRenderImageTemplate(t *testing.T) {
	spec := imageTemplateSpec{}
	spec.Submit.URL = "https://example.com/images"
	spec.Submit.Headers = map[string]string{"Authorization": "Bearer {{apiKey}}", "Cookie": "nope", "X-Name": "{{model}}"}
	spec.Submit.Body = `{"model":"{{model}}","prompt":"{{prompt}}","size":"{{size}}","n":{{n}},"images":{{images}}}`
	raw, _ := json.Marshal(spec)
	parsed, err := parseImageTemplate(raw)
	if err != nil {
		t.Fatal(err)
	}
	vars := templateVars(imageRequest{Model: "demo", Prompt: `a "cat"`, Size: "1024x1024"}, []string{"https://cdn.example/a.png"}, "")
	endpoint, headers, body, err := renderTemplateCall(parsed.Submit, vars, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if endpoint != "https://example.com/images" || headers["Authorization"] != "Bearer secret" || headers["Cookie"] != "" || headers["X-Name"] != "demo" {
		t.Fatalf("headers %#v %s", headers, endpoint)
	}
	if !strings.Contains(body, `a \"cat\"`) || !strings.Contains(body, `"n":1`) || !strings.Contains(body, `https://cdn.example/a.png`) {
		t.Fatalf("body %s", body)
	}
	data := map[string]any{}
	if json.Unmarshal([]byte(`{"output":{"choices":[{"message":{"content":[{"image":"https://cdn.example/out.png"}]}}],"task_id":"task-9"}}`), &data) != nil {
		t.Fatal("json")
	}
	if templateString(data, "output.choices.0.message.content.0.image") != "https://cdn.example/out.png" || templateString(data, "output.task_id") != "task-9" {
		t.Fatalf("lookup %#v", data)
	}
}

func TestImageTemplateRejectsSecretsAndPrivateHosts(t *testing.T) {
	bodyKey := imageTemplateSpec{}
	bodyKey.Submit.URL = "https://example.com/images"
	bodyKey.Submit.Body = `{"key":"{{apiKey}}"}`
	raw, _ := json.Marshal(bodyKey)
	if _, _, _, err := renderTemplateCall(mustTemplate(t, raw).Submit, templateVars(imageRequest{}, nil, ""), "secret"); err == nil || !strings.Contains(err.Error(), "请求头") {
		t.Fatalf("body key %v", err)
	}
	private := imageTemplateSpec{}
	private.Submit.URL = "http://127.0.0.1/images"
	private.Submit.Body = `{"model":"{{model}}"}`
	raw, _ = json.Marshal(private)
	if _, _, _, err := renderTemplateCall(mustTemplate(t, raw).Submit, templateVars(imageRequest{Model: "demo"}, nil, ""), ""); err == nil || !strings.Contains(err.Error(), "公网 HTTPS") {
		t.Fatalf("private %v", err)
	}
	huge := imageTemplateSpec{}
	huge.Submit.URL = "https://example.com/images"
	huge.Submit.Body = strings.Repeat("a", imageTemplateMaxBytes)
	raw, _ = json.Marshal(huge)
	if _, err := parseImageTemplate(raw); err == nil {
		t.Fatal("expected size limit")
	}
}

func mustTemplate(t *testing.T, raw []byte) imageTemplateSpec {
	t.Helper()
	spec, err := parseImageTemplate(raw)
	if err != nil {
		t.Fatal(err)
	}
	return spec
}
