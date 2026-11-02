package sales

import "testing"

func TestStudioPersonaExplicitViews(t *testing.T) {
	images := []string{"/main", "/side", "/face", "/front"}
	face, body, voice := studioPersonaAnchors(`{"personaViews":{"main":"/main","face":"/face","side":"/side","front":"/front"},"defaultVoiceId":"voice-1"}`, images, "/old-face", "/side")
	if face != "/face" || body != "/front" || voice != "voice-1" {
		t.Fatalf("wrong production anchors: %s %s %s", face, body, voice)
	}
	face, body, _ = studioPersonaAnchors(`{"personaViews":{"main":"/main","face":"","front":"/removed"}}`, images, "/old-face", "/side")
	if face != "/main" || body != "/main" {
		t.Fatalf("missing views must use main image: %s %s", face, body)
	}
	face, body, _ = studioPersonaAnchors(`{}`, images, "/old-face", "/old-body")
	if face != "/old-face" || body != "/old-body" {
		t.Fatalf("legacy anchors changed: %s %s", face, body)
	}
}

func TestStudioPersonaIdentitySource(t *testing.T) {
	for _, tc := range []struct {
		name, dimensions, avatar, want string
	}{
		{"main survives generated views", `{"personaViews":{"main":"/main","face":"/face","front":"/front"}}`, "/face", "/main"},
		{"deleted main is not a derived avatar", `{"personaViews":{"main":"/removed","face":"/face"}}`, "/face", ""},
		{"unlabelled main is not guessed", `{"personaViews":{"face":"/face"}}`, "/face", ""},
		{"empty explicit views are not legacy", `{"personaViews":{}}`, "/face", ""},
		{"null explicit views are not legacy", `{"personaViews":null}`, "/face", ""},
		{"malformed explicit views are not legacy", `{"personaViews":"removed"}`, "/face", ""},
		{"legacy original avatar", `{}`, "/original-avatar", "/original-avatar"},
		{"legacy no avatar is not first source", `{}`, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := studioPersonaIdentityURL(tc.dimensions, []string{"/first", "/main", "/face", "/front"}, tc.avatar)
			if got != tc.want {
				t.Fatalf("identity = %q, want %q", got, tc.want)
			}
		})
	}
}
